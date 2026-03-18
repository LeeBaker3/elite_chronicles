"""Local session storage helpers for the desktop client scaffold."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path


@dataclass(slots=True)
class SessionState:
    """Minimal persisted desktop session state."""

    access_token: str | None = None
    user_id: int | None = None
    selected_ship_id: int | None = None
    primary_ship_id: int | None = None


class SessionStore:
    """Read and write local desktop session state."""

    def __init__(self, session_path: Path) -> None:
        self._session_path = session_path

    def load(self) -> SessionState:
        """Return saved session state when present, else defaults."""

        if not self._session_path.exists():
            return SessionState()

        try:
            payload = json.loads(self._session_path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return SessionState()

        return SessionState(
            access_token=payload.get("access_token"),
            user_id=payload.get("user_id"),
            selected_ship_id=payload.get("selected_ship_id"),
            primary_ship_id=payload.get("primary_ship_id"),
        )

    def save(self, state: SessionState) -> None:
        """Persist session state to disk."""

        self._session_path.parent.mkdir(parents=True, exist_ok=True)
        self._session_path.write_text(
            json.dumps(asdict(state), indent=2),
            encoding="utf-8",
        )

    def clear(self) -> None:
        """Delete the persisted session file when it exists."""

        if self._session_path.exists():
            self._session_path.unlink()
