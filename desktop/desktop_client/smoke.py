"""End-to-end smoke workflow for the desktop client."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from .errors import DesktopAPIError, DesktopContractError, is_auth_error
from .models import FlightSnapshot, PlayerProfile, SmokeRunResult, SmokeStepResult, StationSummary
from .network_client import NetworkClient
from .session_store import SessionState, SessionStore


@dataclass(slots=True)
class SmokeCredentials:
    """Credentials used for one smoke run."""

    email: str
    username: str
    password: str


@dataclass(slots=True)
class SmokeRunOptions:
    """Optional controls to make smoke runs deterministic."""

    destination_station_id: int | None = None
    ship_id_override: int | None = None


def build_generated_smoke_credentials() -> SmokeCredentials:
    """Create a fresh registerable identity for smoke runs."""

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return SmokeCredentials(
        email=f"desktop_smoke_{stamp}@elite.local",
        username=f"desktop-smoke-{stamp}",
        password="pilot123",
    )


class DesktopSmokeRunner:
    """Run the agreed Batch 12.5 desktop smoke path."""

    def __init__(
        self,
        *,
        network_client: NetworkClient,
        session_store: SessionStore,
        session_state: SessionState,
    ) -> None:
        self._network_client = network_client
        self._session_store = session_store
        self._session_state = session_state

    def run(
        self,
        *,
        auth_mode: str,
        credentials: SmokeCredentials,
        options: SmokeRunOptions | None = None,
    ) -> SmokeRunResult:
        steps: list[SmokeStepResult] = []
        ok = True
        smoke_options = options or SmokeRunOptions()
        try:
            profile = self._authenticate(
                auth_mode=auth_mode,
                credentials=credentials,
                steps=steps,
            )
            ship_id = (
                smoke_options.ship_id_override
                or profile.primary_ship_id
                or self._session_state.selected_ship_id
            )
            if not ship_id:
                raise DesktopContractError(
                    "Unable to resolve primary ship id from player bootstrap."
                )
            self._session_state.selected_ship_id = ship_id
            self._session_state.primary_ship_id = profile.primary_ship_id or ship_id
            self._session_store.save(self._session_state)

            ship = self._network_client.fetch_ship(ship_id)
            origin_station_id = ship.docked_station_id
            steps.append(
                SmokeStepResult(
                    name="load_ship",
                    status="ok",
                    message=f"Loaded ship {ship.name} ({ship.id})",
                    details={"ship_id": ship.id, "status": ship.status},
                )
            )

            stations = self._network_client.list_stations()
            station_by_id = {station.id: station for station in stations}

            if ship.status == "docked":
                ship = self._network_client.undock(ship.id)
                steps.append(
                    SmokeStepResult(
                        name="undock",
                        status="ok",
                        message="Undocked into local space.",
                        details={"ship_status": ship.status},
                    )
                )
            else:
                steps.append(
                    SmokeStepResult(
                        name="undock",
                        status="skipped",
                        message="Ship already in-space.",
                        details={"ship_status": ship.status},
                    )
                )

            snapshot = self._network_client.fetch_flight_snapshot(ship.id)
            steps.append(
                SmokeStepResult(
                    name="flight_snapshot",
                    status="ok",
                    message="Loaded authoritative flight snapshot.",
                    details={
                        "system_id": snapshot.current_system_id,
                        "snapshot_version": snapshot.local_snapshot_version,
                        "suggested_poll_interval_ms": snapshot.suggested_poll_interval_ms,
                    },
                )
            )

            contacts = self._network_client.fetch_local_contacts(ship.id)
            steps.append(
                SmokeStepResult(
                    name="local_contacts",
                    status="ok",
                    message=f"Loaded {len(contacts.contacts)} local contacts.",
                    details={
                        "system_id": contacts.system_id,
                        "snapshot_version": contacts.snapshot_version,
                    },
                )
            )

            chart = self._network_client.fetch_local_chart(snapshot.current_system_id)
            self._validate_snapshot_compatibility(
                snapshot=snapshot,
                contacts_snapshot_version=contacts.snapshot_version,
                chart_snapshot_version=chart.snapshot_version,
            )
            steps.append(
                SmokeStepResult(
                    name="local_chart",
                    status="ok",
                    message="Loaded local chart.",
                    details={
                        "system_id": chart.system.id,
                        "snapshot_version": chart.snapshot_version,
                    },
                )
            )

            destination, local_approach = self._choose_jump_destination(
                stations=stations,
                current_system_id=snapshot.current_system_id,
                current_station_id=origin_station_id,
                destination_station_id=smoke_options.destination_station_id,
            )
            if destination is None:
                raise DesktopContractError("No viable jump destination found for smoke run.")

            jump_plan = self._network_client.fetch_jump_plan(
                ship_id=ship.id,
                destination_station_id=destination.id,
            )
            if not jump_plan.next_action_executable:
                raise DesktopContractError(
                    jump_plan.next_action_message
                    or jump_plan.blocked_reason_message
                    or "Backend did not provide an executable jump recommendation."
                )

            if jump_plan.next_action == "gain_clearance":
                if (
                    jump_plan.clearance_waypoint_x is None
                    or jump_plan.clearance_waypoint_y is None
                    or jump_plan.clearance_waypoint_z is None
                ):
                    raise DesktopContractError(
                        "Jump plan requested clearance movement without a waypoint."
                    )
                ship = self._network_client.apply_navigation_intent(
                    ship_id=ship.id,
                    action="gain_clearance",
                    destination_station_id=destination.id,
                )
                steps.append(
                    SmokeStepResult(
                        name="gain_clearance",
                        status="ok",
                        message=jump_plan.next_action_message or "Moved to backend-recommended clearance waypoint.",
                        details={
                            "position_x": ship.position_x,
                            "position_y": ship.position_y,
                            "position_z": ship.position_z,
                            "nearest_clearance_contact_name": jump_plan.nearest_clearance_contact_name,
                            "nearest_clearance_distance_km": jump_plan.nearest_clearance_distance_km,
                        },
                    )
                )
                jump_plan = self._network_client.fetch_jump_plan(
                    ship_id=ship.id,
                    destination_station_id=destination.id,
                )
                if jump_plan.next_action != "jump" or not jump_plan.next_action_executable:
                    raise DesktopContractError(
                        jump_plan.next_action_message
                        or jump_plan.blocked_reason_message
                        or "Backend jump plan did not become executable after clearance."
                    )

            recommended_destination_id = jump_plan.recommended_destination_station_id or destination.id
            destination = station_by_id.get(recommended_destination_id)
            if destination is None:
                raise DesktopContractError(
                    f"Jump plan returned unknown station {recommended_destination_id}."
                )
            if jump_plan.next_action != "jump":
                raise DesktopContractError(
                    f"Unsupported jump next action for smoke run: {jump_plan.next_action}"
                )
            local_approach = jump_plan.recommended_mode == "local_approach"
            ship = self._network_client.jump(
                ship_id=ship.id,
                destination_station_id=destination.id,
                local_approach=local_approach,
            )
            jump_message = (
                f"Jumped toward {destination.name}."
                if jump_plan.requested_mode == jump_plan.recommended_mode
                else (
                    f"Backend recommended {jump_plan.recommended_mode.replace('_', ' ')} "
                    f"toward {destination.name}: "
                    f"{jump_plan.next_action_message or jump_plan.blocked_reason_message}"
                )
            )
            steps.append(
                SmokeStepResult(
                    name="jump",
                    status="ok",
                    message=jump_message,
                    details={
                        "destination_station_id": destination.id,
                        "local_approach": local_approach,
                        "flight_phase": ship.flight_phase,
                    },
                )
            )

            arrival_snapshot = self._network_client.fetch_flight_snapshot(ship.id)
            steps.append(
                SmokeStepResult(
                    name="arrival_snapshot",
                    status="ok",
                    message="Loaded post-jump authoritative flight snapshot.",
                    details={
                        "system_id": arrival_snapshot.current_system_id,
                        "snapshot_version": arrival_snapshot.local_snapshot_version,
                        "suggested_poll_interval_ms": arrival_snapshot.suggested_poll_interval_ms,
                    },
                )
            )

            if not local_approach:
                ship = self._network_client.update_local_target(
                    ship_id=ship.id,
                    action="transfer",
                    contact_type="station",
                    contact_id=destination.id,
                )

            ship = self._network_client.dock(ship_id=ship.id, station_id=destination.id)
            steps.append(
                SmokeStepResult(
                    name="dock",
                    status="ok",
                    message=f"Docked at {destination.name}.",
                    details={"station_id": destination.id},
                )
            )

            trade_step = self._run_trade_step(
                ship_id=ship.id,
                station=destination,
                player=self._network_client.fetch_player_me(),
            )
            steps.append(trade_step)
            if trade_step.status == "failed":
                ok = False

        except (DesktopAPIError, DesktopContractError) as exc:
            ok = False
            steps.append(
                SmokeStepResult(
                    name="smoke_failure",
                    status="failed",
                    message=str(exc),
                )
            )

        return SmokeRunResult(ok=ok and all(step.status != "failed" for step in steps), steps=steps)

    def _authenticate(
        self,
        *,
        auth_mode: str,
        credentials: SmokeCredentials,
        steps: list[SmokeStepResult],
    ) -> PlayerProfile:
        if auth_mode == "session":
            if not self._session_state.access_token:
                raise DesktopContractError(
                    "Smoke session mode requires an existing saved desktop session."
                )
            self._network_client.set_access_token(self._session_state.access_token)
            try:
                profile = self._network_client.fetch_player_me()
            except DesktopAPIError as exc:
                self._handle_auth_error(exc)
                raise
            steps.append(
                SmokeStepResult(
                    name="login",
                    status="ok",
                    message=f"Reused saved session for {profile.username}.",
                    details={
                        "user_id": profile.id,
                        "primary_ship_id": profile.primary_ship_id,
                    },
                )
            )
            steps.append(
                SmokeStepResult(
                    name="load_player",
                    status="ok",
                    message="Loaded commander bootstrap state.",
                    details={
                        "credits": profile.credits,
                        "location_type": profile.location_type,
                        "location_id": profile.location_id,
                    },
                )
            )
            return profile

        if auth_mode == "register":
            session = self._network_client.register(
                email=credentials.email,
                username=credentials.username,
                password=credentials.password,
            )
        elif auth_mode == "login":
            session = self._network_client.login(
                email=credentials.email,
                password=credentials.password,
            )
        else:
            raise DesktopContractError(f"Unsupported smoke auth mode: {auth_mode}")

        self._session_state.access_token = session.token
        self._session_state.user_id = session.user_id
        profile = self._network_client.fetch_player_me()
        self._session_state.primary_ship_id = profile.primary_ship_id
        self._session_store.save(self._session_state)

        steps.append(
            SmokeStepResult(
                name="login",
                status="ok",
                message=f"Authenticated as {profile.username}.",
                details={
                    "user_id": session.user_id,
                    "primary_ship_id": profile.primary_ship_id,
                },
            )
        )
        steps.append(
            SmokeStepResult(
                name="load_player",
                status="ok",
                message="Loaded commander bootstrap state.",
                details={
                    "credits": profile.credits,
                    "location_type": profile.location_type,
                    "location_id": profile.location_id,
                },
            )
        )
        return profile

    def _choose_jump_destination(
        self,
        *,
        stations: list[StationSummary],
        current_system_id: int,
        current_station_id: int | None,
        destination_station_id: int | None = None,
    ) -> tuple[StationSummary | None, bool]:
        if destination_station_id is not None:
            selected_station = next(
                (station for station in stations if station.id == destination_station_id),
                None,
            )
            if selected_station is None:
                raise DesktopContractError(
                    f"Requested smoke destination station {destination_station_id} was not found."
                )
            return selected_station, selected_station.system_id == current_system_id

        off_system = [
            station
            for station in stations
            if station.system_id != current_system_id
        ]
        if off_system:
            return off_system[0], False

        in_system = [
            station
            for station in stations
            if station.system_id == current_system_id and station.id != current_station_id
        ]
        if in_system:
            return in_system[0], True
        return None, False

    def _handle_auth_error(self, exc: DesktopAPIError) -> None:
        if not is_auth_error(exc):
            return
        self._network_client.set_access_token(None)
        self._session_store.clear()
        self._session_state.access_token = None
        self._session_state.user_id = None
        self._session_state.primary_ship_id = None
        self._session_state.selected_ship_id = None

    def _validate_snapshot_compatibility(
        self,
        *,
        snapshot: FlightSnapshot,
        contacts_snapshot_version: str | None,
        chart_snapshot_version: str | None,
    ) -> None:
        expected_snapshot_version = (snapshot.local_snapshot_version or "").strip()
        if expected_snapshot_version and (contacts_snapshot_version or "").strip() != expected_snapshot_version:
            raise DesktopContractError(
                "Smoke run received local contacts from a mismatched snapshot version."
            )
        if expected_snapshot_version and (chart_snapshot_version or "").strip() != expected_snapshot_version:
            raise DesktopContractError(
                "Smoke run received local chart data from a mismatched snapshot version."
            )

    def _run_trade_step(
        self,
        *,
        ship_id: int,
        station: StationSummary,
        player: PlayerProfile,
    ) -> SmokeStepResult:
        inventory = self._network_client.fetch_station_inventory(station.id)
        affordable_item = next(
            (
                item
                for item in sorted(inventory, key=lambda row: row.buy_price)
                if item.quantity > 0 and item.buy_price > 0 and item.buy_price <= player.credits
            ),
            None,
        )
        if affordable_item is not None:
            result = self._network_client.trade(
                station_id=station.id,
                ship_id=ship_id,
                commodity_id=affordable_item.commodity_id,
                qty=1,
                direction="buy",
            )
            return SmokeStepResult(
                name="trade",
                status="ok",
                message=f"Bought 1 unit of {affordable_item.name}.",
                details={"credits_after": result.credits},
            )

        cargo = self._network_client.fetch_ship_cargo(ship_id)
        sellable_item = next(
            (
                item
                for item in cargo.items
                if item.quantity > 0
            ),
            None,
        )
        if sellable_item is not None:
            result = self._network_client.trade(
                station_id=station.id,
                ship_id=ship_id,
                commodity_id=sellable_item.commodity_id,
                qty=1,
                direction="sell",
            )
            return SmokeStepResult(
                name="trade",
                status="ok",
                message=f"Sold 1 unit of {sellable_item.commodity_name}.",
                details={"credits_after": result.credits},
            )

        return SmokeStepResult(
            name="trade",
            status="failed",
            message=(
                "No executable trade candidate found. "
                "The commander has insufficient credits and no sellable cargo."
            ),
            details={"credits": player.credits},
        )
