from pathlib import Path

import httpx

from desktop_client.network_client import NetworkClient
from desktop_client.runtime import DesktopRuntime
from desktop_client.scene_manager import SceneManager
from desktop_client.session_store import SessionState, SessionStore
from desktop_client.ship_controller import ShipController
from desktop_client.system_renderer import build_debug_scene_snapshot
from desktop_client.ui import build_retro_cockpit_hud
from desktop_client.ui.retro_console import sanitize_display_text


def test_sanitize_display_text_maps_unicode_to_ascii_safe_text():
    assert (
        sanitize_display_text("Lave ↔ Diso — relay · delayed")
        == "Lave <-> Diso - relay - delayed"
    )


def test_retro_cockpit_hud_uses_arch_geometry_and_comms_ready_panel(tmp_path: Path):
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
                        "docked_station_archetype_name": None,
                        "docked_station_archetype_shape": None,
                        "hull_max": 100,
                        "hull_current": 75,
                        "shields_max": 50,
                        "shields_current": 25,
                        "energy_cap": 60,
                        "energy_current": 30,
                        "fuel_current": 40,
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
        if method == "GET" and path == "/api/comms/channels":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": "local-station",
                        "name": "Lave Station Ops",
                        "scope": "local",
                        "delay_label": "instant",
                        "unread": 2,
                    },
                    {
                        "id": "relay-vega-lave",
                        "name": "Vega-Lave Relay",
                        "scope": "interstellar",
                        "delay_label": "7m relay",
                        "unread": 0,
                    },
                ],
            )
        if method == "GET" and path == "/api/comms/channels/local-station/messages":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": "m1",
                        "author": "Ops",
                        "body": "Pad 12 remains reserved for returning traffic.",
                        "timestamp": "09:40",
                        "direction": "inbound",
                        "delivery": "instant",
                    },
                    {
                        "id": "m2",
                        "author": "Traffic",
                        "body": "Maintain approach vector and report cargo anomalies.",
                        "timestamp": "09:41",
                        "direction": "inbound",
                        "delivery": "instant",
                    },
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
                    "planets": [],
                    "moons_by_parent_body_id": {},
                    "stations": [
                        {
                            "id": 2,
                            "name": "Lave Station",
                            "host_body_id": None,
                            "orbit_radius_km": None,
                            "orbit_phase_deg": None,
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
    debug_scene = build_debug_scene_snapshot(state)
    hud = build_retro_cockpit_hud(
        state=state,
        debug_scene=debug_scene,
        theme_name="merchant-amber",
    )
    client.close()

    assert hud.geometry.lower_console_profile == "arch"
    assert hud.geometry.arch_height_ratio > 0.1
    assert hud.theme.theme_name == "merchant-amber"
    assert hud.center_scanner.target_name == "Lave Station"
    assert hud.right_comms.relay_state == "live"
    assert hud.right_comms.focus_channel == "Lave Station Ops"
    assert "Ops:" in hud.right_comms.preview_lines[0]
    assert "| instant |" in hud.right_comms.composition_hint
    assert "|" in hud.footer_label
    assert hud.command_bar[-1].label == "COM"
    assert hud.command_bar[-1].highlighted is True
    assert hud.left_gauges[0].label == "FU"
