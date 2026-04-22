from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager
import shutil, os

from app.database import engine, get_db
from app.models import Base, Document, KnowledgeEntry, Task
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


# --- 수집 ---

class UrlRequest(BaseModel):
    url: str

@api.post("/ingest/file")
async def ingest_file(file: UploadFile = File(...)):
    tmp_path = f"/tmp/{file.filename}"
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    try:
        result = parse_file(tmp_path)
    finally:
        os.remove(tmp_path)
    db = next(get_db())
    doc = Document(source=result["source"], title=result["title"], content=result["content"])
    db.add(doc); db.commit()
    return {"id": doc.id, "title": doc.title}

@api.post("/ingest/email")
async def ingest_email(limit: int = 10):
    emails = fetch_unread_emails(limit=limit)
    if not emails:
        return {"ingested": 0, "message": "읽지 않은 메일이 없거나 메일 계정이 설정되지 않았습니다."}
    db = next(get_db())
    ids = []
    for e in emails:
        doc = Document(source="email", title=e["title"], content=e["content"])
        db.add(doc)
        db.commit()
        ids.append(doc.id)
    return {"ingested": len(ids), "doc_ids": ids}

@api.post("/ingest/url")
async def ingest_url(req: UrlRequest):
    result = crawl_url(req.url)
    db = next(get_db())
    doc = Document(source="web", title=result["title"], content=result["content"])
    db.add(doc); db.commit()
    return {"id": doc.id, "title": doc.title}


# --- 지식 처리 ---

@api.post("/knowledge/process/{doc_id}")
async def process_document(doc_id: int):
    db = next(get_db())
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    wiki = build_wiki_entry(doc.title, doc.content)
    entry = KnowledgeEntry(topic=wiki["topic"], content=wiki["content"])
    db.add(entry)
    doc.summary = wiki["content"][:500]
    db.commit()
    tasks_data = extract_tasks(doc.content)
    for t in tasks_data:
        db.add(Task(title=t.get("title", ""), priority=t.get("priority", "medium"), assignee=t.get("assignee", "나")))
    db.commit()
    return {"knowledge_id": entry.id, "tasks_created": len(tasks_data)}


# --- 메모리 ---

class MemoryRequest(BaseModel):
    content: str

class RecallRequest(BaseModel):
    query: str

@api.post("/memory/remember")
async def add_memory(req: MemoryRequest):
    remember(req.content)
    return {"status": "저장됨"}

@api.post("/memory/recall")
async def search_memory(req: RecallRequest):
    return {"results": recall(req.query)}

@api.get("/memory/summary")
async def memory_summary():
    return {"summary": get_summary()}


# --- 할 일 ---

@api.get("/tasks")
async def get_tasks(status: str = "pending"):
    db = next(get_db())
    tasks = db.query(Task).filter(Task.status == status).all()
    return [{"id": t.id, "title": t.title, "priority": t.priority, "assignee": t.assignee} for t in tasks]

@api.post("/tasks/report")
async def send_task_report():
    db = next(get_db())
    tasks = db.query(Task).filter(Task.status == "pending").all()
    task_list = [{"title": t.title, "priority": t.priority, "assignee": t.assignee} for t in tasks]
    ok = send_daily_report(task_list)
    return {"sent": ok, "task_count": len(task_list)}


app.include_router(api)

# 프론트엔드 정적 파일 서빙 (빌드 결과물)
static_dir = "/app/static"
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
