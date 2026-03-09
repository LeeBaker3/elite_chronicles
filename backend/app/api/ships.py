import logging
import math
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi import Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.flight import FlightPhase, normalize_flight_phase
from app.models.cargo import ShipCargo
from app.db.session import get_db
from app.models.ship_operation import ShipOperationLog
from app.models.ship import Ship
from app.models.user import User
from app.models.world import CelestialBody, StarSystem, Station
from app.models.world import StationArchetype
from app.models.world import ShipArchetype
from app.models.world import Commodity
from app.services.celestial_generation_service import ensure_system_bodies
from app.schemas.ships import DockRequest, JumpRequest, RechargeRequest
from app.schemas.ships import FlightStateUpdateRequest
from app.schemas.ships import ShipPositionSyncRequest
from app.schemas.ships import LocalTargetIntentRequest
from app.schemas.ships import RefuelRequest, RepairRequest, ShipResponse
from app.schemas.ships import DevFuelTopUpRequest
from app.schemas.ships import CargoItem, ShipCargoResponse
from app.schemas.ships import ShipOperationLogEntry
from app.schemas.ships import LocalScannerContact, ShipLocalContactsResponse
from app.schemas.ships import CollisionCheckResponse
from app.schemas.ships import ScannerSelectionLogRequest

router = APIRouter()
api_logger = logging.getLogger("api")
JUMP_FUEL_COST = 20
HYPERSPACE_INITIATION_MIN_CLEARANCE_KM = 100
HYPERSPACE_EXIT_MIN_DISTANCE_KM = 100_000
HYPERSPACE_EXIT_INITIAL_RADIUS_KM = 120_000
HYPERSPACE_EXIT_RADIUS_STEP_KM = 50_000
HYPERSPACE_EXIT_MAX_RADIUS_KM = 5_000_000
HULL_REPAIR_COST_PER_POINT = 5
SHIELD_RECHARGE_COST_PER_POINT = 2
ENERGY_RECHARGE_COST_PER_POINT = 1
JUMP_COOLDOWN_SECONDS = 8
UNDOCK_COLLISION_GRACE_SECONDS = 10
UNDOCK_ORIGIN_STATION_IMMUNITY_SECONDS = 180
UNDOCK_ORIGIN_STATION_IMMUNITY_DISTANCE_KM = 60.0
UNDOCK_EXIT_OFFSET_X_KM = 0
UNDOCK_EXIT_OFFSET_Y_KM = 2
UNDOCK_EXIT_OFFSET_Z_KM = 8
DOCKING_COMPUTER_RANGE_BY_TIER_KM: dict[str, int] = {
    "basic": 20,
    "standard": 40,
    "advanced": 80,
}
DEFAULT_DOCKING_COMPUTER_TIER = "standard"
LOCAL_TARGET_CONTACT_TYPES = {"station", "planet", "moon", "star"}
BASE_COLLISION_RADIUS_KM_BY_TYPE: dict[str, int] = {
    "ship": 6,
    "station": 12,
    "planet": 16,
    "star": 22,
}
BASE_COLLISION_DAMAGE_BY_SEVERITY: dict[str, dict[str, tuple[int, int]]] = {
    "glancing": {
        "ship": (10, 2),
        "station": (14, 3),
        "planet": (18, 4),
        "star": (22, 5),
    },
    "critical": {
        "ship": (20, 14),
        "station": (30, 20),
        "planet": (36, 24),
        "star": (46, 30),
    },
}

COLLISION_COOLDOWN_SECONDS = max(1, settings.flight_collision_cooldown_seconds)
COLLISION_GLANCING_MULTIPLIER = max(
    settings.flight_collision_critical_multiplier,
    settings.flight_collision_glancing_multiplier,
)
COLLISION_CRITICAL_MULTIPLIER = max(
    0.2, settings.flight_collision_critical_multiplier)
COLLISION_RADIUS_KM_BY_TYPE: dict[str, int] = {
    object_type: max(
        1, int(round(radius * settings.flight_collision_radius_scale)))
    for object_type, radius in BASE_COLLISION_RADIUS_KM_BY_TYPE.items()
}
COLLISION_DAMAGE_BY_SEVERITY: dict[str, dict[str, tuple[int, int]]] = {
    severity: {
        object_type: (
            max(1, int(
                round(values[0] * settings.flight_collision_damage_scale))),
            max(1, int(
                round(values[1] * settings.flight_collision_damage_scale))),
        )
        for object_type, values in per_type.items()
    }
    for severity, per_type in BASE_COLLISION_DAMAGE_BY_SEVERITY.items()
}


def _canonicalize_ship_visual_key(raw_key: str) -> str:
    """Normalize persisted visual keys to stable frontend contract keys."""

    normalized = raw_key.strip().lower()
    match = re.match(r"^(.*-mk\d+)-\d+$", normalized)
    if match:
        return match.group(1)
    return normalized


def _set_flight_state(
    *,
    ship: Ship,
    phase: FlightPhase,
    locked_destination_station_id: int | None,
    locked_destination_contact_type: str | None = None,
    locked_destination_contact_id: int | None = None,
) -> None:
    """Apply normalized persisted flight state values on a ship."""

    normalized_contact_type = (
        locked_destination_contact_type or "").strip().lower()
    resolved_contact_type: str | None = (
        normalized_contact_type if normalized_contact_type in LOCAL_TARGET_CONTACT_TYPES else None
    )
    resolved_contact_id = (
        int(locked_destination_contact_id)
        if locked_destination_contact_id is not None and int(locked_destination_contact_id) > 0
        else None
    )

    # Keep legacy station lock field in sync while adopting generic contact lock identity.
    if locked_destination_station_id is not None and locked_destination_station_id > 0:
        resolved_contact_type = "station"
        resolved_contact_id = int(locked_destination_station_id)
    if resolved_contact_type == "station" and resolved_contact_id is not None:
        locked_destination_station_id = resolved_contact_id
    elif resolved_contact_type is not None:
        locked_destination_station_id = None

    ship.flight_phase = phase.value
    ship.flight_locked_destination_station_id = locked_destination_station_id
    ship.flight_locked_destination_contact_type = resolved_contact_type
    ship.flight_locked_destination_contact_id = resolved_contact_id
    ship.flight_phase_started_at = datetime.now(timezone.utc)


def _capture_safe_checkpoint(ship: Ship, user: User) -> None:
    """Persist latest safe checkpoint snapshot onto ship-owned fields."""

    ship.last_safe_status = (ship.status or "in-space").strip().lower()
    ship.last_safe_docked_station_id = ship.docked_station_id
    ship.last_safe_position_x = int(ship.position_x or 0)
    ship.last_safe_position_y = int(ship.position_y or 0)
    ship.last_safe_position_z = int(ship.position_z or 0)
    ship.last_safe_location_type = user.location_type
    ship.last_safe_location_id = user.location_id
    ship.last_safe_recorded_at = datetime.now(timezone.utc)


def _restore_ship_to_safe_checkpoint(ship: Ship, user: User) -> None:
    """Restore mutable ship/user state from the latest safe checkpoint."""

    if ship.last_safe_recorded_at is None:
        raise HTTPException(
            status_code=409,
            detail="No safe checkpoint available for recovery",
        )

    checkpoint_status = (ship.last_safe_status or "in-space").strip().lower()
    if checkpoint_status not in {"docked", "in-space"}:
        checkpoint_status = "in-space"
    if checkpoint_status == "docked" and ship.last_safe_docked_station_id is None:
        checkpoint_status = "in-space"

    ship.status = checkpoint_status
    ship.docked_station_id = (
        ship.last_safe_docked_station_id if checkpoint_status == "docked" else None
    )
    ship.position_x = int(ship.last_safe_position_x or 0)
    ship.position_y = int(ship.last_safe_position_y or 0)
    ship.position_z = int(ship.last_safe_position_z or 0)

    _set_flight_state(
        ship=ship,
        phase=FlightPhase.IDLE,
        locked_destination_station_id=None,
    )

    user.location_type = ship.last_safe_location_type
    user.location_id = ship.last_safe_location_id

    if user.location_type == "station" and ship.docked_station_id is None:
        user.location_type = "deep-space"
        user.location_id = None


def _format_station_label(station_id: int | None, station_name: str | None) -> str:
    """Return a user-facing station label with fallback when missing."""

    if station_name:
        return station_name
    if station_id is None:
        return "station"
    return f"Station #{station_id}"


def _get_ship_for_user(ship_id: int, user: User, db: Session) -> Ship:
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")
    if ship.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="Ship access denied")
    return ship


def _load_ship_archetype_visual_map(
    *,
    db: Session,
    archetype_ids: set[int],
) -> dict[int, str]:
    """Return ship archetype visual-key mapping for requested ids."""

    if not archetype_ids:
        return {}
    rows = (
        db.query(ShipArchetype.id, ShipArchetype.key)
        .filter(ShipArchetype.id.in_(archetype_ids))
        .all()
    )
    return {
        int(row[0]): _canonicalize_ship_visual_key(str(row[1]))
        for row in rows
        if row[0] is not None and row[1]
    }


def _ship_visual_key(
    ship: Ship,
    *,
    db: Session | None = None,
    archetype_visual_map: dict[int, str] | None = None,
) -> str:
    """Return stable frontend visual key resolved from persisted ship archetype id."""

    archetype_id = int(ship.ship_archetype_id or 0)
    if archetype_id <= 0:
        return "cobra-mk1"

    if archetype_visual_map and archetype_id in archetype_visual_map:
        return archetype_visual_map[archetype_id]

    if db is not None:
        row = (
            db.query(ShipArchetype.key)
            .filter(ShipArchetype.id == archetype_id)
            .first()
        )
        if row and row[0]:
            return _canonicalize_ship_visual_key(str(row[0]))

    return "cobra-mk1"


