from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from pydantic import BaseModel
from contextlib import asynccontextmanager
from sqlalchemy import text
from datetime import datetime, timezone, timedelta
import shutil, os, time, hmac, hashlib, asyncio

KST = timezone(timedelta(hours=9))

def fmt_dt(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc).astimezone(KST)
        return dt.strftime("%Y-%m-%dT%H:%M:%S") + "+09:00"
    return str(dt)

from app.database import engine, get_db
from app.models import Base, Document, KnowledgeEntry, Task, ActivityLog
from app.modules.ingestion import parse_file, crawl_url, fetch_unread_emails
from app.modules.knowledge import build_wiki_entry, extract_tasks, extract_memories
from app.modules.memory import remember, recall, get_summary
from app.modules.notification import send_daily_report
from app.config import settings

SOURCE_FOLDER = {"email": "이메일", "web": "웹"}


def migrate_db():
    new_cols = [
        ("tasks", "class_of_service", "VARCHAR(20) DEFAULT 'standard'"),
        ("tasks", "team",             "VARCHAR(50)  DEFAULT '미분류'"),
        ("tasks", "due_date",         "VARCHAR(20)"),
        ("tasks", "confirmed",        "BOOLEAN DEFAULT 1"),
        ("tasks", "completed_at",     "DATETIME"),
        ("knowledge", "folder",       "VARCHAR(100) DEFAULT '일반'"),
    ]
    with engine.connect() as conn:
        for table, col, definition in new_cols:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrate_db()
    scheduler = asyncio.create_task(_email_scheduler_loop())
    with get_db() as db:
        log(db, "ingest_email", f"이메일 자동수집 스케줄러 시작 ({EMAIL_SCHEDULE_INTERVAL // 60}분 주기)")
    yield
    scheduler.cancel()
    try:
        await scheduler
    except asyncio.CancelledError:
        pass

app = FastAPI(title="Jarvis", lifespan=lifespan)
api = APIRouter(prefix="/api")

# ── 인증 ──────────────────────────────────────────────────────────────────────

def _make_token() -> str:
    return hmac.new(
        settings.secret_key.encode(),
        settings.app_password.encode(),
        hashlib.sha256,
    ).hexdigest()

