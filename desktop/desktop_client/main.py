"""Desktop client entrypoint and CLI."""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict
from typing import Sequence

from .config import load_config
from .errors import DesktopAPIError, DesktopContractError, is_auth_error
from .network_client import NetworkClient
from .runtime import DesktopRuntime
from .scene_manager import SceneManager
from .session_store import SessionState, SessionStore
from .ship_controller import ShipController
from .smoke import (
    DesktopSmokeRunner,
    SmokeCredentials,
    SmokeRunOptions,
    build_generated_smoke_credentials,
)
from .ui import (
    available_retro_hud_themes,
    build_retro_cockpit_hud,
    launch_panda3d_hud_shell,
)
from .system_renderer import build_debug_scene_snapshot


def build_parser() -> argparse.ArgumentParser:
    """Build the desktop CLI parser."""

    parser = argparse.ArgumentParser(prog="elite-desktop")
    subparsers = parser.add_subparsers(dest="command", required=True)

    register_parser = subparsers.add_parser(
        "register", help="Register and persist a desktop session.")
    register_parser.add_argument("--email", required=True)
    register_parser.add_argument("--username", required=True)
    register_parser.add_argument("--password", required=True)

    login_parser = subparsers.add_parser(
        "login", help="Login and persist a desktop session.")
    login_parser.add_argument("--email", required=True)
    login_parser.add_argument("--password", required=True)

    subparsers.add_parser("status", help="Show saved desktop session status.")
    subparsers.add_parser(
        "clear-session", help="Delete the saved desktop session.")

    run_parser = subparsers.add_parser(
        "run", help="Bootstrap the desktop runtime from a saved session.")
    run_parser.add_argument("--ship-id", type=int)
    run_parser.add_argument("--headless", action="store_true")
    run_parser.add_argument("--ticks", type=int, default=0)
    run_parser.add_argument("--sleep-between-ticks", action="store_true")
    run_parser.add_argument("--debug-scene", action="store_true")
    run_parser.add_argument("--debug-hud", action="store_true")
    run_parser.add_argument(
        "--hud-theme",
        choices=available_retro_hud_themes(),
        default="acorn-classic",
    )
    run_parser.add_argument("--json", action="store_true", dest="json_output")

    smoke_parser = subparsers.add_parser(
        "smoke", help="Run the Batch 12.5 desktop smoke path.")
    smoke_parser.add_argument(
        "--mode", choices=("register", "login", "session"), default="register")
    smoke_parser.add_argument("--email")
    smoke_parser.add_argument("--username")
    smoke_parser.add_argument("--password")
    smoke_parser.add_argument("--ship-id", type=int)
    smoke_parser.add_argument("--destination-station-id", type=int)
    smoke_parser.add_argument(
        "--json", action="store_true", dest="json_output")

    return parser


def _build_network_client(config, session_state: SessionState) -> NetworkClient:
    return NetworkClient(
        base_url=config.api_base_url,
        access_token=session_state.access_token,
        timeout_seconds=config.request_timeout_seconds,
        user_agent=config.user_agent,
    )


def _save_authenticated_session(
    *,
    session_store: SessionStore,
    session_state: SessionState,
    access_token: str,
    user_id: int,
    primary_ship_id: int | None,
) -> None:
    session_state.access_token = access_token
    session_state.user_id = user_id
    session_state.primary_ship_id = primary_ship_id
    if primary_ship_id is not None and session_state.selected_ship_id is None:
        session_state.selected_ship_id = primary_ship_id
    session_store.save(session_state)


def _print_status(session_state: SessionState, config) -> None:
    print("Elite Chronicles desktop status")
    print(f"API base: {config.api_base_url}")
    print(f"Session path: {config.session_path}")
    print(f"Saved token: {'yes' if session_state.access_token else 'no'}")
    print(f"User id: {session_state.user_id}")
    print(f"Primary ship id: {session_state.primary_ship_id}")
    print(f"Selected ship id: {session_state.selected_ship_id}")