def _normalize_docking_computer_tier(tier: str | None) -> str:
    """Return normalized docking computer tier with safe fallback."""

    normalized_tier = (tier or "").strip().lower()
    if normalized_tier in DOCKING_COMPUTER_RANGE_BY_TIER_KM:
        return normalized_tier
    return DEFAULT_DOCKING_COMPUTER_TIER


def _docking_range_km_for_ship(ship: Ship) -> int:
    """Return effective docking range in km for a ship."""

    tier = _normalize_docking_computer_tier(ship.docking_computer_tier)
    return DOCKING_COMPUTER_RANGE_BY_TIER_KM[tier]


def _distance_between_ship_and_station_km(ship: Ship, station: Station) -> int:
    """Return Euclidean distance between current ship and station coordinates."""

    relative_x = int(ship.position_x or 0) - int(station.position_x or 0)
    relative_y = int(ship.position_y or 0) - int(station.position_y or 0)
    relative_z = int(ship.position_z or 0) - int(station.position_z or 0)
    return _distance_km_from_xyz(relative_x, relative_y, relative_z)


def _validate_ship_docking_range(ship: Ship, station: Station) -> None:
    """Ensure a ship is within docking computer range for the requested station."""

    effective_range_km = _docking_range_km_for_ship(ship)
    distance_km = _distance_between_ship_and_station_km(ship, station)
    if distance_km > effective_range_km:
        tier = _normalize_docking_computer_tier(ship.docking_computer_tier)
        raise HTTPException(
            status_code=409,
            detail=(
                "Docking computer range exceeded "
                f"({distance_km}km > {effective_range_km}km for {tier} tier)"
            ),
        )


def _start_docking_approach(
    *,
    ship: Ship,
    station: Station,
    user: User,
    db: Session,
) -> int:
    """Persist docking-approach phase and record approach start log."""

    distance_km = _distance_between_ship_and_station_km(ship, station)
    station_label = _format_station_label(station.id, station.name)

    _set_flight_state(
        ship=ship,
        phase=FlightPhase.DOCKING_APPROACH,
        locked_destination_station_id=station.id,
    )
    ship.version = (ship.version or 0) + 1

    db.commit()
    db.refresh(ship)
    _record_ship_operation(
        ship=ship,
        user=user,
        operation="dock-approach-start",
        cost_credits=0,
        details=(
            f"Started docking approach to {station_label} "
            f"({distance_km}km)"
        ),
        db=db,
    )
    return distance_km


def _docked_station_archetype(ship: Ship, db: Session) -> tuple[str | None, str | None]:
    """Resolve docked station archetype metadata for visual selection."""

    if ship.docked_station_id is None:
        return None, None

    station = (
        db.query(Station)
        .filter(Station.id == ship.docked_station_id)
        .first()
    )
    if station is None:
        return None, None

    archetype = (
        db.query(StationArchetype)
        .filter(StationArchetype.id == station.archetype_id)
        .first()
    )
    if archetype is None:
        return None, None

    return archetype.name, archetype.shape


def _jump_cooldown_state(db: Session, ship_id: int) -> tuple[int, datetime | None]:
    """Return remaining cooldown seconds and absolute cooldown end time."""

    latest_jump = (
        db.query(ShipOperationLog)
        .filter(
            ShipOperationLog.ship_id == ship_id,
            ShipOperationLog.operation == "jump",
        )
        .order_by(ShipOperationLog.created_at.desc(), ShipOperationLog.id.desc())
        .first()
    )
    if latest_jump is None or latest_jump.created_at is None:
        return 0, None

    jump_time = latest_jump.created_at
    if jump_time.tzinfo is None:
        jump_time = jump_time.replace(tzinfo=timezone.utc)

    cooldown_until = jump_time + timedelta(seconds=JUMP_COOLDOWN_SECONDS)

    now = datetime.now(timezone.utc)
    remaining_seconds = math.ceil((cooldown_until - now).total_seconds())
    if remaining_seconds <= 0:
        return 0, None
    return remaining_seconds, cooldown_until


def _to_ship_response(ship: Ship, db: Session) -> ShipResponse:
    """Convert ship model to API response including cooldown status."""

    cooldown_seconds, cooldown_until = _jump_cooldown_state(db, ship.id)
    docked_archetype_name, docked_archetype_shape = _docked_station_archetype(
        ship, db
    )

    return ShipResponse(
        id=ship.id,
        name=ship.name,
        ship_visual_key=_ship_visual_key(ship, db=db),
        ship_archetype_id=ship.ship_archetype_id,
        render_seed=int(ship.render_seed or 0),
        docking_computer_tier=_normalize_docking_computer_tier(
            ship.docking_computer_tier
        ),
        docking_computer_range_km=_docking_range_km_for_ship(ship),
        docked_station_archetype_name=docked_archetype_name,
        docked_station_archetype_shape=docked_archetype_shape,
        hull_max=ship.hull_max,
        hull_current=ship.hull_current,
        shields_max=ship.shields_max,
        shields_current=ship.shields_current,
        energy_cap=ship.energy_cap,
        energy_current=ship.energy_current,
        fuel_current=ship.fuel_current,
        fuel_cap=ship.fuel_cap,
        cargo_capacity=ship.cargo_capacity,
        position_x=int(ship.position_x or 0),
        position_y=int(ship.position_y or 0),
        position_z=int(ship.position_z or 0),
        status=ship.status,
        docked_station_id=ship.docked_station_id,
        safe_checkpoint_available=ship.last_safe_recorded_at is not None,
        safe_checkpoint_recorded_at=ship.last_safe_recorded_at,
        crash_recovery_count=int(ship.crash_recovery_count or 0),
        flight_phase=ship.flight_phase or "idle",
        flight_locked_destination_station_id=ship.flight_locked_destination_station_id,
        flight_locked_destination_contact_type=(
            (ship.flight_locked_destination_contact_type or "").strip().lower() or None
        ),
        flight_locked_destination_contact_id=ship.flight_locked_destination_contact_id,
        flight_phase_started_at=ship.flight_phase_started_at,
        jump_cooldown_seconds=cooldown_seconds,
        jump_cooldown_until=cooldown_until,
    )


def _validate_flight_state_update(
    *,
    ship: Ship,
    payload: FlightStateUpdateRequest,
    db: Session,
) -> None:
    """Validate incoming flight state update payload."""

    if (
        payload.flight_locked_destination_station_id is not None
        and payload.flight_locked_destination_station_id <= 0
    ):
        raise HTTPException(
            status_code=422,
            detail="Locked destination station id must be positive",
        )

    if (
        payload.flight_locked_destination_contact_id is not None
        and payload.flight_locked_destination_contact_id <= 0
    ):
        raise HTTPException(
            status_code=422,
            detail="Locked destination contact id must be positive",
        )

    contact_type = (
        payload.flight_locked_destination_contact_type or "").strip().lower()
    if bool(contact_type) != bool(payload.flight_locked_destination_contact_id):
        raise HTTPException(
            status_code=422,
            detail="Locked destination contact type/id must be provided together",
        )
    if contact_type and contact_type not in LOCAL_TARGET_CONTACT_TYPES:
        raise HTTPException(
            status_code=422,
            detail="Locked destination contact type is invalid",
        )

    if payload.flight_locked_destination_station_id is not None:
        station_exists = (
            db.query(Station.id)
            .filter(Station.id == payload.flight_locked_destination_station_id)
            .first()
        )
        if station_exists is None:
            raise HTTPException(
                status_code=404, detail="Destination station not found")

    if contact_type == "station" and payload.flight_locked_destination_contact_id is not None:
        station_exists = (
            db.query(Station.id)
            .filter(Station.id == payload.flight_locked_destination_contact_id)
            .first()
        )
        if station_exists is None:
            raise HTTPException(
                status_code=404,
                detail="Destination station not found",
            )

    if contact_type in {"planet", "moon", "star"} and payload.flight_locked_destination_contact_id is not None:
        body_exists = (
            db.query(CelestialBody.id)
            .filter(
                CelestialBody.id == payload.flight_locked_destination_contact_id,
                CelestialBody.body_kind == contact_type,
            )
            .first()
        )
        if body_exists is None:
            raise HTTPException(
                status_code=404,
                detail="Destination celestial contact not found",
            )

    if ship.status == "docked" and payload.flight_phase in {
        FlightPhase.CHARGING,
        FlightPhase.JUMPING,
    }:
        raise HTTPException(
            status_code=409,
            detail="Ship must be in-space for charging or jumping phase",
        )


def _ensure_ship_is_docked(ship: Ship) -> None:
    if ship.status != "docked" or ship.docked_station_id is None:
        raise HTTPException(
            status_code=409,
            detail="Ship must be docked for maintenance",
        )


def _record_ship_operation(
    *,
    ship: Ship,
    user: User,
    operation: str,
    cost_credits: int,
    details: str,
    db: Session,
) -> None:
    entry = ShipOperationLog(
        ship_id=ship.id,
        user_id=user.id,
        operation=operation,
        cost_credits=cost_credits,
        credits_after=user.credits,
        status=ship.status,
        details=details,
    )
    db.add(entry)
    db.commit()


def _resolve_ship_system(ship: Ship, user: User, db: Session) -> StarSystem:
    """Resolve ship's current system using docking state or user deep-space location."""

    if ship.docked_station_id is not None:
        docked_station = (
            db.query(Station)
            .filter(Station.id == ship.docked_station_id)
            .first()
        )
        if docked_station is not None:
            docked_system = (
                db.query(StarSystem)
                .filter(StarSystem.id == docked_station.system_id)
                .first()
            )
            if docked_system is not None:
                return docked_system

    if user.location_type == "deep-space" and user.location_id is not None:
        deep_space_system = (
            db.query(StarSystem)
            .filter(StarSystem.id == user.location_id)
            .first()
        )
        if deep_space_system is not None:
            return deep_space_system

    first_system = db.query(StarSystem).order_by(StarSystem.id.asc()).first()
    if first_system is None:
        raise HTTPException(
            status_code=404, detail="No star systems available")
    return first_system