UNPROTECTED = {"/api/login", "/api/health"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path in UNPROTECTED or not path.startswith("/api"):
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if not token or not hmac.compare_digest(token, _make_token()):
        return JSONResponse({"detail": "인증이 필요합니다"}, status_code=401)
    return await call_next(request)

class LoginRequest(BaseModel):
    password: str

@api.post("/login")
async def login(req: LoginRequest):
    if not hmac.compare_digest(req.password, settings.app_password):
        raise HTTPException(status_code=401, detail="비밀번호가 틀렸습니다")
    return {"token": _make_token()}


def log(db, action: str, message: str, level: str = "info"):
    db.add(ActivityLog(level=level, action=action, message=message))
    db.commit()


def _task_dict(t: Task) -> dict:
    return {
        "id": t.id, "title": t.title,
        "class_of_service": t.class_of_service or "standard",
        "team": t.team or "미분류",
        "assignee": t.assignee,
        "due_date": t.due_date,
        "status": t.status,
        "confirmed": t.confirmed if t.confirmed is not None else True,
        "completed_at": fmt_dt(t.completed_at),
        "created_at": fmt_dt(t.created_at),
    }


def auto_process(doc_id: int):
    """수집 직후 백그라운드에서 위키 생성 + 태스크 추출 + 메모리 저장."""
    with get_db() as db:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        content_len = len(doc.content or "")
        log(db, "auto_process", f"처리 시작: '{doc.title}' (본문 {content_len}자, 소스={doc.source})")

        # ── 관련 기억 검색 ────────────────────────────────────────
        try:
            memories = recall(doc.title)
        except Exception:
            memories = []

        # ── 위키 생성 ────────────────────────────────────────────
        folder = SOURCE_FOLDER.get(doc.source, "문서")
        t0 = time.time()
        try:
            wiki = build_wiki_entry(doc.title, doc.content, memories=memories)
            entry = KnowledgeEntry(topic=wiki["topic"], content=wiki["content"], folder=folder)
            db.add(entry)
            doc.summary = wiki["content"][:500]
            db.commit()
            elapsed = round(time.time() - t0, 1)
            log(db, "auto_process",
                f"위키 생성 완료: '{doc.title}' ({len(wiki['content'])}자, {elapsed}초) [{folder}]",
                "success")
        except Exception as e:
            log(db, "auto_process", f"위키 생성 실패: {type(e).__name__}: {e}", "error")
            return

        # ── 할 일 추출 (검토 대기 상태로 저장) ───────────────────
        t1 = time.time()
        try:
            tasks_data, debug_msg = extract_tasks(doc.content, memories=memories)
            elapsed = round(time.time() - t1, 1)

            if not tasks_data:
                log(db, "auto_process",
                    f"할 일 추출 결과 0개 ({elapsed}초) — {debug_msg}",
                    "error" if debug_msg.startswith("[") else "info")
            else:
                for t in tasks_data:
                    db.add(Task(
                        title=t.get("title", ""),
                        class_of_service=t.get("class_of_service", "standard"),
                        team=t.get("team", "미분류"),
                        assignee=t.get("assignee", "나"),
                        due_date=t.get("due_date"),
                        confirmed=False,  # 검토 후 확인 필요
                    ))
                db.commit()
                log(db, "auto_process",
                    f"할 일 {len(tasks_data)}개 추출 완료 ({elapsed}초) — 검토 대기 중",
                    "success")
                for t in tasks_data:
                    log(db, "task_extract",
                        f"[검토대기][{t.get('class_of_service','?')}][{t.get('team','?')}] {t.get('title','')[:60]}")
        except Exception as e:
            log(db, "auto_process", f"할 일 추출 중 예외: {type(e).__name__}: {e}", "error")

        # ── 메모리 추출 및 저장 ───────────────────────────────────
        try:
            new_facts = extract_memories(doc.title, doc.content)
            if new_facts:
                for fact in new_facts:
                    remember(fact)
                log(db, "auto_process",
                    f"메모리 {len(new_facts)}개 저장: {' | '.join(f[:30] for f in new_facts)}",
                    "success")
        except Exception as e:
            log(db, "auto_process", f"메모리 추출 실패: {type(e).__name__}: {e}", "error")


# ── 이메일 자동 수집 스케줄러 ────────────────────────────────────────────────────

EMAIL_SCHEDULE_INTERVAL = 30 * 60  # 30분 (초 단위)

def _scheduled_email_fetch():
    with get_db() as db:
        if not settings.mail_user or not settings.mail_password:
            log(db, "ingest_email", "[자동수집] 메일 계정 미설정", "error")
            return
        log(db, "ingest_email", f"[자동수집] 시작 — {settings.mail_imap_host}")
        try:
            emails = fetch_unread_emails(limit=20)
        except Exception as e:
            log(db, "ingest_email", f"[자동수집] IMAP 실패: {type(e).__name__}: {e}", "error")
            return
        if not emails:
            log(db, "ingest_email", "[자동수집] 새 메일 없음")
            return
        ids = []
        for e in emails:
            doc = Document(source="email", title=e["title"], content=e["content"])
            db.add(doc); db.commit()
            ids.append(doc.id)
        log(db, "ingest_email", f"[자동수집] 메일 {len(ids)}개 수집 완료, LLM 분석 예약", "success")
    for doc_id in ids:
        auto_process(doc_id)


async def _email_scheduler_loop():
    await asyncio.sleep(EMAIL_SCHEDULE_INTERVAL)
    while True:
        await asyncio.to_thread(_scheduled_email_fetch)
        await asyncio.sleep(EMAIL_SCHEDULE_INTERVAL)


# ── 통계 ─────────────────────────────────────────────────────────────────────

@api.get("/stats")
async def get_stats():
    with get_db() as db:
        pending_review = db.query(Task).filter(Task.confirmed == False).count()
        return {
            "doc_count":       db.query(Document).count(),
            "knowledge_count": db.query(KnowledgeEntry).count(),
            "task_count":      db.query(Task).filter(Task.status == "pending", Task.confirmed == True).count(),
            "pending_review":  pending_review,
        }

@api.get("/health")
async def health():
    return {"status": "ok"}

@api.get("/activity")
async def get_activity(limit: int = 100, level: str = "", action: str = "", q: str = ""):
    with get_db() as db:
        query = db.query(ActivityLog)
        if level:
            query = query.filter(ActivityLog.level == level)
        if action:
            query = query.filter(ActivityLog.action == action)
        if q:
            query = query.filter(ActivityLog.message.contains(q))
        total = query.count()
        logs = query.order_by(ActivityLog.id.desc()).limit(limit).all()
        return {
            "total": total,
            "logs": [
                {"id": l.id, "level": l.level, "action": l.action,
                 "message": l.message, "created_at": fmt_dt(l.created_at)}
                for l in logs
            ]
        }


# ── 수집 ─────────────────────────────────────────────────────────────────────

class UrlRequest(BaseModel):
    url: str

@api.post("/ingest/file")
async def ingest_file(background: BackgroundTasks, file: UploadFile = File(...)):
    with get_db() as db:
        tmp_path = f"/tmp/{file.filename}"
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        try:
            result = parse_file(tmp_path)
        except Exception as e:
            log(db, "ingest_file", f"파일 파싱 실패: {file.filename} — {e}", "error")
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            os.remove(tmp_path)
        doc = Document(source=result["source"], title=result["title"], content=result["content"])
        db.add(doc); db.commit()
        log(db, "ingest_file", f"파일 수집 완료, LLM 분석 예약: {doc.title}", "success")
        background.add_task(auto_process, doc.id)
        return {"id": doc.id, "title": doc.title}

@api.post("/ingest/url")
async def ingest_url(background: BackgroundTasks, req: UrlRequest):
    with get_db() as db:
        log(db, "ingest_url", f"URL 수집 시작: {req.url}")
        try:
            result = crawl_url(req.url)
        except Exception as e:
            log(db, "ingest_url", f"URL 수집 실패: {req.url} — {e}", "error")
            raise HTTPException(status_code=400, detail=str(e))
        doc = Document(source="web", title=result["title"], content=result["content"])
        db.add(doc); db.commit()
        log(db, "ingest_url", f"URL 수집 완료, LLM 분석 예약: {doc.title}", "success")
        background.add_task(auto_process, doc.id)
        return {"id": doc.id, "title": doc.title}

@api.post("/ingest/email")
async def ingest_email(background: BackgroundTasks, limit: int = 10):
    with get_db() as db:
        if not settings.mail_user or not settings.mail_password:
            log(db, "ingest_email", f"메일 계정 미설정 — MAIL_USER={bool(settings.mail_user)}", "error")
            return {"ingested": 0, "message": "메일 계정(MAIL_USER/MAIL_PASSWORD)이 설정되지 않았습니다."}
        log(db, "ingest_email", f"메일 수집 시작 — IMAP {settings.mail_imap_host}:{settings.mail_imap_port} / {settings.mail_user}")
        try:
            emails = fetch_unread_emails(limit=limit)
        except Exception as e:
            log(db, "ingest_email", f"IMAP 연결/수집 실패: {type(e).__name__}: {e}", "error")
            raise HTTPException(status_code=500, detail=str(e))
        if not emails:
            log(db, "ingest_email", "읽지 않은 메일 없음 (UNSEEN 0건)")
            return {"ingested": 0, "message": "읽지 않은 메일이 없습니다."}
        ids = []
        for e in emails:
            doc = Document(source="email", title=e["title"], content=e["content"])
            db.add(doc); db.commit()
            ids.append(doc.id)
            background.add_task(auto_process, doc.id)
        log(db, "ingest_email", f"메일 {len(ids)}개 수집 완료, LLM 분석 예약", "success")
        return {"ingested": len(ids), "doc_ids": ids}


# ── 지식 처리 ─────────────────────────────────────────────────────────────────

@api.post("/knowledge/process/{doc_id}")
async def process_document(doc_id: int):
    with get_db() as db:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
        log(db, "process", f"지식 처리 시작: {doc.title}")
        try:
            wiki = build_wiki_entry(doc.title, doc.content)
        except Exception as e:
            log(db, "process", f"LLM 호출 실패: {e}", "error")
            raise HTTPException(status_code=500, detail=str(e))
        folder = SOURCE_FOLDER.get(doc.source, "문서")
        entry = KnowledgeEntry(topic=wiki["topic"], content=wiki["content"], folder=folder)
        db.add(entry)
        doc.summary = wiki["content"][:500]
        db.commit()
        log(db, "process", f"위키 생성 완료: {doc.title}")
        try:
            tasks_data, debug_msg = extract_tasks(doc.content)
            if debug_msg:
                log(db, "process", debug_msg)
        except Exception as e:
            log(db, "process", f"할 일 추출 실패: {e}", "error")
            tasks_data = []
        for t in tasks_data:
            db.add(Task(
                title=t.get("title", ""),
                class_of_service=t.get("class_of_service", "standard"),
                team=t.get("team", "미분류"),
                assignee=t.get("assignee", "나"),
                due_date=t.get("due_date"),
                confirmed=False,
            ))
        db.commit()
        log(db, "process", f"처리 완료 — 할 일 {len(tasks_data)}개 검토 대기", "success")
        return {"knowledge_id": entry.id, "tasks_created": len(tasks_data)}


# ── 위키 ──────────────────────────────────────────────────────────────────────

@api.get("/wiki")
async def list_wiki():
    with get_db() as db:
        entries = db.query(KnowledgeEntry).order_by(KnowledgeEntry.updated_at.desc()).all()
        return [
            {"id": e.id, "topic": e.topic,
             "folder": e.folder or "일반",
             "preview": e.content[:200] if e.content else "",
             "updated_at": fmt_dt(e.updated_at)}
            for e in entries
        ]

@api.get("/wiki/{entry_id}")
async def get_wiki(entry_id: int):
    with get_db() as db:
        entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
        if not entry:
            raise HTTPException(status_code=404, detail="위키 항목을 찾을 수 없습니다.")
        return {"id": entry.id, "topic": entry.topic, "content": entry.content,
                "folder": entry.folder or "일반",
                "updated_at": fmt_dt(entry.updated_at)}

class WikiUpdate(BaseModel):
    topic: str
    content: str

class FolderUpdate(BaseModel):
    folder: str

@api.put("/wiki/{entry_id}")
async def update_wiki(entry_id: int, req: WikiUpdate):
    with get_db() as db:
        entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
        if not entry:
            raise HTTPException(status_code=404, detail="위키 항목을 찾을 수 없습니다.")
        entry.topic   = req.topic
        entry.content = req.content
        db.commit()
        log(db, "wiki_edit", f"위키 수동 편집: {entry.topic}", "info")
        return {"id": entry.id, "topic": entry.topic, "folder": entry.folder or "일반",
                "updated_at": fmt_dt(entry.updated_at)}

@api.put("/wiki/{entry_id}/folder")
async def update_wiki_folder(entry_id: int, req: FolderUpdate):
    with get_db() as db:
        entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
        if not entry:
            raise HTTPException(status_code=404, detail="위키 항목을 찾을 수 없습니다.")
        entry.folder = req.folder.strip() or "일반"
        db.commit()
        log(db, "wiki_folder", f"폴더 이동: '{entry.topic}' → {entry.folder}", "info")
        return {"id": entry.id, "folder": entry.folder}

@api.post("/wiki/{entry_id}/reprocess")
async def reprocess_wiki(entry_id: int):
    with get_db() as db:
        entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
        if not entry:
            raise HTTPException(status_code=404, detail="위키 항목을 찾을 수 없습니다.")
        log(db, "wiki_reprocess", f"LLM 재분석 시작: {entry.topic}")
        try:
            wiki = build_wiki_entry(entry.topic, entry.content)
            entry.content = wiki["content"]
            db.commit()
            log(db, "wiki_reprocess", f"LLM 재분석 완료: {entry.topic}", "success")
            return {"id": entry.id, "topic": entry.topic, "content": entry.content,
                    "folder": entry.folder or "일반",
                    "updated_at": fmt_dt(entry.updated_at)}
        except Exception as e:
            log(db, "wiki_reprocess", f"LLM 재분석 실패: {e}", "error")
            raise HTTPException(status_code=500, detail=str(e))


# ── 메모리 ────────────────────────────────────────────────────────────────────

class MemoryRequest(BaseModel):
    content: str

class RecallRequest(BaseModel):
    query: str

@api.post("/memory/remember")
async def add_memory(req: MemoryRequest):
    with get_db() as db:
        remember(req.content)
        log(db, "memory", f"메모리 저장: {req.content[:50]}", "success")
        return {"status": "저장됨"}

@api.post("/memory/recall")
async def search_memory(req: RecallRequest):
    return {"results": recall(req.query)}

@api.get("/memory/summary")
async def memory_summary():
    return {"summary": get_summary()}


# ── 할 일 ─────────────────────────────────────────────────────────────────────

@api.get("/tasks/unconfirmed")
async def get_unconfirmed_tasks():
    with get_db() as db:
        tasks = db.query(Task).filter(Task.confirmed == False).order_by(Task.created_at.desc()).all()
        return [_task_dict(t) for t in tasks]

@api.post("/tasks/confirm-all")
async def confirm_all_tasks():
    with get_db() as db:
        tasks = db.query(Task).filter(Task.confirmed == False).all()
        for t in tasks:
            t.confirmed = True
        db.commit()
        log(db, "task_confirm", f"할 일 {len(tasks)}개 일괄 확인", "success")
        return {"confirmed": len(tasks)}

@api.get("/tasks")
async def get_tasks(status: str = "all"):
    with get_db() as db:
        q = db.query(Task).filter(Task.confirmed == True)
        if status != "all":
            q = q.filter(Task.status == status)
        tasks = q.order_by(Task.created_at.desc()).all()
        return [_task_dict(t) for t in tasks]

class TaskCreate(BaseModel):
    title: str
    class_of_service: str = "standard"
    team: str = "미분류"
    assignee: str | None = None
    due_date: str | None = None

@api.post("/tasks")
async def create_task(req: TaskCreate):
    with get_db() as db:
        task = Task(
            title=req.title,
            class_of_service=req.class_of_service,
            team=req.team,
            assignee=req.assignee,
            due_date=req.due_date,
            confirmed=True,
        )
        db.add(task); db.commit()
        log(db, "task_update", f"할 일 생성: {req.title}", "success")
        return _task_dict(task)

@api.delete("/tasks/{task_id}")
async def delete_task(task_id: int):
    with get_db() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="할 일을 찾을 수 없습니다.")
        db.delete(task); db.commit()
        return {"deleted": task_id}