def _resolve_smoke_credentials(args: argparse.Namespace) -> SmokeCredentials:
    if args.mode == "session":
        return SmokeCredentials(email="", username="", password="")

    if args.mode == "register" and not args.email and not args.username and not args.password:
        return build_generated_smoke_credentials()

    email = args.email
    password = args.password
    username = args.username
    if not email or not password:
        raise DesktopContractError(
            "Smoke login/register requires --email and --password.")
    if args.mode == "register" and not username:
        raise DesktopContractError("Smoke register requires --username.")
    return SmokeCredentials(
        email=email,
        username=username or email.split("@", 1)[0],
        password=password,
    )


def _print_smoke_result(result, *, json_output: bool) -> None:
    if json_output:
        print(
            json.dumps(
                {
                    "ok": result.ok,
                    "steps": [
                        {
                            "name": step.name,
                            "status": step.status,
                            "message": step.message,
                            "details": step.details,
                        }
                        for step in result.steps
                    ],
                },
                indent=2,
            )
        )
        return

    print("Desktop smoke run")
    for step in result.steps:
        print(f"[{step.status}] {step.name}: {step.message}")
    print(f"Overall: {'ok' if result.ok else 'failed'}")


def _print_runtime_result(
    state,
    *,
    json_output: bool,
    tick_summaries: list[dict[str, object]] | None = None,
    debug_scene: dict[str, object] | None = None,
    debug_hud: dict[str, object] | None = None,
) -> None:
    payload = {
        "player": {
            "id": state.player.id,
            "username": state.player.username,
            "credits": state.player.credits,
            "primary_ship_id": state.player.primary_ship_id,
        },
        "ship": {
            "id": state.ship.id,
            "name": state.ship.name,
            "status": state.ship.status,
            "flight_phase": state.ship.flight_phase,
            "docked_station_id": state.ship.docked_station_id,
        },
        "system": {
            "id": state.snapshot.current_system_id,
            "name": state.snapshot.current_system_name,
            "snapshot_version": state.snapshot.local_snapshot_version,
        },
        "flight_snapshot": {
            "contract_version": state.snapshot.contract_version,
            "ship_version": state.snapshot.ship_version,
            "suggested_poll_interval_ms": state.snapshot.suggested_poll_interval_ms,
            "refresh_contacts": state.snapshot.refresh_contacts,
            "refresh_chart": state.snapshot.refresh_chart,
        },
        "scene": state.active_scene_name,
        "audio_event_hints": state.audio_event_hints,
        "panda3d_available": state.panda3d_available,
        "ticks": tick_summaries or [],
        "debug_scene": debug_scene,
        "debug_hud": debug_hud,
    }
    if json_output:
        print(json.dumps(payload, indent=2))
        return

    print("Desktop runtime bootstrap")
    print(f"Commander: {state.player.username} ({state.player.id})")
    print(f"Ship: {state.ship.name} ({state.ship.id}) [{state.ship.status}]")
    print(
        f"System: {state.snapshot.current_system_name} ({state.snapshot.current_system_id})")
    print(
        f"Snapshot poll interval: {state.snapshot.suggested_poll_interval_ms}ms")
    print(f"Scene: {state.active_scene_name}")
    if tick_summaries:
        print(f"Ticks processed: {len(tick_summaries)}")
    if debug_scene is not None:
        print(f"Debug scene entities: {debug_scene['entity_count']}")
        for entity in debug_scene["entities"][:10]:
            print(
                "  "
                f"[{entity['source']}] {entity['entity_type']} {entity['name']} "
                f"@ ({entity['position']['x']}, {entity['position']['y']}, {entity['position']['z']})"
            )
    if debug_hud is not None:
        geometry = debug_hud["geometry"]
        print(
            "Retro HUD shell: "
            f"{geometry['lower_console_profile']} arch "
            f"({geometry['arch_height_ratio']:.2f}h, inset {geometry['lower_console_inset_ratio']:.2f})"
        )
        print(
            f"Comms pane: {debug_hud['right_comms']['relay_state']} · focus {debug_hud['right_comms']['focus_channel']}")
    print(f"Panda3D available: {'yes' if state.panda3d_available else 'no'}")


def _handle_auth_failure(
    *,
    exc: DesktopAPIError,
    network_client: NetworkClient,
    session_store: SessionStore,
    session_state: SessionState,
) -> None:
    if not is_auth_error(exc):
        return
    network_client.set_access_token(None)
    session_store.clear()
    session_state.access_token = None
    session_state.user_id = None
    session_state.primary_ship_id = None
    session_state.selected_ship_id = None


