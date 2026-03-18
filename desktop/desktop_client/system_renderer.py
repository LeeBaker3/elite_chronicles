"""System rendering adapters for desktop scene construction."""

from __future__ import annotations

from dataclasses import dataclass

from .floating_origin import Vec3Km, to_local_space
from .models import RuntimeBootstrapState


@dataclass(slots=True)
class RenderContact:
    """Minimal render-facing contact model."""

    contact_id: str
    name: str
    position: Vec3Km


@dataclass(slots=True)
class DebugSceneEntity:
    """One render-facing scene entity ready for debug inspection or Panda3D consumption."""

    entity_id: str
    entity_type: str
    name: str
    position: Vec3Km
    distance_km: int
    source: str


@dataclass(slots=True)
class DebugSceneSnapshot:
    """Stable local scene snapshot built from authoritative runtime state."""

    active_scene_name: str
    current_system_id: int
    current_system_name: str
    local_snapshot_version: str | None
    ship_id: int
    ship_name: str
    player_world_position: Vec3Km
    entity_count: int
    audio_event_hints: list[str]
    entities: list[DebugSceneEntity]


def build_render_contact(
    *,
    contact_id: str,
    name: str,
    object_position: Vec3Km,
    player_position: Vec3Km,
) -> RenderContact:
    """Build a local-space render contact from authoritative world positions."""

    return RenderContact(
        contact_id=contact_id,
        name=name,
        position=to_local_space(object_position, player_position),
    )


def _ship_world_position(state: RuntimeBootstrapState) -> Vec3Km:
    """Return the authoritative ship world position for local-scene derivation."""

    return Vec3Km(
        x=float(state.ship.position_x),
        y=float(state.ship.position_y),
        z=float(state.ship.position_z),
    )


def _chart_body_entity(*, body, player_position: Vec3Km) -> DebugSceneEntity:
    """Convert one chart body into a local-scene entity."""

    world_position = Vec3Km(
        x=float(body.position_x),
        y=float(body.position_y),
        z=float(body.position_z),
    )
    local_position = to_local_space(world_position, player_position)
    distance_km = int(round((local_position.x ** 2 + local_position.y ** 2 + local_position.z ** 2) ** 0.5))
    return DebugSceneEntity(
        entity_id=f"{body.body_kind}-{body.id}",
        entity_type=body.body_kind,
        name=body.name,
        position=local_position,
        distance_km=distance_km,
        source="local-chart",
    )


def _chart_station_entity(*, station, player_position: Vec3Km) -> DebugSceneEntity:
    """Convert one chart station into a local-scene entity."""

    world_position = Vec3Km(
        x=float(station.position_x),
        y=float(station.position_y),
        z=float(station.position_z),
    )
    local_position = to_local_space(world_position, player_position)
    distance_km = int(round((local_position.x ** 2 + local_position.y ** 2 + local_position.z ** 2) ** 0.5))
    return DebugSceneEntity(
        entity_id=f"station-{station.id}",
        entity_type="station",
        name=station.name,
        position=local_position,
        distance_km=distance_km,
        source="local-chart",
    )


def _contact_entity(*, contact) -> DebugSceneEntity:
    """Convert one scanner contact into a local-scene entity."""

    local_position = Vec3Km(
        x=float(contact.scene_x),
        y=float(contact.scene_y),
        z=float(contact.scene_z),
    )
    return DebugSceneEntity(
        entity_id=contact.id,
        entity_type=contact.contact_type,
        name=contact.name,
        position=local_position,
        distance_km=int(contact.distance_km),
        source="local-contacts",
    )


def build_debug_scene_snapshot(state: RuntimeBootstrapState) -> DebugSceneSnapshot:
    """Build one stable local-scene snapshot from authoritative runtime state."""

    player_position = _ship_world_position(state)
    entities: list[DebugSceneEntity] = []
    entities.append(_chart_body_entity(body=state.chart.star, player_position=player_position))
    entities.extend(
        _chart_body_entity(body=planet, player_position=player_position)
        for planet in state.chart.planets
    )
    for moons in state.chart.moons_by_parent_body_id.values():
        entities.extend(
            _chart_body_entity(body=moon, player_position=player_position)
            for moon in moons
        )
    entities.extend(
        _chart_station_entity(station=station, player_position=player_position)
        for station in state.chart.stations
    )
    entities.extend(_contact_entity(contact=contact) for contact in state.contacts.contacts)
    entities.sort(key=lambda entity: (entity.distance_km, entity.entity_type, entity.name))
    return DebugSceneSnapshot(
        active_scene_name=state.active_scene_name,
        current_system_id=state.snapshot.current_system_id,
        current_system_name=state.snapshot.current_system_name,
        local_snapshot_version=state.snapshot.local_snapshot_version,
        ship_id=state.ship.id,
        ship_name=state.ship.name,
        player_world_position=player_position,
        entity_count=len(entities),
        audio_event_hints=list(state.audio_event_hints),
        entities=entities,
    )