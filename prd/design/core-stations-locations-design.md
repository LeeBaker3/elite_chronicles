# Core System Design — Stations and Locations

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Define station/location identity, services, and data needed to support
  trade, docking, missions, and story entry points.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Station archetypes/services | 5.7, 6.2 | Distinct station behavior and services | Faction + tech influence |
| Location persistence surfaces | 6.2, 6.3 | Player location consistency | Shared world coherence |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Station archetypes, service catalogs, location metadata contracts.

### Out of Scope
- Procedural interiors and on-foot geometry systems.

## Domain Model

- `star_systems`, `stations`, `planets`, `station_archetypes`.

## Runtime Behavior

- Service availability and location-specific interactions per current state.

## Current State Starter (Batches 01-11)

- Station docking/undocking/refuel operational flow is implemented and tied to
  authoritative ship state transitions (`Batch 01`, `Batch 04`).
- Flight scene includes station-traffic realism baseline and archetype-aware
  rendering paths for docked/in-space contexts (`Batch 05`, `Batch 07`).
- Station-to-planet relationship context is surfaced through scanner/chart
  contact metadata and local scene anchor behavior (`Batch 06`, `Batch 09`).
- Station docking now includes range-gated approach safety controls and tiered
  docking-computer constraints (`Batch 08`).
- Deterministic celestial + station host-body generation/association contracts
  are documented and used by local/galactic chart payloads (`10`, `11`).
- Galactic overview payloads include station summary context for destination
  inspection workflows (`Batch 11`).

## Code-Truth Update (2026-03-04)

- Backend status: verified active station APIs for list, inventory, and trade
  (`GET /api/stations`, `GET /api/stations/{station_id}/inventory`,
  `POST /api/stations/{station_id}/trade`).
- Frontend status: verified active runtime calls across station/location
  surfaces.

## API and Data Contracts

- Location/station data payloads used by market, mission, and story surfaces.

## Failure Modes and Guardrails

- Missing services metadata, invalid archetype references, stale location links.

## Observability and Operations

- Service availability errors, station usage distribution, archetype health checks.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_systems_local_chart.py`

## Open Questions

- Future extension path for station-specific narrative state.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent stations/locations design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