def _deterministic_offset_from_seed(seed_value: int, minimum: int, spread: int) -> int:
    """Return deterministic positive offset in kilometers from a seed value."""

    normalized_seed = abs(int(seed_value or 0))
    return minimum + (normalized_seed % max(1, spread))


def _resolve_local_target_contact(
    *,
    db: Session,
    system_id: int,
    contact_type: str,
    contact_id: int,
) -> tuple[str, int, int, int, int | None, int]:
    """Resolve one local target contact and return label/position/legacy station id."""

    normalized_type = contact_type.strip().lower()
    if normalized_type not in LOCAL_TARGET_CONTACT_TYPES:
        raise HTTPException(
            status_code=422, detail="Unsupported local target contact type")
    if contact_id <= 0:
        raise HTTPException(
            status_code=422, detail="Local target contact id must be positive")

    if normalized_type == "station":
        station = (
            db.query(Station)
            .filter(
                Station.id == contact_id,
                Station.system_id == system_id,
            )
            .first()
        )
        if station is None:
            raise HTTPException(
                status_code=404, detail="Target station not found in current system")
        return (
            station.name,
            int(station.position_x or 0),
            int(station.position_y or 0),
            int(station.position_z or 0),
            int(station.id),
            0,
        )

    body = (
        db.query(CelestialBody)
        .filter(
            CelestialBody.id == contact_id,
            CelestialBody.system_id == system_id,
            CelestialBody.body_kind == normalized_type,
        )
        .first()
    )
    if body is None:
        raise HTTPException(
            status_code=404, detail="Target celestial body not found in current system")
    return (
        body.name,
        int(body.position_x or 0),
        int(body.position_y or 0),
        int(body.position_z or 0),
        None,
        int(body.radius_km or 0),
    )


def _clamp_bearing(value: int) -> float:
    """Normalize arbitrary position values into scanner bearing range."""

    normalized = value / 100.0
    if normalized < -1:
        return -1.0
    if normalized > 1:
        return 1.0
    return round(normalized, 3)


def _distance_km_from_xyz(x: int, y: int, z: int) -> int:
    """Return simple Euclidean distance from origin in scanner kilometers."""

    return int(math.sqrt((x * x) + (y * y) + (z * z)))


def _distance_between_points(
    *,
    source_x: int,
    source_y: int,
    source_z: int,
    target_x: int,
    target_y: int,
    target_z: int,
) -> float:
    """Return Euclidean distance in kilometers between two XYZ points."""

    delta_x = int(target_x) - int(source_x)
    delta_y = int(target_y) - int(source_y)
    delta_z = int(target_z) - int(source_z)
    return math.sqrt((delta_x * delta_x) + (delta_y * delta_y) + (delta_z * delta_z))


def _hyperspace_exit_exclusion_points(
    *,
    system: StarSystem,
    db: Session,
) -> list[tuple[int, int, int]]:
    """Return exclusion center points for hyperspace emergence validation."""

    points: list[tuple[int, int, int]] = [
        (
            int(system.position_x or 0),
            int(system.position_y or 0),
            int(system.position_z or 0),
        )
    ]

    bodies = (
        db.query(CelestialBody)
        .filter(
            CelestialBody.system_id == system.id,
            CelestialBody.body_kind.in_(["star", "planet", "moon"]),
        )
        .all()
    )
    for body in bodies:
        points.append(
            (
                int(body.position_x or 0),
                int(body.position_y or 0),
                int(body.position_z or 0),
            )
        )

    stations = (
        db.query(Station)
        .filter(Station.system_id == system.id)
        .all()
    )
    for station in stations:
        points.append(
            (
                int(station.position_x or 0),
                int(station.position_y or 0),
                int(station.position_z or 0),
            )
        )

    return points


def _nearest_hyperspace_clearance_contact(
    *,
    ship: Ship,
    system: StarSystem,
    db: Session,
) -> tuple[str, float] | None:
    """Return nearest station/celestial contact used for jump clearance gate."""

    ship_x = int(ship.position_x or 0)
    ship_y = int(ship.position_y or 0)
    ship_z = int(ship.position_z or 0)

    nearest_label: str | None = None
    nearest_distance: float | None = None

    def consider_contact(
        *,
        label: str,
        point_x: int,
        point_y: int,
        point_z: int,
    ) -> None:
        nonlocal nearest_label, nearest_distance

        distance = _distance_between_points(
            source_x=ship_x,
            source_y=ship_y,
            source_z=ship_z,
            target_x=point_x,
            target_y=point_y,
            target_z=point_z,
        )
        if nearest_distance is None or distance < nearest_distance:
            nearest_label = label
            nearest_distance = distance

    consider_contact(
        label=f"star {system.name}",
        point_x=int(system.position_x or 0),
        point_y=int(system.position_y or 0),
        point_z=int(system.position_z or 0),
    )

    bodies = (
        db.query(CelestialBody)
        .filter(
            CelestialBody.system_id == system.id,
            CelestialBody.body_kind.in_(["star", "planet", "moon"]),
        )
        .all()
    )
    for body in bodies:
        consider_contact(
            label=f"{body.body_kind} {body.name}",
            point_x=int(body.position_x or 0),
            point_y=int(body.position_y or 0),
            point_z=int(body.position_z or 0),
        )

    stations = (
        db.query(Station)
        .filter(Station.system_id == system.id)
        .all()
    )
    for station in stations:
        consider_contact(
            label=f"station {station.name}",
            point_x=int(station.position_x or 0),
            point_y=int(station.position_y or 0),
            point_z=int(station.position_z or 0),
        )

    if nearest_label is None or nearest_distance is None:
        return None
    return nearest_label, nearest_distance


def _enforce_hyperspace_initiation_clearance(
    *,
    ship: Ship,
    system: StarSystem,
    db: Session,
) -> None:
    """Enforce minimum 100km clearance from local bodies/stations before jump."""

    nearest_contact = _nearest_hyperspace_clearance_contact(
        ship=ship,
        system=system,
        db=db,
    )
    if nearest_contact is None:
        return

    nearest_label, nearest_distance = nearest_contact
    if nearest_distance >= float(HYPERSPACE_INITIATION_MIN_CLEARANCE_KM):
        return

    raise HTTPException(
        status_code=409,
        detail=(
            "Hyperspace jump requires at least "
            f"{HYPERSPACE_INITIATION_MIN_CLEARANCE_KM}km clearance; "
            f"nearest {nearest_label} is {int(round(nearest_distance))}km away"
        ),
    )


def _hyperspace_exit_is_safe(
    *,
    candidate_x: int,
    candidate_y: int,
    candidate_z: int,
    exclusion_points: list[tuple[int, int, int]],
) -> bool:
    """Return whether candidate hyperspace exit point satisfies exclusion rules."""

    for point_x, point_y, point_z in exclusion_points:
        distance = _distance_between_points(
            source_x=candidate_x,
            source_y=candidate_y,
            source_z=candidate_z,
            target_x=point_x,
            target_y=point_y,
            target_z=point_z,
        )
        if distance < float(HYPERSPACE_EXIT_MIN_DISTANCE_KM):
            return False
    return True


def _resolve_hyperspace_exit_point(
    *,
    ship: Ship,
    system: StarSystem,
    db: Session,
) -> tuple[int, int, int]:
    """Resolve deterministic safe hyperspace exit point in destination system."""

    center_x = int(system.position_x or 0)
    center_y = int(system.position_y or 0)
    center_z = int(system.position_z or 0)
    exclusion_points = _hyperspace_exit_exclusion_points(system=system, db=db)

    seed_value = abs(int(ship.render_seed or ship.id or 1)) + \
        (int(system.id) * 7919)
    base_angle_deg = seed_value % 360

    radius_km = HYPERSPACE_EXIT_INITIAL_RADIUS_KM
    while radius_km <= HYPERSPACE_EXIT_MAX_RADIUS_KM:
        for angle_step in range(72):
            angle_deg = (base_angle_deg + (angle_step * 5)) % 360
            angle_rad = math.radians(angle_deg)
            candidate_x = center_x + \
                int(round(math.cos(angle_rad) * radius_km))
            candidate_y = center_y
            candidate_z = center_z + \
                int(round(math.sin(angle_rad) * radius_km))
            if _hyperspace_exit_is_safe(
                candidate_x=candidate_x,
                candidate_y=candidate_y,
                candidate_z=candidate_z,
                exclusion_points=exclusion_points,
            ):
                return candidate_x, candidate_y, candidate_z
        radius_km += HYPERSPACE_EXIT_RADIUS_STEP_KM

    raise HTTPException(
        status_code=409,
        detail=(
            "No safe hyperspace emergence point available in destination system"
        ),
    )


def _planet_anchor(system: StarSystem) -> tuple[int, int, int]:
    """Return deterministic planet anchor coordinates for a star system."""

    seed_x = int((system.id * 17) % 70) - 35
    seed_z = int((system.id * 29) % 90) - 45
    return (
        int(system.position_x or 0) + seed_x,
        int(system.position_y or 0),
        int(system.position_z or 0) + seed_z,
    )


def _collision_classification(*, object_type: str, distance_km: float) -> str:
    """Classify collision severity based on object type and distance."""

    radius = COLLISION_RADIUS_KM_BY_TYPE.get(object_type)
    if radius is None:
        return "none"
    if distance_km <= (radius * COLLISION_CRITICAL_MULTIPLIER):
        return "critical"
    if distance_km <= (radius * COLLISION_GLANCING_MULTIPLIER):
        return "glancing"
    return "none"


def _station_id_from_collision_object_id(object_id: str | None) -> int | None:
    """Extract station id from collision object id token."""

    if not object_id or not object_id.startswith("station-"):
        return None
    raw_station_id = object_id.removeprefix("station-").strip()
    if not raw_station_id.isdigit():
        return None
    return int(raw_station_id)


