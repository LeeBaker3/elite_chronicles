import hashlib
import math
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.ship import Ship
from app.models.user import User
from app.models.world import (
    CelestialBody,
    StarSystem,
    Station,
    StationArchetype,
    SystemPoliticalState,
)
from app.schemas.systems import (
    GalaxyDatasetSource,
    GalaxyOverviewJump,
    GalaxyOverviewPlanetSummary,
    GalaxyOverviewStationSummary,
    GalaxyOverviewSummary,
    GalaxyOverviewSystem,
    GalaxySystemEntry,
    GalaxySystemOverviewResponse,
    GalaxySystemsResponse,
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
GALAXY_VIEW_MODES = {"galaxy", "local_reachable"}
GALAXY_DATASET_MODES = {"canonical", "real_inspired"}
JUMP_BASE_FUEL_COST = 20
MIN_HYPERSPACE_RANGE_UNITS = 120.0
HYPERSPACE_RANGE_UNITS_PER_FUEL_CAP = 4.0


def _resolve_dataset_source(dataset_mode: str) -> GalaxyDatasetSource:
    """Return normalized dataset source metadata for galaxy endpoints."""

    if dataset_mode == "real_inspired":
        return GalaxyDatasetSource(
            mode="real_inspired",
            source_name="catalog-hybrid-placeholder",
            license_type="best-effort-source-governed",
            source_version="v0",
            generated_at=datetime.now(UTC),
        )

    return GalaxyDatasetSource(
        mode="canonical",
        source_name="elite-canonical",
        license_type="internal",
        source_version="v1",
        generated_at=datetime.now(UTC),
    )


def _distance_between_systems(
    origin: StarSystem,
    destination: StarSystem,
) -> float:
    """Return Euclidean distance between two systems in chart units."""

    dx = float((destination.position_x or 0) - (origin.position_x or 0))
    dy = float((destination.position_y or 0) - (origin.position_y or 0))
    dz = float((destination.position_z or 0) - (origin.position_z or 0))
    return math.sqrt((dx * dx) + (dy * dy) + (dz * dz))


def _ship_max_hyperspace_range_units(ship: Ship) -> float:
    """Return deterministic max hyperspace range for one ship."""

    fuel_cap = max(1, int(ship.fuel_cap or 1))
    return max(
        MIN_HYPERSPACE_RANGE_UNITS,
        float(fuel_cap) * HYPERSPACE_RANGE_UNITS_PER_FUEL_CAP,
    )


def _estimate_jump_fuel_from_distance(
    *,
    distance_units: float,
    max_range_units: float,
) -> int:
    """Return deterministic estimated fuel for one jump leg."""

    fuel_fraction = distance_units / max_range_units if max_range_units > 0 else 1.0
    return max(1, min(100, int(math.ceil(fuel_fraction * JUMP_BASE_FUEL_COST))))


def _build_multihop_route(
    *,
    origin: StarSystem,
    destination: StarSystem,
    systems: list[StarSystem],
    ship: Ship,
) -> tuple[list[int], list[str], int] | None:
    """Return shortest-hop route suggestion when direct jump is not reachable."""

    origin_id = int(origin.id)
    destination_id = int(destination.id)
    if origin_id == destination_id:
        return ([], [], 0)

    max_range_units = _ship_max_hyperspace_range_units(ship)
    system_by_id = {int(system.id): system for system in systems}
    if origin_id not in system_by_id or destination_id not in system_by_id:
        return None

    adjacency: dict[int, list[int]] = {
        int(system.id): [] for system in systems}
    sorted_ids = sorted(adjacency.keys())
    for left_index, left_id in enumerate(sorted_ids):
        left_system = system_by_id[left_id]
        for right_id in sorted_ids[left_index + 1:]:
            right_system = system_by_id[right_id]
            distance = _distance_between_systems(left_system, right_system)
            if distance <= max_range_units:
                adjacency[left_id].append(right_id)
                adjacency[right_id].append(left_id)

    queue: list[list[int]] = [[origin_id]]
    visited: set[int] = {origin_id}
    route_ids: list[int] | None = None

    while queue:
        path = queue.pop(0)
        current_id = path[-1]
        if current_id == destination_id:
            route_ids = path
            break

        for next_id in adjacency.get(current_id, []):
            if next_id in visited:
                continue
            visited.add(next_id)
            queue.append([*path, next_id])

    if route_ids is None or len(route_ids) < 2:
        return None

    hop_ids = route_ids[1:]
    hop_names: list[str] = []
    total_estimated_fuel = 0
    previous_id = origin_id
    for hop_id in hop_ids:
        previous_system = system_by_id[previous_id]
        hop_system = system_by_id[hop_id]
        hop_names.append(str(hop_system.name))
        distance = _distance_between_systems(previous_system, hop_system)
        total_estimated_fuel += _estimate_jump_fuel_from_distance(
            distance_units=distance,
            max_range_units=max_range_units,
        )
        previous_id = hop_id

    return (hop_ids, hop_names, total_estimated_fuel)


def _estimate_system_population(system: StarSystem) -> int:
    """Return deterministic estimated population for a star system."""

    tech_level = int(system.tech_level or 0)
    seed_component = int(system.id or 0) % 97
    return int(120_000 + (tech_level * 260_000) + (seed_component * 11_000))


def _derive_system_government(
    *,
    system: StarSystem,
    political_state: SystemPoliticalState | None,
) -> str:
    """Return one normalized government label for chart and overview payloads."""

    if political_state is not None:
        security = str(political_state.security_level or "").strip().lower()
        if security == "high":
            return "Confederacy"
        if security == "medium":
            return "Democracy"
        if security == "low":
            return "Anarchy"

    economy = str(system.economy_type or "mixed").strip().lower()
    if "agri" in economy:
        return "Confederacy"
    if "indust" in economy:
        return "Corporate State"
    if "high" in economy or "tech" in economy:
        return "Democracy"
    return "Confederacy"


def _resolve_ship_for_current_user(
    *,
    db: Session,
    current_user: User,
    ship_id: int,
) -> Ship:
    """Resolve one ship ensuring ownership for authenticated user."""

    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if ship is None:
        raise HTTPException(status_code=404, detail="Ship not found")
    if int(ship.owner_user_id) != int(current_user.id):
        raise HTTPException(status_code=403, detail="Ship access denied")
    return ship


def _resolve_ship_current_system(
    *,
    db: Session,
    ship: Ship,
    current_user: User,
) -> StarSystem:
    """Resolve current star system via docking or user deep-space state."""

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

    if current_user.location_type == "deep-space" and current_user.location_id is not None:
        deep_space_system = (
            db.query(StarSystem)
            .filter(StarSystem.id == current_user.location_id)
            .first()
        )
        if deep_space_system is not None:
            return deep_space_system

    fallback_system = db.query(StarSystem).order_by(
        StarSystem.id.asc()).first()
    if fallback_system is None:
        raise HTTPException(
            status_code=404, detail="No star systems available")
    return fallback_system


def _compute_jump_profile(
    *,
    ship: Ship,
    origin: StarSystem,
    destination: StarSystem,
) -> tuple[bool, int | None, str | None]:
    """Return reachability, estimated fuel, and reason for one origin-destination pair."""

    dx = float((destination.position_x or 0) - (origin.position_x or 0))
    dy = float((destination.position_y or 0) - (origin.position_y or 0))
    dz = float((destination.position_z or 0) - (origin.position_z or 0))
    distance_units = math.sqrt((dx * dx) + (dy * dy) + (dz * dz))

    fuel_cap = max(1, int(ship.fuel_cap or 1))
    fuel_current = max(0, int(ship.fuel_current or 0))
    max_range_units = max(
        MIN_HYPERSPACE_RANGE_UNITS,
        float(fuel_cap) * HYPERSPACE_RANGE_UNITS_PER_FUEL_CAP,
    )
    fuel_ratio = min(1.0, max(0.0, float(fuel_current) / float(fuel_cap)))
    available_range_units = max_range_units * fuel_ratio

    if int(origin.id) == int(destination.id):
        return True, 0, None

    fuel_fraction = distance_units / max_range_units if max_range_units > 0 else 1.0
    estimated_fuel = max(
        1, min(100, int(math.ceil(fuel_fraction * JUMP_BASE_FUEL_COST))))

    if distance_units > max_range_units:
        return False, estimated_fuel, "range-limit"
    if distance_units > available_range_units or estimated_fuel > fuel_current:
        return False, estimated_fuel, "insufficient-fuel"
    return True, estimated_fuel, None


@router.get("/galaxy/systems", response_model=GalaxySystemsResponse)
def get_galaxy_systems(
    ship_id: int = Query(..., ge=1),
    view_mode: str = Query("galaxy"),
    include_unreachable: bool = Query(True),
    dataset_mode: str = Query("canonical"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return full-galaxy or local-reachable system list for chart navigation."""

    normalized_view_mode = str(view_mode or "galaxy").strip().lower()
    if normalized_view_mode not in GALAXY_VIEW_MODES:
        raise HTTPException(status_code=422, detail="Invalid view_mode")

    normalized_dataset_mode = str(dataset_mode or "canonical").strip().lower()
    if normalized_dataset_mode not in GALAXY_DATASET_MODES:
        raise HTTPException(status_code=422, detail="Invalid dataset_mode")

    ship = _resolve_ship_for_current_user(
        db=db,
        current_user=current_user,
        ship_id=ship_id,
    )
    current_system = _resolve_ship_current_system(
        db=db,
        ship=ship,
        current_user=current_user,
    )

    political_states = {
        int(state.system_id): state
        for state in db.query(SystemPoliticalState).all()
    }
    systems = db.query(StarSystem).order_by(StarSystem.id.asc()).all()

    entries: list[GalaxySystemEntry] = []
    for system in systems:
        reachable, estimated_fuel, reason = _compute_jump_profile(
            ship=ship,
            origin=current_system,
            destination=system,
        )
        if normalized_view_mode == "local_reachable" and not reachable:
            continue
        if normalized_view_mode == "galaxy" and not include_unreachable and not reachable:
            continue

        entries.append(
            GalaxySystemEntry(
                system_id=int(system.id),
                name=str(system.name),
                x=int(system.position_x or 0),
                y=int(system.position_y or 0),
                z=int(system.position_z or 0),
                economy=str(system.economy_type or "mixed"),
                government=_derive_system_government(
                    system=system,
                    political_state=political_states.get(int(system.id)),
                ),
                tech_level=int(system.tech_level or 0),
                population=_estimate_system_population(system),
                reachable_from_current=reachable,
                estimated_jump_fuel=estimated_fuel,
                reachability_reason=reason,
            )
        )

    return GalaxySystemsResponse(
        current_system_id=int(current_system.id),
        view_mode=normalized_view_mode,
        dataset_source=_resolve_dataset_source(normalized_dataset_mode),
        systems=entries,
    )


@router.get(
    "/galaxy/systems/{system_id}/overview",
    response_model=GalaxySystemOverviewResponse,
)
def get_galaxy_system_overview(
    system_id: int,
    ship_id: int = Query(..., ge=1),
    dataset_mode: str = Query("canonical"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return one system overview including generated planets and stations."""

    normalized_dataset_mode = str(dataset_mode or "canonical").strip().lower()
    if normalized_dataset_mode not in GALAXY_DATASET_MODES:
        raise HTTPException(status_code=422, detail="Invalid dataset_mode")

    target_system = db.query(StarSystem).filter(
        StarSystem.id == system_id).first()
    if target_system is None:
        raise HTTPException(status_code=404, detail="Star system not found")

    ship = _resolve_ship_for_current_user(
        db=db,
        current_user=current_user,
        ship_id=ship_id,
    )
    current_system = _resolve_ship_current_system(
        db=db,
        ship=ship,
        current_user=current_user,
    )
    reachable, estimated_fuel, reason = _compute_jump_profile(
        ship=ship,
        origin=current_system,
        destination=target_system,
    )

    route_hops: list[int] = []
    route_hop_names: list[str] = []
    route_total_estimated_fuel: int | None = None
    if not reachable:
        systems = db.query(StarSystem).order_by(StarSystem.id.asc()).all()
        route = _build_multihop_route(
            origin=current_system,
            destination=target_system,
            systems=systems,
            ship=ship,
        )
        if route is not None:
            route_hops, route_hop_names, route_total_estimated_fuel = route

    bodies = ensure_system_bodies(system=target_system, db=db)
    body_name_by_id = {int(body.id): str(body.name) for body in bodies}
    planets = [body for body in bodies if body.body_kind == "planet"]
    moons = [body for body in bodies if body.body_kind == "moon"]

    stations = (
        db.query(Station)
        .filter(Station.system_id == target_system.id)
        .order_by(Station.id.asc())
        .all()
    )
    archetypes = {
        int(archetype.id): archetype
        for archetype in db.query(StationArchetype).all()
    }

    political_state = (
        db.query(SystemPoliticalState)
        .filter(SystemPoliticalState.system_id == target_system.id)
        .first()
    )

    return GalaxySystemOverviewResponse(
        dataset_source=_resolve_dataset_source(normalized_dataset_mode),
        system=GalaxyOverviewSystem(
            id=int(target_system.id),
            name=str(target_system.name),
            economy=str(target_system.economy_type or "mixed"),
            government=_derive_system_government(
                system=target_system,
                political_state=political_state,
            ),
            tech_level=int(target_system.tech_level or 0),
            population=_estimate_system_population(target_system),
        ),
        jump=GalaxyOverviewJump(
            reachable=reachable,
            estimated_jump_fuel=estimated_fuel,
            reason=reason,
            route_hops=route_hops,
            route_hop_names=route_hop_names,
            route_total_estimated_fuel=route_total_estimated_fuel,
        ),
        overview=GalaxyOverviewSummary(
            planets_total=len(planets),
            moons_total=len(moons),
            stations_total=len(stations),
            planets=[
                GalaxyOverviewPlanetSummary(
                    name=str(planet.name),
                    body_type=str(planet.body_type),
                    orbit_index=int(planet.orbit_index or 0),
                )
                for planet in sorted(planets, key=lambda body: int(body.orbit_index or 0))
            ],
            stations=[
                GalaxyOverviewStationSummary(
                    name=str(station.name),
                    archetype=(
                        str(archetypes[int(station.archetype_id)].name)
                        if int(station.archetype_id) in archetypes
                        else None
                    ),
                    host_body_name=(
                        body_name_by_id.get(int(station.host_body_id))
                        if station.host_body_id is not None
                        else None
                    ),
                )
                for station in stations
            ],
        ),
    )


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

    locked_contact_type = str(
        ship.flight_locked_destination_contact_type or "").strip().lower()
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
            db.query(CelestialBody.id, CelestialBody.system_id,
                     CelestialBody.body_kind)
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


def _canonical_local_body_name(
    *,
    system_name: str,
    body: CelestialBody,
    body_by_id: dict[int, CelestialBody],
) -> str:
    """Return canonical local chart name for one celestial body."""

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
    body_by_id = {int(body.id): body for body in bodies}
    body_entries = [
        LocalChartBody(
            id=body.id,
            body_kind=body.body_kind,
            body_type=body.body_type,
            name=_canonical_local_body_name(
                system_name=str(system.name),
                body=body,
                body_by_id=body_by_id,
            ),
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
