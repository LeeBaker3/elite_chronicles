from datetime import datetime

from pydantic import BaseModel


class LocalChartSystemSummary(BaseModel):
    id: int
    name: str
    generation_version: int
    seed_hash: str
    contract_version: str


class LocalChartBody(BaseModel):
    id: int
    body_kind: str
    body_type: str
    name: str
    generation_version: int
    parent_body_id: int | None
    orbit_index: int
    orbit_radius_km: int
    radius_km: int
    position_x: int
    position_y: int
    position_z: int
    render_profile: dict


class LocalChartStation(BaseModel):
    id: int
    name: str
    host_body_id: int | None
    orbit_radius_km: int | None
    orbit_phase_deg: int | None
    position_x: int
    position_y: int
    position_z: int


class LocalChartMutableState(BaseModel):
    economy_tick_cursor: int
    politics_tick_cursor: int
    last_economy_tick_at: datetime | None
    last_politics_tick_at: datetime | None
    security_level: str
    stability_score: int
    flight_phase: str
    transition_started_at: datetime | None
    local_target_contact_type: str | None
    local_target_contact_id: str | None
    local_target_status: str
    audio_event_hints: list[str]


class LocalChartResponse(BaseModel):
    system: LocalChartSystemSummary
    star: LocalChartBody
    planets: list[LocalChartBody]
    moons_by_parent_body_id: dict[str, list[LocalChartBody]]
    stations: list[LocalChartStation]
    mutable_state: LocalChartMutableState
