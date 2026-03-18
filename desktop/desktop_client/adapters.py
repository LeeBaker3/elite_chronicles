"""Payload normalization helpers shared by the desktop runtime."""

from __future__ import annotations

from .models import LocalChartResponse, ShipLocalContactsResponse


def build_local_space_snapshot_version(
    system_id: int | None,
    generation_version: int | None,
    provided_version: str | None,
) -> str | None:
    """Normalize local-space snapshot versions the same way across clients."""

    normalized_provided_version = (provided_version or "").strip()
    if normalized_provided_version:
        return normalized_provided_version
    if not isinstance(system_id, int) or not isinstance(generation_version, int):
        return None
    return f"system-{system_id}-gen-{generation_version}"


def normalize_local_contacts_payload(
    payload: ShipLocalContactsResponse,
) -> ShipLocalContactsResponse:
    """Fill additive snapshot metadata when the backend omits it."""

    payload.snapshot_version = build_local_space_snapshot_version(
        system_id=payload.system_id,
        generation_version=payload.generation_version,
        provided_version=payload.snapshot_version,
    )
    return payload


def normalize_local_chart_payload(payload: LocalChartResponse) -> LocalChartResponse:
    """Normalize desktop chart payload defaults."""

    payload.snapshot_version = build_local_space_snapshot_version(
        system_id=payload.system.id,
        generation_version=payload.system.generation_version,
        provided_version=payload.snapshot_version,
    )
    if not payload.system.contract_version:
        payload.system.contract_version = "local-chart.v0"
    return payload
