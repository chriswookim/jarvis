from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager
import shutil, os

from app.database import engine, get_db
from app.models import Base, Document, KnowledgeEntry, Task, ActivityLog
from app.modules.ingestion import parse_file, crawl_url, fetch_unread_emails
from app.modules.knowledge import build_wiki_entry, extract_tasks
from app.modules.memory import remember, recall, get_summary
from app.modules.notification import send_daily_report
from app.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="Jarvis", lifespan=lifespan)
api = APIRouter(prefix="/api")


def log(db, action: str, message: str, level: str = "info"):
    db.add(ActivityLog(level=level, action=action, message=message))
    db.commit()


# --- 통계 ---

@api.get("/stats")
async def get_stats():
    db = next(get_db())
    return {
        "doc_count": db.query(Document).count(),
        "knowledge_count": db.query(KnowledgeEntry).count(),
        "task_count": db.query(Task).filter(Task.status == "pending").count(),
    }

@api.get("/health")
async def health():
    return {"status": "ok"}

@api.get("/activity")
async def get_activity(limit: int = 30):
    db = next(get_db())
    logs = db.query(ActivityLog).order_by(ActivityLog.id.desc()).limit(limit).all()
    return [
        {"id": l.id, "level": l.level, "action": l.action,
         "message": l.message, "created_at": str(l.created_at)}
        for l in logs
    ]


# --- 수집 ---

class UrlRequest(BaseModel):
    url: str

@api.post("/ingest/file")
async def ingest_file(file: UploadFile = File(...)):
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
    log(db, "ingest_file", f"파일 수집 완료: {doc.title}", "success")
    return {"id": doc.id, "title": doc.title}

@api.post("/ingest/url")
async def ingest_url(req: UrlRequest):
    db = next(get_db())
    log(db, "ingest_url", f"URL 수집 시작: {req.url}")
    try:
        result = crawl_url(req.url)
    except Exception as e:
        log(db, "ingest_url", f"URL 수집 실패: {req.url} — {e}", "error")
        raise HTTPException(status_code=400, detail=str(e))
    doc = Document(source="web", title=result["title"], content=result["content"])
    db.add(doc); db.commit()
    log(db, "ingest_url", f"URL 수집 완료: {doc.title}", "success")
    return {"id": doc.id, "title": doc.title}

@api.post("/ingest/email")
async def ingest_email(limit: int = 10):
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
    log(db, "ingest_email", f"메일 {len(ids)}개 수집 완료", "success")
    return {"ingested": len(ids), "doc_ids": ids}


# --- 지식 처리 ---

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
        db.add(Task(title=t.get("title", ""), priority=t.get("priority", "medium"), assignee=t.get("assignee", "나")))
    db.commit()
    log(db, "process", f"처리 완료 — 할 일 {len(tasks_data)}개 생성", "success")
    return {"knowledge_id": entry.id, "tasks_created": len(tasks_data)}


# --- 메모리 ---

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


# --- 할 일 ---

@api.get("/tasks")
async def get_tasks(status: str = "all"):
    db = next(get_db())
    if status == "all":
        tasks = db.query(Task).order_by(Task.created_at.desc()).all()
    else:
        tasks = db.query(Task).filter(Task.status == status).order_by(Task.created_at.desc()).all()
    return [{"id": t.id, "title": t.title, "priority": t.priority, "assignee": t.assignee, "status": t.status} for t in tasks]

class TaskStatusUpdate(BaseModel):
    status: str

@api.patch("/tasks/{task_id}")
async def update_task_status(task_id: int, req: TaskStatusUpdate):
    db = next(get_db())
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="할 일을 찾을 수 없습니다.")
    old_status = task.status
    task.status = req.status
    db.commit()
    log(db, "task_update", f"상태 변경: {task.title[:30]} [{old_status} → {req.status}]", "info")
    return {"id": task.id, "status": task.status}

@api.post("/tasks/report")
async def send_task_report():
    db = next(get_db())
    tasks = db.query(Task).filter(Task.status == "pending").all()
    task_list = [{"title": t.title, "priority": t.priority, "assignee": t.assignee} for t in tasks]
    ok = send_daily_report(task_list)
    log(db, "report", f"Telegram 보고 {'성공' if ok else '실패'} — {len(task_list)}개", "success" if ok else "error")
    return {"sent": ok, "task_count": len(task_list)}


app.include_router(api)

static_dir = "/app/static"
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
