"""Floating-origin helpers for desktop rendering."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Vec3Km:
    """Simple kilometer-space vector used by the scaffold."""

    x: float
    y: float
    z: float


def to_local_space(object_position: Vec3Km, player_position: Vec3Km) -> Vec3Km:
    """Translate one authoritative world position into local client space."""

    return Vec3Km(
        x=object_position.x - player_position.x,
        y=object_position.y - player_position.y,
        z=object_position.z - player_position.z,
    )