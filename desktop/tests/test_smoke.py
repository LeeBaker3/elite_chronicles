import httpx

from desktop_client.network_client import NetworkClient
from desktop_client.session_store import SessionState, SessionStore
from desktop_client.smoke import DesktopSmokeRunner, SmokeCredentials, SmokeRunOptions


def test_smoke_runner_executes_full_happy_path(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        if method == "POST" and path == "/api/auth/register":
            return httpx.Response(200, json={"token": "token-1", "user_id": 5})
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "smoke@example.com",
                    "username": "smoke",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "station",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "GET" and path == "/api/ships/9":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": "Core Hub",
                    "docked_station_archetype_shape": "coriolis",
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 100,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 0,
                    "position_y": 0,
                    "position_z": 0,
                    "status": "docked",
                    "docked_station_id": 1,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:00Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "idle",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": None,
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "GET" and path == "/api/ships/9/flight-snapshot":
            if request.url.params.get("after_jump") == "1":
                raise AssertionError("Unexpected query parameter usage in smoke flow")
            snapshot_generated_at = "2026-03-12T00:00:01Z"
            current_system_id = 1
            current_system_name = "Lave"
            local_snapshot_version = "system-1-gen-1"
            position_x = 18
            position_y = 6
            position_z = 18
            flight_phase = "idle"
            fuel_current = 100
            if handler.jump_completed:
                snapshot_generated_at = "2026-03-12T00:00:04Z"
                current_system_id = 2
                current_system_name = "Zaonce"
                local_snapshot_version = "system-2-gen-1"
                position_x = 300
                position_y = 0
                position_z = 300
                flight_phase = "arrived"
                fuel_current = 80
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Smoke Ship",
                        "ship_visual_key": "cobra-mk1",
                        "ship_archetype_id": 1,
                        "render_seed": 99,
                        "docking_computer_tier": "standard",
                        "docking_computer_range_km": 40,
                        "docked_station_archetype_name": None if handler.jump_completed else "Core Hub",
                        "docked_station_archetype_shape": None if handler.jump_completed else "coriolis",
                        "hull_max": 100,
                        "hull_current": 100,
                        "shields_max": 50,
                        "shields_current": 50,
                        "energy_cap": 60,
                        "energy_current": 60,
                        "fuel_current": fuel_current,
                        "fuel_cap": 100,
                        "cargo_capacity": 40,
                        "position_x": position_x,
                        "position_y": position_y,
                        "position_z": position_z,
                        "status": "in-space",
                        "docked_station_id": None,
                        "safe_checkpoint_available": True,
                        "safe_checkpoint_recorded_at": "2026-03-12T00:00:00Z",
                        "crash_recovery_count": 0,
                        "flight_phase": flight_phase,
                        "flight_locked_destination_station_id": None,
                        "flight_locked_destination_contact_type": None,
                        "flight_locked_destination_contact_id": None,
                        "flight_phase_started_at": None,
                        "jump_cooldown_seconds": 0,
                        "jump_cooldown_until": None,
                    },
                    "ship_version": 12 if not handler.jump_completed else 13,
                    "current_system_id": current_system_id,
                    "current_system_name": current_system_name,
                    "local_snapshot_version": local_snapshot_version,
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": snapshot_generated_at,
                    "suggested_poll_interval_ms": 1250,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/stations":
            return httpx.Response(
                200,
                json=[
                    {"id": 1, "name": "Lave Station", "system_id": 1},
                    {"id": 2, "name": "Zaonce Orbital", "system_id": 2},
                ],
            )
        if method == "POST" and path == "/api/ships/9/undock":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": "Core Hub",
                    "docked_station_archetype_shape": "coriolis",
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 100,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 18,
                    "position_y": 6,
                    "position_z": 18,
                    "status": "in-space",
                    "docked_station_id": None,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:00Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "idle",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": None,
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
            if handler.jump_completed:
                return httpx.Response(
                    200,
                    json={
                        "ship_id": 9,
                        "system_id": 2,
                        "system_name": "Zaonce",
                        "generation_version": 1,
                        "snapshot_version": "system-2-gen-1",
                        "snapshot_generated_at": "2026-03-12T00:00:04Z",
                        "contacts": [],
                    },
                )
            return httpx.Response(
                200,
                json={
                    "ship_id": 9,
                    "system_id": 1,
                    "system_name": "Lave",
                    "generation_version": 1,
                    "snapshot_version": "system-1-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:01Z",
                    "contacts": [],
                },
            )
        if method == "GET" and path == "/api/systems/1/local-chart":
            return httpx.Response(
                200,
                json={
                    "snapshot_version": "system-1-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:02Z",
                    "system": {
                        "id": 1,
                        "name": "Lave",
                        "generation_version": 1,
                        "seed_hash": "seedhash12345",
                        "contract_version": "local-chart.v1",
                    },
                    "star": {
                        "id": 101,
                        "body_kind": "star",
                        "body_type": "yellow",
                        "name": "Lave Prime",
                        "generation_version": 1,
                        "parent_body_id": None,
                        "orbit_index": 0,
                        "orbit_radius_km": 0,
                        "radius_km": 1000,
                        "position_x": 0,
                        "position_y": 0,
                        "position_z": 0,
                        "render_profile": {},
                    },
                    "planets": [],
                    "moons_by_parent_body_id": {},
                    "stations": [],
                    "mutable_state": {
                        "economy_tick_cursor": 1,
                        "politics_tick_cursor": 1,
                        "last_economy_tick_at": None,
                        "last_politics_tick_at": None,
                        "security_level": "medium",
                        "stability_score": 50,
                        "flight_phase": "idle",
                        "transition_started_at": None,
                        "local_target_contact_type": None,
                        "local_target_contact_id": None,
                        "local_target_status": "none",
                        "audio_event_hints": [],
                    },
                },
            )
        if method == "GET" and path == "/api/systems/2/local-chart":
            return httpx.Response(
                200,
                json={
                    "snapshot_version": "system-2-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:04Z",
                    "system": {
                        "id": 2,
                        "name": "Zaonce",
                        "generation_version": 1,
                        "seed_hash": "seedhash99999",
                        "contract_version": "local-chart.v1",
                    },
                    "star": {
                        "id": 201,
                        "body_kind": "star",
                        "body_type": "yellow",
                        "name": "Zaonce Prime",
                        "generation_version": 1,
                        "parent_body_id": None,
                        "orbit_index": 0,
                        "orbit_radius_km": 0,
                        "radius_km": 1000,
                        "position_x": 0,
                        "position_y": 0,
                        "position_z": 0,
                        "render_profile": {},
                    },
                    "planets": [],
                    "moons_by_parent_body_id": {},
                    "stations": [],
                    "mutable_state": {
                        "economy_tick_cursor": 1,
                        "politics_tick_cursor": 1,
                        "last_economy_tick_at": None,
                        "last_politics_tick_at": None,
                        "security_level": "medium",
                        "stability_score": 50,
                        "flight_phase": "arrived",
                        "transition_started_at": None,
                        "local_target_contact_type": None,
                        "local_target_contact_id": None,
                        "local_target_status": "none",
                        "audio_event_hints": [],
                    },
                },
            )
        if method == "GET" and path == "/api/ships/9/jump-plan":
            return httpx.Response(
                200,
                json={
                    "current_system_id": 1,
                    "requested_destination_station_id": 2,
                    "requested_destination_system_id": None,
                    "recommended_destination_station_id": 2,
                    "recommended_destination_system_id": 2,
                    "requested_mode": "hyperspace",
                    "recommended_mode": "hyperspace",
                    "requested_action_executable": True,
                    "recommended_action_executable": True,
                    "next_action": "jump",
                    "next_action_executable": True,
                    "next_action_message": None,
                    "requires_undock": False,
                    "blocked_reason_code": None,
                    "blocked_reason_message": None,
                    "nearest_clearance_contact_name": None,
                    "nearest_clearance_distance_km": None,
                    "clearance_required_km": 100,
                    "clearance_waypoint_x": None,
                    "clearance_waypoint_y": None,
                    "clearance_waypoint_z": None,
                },
            )
        if method == "POST" and path == "/api/ships/9/jump":
            handler.jump_completed = True
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": None,
                    "docked_station_archetype_shape": None,
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 80,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 300,
                    "position_y": 0,
                    "position_z": 300,
                    "status": "in-space",
                    "docked_station_id": None,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:03Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "arrived",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": "2026-03-12T00:00:03Z",
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "POST" and path == "/api/ships/9/local-target":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": None,
                    "docked_station_archetype_shape": None,
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 80,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 22,
                    "position_y": 0,
                    "position_z": 22,
                    "status": "in-space",
                    "docked_station_id": None,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:04Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "arrived",
                    "flight_locked_destination_station_id": 2,
                    "flight_locked_destination_contact_type": "station",
                    "flight_locked_destination_contact_id": 2,
                    "flight_phase_started_at": "2026-03-12T00:00:04Z",
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "POST" and path == "/api/ships/9/dock":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": "Orbital",
                    "docked_station_archetype_shape": "orbis",
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 80,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 22,
                    "position_y": 0,
                    "position_z": 22,
                    "status": "docked",
                    "docked_station_id": 2,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:05Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "idle",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": "2026-03-12T00:00:05Z",
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "GET" and path == "/api/stations/2/inventory":
            return httpx.Response(
                200,
                json=[
                    {
                        "name": "Food",
                        "commodity_id": 11,
                        "quantity": 20,
                        "buy_price": 100,
                        "sell_price": 90,
                    }
                ],
            )
        if method == "POST" and path == "/api/stations/2/trade":
            return httpx.Response(
                200,
                json={"status": "ok", "remaining": 19, "credits": 1900},
            )
        if method == "GET" and path == "/api/ships/9/cargo":
            return httpx.Response(
                200,
                json={
                    "ship_id": 9,
                    "cargo_capacity": 40,
                    "cargo_used": 0,
                    "cargo_free": 40,
                    "items": [],
                },
            )
        raise AssertionError(f"Unexpected request: {method} {path}")

    handler.jump_completed = False

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState()
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
    )
    runner = DesktopSmokeRunner(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
    )

    result = runner.run(
        auth_mode="register",
        credentials=SmokeCredentials(
            email="smoke@example.com",
            username="smoke",
            password="pilot123",
        ),
    )
    client.close()

    assert result.ok is True
    assert [step.name for step in result.steps[:9]] == [
        "login",
        "load_player",
        "load_ship",
        "undock",
        "flight_snapshot",
        "local_contacts",
        "local_chart",
        "jump",
        "arrival_snapshot",
    ]
    assert result.steps[-1].name == "trade"
    assert result.steps[-1].status == "ok"


