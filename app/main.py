from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager
from sqlalchemy import text
from datetime import datetime, timezone, timedelta
import shutil, os, time

KST = timezone(timedelta(hours=9))

def now_kst() -> datetime:
    return datetime.now(KST)

def fmt_dt(dt) -> str | None:
    """datetime → ISO8601 문자열 with +09:00 (KST)"""
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%dT%H:%M:%S") + "+09:00"
    return str(dt)

from app.database import engine, get_db
from app.models import Base, Document, KnowledgeEntry, Task, ActivityLog
from app.modules.ingestion import parse_file, crawl_url, fetch_unread_emails
from app.modules.knowledge import build_wiki_entry, extract_tasks
from app.modules.memory import remember, recall, get_summary
from app.modules.notification import send_daily_report
from app.config import settings


def migrate_db():
    """기존 DB에 새 컬럼 추가 (없는 경우에만)."""
    new_cols = [
        ("tasks", "class_of_service", "VARCHAR(20) DEFAULT 'standard'"),
        ("tasks", "team",             "VARCHAR(50)  DEFAULT '미분류'"),
        ("tasks", "due_date",         "VARCHAR(20)"),
    ]
    with engine.connect() as conn:
        for table, col, definition in new_cols:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass  # 이미 존재하면 무시


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrate_db()
    yield

app = FastAPI(title="Jarvis", lifespan=lifespan)
api = APIRouter(prefix="/api")


def log(db, action: str, message: str, level: str = "info"):
    db.add(ActivityLog(level=level, action=action, message=message))
    db.commit()


def auto_process(doc_id: int):
    """수집 직후 백그라운드에서 위키 생성 + 태스크 추출."""
    db = next(get_db())
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        return

    content_len = len(doc.content or "")
    log(db, "auto_process", f"처리 시작: '{doc.title}' (본문 {content_len}자, 소스={doc.source})")

    # ── 위키 생성 ────────────────────────────────────────────
    t0 = time.time()
    try:
        wiki = build_wiki_entry(doc.title, doc.content)
        entry = KnowledgeEntry(topic=wiki["topic"], content=wiki["content"])
        db.add(entry)
        doc.summary = wiki["content"][:500]
        db.commit()
        elapsed = round(time.time() - t0, 1)
        log(db, "auto_process",
            f"위키 생성 완료: '{doc.title}' ({len(wiki['content'])}자, {elapsed}초)",
            "success")
    except Exception as e:
        log(db, "auto_process", f"위키 생성 실패: {type(e).__name__}: {e}", "error")
        return

    # ── 할 일 추출 ────────────────────────────────────────────
    t1 = time.time()
    try:
        tasks_data, debug_msg = extract_tasks(doc.content)
        elapsed = round(time.time() - t1, 1)

        if not tasks_data:
            # 할 일이 없거나 추출 실패 — warn 수준으로 기록
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
                ))
            db.commit()
            teams_summary = ", ".join({t.get("team", "?") for t in tasks_data})
            log(db, "auto_process",
                f"할 일 {len(tasks_data)}개 추출 완료 ({elapsed}초) | 팀: {teams_summary}",
                "success")

            # 각 할일 항목을 개별 로그로 기록 (CoS + 팀 확인용)
            for t in tasks_data:
                cos = t.get("class_of_service", "?")
                team = t.get("team", "?")
                title = t.get("title", "")[:60]
                log(db, "task_extract", f"[{cos}][{team}] {title}")

    except Exception as e:
        log(db, "auto_process", f"할 일 추출 중 예외: {type(e).__name__}: {e}", "error")


# ── 통계 ─────────────────────────────────────────────────────────────────────

@api.get("/stats")
async def get_stats():
    db = next(get_db())
    return {
        "doc_count":       db.query(Document).count(),
        "knowledge_count": db.query(KnowledgeEntry).count(),
        "task_count":      db.query(Task).filter(Task.status == "pending").count(),
    }

@api.get("/health")
async def health():
    return {"status": "ok"}

