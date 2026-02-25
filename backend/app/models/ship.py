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
    cargo_capacity = Column(Integer, nullable=False, default=0)
    position_x = Column(Integer, nullable=False, default=0)
    position_y = Column(Integer, nullable=False, default=0)
    position_z = Column(Integer, nullable=False, default=0)
    velocity_x = Column(Integer, nullable=False, default=0)
    velocity_y = Column(Integer, nullable=False, default=0)
    velocity_z = Column(Integer, nullable=False, default=0)
    status = Column(Text, nullable=False, default="in-space")
    docking_computer_tier = Column(Text, nullable=False, default="standard")
    ship_archetype_id = Column(
        BigInteger,
        ForeignKey("ship_archetypes.id"),
        nullable=True,
    )
    render_seed = Column(BigInteger, nullable=False, default=0)
    docked_station_id = Column(BigInteger, ForeignKey("stations.id"))
    last_safe_status = Column(Text, nullable=True)
    last_safe_docked_station_id = Column(
        BigInteger,
        ForeignKey("stations.id"),
        nullable=True,
    )
    last_safe_position_x = Column(Integer, nullable=True)
    last_safe_position_y = Column(Integer, nullable=True)
    last_safe_position_z = Column(Integer, nullable=True)
    last_safe_location_type = Column(Text, nullable=True)
    last_safe_location_id = Column(BigInteger, nullable=True)
    last_safe_recorded_at = Column(DateTime(timezone=True), nullable=True)
    crash_recovery_count = Column(Integer, nullable=False, default=0)
    flight_phase = Column(Text, nullable=False, default="idle")
    flight_locked_destination_station_id = Column(
        BigInteger,
        ForeignKey("stations.id"),
        nullable=True,
    )
    flight_locked_destination_contact_type = Column(Text, nullable=True)
    flight_locked_destination_contact_id = Column(BigInteger, nullable=True)
    flight_phase_started_at = Column(DateTime(timezone=True), nullable=True)
    last_update_at = Column(DateTime(timezone=True), server_default=func.now())
    version = Column(BigInteger, nullable=False, default=0)
