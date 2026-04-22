from sqlalchemy import Column, Integer, String, Text, DateTime, func
from app.database import Base


class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(50))
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
    class_of_service = Column(String(20), default="standard")  # expedite / fixed_date / standard / intangible
    team = Column(String(50), default="미분류")
    assignee = Column(String(100))
    due_date = Column(String(20))   # YYYY-MM-DD
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=func.now())

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True, index=True)
    level = Column(String(10), default="info")
    action = Column(String(100))
    message = Column(Text)
    created_at = Column(DateTime, default=func.now())
