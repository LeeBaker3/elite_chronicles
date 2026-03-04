# Core System Design — Combat and Recovery

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Define deterministic combat resolution and post-combat survival/recovery
  outcomes.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Combat resolution | 5.4 | Combat fairness stories in 5.14 | Server-authoritative outcomes |
| Damage and upgrades relation | 5.5 | Loadout effects on survivability | Module-aware calculations |
| Recovery path | 15.15 | Combat recovery batch expectations | Escape/rescue continuity |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Damage ordering, cooldown logic, survival/recovery transitions.

### Out of Scope
- Advanced AI combat doctrine design.

## Domain Model

- Hull/shield/energy state, weapon and cooldown state, recovery outcome state.

## Runtime Behavior

- Tick-based combat pipeline and deterministic resolution ordering.

## Current State Starter (Batches 01-11)

- Full combat feature set is not implemented in batches 01-11; this period
  focuses on collision/docking safety and recovery foundations.
- Collision classification baseline is implemented (glancing/critical style
  impact handling with shield/hull effects) (`Batch 08`).
- Crash recovery to last safe checkpoint is implemented with operation-log
  observability and endpoint support (`Batch 08`).
- Docking/approach phase control and safety constraints are in place and form
  the deterministic transition backbone for future combat/recovery coupling.
- Escape capsule + rescue branch outcomes remain planned follow-on scope
  (`Batch 19`).

## Code-Truth Update (2026-03-04)

- Backend status: verified implemented combat-adjacent recovery APIs
  (`POST /api/ships/{ship_id}/collision-check`,
  `POST /api/ships/{ship_id}/crash-recovery`) with persisted safe-state data.
- Frontend status: verified active runtime collision-check flow usage.

## API and Data Contracts

- Combat action/result payloads and recovery state contracts.

## Failure Modes and Guardrails

- Double-apply damage, cooldown bypass, invalid recovery transitions.

## Observability and Operations

- Combat tick processing time, death/recovery outcomes, error rates.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_players_ships_markets.py`

## Open Questions

- Final rescue branch variants for late-game progression.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent combat/recovery design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
