from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.sql import func

from app.db.base import Base


class Ship(Base):
    __tablename__ = "ships"

    id = Column(BigInteger, primary_key=True, index=True)
    owner_user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    name = Column(Text, nullable=False)
    hull_max = Column(Integer, nullable=False)
    hull_current = Column(Integer, nullable=False)
    shields_max = Column(Integer, nullable=False)
    shields_current = Column(Integer, nullable=False)
    energy_cap = Column(Integer, nullable=False)
    energy_current = Column(Integer, nullable=False)
    fuel_cap = Column(Integer, nullable=False)
    fuel_current = Column(Integer, nullable=False)
    position_x = Column(Integer, nullable=False, default=0)
    position_y = Column(Integer, nullable=False, default=0)
    position_z = Column(Integer, nullable=False, default=0)
    velocity_x = Column(Integer, nullable=False, default=0)
    velocity_y = Column(Integer, nullable=False, default=0)
    velocity_z = Column(Integer, nullable=False, default=0)
    status = Column(Text, nullable=False, default="in-space")
    docked_station_id = Column(BigInteger, ForeignKey("stations.id"))
    last_update_at = Column(DateTime(timezone=True), server_default=func.now())
    version = Column(BigInteger, nullable=False, default=0)
