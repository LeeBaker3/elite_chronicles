"""Desktop client configuration helpers."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(slots=True)
class DesktopClientConfig:
    """Runtime configuration for the desktop client scaffold."""

    api_base_url: str
    session_path: Path
    request_timeout_seconds: float
    user_agent: str


def load_config() -> DesktopClientConfig:
    """Load desktop configuration from environment variables."""

    api_base_url = os.getenv("ELITE_API_URL", "http://localhost:8000")
    session_override = os.getenv("ELITE_DESKTOP_SESSION_PATH")
    timeout_seconds = float(os.getenv("ELITE_DESKTOP_HTTP_TIMEOUT", "10"))
    user_agent = os.getenv(
        "ELITE_DESKTOP_USER_AGENT",
        "EliteChroniclesDesktop/0.1",
    )

    if session_override:
        session_path = Path(session_override).expanduser().resolve()
    else:
        session_path = (
            Path.home() / ".elite-chronicles-desktop" / "session.json"
        )

    return DesktopClientConfig(
        api_base_url=api_base_url.rstrip("/"),
        session_path=session_path,
        request_timeout_seconds=timeout_seconds,
        user_agent=user_agent,
    )
