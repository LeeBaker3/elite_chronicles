from pathlib import Path

import httpx
import pytest

from desktop_client.errors import DesktopAPIError, DesktopContractError
from desktop_client.network_client import NetworkClient
from desktop_client.runtime import DesktopRuntime
from desktop_client.scene_manager import SceneManager
from desktop_client.session_store import SessionState, SessionStore
from desktop_client.ship_controller import ShipController
from desktop_client.system_renderer import build_debug_scene_snapshot


def _mock_comms_response(method: str, path: str) -> httpx.Response | None:
    """Return a default comms response for runtime tests that do not care."""

    if method == "GET" and path == "/api/comms/channels":
        return httpx.Response(
            200,
            json=[
                {
                    "id": "local-station",
                    "name": "Lave Station Ops",
                    "scope": "local",
                    "delay_label": "instant",
                    "unread": 0,
                }
            ],
        )
    if method == "GET" and path == "/api/comms/channels/local-station/messages":
        return httpx.Response(
            200,
            json=[
                {
                    "id": "m1",
                    "author": "Ops",
                    "body": "Hold present course.",
                    "timestamp": "09:40",
                    "direction": "inbound",
                    "delivery": "instant",
                }
            ],
        )
    return None


def test_runtime_bootstrap_uses_saved_session_and_builds_headless_state(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "pilot@example.com",
                    "username": "pilot",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "station",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "GET" and path == "/api/ships/9/flight-snapshot":
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Runtime Ship",
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
                    "ship_version": 12,
                    "current_system_id": 1,
                    "current_system_name": "Lave",
                    "local_snapshot_version": "system-1-gen-1",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:00Z",
                    "suggested_poll_interval_ms": 3000,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/comms/channels":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": "local-station",
                        "name": "Lave Station Ops",
                        "scope": "local",
                        "delay_label": "instant",
                        "unread": 1,
                    }
                ],
            )
        if method == "GET" and path == "/api/comms/channels/local-station/messages":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": "m1",
                        "author": "Ops",
                        "body": "Welcome to Lave Station.",
                        "timestamp": "09:40",
                        "direction": "inbound",
                        "delivery": "instant",
                    }
                ],
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
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
                        "audio_event_hints": ["scanner.ping"],
                    },
                },
            )
        raise AssertionError(f"Unexpected request: {method} {path}")

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(
        access_token="token-1", user_id=5, primary_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    state = runtime.launch(headless=True)
    client.close()

    assert state.player.username == "pilot"
    assert state.ship.id == 9
    assert state.snapshot.local_snapshot_version == "system-1-gen-1"
    assert state.active_scene_name == "hangar"
    assert state.audio_event_hints == ["scanner.ping"]
    assert state.comms.active_channel_id == "local-station"
    assert state.comms.unread_total == 1


def test_runtime_bootstrap_tolerates_missing_comms_endpoint(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "pilot@example.com",
                    "username": "pilot",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "station",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "GET" and path == "/api/ships/9/flight-snapshot":
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Runtime Ship",
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
                    "ship_version": 12,
                    "current_system_id": 1,
                    "current_system_name": "Lave",
                    "local_snapshot_version": "system-1-gen-1",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:00Z",
                    "suggested_poll_interval_ms": 3000,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/comms/channels":
            return httpx.Response(404, json={"error": {"message": "Not found"}})
        if method == "GET" and path == "/api/ships/9/local-contacts":
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
                        "audio_event_hints": ["scanner.ping"],
                    },
                },
            )
        raise AssertionError(f"Unexpected request: {method} {path}")

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(
        access_token="token-1", user_id=5, primary_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    state = runtime.launch(headless=True)
    client.close()

    assert state.comms.channels == []
    assert state.comms.unread_total == 0


def test_runtime_bootstrap_rejects_snapshot_mismatch(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "pilot@example.com",
                    "username": "pilot",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "station",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "GET" and path == "/api/ships/9/flight-snapshot":
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Runtime Ship",
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
                    "ship_version": 12,
                    "current_system_id": 1,
                    "current_system_name": "Lave",
                    "local_snapshot_version": "system-1-gen-1",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:00Z",
                    "suggested_poll_interval_ms": 3000,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
            return httpx.Response(
                200,
                json={
                    "ship_id": 9,
                    "system_id": 1,
                    "system_name": "Lave",
                    "generation_version": 1,
                    "snapshot_version": "system-1-gen-2",
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
        raise AssertionError(f"Unexpected request: {method} {path}")

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(
        access_token="token-1", user_id=5, primary_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    with pytest.raises(DesktopContractError, match="mismatched snapshot version"):
        runtime.bootstrap()
    client.close()


def test_runtime_tick_reuses_cached_local_state_until_snapshot_requests_refresh(tmp_path: Path):
    snapshot_calls = 0
    contacts_calls = 0
    chart_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal snapshot_calls, contacts_calls, chart_calls
        path = request.url.path
        method = request.method
        comms_response = _mock_comms_response(method, path)
        if comms_response is not None:
            return comms_response
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "pilot@example.com",
                    "username": "pilot",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "station",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "GET" and path == "/api/ships/9/flight-snapshot":
            snapshot_calls += 1
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Runtime Ship",
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
                        "flight_phase": "idle",
                        "flight_locked_destination_station_id": None,
                        "flight_locked_destination_contact_type": None,
                        "flight_locked_destination_contact_id": None,
                        "flight_phase_started_at": None,
                        "jump_cooldown_seconds": 0,
                        "jump_cooldown_until": None,
                    },
                    "ship_version": 12 if snapshot_calls == 1 else 13,
                    "current_system_id": 1,
                    "current_system_name": "Lave",
                    "local_snapshot_version": "system-1-gen-1",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:00Z",
                    "suggested_poll_interval_ms": 1250,
                    "refresh_contacts": False,
                    "refresh_chart": False,
                },
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
            contacts_calls += 1
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
            chart_calls += 1
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
        raise AssertionError(f"Unexpected request: {method} {path}")

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(
        access_token="token-1", user_id=5, primary_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    state = runtime.bootstrap()
    tick_result = runtime.tick(state)
    client.close()

    assert snapshot_calls == 2
    assert contacts_calls == 1
    assert chart_calls == 1
    assert tick_result.contacts_refreshed is False
    assert tick_result.chart_refreshed is False
    assert tick_result.state.snapshot.ship_version == 13


def test_runtime_tick_refreshes_local_state_when_snapshot_requests_it(tmp_path: Path):
    snapshot_calls = 0
    contacts_calls = 0
    chart_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal snapshot_calls, contacts_calls, chart_calls
        path = request.url.path
        method = request.method
        comms_response = _mock_comms_response(method, path)
        if comms_response is not None:
            return comms_response
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "pilot@example.com",
                    "username": "pilot",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "station",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "GET" and path == "/api/ships/9/flight-snapshot":
            snapshot_calls += 1
            if snapshot_calls == 1:
                return httpx.Response(
                    200,
                    json={
                        "contract_version": "flight-snapshot.v1",
                        "ship": {
                            "id": 9,
                            "name": "Runtime Ship",
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
                            "flight_phase": "idle",
                            "flight_locked_destination_station_id": None,
                            "flight_locked_destination_contact_type": None,
                            "flight_locked_destination_contact_id": None,
                            "flight_phase_started_at": None,
                            "jump_cooldown_seconds": 0,
                            "jump_cooldown_until": None,
                        },
                        "ship_version": 12,
                        "current_system_id": 1,
                        "current_system_name": "Lave",
                        "local_snapshot_version": "system-1-gen-1",
                        "chart_contract_version": "local-chart.v1",
                        "snapshot_generated_at": "2026-03-12T00:00:00Z",
                        "suggested_poll_interval_ms": 1250,
                        "refresh_contacts": True,
                        "refresh_chart": True,
                    },
                )
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Runtime Ship",
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
                    "ship_version": 13,
                    "current_system_id": 2,
                    "current_system_name": "Zaonce",
                    "local_snapshot_version": "system-2-gen-1",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:03Z",
                    "suggested_poll_interval_ms": 450,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
            contacts_calls += 1
            if contacts_calls == 1:
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
        if method == "GET" and path == "/api/systems/1/local-chart":
            chart_calls += 1
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
            chart_calls += 1
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
        raise AssertionError(f"Unexpected request: {method} {path}")

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(
        access_token="token-1", user_id=5, primary_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    state = runtime.bootstrap()
    tick_result = runtime.tick(state)
    client.close()

    assert snapshot_calls == 2
    assert contacts_calls == 2
    assert chart_calls == 2
    assert tick_result.contacts_refreshed is True
    assert tick_result.chart_refreshed is True
    assert tick_result.state.snapshot.current_system_id == 2
    assert tick_result.state.active_scene_name == "flight"
    assert runtime.scene_manager.state.current_system_name == "Zaonce"


def test_debug_scene_snapshot_builds_render_ready_local_entities(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        comms_response = _mock_comms_response(method, path)
        if comms_response is not None:
            return comms_response
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "pilot@example.com",
                    "username": "pilot",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "station",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "GET" and path == "/api/ships/9/flight-snapshot":
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Runtime Ship",
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
                        "position_x": 100,
                        "position_y": 0,
                        "position_z": 50,
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
                    "ship_version": 12,
                    "current_system_id": 1,
                    "current_system_name": "Lave",
                    "local_snapshot_version": "system-1-gen-1",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:00Z",
                    "suggested_poll_interval_ms": 1250,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
            return httpx.Response(
                200,
                json={
                    "ship_id": 9,
                    "system_id": 1,
                    "system_name": "Lave",
                    "generation_version": 1,
                    "snapshot_version": "system-1-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:01Z",
                    "contacts": [
                        {
                            "id": "station-2",
                            "contact_type": "station",
                            "name": "Lave Station",
                            "distance_km": 25,
                            "bearing_x": 0.0,
                            "bearing_y": 0.0,
                            "relative_x_km": 25,
                            "relative_y_km": 0,
                            "relative_z_km": 0,
                            "scene_x": 25.0,
                            "scene_y": 0.0,
                            "scene_z": 0.0,
                        }
                    ],
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
                    "planets": [
                        {
                            "id": 201,
                            "body_kind": "planet",
                            "body_type": "rocky",
                            "name": "Lave II",
                            "generation_version": 1,
                            "parent_body_id": 101,
                            "orbit_index": 1,
                            "orbit_radius_km": 120,
                            "radius_km": 40,
                            "position_x": 150,
                            "position_y": 0,
                            "position_z": 50,
                            "render_profile": {},
                        }
                    ],
                    "moons_by_parent_body_id": {},
                    "stations": [
                        {
                            "id": 2,
                            "name": "Lave Station",
                            "host_body_id": 201,
                            "orbit_radius_km": 5,
                            "orbit_phase_deg": 0,
                            "position_x": 125,
                            "position_y": 0,
                            "position_z": 50,
                        }
                    ],
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
                        "audio_event_hints": ["scanner.ping"],
                    },
                },
            )
        raise AssertionError(f"Unexpected request: {method} {path}")

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(
        access_token="token-1", user_id=5, primary_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    state = runtime.bootstrap()
    debug_scene = build_debug_scene_snapshot(state)
    client.close()

    assert debug_scene.current_system_name == "Lave"
    assert debug_scene.entity_count == 4
    assert debug_scene.entities[0].entity_type == "station"
    assert debug_scene.entities[0].position.x == 25.0
    assert debug_scene.entities[-1].entity_type == "star"
    assert "scanner.ping" in debug_scene.audio_event_hints


def test_runtime_bootstrap_clears_expired_saved_session(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        _ = request
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
    session_state = SessionState(
        access_token="expired-token", user_id=5, primary_ship_id=9, selected_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="expired-token",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    with pytest.raises(DesktopAPIError):
        runtime.bootstrap()
    client.close()

    assert session_state.access_token is None
    assert session_store.load().access_token is None


def test_runtime_trigger_launch_or_dock_undocks_and_reloads_state(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        comms_response = _mock_comms_response(method, path)
        if comms_response is not None:
            return comms_response
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "pilot@example.com",
                    "username": "pilot",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "station",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "POST" and path == "/api/ships/9/undock":
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Runtime Ship",
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
            status = "docked" if not handler.undocked else "in-space"
            docked_station_id = 1 if not handler.undocked else None
            handler.undocked = True
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Runtime Ship",
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
                        "status": status,
                        "docked_station_id": docked_station_id,
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
                    "ship_version": 12,
                    "current_system_id": 1,
                    "current_system_name": "Lave",
                    "local_snapshot_version": "system-1-gen-1",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:00Z",
                    "suggested_poll_interval_ms": 3000,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
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
        raise AssertionError(f"Unexpected request: {method} {path}")

    handler.undocked = False

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(
        access_token="token-1", user_id=5, primary_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    state = runtime.bootstrap()
    next_state = runtime.trigger_launch_or_dock(state)
    client.close()

    assert next_state.ship.status == "in-space"
    assert next_state.active_scene_name == "flight"


def test_runtime_trigger_launch_or_dock_docks_at_nearest_station(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        comms_response = _mock_comms_response(method, path)
        if comms_response is not None:
            return comms_response
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "pilot@example.com",
                    "username": "pilot",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "space",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "POST" and path == "/api/ships/9/dock":
            payload = request.read().decode("utf-8")
            assert '"station_id": 2' in payload
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Runtime Ship",
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
                    "status": "docked",
                    "docked_station_id": 2,
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
            status = "in-space" if not handler.docked else "docked"
            docked_station_id = None if not handler.docked else 2
            handler.docked = True
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Runtime Ship",
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
                        "status": status,
                        "docked_station_id": docked_station_id,
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
                    "ship_version": 12,
                    "current_system_id": 1,
                    "current_system_name": "Lave",
                    "local_snapshot_version": "system-1-gen-1",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:00Z",
                    "suggested_poll_interval_ms": 3000,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
            return httpx.Response(
                200,
                json={
                    "ship_id": 9,
                    "system_id": 1,
                    "system_name": "Lave",
                    "generation_version": 1,
                    "snapshot_version": "system-1-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:01Z",
                    "contacts": [
                        {
                            "id": "station-2",
                            "contact_type": "station",
                            "name": "Lave Station",
                            "distance_km": 12,
                            "bearing_x": 0.0,
                            "bearing_y": 0.0,
                            "relative_x_km": 12,
                            "relative_y_km": 0,
                            "relative_z_km": 0,
                            "scene_x": 12.0,
                            "scene_y": 0.0,
                            "scene_z": 0.0,
                        }
                    ],
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
        raise AssertionError(f"Unexpected request: {method} {path}")

    handler.docked = False

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(
        access_token="token-1", user_id=5, primary_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    state = runtime.bootstrap()
    next_state = runtime.trigger_launch_or_dock(state)
    client.close()

    assert next_state.ship.status == "docked"
    assert next_state.active_scene_name == "hangar"


def test_runtime_dock_at_station_uses_explicit_station_id(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        comms_response = _mock_comms_response(method, path)
        if comms_response is not None:
            return comms_response
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "pilot@example.com",
                    "username": "pilot",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "space",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "POST" and path == "/api/ships/9/dock":
            payload = request.read().decode("utf-8")
            assert '"station_id": 7' in payload
            return httpx.Response(
                200,
                json={
                    "id": 9,
                    "name": "Runtime Ship",
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
                    "status": "docked",
                    "docked_station_id": 7,
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
            status = "in-space" if not handler.docked else "docked"
            docked_station_id = None if not handler.docked else 7
            handler.docked = True
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Runtime Ship",
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
                        "status": status,
                        "docked_station_id": docked_station_id,
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
                    "ship_version": 12,
                    "current_system_id": 1,
                    "current_system_name": "Lave",
                    "local_snapshot_version": "system-1-gen-1",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:00Z",
                    "suggested_poll_interval_ms": 3000,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
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
        raise AssertionError(f"Unexpected request: {method} {path}")

    handler.docked = False

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(
        access_token="token-1", user_id=5, primary_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    state = runtime.bootstrap()
    next_state = runtime.dock_at_station(state, station_id=7)
    client.close()

    assert next_state.ship.status == "docked"
    assert next_state.ship.docked_station_id == 7


def test_runtime_focus_scanner_contact_logs_visible_selection(tmp_path: Path):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        comms_response = _mock_comms_response(method, path)
        if comms_response is not None:
            return comms_response
        if method == "GET" and path == "/api/players/me":
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "email": "pilot@example.com",
                    "username": "pilot",
                    "role": "user",
                    "credits": 2000,
                    "is_alive": True,
                    "location_type": "space",
                    "location_id": 1,
                    "primary_ship_id": 9,
                },
            )
        if method == "POST" and path == "/api/ships/9/scanner-selection":
            payload = request.read().decode("utf-8")
            assert '"selected_contact_id": "station-2"' in payload
            assert '"source": "desktop-shell"' in payload
            return httpx.Response(200, json={"ok": True})
        if method == "GET" and path == "/api/ships/9/flight-snapshot":
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 9,
                        "name": "Runtime Ship",
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
                        "flight_phase": "idle",
                        "flight_locked_destination_station_id": None,
                        "flight_locked_destination_contact_type": None,
                        "flight_locked_destination_contact_id": None,
                        "flight_phase_started_at": None,
                        "jump_cooldown_seconds": 0,
                        "jump_cooldown_until": None,
                    },
                    "ship_version": 12,
                    "current_system_id": 1,
                    "current_system_name": "Lave",
                    "local_snapshot_version": "system-1-gen-1",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:00Z",
                    "suggested_poll_interval_ms": 3000,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        if method == "GET" and path == "/api/ships/9/local-contacts":
            return httpx.Response(
                200,
                json={
                    "ship_id": 9,
                    "system_id": 1,
                    "system_name": "Lave",
                    "generation_version": 1,
                    "snapshot_version": "system-1-gen-1",
                    "snapshot_generated_at": "2026-03-12T00:00:01Z",
                    "contacts": [
                        {
                            "id": "station-2",
                            "contact_type": "station",
                            "name": "Lave Station",
                            "distance_km": 12,
                            "bearing_x": 0.0,
                            "bearing_y": 0.0,
                            "relative_x_km": 12,
                            "relative_y_km": 0,
                            "relative_z_km": 0,
                            "scene_x": 12.0,
                            "scene_y": 0.0,
                            "scene_z": 0.0,
                        }
                    ],
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
        raise AssertionError(f"Unexpected request: {method} {path}")

    session_store = SessionStore(tmp_path / "session.json")
    session_state = SessionState(
        access_token="token-1", user_id=5, primary_ship_id=9)
    session_store.save(session_state)
    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )
    runtime = DesktopRuntime(
        network_client=client,
        session_store=session_store,
        session_state=session_state,
        scene_manager=SceneManager(),
        ship_controller=ShipController(),
    )

    state = runtime.bootstrap()
    next_state = runtime.focus_scanner_contact(state, contact_id="station-2")
    client.close()

    assert next_state is state
