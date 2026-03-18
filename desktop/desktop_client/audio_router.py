"""Shared audio-event routing primitives for the desktop runtime."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AudioEvent:
    """One canonical audio event emitted by gameplay surfaces."""

    event_key: str
    channel: str


CANONICAL_AUDIO_EVENTS: tuple[AudioEvent, ...] = (
    AudioEvent(event_key="flight.jump_initiated", channel="flightVolume"),
    AudioEvent(event_key="scanner.ping", channel="uiVolume"),
    AudioEvent(event_key="ops.dock_success", channel="flightVolume"),
)