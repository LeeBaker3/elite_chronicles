# Core System Design — Player and State Persistence

Status: Active  
Last Updated: 2026-03-12  
Owners: Product + Backend + Frontend

## Objective

- Maintain durable player state, location, credits, and progression across
  gameplay sessions and recovery scenarios.
- Define the shared player-state and persistence contract that must remain
  stable across first-party clients.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Player persistence | 5.2, 5.13, 6.1, 6.3 | Player/ship persistence stories in 5.14 | Autosave + restore expectations |
| Recovery safety | 5.13 | Crash/reconnect recovery | Safe fallback states |

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
- Persistent player/ship-linked state, autosave boundaries, restore flow.
- Shared commander, location, and persistence semantics across web and desktop
  clients.

### Out of Scope
- Narrative-only transient scene state not persisted in core profile.
- Platform-specific presentation and hydration details beyond shared state
  meaning.

## Domain Model

- `users`, `ships`, save snapshots/versioning, location state.
- Multi-client rule:
  - the same commander identity, location, ship linkage, and recovery state
    must be visible consistently across first-party clients.

## Runtime Behavior

- Save on critical events; restore on reconnect and service restart.
- Runtime split:
  - this doc defines shared persistence and restore semantics,
  - browser hydration and recovery UX belongs in
    `frontend-web-runtime-design.md`,
  - desktop bootstrap, reconnect, and runtime restore UX belongs in
    `frontend-desktop-runtime-design.md`.

## Current State Starter (Batches 01-11)

- Player state visibility endpoint (`GET /api/players/me`) is in place for
  commander identity, credits, and location summary (`Batch 01`).
- Core ship-state operations (dock, undock, refuel) are available with
  server-side state guards and conflict handling (`Batch 01`, `Batch 04`).
- Jump arrival now lands in destination system space (not auto-docked), with
  follow-on explicit approach/dock flow (`Batch 04`).
- Safe-checkpoint persistence and crash recovery restore flow are implemented
  for critical-impact scenarios (`Batch 08`).
- Flight transient-state authority has partial hardening; broader durability
  and release-level resilience remain follow-up scope.

## Code-Truth Update (2026-03-04)

- Backend status: verified active player-state surface
  (`GET /api/players/me`) and persisted user/session/ship/cargo models.
- Frontend status: verified active runtime calls to player-state endpoint.

## API and Data Contracts

- Player/ship state APIs must preserve backward-compatible response fields.
- Shared client-platform contract reference:
  - `prd/design/core-client-platform-contract-design.md`
- Multi-client compatibility rules:
  - supported clients must load the same persisted commander and ship state,
  - client-specific UI state must not be confused with persisted world state,
  - recovery semantics must remain backend-driven.

## Failure Modes and Guardrails

- Partial saves, stale snapshots, conflicting writes.
- Runtime drift where one client appears to restore a different commander,
  location, or ship state than another for the same backend data.

## Observability and Operations

- Save success rate, restore success rate, snapshot rollback events.
- Keep restore and recovery diagnostics comparable across web and desktop
  clients.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_user_smoke_flow.py`

## Open Questions

- Snapshot retention policy by environment.
- Whether some client-facing state bootstrap models should be extracted into a
  shared client model layer before desktop runtime work expands.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent player-state design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
- 2026-03-12 — Batch 12.5 — Cross-linked shared player-state and persistence
  rules to the client-platform contract and separated runtime-specific restore
  behavior into web and desktop companion docs.
