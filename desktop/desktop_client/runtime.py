"""Desktop runtime bootstrap and launch helpers."""

from __future__ import annotations

from dataclasses import dataclass, replace
import importlib.util

from .errors import DesktopAPIError, DesktopContractError, is_auth_error
from .models import JumpPlan, RuntimeBootstrapState, RuntimeCommsState, RuntimeTickResult
from .network_client import NetworkClient
from .scene_manager import SceneManager
from .session_store import SessionState, SessionStore
from .ship_controller import ShipController


def panda3d_available() -> bool:
    """Return True when Panda3D runtime modules are importable."""

    try:
        return importlib.util.find_spec("direct.showbase.ShowBase") is not None
    except ModuleNotFoundError:
        return False


@dataclass(slots=True)
class DesktopRuntime:
    """Bootstrap the desktop runtime from a persisted authenticated session."""

    network_client: NetworkClient
    session_store: SessionStore
    session_state: SessionState
    scene_manager: SceneManager
    ship_controller: ShipController

    def bootstrap(self, *, ship_id_override: int | None = None) -> RuntimeBootstrapState:
        """Load authoritative backend state required to start the desktop runtime."""

        if not self.session_state.access_token:
            raise DesktopContractError(
                "No saved desktop session. Run `elite-desktop login` or `elite-desktop register` first."
            )

        try:
            player = self.network_client.fetch_player_me()
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

        ship_id = ship_id_override or self.session_state.selected_ship_id or player.primary_ship_id
        if ship_id is None:
            raise DesktopContractError(
                "Unable to resolve a ship for desktop runtime bootstrap.")

        try:
            snapshot = self.network_client.fetch_flight_snapshot(ship_id)
            ship = snapshot.ship
            contacts = self.network_client.fetch_local_contacts(ship.id)
            chart = self.network_client.fetch_local_chart(
                snapshot.current_system_id)
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

        self._validate_snapshot_compatibility(
            snapshot=snapshot,
            contacts=contacts,
            chart=chart,
        )

        self.session_state.user_id = player.id
        self.session_state.primary_ship_id = player.primary_ship_id or ship.id
        self.session_state.selected_ship_id = ship.id
        self.session_store.save(self.session_state)

        self.ship_controller.reset()
        comms = self._load_comms_state()

        return self._build_runtime_state(
            player=player,
            snapshot=snapshot,
            ship=ship,
            contacts=contacts,
            chart=chart,
            comms=comms,
        )

    def tick(self, state: RuntimeBootstrapState) -> RuntimeTickResult:
        """Refresh one authoritative desktop runtime tick from flight snapshot hints."""

        ship_id = state.ship.id
        try:
            snapshot = self.network_client.fetch_flight_snapshot(ship_id)
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

        expected_snapshot_version = (
            snapshot.local_snapshot_version or "").strip()
        contacts = state.contacts
        chart = state.chart
        contacts_refreshed = any(
            (
                snapshot.refresh_contacts,
                contacts.system_id != snapshot.current_system_id,
                (contacts.snapshot_version or "").strip(
                ) != expected_snapshot_version,
            )
        )
        chart_refreshed = any(
            (
                snapshot.refresh_chart,
                chart.system.id != snapshot.current_system_id,
                (chart.snapshot_version or "").strip() != expected_snapshot_version,
            )
        )

        try:
            if contacts_refreshed:
                contacts = self.network_client.fetch_local_contacts(ship_id)
            if chart_refreshed:
                chart = self.network_client.fetch_local_chart(
                    snapshot.current_system_id)
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

        comms = self._load_comms_state(
            active_channel_id=state.comms.active_channel_id,
        )

        self._validate_snapshot_compatibility(
            snapshot=snapshot,
            contacts=contacts,
            chart=chart,
        )
        next_state = self._build_runtime_state(
            player=state.player,
            snapshot=snapshot,
            ship=snapshot.ship,
            contacts=contacts,
            chart=chart,
            comms=comms,
        )
        return RuntimeTickResult(
            state=next_state,
            contacts_refreshed=contacts_refreshed,
            chart_refreshed=chart_refreshed,
            comms_refreshed=True,
        )

    def refresh_comms(
        self,
        state: RuntimeBootstrapState,
        *,
        active_channel_id: str | None = None,
        mark_read: bool = False,
    ) -> RuntimeBootstrapState:
        """Refresh desktop comms state while preserving the current runtime snapshot."""

        selected_channel_id = active_channel_id or state.comms.active_channel_id
        if mark_read and selected_channel_id is not None:
            self._mark_comms_channel_read(selected_channel_id)
        comms = self._load_comms_state(active_channel_id=selected_channel_id)
        return replace(state, comms=comms)

    def refresh_runtime(self, state: RuntimeBootstrapState) -> RuntimeBootstrapState:
        """Reload the full runtime state for the currently selected ship."""

        return self._reload_runtime_state(
            player=state.player,
            ship_id=state.ship.id,
            active_channel_id=state.comms.active_channel_id,
        )

    def trigger_launch_or_dock(self, state: RuntimeBootstrapState) -> RuntimeBootstrapState:
        """Perform the primary launch or dock action for the current ship."""

        ship = state.ship
        try:
            if ship.status == "docked":
                self.network_client.undock(ship.id)
            else:
                station_id = self._resolve_dock_station_id(state)
                self.network_client.dock(
                    ship_id=ship.id, station_id=station_id)
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

        return self._reload_runtime_state(
            player=state.player,
            ship_id=ship.id,
            active_channel_id=state.comms.active_channel_id,
        )

    def dock_at_station(
        self,
        state: RuntimeBootstrapState,
        *,
        station_id: int,
    ) -> RuntimeBootstrapState:
        """Dock the current ship at one explicit station id and reload state."""

        try:
            self.network_client.dock(
                ship_id=state.ship.id, station_id=station_id)
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

        return self._reload_runtime_state(
            player=state.player,
            ship_id=state.ship.id,
            active_channel_id=state.comms.active_channel_id,
        )

    def focus_scanner_contact(
        self,
        state: RuntimeBootstrapState,
        *,
        contact_id: str,
        source: str = "desktop-shell",
    ) -> RuntimeBootstrapState:
        """Record one visible scanner contact selection for desktop diagnostics."""

        selected_contact = next(
            (
                contact
                for contact in state.contacts.contacts
                if contact.id == contact_id
            ),
            None,
        )
        if selected_contact is None:
            raise DesktopContractError(
                f"Selected contact {contact_id} is not available in the scanner feed."
            )

        visible_contact_ids = [
            contact.id for contact in state.contacts.contacts]
        try:
            self.network_client.log_scanner_selection(
                ship_id=state.ship.id,
                selected_contact_id=selected_contact.id,
                selected_contact_name=selected_contact.name,
                selected_contact_type=selected_contact.contact_type,
                source=source,
                visible_contact_ids=visible_contact_ids,
                total_contacts=len(visible_contact_ids),
                visible_contacts_count=len(visible_contact_ids),
            )
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

        return state

    def fetch_recent_operations(self, state: RuntimeBootstrapState, *, limit: int = 6):
        """Return recent ship operations for shell-side inspection."""

        try:
            return self.network_client.fetch_ship_operations(state.ship.id, limit=limit)
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

    def fetch_jump_plan(
        self,
        state: RuntimeBootstrapState,
        *,
        destination_station_id: int | None = None,
        destination_system_id: int | None = None,
    ) -> JumpPlan:
        """Return the backend jump/clearance recommendation for the current ship."""

        try:
            return self.network_client.fetch_jump_plan(
                ship_id=state.ship.id,
                destination_station_id=destination_station_id,
                destination_system_id=destination_system_id,
            )
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

    def fetch_active_station_inventory(self, state: RuntimeBootstrapState):
        """Return the inventory for the active docked station."""

        station_id = state.ship.docked_station_id
        if station_id is None:
            raise DesktopContractError(
                "Trade data is only available while docked.")
        try:
            return self.network_client.fetch_station_inventory(station_id)
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

    def list_known_stations(self):
        """Return the station index for lightweight navigation displays."""

        try:
            return self.network_client.list_stations()
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

    def cycle_comms_channel(
        self,
        state: RuntimeBootstrapState,
        *,
        step: int = 1,
    ) -> RuntimeBootstrapState:
        """Advance the active comms channel selection and refresh message history."""

        if not state.comms.channels:
            return state

        channel_ids = [channel.id for channel in state.comms.channels]
        try:
            current_index = channel_ids.index(state.comms.active_channel_id)
        except ValueError:
            current_index = -1
        next_channel_id = channel_ids[(
            current_index + step) % len(channel_ids)]
        return self.refresh_comms(
            state,
            active_channel_id=next_channel_id,
            mark_read=True,
        )

    def send_comms_message(
        self,
        state: RuntimeBootstrapState,
        *,
        body: str,
    ) -> RuntimeBootstrapState:
        """Send one outbound comms message and return refreshed runtime state."""

        message_body = body.strip()
        if not message_body:
            return state
        if state.comms.active_channel_id is None:
            raise DesktopContractError(
                "No active comms channel is selected for desktop messaging."
            )

        try:
            self.network_client.send_comms_message(
                channel_id=state.comms.active_channel_id,
                body=message_body,
            )
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

        return self.refresh_comms(
            state,
            active_channel_id=state.comms.active_channel_id,
            mark_read=True,
        )

    def _load_comms_state(
        self,
        *,
        active_channel_id: str | None = None,
    ) -> RuntimeCommsState:
        """Load desktop comms state from the shared backend contract."""

        try:
            channels = self.network_client.fetch_comms_channels()
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            if exc.status_code == 404:
                return RuntimeCommsState()
            raise

        selected_channel_id = active_channel_id
        if selected_channel_id is None:
            unread_channel = next(
                (item for item in channels if item.unread > 0), None)
            selected_channel_id = unread_channel.id if unread_channel is not None else None
        if selected_channel_id is None and channels:
            selected_channel_id = channels[0].id

        messages = []
        if selected_channel_id is not None:
            try:
                messages = self.network_client.fetch_comms_messages(
                    selected_channel_id)
            except DesktopAPIError as exc:
                self._handle_auth_error(exc)
                if exc.status_code != 404:
                    raise

        return RuntimeCommsState(
            channels=channels,
            active_channel_id=selected_channel_id,
            messages=messages,
            unread_total=sum(item.unread for item in channels),
        )

    def _mark_comms_channel_read(self, channel_id: str) -> None:
        """Mark one comms channel as read when the backend supports it."""

        try:
            self.network_client.mark_comms_channel_read(channel_id)
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            if exc.status_code != 404:
                raise

    def _reload_runtime_state(
        self,
        *,
        player,
        ship_id: int,
        active_channel_id: str | None,
    ) -> RuntimeBootstrapState:
        """Rebuild the runtime state from the authoritative backend surfaces."""

        try:
            snapshot = self.network_client.fetch_flight_snapshot(ship_id)
            contacts = self.network_client.fetch_local_contacts(ship_id)
            chart = self.network_client.fetch_local_chart(
                snapshot.current_system_id)
        except DesktopAPIError as exc:
            self._handle_auth_error(exc)
            raise

        self._validate_snapshot_compatibility(
            snapshot=snapshot,
            contacts=contacts,
            chart=chart,
        )
        comms = self._load_comms_state(active_channel_id=active_channel_id)
        return self._build_runtime_state(
            player=player,
            snapshot=snapshot,
            ship=snapshot.ship,
            contacts=contacts,
            chart=chart,
            comms=comms,
        )

    def _resolve_dock_station_id(self, state: RuntimeBootstrapState) -> int:
        """Choose a dock target from explicit lock state or nearest station contact."""

        locked_station_id = state.ship.flight_locked_destination_station_id
        if isinstance(locked_station_id, int) and locked_station_id > 0:
            return locked_station_id

        station_contacts = [
            contact
            for contact in state.contacts.contacts
            if contact.contact_type == "station"
        ]
        if not station_contacts:
            raise DesktopContractError(
                "No station contact is available for docking from the desktop shell."
            )
        nearest_station = min(
            station_contacts, key=lambda item: item.distance_km)
        station_id_token = nearest_station.id.split("-", 1)[-1]
        try:
            return int(station_id_token)
        except ValueError as exc:
            raise DesktopContractError(
                f"Unable to parse docking station id from contact {nearest_station.id}."
            ) from exc

    def _validate_snapshot_compatibility(self, *, snapshot, contacts, chart) -> None:
        """Ensure the desktop bootstrap uses one coherent authoritative local-space snapshot."""

        expected_snapshot_version = (
            snapshot.local_snapshot_version or "").strip()
        contact_snapshot_version = (contacts.snapshot_version or "").strip()
        chart_snapshot_version = (chart.snapshot_version or "").strip()
        if expected_snapshot_version and contact_snapshot_version != expected_snapshot_version:
            raise DesktopContractError(
                "Desktop bootstrap received local contacts from a mismatched snapshot version."
            )
        if expected_snapshot_version and chart_snapshot_version != expected_snapshot_version:
            raise DesktopContractError(
                "Desktop bootstrap received local chart data from a mismatched snapshot version."
            )

    def launch(self, *, ship_id_override: int | None = None, headless: bool = False) -> RuntimeBootstrapState:
        """Bootstrap the runtime and keep the launch path explicit for future Panda handoff."""

        state = self.bootstrap(ship_id_override=ship_id_override)
        return state

    def _build_runtime_state(
        self,
        *,
        player,
        snapshot,
        ship,
        contacts,
        chart,
        comms,
    ) -> RuntimeBootstrapState:
        """Build one runtime state object and synchronize local scene metadata."""

        scene_name = "hangar" if ship.status == "docked" else "flight"
        chart_body_count = 1 + len(chart.planets) + len(chart.stations)
        chart_body_count += sum(len(moons)
                                for moons in chart.moons_by_parent_body_id.values())
        self.scene_manager.sync_runtime_state(
            scene_name=scene_name,
            current_system_id=snapshot.current_system_id,
            current_system_name=snapshot.current_system_name,
            local_snapshot_version=snapshot.local_snapshot_version,
            contact_count=len(contacts.contacts),
            chart_body_count=chart_body_count,
        )
        return RuntimeBootstrapState(
            player=player,
            snapshot=snapshot,
            ship=ship,
            contacts=contacts,
            chart=chart,
            comms=comms,
            active_scene_name=self.scene_manager.active_scene_name,
            audio_event_hints=list(chart.mutable_state.audio_event_hints),
            panda3d_available=panda3d_available(),
        )

    def _handle_auth_error(self, exc: DesktopAPIError) -> None:
        if not is_auth_error(exc):
            return
        self.network_client.set_access_token(None)
        self.session_store.clear()
        self.session_state.access_token = None
        self.session_state.user_id = None
        self.session_state.primary_ship_id = None
        self.session_state.selected_ship_id = None
