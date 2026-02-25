import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.ship import Ship
from app.models.user import User
from app.models.world import CelestialBody, StarSystem, Station
from app.schemas.systems import (
    LocalChartBody,
    LocalChartMutableState,
    LocalChartResponse,
    LocalChartStation,
    LocalChartSystemSummary,
)
from app.services.celestial_generation_service import ensure_system_bodies
from app.services.system_simulation_service import catch_up_system_simulation

router = APIRouter()
LOCAL_CHART_CONTRACT_VERSION = "local-chart.v1"


def _build_audio_event_hints(
    *,
    flight_phase: str,
    local_target_status: str,
) -> list[str]:
    """Return deterministic audio hint keys for current local chart context."""

    hints: list[str] = []
    if local_target_status == "in-system-locked":
        hints.append("nav.target_locked")

    if flight_phase == "docking-approach":
        hints.append("nav.approach_ready")
    elif flight_phase == "charging":
        hints.append("jump.charge_start")
    elif flight_phase == "jumping":
        hints.append("jump.transit_peak")
    elif flight_phase == "arrived":
        hints.append("jump.exit")

    return hints


def _resolve_local_target_state(
    *,
    db: Session,
    current_user: User,
    system_id: int,
) -> tuple[str, datetime | None, str | None, str | None, str, list[str]]:
    """Resolve local target metadata for the requesting player's primary ship."""

    ship = (
        db.query(Ship)
        .filter(Ship.owner_user_id == current_user.id)
        .order_by(Ship.id.asc())
        .first()
    )
    if ship is None:
        flight_phase = "idle"
        local_target_status = "none"
        return (
            flight_phase,
            None,
            None,
            None,
            local_target_status,
            _build_audio_event_hints(
                flight_phase=flight_phase,
                local_target_status=local_target_status,
            ),
        )

    flight_phase = str(ship.flight_phase or "idle")
    transition_started_at = ship.flight_phase_started_at
    local_target_contact_type: str | None = None
    local_target_contact_id: str | None = None
    local_target_status = "none"

    locked_contact_type = str(ship.flight_locked_destination_contact_type or "").strip().lower()
    locked_contact_id = int(ship.flight_locked_destination_contact_id or 0)
    locked_station_id = ship.flight_locked_destination_station_id

    if locked_contact_type in {"station", "planet", "moon", "star"} and locked_contact_id > 0:
        local_target_contact_type = locked_contact_type
        local_target_contact_id = f"{locked_contact_type}-{locked_contact_id}"

    elif locked_station_id is not None:
        local_target_contact_type = "station"
        local_target_contact_id = f"station-{int(locked_station_id)}"

    if local_target_contact_type == "station" and locked_station_id is not None:
        station = (
            db.query(Station.id, Station.system_id)
            .filter(Station.id == locked_station_id)
            .first()
        )
        if station is None:
            local_target_contact_id = None
            local_target_contact_type = None
            local_target_status = "unknown-target"
        elif int(station.system_id) == int(system_id):
            local_target_status = "in-system-locked"
        else:
            local_target_contact_id = None
            local_target_status = "out-of-system-locked"
    elif local_target_contact_type in {"planet", "moon", "star"} and locked_contact_id > 0:
        body = (
            db.query(CelestialBody.id, CelestialBody.system_id, CelestialBody.body_kind)
            .filter(CelestialBody.id == locked_contact_id)
            .first()
        )
        if body is None:
            local_target_contact_id = None
            local_target_contact_type = None
            local_target_status = "unknown-target"
        elif str(body.body_kind) != local_target_contact_type:
            local_target_contact_id = None
            local_target_contact_type = None
            local_target_status = "unknown-target"
        elif int(body.system_id) == int(system_id):
            local_target_status = "in-system-locked"
        else:
            local_target_contact_id = None
            local_target_status = "out-of-system-locked"

    return (
        flight_phase,
        transition_started_at,
        local_target_contact_type,
        local_target_contact_id,
        local_target_status,
        _build_audio_event_hints(
            flight_phase=flight_phase,
            local_target_status=local_target_status,
        ),
    )


