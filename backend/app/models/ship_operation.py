from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from app.db.base import Base


class ShipOperationLog(Base):
    __tablename__ = "ship_operations_log"

    id = Column(BigInteger, primary_key=True, index=True)
    ship_id = Column(BigInteger, ForeignKey(
        "ships.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(BigInteger, ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    operation = Column(Text, nullable=False)
    cost_credits = Column(BigInteger, nullable=False, default=0)
    credits_after = Column(BigInteger)
    status = Column(Text, nullable=False)
    details = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
