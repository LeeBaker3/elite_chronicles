import math
from datetime import timedelta

from app.models.ship import Ship
from app.models.ship_operation import ShipOperationLog
from app.models.user import User
from app.models.world import (
    CelestialBody,
    Commodity,
    Faction,
    ShipArchetype,
    StarSystem,
    Station,
    StationArchetype,
    StationInventory,
)
from app.core.config import settings


def seed_core_state(
    db_session,
    owner_user_id: int | None = None,
    station_archetype_shape: str = "coriolis",
    station_archetype_name: str = "Core Hub",
):
    faction = Faction(name="Core Faction",
                      alignment="neutral", reputation_scale=0)
    db_session.add(faction)
    db_session.flush()

    system = StarSystem(
        name="Core System",
        seed="core-seed",
        position_x=0,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=3,
        faction_id=faction.id,
    )
    db_session.add(system)
    db_session.flush()

    archetype = StationArchetype(
        name=station_archetype_name,
        size_class="medium",
        shape=station_archetype_shape,
        palette_json={},
        features_json={"market": True},
    )
    db_session.add(archetype)
    db_session.flush()

    station_1 = Station(
        system_id=system.id,
        name="Core Station A",
        archetype_id=archetype.id,
        position_x=0,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=3,
        ai_story_available=True,
    )
    station_2 = Station(
        system_id=system.id,
        name="Core Station B",
        archetype_id=archetype.id,
        position_x=10,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=3,
        ai_story_available=False,
    )
    station_3 = Station(
        system_id=system.id,
        name="Core Station C",
        archetype_id=archetype.id,
        position_x=22,
        position_y=0,
        position_z=4,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=3,
        ai_story_available=False,
    )
    db_session.add_all([station_1, station_2, station_3])
    db_session.flush()

    commodity = Commodity(
        name="Core Alloy",
        category="industrial",
        base_price=120,
        volatility=4,
        illegal_flag=False,
    )
    db_session.add(commodity)
    db_session.flush()

    db_session.add_all(
        [
            StationInventory(
                station_id=station_1.id,
                commodity_id=commodity.id,
                quantity=10,
                max_capacity=100,
                buy_price=120,
                sell_price=140,
            ),
            StationInventory(
                station_id=station_2.id,
                commodity_id=commodity.id,
                quantity=95,
                max_capacity=100,
                buy_price=122,
                sell_price=142,
            ),
            StationInventory(
                station_id=station_3.id,
                commodity_id=commodity.id,
                quantity=70,
                max_capacity=100,
                buy_price=108,
                sell_price=128,
            ),
        ]
    )

    if owner_user_id is None:
        owner = User(
            email="owner-seed@example.com",
            username="owner-seed",
            password_hash="hash",
            status="active",
            credits=5000,
        )
        db_session.add(owner)
        db_session.flush()
        owner_id = owner.id
    else:
        owner_id = owner_user_id

    ship_archetype = ShipArchetype(
        key=f"cobra-mk1-{owner_id}",
        name="Cobra Mk I",
        hull_class="light",
        archetype_version=1,
        render_profile_json={},
    )
    db_session.add(ship_archetype)
    db_session.flush()

    ship = Ship(
        owner_user_id=owner_id,
        name="Core Runner",
        hull_max=100,
        hull_current=100,
        shields_max=100,
        shields_current=100,
        energy_cap=100,
        energy_current=100,
        fuel_cap=120,
        fuel_current=30,
        cargo_capacity=20,
        status="docked",
        docked_station_id=station_1.id,
        ship_archetype_id=ship_archetype.id,
        render_seed=((int(owner_id) * 1103515245) + 12345) % 2147483647 or 1,
    )
    db_session.add(ship)
    db_session.commit()

    return {
        "system_id": system.id,
        "station_1_id": station_1.id,
        "station_2_id": station_2.id,
        "station_3_id": station_3.id,
        "commodity_id": commodity.id,
        "ship_id": ship.id,
    }


def auth_headers_for(client, email: str, username: str):
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": "pilot123",
        },
    )
    assert response.status_code == 200
    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def move_ship_to_jump_clearance(
    db_session,
    *,
    ship_id: int,
    system_id: int,
    clearance_km: int = 240,
) -> None:
    """Move ship to deterministic in-system clearance for hyperspace tests."""

    ship = db_session.query(Ship).filter(Ship.id == ship_id).first()
    assert ship is not None
    system = db_session.query(StarSystem).filter(
        StarSystem.id == system_id).first()
    assert system is not None

    ship.position_x = int(system.position_x or 0) + int(clearance_km)
    ship.position_y = int(system.position_y or 0)
    ship.position_z = int(system.position_z or 0)
    db_session.commit()


def test_players_me_requires_auth(client):
    response = client.get("/api/players/me")
    assert response.status_code == 401


