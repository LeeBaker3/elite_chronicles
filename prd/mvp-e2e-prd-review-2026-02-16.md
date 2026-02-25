# MVP End-to-End Review Against PRD (2026-02-16)

Owner: Product + Engineering

## Review Scope

User-requested MVP outcomes reviewed:
- full docked-trade -> undock -> fly -> system jump -> docked-trade loop,
- more realistic ship/station visuals and background stars,
- visible nearby traffic ships at station,
- one-star + one-planet minimum per system,
- scanner coverage for ships/stations/planets/stars.

## PRD Mapping and Current Status

### A) End-to-End Travel + Trade Loop
- PRD anchors:
  - `4. Core Game Loop` (travel, dock, trade repeat)
  - `5.3 Ship State and Flight Metrics`
  - `5.6 Economy and Trading`
- Current status:
  - partially complete.
  - trade, dock/undock, jump exist, but jump flow still needs full map-first and explicit destination-system arrival path for best end-to-end fidelity.
- Planned batch:
  - `batch-04-e2e-flight-trade-loop-plan.md`.

### B) Realistic MVP Space Visuals (80s Elite feel)
- PRD anchors:
  - `3. Product Pillars / Immersion`
  - `5.7 Stations and Planetary Locations`
- Current status:
  - partial placeholder implementation exists (primitive ship/waypoint/star dots).
  - realistic ship/station and convincing backdrop not yet delivered.
- Planned batch:
  - `batch-05-flight-scene-traffic-visuals-plan.md`.

### C) Nearby Ships Approaching/Leaving Station
- PRD anchors:
  - immersion and shared-world presentation goals.
- Current status:
  - not delivered as active in-scene traffic behavior.
- Planned batch:
  - `batch-05-flight-scene-traffic-visuals-plan.md`.

### D) Star + Planet Presence Per System
- PRD anchors:
  - `6.2 World and Locations` (`star_systems`, `planets`, `stations`)
  - `5.7 Stations and Planetary Locations`
- Current status:
  - data model direction exists in PRD, but MVP gameplay rendering/contract enforcement for star+planet minimum is not fully surfaced.
- Planned batch:
  - `batch-06-system-celestials-scanner-plan.md`.

### E) Scanner Contact Coverage (Ships/Stations/Planets/Stars)
- PRD anchors:
  - `5.3 Ship State and Flight Metrics` (situational awareness)
  - core loop navigation clarity.
- Current status:
  - scanner shell exists, but contact detection/rendering is placeholder-level.
- Planned batch:
  - `batch-06-system-celestials-scanner-plan.md`.

## Proposed Batch Sequence

1. Batch 04 — functional end-to-end loop continuity.
2. Batch 05 — visual immersion and ambient station traffic.
3. Batch 06 — celestial system structure and scanner contact fidelity.

## MVP Exit Definition for This Track

This requested track is considered complete when:
- a player can complete the full two-station trade loop with explicit flight and docking transitions,
- the flight scene includes one realistic ship + one realistic station + ambient traffic,
- each playable system visibly includes star + planet context,
- scanner shows all four local contact classes (ship/station/planet/star).
