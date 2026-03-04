from datetime import datetime
from datetime import timedelta
from datetime import timezone

from app.models.world import CelestialBody
from app.models.world import Faction
from app.models.world import Station
from app.models.world import StationArchetype
from app.models.world import StationInventory
from app.models.world import StarSystem
from app.models.world import SystemPoliticalState
from app.models.world import SystemSimulationState
from app.models.user import User
from app.models.ship import Ship
from app.services.system_simulation_service import MAX_ECONOMY_TICKS_PER_READ
from app.services.system_simulation_service import MAX_POLITICS_TICKS_PER_READ

from test_players_ships_markets import auth_headers_for, seed_core_state


def test_local_contacts_are_deterministic_for_same_system(client, db_session):
    headers = auth_headers_for(
        client, "det-contacts@example.com", "det-contacts")
    owner = db_session.query(User).filter(
        User.email == "det-contacts@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock.status_code == 200

    first_response = client.get(
        f"/api/ships/{state['ship_id']}/local-contacts",
        headers=headers,
    )
    second_response = client.get(
        f"/api/ships/{state['ship_id']}/local-contacts",
        headers=headers,
    )
    assert first_response.status_code == 200
    assert second_response.status_code == 200

    first_payload = first_response.json()
    second_payload = second_response.json()

    assert first_payload["generation_version"] == second_payload["generation_version"]

    first_contacts = [
        (
            entry["id"],
            entry["contact_type"],
            entry["name"],
            entry.get("body_type"),
            entry.get("radius_km"),
            entry.get("orbit_radius_km"),
            entry.get("parent_body_id"),
            entry.get("host_body_id"),
            entry["distance_km"],
        )
        for entry in first_payload["contacts"]
        if entry["contact_type"] in {"star", "planet", "station"}
    ]
    second_contacts = [
        (
            entry["id"],
            entry["contact_type"],
            entry["name"],
            entry.get("body_type"),
            entry.get("radius_km"),
            entry.get("orbit_radius_km"),
            entry.get("parent_body_id"),
            entry.get("host_body_id"),
            entry["distance_km"],
        )
        for entry in second_payload["contacts"]
        if entry["contact_type"] in {"star", "planet", "station"}
    ]
    assert first_contacts == second_contacts


def test_system_local_chart_returns_deterministic_body_and_station_contract(
    client,
    db_session,
):
    headers = auth_headers_for(client, "chart@example.com", "chart")
    owner = db_session.query(User).filter(
        User.email == "chart@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["system"]["id"] == state["system_id"]
    assert payload["system"]["name"] == "Core System"
    assert payload["system"]["generation_version"] == 1
    assert isinstance(payload["system"]["seed_hash"], str)
    assert len(payload["system"]["seed_hash"]) == 12
    assert payload["system"]["contract_version"] == "local-chart.v1"

    star = payload["star"]
    assert star["body_kind"] == "star"
    assert star["generation_version"] == 1

    planets = payload["planets"]
    assert planets
    planet_ids = {entry["id"] for entry in planets}
    planet_orbit_radii = [int(planet["orbit_radius_km"]) for planet in planets]
    assert min(planet_orbit_radii) >= 1_000_000
    assert planet_orbit_radii == sorted(planet_orbit_radii)
    for planet in planets:
        assert planet["body_kind"] == "planet"
        assert planet["radius_km"] > 0
        assert planet["body_type"]

    for moons in payload["moons_by_parent_body_id"].values():
        for moon in moons:
            assert moon["orbit_radius_km"] >= 50_000
            assert moon["orbit_radius_km"] <= 3_500_000

    for station in payload["stations"]:
        assert station["id"] in {
            state["station_1_id"],
            state["station_2_id"],
            state["station_3_id"],
        }
        assert station["host_body_id"] in planet_ids
        assert station["orbit_radius_km"] is not None
        assert station["orbit_phase_deg"] is not None

    assert "economy_tick_cursor" in payload["mutable_state"]
    assert "politics_tick_cursor" in payload["mutable_state"]
    assert payload["mutable_state"]["flight_phase"]
    assert "local_target_status" in payload["mutable_state"]
    assert isinstance(payload["mutable_state"]["audio_event_hints"], list)


def test_system_local_chart_exposes_in_system_target_metadata(
    client,
    db_session,
):
    headers = auth_headers_for(
        client, "chart-target@example.com", "chart-target")
    owner = db_session.query(User).filter(
        User.email == "chart-target@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    ship = (
        db_session.query(Ship)
        .filter(Ship.owner_user_id == owner.id)
        .order_by(Ship.id.asc())
        .first()
    )
    assert ship is not None
    ship.flight_phase = "docking-approach"
    ship.flight_locked_destination_station_id = state["station_1_id"]
    db_session.commit()

    response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    mutable_state = payload["mutable_state"]

    assert mutable_state["flight_phase"] == "docking-approach"
    assert mutable_state["local_target_contact_type"] == "station"
    assert mutable_state["local_target_contact_id"] == f"station-{state['station_1_id']}"
    assert mutable_state["local_target_status"] == "in-system-locked"
    assert "nav.target_locked" in mutable_state["audio_event_hints"]
    assert "nav.approach_ready" in mutable_state["audio_event_hints"]


def test_system_local_chart_exposes_out_of_system_target_metadata(
    client,
    db_session,
):
    headers = auth_headers_for(
        client, "chart-target-out@example.com", "chart-target-out")
    owner = db_session.query(User).filter(
        User.email == "chart-target-out@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    core_system = db_session.query(StarSystem).filter(
        StarSystem.id == state["system_id"]
    ).first()
    assert core_system is not None

    outer_system = StarSystem(
        name="Outer Target System",
        seed="outer-target-seed",
        position_x=800,
        position_y=0,
        position_z=120,
        economy_type="mixed",
        tech_level=4,
        faction_id=core_system.faction_id,
        generation_version=1,
    )
    db_session.add(outer_system)
    db_session.flush()

    archetype = db_session.query(StationArchetype).order_by(
        StationArchetype.id.asc()
    ).first()
    assert archetype is not None

    outer_station = Station(
        system_id=outer_system.id,
        name="Outer Lock Station",
        archetype_id=archetype.id,
        position_x=6,
        position_y=0,
        position_z=-4,
        services_json={"market": True},
        faction_id=core_system.faction_id,
        tech_level=4,
        ai_story_available=False,
    )
    db_session.add(outer_station)
    db_session.flush()

    ship = (
        db_session.query(Ship)
        .filter(Ship.owner_user_id == owner.id)
        .order_by(Ship.id.asc())
        .first()
    )
    assert ship is not None
    ship.flight_phase = "charging"
    ship.flight_phase_started_at = datetime.now(
        timezone.utc) - timedelta(seconds=30)
    ship.flight_locked_destination_station_id = outer_station.id
    db_session.commit()

    response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    mutable_state = payload["mutable_state"]

    assert mutable_state["flight_phase"] == "charging"
    assert mutable_state["local_target_contact_id"] is None
    assert mutable_state["local_target_status"] == "out-of-system-locked"
    assert mutable_state["transition_started_at"] is not None
    assert "jump.charge_start" in mutable_state["audio_event_hints"]
    assert "nav.target_locked" not in mutable_state["audio_event_hints"]


def test_system_local_chart_exposes_planet_target_metadata(
    client,
    db_session,
):
    headers = auth_headers_for(
        client, "chart-target-planet@example.com", "chart-target-planet")
    owner = db_session.query(User).filter(
        User.email == "chart-target-planet@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    initial_response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )
    assert initial_response.status_code == 200
    first_planet_id = int(initial_response.json()["planets"][0]["id"])

    ship = (
        db_session.query(Ship)
        .filter(Ship.owner_user_id == owner.id)
        .order_by(Ship.id.asc())
        .first()
    )
    assert ship is not None
    ship.flight_phase = "destination-locked"
    ship.flight_locked_destination_station_id = None
    ship.flight_locked_destination_contact_type = "planet"
    ship.flight_locked_destination_contact_id = first_planet_id
    db_session.commit()

    response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )
    assert response.status_code == 200
    mutable_state = response.json()["mutable_state"]

    assert mutable_state["local_target_contact_type"] == "planet"
    assert mutable_state["local_target_contact_id"] == f"planet-{first_planet_id}"
    assert mutable_state["local_target_status"] == "in-system-locked"


def test_system_local_chart_ordering_is_stable_across_requests(
    client,
    db_session,
):
    headers = auth_headers_for(
        client, "chart-order@example.com", "chart-order")
    owner = db_session.query(User).filter(
        User.email == "chart-order@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    first_response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )
    second_response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200

    first_payload = first_response.json()
    second_payload = second_response.json()

    first_planet_order = [
        (planet["parent_body_id"] or 0, planet["orbit_index"], planet["id"])
        for planet in first_payload["planets"]
    ]
    second_planet_order = [
        (planet["parent_body_id"] or 0, planet["orbit_index"], planet["id"])
        for planet in second_payload["planets"]
    ]

    assert first_planet_order == sorted(first_planet_order)
    assert second_planet_order == sorted(second_planet_order)
    assert first_planet_order == second_planet_order

    first_moon_order = {
        parent_id: [
            (moon["parent_body_id"] or 0, moon["orbit_index"], moon["id"])
            for moon in moons
        ]
        for parent_id, moons in first_payload["moons_by_parent_body_id"].items()
    }
    second_moon_order = {
        parent_id: [
            (moon["parent_body_id"] or 0, moon["orbit_index"], moon["id"])
            for moon in moons
        ]
        for parent_id, moons in second_payload["moons_by_parent_body_id"].items()
    }

    for moon_order in first_moon_order.values():
        assert moon_order == sorted(moon_order)
    for moon_order in second_moon_order.values():
        assert moon_order == sorted(moon_order)
    assert first_moon_order == second_moon_order

    first_station_ids = [station["id"]
                         for station in first_payload["stations"]]
    second_station_ids = [station["id"]
                          for station in second_payload["stations"]]
    assert first_station_ids == sorted(first_station_ids)
    assert second_station_ids == sorted(second_station_ids)
    assert first_station_ids == second_station_ids


def test_system_local_chart_supports_sparse_star_only_system_contract(
    client,
    db_session,
):
    headers = auth_headers_for(
        client,
        "chart-sparse@example.com",
        "chart-sparse",
    )

    faction = Faction(name="Sparse Faction",
                      alignment="neutral", reputation_scale=0)
    db_session.add(faction)
    db_session.flush()

    system = StarSystem(
        name="Sparse Core",
        seed="sparse-core-seed",
        position_x=1200,
        position_y=0,
        position_z=-800,
        economy_type="mixed",
        tech_level=2,
        faction_id=faction.id,
        generation_version=1,
    )
    db_session.add(system)
    db_session.flush()

    star = CelestialBody(
        system_id=system.id,
        body_kind="star",
        body_type="g-class",
        name="Sparse Core Primary",
        seed_fragment=101,
        generation_version=1,
        parent_body_id=None,
        orbit_index=0,
        orbit_radius_km=0,
        radius_km=610000,
        mass_kg=None,
        axial_tilt_deg=None,
        position_x=1200,
        position_y=0,
        position_z=-800,
        render_profile={"body_type": "g-class", "radius_km": 610000},
    )
    db_session.add(star)
    db_session.commit()

    first_response = client.get(
        f"/api/systems/{system.id}/local-chart",
        headers=headers,
    )
    second_response = client.get(
        f"/api/systems/{system.id}/local-chart",
        headers=headers,
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200

    first_payload = first_response.json()
    second_payload = second_response.json()

    assert first_payload["system"]["id"] == system.id
    assert first_payload["system"]["name"] == "Sparse Core"
    assert first_payload["system"]["generation_version"] == 1
    assert isinstance(first_payload["system"]["seed_hash"], str)
    assert len(first_payload["system"]["seed_hash"]) == 12

    assert first_payload["star"]["id"] == star.id
    assert first_payload["star"]["body_kind"] == "star"
    assert first_payload["star"]["body_type"] == "g-class"
    assert first_payload["star"]["orbit_index"] == 0
    assert first_payload["star"]["orbit_radius_km"] == 0

    assert first_payload["planets"] == []
    assert first_payload["moons_by_parent_body_id"] == {}
    assert first_payload["stations"] == []

    first_structure = {
        "system": first_payload["system"],
        "star": first_payload["star"],
        "planets": first_payload["planets"],
        "moons_by_parent_body_id": first_payload["moons_by_parent_body_id"],
        "stations": first_payload["stations"],
    }
    second_structure = {
        "system": second_payload["system"],
        "star": second_payload["star"],
        "planets": second_payload["planets"],
        "moons_by_parent_body_id": second_payload["moons_by_parent_body_id"],
        "stations": second_payload["stations"],
    }

    assert first_structure == second_structure

    assert int(first_payload["mutable_state"]["economy_tick_cursor"]) >= 0
    assert int(first_payload["mutable_state"]["politics_tick_cursor"]) >= 0
    assert first_payload["mutable_state"]["security_level"] in {
        "low", "medium", "high"}
    assert 0 <= int(first_payload["mutable_state"]["stability_score"]) <= 100

    assert int(second_payload["mutable_state"]["economy_tick_cursor"]) >= int(
        first_payload["mutable_state"]["economy_tick_cursor"],
    )
    assert int(second_payload["mutable_state"]["politics_tick_cursor"]) >= int(
        first_payload["mutable_state"]["politics_tick_cursor"],
    )


def test_system_local_chart_applies_offscreen_simulation_catchup(
    client,
    db_session,
):
    headers = auth_headers_for(
        client, "chart-catchup@example.com", "chart-catchup")
    owner = db_session.query(User).filter(
        User.email == "chart-catchup@example.com",
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    stale_now = datetime.now(timezone.utc)
    simulation_state = SystemSimulationState(
        system_id=state["system_id"],
        last_economy_tick_at=stale_now - timedelta(minutes=10),
        last_politics_tick_at=stale_now - timedelta(minutes=10),
        economy_tick_cursor=2,
        politics_tick_cursor=3,
        version=0,
    )
    political_state = SystemPoliticalState(
        system_id=state["system_id"],
        faction_control_json={},
        security_level="medium",
        stability_score=50,
        updated_at=stale_now - timedelta(minutes=10),
    )
    db_session.add(simulation_state)
    db_session.add(political_state)
    db_session.commit()

    baseline_inventory = (
        db_session.query(StationInventory)
        .filter(StationInventory.station_id == state["station_1_id"])
        .order_by(StationInventory.id.asc())
        .first()
    )
    assert baseline_inventory is not None
    baseline_quantity = int(baseline_inventory.quantity)

    response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    mutable_state = payload["mutable_state"]
    assert mutable_state["economy_tick_cursor"] > 2
    assert mutable_state["politics_tick_cursor"] > 3
    assert mutable_state["last_economy_tick_at"] is not None
    assert mutable_state["last_politics_tick_at"] is not None
    assert mutable_state["security_level"] in {"low", "medium", "high"}

    db_session.refresh(simulation_state)
    db_session.refresh(political_state)
    assert int(simulation_state.economy_tick_cursor) == int(
        mutable_state["economy_tick_cursor"],
    )
    assert int(simulation_state.politics_tick_cursor) == int(
        mutable_state["politics_tick_cursor"],
    )
    assert int(political_state.stability_score) == int(
        mutable_state["stability_score"])

    db_session.refresh(baseline_inventory)
    assert int(baseline_inventory.quantity) > baseline_quantity


def test_system_local_chart_catchup_caps_ticks_per_read(
    client,
    db_session,
):
    headers = auth_headers_for(
        client,
        "chart-catchup-cap@example.com",
        "chart-catchup-cap",
    )
    owner = db_session.query(User).filter(
        User.email == "chart-catchup-cap@example.com",
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    stale_now = datetime.now(timezone.utc)
    simulation_state = SystemSimulationState(
        system_id=state["system_id"],
        last_economy_tick_at=stale_now - timedelta(days=30),
        last_politics_tick_at=stale_now - timedelta(days=30),
        economy_tick_cursor=0,
        politics_tick_cursor=0,
        version=0,
    )
    political_state = SystemPoliticalState(
        system_id=state["system_id"],
        faction_control_json={},
        security_level="medium",
        stability_score=50,
        updated_at=stale_now - timedelta(days=30),
    )
    db_session.add(simulation_state)
    db_session.add(political_state)
    db_session.commit()

    response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )
    assert response.status_code == 200

    payload = response.json()
    mutable_state = payload["mutable_state"]

    assert int(mutable_state["economy_tick_cursor"]
               ) == MAX_ECONOMY_TICKS_PER_READ
    assert int(mutable_state["politics_tick_cursor"]
               ) == MAX_POLITICS_TICKS_PER_READ

    db_session.refresh(simulation_state)
    assert int(simulation_state.economy_tick_cursor) == MAX_ECONOMY_TICKS_PER_READ
    assert int(
        simulation_state.politics_tick_cursor) == MAX_POLITICS_TICKS_PER_READ


def test_system_local_chart_keeps_structure_stable_while_mutable_state_advances(
    client,
    db_session,
):
    headers = auth_headers_for(
        client,
        "chart-continuity@example.com",
        "chart-continuity",
    )
    owner = db_session.query(User).filter(
        User.email == "chart-continuity@example.com",
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    stale_now = datetime.now(timezone.utc)
    simulation_state = SystemSimulationState(
        system_id=state["system_id"],
        last_economy_tick_at=stale_now - timedelta(minutes=6),
        last_politics_tick_at=stale_now - timedelta(minutes=6),
        economy_tick_cursor=0,
        politics_tick_cursor=0,
        version=0,
    )
    political_state = SystemPoliticalState(
        system_id=state["system_id"],
        faction_control_json={},
        security_level="medium",
        stability_score=50,
        updated_at=stale_now - timedelta(minutes=6),
    )
    db_session.add(simulation_state)
    db_session.add(political_state)
    db_session.commit()

    first_response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )
    assert first_response.status_code == 200
    first_payload = first_response.json()

    first_structure = {
        "system": (
            first_payload["system"]["id"],
            first_payload["system"]["name"],
            first_payload["system"]["generation_version"],
            first_payload["system"]["seed_hash"],
        ),
        "star": (
            first_payload["star"]["id"],
            first_payload["star"]["body_kind"],
            first_payload["star"]["body_type"],
            first_payload["star"]["orbit_index"],
            first_payload["star"]["orbit_radius_km"],
            first_payload["star"]["radius_km"],
            first_payload["star"]["position_x"],
            first_payload["star"]["position_y"],
            first_payload["star"]["position_z"],
        ),
        "planets": [
            (
                planet["id"],
                planet["body_kind"],
                planet["body_type"],
                planet["parent_body_id"],
                planet["orbit_index"],
                planet["orbit_radius_km"],
                planet["radius_km"],
                planet["position_x"],
                planet["position_y"],
                planet["position_z"],
            )
            for planet in first_payload["planets"]
        ],
        "moons_by_parent_body_id": {
            parent_id: [
                (
                    moon["id"],
                    moon["body_kind"],
                    moon["body_type"],
                    moon["parent_body_id"],
                    moon["orbit_index"],
                    moon["orbit_radius_km"],
                    moon["radius_km"],
                    moon["position_x"],
                    moon["position_y"],
                    moon["position_z"],
                )
                for moon in moons
            ]
            for parent_id, moons in first_payload["moons_by_parent_body_id"].items()
        },
        "stations": [
            (
                station["id"],
                station["name"],
                station["host_body_id"],
                station["orbit_radius_km"],
                station["orbit_phase_deg"],
                station["position_x"],
                station["position_y"],
                station["position_z"],
            )
            for station in first_payload["stations"]
        ],
    }
    first_mutable = first_payload["mutable_state"]

    simulation_state = (
        db_session.query(SystemSimulationState)
        .filter(SystemSimulationState.system_id == state["system_id"])
        .first()
    )
    assert simulation_state is not None
    simulation_state.last_economy_tick_at = datetime.now(
        timezone.utc) - timedelta(minutes=4)
    simulation_state.last_politics_tick_at = datetime.now(
        timezone.utc) - timedelta(minutes=4)
    db_session.commit()

    second_response = client.get(
        f"/api/systems/{state['system_id']}/local-chart",
        headers=headers,
    )
    assert second_response.status_code == 200
    second_payload = second_response.json()
    second_mutable = second_payload["mutable_state"]

    second_structure = {
        "system": (
            second_payload["system"]["id"],
            second_payload["system"]["name"],
            second_payload["system"]["generation_version"],
            second_payload["system"]["seed_hash"],
        ),
        "star": (
            second_payload["star"]["id"],
            second_payload["star"]["body_kind"],
            second_payload["star"]["body_type"],
            second_payload["star"]["orbit_index"],
            second_payload["star"]["orbit_radius_km"],
            second_payload["star"]["radius_km"],
            second_payload["star"]["position_x"],
            second_payload["star"]["position_y"],
            second_payload["star"]["position_z"],
        ),
        "planets": [
            (
                planet["id"],
                planet["body_kind"],
                planet["body_type"],
                planet["parent_body_id"],
                planet["orbit_index"],
                planet["orbit_radius_km"],
                planet["radius_km"],
                planet["position_x"],
                planet["position_y"],
                planet["position_z"],
            )
            for planet in second_payload["planets"]
        ],
        "moons_by_parent_body_id": {
            parent_id: [
                (
                    moon["id"],
                    moon["body_kind"],
                    moon["body_type"],
                    moon["parent_body_id"],
                    moon["orbit_index"],
                    moon["orbit_radius_km"],
                    moon["radius_km"],
                    moon["position_x"],
                    moon["position_y"],
                    moon["position_z"],
                )
                for moon in moons
            ]
            for parent_id, moons in second_payload["moons_by_parent_body_id"].items()
        },
        "stations": [
            (
                station["id"],
                station["name"],
                station["host_body_id"],
                station["orbit_radius_km"],
                station["orbit_phase_deg"],
                station["position_x"],
                station["position_y"],
                station["position_z"],
            )
            for station in second_payload["stations"]
        ],
    }

    assert second_structure == first_structure
    assert int(second_mutable["economy_tick_cursor"]) > int(
        first_mutable["economy_tick_cursor"])
    assert int(second_mutable["politics_tick_cursor"]) > int(
        first_mutable["politics_tick_cursor"])
