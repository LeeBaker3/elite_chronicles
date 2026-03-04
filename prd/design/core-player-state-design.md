# Core System Design — Player and State Persistence

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Maintain durable player state, location, credits, and progression across
  gameplay sessions and recovery scenarios.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Player persistence | 5.2, 5.13, 6.1, 6.3 | Player/ship persistence stories in 5.14 | Autosave + restore expectations |
| Recovery safety | 5.13 | Crash/reconnect recovery | Safe fallback states |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Persistent player/ship-linked state, autosave boundaries, restore flow.

### Out of Scope
- Narrative-only transient scene state not persisted in core profile.

## Domain Model

- `users`, `ships`, save snapshots/versioning, location state.

## Runtime Behavior

- Save on critical events; restore on reconnect and service restart.

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

## Failure Modes and Guardrails

- Partial saves, stale snapshots, conflicting writes.

## Observability and Operations

- Save success rate, restore success rate, snapshot rollback events.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_user_smoke_flow.py`

## Open Questions

- Snapshot retention policy by environment.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent player-state design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
