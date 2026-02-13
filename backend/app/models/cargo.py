from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer
from sqlalchemy.sql import func

from app.db.base import Base


class ShipCargo(Base):
    __tablename__ = "ship_cargo"

    id = Column(BigInteger, primary_key=True, index=True)
    ship_id = Column(BigInteger, ForeignKey("ships.id"), nullable=False)
    commodity_id = Column(BigInteger, ForeignKey(
        "commodities.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    version = Column(BigInteger, nullable=False, default=0)
