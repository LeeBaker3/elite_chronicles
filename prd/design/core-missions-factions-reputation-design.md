# Core System Design — Missions, Factions, Reputation

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Define mission generation/lifecycle and faction reputation progression,
  including integration points with economy and political context.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Mission generation/lifecycle | 5.10, 7.4 | Mission stories in 5.14 | Faction and station sourced |
| Reputation outcomes | 5.10, 6.5 | Reputation changes by mission/trade behavior | Deterministic progression |
| Batch coupling anchor | 15.13, 15.14 | Politics and narrative expansion | Integration surface |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Mission lifecycle, faction weighting, reputation updates, reward outcomes.

### Out of Scope
- Fully procedural campaign generation beyond defined mission types.

## Domain Model

- `factions`, `missions`, `mission_assignments`, `reputation`.

## Runtime Behavior

- Mission generation cadence, accept/complete transitions, reputation updates.

## Current State Starter (Batches 01-11)

- Missions/factions/reputation are largely pre-expansion in the 01-11 window;
  dedicated mission-loop growth is deferred to later batches.
- Batch 04 establishes cross-system travel + trade continuity, creating the
  prerequisite movement loop missions can attach to.
- Batch 09 introduces persistent off-screen economy/politics continuity
  contracts that can feed future mission weighting and reputation context.
- Batch 11 adds richer system overview fields (economy/government/tech/
  population/reachability) that can seed mission board context.
- Dedicated station narrative + mission lifecycle implementation remains
  planned for `Batch 18`.

## Code-Truth Update (2026-03-04)

- Backend status: verified active missions endpoints for available/me listings,
  accept, complete, abandon, and dev dummy generation, with assignment and
  reputation persistence models present.
- Frontend status: verified active runtime mission lifecycle API calls.

## API and Data Contracts

- Mission list/accept/complete contract behavior and additive context fields.

## Failure Modes and Guardrails

- Duplicate assignment, invalid completion transitions, runaway reputation gain.

## Observability and Operations

- Mission conversion rate, completion failure reasons, reputation drift metrics.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_missions.py`

## Open Questions

- Cross-system mission dependency modeling depth.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent missions/factions/reputation design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
