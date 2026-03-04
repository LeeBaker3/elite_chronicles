# Batch 08 Implementation Plan — Collision Detection + Docking Safety + Recovery

Date: 2026-02-18  
Owner: Product + Backend + Frontend

## Objective

Add physical interaction safety and deterministic recovery to flight gameplay:
- collisions against ships, stations, planets, and stars,
- crash handling that returns player to last safe save point,
- docking approach from current ship location into station docking port,
- docking computer range rules by docking computer tier.

## Execution Status Update (2026-02-18)

Status: Completed

### Completed in this iteration
- Added persistent `docking_computer_tier` on ships (default `standard`).
- Added telemetry fields:
  - `docking_computer_tier`
  - `docking_computer_range_km`
- Added server-authoritative dock range enforcement on `POST /api/ships/{ship_id}/dock`.
- Added out-of-range dock rejection test coverage.
- Added migration `0008_ship_docking_computer_tier`.
- Added server-side `docking-approach` phase and operation logs:
  - `dock-approach-start`
  - `dock-approach-complete`
- Added safe-checkpoint persistence on safe events (dock, undock, jump).
- Added `POST /api/ships/{ship_id}/crash-recovery` endpoint to restore latest checkpoint.
- Added migration `0009_ship_safe_checkpoint_recovery`.
- Added server-authoritative `POST /api/ships/{ship_id}/collision-check` with:
  - nearest-candidate collision evaluation (ship/station/planet/star),
  - glancing/critical severity classification,
  - shield/hull damage application,
  - critical impact checkpoint recovery + operation logging.
- Added collision operation log events and critical recovery observability.
- Added frontend collision monitor polling + in-flight status telemetry wiring.
- Tuned collision envelope and damage thresholds for less aggressive baseline impacts.
- Added lightweight in-flight recent impact observability (last 3 collision entries).
- Added `DOCK_APPROACH_ENABLED` feature flag control for staged docking approach rollout.
- Added integration coverage verifying tier-based docking range behavior (`basic` vs `advanced`).

### Remaining in Batch 08
- None.

## Why This Batch Next

Batch 07 establishes visual flight/docking baseline. Batch 08 converts that into gameplay-safe navigation:
- pilots need meaningful collision consequences,
- docking must be spatially believable and rule-bound,
- recovery must avoid frustrating hard-loss while preserving stakes.

## In Scope

### 1) Collision Detection Baseline
- Detect overlap/proximity events for player ship vs:
  - stations,
  - planets,
  - stars (exclusion zone),
  - other ships (traffic and players).
- Support two collision classes:
  - **glancing impact**: damage + impulse + warning,
  - **critical impact**: crash state trigger.

### 2) Collision Outcomes and Damage
- Apply collision response to ship state:
  - hull damage,
  - optional shield absorption first,
  - optional component damage hook.
- Add collision operation log entries with cause, object type, and severity.

### 3) Crash Recovery to Last Safe Save Point
- Define "safe save point" as latest checkpoint created by:
  - successful dock,
  - successful undock,
  - successful jump arrival,
  - explicit autosave event.
- On critical crash:
  - ship returns to latest safe checkpoint,
  - state restored from checkpoint snapshot,
  - crash/cost/logging rules applied.

### 4) Docking Port Approach Sequence
- Docking is no longer instant snap while in-space.
- On dock request success path:
  - compute station docking port vector from current ship location,
  - execute short approach/autopilot phase,
  - transition to docked state after approach completes.
- Maintain server-authoritative final dock state.

### 5) Docking Computer Range Rules
- Add docking computer classes (example tiers):
  - Basic,
  - Standard,
  - Advanced.
- Each tier defines max auto-dock range.
- Dock action allowed only when ship is within computed range for installed computer.
- Clear user-safe error when out of range.

### 6) Validation
- Backend tests for collision, crash recovery, and range checks.
- Frontend tests for docking controls and status transitions.
- Targeted manual checklist for impact->recovery and dock-approach sequence.

## Out of Scope (Explicit)

- Full rigid-body physics simulation.
- Complex rotational collision response.
- Insurance economy/rebuy system.
- Atmospheric landing and terrain collisions.

## Data and Contract Additions

- Ship state additions (or equivalent telemetry fields):
  - `last_safe_checkpoint_id` or equivalent snapshot pointer,
  - `flight_phase` additions for docking approach (e.g., `docking-approach`),
  - optional collision cooldown/timestamp metadata.
- Module/state additions:
  - docking computer tier field,
  - docking range derived from tier config.
- Operation log additions:
  - `collision`, `crash-recovery`, `dock-approach-start`, `dock-approach-complete`.

## Supporting Functionality Required (Implementation Readiness)

### Backend Systems
- Server-authoritative collision evaluator service (single source of truth for hit classification).
- Checkpoint snapshot service for create/restore on safe events and crash recovery.
- Docking approach phase-state service (enter/progress/complete/cancel).
- Docking computer capability resolver (tier -> effective range).

### Data and Migration
- Schema support for checkpoint pointers/snapshots and docking computer tier.
- Backfill/default policy for existing ships without docking computer metadata.
- Versioned migration script with rollback-safe defaults.

### Frontend and UX Support
- Flight HUD phase indicators for `docking-approach` and crash recovery outcomes.
- Command gating for invalid dock attempts (out of range, wrong phase, cooldown).
- User-safe actionable errors (why failed + what to do next).

### Config and Tuning
- Centralized tunables for collision radii/severity thresholds.
- Centralized docking computer range table (basic/standard/advanced).
- Environment-controlled feature flags for staged rollout:
  - `flight_collision_enabled`,
  - `dock_approach_enabled`.

### Observability and Operations
- Structured logs include collision type, object id/type, and checkpoint id.
- Metrics:
  - collisions per hour,
  - crash recoveries per hour,
  - dock approach success/failure reasons.
- Alert thresholds for abnormal crash/recovery spikes.

### Test and QA Support
- Deterministic fixtures for station/planet/star/ship collision envelopes.
- Integration tests for crash -> checkpoint restore path.
- Integration tests for docking range by computer tier.

## API/Behavior Notes

- Keep existing endpoints additive and backward compatible where possible.
- Dock endpoint behavior:
  - validates in-range before approach begins,
  - returns structured phase/status updates.
- Crash recovery should preserve consistent status/error envelopes.

## Implementation Sequence

0. Add migrations/config defaults and feature flags.
1. Add collision envelope checks and object-type hit classification.
2. Add checkpoint snapshot creation and restore workflow.
3. Add docking computer tier/range config and validation.
4. Add docking approach phase state machine.
5. Wire frontend phase feedback and control gating.
6. Add observability counters/log metadata.
7. Add tests and run validation suites.

## Acceptance Criteria

- Collisions with ships/stations/planets/stars are detected and classified.
- Critical crashes return player to latest safe save point.
- Docking from in-space follows an approach sequence from current location.
- Dock action fails when out of computer range and succeeds in-range.
- Different docking computer tiers produce different effective dock ranges.
- Frontend lint/tests pass; targeted backend tests pass.

## Risks and Mitigations

- Risk: False-positive collisions from simplistic bounds.
  - Mitigation: object-type tuned radius + collision cooldown + test fixtures.
- Risk: Recovery exploits for free teleport.
  - Mitigation: checkpoint policy restrictions and operation logging.
- Risk: Docking approach desync between server and client.
  - Mitigation: server-authoritative phase transitions and idempotent polling.
