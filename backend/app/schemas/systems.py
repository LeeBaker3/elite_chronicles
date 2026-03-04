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


class GalaxySystemEntry(BaseModel):
    system_id: int
    name: str
    x: int
    y: int
    z: int
    economy: str
    government: str
    tech_level: int
    population: int
    reachable_from_current: bool
    estimated_jump_fuel: int | None
    reachability_reason: str | None


class GalaxyDatasetSource(BaseModel):
    mode: str
    source_name: str
    license_type: str
    source_version: str
    generated_at: datetime


class GalaxySystemsResponse(BaseModel):
    current_system_id: int
    view_mode: str
    dataset_source: GalaxyDatasetSource
    systems: list[GalaxySystemEntry]


class GalaxyOverviewPlanetSummary(BaseModel):
    name: str
    body_type: str
    orbit_index: int


class GalaxyOverviewStationSummary(BaseModel):
    name: str
    archetype: str | None
    host_body_name: str | None


class GalaxyOverviewSummary(BaseModel):
    planets_total: int
    moons_total: int
    stations_total: int
    planets: list[GalaxyOverviewPlanetSummary]
    stations: list[GalaxyOverviewStationSummary]


class GalaxyOverviewSystem(BaseModel):
    id: int
    name: str
    economy: str
    government: str
    tech_level: int
    population: int


class GalaxyOverviewJump(BaseModel):
    reachable: bool
    estimated_jump_fuel: int | None
    reason: str | None
    route_hops: list[int]
    route_hop_names: list[str]
    route_total_estimated_fuel: int | None


class GalaxySystemOverviewResponse(BaseModel):
    dataset_source: GalaxyDatasetSource
    system: GalaxyOverviewSystem
    jump: GalaxyOverviewJump
    overview: GalaxyOverviewSummary