def test_players_me_returns_profile(client, auth_headers):
    response = client.get("/api/players/me", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == "pilot@example.com"
    assert payload["username"] == "pilot"
    assert payload["is_alive"] is True


def test_ship_undock_and_refuel_flow(client, db_session):
    headers = auth_headers_for(client, "owner@example.com", "owner")
    owner = db_session.query(User).filter(
        User.email == "owner@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    telemetry_before_undock = client.get(
        f"/api/ships/{state['ship_id']}",
        headers=headers,
    )
    assert telemetry_before_undock.status_code == 200
    telemetry_payload = telemetry_before_undock.json()
    assert telemetry_payload["docking_computer_tier"] == "standard"
    assert telemetry_payload["docking_computer_range_km"] == 40
    assert telemetry_payload["docked_station_archetype_shape"] == "coriolis"
    assert telemetry_payload["docked_station_archetype_name"] == "Core Hub"
    assert telemetry_payload["ship_archetype_id"] is not None
    assert telemetry_payload["render_seed"] > 0

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200
    assert undock.json()["status"] == "in-space"
    assert undock.json()["ship_visual_key"] == "cobra-mk1"

    db_session.refresh(owner)
    assert owner.location_type == "deep-space"
    assert owner.location_id == state["system_id"]

    refuel_while_undocked = client.post(
        f"/api/ships/{state['ship_id']}/refuel",
        json={},
        headers=headers,
    )
    assert refuel_while_undocked.status_code == 409

    dock = client.post(
        f"/api/ships/{state['ship_id']}/dock",
        json={"station_id": state["station_2_id"]},
        headers=headers,
    )
    assert dock.status_code == 200
    assert dock.json()["status"] == "docked"
    assert dock.json()["docked_station_id"] == state["station_2_id"]

    refuel = client.post(
        f"/api/ships/{state['ship_id']}/refuel",
        json={"amount": 40},
        headers=headers,
    )
    assert refuel.status_code == 200
    assert refuel.json()["fuel_current"] == 70

    operations = client.get(
        f"/api/ships/{state['ship_id']}/operations",
        headers=headers,
    )
    assert operations.status_code == 200
    operation_names = [entry["operation"] for entry in operations.json()]
    details = [entry["details"] for entry in operations.json()]
    assert "dock-approach-start" in operation_names
    assert "dock-approach-complete" in operation_names
    assert any("Docked at Core Station B" in item for item in details)


def test_dev_top_up_fuel_works_while_in_space(client, db_session):
    headers = auth_headers_for(client, "dev-fuel@example.com", "dev-fuel")
    owner = db_session.query(User).filter(
        User.email == "dev-fuel@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock.status_code == 200

    initial_telemetry = client.get(
        f"/api/ships/{state['ship_id']}",
        headers=headers,
    )
    assert initial_telemetry.status_code == 200
    assert initial_telemetry.json()["fuel_current"] == 30

    top_up = client.post(
        f"/api/ships/{state['ship_id']}/dev-top-up-fuel",
        json={},
        headers=headers,
    )
    assert top_up.status_code == 200
    assert top_up.json()["fuel_current"] == top_up.json()["fuel_cap"]


def test_dev_top_up_fuel_blocked_outside_development(client, db_session):
    headers = auth_headers_for(
        client,
        "dev-fuel-prod@example.com",
        "dev-fuel-prod",
    )
    owner = db_session.query(User).filter(
        User.email == "dev-fuel-prod@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    original_environment = settings.environment
    settings.environment = "production"
    try:
        response = client.post(
            f"/api/ships/{state['ship_id']}/dev-top-up-fuel",
            json={},
            headers=headers,
        )
    finally:
        settings.environment = original_environment

    assert response.status_code == 403
    assert response.json()["error"]["message"] == "Development-only endpoint"


def test_local_target_lock_and_transfer_for_planet(client, db_session):
    headers = auth_headers_for(
        client, "localtarget@example.com", "local-target")
    owner = db_session.query(User).filter(
        User.email == "localtarget@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock.status_code == 200

    contacts = client.get(
        f"/api/ships/{state['ship_id']}/local-contacts",
        headers=headers,
    )
    assert contacts.status_code == 200
    planet = next(
        (
            entry
            for entry in contacts.json()["contacts"]
            if entry["contact_type"] == "planet"
        ),
        None,
    )
    assert planet is not None
    planet_id = int(str(planet["id"]).split("-")[1])

    lock_response = client.post(
        f"/api/ships/{state['ship_id']}/local-target",
        json={
            "action": "lock",
            "contact_type": "planet",
            "contact_id": planet_id,
        },
        headers=headers,
    )
    assert lock_response.status_code == 200
    lock_payload = lock_response.json()
    assert lock_payload["flight_locked_destination_contact_type"] == "planet"
    assert lock_payload["flight_locked_destination_contact_id"] == planet_id

    transfer_response = client.post(
        f"/api/ships/{state['ship_id']}/local-target",
        json={
            "action": "transfer",
            "contact_type": "planet",
            "contact_id": planet_id,
        },
        headers=headers,
    )
    assert transfer_response.status_code == 200
    transfer_payload = transfer_response.json()
    assert transfer_payload["status"] == "in-space"
    assert transfer_payload["flight_phase"] == "arrived"
    assert transfer_payload["flight_locked_destination_contact_type"] == "planet"
    assert transfer_payload["flight_locked_destination_contact_id"] == planet_id

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    planet_body = (
        db_session.query(CelestialBody)
        .filter(CelestialBody.id == planet_id)
        .first()
    )
    assert planet_body is not None

    center_distance_km = math.sqrt(
        ((int(ship.position_x or 0) - int(planet_body.position_x or 0)) ** 2)
        + ((int(ship.position_y or 0) - int(planet_body.position_y or 0)) ** 2)
        + ((int(ship.position_z or 0) - int(planet_body.position_z or 0)) ** 2)
    )
    assert center_distance_km > float(planet_body.radius_km or 0)

    post_transfer_contacts = client.get(
        f"/api/ships/{state['ship_id']}/local-contacts",
        headers=headers,
    )
    assert post_transfer_contacts.status_code == 200
    post_transfer_payload = post_transfer_contacts.json()
    target_contact = next(
        (
            entry
            for entry in post_transfer_payload["contacts"]
            if entry["id"] == f"planet-{planet_id}"
        ),
        None,
    )
    assert target_contact is not None
    expected_surface_distance_km = max(
        0,
        int(round(center_distance_km - float(planet_body.radius_km or 0))),
    )
    assert abs(int(target_contact["distance_km"]) - expected_surface_distance_km) <= 1
    assert int(target_contact["distance_km"]) < 64


def test_ship_visual_key_uses_archetype_lookup_not_ship_name(client, db_session):
    headers = auth_headers_for(client, "visual-key@example.com", "visual-key")
    owner = db_session.query(User).filter(
        User.email == "visual-key@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.name = "Completely Different Name"
    db_session.commit()

    first = client.get(f"/api/ships/{state['ship_id']}", headers=headers)
    assert first.status_code == 200
    assert first.json()["ship_visual_key"] == "cobra-mk1"

    viper_archetype = ShipArchetype(
        key="viper-mk1",
        name="Viper Mk I",
        hull_class="light",
        archetype_version=1,
        render_profile_json={},
    )
    db_session.add(viper_archetype)
    db_session.flush()

    ship.ship_archetype_id = viper_archetype.id
    db_session.commit()

    second = client.get(f"/api/ships/{state['ship_id']}", headers=headers)
    assert second.status_code == 200
    assert second.json()["ship_visual_key"] == "viper-mk1"


def test_scanner_selection_logs_operation(client, db_session):
    headers = auth_headers_for(client, "scanner@example.com", "scanner-user")
    owner = db_session.query(User).filter(
        User.email == "scanner@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    response = client.post(
        f"/api/ships/{state['ship_id']}/scanner-selection",
        json={
            "selected_contact_id": "station-2",
            "selected_contact_name": "Core Station B",
            "selected_contact_type": "station",
            "source": "scanner-hud-list",
            "visible_contact_ids": ["station-2", "station-1", "ship-3"],
            "total_contacts": 13,
            "visible_contacts_count": 3,
        },
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["logged"] is True

    operation = (
        db_session.query(ShipOperationLog)
        .filter(
            ShipOperationLog.ship_id == state["ship_id"],
            ShipOperationLog.user_id == owner.id,
            ShipOperationLog.operation == "scanner-select",
        )
        .order_by(ShipOperationLog.id.desc())
        .first()
    )
    assert operation is not None
    assert "source=scanner-hud-list" in operation.details
    assert "station-2" in operation.details


def test_ship_telemetry_reports_orbis_archetype_when_docked(client, db_session):
    headers = auth_headers_for(
        client, "orbis-owner@example.com", "orbis-owner")
    owner = db_session.query(User).filter(
        User.email == "orbis-owner@example.com").first()
    assert owner is not None
    state = seed_core_state(
        db_session,
        owner_user_id=owner.id,
        station_archetype_shape="orbis",
        station_archetype_name="Orbis Spindle",
    )

    telemetry = client.get(f"/api/ships/{state['ship_id']}", headers=headers)
    assert telemetry.status_code == 200
    payload = telemetry.json()
    assert payload["status"] == "docked"
    assert payload["docked_station_archetype_shape"] == "orbis"
    assert payload["docked_station_archetype_name"] == "Orbis Spindle"


def test_ship_telemetry_preserves_unknown_archetype_shape(client, db_session):
    headers = auth_headers_for(
        client, "unknown-shape-owner@example.com", "unknown-shape-owner"
    )
    owner = db_session.query(User).filter(
        User.email == "unknown-shape-owner@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(
        db_session,
        owner_user_id=owner.id,
        station_archetype_shape="tetrahedral",
        station_archetype_name="Experimental Ring",
    )

    telemetry = client.get(f"/api/ships/{state['ship_id']}", headers=headers)
    assert telemetry.status_code == 200
    payload = telemetry.json()
    assert payload["status"] == "docked"
    assert payload["docked_station_archetype_shape"] == "tetrahedral"
    assert payload["docked_station_archetype_name"] == "Experimental Ring"


def test_dock_requires_station_within_docking_computer_range(client, db_session):
    headers = auth_headers_for(
        client, "dock-range-owner@example.com", "dock-range-owner")
    owner = db_session.query(User).filter(
        User.email == "dock-range-owner@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers
    )
    assert undock.status_code == 200

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.position_x = 600
    ship.position_y = 0
    ship.position_z = 0
    db_session.commit()

    dock = client.post(
        f"/api/ships/{state['ship_id']}/dock",
        json={"station_id": state["station_1_id"]},
        headers=headers,
    )
    assert dock.status_code == 409
    dock_error = dock.json()
    message = (
        dock_error.get("detail")
        or dock_error.get("error", {}).get("message")
        or ""
    )
    assert "range exceeded" in message.lower()


def test_docking_range_varies_by_computer_tier(client, db_session):
    headers = auth_headers_for(
        client, "dock-tier-owner@example.com", "dock-tier-owner")
    owner = db_session.query(User).filter(
        User.email == "dock-tier-owner@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers
    )
    assert undock.status_code == 200

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.position_x = 35
    ship.position_y = 0
    ship.position_z = 0
    ship.docking_computer_tier = "basic"
    db_session.commit()

    dock_basic = client.post(
        f"/api/ships/{state['ship_id']}/dock",
        json={"station_id": state["station_1_id"]},
        headers=headers,
    )
    assert dock_basic.status_code == 409
    basic_error = dock_basic.json()
    basic_message = (
        basic_error.get("detail")
        or basic_error.get("error", {}).get("message")
        or ""
    )
    assert "20km" in basic_message.lower()

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.docking_computer_tier = "advanced"
    db_session.commit()

    dock_advanced = client.post(
        f"/api/ships/{state['ship_id']}/dock",
        json={"station_id": state["station_1_id"]},
        headers=headers,
    )
    assert dock_advanced.status_code == 200
    payload = dock_advanced.json()
    assert payload["docking_computer_tier"] == "advanced"
    assert payload["docking_computer_range_km"] == 80


def test_dock_approach_feature_flag_disables_approach_logs(client, db_session):
    headers = auth_headers_for(
        client,
        "dock-flag-owner@example.com",
        "dock-flag-owner",
    )
    owner = db_session.query(User).filter(
        User.email == "dock-flag-owner@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers
    )
    assert undock.status_code == 200

    original_value = settings.dock_approach_enabled
    settings.dock_approach_enabled = False
    try:
        dock = client.post(
            f"/api/ships/{state['ship_id']}/dock",
            json={"station_id": state["station_2_id"]},
            headers=headers,
        )
        assert dock.status_code == 200
    finally:
        settings.dock_approach_enabled = original_value

    operations = client.get(
        f"/api/ships/{state['ship_id']}/operations",
        headers=headers,
    )
    assert operations.status_code == 200
    operation_names = [entry["operation"] for entry in operations.json()]
    assert "dock" in operation_names
    assert "dock-approach-start" not in operation_names
    assert "dock-approach-complete" not in operation_names


def test_crash_recovery_requires_safe_checkpoint(client, db_session):
    headers = auth_headers_for(
        client,
        "recovery-no-checkpoint-owner@example.com",
        "recovery-no-checkpoint-owner",
    )
    owner = db_session.query(User).filter(
        User.email == "recovery-no-checkpoint-owner@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    recovery = client.post(
        f"/api/ships/{state['ship_id']}/crash-recovery",
        headers=headers,
    )
    assert recovery.status_code == 409
    recovery_error = recovery.json()
    message = (
        recovery_error.get("detail")
        or recovery_error.get("error", {}).get("message")
        or ""
    )
    assert "safe checkpoint" in message.lower()


def test_crash_recovery_restores_last_safe_checkpoint(client, db_session):
    headers = auth_headers_for(
        client,
        "recovery-owner@example.com",
        "recovery-owner",
    )
    owner = db_session.query(User).filter(
        User.email == "recovery-owner@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    assert ship.last_safe_recorded_at is not None
    checkpoint_position = (
        int(ship.last_safe_position_x or 0),
        int(ship.last_safe_position_y or 0),
        int(ship.last_safe_position_z or 0),
    )

    ship.position_x = 999
    ship.position_y = 999
    ship.position_z = 999
    ship.flight_phase = "error"
    db_session.commit()

    recovery = client.post(
        f"/api/ships/{state['ship_id']}/crash-recovery",
        headers=headers,
    )
    assert recovery.status_code == 200
    payload = recovery.json()
    assert payload["safe_checkpoint_available"] is True
    assert payload["crash_recovery_count"] == 1
    assert payload["flight_phase"] == "idle"
    assert payload["status"] == "in-space"

    restored_ship = db_session.query(Ship).filter(
        Ship.id == state["ship_id"]).first()
    assert restored_ship is not None
    assert (
        int(restored_ship.position_x or 0),
        int(restored_ship.position_y or 0),
        int(restored_ship.position_z or 0),
    ) == checkpoint_position

    operations = client.get(
        f"/api/ships/{state['ship_id']}/operations",
        headers=headers,
    )
    assert operations.status_code == 200
    operation_names = [entry["operation"] for entry in operations.json()]
    assert "crash-recovery" in operation_names


def test_collision_check_applies_glancing_damage_and_logs_event(client, db_session):
    headers = auth_headers_for(
        client,
        "collision-glancing-owner@example.com",
        "collision-glancing-owner",
    )
    owner = db_session.query(User).filter(
        User.email == "collision-glancing-owner@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )

    collision = client.post(
        f"/api/ships/{state['ship_id']}/collision-check",
        headers=headers,
    )
    assert collision.status_code == 200
    payload = collision.json()

    assert payload["collision"] is False
    assert payload["severity"] == "none"
    assert payload["message"].startswith(
        "Collision monitor undock grace active")

    undock_log = (
        db_session.query(ShipOperationLog)
        .filter(
            ShipOperationLog.ship_id == state["ship_id"],
            ShipOperationLog.operation == "undock",
        )
        .order_by(ShipOperationLog.created_at.desc(), ShipOperationLog.id.desc())
        .first()
    )
    assert undock_log is not None
    undock_log.created_at = undock_log.created_at - timedelta(seconds=20)

    station = db_session.query(Station).filter(
        Station.id == state["station_2_id"]
    ).first()
    assert station is not None
    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.position_x = int(station.position_x or 0)
    ship.position_y = int(station.position_y or 0)
    ship.position_z = int(station.position_z or 0)
    db_session.commit()

    collision_after_grace = client.post(
        f"/api/ships/{state['ship_id']}/collision-check",
        headers=headers,
    )
    assert collision_after_grace.status_code == 200
    post_grace_payload = collision_after_grace.json()

    assert post_grace_payload["collision"] is True
    assert post_grace_payload["severity"] in {"glancing", "critical"}
    assert post_grace_payload["object_type"] in {
        "station", "ship", "planet", "star"}
    assert post_grace_payload["collision_context_type"] == post_grace_payload["object_type"]
    assert isinstance(post_grace_payload["resolved_outcome"], str)
    assert isinstance(post_grace_payload["destruction_triggered"], bool)
    assert post_grace_payload["shields_damage"] >= 0
    assert post_grace_payload["hull_damage"] >= 0
    assert isinstance(post_grace_payload["sfx_event_keys"], list)
    assert len(post_grace_payload["sfx_event_keys"]) >= 1
    assert (
        "collision.critical_hit"
        if post_grace_payload["severity"] == "critical"
        else "collision.glancing_hit"
    ) in post_grace_payload["sfx_event_keys"]
    assert post_grace_payload["ship"]["shields_current"] <= 100
    assert post_grace_payload["ship"]["hull_current"] <= 100

    operations = client.get(
        f"/api/ships/{state['ship_id']}/operations",
        headers=headers,
    )
    assert operations.status_code == 200
    operation_names = [entry["operation"] for entry in operations.json()]
    assert "collision" in operation_names


def test_collision_check_critical_impact_triggers_checkpoint_recovery(
    client,
    db_session,
):
    headers = auth_headers_for(
        client,
        "collision-critical-owner@example.com",
        "collision-critical-owner",
    )
    owner = db_session.query(User).filter(
        User.email == "collision-critical-owner@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    checkpoint_position = (
        int(ship.last_safe_position_x or 0),
        int(ship.last_safe_position_y or 0),
        int(ship.last_safe_position_z or 0),
    )

    station = db_session.query(Station).filter(
        Station.id == state["station_2_id"]).first()
    assert station is not None
    undock_log = (
        db_session.query(ShipOperationLog)
        .filter(
            ShipOperationLog.ship_id == state["ship_id"],
            ShipOperationLog.operation == "undock",
        )
        .order_by(ShipOperationLog.created_at.desc(), ShipOperationLog.id.desc())
        .first()
    )
    assert undock_log is not None
    undock_log.created_at = undock_log.created_at - timedelta(seconds=20)
    ship.position_x = int(station.position_x or 0)
    ship.position_y = int(station.position_y or 0)
    ship.position_z = int(station.position_z or 0)
    ship.shields_current = 0
    ship.hull_current = 1
    db_session.commit()

    collision = client.post(
        f"/api/ships/{state['ship_id']}/collision-check",
        headers=headers,
    )
    assert collision.status_code == 200
    payload = collision.json()

    assert payload["collision"] is True
    assert payload["severity"] == "critical"
    assert payload["recovered"] is True
    assert payload["destruction_triggered"] is True
    assert payload["resolved_outcome"] == "checkpoint_recovery"
    assert "ops.crash_recovery_start" in payload["sfx_event_keys"]
    assert "ops.crash_recovery_complete" in payload["sfx_event_keys"]
    assert payload["ship"]["crash_recovery_count"] == 1
    assert payload["ship"]["hull_current"] > 0

    restored_ship = db_session.query(Ship).filter(
        Ship.id == state["ship_id"]).first()
    assert restored_ship is not None
    assert (
        int(restored_ship.position_x or 0),
        int(restored_ship.position_y or 0),
        int(restored_ship.position_z or 0),
    ) == checkpoint_position

    operations = client.get(
        f"/api/ships/{state['ship_id']}/operations",
        headers=headers,
    )
    assert operations.status_code == 200
    operation_names = [entry["operation"] for entry in operations.json()]
    assert "collision" in operation_names
    assert "crash-recovery" in operation_names


def test_collision_check_suppresses_locked_station_impact_during_docking_approach(
    client,
    db_session,
):
    headers = auth_headers_for(
        client,
        "collision-docking-corridor-owner@example.com",
        "collision-docking-corridor-owner",
    )
    owner = db_session.query(User).filter(
        User.email == "collision-docking-corridor-owner@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200

    undock_log = (
        db_session.query(ShipOperationLog)
        .filter(
            ShipOperationLog.ship_id == state["ship_id"],
            ShipOperationLog.operation == "undock",
        )
        .order_by(ShipOperationLog.created_at.desc(), ShipOperationLog.id.desc())
        .first()
    )
    assert undock_log is not None
    undock_log.created_at = undock_log.created_at - timedelta(seconds=200)

    target_station = db_session.query(Station).filter(
        Station.id == state["station_2_id"]
    ).first()
    assert target_station is not None

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.position_x = int(target_station.position_x or 0)
    ship.position_y = int(target_station.position_y or 0)
    ship.position_z = int(target_station.position_z or 0)
    ship.flight_phase = "docking-approach"
    ship.flight_locked_destination_station_id = target_station.id
    db_session.commit()

    collision = client.post(
        f"/api/ships/{state['ship_id']}/collision-check",
        headers=headers,
    )
    assert collision.status_code == 200
    payload = collision.json()

    assert payload["collision"] is False
    assert payload["severity"] == "none"
    assert payload["object_type"] == "station"
    assert payload["object_id"] == f"station-{target_station.id}"
    assert payload["resolved_outcome"] == "none"
    assert payload["sfx_event_keys"] == []
    assert payload["message"].startswith(
        "Docking computer safety corridor active")


def test_ship_ops_forbid_non_owner(client, db_session):
    owner_headers = auth_headers_for(client, "owner@example.com", "owner")
    owner = db_session.query(User).filter(
        User.email == "owner@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)
    intruder_headers = auth_headers_for(
        client, "intruder@example.com", "intruder")

    owner_probe = client.get(
        f"/api/ships/{state['ship_id']}", headers=owner_headers)
    assert owner_probe.status_code == 200

    response = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=intruder_headers,
    )
    assert response.status_code == 403


def test_ship_jump_updates_location_and_fuel(client, db_session):
    headers = auth_headers_for(client, "jumper@example.com", "jumper")
    owner = db_session.query(User).filter(
        User.email == "jumper@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )

    jump = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={"destination_station_id": state["station_2_id"]},
        headers=headers,
    )
    assert jump.status_code == 200
    payload = jump.json()
    assert payload["status"] == "in-space"
    assert payload["docked_station_id"] is None
    assert payload["fuel_current"] == 10
    assert payload["flight_phase"] == "arrived"
    assert payload["flight_locked_destination_station_id"] is None

    db_session.refresh(owner)
    destination_station = (
        db_session.query(Station)
        .filter(Station.id == state["station_2_id"])
        .first()
    )
    assert destination_station is not None
    assert owner.location_type == "deep-space"
    assert owner.location_id == destination_station.system_id

    operations = client.get(
        f"/api/ships/{state['ship_id']}/operations",
        headers=headers,
    )
    assert operations.status_code == 200
    jump_entry = next(
        entry for entry in operations.json() if entry["operation"] == "jump"
    )
    assert "safe emergence point" in jump_entry["details"]


def test_ship_jump_accepts_destination_system_id(client, db_session):
    headers = auth_headers_for(client, "jumpsystem@example.com", "jumpsystem")
    owner = db_session.query(User).filter(
        User.email == "jumpsystem@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )

    destination_station = (
        db_session.query(Station)
        .filter(Station.id == state["station_2_id"])
        .first()
    )
    assert destination_station is not None

    jump = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={"destination_system_id": destination_station.system_id},
        headers=headers,
    )
    assert jump.status_code == 200
    payload = jump.json()
    assert payload["status"] == "in-space"
    assert payload["docked_station_id"] is None
    assert payload["flight_locked_destination_station_id"] is None

    db_session.refresh(owner)
    assert owner.location_type == "deep-space"
    assert owner.location_id == destination_station.system_id


def test_ship_jump_emergence_respects_100000km_exclusion(client, db_session):
    headers = auth_headers_for(client, "jumpsafe@example.com", "jumpsafe")
    owner = db_session.query(User).filter(
        User.email == "jumpsafe@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )

    jump = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={"destination_station_id": state["station_2_id"]},
        headers=headers,
    )
    assert jump.status_code == 200

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    system = db_session.query(StarSystem).filter(
        StarSystem.id == state["system_id"]).first()
    assert system is not None

    exclusion_points: list[tuple[int, int, int, int]] = [
        (
            int(system.position_x or 0),
            int(system.position_y or 0),
            int(system.position_z or 0),
            0,
        )
    ]

    bodies = (
        db_session.query(CelestialBody)
        .filter(CelestialBody.system_id == state["system_id"])
        .all()
    )
    exclusion_points.extend(
        (
            int(body.position_x or 0),
            int(body.position_y or 0),
            int(body.position_z or 0),
            max(0, int(body.radius_km or 0)),
        )
        for body in bodies
    )

    stations = (
        db_session.query(Station)
        .filter(Station.system_id == state["system_id"])
        .all()
    )
    exclusion_points.extend(
        (
            int(station.position_x or 0),
            int(station.position_y or 0),
            int(station.position_z or 0),
            0,
        )
        for station in stations
    )

    min_distance = min(
        math.sqrt(
            ((int(ship.position_x or 0) - point_x) ** 2)
            + ((int(ship.position_y or 0) - point_y) ** 2)
            + ((int(ship.position_z or 0) - point_z) ** 2)
        ) - exclusion_radius_km
        for point_x, point_y, point_z, exclusion_radius_km in exclusion_points
    )
    assert min_distance >= 100_000


def test_trade_loop_via_third_station_and_return_sell(
    client,
    db_session,
    monkeypatch,
):
    monkeypatch.setattr("app.api.ships.JUMP_COOLDOWN_SECONDS", 0)

    headers = auth_headers_for(client, "loop3@example.com", "loop3")
    owner = db_session.query(User).filter(
        User.email == "loop3@example.com").first()
    assert owner is not None
    owner.credits = 5_000
    db_session.commit()
    db_session.refresh(owner)

    state = seed_core_state(db_session, owner_user_id=owner.id)
    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.fuel_current = 80
    db_session.commit()

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock.status_code == 200
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )

    jump_to_third = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={"destination_station_id": state["station_3_id"]},
        headers=headers,
    )
    assert jump_to_third.status_code == 200

    transfer_to_third = client.post(
        f"/api/ships/{state['ship_id']}/local-target",
        json={
            "action": "transfer",
            "contact_type": "station",
            "contact_id": state["station_3_id"],
        },
        headers=headers,
    )
    assert transfer_to_third.status_code == 200

    dock_third = client.post(
        f"/api/ships/{state['ship_id']}/dock",
        json={"station_id": state["station_3_id"]},
        headers=headers,
    )
    assert dock_third.status_code == 200
    assert dock_third.json()["docked_station_id"] == state["station_3_id"]

    buy = client.post(
        f"/api/stations/{state['station_3_id']}/trade",
        json={
            "commodity_id": state["commodity_id"],
            "qty": 5,
            "direction": "buy",
            "ship_id": state["ship_id"],
        },
        headers=headers,
    )
    assert buy.status_code == 200, buy.text
    credits_after_buy = int(buy.json()["credits"])

    undock_return = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock_return.status_code == 200
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )

    jump_back = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={"destination_station_id": state["station_1_id"]},
        headers=headers,
    )
    assert jump_back.status_code == 200, jump_back.text

    transfer_to_first = client.post(
        f"/api/ships/{state['ship_id']}/local-target",
        json={
            "action": "transfer",
            "contact_type": "station",
            "contact_id": state["station_1_id"],
        },
        headers=headers,
    )
    assert transfer_to_first.status_code == 200

    dock_back = client.post(
        f"/api/ships/{state['ship_id']}/dock",
        json={"station_id": state["station_1_id"]},
        headers=headers,
    )
    assert dock_back.status_code == 200
    assert dock_back.json()["docked_station_id"] == state["station_1_id"]

    sell = client.post(
        f"/api/stations/{state['station_1_id']}/trade",
        json={
            "commodity_id": state["commodity_id"],
            "qty": 5,
            "direction": "sell",
            "ship_id": state["ship_id"],
        },
        headers=headers,
    )
    assert sell.status_code == 200
    assert int(sell.json()["credits"]) > credits_after_buy


def test_ship_local_contacts_returns_ships_stations_planet_and_star(client, db_session):
    headers = auth_headers_for(client, "scanner@example.com", "scanner")
    owner = db_session.query(User).filter(
        User.email == "scanner@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    intruder = User(
        email="scanner-intruder@example.com",
        username="scanner-intruder",
        password_hash="hash",
        status="active",
        credits=500,
    )
    db_session.add(intruder)
    db_session.flush()

    intruder_ship = Ship(
        owner_user_id=intruder.id,
        name="Traffic Ghost",
        hull_max=100,
        hull_current=100,
        shields_max=50,
        shields_current=50,
        energy_cap=60,
        energy_current=60,
        fuel_cap=100,
        fuel_current=80,
        cargo_capacity=10,
        status="in-space",
        docked_station_id=None,
        position_x=24,
        position_y=0,
        position_z=-12,
    )
    db_session.add(intruder_ship)
    db_session.commit()

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock.status_code == 200

    response = client.get(
        f"/api/ships/{state['ship_id']}/local-contacts",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["ship_id"] == state["ship_id"]
    assert payload["system_id"] == state["system_id"]
    assert payload["system_name"] == "Core System"
    assert payload["generation_version"] == 1

    contacts = payload["contacts"]
    contact_types = {entry["contact_type"] for entry in contacts}
    assert "star" in contact_types
    assert "planet" in contact_types
    assert "station" in contact_types
    assert "ship" in contact_types

    station_contact_ids = {
        entry["id"]
        for entry in contacts
        if entry["contact_type"] == "station"
    }
    assert f"station-{state['station_1_id']}" in station_contact_ids
    assert f"station-{state['station_2_id']}" in station_contact_ids

    planet_contacts = [
        entry for entry in contacts if entry["contact_type"] == "planet"
    ]
    station_contacts = [
        entry for entry in contacts if entry["contact_type"] == "station"
    ]
    ship_contacts = [
        entry for entry in contacts if entry["contact_type"] == "ship"
    ]
    assert planet_contacts
    assert station_contacts
    assert ship_contacts
    planet_names = {entry["name"] for entry in planet_contacts}
    for station_contact in station_contacts:
        assert station_contact["orbiting_planet_name"] in planet_names
        assert station_contact["host_body_id"] is not None
        assert isinstance(station_contact["orbit_phase_deg"], int)
        assert station_contact["station_archetype_shape"] == "coriolis"
        assert isinstance(station_contact["relative_x_km"], int)
        assert isinstance(station_contact["relative_y_km"], int)
        assert isinstance(station_contact["relative_z_km"], int)
        assert isinstance(station_contact["scene_x"], (float, int))
        assert isinstance(station_contact["scene_y"], (float, int))
        assert isinstance(station_contact["scene_z"], (float, int))

    for planet_contact in planet_contacts:
        assert planet_contact["body_type"]
        assert planet_contact["radius_km"] > 0
        assert planet_contact["orbit_radius_km"] >= 0

    for ship_contact in ship_contacts:
        assert ship_contact["ship_visual_key"] == "cobra-mk1"


def test_ship_jump_enforces_cooldown_and_reports_remaining(client, db_session):
    headers = auth_headers_for(client, "cooldown@example.com", "cooldown")
    owner = db_session.query(User).filter(
        User.email == "cooldown@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    first_undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert first_undock.status_code == 200
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )

    first_jump = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={"destination_station_id": state["station_2_id"]},
        headers=headers,
    )
    assert first_jump.status_code == 200
    assert first_jump.json()["jump_cooldown_seconds"] > 0
    assert first_jump.json()["jump_cooldown_until"] is not None

    blocked_jump = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={"destination_station_id": state["station_1_id"]},
        headers=headers,
    )
    assert blocked_jump.status_code == 409
    blocked_payload = blocked_jump.json()
    blocked_message = (
        blocked_payload.get("error", {}).get("message")
        or blocked_payload.get("detail")
        or ""
    )
    assert "Jump cooldown active" in blocked_message

    telemetry = client.get(f"/api/ships/{state['ship_id']}", headers=headers)
    assert telemetry.status_code == 200
    assert telemetry.json()["jump_cooldown_seconds"] > 0
    assert telemetry.json()["jump_cooldown_until"] is not None


def test_ship_jump_requires_sufficient_fuel(client, db_session):
    headers = auth_headers_for(client, "lowfuel@example.com", "lowfuel")
    owner = db_session.query(User).filter(
        User.email == "lowfuel@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.fuel_current = 10
    db_session.commit()

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )

    jump = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={"destination_station_id": state["station_2_id"]},
        headers=headers,
    )
    assert jump.status_code == 409


def test_ship_local_approach_jump_skips_fuel_and_cooldown(client, db_session):
    headers = auth_headers_for(
        client, "localapproach@example.com", "localapproach")
    owner = db_session.query(User).filter(
        User.email == "localapproach@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.fuel_current = 0
    db_session.commit()

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200

    first_local_approach = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={
            "destination_station_id": state["station_2_id"],
            "local_approach": True,
        },
        headers=headers,
    )
    assert first_local_approach.status_code == 200
    assert first_local_approach.json()["fuel_current"] == 0

    second_local_approach = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={
            "destination_station_id": state["station_1_id"],
            "local_approach": True,
        },
        headers=headers,
    )
    assert second_local_approach.status_code == 200
    assert second_local_approach.json()["fuel_current"] == 0


def test_ship_flight_state_update_persists_and_survives_refresh(client, db_session):
    headers = auth_headers_for(
        client, "flightstate@example.com", "flightstate")
    owner = db_session.query(User).filter(
        User.email == "flightstate@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock.status_code == 200

    lock_state = client.post(
        f"/api/ships/{state['ship_id']}/flight-state",
        json={
            "flight_phase": "destination-locked",
            "flight_locked_destination_station_id": state["station_2_id"],
        },
        headers=headers,
    )
    assert lock_state.status_code == 200
    lock_payload = lock_state.json()
    assert lock_payload["flight_phase"] == "destination-locked"
    assert (
        lock_payload["flight_locked_destination_station_id"]
        == state["station_2_id"]
    )
    assert lock_payload["flight_phase_started_at"] is not None

    telemetry = client.get(f"/api/ships/{state['ship_id']}", headers=headers)
    assert telemetry.status_code == 200
    telemetry_payload = telemetry.json()
    assert telemetry_payload["flight_phase"] == "destination-locked"
    assert (
        telemetry_payload["flight_locked_destination_station_id"]
        == state["station_2_id"]
    )


def test_ship_flight_state_update_rejects_invalid_phase(client, db_session):
    headers = auth_headers_for(
        client, "flightinvalid@example.com", "flightinvalid")
    owner = db_session.query(User).filter(
        User.email == "flightinvalid@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    response = client.post(
        f"/api/ships/{state['ship_id']}/flight-state",
        json={
            "flight_phase": "warp-drive",
            "flight_locked_destination_station_id": state["station_1_id"],
        },
        headers=headers,
    )
    assert response.status_code == 422


def test_ship_dock_normalizes_persisted_flight_state(client, db_session):
    headers = auth_headers_for(client, "flightdock@example.com", "flightdock")
    owner = db_session.query(User).filter(
        User.email == "flightdock@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock.status_code == 200

    lock_state = client.post(
        f"/api/ships/{state['ship_id']}/flight-state",
        json={
            "flight_phase": "destination-locked",
            "flight_locked_destination_station_id": state["station_2_id"],
        },
        headers=headers,
    )
    assert lock_state.status_code == 200
    assert lock_state.json()["flight_phase"] == "destination-locked"

    dock = client.post(
        f"/api/ships/{state['ship_id']}/dock",
        json={"station_id": state["station_2_id"]},
        headers=headers,
    )
    assert dock.status_code == 200
    dock_payload = dock.json()
    assert dock_payload["flight_phase"] == "idle"
    assert dock_payload["flight_locked_destination_station_id"] is None


def test_ship_refuel_normalizes_persisted_flight_state(client, db_session):
    headers = auth_headers_for(client, "flightfuel@example.com", "flightfuel")
    owner = db_session.query(User).filter(
        User.email == "flightfuel@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    lock_state = client.post(
        f"/api/ships/{state['ship_id']}/flight-state",
        json={
            "flight_phase": "destination-locked",
            "flight_locked_destination_station_id": state["station_2_id"],
        },
        headers=headers,
    )
    assert lock_state.status_code == 200
    assert lock_state.json()["flight_phase"] == "destination-locked"

    refuel = client.post(
        f"/api/ships/{state['ship_id']}/refuel",
        json={"amount": 10},
        headers=headers,
    )
    assert refuel.status_code == 200
    refuel_payload = refuel.json()
    assert refuel_payload["flight_phase"] == "idle"
    assert refuel_payload["flight_locked_destination_station_id"] is None


def test_ship_dock_after_jump_clears_arrived_phase(client, db_session):
    headers = auth_headers_for(
        client, "arriveddock@example.com", "arriveddock")
    owner = db_session.query(User).filter(
        User.email == "arriveddock@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    first_undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert first_undock.status_code == 200
    move_ship_to_jump_clearance(
        db_session,
        ship_id=state["ship_id"],
        system_id=state["system_id"],
    )

    jump = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={"destination_station_id": state["station_2_id"]},
        headers=headers,
    )
    assert jump.status_code == 200
    assert jump.json()["flight_phase"] == "arrived"

    transfer_to_station = client.post(
        f"/api/ships/{state['ship_id']}/local-target",
        json={
            "action": "transfer",
            "contact_type": "station",
            "contact_id": state["station_2_id"],
        },
        headers=headers,
    )
    assert transfer_to_station.status_code == 200

    dock = client.post(
        f"/api/ships/{state['ship_id']}/dock",
        json={"station_id": state["station_2_id"]},
        headers=headers,
    )
    assert dock.status_code == 200
    dock_payload = dock.json()
    assert dock_payload["flight_phase"] == "idle"
    assert dock_payload["flight_locked_destination_station_id"] is None
    assert dock_payload["status"] == "docked"


def test_ship_jump_requires_100km_clearance_from_local_bodies(client, db_session):
    headers = auth_headers_for(client, "jumpclear@example.com", "jumpclear")
    owner = db_session.query(User).filter(
        User.email == "jumpclear@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock.status_code == 200

    blocked_jump = client.post(
        f"/api/ships/{state['ship_id']}/jump",
        json={"destination_station_id": state["station_2_id"]},
        headers=headers,
    )
    assert blocked_jump.status_code == 409
    blocked_payload = blocked_jump.json()
    blocked_message = (
        blocked_payload.get("error", {}).get("message")
        or blocked_payload.get("detail")
        or ""
    )
    assert "100km clearance" in blocked_message


def test_ship_manual_arrived_update_normalizes_to_idle(client, db_session):
    headers = auth_headers_for(
        client, "manualarrived@example.com", "manualarrived")
    owner = db_session.query(User).filter(
        User.email == "manualarrived@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock.status_code == 200

    update = client.post(
        f"/api/ships/{state['ship_id']}/flight-state",
        json={
            "flight_phase": "arrived",
            "flight_locked_destination_station_id": state["station_2_id"],
        },
        headers=headers,
    )
    assert update.status_code == 200
    update_payload = update.json()
    assert update_payload["flight_phase"] == "idle"
    assert update_payload["flight_locked_destination_station_id"] is None


def test_ship_position_sync_updates_in_space_coordinates(client, db_session):
    headers = auth_headers_for(
        client, "positionsync@example.com", "positionsync")
    owner = db_session.query(User).filter(
        User.email == "positionsync@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=headers,
    )
    assert undock.status_code == 200

    response = client.post(
        f"/api/ships/{state['ship_id']}/position-sync",
        json={
            "position_x": 1234,
            "position_y": 5,
            "position_z": -678,
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["position_x"] == 1234
    assert payload["position_y"] == 5
    assert payload["position_z"] == -678

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    assert int(ship.position_x or 0) == 1234
    assert int(ship.position_y or 0) == 5
    assert int(ship.position_z or 0) == -678


def test_ship_position_sync_rejects_when_docked(client, db_session):
    headers = auth_headers_for(
        client, "positionsyncdocked@example.com", "positionsyncdocked")
    owner = db_session.query(User).filter(
        User.email == "positionsyncdocked@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    response = client.post(
        f"/api/ships/{state['ship_id']}/position-sync",
        json={
            "position_x": 100,
            "position_y": 0,
            "position_z": 100,
        },
        headers=headers,
    )
    assert response.status_code == 409
    error = response.json()
    message = (
        error.get("error", {}).get("message")
        or error.get("detail")
        or ""
    )
    assert "in-space" in message


def test_ship_repair_and_recharge_updates_values_and_credits(client, db_session):
    headers = auth_headers_for(client, "maint@example.com", "maint")
    owner = db_session.query(User).filter(
        User.email == "maint@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.hull_current = 60
    ship.shields_current = 40
    ship.energy_current = 20
    owner.credits = 10_000
    db_session.commit()

    repair = client.post(
        f"/api/ships/{state['ship_id']}/repair",
        json={"amount": 20},
        headers=headers,
    )
    assert repair.status_code == 200
    assert repair.json()["hull_current"] == 80

    recharge = client.post(
        f"/api/ships/{state['ship_id']}/recharge",
        json={"shields_amount": 30, "energy_amount": 50},
        headers=headers,
    )
    assert recharge.status_code == 200
    payload = recharge.json()
    assert payload["shields_current"] == 70
    assert payload["energy_current"] == 70

    db_session.refresh(owner)
    assert owner.credits == 9790

    operations = client.get(
        f"/api/ships/{state['ship_id']}/operations",
        headers=headers,
    )
    assert operations.status_code == 200
    entries = operations.json()
    assert len(entries) >= 2
    assert entries[0]["operation"] == "recharge"
    assert entries[0]["cost_credits"] == 110
    assert entries[1]["operation"] == "repair"
    assert entries[1]["cost_credits"] == 100


def test_ship_maintenance_requires_credits(client, db_session):
    headers = auth_headers_for(client, "creditlock@example.com", "creditlock")
    owner = db_session.query(User).filter(
        User.email == "creditlock@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    ship = db_session.query(Ship).filter(Ship.id == state["ship_id"]).first()
    assert ship is not None
    ship.hull_current = 50
    owner.credits = 5
    db_session.commit()

    repair = client.post(
        f"/api/ships/{state['ship_id']}/repair",
        json={"amount": 10},
        headers=headers,
    )
    assert repair.status_code == 409
    message = repair.json().get("detail") or repair.json().get(
        "error", {}).get("message", "")
    assert "Insufficient credits" in message


def test_ship_operations_log_forbids_non_owner(client, db_session):
    owner_headers = auth_headers_for(
        client, "ownerlog@example.com", "ownerlog")
    owner = db_session.query(User).filter(
        User.email == "ownerlog@example.com"
    ).first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)
    intruder_headers = auth_headers_for(
        client, "intruderlog@example.com", "intruderlog"
    )

    dock = client.post(
        f"/api/ships/{state['ship_id']}/dock",
        json={"station_id": state["station_1_id"]},
        headers=owner_headers,
    )
    assert dock.status_code in (200, 409)

    response = client.get(
        f"/api/ships/{state['ship_id']}/operations",
        headers=intruder_headers,
    )
    assert response.status_code == 403


def test_market_summary_returns_station_rows(client, db_session):
    state = seed_core_state(db_session)

    response = client.get(f"/api/markets/{state['system_id']}/summary")
    assert response.status_code == 200
    payload = response.json()

    assert len(payload) == 3
    station_a = next(
        item for item in payload if item["station_id"] == state["station_1_id"])
    assert station_a["commodity_count"] == 1
    assert station_a["scarcity_count"] == 1
