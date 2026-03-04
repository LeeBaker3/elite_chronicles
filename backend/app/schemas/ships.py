from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.flight import FlightPhase


class DockRequest(BaseModel):
    station_id: int


class RefuelRequest(BaseModel):
    amount: int | None = None


class DevFuelTopUpRequest(BaseModel):
    amount: int | None = None


class JumpRequest(BaseModel):
    destination_station_id: int | None = None
    destination_system_id: int | None = None
    local_approach: bool = False


LocalTargetContactType = Literal["station", "planet", "moon", "star"]


class FlightStateUpdateRequest(BaseModel):
    flight_phase: FlightPhase
    flight_locked_destination_station_id: int | None = None
    flight_locked_destination_contact_type: LocalTargetContactType | None = None
    flight_locked_destination_contact_id: int | None = None


class ShipPositionSyncRequest(BaseModel):
    position_x: int
    position_y: int
    position_z: int


class LocalTargetIntentRequest(BaseModel):
    action: Literal["lock", "transfer", "clear"] = "lock"
    contact_type: LocalTargetContactType | None = None
    contact_id: int | None = None


class ScannerSelectionLogRequest(BaseModel):
    selected_contact_id: str
    selected_contact_name: str
    selected_contact_type: str
    source: str
    visible_contact_ids: list[str] = Field(default_factory=list)
    total_contacts: int
    visible_contacts_count: int


class RepairRequest(BaseModel):
    amount: int | None = None


class RechargeRequest(BaseModel):
    shields_amount: int | None = None
    energy_amount: int | None = None


class CargoItem(BaseModel):
    commodity_id: int
    commodity_name: str
    quantity: int


class ShipCargoResponse(BaseModel):
    ship_id: int
    cargo_capacity: int
    cargo_used: int
    cargo_free: int
    items: list[CargoItem]


class ShipResponse(BaseModel):
    id: int
    name: str
    ship_visual_key: str
    ship_archetype_id: int | None
    render_seed: int
    docking_computer_tier: str
    docking_computer_range_km: int
    docked_station_archetype_name: str | None
    docked_station_archetype_shape: str | None
    hull_max: int
    hull_current: int
    shields_max: int
    shields_current: int
    energy_cap: int
    energy_current: int
    fuel_current: int
    fuel_cap: int
    cargo_capacity: int
    position_x: int
    position_y: int
    position_z: int
    status: str
    docked_station_id: int | None
    safe_checkpoint_available: bool
    safe_checkpoint_recorded_at: datetime | None
    crash_recovery_count: int
    flight_phase: FlightPhase
    flight_locked_destination_station_id: int | None
    flight_locked_destination_contact_type: LocalTargetContactType | None
    flight_locked_destination_contact_id: int | None
    flight_phase_started_at: datetime | None
    jump_cooldown_seconds: int
    jump_cooldown_until: datetime | None


class ShipOperationLogEntry(BaseModel):
    ship_id: int
    operation: str
    cost_credits: int
    credits_after: int | None
    status: str
    details: str
    timestamp: str


class LocalScannerContact(BaseModel):
    id: str
    contact_type: str
    name: str
    distance_km: int
    bearing_x: float
    bearing_y: float
    generation_version: int | None = None
    body_type: str | None = None
    radius_km: int | None = None
    orbit_radius_km: int | None = None
    parent_body_id: int | None = None
    host_body_id: int | None = None
    orbit_phase_deg: int | None = None
    orbiting_planet_name: str | None = None
    station_archetype_shape: str | None = None
    ship_visual_key: str | None = None
    scene_x: float
    scene_y: float
    scene_z: float


class ShipLocalContactsResponse(BaseModel):
    ship_id: int
    system_id: int
    system_name: str
    generation_version: int
    contacts: list[LocalScannerContact]


class CollisionCheckResponse(BaseModel):
    ship: ShipResponse
    collision: bool
    severity: str
    object_type: str | None
    object_id: str | None
    object_name: str | None
    distance_km: float | None
    shields_damage: int
    hull_damage: int
    recovered: bool
    message: str
