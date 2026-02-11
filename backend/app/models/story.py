from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from app.db.base import Base


class StorySession(Base):
    __tablename__ = "story_sessions"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    location_type = Column(Text, nullable=False)
    location_id = Column(BigInteger, nullable=False)
    status = Column(Text, nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
