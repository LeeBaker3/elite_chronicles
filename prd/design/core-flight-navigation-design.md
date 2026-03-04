# Core System Design — Ship Flight and Navigation

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Define authoritative in-system flight, scanner behavior, docking constraints,
  and hyperspace navigation behavior.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Flight metrics and authority | 5.3, 7.2 | Persistent ship movement and metrics | Server-authoritative state |
| Jump mechanics | 5.3.1 | Jump constraints and misjump behavior | Deterministic constraints |
| Scanner behavior | 5.3.2 | Tactical scanner range/scale | True-distance list labels |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Flight state updates, scanner presets/display rules, docking constraints,
  jump planning/execution behavior.

### Out of Scope
- Full orbital physics simulation.

## Domain Model

- Ship position/velocity state, scanner contacts, jump state.

## Runtime Behavior

- Tick-driven flight updates and scanner telemetry refresh.

## Current State Starter (Batches 01-11)

- End-to-end flight-trade loop is established: trade -> undock -> jump ->
  approach -> dock -> trade (`Batch 04`).
- Flight scene realism baseline delivered with deterministic traffic visuals,
  station presentation, and render-profile controls (`Batch 05`, `Batch 07`).
- Local scanner contacts for ships/stations/planets/stars are implemented with
  synchronized selection and detail surfaces (`Batch 06`, `Batch 09`).
- Docking safety mechanics are in place: docking-computer range tiers,
  approach phase, collision checks, and checkpoint recovery (`Batch 08`).
- Local chart/scanner tandem and waypoint workflow are implemented with
  deterministic contact/state contracts (`Batch 09`).
- In-system travel and chart interactions are completed with local-target
  authority APIs and deterministic celestial identity parity (`Batch 10`).
- Galactic chart and hyperspace navigation are completed with mode switching,
  reachability evaluation, and destination overview contracts (`Batch 11`).

## Code-Truth Update (2026-03-04)

- Backend status: verified active ship flight/scanner endpoints (including
  local contacts, operations, docking, jump, collision-check, recovery,
  flight-state, position-sync, and cargo) plus systems chart/overview APIs.
- Frontend status: verified active runtime calls across these
  flight/navigation API surfaces.

## API and Data Contracts

- Ship and scanner APIs with additive fields only for new telemetry.

## Failure Modes and Guardrails

- Desync between visual and list telemetry, invalid jump attempts,
  docking-state race conditions.

## Observability and Operations

- Flight tick latency, scanner update cadence, jump failure reasons.

## Validation and Test Evidence

- Frontend tests:
  - `npm run test -- scanner-flight`

## Open Questions

- None currently.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent flight/navigation design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
