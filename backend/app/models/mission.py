from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.sql import func

from app.db.base import Base


class Mission(Base):
    __tablename__ = "missions"

    id = Column(BigInteger, primary_key=True, index=True)
    faction_id = Column(BigInteger, ForeignKey("factions.id"), nullable=True)
    station_id = Column(BigInteger, ForeignKey("stations.id"), nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=False)
    reward_credits = Column(Integer, nullable=False, default=0)
    status = Column(Text, nullable=False, default="open")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)


class MissionAssignment(Base):
    __tablename__ = "mission_assignments"

    id = Column(BigInteger, primary_key=True, index=True)
    mission_id = Column(
        BigInteger,
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status = Column(Text, nullable=False, default="accepted")
    accepted_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)


class Reputation(Base):
    __tablename__ = "reputation"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    faction_id = Column(
        BigInteger,
        ForeignKey("factions.id", ondelete="CASCADE"),
        nullable=False,
    )
    value = Column(Integer, nullable=False, default=0)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