def _docking_safety_corridor_active(
    *,
    ship: Ship,
    object_type: str,
    object_id: str | None,
    distance_km: float,
) -> bool:
    """Return whether station impact should be suppressed during active docking."""

    if object_type != "station":
        return False

    locked_station_id = int(ship.flight_locked_destination_station_id or 0)
    if locked_station_id <= 0:
        return False

    station_id = _station_id_from_collision_object_id(object_id)
    if station_id is None or station_id != locked_station_id:
        return False

    phase = (ship.flight_phase or "").strip().lower()
    if phase not in {
        FlightPhase.DESTINATION_LOCKED.value,
        FlightPhase.DOCKING_APPROACH.value,
    }:
        return False

    docking_range_km = _docking_range_km_for_ship(ship)
    return distance_km <= float(docking_range_km)


def _collision_on_cooldown(*, ship: Ship, user: User, db: Session) -> bool:
    """Return whether collision processing is inside cooldown window."""

    latest_collision = (
        db.query(ShipOperationLog)
        .filter(
            ShipOperationLog.ship_id == ship.id,
            ShipOperationLog.user_id == user.id,
            ShipOperationLog.operation == "collision",
        )
        .order_by(ShipOperationLog.created_at.desc(), ShipOperationLog.id.desc())
        .first()
    )
    if latest_collision is None or latest_collision.created_at is None:
        return False

    collision_time = latest_collision.created_at
    if collision_time.tzinfo is None:
        collision_time = collision_time.replace(tzinfo=timezone.utc)

    cooldown_until = collision_time + \
        timedelta(seconds=COLLISION_COOLDOWN_SECONDS)
    return datetime.now(timezone.utc) < cooldown_until


def _collision_undock_grace_active(*, ship: Ship, user: User, db: Session) -> bool:
    """Return whether ship is still within the immediate post-undock grace window."""

    latest_undock = (
        db.query(ShipOperationLog)
        .filter(
            ShipOperationLog.ship_id == ship.id,
            ShipOperationLog.user_id == user.id,
            ShipOperationLog.operation == "undock",
        )
        .order_by(ShipOperationLog.created_at.desc(), ShipOperationLog.id.desc())
        .first()
    )
    if latest_undock is None or latest_undock.created_at is None:
        return False

    undock_time = latest_undock.created_at
    if undock_time.tzinfo is None:
        undock_time = undock_time.replace(tzinfo=timezone.utc)

    grace_until = undock_time + \
        timedelta(seconds=UNDOCK_COLLISION_GRACE_SECONDS)
    return datetime.now(timezone.utc) < grace_until


def _latest_undock_log(*, ship: Ship, user: User, db: Session) -> ShipOperationLog | None:
    """Return most recent undock operation log row for the active ship/user."""

    return (
        db.query(ShipOperationLog)
        .filter(
            ShipOperationLog.ship_id == ship.id,
            ShipOperationLog.user_id == user.id,
            ShipOperationLog.operation == "undock",
        )
        .order_by(ShipOperationLog.created_at.desc(), ShipOperationLog.id.desc())
        .first()
    )


def _undock_origin_station_from_details(details: str | None) -> str | None:
    """Extract origin station name from an undock operation detail string."""

    if not details:
        return None
    prefix = "Undocked from "
    if not details.startswith(prefix):
        return None
    station_name = details[len(prefix):].strip()
    return station_name or None


def _apply_collision_damage(
    *,
    ship: Ship,
    object_type: str,
    severity: str,
) -> tuple[int, int]:
    """Apply shield/hull damage and return applied shield and hull damage."""

    severity_table = COLLISION_DAMAGE_BY_SEVERITY.get(severity, {})
    default_damage = (10, 4) if severity == "glancing" else (24, 14)
    intended_shield_damage, intended_hull_damage = severity_table.get(
        object_type,
        default_damage,
    )

    absorbed_by_shields = min(ship.shields_current, intended_shield_damage)
    ship.shields_current = max(ship.shields_current - absorbed_by_shields, 0)

    shield_spillover = max(intended_shield_damage - absorbed_by_shields, 0)
    hull_from_spillover = math.ceil(shield_spillover * 0.5)
    total_hull_damage = intended_hull_damage + hull_from_spillover

    applied_hull_damage = min(ship.hull_current, total_hull_damage)
    ship.hull_current = max(ship.hull_current - applied_hull_damage, 0)

    return absorbed_by_shields, applied_hull_damage


def _resolve_collision_outcome(
    *,
    object_type: str,
    severity: str,
    recovered: bool,
    destruction_triggered: bool,
) -> str:
    """Resolve a deterministic typed outcome for collision telemetry."""

    if recovered:
        return "checkpoint_recovery"

    if object_type == "star":
        if destruction_triggered:
            return "thermal_cascade"
        return "thermal_breach" if severity == "critical" else "thermal_shear"

    if object_type == "planet":
        return "planetary_impact"

    if object_type == "station":
        if destruction_triggered:
            return "station_catastrophic_impact"
        return "station_glancing_impact"

    if object_type == "ship":
        return "ship_heavy_impact" if severity == "critical" else "ship_glancing_impact"

    return "collision_impact"


def _collision_sfx_event_keys(
    *,
    severity: str,
    object_type: str,
    destruction_triggered: bool,
    recovered: bool,
) -> list[str]:
    """Build canonical audio event keys for a collision response."""

    event_keys: list[str] = [
        "collision.critical_hit" if severity == "critical" else "collision.glancing_hit",
    ]

    if object_type == "star" or destruction_triggered:
        event_keys.append("collision.warning_alarm")

    if recovered:
        event_keys.extend([
            "ops.crash_recovery_start",
            "ops.crash_recovery_complete",
        ])

    deduplicated: list[str] = []
    for event_key in event_keys:
        if event_key not in deduplicated:
            deduplicated.append(event_key)
    return deduplicated


def _scanner_scene_coordinates(
    *,
    relative_x: int,
    relative_y: int,
    relative_z: int,
    distance_km: int,
    contact_type: str,
) -> tuple[float, float, float]:
    """Convert scanner bearing and distance values into scene anchor coordinates."""

    _ = distance_km

    if contact_type in {"station", "ship"}:
        scene_x = round(relative_x * 0.11, 3)
        scene_y = round(relative_y * 0.08, 3)
        scene_z = round(relative_z * 0.11, 3)
        return scene_x, scene_y, scene_z

    def _compress_axis(value_km: int) -> float:
        return math.copysign(
            math.log1p(abs(value_km) / 18.0) * 22.0,
            value_km,
        )

    scene_x = round(_compress_axis(relative_x), 3)
    scene_y = round(_compress_axis(relative_y) * 0.72, 3)
    scene_z = round(_compress_axis(relative_z), 3)
    return scene_x, scene_y, scene_z


def _local_contacts_sort_key(contact: LocalScannerContact) -> tuple[int, int, str]:
    """Return deterministic ordering key for local scanner contacts."""

    contact_type_priority = {
        "star": 0,
        "planet": 1,
        "moon": 2,
        "station": 3,
        "ship": 4,
    }
    return (
        contact_type_priority.get(contact.contact_type, 99),
        int(contact.distance_km),
        contact.id,
    )


def _canonical_scanner_body_name(
    *,
    system_name: str,
    body: CelestialBody,
    body_by_id: dict[int, CelestialBody],
) -> str:
    """Return canonical scanner name for one celestial body."""

    normalized_system_name = str(system_name or "Unknown system")
    body_kind = str(body.body_kind or "").strip().lower()

    if body_kind == "star":
        return f"{normalized_system_name} Primary"

    if body_kind == "planet":
        return f"{normalized_system_name} {int(body.orbit_index or 0)}"

    if body_kind == "moon":
        moon_orbit_index = int(body.orbit_index or 0)
        parent_body_id = int(body.parent_body_id or 0)
        parent_planet_orbit = 0
        if parent_body_id > 0 and parent_body_id in body_by_id:
            parent_body = body_by_id[parent_body_id]
            if str(parent_body.body_kind or "").strip().lower() == "planet":
                parent_planet_orbit = int(parent_body.orbit_index or 0)

        if parent_planet_orbit > 0 and moon_orbit_index > 0:
            return f"{normalized_system_name} {parent_planet_orbit}-{moon_orbit_index}"

        return f"{normalized_system_name} {parent_body_id}-{moon_orbit_index}"

    return str(body.name or "Unknown body")


