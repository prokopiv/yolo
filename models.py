"""
SQLAlchemy models for the application
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, func
from database import Base


class Prompt(Base):
    """Model for storing prompt templates"""
    
    __tablename__ = "prompts"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    
    def __repr__(self):
        return f"<Prompt(id={self.id}, name='{self.name}')>"
    
    def to_dict(self):
        """Convert model instance to dictionary"""
        return {
            "id": self.id,
            "name": self.name,
            "content": self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }