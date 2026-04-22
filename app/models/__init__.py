from sqlalchemy import Column, Integer, String, Text, DateTime, func
from app.database import Base


class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(50))        # file / gmail / telegram / web
    title = Column(String(500))
    content = Column(Text)
    summary = Column(Text)
    created_at = Column(DateTime, default=func.now())

class KnowledgeEntry(Base):
    __tablename__ = "knowledge"
    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String(200), index=True)
    content = Column(Text)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500))
    description = Column(Text)
    priority = Column(String(20))
    assignee = Column(String(100))
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=func.now())

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True, index=True)
    level = Column(String(10), default="info")   # info / success / error
    action = Column(String(100))                 # ingest_file / process / task_created 등
    message = Column(Text)
    created_at = Column(DateTime, default=func.now())
