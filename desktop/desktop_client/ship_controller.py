"""Input and ship-control state for the desktop client scaffold."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ShipControlState:
    """Minimal control state for future input mapping."""

    throttle: float = 0.0
    pitch: float = 0.0
    yaw: float = 0.0
    roll: float = 0.0


class ShipController:
    """Collects control intent separate from backend-authoritative state."""

    def __init__(self) -> None:
        self.state = ShipControlState()

    def reset(self) -> None:
        """Reset local input intent to a neutral state."""

        self.state = ShipControlState()