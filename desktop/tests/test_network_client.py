import httpx
import pytest

from desktop_client.errors import DesktopAPIError
from desktop_client.network_client import NetworkClient


def test_network_client_parses_structured_error_envelope():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={
                "error": {
                    "code": "unauthorized",
                    "message": "Session expired",
                    "details": None,
                    "trace_id": "trace-1",
                }
            },
        )

    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(DesktopAPIError) as exc_info:
        client.fetch_player_me()
    client.close()

    assert exc_info.value.status_code == 401
    assert exc_info.value.code == "unauthorized"
    assert exc_info.value.trace_id == "trace-1"


def test_network_client_normalizes_local_snapshot_versions():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/ships/7/local-contacts":
            return httpx.Response(
                200,
                json={
                    "ship_id": 7,
                    "system_id": 2,
                    "system_name": "Lave",
                    "generation_version": 3,
                    "snapshot_version": "",
                    "snapshot_generated_at": "2026-03-12T00:00:00Z",
                    "contacts": [],
                },
            )
        if request.url.path == "/api/systems/2/local-chart":
            return httpx.Response(
                200,
                json={
                    "snapshot_version": "",
                    "snapshot_generated_at": "2026-03-12T00:00:01Z",
                    "system": {
                        "id": 2,
                        "name": "Lave",
                        "generation_version": 3,
                        "seed_hash": "123456789abc",
                        "contract_version": "",
                    },
                    "star": {
                        "id": 1,
                        "body_kind": "star",
                        "body_type": "yellow",
                        "name": "Lave Prime",
                        "generation_version": 3,
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
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )

    contacts = client.fetch_local_contacts(7)
    chart = client.fetch_local_chart(2)
    client.close()

    assert contacts.snapshot_version == "system-2-gen-3"
    assert chart.snapshot_version == "system-2-gen-3"
    assert chart.system.contract_version == "local-chart.v0"


def test_network_client_parses_jump_plan():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/ships/7/jump-plan":
            return httpx.Response(
                200,
                json={
                    "current_system_id": 1,
                    "requested_destination_station_id": 2,
                    "requested_destination_system_id": None,
                    "recommended_destination_station_id": 2,
                    "recommended_destination_system_id": 9,
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
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )

    plan = client.fetch_jump_plan(ship_id=7, destination_station_id=2)
    client.close()

    assert plan.recommended_mode == "hyperspace"
    assert plan.next_action == "gain_clearance"
    assert plan.clearance_waypoint_x == 120
    assert plan.blocked_reason_code == "clearance_required"


def test_network_client_applies_navigation_intent():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/ships/7/navigation-intent":
            return httpx.Response(
                200,
                json={
                    "id": 7,
                    "name": "Runner",
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
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )

    ship = client.apply_navigation_intent(
        ship_id=7,
        action="gain_clearance",
        destination_station_id=2,
    )
    client.close()

    assert ship.position_x == 120
    assert ship.status == "in-space"


def test_network_client_parses_flight_snapshot():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/ships/7/flight-snapshot":
            return httpx.Response(
                200,
                json={
                    "contract_version": "flight-snapshot.v1",
                    "ship": {
                        "id": 7,
                        "name": "Runner",
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
                    "current_system_id": 2,
                    "current_system_name": "Lave",
                    "local_snapshot_version": "system-2-gen-3",
                    "chart_contract_version": "local-chart.v1",
                    "snapshot_generated_at": "2026-03-12T00:00:01Z",
                    "suggested_poll_interval_ms": 1250,
                    "refresh_contacts": True,
                    "refresh_chart": True,
                },
            )
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    client = NetworkClient(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
        access_token="token-1",
    )

    snapshot = client.fetch_flight_snapshot(7)
    client.close()

    assert snapshot.contract_version == "flight-snapshot.v1"
    assert snapshot.ship_version == 12
    assert snapshot.local_snapshot_version == "system-2-gen-3"
    assert snapshot.suggested_poll_interval_ms == 1250
