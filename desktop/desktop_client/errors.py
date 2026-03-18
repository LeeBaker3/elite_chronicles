"""Error helpers for the desktop client backend adapter."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(slots=True)
class DesktopAPIError(Exception):
    """Structured backend/API failure."""

    status_code: int
    message: str
    code: str | None = None
    details: Any = None
    trace_id: str | None = None

    def __str__(self) -> str:
        if self.code:
            return f"{self.status_code} {self.code}: {self.message}"
        return f"{self.status_code}: {self.message}"


@dataclass(slots=True)
class DesktopContractError(Exception):
    """Raised when the backend payload is unusable for desktop bootstrap."""

    message: str

    def __str__(self) -> str:
        return self.message


def raise_for_error_response(response: httpx.Response) -> None:
    """Convert backend error responses into structured exceptions."""

    if response.is_success:
        return

    try:
        payload = response.json()
    except ValueError:
        payload = None

    error_payload = payload.get("error") if isinstance(payload, dict) else None
    message = (
        (error_payload or {}).get("message")
        or (payload or {}).get("detail")
        or response.text
        or response.reason_phrase
        or "Request failed"
    )
    raise DesktopAPIError(
        status_code=response.status_code,
        code=(error_payload or {}).get("code"),
        message=str(message),
        details=(error_payload or {}).get("details"),
        trace_id=(error_payload or {}).get("trace_id"),
    )


def is_auth_error(exc: DesktopAPIError) -> bool:
    """Return True when an API error represents an unusable desktop session."""

    return exc.status_code == 401 or exc.code in {"unauthorized", "session_expired"}
