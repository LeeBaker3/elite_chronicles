# Integration Design — Politics-Economy Coupling

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Define cross-system coupling between political state transitions and economy
  simulation outputs while preserving determinism and stability.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Political state impact on economy | 5.6, 5.10, 9, 15.13 | Dynamic prices and mission/faction coherence | Additive coupling layer |
| Operational controls and safety | 5.11, 7.7, 11, 13 | Admin tuning and risk mitigation | Guardrail-driven rollout |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Coupling signals, weighted pressure contributions, bounded repricing impacts.

### Out of Scope
- Full political diplomacy simulation.

## Domain Model

- Political state snapshot + economy pressure inputs and impact metadata.

## Runtime Behavior

- Deterministic macro-tick coupling with clamped impact and staged ripple.

## Current State Starter (Batches 01-11)

- Direct politics-economy coupling is not yet implemented in batches 01-11.
- Economy tick and market freshness baselines are in place (`Batch 02`) and
  provide the core surface for future coupling.
- Persistent off-screen mutable-state continuity contracts are introduced in
  local navigation scope (`Batch 09`) as foundational preconditions.
- Galactic/system overview and reachability context are now available for
  future political impact surfacing (`Batch 11`).
- This integration area is implementation-targeted in `Batch 17`.

## Code-Truth Update (2026-03-04)

- Coupling status: direct politics-economy coupling remains planned scope and
  is not yet implemented in backend API surfaces.
- Backend status: verified active prerequisite foundations in economy
  tick/summary (`/api/markets/tick`, `/api/markets/{system_id}/summary`),
  mission lifecycle (`/api/missions/*`), and galaxy/system overview
  (`/api/systems/galaxy/systems*`).
- Frontend status: verified active runtime consumption of these prerequisite
  economy/mission/system surfaces.

## API and Data Contracts

- Additive metadata in economy/mission summaries for political context.

## Failure Modes and Guardrails

- Positive feedback loops, oversized one-tick shocks, operator over-tuning.

## Observability and Operations

- Coupling shock severity, guardrail breach count, rollback trigger metrics.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_markets_tick_admin_logs.py`
  - `pytest backend/tests/test_missions.py`

## Open Questions

- Initial default coupling profile values by commodity class.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent politics-economy integration design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code; direct politics-economy coupling remains planned scope.
