"""Typed contract models for the desktop runtime."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ContractModel(BaseModel):
    """Base model that ignores additive backend fields by default."""

    model_config = ConfigDict(extra="ignore")


LocalTargetContactType = Literal["station", "planet", "moon", "star"]
TradeDirection = Literal["buy", "sell"]
JumpMode = Literal["hyperspace", "local_approach"]
JumpNextAction = Literal["undock", "gain_clearance", "jump", "wait", "refuel"]


class AuthSession(ContractModel):
    """Authenticated session returned by the backend."""

    token: str
    user_id: int


class PlayerProfile(ContractModel):
    """Commander bootstrap state for the authenticated user."""

    id: int
    email: str
    username: str
    role: str
    credits: int
    is_alive: bool
    location_type: str | None
    location_id: int | None
    primary_ship_id: int | None = None


class StationSummary(ContractModel):
    """Minimal station metadata used by the desktop client."""

    id: int
    name: str
    system_id: int


class InventoryItem(ContractModel):
    """One station inventory row."""

    name: str
    commodity_id: int
    quantity: int
    buy_price: int
    sell_price: int


class TradeResult(ContractModel):
    """Station trade result payload."""

    status: str
    remaining: int
    credits: int


class JumpPlan(ContractModel):
    """Authoritative backend jump recommendation for the current ship state."""

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
    blocked_reason_code: str | None = None
    blocked_reason_message: str | None = None
    nearest_clearance_contact_name: str | None = None
    nearest_clearance_distance_km: int | None = None
    clearance_required_km: int | None = None
    clearance_waypoint_x: int | None = None
    clearance_waypoint_y: int | None = None
    clearance_waypoint_z: int | None = None


class MarketStationSummary(ContractModel):
    """Aggregate market summary for one station."""

    station_id: int
    station_name: str
    commodity_count: int
    scarcity_count: int
    last_inventory_update: str | None
    updated_seconds_ago: int | None
    stale: bool


class ShipCargoItem(ContractModel):
    """One cargo row from the ship cargo endpoint."""

    commodity_id: int
    commodity_name: str
    quantity: int


class ShipCargo(ContractModel):
    """Ship cargo summary."""

    ship_id: int
    cargo_capacity: int
    cargo_used: int
    cargo_free: int
    items: list[ShipCargoItem]


class ShipTelemetry(ContractModel):
    """Authoritative ship state returned by backend endpoints."""

    class MovementControlState(ContractModel):
        """Backend-owned movement control state for the active ship."""

        contract_version: str = "flight-control.v1"
        velocity_x: float = 0.0
        velocity_y: float = 0.0
        velocity_z: float = 0.0
        heading_yaw_deg: float = 0.0
        heading_pitch_deg: float = 0.0
        heading_roll_deg: float = 0.0
        thrust_input: float = 0.0
        yaw_input: float = 0.0
        pitch_input: float = 0.0
        roll_input: float = 0.0
        brake_active: bool = False
        control_updated_at: datetime | None = None

    id: int
    name: str
    ship_visual_key: str
    ship_archetype_id: int | None = None
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
    flight_phase: str
    flight_locked_destination_station_id: int | None
    flight_locked_destination_contact_type: LocalTargetContactType | None = None
    flight_locked_destination_contact_id: int | None = None
    flight_phase_started_at: datetime | None
    movement_control: MovementControlState = Field(
        default_factory=MovementControlState
    )
    jump_cooldown_seconds: int
    jump_cooldown_until: datetime | None


class FlightSnapshot(ContractModel):
    """Lightweight authoritative flight snapshot for controlled polling."""

    contract_version: str
    ship: ShipTelemetry
    ship_version: int
    current_system_id: int
    current_system_name: str
    local_snapshot_version: str
    chart_contract_version: str
    snapshot_generated_at: datetime
    suggested_poll_interval_ms: int
    refresh_contacts: bool
    refresh_chart: bool


class ShipOperationLogEntry(ContractModel):
    """Ship operations timeline entry."""

    ship_id: int
    operation: str
    cost_credits: int
    credits_after: int | None
    status: str
    details: str
    timestamp: str


class LocalScannerContact(ContractModel):
    """Scanner contact payload."""

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


class ShipLocalContactsResponse(ContractModel):
    """Scanner contact set for the active ship."""

    ship_id: int
    system_id: int
    system_name: str
    generation_version: int
    snapshot_version: str | None = None
    snapshot_generated_at: datetime | None = None
    contacts: list[LocalScannerContact]


class LocalChartSystemSummary(ContractModel):
    """Local chart system metadata."""

    id: int
    name: str
    generation_version: int
    seed_hash: str
    contract_version: str


class LocalChartBody(ContractModel):
    """Chart body payload for stars, planets, and moons."""

    id: int
    body_kind: str
    body_type: str
    name: str
    generation_version: int
    parent_body_id: int | None
    orbit_index: int
    orbit_radius_km: int
    radius_km: int
    position_x: int
    position_y: int
    position_z: int
    render_profile: dict[str, Any]


class LocalChartStation(ContractModel):
    """Chart station payload."""

    id: int
    name: str
    host_body_id: int | None
    orbit_radius_km: int | None
    orbit_phase_deg: int | None
    position_x: int
    position_y: int
    position_z: int


class LocalChartMutableState(ContractModel):
    """Mutable chart/runtime state."""

    economy_tick_cursor: int
    politics_tick_cursor: int
    last_economy_tick_at: datetime | None
    last_politics_tick_at: datetime | None
    security_level: str
    stability_score: int
    flight_phase: str
    transition_started_at: datetime | None
    local_target_contact_type: str | None
    local_target_contact_id: str | None
    local_target_status: str
    audio_event_hints: list[str]


class LocalChartResponse(ContractModel):
    """Local chart payload."""

    snapshot_version: str | None = None
    snapshot_generated_at: datetime | None = None
    system: LocalChartSystemSummary
    star: LocalChartBody
    planets: list[LocalChartBody]
    moons_by_parent_body_id: dict[str, list[LocalChartBody]]
    stations: list[LocalChartStation]
    mutable_state: LocalChartMutableState


class CommsChannelSummary(ContractModel):
    """Represent one communications channel available to the commander."""

    id: str
    name: str
    scope: str
    delay_label: str
    unread: int


class CommsMessage(ContractModel):
    """Represent one comms message row."""

    id: str
    author: str
    body: str
    timestamp: str
    direction: str
    delivery: str


@dataclass(slots=True)
class RuntimeCommsState:
    """Resolved desktop comms state for the active commander."""

    channels: list[CommsChannelSummary] = field(default_factory=list)
    active_channel_id: str | None = None
    messages: list[CommsMessage] = field(default_factory=list)
    unread_total: int = 0


@dataclass(slots=True)
class RuntimeBootstrapState:
    """Resolved desktop runtime bootstrap payload."""

    player: PlayerProfile
    snapshot: FlightSnapshot
    ship: ShipTelemetry
    contacts: ShipLocalContactsResponse
    chart: LocalChartResponse
    comms: RuntimeCommsState = field(default_factory=RuntimeCommsState)
    active_scene_name: str = "flight"
    audio_event_hints: list[str] = field(default_factory=list)
    panda3d_available: bool = False


@dataclass(slots=True)
class RuntimeTickResult:
    """Result of one authoritative desktop runtime refresh tick."""

    state: RuntimeBootstrapState
    contacts_refreshed: bool = False
    chart_refreshed: bool = False
    comms_refreshed: bool = False


@dataclass(slots=True)
class SmokeStepResult:
    """Result for one smoke-run step."""

    name: str
    status: Literal["ok", "skipped", "failed"]
    message: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SmokeRunResult:
    """Aggregate result for one smoke run."""

    ok: bool
    steps: list[SmokeStepResult]