def test_smoke_runner_supports_saved_session_mode_and_explicit_destination(tmp_path):
    jump_payloads: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 7,
                    "email": "saved@example.com",
                    "username": "saved",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "station",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "GET" and path == "/api/ships/9":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": "Core Hub",
                    "docked_station_archetype_shape": "coriolis",
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 100,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 0,
                    "position_y": 0,
                    "position_z": 0,
                    "status": "in-space",
                    "docked_station_id": None,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:00Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "idle",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": None,
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "GET" and path == "/api/ships/9/flight-snapshot":
            current_system_id = 1
            current_system_name = "Lave"
            local_snapshot_version = "system-1-gen-1"
            if handler.jump_completed:
                current_system_id = 3
                current_system_name = "Diso"
                local_snapshot_version = "system-3-gen-1"
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Smoke Ship",
                        "ship_visual_key": "cobra-mk1",
                        "ship_archetype_id": 1,
                        "render_seed": 99,
                        "docking_computer_tier": "standard",
                        "docking_computer_range_km": 40,
                        "docked_station_archetype_name": None,
                        "docked_station_archetype_shape": None,
                        "hull_max": 100,
                        "hull_current": 100,
                        "shields_max": 50,
                        "shields_current": 50,
                        "energy_cap": 60,
                        "energy_current": 60,
                        "fuel_current": 100,
                        "fuel_cap": 100,
                        "cargo_capacity": 40,
                        "position_x": 0,
                        "position_y": 0,
                        "position_z": 0,
                        "status": "in-space",
                        "docked_station_id": None,
                        "safe_checkpoint_available": True,
                        "safe_checkpoint_recorded_at": "2026-03-12T00:00:00Z",
                        "crash_recovery_count": 0,
                        "flight_phase": "idle" if not handler.jump_completed else "arrived",
                        "flight_locked_destination_station_id": None,
                        "flight_locked_destination_contact_type": None,
                        "flight_locked_destination_contact_id": None,
                        "flight_phase_started_at": None,
                        "jump_cooldown_seconds": 0,
                        "jump_cooldown_until": None,
                    },
                    "ship_version": 20 if not handler.jump_completed else 21,
                    "current_system_id": current_system_id,
                    "current_system_name": current_system_name,
                    "local_snapshot_version": local_snapshot_version,
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:01Z",
                    "suggested_poll_interval_ms": 1250,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/stations":
            return httpx.Response(
                200,
                json=[
                    {"id": 1, "name": "Lave Station", "system_id": 1},
                    {"id": 2, "name": "Zaonce Orbital", "system_id": 2},
                    {"id": 3, "name": "Diso Hub", "system_id": 3},
                ],
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
            if handler.jump_completed:
                return httpx.Response(
                    200,
                    json={
                        "ship_id": 9,
                        "system_id": 3,
                        "system_name": "Diso",
                        "generation_version": 1,
                        "snapshot_version": "system-3-gen-1",
                        "snapshot_generated_at": "2026-03-12T00:00:03Z",
                        "contacts": [],
                    },
                )
            return httpx.Response(
                200,
                json={
                    "ship_id": 9,
                    "system_id": 1,
                    "system_name": "Lave",
                    "generation_version": 1,
                    "snapshot_version": "system-1-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:01Z",
                    "contacts": [],
                },
            )
        if method == "GET" and path == "/api/systems/1/local-chart":
            return httpx.Response(
                200,
                json={
                    "snapshot_version": "system-1-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:02Z",
                    "system": {
                        "id": 1,
                        "name": "Lave",
                        "generation_version": 1,
                        "seed_hash": "seedhash12345",
                        "contract_version": "local-chart.v1",
                    },
                    "star": {
                        "id": 101,
                        "body_kind": "star",
                        "body_type": "yellow",
                        "name": "Lave Prime",
                        "generation_version": 1,
                        "parent_body_id": None,
                        "orbit_index": 0,
                        "orbit_radius_km": 0,
                        "radius_km": 1000,
                        "position_x": 0,
                        "position_y": 0,
                        "position_z": 0,
                        "render_profile": {},
                    },
                    "planets": [],
                    "moons_by_parent_body_id": {},
                    "stations": [],
                    "mutable_state": {
                        "economy_tick_cursor": 1,
                        "politics_tick_cursor": 1,
                        "last_economy_tick_at": None,
                        "last_politics_tick_at": None,
                        "security_level": "medium",
                        "stability_score": 50,
                        "flight_phase": "idle",
                        "transition_started_at": None,
                        "local_target_contact_type": None,
                        "local_target_contact_id": None,
                        "local_target_status": "none",
                        "audio_event_hints": [],
                    },
                },
            )
        if method == "GET" and path == "/api/systems/3/local-chart":
            return httpx.Response(
                200,
                json={
                    "snapshot_version": "system-3-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:03Z",
                    "system": {
                        "id": 3,
                        "name": "Diso",
                        "generation_version": 1,
                        "seed_hash": "seedhash33333",
                        "contract_version": "local-chart.v1",
                    },
                    "star": {
                        "id": 301,
                        "body_kind": "star",
                        "body_type": "yellow",
                        "name": "Diso Prime",
                        "generation_version": 1,
                        "parent_body_id": None,
                        "orbit_index": 0,
                        "orbit_radius_km": 0,
                        "radius_km": 1000,
                        "position_x": 0,
                        "position_y": 0,
                        "position_z": 0,
                        "render_profile": {},
                    },
                    "planets": [],
                    "moons_by_parent_body_id": {},
                    "stations": [],
                    "mutable_state": {
                        "economy_tick_cursor": 1,
                        "politics_tick_cursor": 1,
                        "last_economy_tick_at": None,
                        "last_politics_tick_at": None,
                        "security_level": "medium",
                        "stability_score": 50,
                        "flight_phase": "arrived",
                        "transition_started_at": None,
                        "local_target_contact_type": None,
                        "local_target_contact_id": None,
                        "local_target_status": "none",
                        "audio_event_hints": [],
                    },
                },
            )
        if method == "GET" and path == "/api/ships/9/jump-plan":
            return httpx.Response(
                200,
                json={
                    "current_system_id": 1,
                    "requested_destination_station_id": 3,
                    "requested_destination_system_id": None,
                    "recommended_destination_station_id": 3,
                    "recommended_destination_system_id": 3,
                    "requested_mode": "hyperspace",
                    "recommended_mode": "hyperspace",
                    "requested_action_executable": True,
                    "recommended_action_executable": True,
                    "next_action": "jump",
                    "next_action_executable": True,
                    "next_action_message": None,
                    "requires_undock": False,
                    "blocked_reason_code": None,
                    "blocked_reason_message": None,
                    "nearest_clearance_contact_name": None,
                    "nearest_clearance_distance_km": None,
                    "clearance_required_km": 100,
                    "clearance_waypoint_x": None,
                    "clearance_waypoint_y": None,
                    "clearance_waypoint_z": None,
                },
            )
        if method == "POST" and path == "/api/ships/9/jump":
            handler.jump_completed = True
            jump_payloads.append(request.read().decode("utf-8"))
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": None,
                    "docked_station_archetype_shape": None,
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 80,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 300,
                    "position_y": 0,
                    "position_z": 300,
                    "status": "in-space",
                    "docked_station_id": None,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:03Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "arrived",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": "2026-03-12T00:00:03Z",
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "POST" and path == "/api/ships/9/local-target":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": None,
                    "docked_station_archetype_shape": None,
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 80,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 22,
                    "position_y": 0,
                    "position_z": 22,
                    "status": "in-space",
                    "docked_station_id": None,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:04Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "arrived",
                    "flight_locked_destination_station_id": 3,
                    "flight_locked_destination_contact_type": "station",
                    "flight_locked_destination_contact_id": 3,
                    "flight_phase_started_at": "2026-03-12T00:00:04Z",
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "POST" and path == "/api/ships/9/dock":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": "Orbital",
                    "docked_station_archetype_shape": "orbis",
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 80,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 22,
                    "position_y": 0,
                    "position_z": 22,
                    "status": "docked",
                    "docked_station_id": 3,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:05Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "idle",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": "2026-03-12T00:00:05Z",
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "GET" and path == "/api/stations/3/inventory":
            return httpx.Response(
                200,
                json=[
                    {
                        "name": "Food",
                        "commodity_id": 11,
                        "quantity": 20,
                        "buy_price": 100,
                        "sell_price": 90,
                    }
                ],
            )
        if method == "POST" and path == "/api/stations/3/trade":
            return httpx.Response(
                200,
                json={"status": "ok", "remaining": 19, "credits": 1900},
            )
        raise AssertionError(f"Unexpected request: {method} {path}")

    handler.jump_completed = False

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(access_token="saved-token", user_id=7, primary_ship_id=9, selected_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="saved-token",
    )
    runner = DesktopSmokeRunner(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
    )

    result = runner.run(
        auth_mode="session",
        credentials=SmokeCredentials(email="", username="", password=""),
        options=SmokeRunOptions(destination_station_id=3),
    )
    client.close()

    assert result.ok is True
    assert result.steps[0].message == "Reused saved session for saved."
    assert '"destination_station_id": 3' in jump_payloads[0]


def test_smoke_runner_clears_saved_session_on_auth_expiry(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={
                "error": {
                    "code": "unauthorized",
                    "message": "Session expired",
                }
            },
        )

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(access_token="expired-token", user_id=7, primary_ship_id=9, selected_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="expired-token",
    )
    runner = DesktopSmokeRunner(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
    )

    result = runner.run(
        auth_mode="session",
        credentials=SmokeCredentials(email="", username="", password=""),
    )
    client.close()

    assert result.ok is False
    assert result.steps[-1].status == "failed"
    assert session_store.load().access_token is None
    assert session_state.access_token is None


def test_smoke_runner_uses_backend_jump_plan_when_hyperspace_is_clearance_blocked(tmp_path):
    jump_attempts = 0
    jump_plan_requests = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal jump_attempts, jump_plan_requests
        path = request.url.path
        method = request.method
        if method == "POST" and path == "/api/auth/register":
            return httpx.Response(200, json={"token": "token-1", "user_id": 5})
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "smoke@example.com",
                    "username": "smoke",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "station",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "GET" and path == "/api/ships/9":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": "Core Hub",
                    "docked_station_archetype_shape": "coriolis",
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 100,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 0,
                    "position_y": 0,
                    "position_z": 0,
                    "status": "docked",
                    "docked_station_id": 1,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:00Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "idle",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": None,
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "GET" and path == "/api/ships/9/flight-snapshot":
            current_system_id = 1
            current_system_name = "Lave"
            local_snapshot_version = "system-1-gen-1"
            if handler.jump_completed:
                current_system_id = 2
                current_system_name = "Zaonce"
                local_snapshot_version = "system-2-gen-1"
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Smoke Ship",
                        "ship_visual_key": "cobra-mk1",
                        "ship_archetype_id": 1,
                        "render_seed": 99,
                        "docking_computer_tier": "standard",
                        "docking_computer_range_km": 40,
                        "docked_station_archetype_name": None,
                        "docked_station_archetype_shape": None,
                        "hull_max": 100,
                        "hull_current": 100,
                        "shields_max": 50,
                        "shields_current": 50,
                        "energy_cap": 60,
                        "energy_current": 60,
                        "fuel_current": 100 if not handler.jump_completed else 80,
                        "fuel_cap": 100,
                        "cargo_capacity": 40,
                        "position_x": 18 if not handler.jump_completed else 300,
                        "position_y": 6 if not handler.jump_completed else 0,
                        "position_z": 18 if not handler.jump_completed else 300,
                        "status": "in-space",
                        "docked_station_id": None,
                        "safe_checkpoint_available": True,
                        "safe_checkpoint_recorded_at": "2026-03-12T00:00:00Z",
                        "crash_recovery_count": 0,
                        "flight_phase": "idle" if not handler.jump_completed else "arrived",
                        "flight_locked_destination_station_id": None,
                        "flight_locked_destination_contact_type": None,
                        "flight_locked_destination_contact_id": None,
                        "flight_phase_started_at": None,
                        "jump_cooldown_seconds": 0,
                        "jump_cooldown_until": None,
                    },
                    "ship_version": 30 if not handler.jump_completed else 31,
                    "current_system_id": current_system_id,
                    "current_system_name": current_system_name,
                    "local_snapshot_version": local_snapshot_version,
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:01Z",
                    "suggested_poll_interval_ms": 1250,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/stations":
            return httpx.Response(
                200,
                json=[
                    {"id": 1, "name": "Lave Station", "system_id": 1},
                    {"id": 2, "name": "Zaonce Orbital", "system_id": 2},
                    {"id": 3, "name": "Lave Relay", "system_id": 1},
                ],
            )
        if method == "POST" and path == "/api/ships/9/undock":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": "Core Hub",
                    "docked_station_archetype_shape": "coriolis",
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 100,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 18,
                    "position_y": 6,
                    "position_z": 18,
                    "status": "in-space",
                    "docked_station_id": None,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:00Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "idle",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": None,
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
            if handler.jump_completed:
                return httpx.Response(
                    200,
                    json={
                        "ship_id": 9,
                        "system_id": 2,
                        "system_name": "Zaonce",
                        "generation_version": 1,
                        "snapshot_version": "system-2-gen-1",
                        "snapshot_generated_at": "2026-03-12T00:00:03Z",
                        "contacts": [],
                    },
                )
            return httpx.Response(
                200,
                json={
                    "ship_id": 9,
                    "system_id": 1,
                    "system_name": "Lave",
                    "generation_version": 1,
                    "snapshot_version": "system-1-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:01Z",
                    "contacts": [],
                },
            )
        if method == "GET" and path == "/api/systems/1/local-chart":
            return httpx.Response(
                200,
                json={
                    "snapshot_version": "system-1-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:02Z",
                    "system": {
                        "id": 1,
                        "name": "Lave",
                        "generation_version": 1,
                        "seed_hash": "seedhash12345",
                        "contract_version": "local-chart.v1",
                    },
                    "star": {
                        "id": 101,
                        "body_kind": "star",
                        "body_type": "yellow",
                        "name": "Lave Prime",
                        "generation_version": 1,
                        "parent_body_id": None,
                        "orbit_index": 0,
                        "orbit_radius_km": 0,
                        "radius_km": 1000,
                        "position_x": 0,
                        "position_y": 0,
                        "position_z": 0,
                        "render_profile": {},
                    },
                    "planets": [],
                    "moons_by_parent_body_id": {},
                    "stations": [],
                    "mutable_state": {
                        "economy_tick_cursor": 1,
                        "politics_tick_cursor": 1,
                        "last_economy_tick_at": None,
                        "last_politics_tick_at": None,
                        "security_level": "medium",
                        "stability_score": 50,
                        "flight_phase": "idle",
                        "transition_started_at": None,
                        "local_target_contact_type": None,
                        "local_target_contact_id": None,
                        "local_target_status": "none",
                        "audio_event_hints": [],
                    },
                },
            )
        if method == "GET" and path == "/api/systems/2/local-chart":
            return httpx.Response(
                200,
                json={
                    "snapshot_version": "system-2-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:03Z",
                    "system": {
                        "id": 2,
                        "name": "Zaonce",
                        "generation_version": 1,
                        "seed_hash": "seedhash22222",
                        "contract_version": "local-chart.v1",
                    },
                    "star": {
                        "id": 201,
                        "body_kind": "star",
                        "body_type": "yellow",
                        "name": "Zaonce Prime",
                        "generation_version": 1,
                        "parent_body_id": None,
                        "orbit_index": 0,
                        "orbit_radius_km": 0,
                        "radius_km": 1000,
                        "position_x": 0,
                        "position_y": 0,
                        "position_z": 0,
                        "render_profile": {},
                    },
                    "planets": [],
                    "moons_by_parent_body_id": {},
                    "stations": [],
                    "mutable_state": {
                        "economy_tick_cursor": 1,
                        "politics_tick_cursor": 1,
                        "last_economy_tick_at": None,
                        "last_politics_tick_at": None,
                        "security_level": "medium",
                        "stability_score": 50,
                        "flight_phase": "arrived",
                        "transition_started_at": None,
                        "local_target_contact_type": None,
                        "local_target_contact_id": None,
                        "local_target_status": "none",
                        "audio_event_hints": [],
                    },
                },
            )
        if method == "GET" and path == "/api/ships/9/jump-plan":
            jump_plan_requests += 1
            if jump_plan_requests == 1:
                return httpx.Response(
                    200,
                    json={
                        "current_system_id": 1,
                        "requested_destination_station_id": 2,
                        "requested_destination_system_id": None,
                        "recommended_destination_station_id": 2,
                        "recommended_destination_system_id": 2,
                        "requested_mode": "hyperspace",
                        "recommended_mode": "hyperspace",
                        "requested_action_executable": False,
                        "recommended_action_executable": True,
                        "next_action": "gain_clearance",
                        "next_action_executable": True,
                        "next_action_message": "Move to the recommended clearance waypoint before initiating hyperspace.",
                        "requires_undock": False,
                        "blocked_reason_code": "clearance_required",
                        "blocked_reason_message": "Hyperspace jump requires at least 100km clearance",
                        "nearest_clearance_contact_name": "station Lave Station",
                        "nearest_clearance_distance_km": 8,
                        "clearance_required_km": 100,
                        "clearance_waypoint_x": 120,
                        "clearance_waypoint_y": 0,
                        "clearance_waypoint_z": 0,
                    },
                )
            return httpx.Response(
                200,
                json={
                    "current_system_id": 1,
                    "requested_destination_station_id": 2,
                    "requested_destination_system_id": None,
                    "recommended_destination_station_id": 2,
                    "recommended_destination_system_id": 2,
                    "requested_mode": "hyperspace",
                    "recommended_mode": "hyperspace",
                    "requested_action_executable": True,
                    "recommended_action_executable": True,
                    "next_action": "jump",
                    "next_action_executable": True,
                    "next_action_message": None,
                    "requires_undock": False,
                    "blocked_reason_code": None,
                    "blocked_reason_message": None,
                    "nearest_clearance_contact_name": None,
                    "nearest_clearance_distance_km": None,
                    "clearance_required_km": 100,
                    "clearance_waypoint_x": None,
                    "clearance_waypoint_y": None,
                    "clearance_waypoint_z": None,
                },
            )
        if method == "POST" and path == "/api/ships/9/navigation-intent":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": None,
                    "docked_station_archetype_shape": None,
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 100,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 120,
                    "position_y": 0,
                    "position_z": 0,
                    "status": "in-space",
                    "docked_station_id": None,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:02Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "idle",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": None,
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "POST" and path == "/api/ships/9/jump":
            jump_attempts += 1
            handler.jump_completed = True
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": None,
                    "docked_station_archetype_shape": None,
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 80,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 300,
                    "position_y": 0,
                    "position_z": 300,
                    "status": "in-space",
                    "docked_station_id": None,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:03Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "arrived",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": "2026-03-12T00:00:03Z",
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "POST" and path == "/api/ships/9/local-target":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": None,
                    "docked_station_archetype_shape": None,
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 80,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 22,
                    "position_y": 0,
                    "position_z": 22,
                    "status": "in-space",
                    "docked_station_id": None,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:04Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "arrived",
                    "flight_locked_destination_station_id": 2,
                    "flight_locked_destination_contact_type": "station",
                    "flight_locked_destination_contact_id": 2,
                    "flight_phase_started_at": "2026-03-12T00:00:04Z",
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "POST" and path == "/api/ships/9/dock":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Smoke Ship",
                    "ship_visual_key": "cobra-mk1",
                    "ship_archetype_id": 1,
                    "render_seed": 99,
                    "docking_computer_tier": "standard",
                    "docking_computer_range_km": 40,
                    "docked_station_archetype_name": "Relay",
                    "docked_station_archetype_shape": "orbis",
                    "hull_max": 100,
                    "hull_current": 100,
                    "shields_max": 50,
                    "shields_current": 50,
                    "energy_cap": 60,
                    "energy_current": 60,
                    "fuel_current": 80,
                    "fuel_cap": 100,
                    "cargo_capacity": 40,
                    "position_x": 22,
                    "position_y": 0,
                    "position_z": 22,
                    "status": "docked",
                    "docked_station_id": 2,
                    "safe_checkpoint_available": True,
                    "safe_checkpoint_recorded_at": "2026-03-12T00:00:05Z",
                    "crash_recovery_count": 0,
                    "flight_phase": "idle",
                    "flight_locked_destination_station_id": None,
                    "flight_locked_destination_contact_type": None,
                    "flight_locked_destination_contact_id": None,
                    "flight_phase_started_at": "2026-03-12T00:00:05Z",
                    "jump_cooldown_seconds": 0,
                    "jump_cooldown_until": None,
                },
            )
        if method == "GET" and path == "/api/stations/2/inventory":
            return httpx.Response(
                200,
                json=[
                    {
                        "name": "Food",
                        "commodity_id": 11,
                        "quantity": 20,
                        "buy_price": 100,
                        "sell_price": 90,
                    }
                ],
            )
        if method == "POST" and path == "/api/stations/2/trade":
            return httpx.Response(
                200,
                json={"status": "ok", "remaining": 19, "credits": 1900},
            )
        raise AssertionError(f"Unexpected request: {method} {path}")

    handler.jump_completed = False

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState()
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
    )
    runner = DesktopSmokeRunner(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
    )

    result = runner.run(
        auth_mode="register",
        credentials=SmokeCredentials(
            email="smoke@example.com",
            username="smoke",
            password="pilot123",
        ),
    )
    client.close()

    assert result.ok is True
    assert jump_attempts == 1
    assert jump_plan_requests == 2
    assert result.steps[7].name == "gain_clearance"
    assert result.steps[8].name == "jump"
    assert "Move to the recommended clearance waypoint" in result.steps[7].message
