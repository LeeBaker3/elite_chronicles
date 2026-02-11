from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from app.db.base import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Text, primary_key=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    ip_address = Column(Text)
    user_agent = Column(Text)
    revoked_at = Column(DateTime(timezone=True))
