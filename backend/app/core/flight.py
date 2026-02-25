from enum import Enum


class FlightPhase(str, Enum):
    """Canonical flight phase values shared across backend layers."""

    IDLE = "idle"
    DESTINATION_LOCKED = "destination-locked"
    DOCKING_APPROACH = "docking-approach"
    CHARGING = "charging"
    JUMPING = "jumping"
    ARRIVED = "arrived"
    ERROR = "error"


def normalize_flight_phase(value: str) -> FlightPhase:
    """Normalize and validate a raw phase string into a FlightPhase."""

    normalized = value.strip().lower()
    return FlightPhase(normalized)