def _nearest_collision_candidate(
    *,
    ship: Ship,
    user: User,
    db: Session,
) -> dict[str, str | float | int] | None:
    """Return the nearest potential collision candidate around the ship."""

    system = _resolve_ship_system(ship, user, db)
    ship_x = int(ship.position_x or 0)
    ship_y = int(ship.position_y or 0)
    ship_z = int(ship.position_z or 0)

    candidates: list[dict[str, str | float | int]] = []

    star_x = int(system.position_x or 0)
    star_y = int(system.position_y or 0)
    star_z = int(system.position_z or 0)
    candidates.append(
        {
            "object_type": "star",
            "object_id": f"star-{system.id}",
            "object_name": f"{system.name} Primary",
            "distance_km": _distance_between_points(
                source_x=ship_x,
                source_y=ship_y,
                source_z=ship_z,
                target_x=star_x,
                target_y=star_y,
                target_z=star_z,
            ),
            "ship_x": ship_x,
            "ship_y": ship_y,
            "ship_z": ship_z,
            "target_x": star_x,
            "target_y": star_y,
            "target_z": star_z,
        }
    )

    planet_x, planet_y, planet_z = _planet_anchor(system)
    candidates.append(
        {
            "object_type": "planet",
            "object_id": f"planet-{system.id}-1",
            "object_name": f"{system.name} I",
            "distance_km": _distance_between_points(
                source_x=ship_x,
                source_y=ship_y,
                source_z=ship_z,
                target_x=planet_x,
                target_y=planet_y,
                target_z=planet_z,
            ),
            "ship_x": ship_x,
            "ship_y": ship_y,
            "ship_z": ship_z,
            "target_x": planet_x,
            "target_y": planet_y,
            "target_z": planet_z,
        }
    )

    system_stations = (
        db.query(Station)
        .filter(Station.system_id == system.id)
        .all()
    )
    for station in system_stations:
        candidates.append(
            {
                "object_type": "station",
                "object_id": f"station-{station.id}",
                "object_name": station.name,
                "distance_km": _distance_between_points(
                    source_x=ship_x,
                    source_y=ship_y,
                    source_z=ship_z,
                    target_x=int(station.position_x or 0),
                    target_y=int(station.position_y or 0),
                    target_z=int(station.position_z or 0),
                ),
                "ship_x": ship_x,
                "ship_y": ship_y,
                "ship_z": ship_z,
                "target_x": int(station.position_x or 0),
                "target_y": int(station.position_y or 0),
                "target_z": int(station.position_z or 0),
            }
        )

    nearby_ships = (
        db.query(Ship)
        .filter(
            Ship.id != ship.id,
            Ship.status == "in-space",
        )
        .limit(12)
        .all()
    )
    for contact_ship in nearby_ships:
        candidates.append(
            {
                "object_type": "ship",
                "object_id": f"ship-{contact_ship.id}",
                "object_name": contact_ship.name,
                "distance_km": _distance_between_points(
                    source_x=ship_x,
                    source_y=ship_y,
                    source_z=ship_z,
                    target_x=int(contact_ship.position_x or 0),
                    target_y=int(contact_ship.position_y or 0),
                    target_z=int(contact_ship.position_z or 0),
                ),
                "ship_x": ship_x,
                "ship_y": ship_y,
                "ship_z": ship_z,
                "target_x": int(contact_ship.position_x or 0),
                "target_y": int(contact_ship.position_y or 0),
                "target_z": int(contact_ship.position_z or 0),
            }
        )

    if not candidates:
        return None

    return min(
        candidates,
        key=lambda candidate: float(candidate["distance_km"]),
    )


def _collision_diagnostics_fragment(candidate: dict[str, str | float | int]) -> str:
    """Build temporary collision diagnostics string for response messages."""

    ship_x = int(candidate.get("ship_x", 0))
    ship_y = int(candidate.get("ship_y", 0))
    ship_z = int(candidate.get("ship_z", 0))
    target_x = int(candidate.get("target_x", 0))
    target_y = int(candidate.get("target_y", 0))
    target_z = int(candidate.get("target_z", 0))
    distance_km = float(candidate.get("distance_km", 0.0))
    return (
        "diag "
        f"ship=({ship_x},{ship_y},{ship_z}) "
        f"target=({target_x},{target_y},{target_z}) "
        f"distance={distance_km:.2f}km"
    )


@router.get("/{ship_id}", response_model=ShipResponse)
def get_ship(ship_id: int, db: Session = Depends(get_db)):
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    return _to_ship_response(ship, db)


