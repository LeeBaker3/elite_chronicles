"""Scene lifecycle helpers for the Panda3D desktop scaffold."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class SceneState:
    """High-level local scene state derived from backend-authoritative runtime data."""

    active_scene_name: str = "bootstrap"
    current_system_id: int | None = None
    current_system_name: str | None = None
    local_snapshot_version: str | None = None
    contact_count: int = 0
    chart_body_count: int = 0


class SceneManager:
    """Owns high-level scene transitions for the desktop client."""

    def __init__(self) -> None:
        self.state = SceneState()

    @property
    def active_scene_name(self) -> str:
        """Return the current active scene name."""

        return self.state.active_scene_name

    def set_active_scene(self, scene_name: str) -> None:
        """Set the current scene name for future runtime hooks."""

        self.state.active_scene_name = scene_name

    def sync_runtime_state(
        self,
        *,
        scene_name: str,
        current_system_id: int,
        current_system_name: str,
        local_snapshot_version: str | None,
        contact_count: int,
        chart_body_count: int,
    ) -> None:
        """Mirror authoritative runtime data into minimal local scene state."""

        self.state.active_scene_name = scene_name
        self.state.current_system_id = current_system_id
        self.state.current_system_name = current_system_name
        self.state.local_snapshot_version = local_snapshot_version
        self.state.contact_count = contact_count
        self.state.chart_body_count = chart_body_count