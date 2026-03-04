# Batch 06 Implementation Plan — Solar System Celestials + Scanner Contacts MVP

Date: 2026-02-16  
Owner: Product + Backend + Frontend

## Objective

Establish minimum in-system celestial presence and scanner functionality:
- each solar system has one star,
- each solar system has at least one planet,
- each station is associated with/orbiting a planet context,
- scanner reports local contacts: ships, stations, planets, stars.

## Why This Batch Next

Batch 04/05 provide end-to-end flow and visual baseline.
This batch adds world structure and sensor clarity required for navigation and spatial gameplay readability.

## In Scope

### 1) Celestial Data Baseline
- Add/verify per-system celestial records:
  - 1 star per system (MVP same star class allowed),
  - >=1 planet per system.
- Ensure station has explicit planetary association for display context.

### 2) Local System Presence Contract
- Define API payload for local detectable entities around player:
  - `ships`, `stations`, `planets`, `stars`,
  - relative distance/bearing metadata (MVP simplified values acceptable),
  - contact type + id/name.
- Keep additive contract extension and backward compatibility.

### 3) Scanner Functional Upgrade
- Replace placeholder scanner blip with multi-contact rendering:
  - distinct markers by contact type,
  - selected-contact detail panel,
  - nearest contact summary.
- Keep scanner keyboard reachable and visually legible.

### 4) Scene Anchors for Celestials
- Render star and at least one planet in local scene context.
- Keep orbital motion optional for MVP; static positions acceptable if labeled.
- Station should be visually co-located with its planetary context.

### 5) Validation
- Backend tests for local-presence API shape and per-system celestial guarantees.
- Frontend tests for scanner contact rendering logic.
- Manual verification checklist for each contact type visibility.

## Out of Scope (Explicit)

- Physically accurate orbital simulation.
- Multi-star systems.
- Full astronomical scale realism.
- Advanced sensor noise/jamming gameplay.

## API Contract Notes

- Keep existing flight/ship endpoints stable.
- Prefer one additive local-presence endpoint (or additive field on telemetry) with explicit typing.
- Preserve error-envelope/status code conventions.

## Implementation Sequence

1. Add/validate system celestial seed rules.
2. Implement local-presence API contract and tests.
3. Upgrade scanner data mapping and rendering.
4. Add star/planet scene anchors in flight view.
5. Run validation and publish scanner behavior notes.

## Acceptance Criteria

- Every playable system exposes one star and at least one planet.
- Scanner shows ships, stations, planets, and stars in local system context.
- Station-to-planet relationship is visible in UI context.
- All new APIs and UI flows preserve current error handling and auth behavior.

## Execution Status Update (2026-02-18)

Status: Completed

### Implemented in Current Iteration

- Added backend local scanner contacts API:
  - `GET /api/ships/{ship_id}/local-contacts` (auth + ship ownership guarded)
  - Returns current-system contacts for `ship`, `station`, `planet`, and `star`.
- Added deterministic system celestial baseline in API response:
  - one synthetic system primary star contact,
  - one synthetic planet contact per system,
  - station contacts from live station rows.
- Added nearby in-space ship contacts to scanner payload.
- Added backend test coverage for local contacts endpoint shape and contact-type presence.
- Replaced frontend placeholder scanner blip with multi-contact rendering:
  - type-specific blip colors,
  - selectable contacts,
  - selected contact metadata,
  - contact list with distance labels.

### Validation Snapshot

- Backend: `pytest tests/test_players_ships_markets.py` -> 19 passed.
- Frontend: `npm run lint` and `npm run test -- --run` -> all checks passed.

### Completed for Batch 06 Closure

- Added explicit station-to-planet orbit relationship in scanner API and UI context:
  - local contacts now include `orbiting_planet_name` for station contacts,
  - scanner meta panel and flight focus text display station orbit context.
- Added scene-level scanner sync anchors:
  - local contacts now include `scene_x`, `scene_y`, `scene_z` coordinates,
  - 3D flight scene renders star/planet/station anchors from scanner payload,
  - selected scanner contact drives a focused in-scene target ring.

## PRD Alignment

- Directly advances `5.3 Ship State and Flight Metrics` spatial awareness needs.
- Supports `5.7 Stations and Planetary Locations` and schema sections for `star_systems`, `planets`, `stations`.
- Strengthens core loop travel clarity (navigate -> dock -> trade).