@router.get(
    "/{ship_id}/local-contacts",
    response_model=ShipLocalContactsResponse,
)
def get_ship_local_contacts(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return local scanner contacts for ship's current star system."""

    ship = _get_ship_for_user(ship_id, current_user, db)
    system = _resolve_ship_system(ship, current_user, db)
    generation_version = int(system.generation_version or 1)
    bodies = ensure_system_bodies(system=system, db=db)
    body_by_id = {int(body.id): body for body in bodies}

    ship_x = int(ship.position_x or 0)
    ship_y = int(ship.position_y or 0)
    ship_z = int(ship.position_z or 0)

    contacts: list[LocalScannerContact] = []

    planets_by_body_id: dict[int, str] = {}
    for body in bodies:
        if body.body_kind not in {"star", "planet", "moon"}:
            continue

        relative_x = int(body.position_x or 0) - ship_x
        relative_y = int(body.position_y or 0) - ship_y
        relative_z = int(body.position_z or 0) - ship_z
        distance_km = max(_distance_km_from_xyz(
            relative_x, relative_y, relative_z), 0)
        bearing_x = _clamp_bearing(relative_x)
        bearing_y = _clamp_bearing(relative_z)
        scene_x, scene_y, scene_z = _scanner_scene_coordinates(
            relative_x=relative_x,
            relative_y=relative_y,
            relative_z=relative_z,
            distance_km=distance_km,
            contact_type=body.body_kind,
        )

        body_display_name = _canonical_scanner_body_name(
            system_name=str(system.name),
            body=body,
            body_by_id=body_by_id,
        )

        contacts.append(
            LocalScannerContact(
                id=f"{body.body_kind}-{body.id}",
                contact_type=body.body_kind,
                name=body_display_name,
                distance_km=distance_km,
                bearing_x=bearing_x,
                bearing_y=bearing_y,
                generation_version=int(body.generation_version),
                body_type=body.body_type,
                radius_km=int(body.radius_km or 0),
                orbit_radius_km=int(body.orbit_radius_km or 0),
                parent_body_id=body.parent_body_id,
                relative_x_km=relative_x,
                relative_y_km=relative_y,
                relative_z_km=relative_z,
                scene_x=scene_x,
                scene_y=scene_y,
                scene_z=scene_z,
            )
        )

        if body.body_kind == "planet":
            planets_by_body_id[int(body.id)] = body_display_name

    stations = (
        db.query(Station)
        .filter(Station.system_id == system.id)
        .order_by(Station.id.asc())
        .all()
    )
    station_archetype_ids = {
        station.archetype_id
        for station in stations
        if station.archetype_id is not None
    }
    station_archetypes = {
        entry.id: entry
        for entry in (
            db.query(StationArchetype)
            .filter(StationArchetype.id.in_(station_archetype_ids))
            .all()
            if station_archetype_ids
            else []
        )
    }
    for station in stations:
        station_archetype = station_archetypes.get(station.archetype_id)
        relative_station_x = int(station.position_x or 0) - ship_x
        relative_station_y = int(station.position_y or 0) - ship_y
        relative_station_z = int(station.position_z or 0) - ship_z
        station_distance_km = max(
            _distance_km_from_xyz(relative_station_x,
                                  relative_station_y, relative_station_z),
            1,
        )
        station_bearing_x = _clamp_bearing(relative_station_x)
        station_bearing_y = _clamp_bearing(relative_station_z)
        station_scene_x, station_scene_y, station_scene_z = _scanner_scene_coordinates(
            relative_x=relative_station_x,
            relative_y=relative_station_y,
            relative_z=relative_station_z,
            distance_km=station_distance_km,
            contact_type="station",
        )

        contacts.append(
            LocalScannerContact(
                id=f"station-{station.id}",
                contact_type="station",
                name=station.name,
                distance_km=station_distance_km,
                bearing_x=station_bearing_x,
                bearing_y=station_bearing_y,
                generation_version=generation_version,
                host_body_id=station.host_body_id,
                orbit_radius_km=station.orbit_radius_km,
                orbit_phase_deg=station.orbit_phase_deg,
                orbiting_planet_name=(
                    planets_by_body_id.get(int(station.host_body_id))
                    if station.host_body_id is not None
                    and int(station.host_body_id) in planets_by_body_id
                    else None
                ),
                station_archetype_shape=(
                    station_archetype.shape if station_archetype else None
                ),
                relative_x_km=relative_station_x,
                relative_y_km=relative_station_y,
                relative_z_km=relative_station_z,
                scene_x=station_scene_x,
                scene_y=station_scene_y,
                scene_z=station_scene_z,
            )
        )

    nearby_ships = (
        db.query(Ship)
        .filter(
            Ship.id != ship.id,
            Ship.owner_user_id != current_user.id,
            Ship.status == "in-space",
        )
        .order_by(Ship.id.asc())
        .limit(6)
        .all()
    )
    ship_archetype_visual_map = _load_ship_archetype_visual_map(
        db=db,
        archetype_ids={
            int(contact_ship.ship_archetype_id)
            for contact_ship in nearby_ships
            if int(contact_ship.ship_archetype_id or 0) > 0
        },
    )
    for contact_ship in nearby_ships:
        relative_ship_x = int(contact_ship.position_x or 0) - \
            int(ship.position_x or 0)
        relative_ship_y = int(contact_ship.position_y or 0) - \
            int(ship.position_y or 0)
        relative_ship_z = int(contact_ship.position_z or 0) - \
            int(ship.position_z or 0)
        ship_distance_km = max(
            _distance_km_from_xyz(
                relative_ship_x, relative_ship_y, relative_ship_z),
            2,
        )
        ship_bearing_x = _clamp_bearing(relative_ship_x)
        ship_bearing_y = _clamp_bearing(relative_ship_z)
        ship_scene_x, ship_scene_y, ship_scene_z = _scanner_scene_coordinates(
            relative_x=relative_ship_x,
            relative_y=relative_ship_y,
            relative_z=relative_ship_z,
            distance_km=ship_distance_km,
            contact_type="ship",
        )

        contacts.append(
            LocalScannerContact(
                id=f"ship-{contact_ship.id}",
                contact_type="ship",
                name=contact_ship.name,
                distance_km=ship_distance_km,
                bearing_x=ship_bearing_x,
                bearing_y=ship_bearing_y,
                generation_version=generation_version,
                ship_visual_key=_ship_visual_key(
                    contact_ship,
                    archetype_visual_map=ship_archetype_visual_map,
                ),
                relative_x_km=relative_ship_x,
                relative_y_km=relative_ship_y,
                relative_z_km=relative_ship_z,
                scene_x=ship_scene_x,
                scene_y=ship_scene_y,
                scene_z=ship_scene_z,
            )
        )

    contacts.sort(key=_local_contacts_sort_key)

    return ShipLocalContactsResponse(
        ship_id=ship.id,
        system_id=system.id,
        system_name=system.name,
        generation_version=generation_version,
        contacts=contacts,
    )


@router.get(
    "/{ship_id}/operations",
    response_model=list[ShipOperationLogEntry],
)
def get_ship_operations(
    ship_id: int,
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_ship_for_user(ship_id, current_user, db)
    rows = (
        db.query(ShipOperationLog)
        .filter(
            ShipOperationLog.ship_id == ship_id,
            ShipOperationLog.user_id == current_user.id,
        )
        .order_by(ShipOperationLog.id.desc())
        .limit(limit)
        .all()
    )
    return [
        ShipOperationLogEntry(
            ship_id=row.ship_id,
            operation=row.operation,
            cost_credits=row.cost_credits,
            credits_after=row.credits_after,
            status=row.status,
            details=row.details,
            timestamp=row.created_at.isoformat() if row.created_at else "",
        )
        for row in rows
    ]


@router.post("/{ship_id}/scanner-selection")
def log_scanner_selection(
    ship_id: int,
    payload: ScannerSelectionLogRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist scanner selection telemetry to ship ops and API log files."""

    ship = _get_ship_for_user(ship_id, current_user, db)
    selected_label = (
        f"{payload.selected_contact_type}:{payload.selected_contact_name}"
        f"[{payload.selected_contact_id}]"
    )
    visible_ids = payload.visible_contact_ids[:12]
    visible_ids_text = ", ".join(visible_ids) if visible_ids else "-"
    details = (
        f"Scanner selection source={payload.source} selected={selected_label} "
        f"visible={payload.visible_contacts_count}/{payload.total_contacts} "
        f"rows={visible_ids_text}"
    )

    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="scanner-select",
        cost_credits=0,
        details=details,
        db=db,
    )
    api_logger.info(
        "scanner_selection ship_id=%s user_id=%s source=%s selected=%s "
        "visible=%s/%s rows=%s",
        ship.id,
        current_user.id,
        payload.source,
        payload.selected_contact_id,
        payload.visible_contacts_count,
        payload.total_contacts,
        visible_ids_text,
    )
    return {"logged": True}


@router.post("/{ship_id}/dock", response_model=ShipResponse)
def dock_ship(
    ship_id: int,
    payload: DockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ship = _get_ship_for_user(ship_id, current_user, db)
    station = db.query(Station).filter(
        Station.id == payload.station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if ship.status != "in-space" or ship.docked_station_id is not None:
        raise HTTPException(
            status_code=409, detail="Ship must be in-space to dock")

    _validate_ship_docking_range(ship, station)
    approach_distance_km: int | None = None
    if settings.dock_approach_enabled:
        approach_distance_km = _start_docking_approach(
            ship=ship,
            station=station,
            user=current_user,
            db=db,
        )

    ship.status = "docked"
    ship.docked_station_id = payload.station_id
    _set_flight_state(
        ship=ship,
        phase=FlightPhase.IDLE,
        locked_destination_station_id=None,
    )
    current_user.location_type = "station"
    current_user.location_id = payload.station_id
    _capture_safe_checkpoint(ship, current_user)
    ship.version = (ship.version or 0) + 1
    db.commit()
    db.refresh(ship)
    if approach_distance_km is not None:
        _record_ship_operation(
            ship=ship,
            user=current_user,
            operation="dock-approach-complete",
            cost_credits=0,
            details=(
                "Completed docking approach at "
                f"{_format_station_label(station.id, station.name)} "
                f"({approach_distance_km}km)"
            ),
            db=db,
        )
    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="dock",
        cost_credits=0,
        details=f"Docked at {_format_station_label(station.id, station.name)}",
        db=db,
    )
    return _to_ship_response(ship, db)


@router.post("/{ship_id}/undock", response_model=ShipResponse)
def undock_ship(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ship = _get_ship_for_user(ship_id, current_user, db)
    if ship.status != "docked" or ship.docked_station_id is None:
        raise HTTPException(status_code=409, detail="Ship is not docked")

    origin_station_id = ship.docked_station_id
    origin_station_name = (
        db.query(Station.name)
        .filter(Station.id == origin_station_id)
        .scalar()
    )
    origin_station_label = _format_station_label(
        origin_station_id,
        origin_station_name,
    )

    ship.status = "in-space"
    origin_station = db.query(Station).filter(
        Station.id == origin_station_id).first()
    origin_system_id: int | None = None
    if origin_station is not None:
        origin_system_id = int(origin_station.system_id)
        ship.position_x = int(
            origin_station.position_x or 0) + UNDOCK_EXIT_OFFSET_X_KM
        ship.position_y = int(
            origin_station.position_y or 0) + UNDOCK_EXIT_OFFSET_Y_KM
        ship.position_z = int(
            origin_station.position_z or 0) + UNDOCK_EXIT_OFFSET_Z_KM
    ship.docked_station_id = None
    _set_flight_state(
        ship=ship,
        phase=FlightPhase.IDLE,
        locked_destination_station_id=None,
    )
    current_user.location_type = "deep-space"
    current_user.location_id = origin_system_id
    _capture_safe_checkpoint(ship, current_user)
    ship.version = (ship.version or 0) + 1
    db.commit()
    db.refresh(ship)
    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="undock",
        cost_credits=0,
        details=f"Undocked from {origin_station_label}",
        db=db,
    )
    return _to_ship_response(ship, db)


@router.post("/{ship_id}/refuel", response_model=ShipResponse)
def refuel_ship(
    ship_id: int,
    payload: RefuelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ship = _get_ship_for_user(ship_id, current_user, db)
    _ensure_ship_is_docked(ship)

    if payload.amount is None:
        ship.fuel_current = ship.fuel_cap
    else:
        if payload.amount <= 0:
            raise HTTPException(
                status_code=422, detail="Refuel amount must be positive")
        ship.fuel_current = min(
            ship.fuel_current + payload.amount, ship.fuel_cap)

    _set_flight_state(
        ship=ship,
        phase=FlightPhase.IDLE,
        locked_destination_station_id=None,
    )

    ship.version = (ship.version or 0) + 1
    db.commit()
    db.refresh(ship)
    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="refuel",
        cost_credits=0,
        details="Refueled ship",
        db=db,
    )
    return _to_ship_response(ship, db)


@router.post("/{ship_id}/dev-top-up-fuel", response_model=ShipResponse)
def dev_top_up_fuel(
    ship_id: int,
    payload: DevFuelTopUpRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if settings.environment != "development":
        raise HTTPException(
            status_code=403,
            detail="Development-only endpoint",
        )

    ship = _get_ship_for_user(ship_id, current_user, db)
    if payload.amount is None:
        ship.fuel_current = ship.fuel_cap
    else:
        if payload.amount <= 0:
            raise HTTPException(
                status_code=422,
                detail="Top-up amount must be positive",
            )
        ship.fuel_current = min(
            ship.fuel_current + payload.amount,
            ship.fuel_cap,
        )

    ship.version = (ship.version or 0) + 1
    db.commit()
    db.refresh(ship)
    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="dev-fuel-top-up",
        cost_credits=0,
        details="Development fuel top-up applied",
        db=db,
    )
    return _to_ship_response(ship, db)


@router.post("/{ship_id}/repair", response_model=ShipResponse)
def repair_ship(
    ship_id: int,
    payload: RepairRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ship = _get_ship_for_user(ship_id, current_user, db)
    _ensure_ship_is_docked(ship)

    if payload.amount is not None and payload.amount <= 0:
        raise HTTPException(
            status_code=422,
            detail="Repair amount must be positive",
        )

    if ship.hull_current >= ship.hull_max:
        raise HTTPException(
            status_code=409,
            detail="Hull is already at maximum",
        )

    repair_amount = payload.amount if payload.amount is not None else ship.hull_max
    repaired_points = min(ship.hull_max - ship.hull_current, repair_amount)
    cost = repaired_points * HULL_REPAIR_COST_PER_POINT
    if current_user.credits < cost:
        raise HTTPException(
            status_code=409,
            detail="Insufficient credits for repair",
        )

    ship.hull_current += repaired_points
    current_user.credits -= cost
    _set_flight_state(
        ship=ship,
        phase=FlightPhase.IDLE,
        locked_destination_station_id=None,
    )
    ship.version = (ship.version or 0) + 1
    db.commit()
    db.refresh(ship)
    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="repair",
        cost_credits=cost,
        details=f"Repaired hull by {repaired_points}",
        db=db,
    )
    return _to_ship_response(ship, db)


@router.post("/{ship_id}/recharge", response_model=ShipResponse)
def recharge_ship(
    ship_id: int,
    payload: RechargeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ship = _get_ship_for_user(ship_id, current_user, db)
    _ensure_ship_is_docked(ship)

    if payload.shields_amount is not None and payload.shields_amount <= 0:
        raise HTTPException(
            status_code=422,
            detail="Shield recharge amount must be positive",
        )
    if payload.energy_amount is not None and payload.energy_amount <= 0:
        raise HTTPException(
            status_code=422,
            detail="Energy recharge amount must be positive",
        )

    shield_target = (
        ship.shields_max
        if payload.shields_amount is None
        else min(ship.shields_current + payload.shields_amount, ship.shields_max)
    )
    energy_target = (
        ship.energy_cap
        if payload.energy_amount is None
        else min(ship.energy_current + payload.energy_amount, ship.energy_cap)
    )

    shield_points = max(shield_target - ship.shields_current, 0)
    energy_points = max(energy_target - ship.energy_current, 0)
    if shield_points == 0 and energy_points == 0:
        raise HTTPException(
            status_code=409,
            detail="Shields and energy are already at maximum",
        )

    cost = (
        shield_points * SHIELD_RECHARGE_COST_PER_POINT
        + energy_points * ENERGY_RECHARGE_COST_PER_POINT
    )
    if current_user.credits < cost:
        raise HTTPException(
            status_code=409,
            detail="Insufficient credits for recharge",
        )

    ship.shields_current = shield_target
    ship.energy_current = energy_target
    current_user.credits -= cost
    _set_flight_state(
        ship=ship,
        phase=FlightPhase.IDLE,
        locked_destination_station_id=None,
    )
    ship.version = (ship.version or 0) + 1
    db.commit()
    db.refresh(ship)
    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="recharge",
        cost_credits=cost,
        details=(
            f"Shields +{shield_points}, energy +{energy_points}"
        ),
        db=db,
    )
    return _to_ship_response(ship, db)


@router.post("/{ship_id}/jump", response_model=ShipResponse)
def jump_ship(
    ship_id: int,
    payload: JumpRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ship = _get_ship_for_user(ship_id, current_user, db)
    current_system = _resolve_ship_system(ship, current_user, db)
    destination_station: Station | None = None
    destination_system: StarSystem | None = None

    if payload.destination_station_id is not None:
        destination_station = (
            db.query(Station)
            .filter(Station.id == payload.destination_station_id)
            .first()
        )
        if destination_station is None:
            raise HTTPException(
                status_code=404,
                detail="Destination station not found",
            )
        destination_system = (
            db.query(StarSystem)
            .filter(StarSystem.id == destination_station.system_id)
            .first()
        )
    elif payload.destination_system_id is not None:
        destination_system = (
            db.query(StarSystem)
            .filter(StarSystem.id == payload.destination_system_id)
            .first()
        )
        if destination_system is None:
            raise HTTPException(
                status_code=404,
                detail="Destination system not found",
            )
        destination_station = (
            db.query(Station)
            .filter(Station.system_id == destination_system.id)
            .order_by(Station.id.asc())
            .first()
        )
        if destination_station is None:
            raise HTTPException(
                status_code=409,
                detail="Destination system has no dockable station",
            )
    else:
        raise HTTPException(
            status_code=422,
            detail=(
                "Jump destination requires destination_station_id "
                "or destination_system_id"
            ),
        )

    is_local_approach = (
        payload.local_approach
        and destination_station is not None
        and destination_station.system_id == current_system.id
    )

    fuel_cost = 0 if is_local_approach else JUMP_FUEL_COST

    if ship.status != "in-space" or ship.docked_station_id is not None:
        raise HTTPException(
            status_code=409,
            detail="Ship must be in-space to jump",
        )
    if not is_local_approach:
        cooldown_remaining_seconds, _ = _jump_cooldown_state(db, ship.id)
        if cooldown_remaining_seconds > 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Jump cooldown active "
                    f"({cooldown_remaining_seconds}s remaining)"
                ),
            )
        _enforce_hyperspace_initiation_clearance(
            ship=ship,
            system=current_system,
            db=db,
        )

    if ship.fuel_current < fuel_cost:
        raise HTTPException(
            status_code=409, detail="Insufficient fuel for jump")

    ship.fuel_current -= fuel_cost
    ship.status = "in-space"
    ship.docked_station_id = None

    if is_local_approach:
        locked_destination_station_id = destination_station.id
        ship.position_x = destination_station.position_x + 18
        ship.position_y = destination_station.position_y + 6
        ship.position_z = destination_station.position_z + 18
    else:
        locked_destination_station_id = None
        (
            ship.position_x,
            ship.position_y,
            ship.position_z,
        ) = _resolve_hyperspace_exit_point(
            ship=ship,
            system=destination_system,
            db=db,
        )

    _set_flight_state(
        ship=ship,
        phase=FlightPhase.ARRIVED,
        locked_destination_station_id=locked_destination_station_id,
    )
    ship.version = (ship.version or 0) + 1

    current_user.location_type = "deep-space"
    current_user.location_id = destination_system.id

    _capture_safe_checkpoint(ship, current_user)

    db.commit()
    db.refresh(ship)
    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="jump",
        cost_credits=0,
        details=(
            (
                f"Local transfer jump near "
                f"{_format_station_label(destination_station.id, destination_station.name)}; "
                f"fuel cost {fuel_cost}"
            )
            if is_local_approach
            else (
                f"Jumped into {destination_system.name} at safe emergence point "
                f"(>= {HYPERSPACE_EXIT_MIN_DISTANCE_KM}km from local bodies); "
                f"fuel cost {fuel_cost}"
            )
        ),
        db=db,
    )
    return _to_ship_response(ship, db)


@router.post("/{ship_id}/local-target", response_model=ShipResponse)
def update_local_target(
    ship_id: int,
    payload: LocalTargetIntentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lock, clear, or execute local transfer toward one in-system contact."""

    ship = _get_ship_for_user(ship_id, current_user, db)
    system = _resolve_ship_system(ship, current_user, db)
    action = payload.action

    if action == "clear":
        _set_flight_state(
            ship=ship,
            phase=FlightPhase.IDLE,
            locked_destination_station_id=None,
            locked_destination_contact_type=None,
            locked_destination_contact_id=None,
        )
        ship.version = (ship.version or 0) + 1
        db.commit()
        db.refresh(ship)
        _record_ship_operation(
            ship=ship,
            user=current_user,
            operation="local-target-clear",
            cost_credits=0,
            details="Cleared local target lock",
            db=db,
        )
        return _to_ship_response(ship, db)

    contact_type = (payload.contact_type or "").strip().lower()
    contact_id = int(payload.contact_id or 0)
    if contact_type not in LOCAL_TARGET_CONTACT_TYPES or contact_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="Local target update requires valid contact_type and contact_id",
        )

    (
        target_name,
        target_x,
        target_y,
        target_z,
        legacy_station_id,
        target_radius_km,
    ) = _resolve_local_target_contact(
        db=db,
        system_id=int(system.id),
        contact_type=contact_type,
        contact_id=contact_id,
    )

    if action == "lock":
        phase = FlightPhase.DESTINATION_LOCKED if ship.status == "in-space" else FlightPhase.IDLE
        _set_flight_state(
            ship=ship,
            phase=phase,
            locked_destination_station_id=legacy_station_id,
            locked_destination_contact_type=contact_type,
            locked_destination_contact_id=contact_id,
        )
        ship.version = (ship.version or 0) + 1
        db.commit()
        db.refresh(ship)
        _record_ship_operation(
            ship=ship,
            user=current_user,
            operation="local-target-lock",
            cost_credits=0,
            details=f"Locked local target {contact_type} {target_name} ({contact_id})",
            db=db,
        )
        return _to_ship_response(ship, db)

    if ship.status != "in-space" or ship.docked_station_id is not None:
        raise HTTPException(
            status_code=409,
            detail="Ship must be in-space to execute local transfer",
        )

    origin_x = int(ship.position_x or 0)
    origin_y = int(ship.position_y or 0)
    origin_z = int(ship.position_z or 0)

    seed_base = int(ship.render_seed or ship.id or 1) + (contact_id * 97)
    standoff_km = _deterministic_offset_from_seed(seed_base, 18, 16)
    lateral_km = _deterministic_offset_from_seed(seed_base * 7, 4, 7)
    vertical_km = _deterministic_offset_from_seed(seed_base * 11, 2, 5)
    lateral_sign = -1 if (seed_base % 2 == 0) else 1
    vertical_sign = -1 if ((seed_base // 3) % 2 == 0) else 1
    longitudinal_offset_km = standoff_km
    if contact_type in {"planet", "moon", "star"}:
        longitudinal_offset_km += max(int(target_radius_km), 0)

    ship.position_x = target_x + longitudinal_offset_km
    ship.position_y = target_y + (vertical_sign * vertical_km)
    ship.position_z = target_z + (lateral_sign * lateral_km)
    ship.velocity_x = max(1, longitudinal_offset_km // 5)
    ship.velocity_y = 0
    ship.velocity_z = 0
    ship.status = "in-space"
    ship.docked_station_id = None
    _set_flight_state(
        ship=ship,
        phase=FlightPhase.ARRIVED,
        locked_destination_station_id=legacy_station_id,
        locked_destination_contact_type=contact_type,
        locked_destination_contact_id=contact_id,
    )
    ship.version = (ship.version or 0) + 1

    current_user.location_type = "deep-space"
    current_user.location_id = int(system.id)
    _capture_safe_checkpoint(ship, current_user)

    transfer_distance_km = _distance_between_points(
        source_x=origin_x,
        source_y=origin_y,
        source_z=origin_z,
        target_x=ship.position_x,
        target_y=ship.position_y,
        target_z=ship.position_z,
    )

    db.commit()
    db.refresh(ship)
    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="local-transfer",
        cost_credits=0,
        details=(
            f"Transferred to {contact_type} {target_name} ({contact_id}) "
            f"over {transfer_distance_km:.1f}km"
        ),
        db=db,
    )
    return _to_ship_response(ship, db)


@router.post("/{ship_id}/crash-recovery", response_model=ShipResponse)
def recover_ship_from_crash(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore ship and player location to latest safe checkpoint snapshot."""

    ship = _get_ship_for_user(ship_id, current_user, db)
    _restore_ship_to_safe_checkpoint(ship, current_user)

    ship.crash_recovery_count = int(ship.crash_recovery_count or 0) + 1
    ship.version = (ship.version or 0) + 1
    db.commit()
    db.refresh(ship)
    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="crash-recovery",
        cost_credits=0,
        details=(
            "Recovered ship to latest safe checkpoint "
            f"recorded at {ship.last_safe_recorded_at.isoformat() if ship.last_safe_recorded_at else 'unknown time'}"
        ),
        db=db,
    )
    return _to_ship_response(ship, db)


@router.post("/{ship_id}/collision-check", response_model=CollisionCheckResponse)
def check_ship_collision(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Evaluate nearest collision candidate and apply impact outcomes."""

    ship = _get_ship_for_user(ship_id, current_user, db)
    if not settings.flight_collision_enabled:
        return CollisionCheckResponse(
            ship=_to_ship_response(ship, db),
            collision=False,
            severity="none",
            object_type=None,
            object_id=None,
            object_name=None,
            distance_km=None,
            shields_damage=0,
            hull_damage=0,
            recovered=False,
            message="Collision monitor disabled",
        )

    if ship.status != "in-space" or ship.docked_station_id is not None:
        return CollisionCheckResponse(
            ship=_to_ship_response(ship, db),
            collision=False,
            severity="none",
            object_type=None,
            object_id=None,
            object_name=None,
            distance_km=None,
            shields_damage=0,
            hull_damage=0,
            recovered=False,
            message="Collision checks active only while in-space",
        )

    if _collision_on_cooldown(ship=ship, user=current_user, db=db):
        return CollisionCheckResponse(
            ship=_to_ship_response(ship, db),
            collision=False,
            severity="none",
            object_type=None,
            object_id=None,
            object_name=None,
            distance_km=None,
            shields_damage=0,
            hull_damage=0,
            recovered=False,
            message="Collision monitor cooldown active",
        )

    if _collision_undock_grace_active(ship=ship, user=current_user, db=db):
        return CollisionCheckResponse(
            ship=_to_ship_response(ship, db),
            collision=False,
            severity="none",
            object_type=None,
            object_id=None,
            object_name=None,
            distance_km=None,
            shields_damage=0,
            hull_damage=0,
            recovered=False,
            message=(
                "Collision monitor undock grace active "
                f"({UNDOCK_COLLISION_GRACE_SECONDS}s)"
            ),
        )

    nearest_candidate = _nearest_collision_candidate(
        ship=ship,
        user=current_user,
        db=db,
    )
    if nearest_candidate is None:
        return CollisionCheckResponse(
            ship=_to_ship_response(ship, db),
            collision=False,
            severity="none",
            object_type=None,
            object_id=None,
            object_name=None,
            distance_km=None,
            shields_damage=0,
            hull_damage=0,
            recovered=False,
            message="Collision monitor has no nearby candidates",
        )

    object_type = str(nearest_candidate["object_type"])
    object_id = str(nearest_candidate["object_id"])
    object_name = str(nearest_candidate["object_name"])
    distance_km = float(nearest_candidate["distance_km"])
    diagnostics_fragment = _collision_diagnostics_fragment(nearest_candidate)

    if _docking_safety_corridor_active(
        ship=ship,
        object_type=object_type,
        object_id=object_id,
        distance_km=distance_km,
    ):
        return CollisionCheckResponse(
            ship=_to_ship_response(ship, db),
            collision=False,
            severity="none",
            object_type=object_type,
            object_id=object_id,
            object_name=object_name,
            distance_km=round(distance_km, 2),
            shields_damage=0,
            hull_damage=0,
            recovered=False,
            message=(
                "Docking computer safety corridor active "
                f"({object_name} at {distance_km:.1f}km) · {diagnostics_fragment}"
            ),
        )

    latest_undock = _latest_undock_log(ship=ship, user=current_user, db=db)
    if latest_undock is not None and latest_undock.created_at is not None:
        undock_time = latest_undock.created_at
        if undock_time.tzinfo is None:
            undock_time = undock_time.replace(tzinfo=timezone.utc)

        immunity_until = undock_time + timedelta(
            seconds=UNDOCK_ORIGIN_STATION_IMMUNITY_SECONDS
        )
        origin_station_name = _undock_origin_station_from_details(
            latest_undock.details
        )
        if (
            datetime.now(timezone.utc) < immunity_until
            and object_type == "station"
            and origin_station_name is not None
            and object_name == origin_station_name
            and distance_km <= UNDOCK_ORIGIN_STATION_IMMUNITY_DISTANCE_KM
        ):
            return CollisionCheckResponse(
                ship=_to_ship_response(ship, db),
                collision=False,
                severity="none",
                object_type=object_type,
                object_id=object_id,
                object_name=object_name,
                distance_km=round(distance_km, 2),
                shields_damage=0,
                hull_damage=0,
                recovered=False,
                message=(
                    "Collision monitor origin-station immunity active "
                    f"({object_name} at {distance_km:.1f}km) · {diagnostics_fragment}"
                ),
            )

    severity = _collision_classification(
        object_type=object_type,
        distance_km=distance_km,
    )

    if severity == "none":
        return CollisionCheckResponse(
            ship=_to_ship_response(ship, db),
            collision=False,
            severity="none",
            object_type=object_type,
            object_id=object_id,
            object_name=object_name,
            distance_km=round(distance_km, 2),
            shields_damage=0,
            hull_damage=0,
            recovered=False,
            message=(
                "No impact detected near "
                f"{object_name} ({distance_km:.1f}km) · {diagnostics_fragment}"
            ),
        )

    shields_damage, hull_damage = _apply_collision_damage(
        ship=ship,
        object_type=object_type,
        severity=severity,
    )

    recovered = False
    destruction_triggered = severity == "critical" and ship.hull_current <= 0
    if destruction_triggered:
        if ship.last_safe_recorded_at is not None:
            _restore_ship_to_safe_checkpoint(ship, current_user)
            ship.crash_recovery_count = int(ship.crash_recovery_count or 0) + 1
            ship.hull_current = max(
                int(ship.hull_current or 0), max(ship.hull_max // 2, 1))
            recovered = True

    resolved_outcome = _resolve_collision_outcome(
        object_type=object_type,
        severity=severity,
        recovered=recovered,
        destruction_triggered=destruction_triggered,
    )
    sfx_event_keys = _collision_sfx_event_keys(
        severity=severity,
        object_type=object_type,
        destruction_triggered=destruction_triggered,
        recovered=recovered,
    )

    ship.version = (ship.version or 0) + 1
    _record_ship_operation(
        ship=ship,
        user=current_user,
        operation="collision",
        cost_credits=0,
        details=(
            f"{severity} impact with {object_type} {object_name} "
            f"at {distance_km:.1f}km; shields -{shields_damage}, hull -{hull_damage}; "
            f"{diagnostics_fragment}"
        ),
        db=db,
    )

    if recovered:
        _record_ship_operation(
            ship=ship,
            user=current_user,
            operation="crash-recovery",
            cost_credits=0,
            details=(
                "Recovered ship after critical collision using latest safe "
                "checkpoint"
            ),
            db=db,
        )

    db.refresh(ship)
    return CollisionCheckResponse(
        ship=_to_ship_response(ship, db),
        collision=True,
        severity=severity,
        object_type=object_type,
        object_id=object_id,
        object_name=object_name,
        collision_context_type=object_type,
        resolved_outcome=resolved_outcome,
        destruction_triggered=destruction_triggered,
        distance_km=round(distance_km, 2),
        shields_damage=shields_damage,
        hull_damage=hull_damage,
        sfx_event_keys=sfx_event_keys,
        recovered=recovered,
        message=(
            f"{severity.title()} impact: {object_name} ({distance_km:.1f}km) · "
            f"{diagnostics_fragment}"
            + (" · checkpoint recovery complete" if recovered else "")
        ),
    )


@router.post("/{ship_id}/flight-state", response_model=ShipResponse)
def update_flight_state(
    ship_id: int,
    payload: FlightStateUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist transient flight state so UI can recover after refresh."""

    ship = _get_ship_for_user(ship_id, current_user, db)
    _validate_flight_state_update(ship=ship, payload=payload, db=db)

    phase = normalize_flight_phase(payload.flight_phase.value)
    locked_destination_station_id = payload.flight_locked_destination_station_id
    locked_destination_contact_type = payload.flight_locked_destination_contact_type
    locked_destination_contact_id = payload.flight_locked_destination_contact_id

    if (
        locked_destination_station_id is None
        and (locked_destination_contact_type or "").strip().lower() == "station"
        and locked_destination_contact_id is not None
    ):
        locked_destination_station_id = locked_destination_contact_id

    if phase == FlightPhase.ARRIVED:
        phase = FlightPhase.IDLE
        locked_destination_station_id = None
        locked_destination_contact_type = None
        locked_destination_contact_id = None

    _set_flight_state(
        ship=ship,
        phase=phase,
        locked_destination_station_id=locked_destination_station_id,
        locked_destination_contact_type=locked_destination_contact_type,
        locked_destination_contact_id=locked_destination_contact_id,
    )
    ship.version = (ship.version or 0) + 1

    db.commit()
    db.refresh(ship)
    return _to_ship_response(ship, db)


@router.post("/{ship_id}/position-sync", response_model=ShipResponse)
def sync_ship_position(
    ship_id: int,
    payload: ShipPositionSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist ship position updates during active in-space flight."""

    ship = _get_ship_for_user(ship_id, current_user, db)

    if ship.status != "in-space":
        raise HTTPException(
            status_code=409,
            detail="Ship must be in-space for position sync",
        )

    ship.position_x = int(payload.position_x)
    ship.position_y = int(payload.position_y)
    ship.position_z = int(payload.position_z)
    ship.version = (ship.version or 0) + 1

    db.commit()
    db.refresh(ship)
    return _to_ship_response(ship, db)


@router.get("/{ship_id}/cargo", response_model=ShipCargoResponse)
def get_ship_cargo(ship_id: int, db: Session = Depends(get_db)):
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    rows = (
        db.query(ShipCargo, Commodity)
        .join(Commodity, ShipCargo.commodity_id == Commodity.id)
        .filter(ShipCargo.ship_id == ship_id, ShipCargo.quantity > 0)
        .all()
    )

    items = [
        CargoItem(
            commodity_id=cargo.commodity_id,
            commodity_name=commodity.name,
            quantity=cargo.quantity,
        )
        for cargo, commodity in rows
    ]
    cargo_used = sum(item.quantity for item in items)
    cargo_free = max(ship.cargo_capacity - cargo_used, 0)

    return ShipCargoResponse(
        ship_id=ship.id,
        cargo_capacity=ship.cargo_capacity,
        cargo_used=cargo_used,
        cargo_free=cargo_free,
        items=items,
    )