def main(argv: Sequence[str] | None = None) -> None:
    """Run the desktop CLI."""

    parser = build_parser()
    args = parser.parse_args(argv)
    config = load_config()
    session_store = SessionStore(config.session_path)
    session_state = session_store.load()
    network_client = _build_network_client(config, session_state)

    try:
        if args.command == "status":
            _print_status(session_state, config)
            return

        if args.command == "clear-session":
            session_store.clear()
            print(f"Cleared session at {config.session_path}")
            return

        if args.command == "register":
            session = network_client.register(
                email=args.email,
                username=args.username,
                password=args.password,
            )
            profile = network_client.fetch_player_me()
            _save_authenticated_session(
                session_store=session_store,
                session_state=session_state,
                access_token=session.token,
                user_id=session.user_id,
                primary_ship_id=profile.primary_ship_id,
            )
            print(
                f"Registered {profile.username} (user_id={profile.id}, primary_ship_id={profile.primary_ship_id})")
            return

        if args.command == "login":
            session = network_client.login(
                email=args.email,
                password=args.password,
            )
            profile = network_client.fetch_player_me()
            _save_authenticated_session(
                session_store=session_store,
                session_state=session_state,
                access_token=session.token,
                user_id=session.user_id,
                primary_ship_id=profile.primary_ship_id,
            )
            print(
                f"Logged in {profile.username} (user_id={profile.id}, primary_ship_id={profile.primary_ship_id})")
            return

        if args.command == "run":
            runtime = DesktopRuntime(
                network_client=network_client,
                session_store=session_store,
                session_state=session_state,
                scene_manager=SceneManager(),
                ship_controller=ShipController(),
            )
            state = runtime.launch(
                ship_id_override=args.ship_id,
                headless=args.headless,
            )
            tick_summaries: list[dict[str, object]] = []
            for _ in range(max(0, args.ticks)):
                if args.sleep_between_ticks:
                    time.sleep(
                        max(0, state.snapshot.suggested_poll_interval_ms) / 1000)
                tick_result = runtime.tick(state)
                state = tick_result.state
                tick_summaries.append(
                    {
                        "ship_version": state.snapshot.ship_version,
                        "snapshot_version": state.snapshot.local_snapshot_version,
                        "scene": state.active_scene_name,
                        "contacts_refreshed": tick_result.contacts_refreshed,
                        "chart_refreshed": tick_result.chart_refreshed,
                        "comms_refreshed": tick_result.comms_refreshed,
                    }
                )
            if not args.headless and state.panda3d_available:
                launch_panda3d_hud_shell(
                    runtime=runtime,
                    state=state,
                    theme_name=args.hud_theme,
                )
                return
            debug_scene_state = build_debug_scene_snapshot(state)
            debug_scene = asdict(
                debug_scene_state) if args.debug_scene else None
            debug_hud = asdict(
                build_retro_cockpit_hud(
                    state=state,
                    debug_scene=debug_scene_state,
                    theme_name=args.hud_theme,
                )
            ) if args.debug_hud else None
            _print_runtime_result(
                state,
                json_output=args.json_output,
                tick_summaries=tick_summaries,
                debug_scene=debug_scene,
                debug_hud=debug_hud,
            )
            return

        if args.command == "smoke":
            credentials = _resolve_smoke_credentials(args)
            runner = DesktopSmokeRunner(
                network_client=network_client,
                session_store=session_store,
                session_state=session_state,
            )
            result = runner.run(
                auth_mode=args.mode,
                credentials=credentials,
                options=SmokeRunOptions(
                    destination_station_id=args.destination_station_id,
                    ship_id_override=args.ship_id,
                ),
            )
            _print_smoke_result(result, json_output=args.json_output)
            raise SystemExit(0 if result.ok else 1)

    except (DesktopAPIError, DesktopContractError) as exc:
        if isinstance(exc, DesktopAPIError):
            _handle_auth_failure(
                exc=exc,
                network_client=network_client,
                session_store=session_store,
                session_state=session_state,
            )
        print(str(exc))
        raise SystemExit(1) from exc
    finally:
        network_client.close()


if __name__ == "__main__":
    main()
