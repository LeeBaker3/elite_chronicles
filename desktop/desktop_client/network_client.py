"""Backend HTTP adapter for the desktop runtime."""

from __future__ import annotations

from typing import Any

import httpx

from .adapters import normalize_local_chart_payload, normalize_local_contacts_payload
from .errors import raise_for_error_response
from .models import (
    AuthSession,
    CommsChannelSummary,
    CommsMessage,
    FlightSnapshot,
    InventoryItem,
    JumpPlan,
    LocalChartResponse,
    MarketStationSummary,
    PlayerProfile,
    ShipCargo,
    ShipLocalContactsResponse,
    ShipOperationLogEntry,
    ShipTelemetry,
    StationSummary,
    TradeResult,
    TradeDirection,
)


class NetworkClient:
    """Typed HTTP client around the shared backend contract."""

    def __init__(
        self,
        *,
        base_url: str,
        access_token: str | None = None,
        timeout_seconds: float = 10.0,
        user_agent: str = "EliteChroniclesDesktop/0.1",
        transport: httpx.BaseTransport | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(
            base_url=self.base_url,
            timeout=timeout_seconds,
            transport=transport,
            headers={
                "User-Agent": user_agent,
                "X-Client-Platform": "desktop",
            },
        )

    def close(self) -> None:
        """Close the underlying HTTP client when owned by this instance."""

        if self._owns_client:
            self._client.close()

    def set_access_token(self, access_token: str | None) -> None:
        """Update the bearer token used for authenticated calls."""

        self.access_token = access_token

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        response = self._client.request(
            method,
            path,
            headers=self._headers(),
            json=json_body,
            params=params,
        )
        raise_for_error_response(response)
        if not response.content:
            return None
        return response.json()

    def register(self, *, email: str, username: str, password: str) -> AuthSession:
        payload = self._request(
            "POST",
            "/api/auth/register",
            json_body={
                "email": email,
                "username": username,
                "password": password,
            },
        )
        session = AuthSession.model_validate(payload)
        self.set_access_token(session.token)
        return session

    def login(self, *, email: str, password: str) -> AuthSession:
        payload = self._request(
            "POST",
            "/api/auth/login",
            json_body={"email": email, "password": password},
        )
        session = AuthSession.model_validate(payload)
        self.set_access_token(session.token)
        return session

    def fetch_player_me(self) -> PlayerProfile:
        return PlayerProfile.model_validate(self._request("GET", "/api/players/me"))

    def fetch_ship(self, ship_id: int) -> ShipTelemetry:
        return ShipTelemetry.model_validate(self._request("GET", f"/api/ships/{ship_id}"))

    def fetch_flight_snapshot(self, ship_id: int) -> FlightSnapshot:
        return FlightSnapshot.model_validate(
            self._request("GET", f"/api/ships/{ship_id}/flight-snapshot")
        )

    def fetch_ship_cargo(self, ship_id: int) -> ShipCargo:
        return ShipCargo.model_validate(self._request("GET", f"/api/ships/{ship_id}/cargo"))

    def fetch_ship_operations(self, ship_id: int, *, limit: int = 8) -> list[ShipOperationLogEntry]:
        payload = self._request(
            "GET",
            f"/api/ships/{ship_id}/operations",
            params={"limit": limit},
        )
        return [ShipOperationLogEntry.model_validate(item) for item in payload]

    def fetch_comms_channels(self) -> list[CommsChannelSummary]:
        """Return available comms channels for the authenticated user."""

        payload = self._request("GET", "/api/comms/channels")
        return [CommsChannelSummary.model_validate(item) for item in payload]

    def fetch_comms_messages(self, channel_id: str) -> list[CommsMessage]:
        """Return the ordered message history for one comms channel."""

        payload = self._request("GET", f"/api/comms/channels/{channel_id}/messages")
        return [CommsMessage.model_validate(item) for item in payload]

    def send_comms_message(self, *, channel_id: str, body: str) -> CommsMessage:
        """Transmit one outbound comms message."""

        payload = self._request(
            "POST",
            f"/api/comms/channels/{channel_id}/messages",
            json_body={"body": body},
        )
        return CommsMessage.model_validate(payload)

    def mark_comms_channel_read(self, channel_id: str) -> CommsChannelSummary:
        """Mark inbound traffic in one channel as read."""

        payload = self._request("POST", f"/api/comms/channels/{channel_id}/read")
        return CommsChannelSummary.model_validate(payload)

    def list_stations(self) -> list[StationSummary]:
        payload = self._request("GET", "/api/stations")
        return [StationSummary.model_validate(item) for item in payload]

    def fetch_station_inventory(self, station_id: int) -> list[InventoryItem]:
        payload = self._request("GET", f"/api/stations/{station_id}/inventory")
        return [InventoryItem.model_validate(item) for item in payload]

    def fetch_market_summary(self, system_id: int) -> list[MarketStationSummary]:
        payload = self._request("GET", f"/api/markets/{system_id}/summary")
        return [MarketStationSummary.model_validate(item) for item in payload]

    def trade(
        self,
        *,
        station_id: int,
        ship_id: int,
        commodity_id: int,
        qty: int,
        direction: TradeDirection,
    ) -> TradeResult:
        payload = self._request(
            "POST",
            f"/api/stations/{station_id}/trade",
            json_body={
                "ship_id": ship_id,
                "commodity_id": commodity_id,
                "qty": qty,
                "direction": direction,
            },
        )
        return TradeResult.model_validate(payload)

    def undock(self, ship_id: int) -> ShipTelemetry:
        return ShipTelemetry.model_validate(
            self._request("POST", f"/api/ships/{ship_id}/undock")
        )

    def dock(self, *, ship_id: int, station_id: int) -> ShipTelemetry:
        return ShipTelemetry.model_validate(
            self._request(
                "POST",
                f"/api/ships/{ship_id}/dock",
                json_body={"station_id": station_id},
            )
        )

    def jump(
        self,
        *,
        ship_id: int,
        destination_station_id: int | None = None,
        destination_system_id: int | None = None,
        local_approach: bool = False,
    ) -> ShipTelemetry:
        payload: dict[str, Any] = {"local_approach": local_approach}
        if destination_station_id is not None:
            payload["destination_station_id"] = destination_station_id
        if destination_system_id is not None:
            payload["destination_system_id"] = destination_system_id
        return ShipTelemetry.model_validate(
            self._request(
                "POST",
                f"/api/ships/{ship_id}/jump",
                json_body=payload,
            )
        )

    def fetch_jump_plan(
        self,
        *,
        ship_id: int,
        destination_station_id: int | None = None,
        destination_system_id: int | None = None,
    ) -> JumpPlan:
        params: dict[str, Any] = {}
        if destination_station_id is not None:
            params["destination_station_id"] = destination_station_id
        if destination_system_id is not None:
            params["destination_system_id"] = destination_system_id
        return JumpPlan.model_validate(
            self._request(
                "GET",
                f"/api/ships/{ship_id}/jump-plan",
                params=params,
            )
        )

    def apply_navigation_intent(
        self,
        *,
        ship_id: int,
        action: str,
        destination_station_id: int | None = None,
        destination_system_id: int | None = None,
    ) -> ShipTelemetry:
        payload: dict[str, Any] = {"action": action}
        if destination_station_id is not None:
            payload["destination_station_id"] = destination_station_id
        if destination_system_id is not None:
            payload["destination_system_id"] = destination_system_id
        return ShipTelemetry.model_validate(
            self._request(
                "POST",
                f"/api/ships/{ship_id}/navigation-intent",
                json_body=payload,
            )
        )

    def fetch_local_contacts(self, ship_id: int) -> ShipLocalContactsResponse:
        payload = ShipLocalContactsResponse.model_validate(
            self._request("GET", f"/api/ships/{ship_id}/local-contacts")
        )
        return normalize_local_contacts_payload(payload)

    def fetch_local_chart(self, system_id: int) -> LocalChartResponse:
        payload = LocalChartResponse.model_validate(
            self._request("GET", f"/api/systems/{system_id}/local-chart")
        )
        return normalize_local_chart_payload(payload)

    def update_local_target(
        self,
        *,
        ship_id: int,
        action: str,
        contact_type: str | None = None,
        contact_id: int | None = None,
    ) -> ShipTelemetry:
        payload: dict[str, Any] = {"action": action}
        if contact_type is not None:
            payload["contact_type"] = contact_type
        if contact_id is not None:
            payload["contact_id"] = contact_id
        return ShipTelemetry.model_validate(
            self._request(
                "POST",
                f"/api/ships/{ship_id}/local-target",
                json_body=payload,
            )
        )

    def log_scanner_selection(
        self,
        *,
        ship_id: int,
        selected_contact_id: str,
        selected_contact_name: str,
        selected_contact_type: str,
        source: str,
        visible_contact_ids: list[str],
        total_contacts: int,
        visible_contacts_count: int,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/api/ships/{ship_id}/scanner-selection",
            json_body={
                "selected_contact_id": selected_contact_id,
                "selected_contact_name": selected_contact_name,
                "selected_contact_type": selected_contact_type,
                "source": source,
                "visible_contact_ids": visible_contact_ids,
                "total_contacts": total_contacts,
                "visible_contacts_count": visible_contacts_count,
            },
        )

    def update_flight_state(
        self,
        *,
        ship_id: int,
        flight_phase: str,
        flight_locked_destination_station_id: int | None = None,
        flight_locked_destination_contact_type: str | None = None,
        flight_locked_destination_contact_id: int | None = None,
    ) -> ShipTelemetry:
        payload: dict[str, Any] = {"flight_phase": flight_phase}
        if flight_locked_destination_station_id is not None:
            payload["flight_locked_destination_station_id"] = flight_locked_destination_station_id
        if flight_locked_destination_contact_type is not None:
            payload["flight_locked_destination_contact_type"] = flight_locked_destination_contact_type
        if flight_locked_destination_contact_id is not None:
            payload["flight_locked_destination_contact_id"] = flight_locked_destination_contact_id
        return ShipTelemetry.model_validate(
            self._request(
                "POST",
                f"/api/ships/{ship_id}/flight-state",
                json_body=payload,
            )
        )

    def sync_position(self, *, ship_id: int, position_x: int, position_y: int, position_z: int) -> ShipTelemetry:
        return ShipTelemetry.model_validate(
            self._request(
                "POST",
                f"/api/ships/{ship_id}/position-sync",
                json_body={
                    "position_x": position_x,
                    "position_y": position_y,
                    "position_z": position_z,
                },
            )
        )
