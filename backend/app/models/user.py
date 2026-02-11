from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, index=True)
    email = Column(Text, unique=True, nullable=False)
    username = Column(Text, unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    role = Column(Text, nullable=False, default="user")
    status = Column(Text, nullable=False, default="active")
    is_alive = Column(Boolean, nullable=False, default=True)
    location_type = Column(Text)
    location_id = Column(BigInteger)
    credits = Column(BigInteger, nullable=False, default=0)
    faction_id = Column(BigInteger, ForeignKey("factions.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True))
