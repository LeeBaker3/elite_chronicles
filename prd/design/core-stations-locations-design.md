# Core System Design — Stations and Locations

Status: Active  
Last Updated: 2026-03-12  
Owners: Product + Backend + Frontend

## Objective

- Define station/location identity, services, and data needed to support
  trade, docking, missions, and story entry points.
- Define the shared station and location contract that must remain consistent
  across first-party runtimes even if presentation differs.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Station archetypes/services | 5.7, 6.2 | Distinct station behavior and services | Faction + tech influence |
| Location persistence surfaces | 6.2, 6.3 | Player location consistency | Shared world coherence |

### PRD Update Needed

- None.

### Companion Design Docs

- Shared client-platform authority baseline:
  `prd/design/core-client-platform-contract-design.md`
- Browser runtime behavior:
  `prd/design/frontend-web-runtime-design.md`
- Desktop runtime behavior:
  `prd/design/frontend-desktop-runtime-design.md`

## System Scope

### In Scope
- Station archetypes, service catalogs, location metadata contracts.
- Shared station identity, service availability, and location semantics across
  web and desktop clients.

### Out of Scope
- Procedural interiors and on-foot geometry systems.
- Platform-specific presentation, navigation shell, or scene composition
  details beyond shared contract meaning.

## Domain Model

- `star_systems`, `stations`, `planets`, `station_archetypes`.
- Multi-client rule:
  - station identity, service availability, and location-link semantics must
    remain shared across first-party clients.

## Runtime Behavior

- Service availability and location-specific interactions per current state.
- Runtime split:
  - this doc defines shared station/location meaning,
  - browser location and service presentation belongs in
    `frontend-web-runtime-design.md`,
  - desktop station/location presentation and navigation shell belongs in
    `frontend-desktop-runtime-design.md`.

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
- Shared client-platform contract reference:
  - `prd/design/core-client-platform-contract-design.md`
- Multi-client compatibility rules:
  - first-party clients must interpret station identity, archetype, service
    availability, and location links the same way,
  - clients may differ in UI composition or 3D presentation, but not in the
    meaning of location state.

## Failure Modes and Guardrails

- Missing services metadata, invalid archetype references, stale location links.
- Runtime drift where web and desktop surface conflicting station-service or
  location meaning for the same backend state.

## Observability and Operations

- Service availability errors, station usage distribution, archetype health checks.
- Keep station/location diagnostics comparable across first-party client
  platforms.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_systems_local_chart.py`

## Open Questions

- Future extension path for station-specific narrative state.
- Whether desktop should mirror the current web station-service flow closely
  or use a more diegetic station shell while preserving the same backend
  contract.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent stations/locations design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
- 2026-03-12 — Batch 12.5 — Cross-linked shared station/location rules to the
  client-platform contract and separated runtime-specific behavior into web
  and desktop companion docs.