@api.get("/activity")
async def get_activity(limit: int = 100, level: str = "", action: str = "", q: str = ""):
    db = next(get_db())
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
    db = next(get_db())
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
    db = next(get_db())
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
    db = next(get_db())
    log(db, "ingest_email", "메일 수집 시작...")
    emails = fetch_unread_emails(limit=limit)
    if not emails:
        log(db, "ingest_email", "읽지 않은 메일 없음")
        return {"ingested": 0, "message": "읽지 않은 메일이 없거나 메일 계정이 설정되지 않았습니다."}
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
    db = next(get_db())
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    log(db, "process", f"지식 처리 시작: {doc.title}")
    try:
        wiki = build_wiki_entry(doc.title, doc.content)
    except Exception as e:
        log(db, "process", f"LLM 호출 실패: {e}", "error")
        raise HTTPException(status_code=500, detail=str(e))
    entry = KnowledgeEntry(topic=wiki["topic"], content=wiki["content"])
    db.add(entry)
    doc.summary = wiki["content"][:500]
    db.commit()
    log(db, "process", f"위키 생성 완료: {doc.title}")
    try:
        tasks_data = extract_tasks(doc.content)
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
        ))
    db.commit()
    log(db, "process", f"처리 완료 — 할 일 {len(tasks_data)}개 생성", "success")
    return {"knowledge_id": entry.id, "tasks_created": len(tasks_data)}


# ── 위키 ──────────────────────────────────────────────────────────────────────

@api.get("/wiki")
async def list_wiki():
    db = next(get_db())
    entries = db.query(KnowledgeEntry).order_by(KnowledgeEntry.updated_at.desc()).all()
    return [
        {"id": e.id, "topic": e.topic,
         "preview": e.content[:200] if e.content else "",
         "updated_at": fmt_dt(e.updated_at)}
        for e in entries
    ]

@api.get("/wiki/{entry_id}")
async def get_wiki(entry_id: int):
    db = next(get_db())
    entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="위키 항목을 찾을 수 없습니다.")
    return {"id": entry.id, "topic": entry.topic, "content": entry.content,
            "updated_at": fmt_dt(entry.updated_at)}

class WikiUpdate(BaseModel):
    topic: str
    content: str

@api.put("/wiki/{entry_id}")
async def update_wiki(entry_id: int, req: WikiUpdate):
    db = next(get_db())
    entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="위키 항목을 찾을 수 없습니다.")
    entry.topic   = req.topic
    entry.content = req.content
    db.commit()
    log(db, "wiki_edit", f"위키 수동 편집: {entry.topic}", "info")
    return {"id": entry.id, "topic": entry.topic, "updated_at": fmt_dt(entry.updated_at)}

@api.post("/wiki/{entry_id}/reprocess")
async def reprocess_wiki(entry_id: int):
    db = next(get_db())
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
    db = next(get_db())
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

@api.get("/tasks")
async def get_tasks(status: str = "all"):
    db = next(get_db())
    q = db.query(Task)
    if status != "all":
        q = q.filter(Task.status == status)
    tasks = q.order_by(Task.created_at.desc()).all()
    return [
        {"id": t.id, "title": t.title,
         "class_of_service": t.class_of_service or "standard",
         "team": t.team or "미분류",
         "assignee": t.assignee,
         "due_date": t.due_date,
         "status": t.status}
        for t in tasks
    ]

class TaskCreate(BaseModel):
    title: str
    class_of_service: str = "standard"
    team: str = "미분류"
    assignee: str | None = None
    due_date: str | None = None

@api.post("/tasks")
async def create_task(req: TaskCreate):
    db = next(get_db())
    task = Task(
        title=req.title,
        class_of_service=req.class_of_service,
        team=req.team,
        assignee=req.assignee,
        due_date=req.due_date,
    )
    db.add(task); db.commit()
    log(db, "task_update", f"할 일 생성: {req.title}", "success")
    return {"id": task.id, "title": task.title,
            "class_of_service": task.class_of_service, "team": task.team,
            "assignee": task.assignee, "due_date": task.due_date, "status": task.status}

@api.delete("/tasks/{task_id}")
async def delete_task(task_id: int):
    db = next(get_db())
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="할 일을 찾을 수 없습니다.")
    db.delete(task); db.commit()
    return {"deleted": task_id}

class TaskStatusUpdate(BaseModel):
    status: str | None = None
    class_of_service: str | None = None
    team: str | None = None

@api.patch("/tasks/{task_id}")
async def update_task(task_id: int, req: TaskStatusUpdate):
    db = next(get_db())
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="할 일을 찾을 수 없습니다.")
    if req.status is not None:
        old = task.status
        task.status = req.status
        log(db, "task_update", f"상태 변경: {task.title[:30]} [{old}→{req.status}]", "info")
    if req.class_of_service is not None:
        task.class_of_service = req.class_of_service
    if req.team is not None:
        task.team = req.team
    db.commit()
    return {"id": task.id, "status": task.status,
            "class_of_service": task.class_of_service, "team": task.team}

@api.post("/tasks/report")
async def send_task_report():
    db = next(get_db())
    tasks = db.query(Task).all()
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

static_dir = "/app/static"
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