def _body_sort_key(body: LocalChartBody) -> tuple[int, int, int]:
    """Return deterministic chart body ordering key."""

    return (
        int(body.parent_body_id or 0),
        int(body.orbit_index),
        int(body.id),
    )


@router.get("/{system_id}/local-chart", response_model=LocalChartResponse)
def get_local_chart(
    system_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return deterministic local chart payload for one star system."""

    system = db.query(StarSystem).filter(StarSystem.id == system_id).first()
    if system is None:
        raise HTTPException(status_code=404, detail="Star system not found")

    bodies = ensure_system_bodies(system=system, db=db)
    body_entries = [
        LocalChartBody(
            id=body.id,
            body_kind=body.body_kind,
            body_type=body.body_type,
            name=body.name,
            generation_version=int(body.generation_version),
            parent_body_id=body.parent_body_id,
            orbit_index=int(body.orbit_index),
            orbit_radius_km=int(body.orbit_radius_km),
            radius_km=int(body.radius_km),
            position_x=int(body.position_x),
            position_y=int(body.position_y),
            position_z=int(body.position_z),
            render_profile=body.render_profile or {},
        )
        for body in bodies
    ]

    star = next(
        (entry for entry in body_entries if entry.body_kind == "star"), None)
    if star is None:
        raise HTTPException(
            status_code=500, detail="Star system generation invalid")

    planets = sorted(
        [entry for entry in body_entries if entry.body_kind == "planet"],
        key=_body_sort_key,
    )

    moons_by_parent_body_id: dict[str, list[LocalChartBody]] = {}
    moon_entries = sorted(
        [entry for entry in body_entries if entry.body_kind == "moon"],
        key=_body_sort_key,
    )
    for moon in moon_entries:
        key = str(moon.parent_body_id or 0)
        moons_by_parent_body_id.setdefault(key, []).append(moon)

    stations = (
        db.query(Station)
        .filter(Station.system_id == system.id)
        .order_by(Station.id.asc())
        .all()
    )
    station_entries = [
        LocalChartStation(
            id=station.id,
            name=station.name,
            host_body_id=station.host_body_id,
            orbit_radius_km=station.orbit_radius_km,
            orbit_phase_deg=station.orbit_phase_deg,
            position_x=int(station.position_x),
            position_y=int(station.position_y),
            position_z=int(station.position_z),
        )
        for station in stations
    ]

    simulation_state, political_state = catch_up_system_simulation(
        db=db,
        system=system,
    )
    (
        flight_phase,
        transition_started_at,
        local_target_contact_type,
        local_target_contact_id,
        local_target_status,
        audio_event_hints,
    ) = _resolve_local_target_state(
        db=db,
        current_user=current_user,
        system_id=int(system.id),
    )

    return LocalChartResponse(
        system=LocalChartSystemSummary(
            id=system.id,
            name=system.name,
            generation_version=int(system.generation_version or 1),
            seed_hash=hashlib.sha256(
                (system.seed or "").encode("utf-8")).hexdigest()[:12],
            contract_version=LOCAL_CHART_CONTRACT_VERSION,
        ),
        star=star,
        planets=planets,
        moons_by_parent_body_id=moons_by_parent_body_id,
        stations=station_entries,
        mutable_state=LocalChartMutableState(
            economy_tick_cursor=int(
                simulation_state.economy_tick_cursor if simulation_state else 0
            ),
            politics_tick_cursor=int(
                simulation_state.politics_tick_cursor if simulation_state else 0
            ),
            last_economy_tick_at=(
                simulation_state.last_economy_tick_at if simulation_state else None
            ),
            last_politics_tick_at=(
                simulation_state.last_politics_tick_at if simulation_state else None
            ),
            security_level=(
                political_state.security_level if political_state else "medium"
            ),
            stability_score=int(
                political_state.stability_score if political_state else 50
            ),
            flight_phase=flight_phase,
            transition_started_at=transition_started_at,
            local_target_contact_type=local_target_contact_type,
            local_target_contact_id=local_target_contact_id,
            local_target_status=local_target_status,
            audio_event_hints=audio_event_hints,
        ),
    )
