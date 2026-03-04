from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base


class Faction(Base):
    __tablename__ = "factions"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(Text, nullable=False)
    alignment = Column(Text, nullable=False, default="neutral")
    reputation_scale = Column(Integer, nullable=False, default=0)


class StarSystem(Base):
    __tablename__ = "star_systems"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(Text, nullable=False)
    seed = Column(Text, nullable=False)
    position_x = Column(Integer, nullable=False, default=0)
    position_y = Column(Integer, nullable=False, default=0)
    position_z = Column(Integer, nullable=False, default=0)
    economy_type = Column(Text, nullable=False, default="mixed")
    tech_level = Column(Integer, nullable=False, default=0)
    faction_id = Column(BigInteger, ForeignKey("factions.id"))
    generation_version = Column(Integer, nullable=False, default=1)


class StationArchetype(Base):
    __tablename__ = "station_archetypes"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(Text, nullable=False)
    size_class = Column(Text, nullable=False, default="medium")
    shape = Column(Text, nullable=False, default="coriolis")
    palette_json = Column(JSONB, nullable=False, default=dict)
    features_json = Column(JSONB, nullable=False, default=dict)


class ShipArchetype(Base):
    __tablename__ = "ship_archetypes"

    id = Column(BigInteger, primary_key=True, index=True)
    key = Column(Text, nullable=False, unique=True)
    name = Column(Text, nullable=False)
    hull_class = Column(Text, nullable=False, default="light")
    archetype_version = Column(Integer, nullable=False, default=1)
    render_profile_json = Column(JSONB, nullable=False, default=dict)


class Station(Base):
    __tablename__ = "stations"

    id = Column(BigInteger, primary_key=True, index=True)
    system_id = Column(BigInteger, ForeignKey(
        "star_systems.id"), nullable=False)
    name = Column(Text, nullable=False)
    archetype_id = Column(BigInteger, ForeignKey(
        "station_archetypes.id"), nullable=False)
    position_x = Column(Integer, nullable=False)
    position_y = Column(Integer, nullable=False)
    position_z = Column(Integer, nullable=False)
    services_json = Column(JSONB, nullable=False, default=dict)
    faction_id = Column(BigInteger, ForeignKey("factions.id"))
    tech_level = Column(Integer, nullable=False, default=0)
    ai_story_available = Column(Boolean, nullable=False, default=False)
    host_body_id = Column(BigInteger, ForeignKey("celestial_bodies.id"))
    orbit_radius_km = Column(Integer)
    orbit_phase_deg = Column(Integer)
    render_seed = Column(BigInteger, nullable=False, default=0)


class Commodity(Base):
    __tablename__ = "commodities"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(Text, nullable=False)
    category = Column(Text, nullable=False)
    base_price = Column(Integer, nullable=False)
    volatility = Column(Integer, nullable=False, default=0)
    illegal_flag = Column(Boolean, nullable=False, default=False)


class StationInventory(Base):
    __tablename__ = "station_inventory"

    id = Column(BigInteger, primary_key=True, index=True)
    station_id = Column(BigInteger, ForeignKey("stations.id"), nullable=False)
    commodity_id = Column(BigInteger, ForeignKey(
        "commodities.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    max_capacity = Column(Integer, nullable=False, default=0)
    buy_price = Column(Integer, nullable=False, default=0)
    sell_price = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    version = Column(BigInteger, nullable=False, default=0)


class CelestialBody(Base):
    __tablename__ = "celestial_bodies"

    id = Column(BigInteger, primary_key=True, index=True)
    system_id = Column(
        BigInteger,
        ForeignKey("star_systems.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    body_kind = Column(Text, nullable=False)
    body_type = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    seed_fragment = Column(BigInteger, nullable=False)
    generation_version = Column(Integer, nullable=False, default=1)
    parent_body_id = Column(BigInteger, ForeignKey("celestial_bodies.id"))
    orbit_index = Column(Integer, nullable=False, default=0)
    orbit_radius_km = Column(Integer, nullable=False, default=0)
    radius_km = Column(Integer, nullable=False, default=0)
    mass_kg = Column(BigInteger)
    axial_tilt_deg = Column(Integer)
    position_x = Column(Integer, nullable=False, default=0)
    position_y = Column(Integer, nullable=False, default=0)
    position_z = Column(Integer, nullable=False, default=0)
    render_profile = Column(JSONB, nullable=False, default=dict)
    render_seed = Column(BigInteger, nullable=False, default=0)


class SystemSimulationState(Base):
    __tablename__ = "system_simulation_state"

    system_id = Column(
        BigInteger,
        ForeignKey("star_systems.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    last_economy_tick_at = Column(
        DateTime(timezone=True), server_default=func.now())
    last_politics_tick_at = Column(
        DateTime(timezone=True), server_default=func.now())
    economy_tick_cursor = Column(BigInteger, nullable=False, default=0)
    politics_tick_cursor = Column(BigInteger, nullable=False, default=0)
    version = Column(BigInteger, nullable=False, default=0)


class SystemPoliticalState(Base):
    __tablename__ = "system_political_state"

    system_id = Column(
        BigInteger,
        ForeignKey("star_systems.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    faction_control_json = Column(JSONB, nullable=False, default=dict)
    security_level = Column(Text, nullable=False, default="medium")
    stability_score = Column(Integer, nullable=False, default=50)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
