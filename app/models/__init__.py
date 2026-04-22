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
    priority = Column(String(20))      # high / medium / low
    assignee = Column(String(100))     # 나 / 회장 / 부회장
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=func.now())