class TaskStatusUpdate(BaseModel):
    status: str | None = None
    class_of_service: str | None = None
    team: str | None = None
    title: str | None = None
    assignee: str | None = None
    due_date: str | None = None

@api.patch("/tasks/{task_id}")
async def update_task(task_id: int, req: TaskStatusUpdate):
    with get_db() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="할 일을 찾을 수 없습니다.")
        if req.status is not None:
            old = task.status
            task.status = req.status
            if req.status == "done" and old != "done":
                task.completed_at = datetime.now(timezone.utc)
            elif req.status != "done":
                task.completed_at = None
            log(db, "task_update", f"상태 변경: {task.title[:30]} [{old}→{req.status}]", "info")
        if req.class_of_service is not None:
            task.class_of_service = req.class_of_service
        if req.team is not None:
            task.team = req.team
        if req.title is not None:
            task.title = req.title
        if req.assignee is not None:
            task.assignee = req.assignee
        if req.due_date is not None:
            task.due_date = req.due_date or None
        db.commit()
        return _task_dict(task)

@api.post("/tasks/{task_id}/confirm")
async def confirm_task(task_id: int):
    with get_db() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="할 일을 찾을 수 없습니다.")
        task.confirmed = True
        db.commit()
        log(db, "task_confirm", f"할 일 확인: {task.title[:50]}", "success")
        return _task_dict(task)

@api.post("/tasks/report")
async def send_task_report():
    with get_db() as db:
        tasks = db.query(Task).filter(Task.confirmed == True).all()
        task_list = [
            {"title": t.title, "class_of_service": t.class_of_service or "standard",
             "team": t.team or "미분류", "assignee": t.assignee,
             "due_date": t.due_date, "status": t.status}
            for t in tasks
        ]
        ok = send_daily_report(task_list)
        pending_count = sum(1 for t in task_list if t["status"] != "done")
        log(db, "report", f"Telegram 보고 {'성공' if ok else '실패'} — {pending_count}건", "success" if ok else "error")
        return {"sent": ok, "task_count": pending_count}


app.include_router(api)

class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as ex:
            if ex.status_code == 404:
                return await super().get_response("index.html", scope)
            raise ex

static_dir = "/app/static"
if os.path.exists(static_dir):
    app.mount("/", SPAStaticFiles(directory=static_dir, html=True), name="static")
