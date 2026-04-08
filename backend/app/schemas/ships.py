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
JumpMode = Literal["hyperspace", "local_approach"]
JumpBlockReasonCode = Literal[
    "requires_undock",
    "jump_cooldown",
    "clearance_required",
    "insufficient_fuel",
]
JumpNextAction = Literal["undock", "gain_clearance", "jump", "wait", "refuel"]
NavigationIntentAction = Literal[
    "gain_clearance",
    "begin_docking_approach",
    "complete_docking_approach",
    "cancel_docking_approach",
]


class JumpPlanResponse(BaseModel):
    current_system_id: int
    requested_destination_station_id: int | None
    requested_destination_system_id: int | None
    recommended_destination_station_id: int | None
    recommended_destination_system_id: int | None
    requested_mode: JumpMode
    recommended_mode: JumpMode
    requested_action_executable: bool
    recommended_action_executable: bool
    next_action: JumpNextAction
    next_action_executable: bool
    next_action_message: str | None = None
    requires_undock: bool
    blocked_reason_code: JumpBlockReasonCode | None = None
    blocked_reason_message: str | None = None
    nearest_clearance_contact_name: str | None = None
    nearest_clearance_distance_km: int | None = None
    clearance_required_km: int | None = None
    clearance_waypoint_x: int | None = None
    clearance_waypoint_y: int | None = None
    clearance_waypoint_z: int | None = None


class NavigationIntentRequest(BaseModel):
    action: NavigationIntentAction
    destination_station_id: int | None = None
    destination_system_id: int | None = None


class FlightControlUpdateRequest(BaseModel):
    thrust_input: float = Field(default=0, ge=-1, le=1)
    yaw_input: float = Field(default=0, ge=-1, le=1)
    pitch_input: float = Field(default=0, ge=-1, le=1)
    roll_input: float = Field(default=0, ge=-1, le=1)
    brake_active: bool = False


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
    class MovementControlState(BaseModel):
        contract_version: str
        velocity_x: float
        velocity_y: float
        velocity_z: float
        heading_yaw_deg: float
        heading_pitch_deg: float
        heading_roll_deg: float
        thrust_input: float
        yaw_input: float
        pitch_input: float
        roll_input: float
        brake_active: bool
        control_updated_at: datetime | None

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
    movement_control: MovementControlState
    jump_cooldown_seconds: int
    jump_cooldown_until: datetime | None


class FlightSnapshotResponse(BaseModel):
    contract_version: str
    ship: ShipResponse
    ship_version: int
    current_system_id: int
    current_system_name: str
    local_snapshot_version: str
    chart_contract_version: str
    snapshot_generated_at: datetime
    suggested_poll_interval_ms: int
    refresh_contacts: bool
    refresh_chart: bool


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
    relative_x_km: int
    relative_y_km: int
    relative_z_km: int
    scene_x: float
    scene_y: float
    scene_z: float


class ShipLocalContactsResponse(BaseModel):
    ship_id: int
    system_id: int
    system_name: str
    generation_version: int
    snapshot_version: str
    snapshot_generated_at: datetime
    contacts: list[LocalScannerContact]


class CollisionCheckResponse(BaseModel):
    ship: ShipResponse
    collision: bool
    severity: str
    object_type: str | None
    object_id: str | None
    object_name: str | None
    collision_context_type: str | None = None
    resolved_outcome: str = "none"
    destruction_triggered: bool = False
    distance_km: float | None
    shields_damage: int
    hull_damage: int
    sfx_event_keys: list[str] = Field(default_factory=list)
    recovered: bool
    message: str
