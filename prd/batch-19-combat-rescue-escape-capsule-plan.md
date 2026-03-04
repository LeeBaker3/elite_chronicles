# Batch 19 Implementation Plan — Combat Completion + Escape Capsule + Rescue Outcomes

Date: 2026-03-04  
Owner: Product + Backend + Frontend

## Objective

- Complete combat loop behavior with destruction, survival, and recovery outcomes.
- Add escape capsule mechanics when ship destruction occurs.
- Support rescue outcomes: pickup by nearby ship or transfer to nearest station.
- Integrate rescue outcomes with credits, inventory retention, and reputation context.

## Why This Batch Next

- Collision/destruction without survival/rescue outcomes creates a gameplay dead-end.
- Escape capsule flow is central to classic Elite-inspired consequences.
- This batch closes the death/recovery loop with player-agency outcomes.

## PRD Alignment (Required)

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Combat/damage completion | 5.4, 6.7 | Fair deterministic combat outcomes | Server-authoritative events |
| Escape pod / survival outcomes | 5.4, 5.13, 5.14 | Player destruction/recovery acceptance | Ejection + rescue branches |
| Recovery and persistence | 5.13 | Safe-state continuity | Inventory/penalty policy |

## Core Design Alignment (Required)

### Design Doc References

- Canonical index: `prd/design/core-system-design-index.md`
- Impacted design docs:
  - `prd/design/core-combat-recovery-design.md`
  - `prd/design/core-player-state-design.md`
  - `prd/design/core-flight-navigation-design.md`

### Design Alignment Rules

- Update impacted design docs in the same PR as behavior changes.
- Keep changes additive and cross-batch; avoid one-off design files.
- If scope expands beyond current design docs, add a new core/integration
  doc and register it in the canonical index.

## Execution Status Update (2026-03-04)

Status: Planned
- Governance Update: Completed (core design alignment integrated).
- Implementation Readiness: Pending (readiness checklist not yet complete).

## Readiness Checklist (Pre-Implementation Gate)

- [ ] Escape capsule eligibility rules defined by ship/loadout.
- [ ] Rescue branch logic and penalties documented.
- [ ] Persistence policy for post-destruction state approved.
- [ ] Impacted `prd/design/` docs are reviewed and linked.

## In Scope

### 1) Escape Capsule Ejection Flow
- Trigger ejection when ship is destroyed and escape capsule is available.
- Enter capsule state with reduced controls and beacon broadcast.

### 2) Rescue Outcomes
- Nearby ship pickup branch.
- Auto-transfer to nearest eligible station branch when no pickup occurs.

### 3) Persistence and Penalty Rules
- Apply loss/recovery policy for ship, cargo, credits, and mission state.
- Log all destruction/ejection/rescue events.

### 4) Validation
- Backend tests for branch determinism and persistence effects.
- Frontend tests for destruction/ejection/rescue status flow.

## Out of Scope (Explicit)

- Full EVA gameplay.
- Multiplayer boarding mechanics.

## Sound Effects / Audio Feedback (Required)

- `combat.collision_minor`
  - Trigger: low-severity collision event resolved.
  - Cooldown: 180ms.
  - Channel: `sfxVolume`.
- `combat.collision_critical`
  - Trigger: critical collision threshold crossed.
  - Cooldown: 250ms.
  - Channel: `alertVolume`.
- `ship.escape_capsule_ejected`
  - Trigger: pilot ejection into escape capsule.
  - Cooldown: 400ms.
  - Channel: `alertVolume`.
- `rescue.beacon_detected`
  - Trigger: escape capsule rescue beacon acquired.
  - Cooldown: 300ms.
  - Channel: `sfxVolume`.
- `rescue.pickup_confirmed`
  - Trigger: successful capsule pickup event.
  - Cooldown: 300ms.
  - Channel: `uiVolume`.
- `rescue.station_transfer_complete`
  - Trigger: survivor transfer completed at station.
  - Cooldown: 350ms.
  - Channel: `uiVolume`.

## Supporting Functionality Required

### Backend Systems
- Destruction outcome resolver with capsule branch.
- Rescue matching/timeout service.

### Frontend Systems
- Capsule state HUD and rescue status messaging.
- Recovery outcome rendering and next-action prompts.

### Observability and Operations
- Metrics: destruction rates, ejection rates, rescue type distribution.

## Data and Contract Additions

- Additive fields: `escape_capsule_available`, `capsule_state`, `rescue_outcome`.
- Additive operation-log events for ejection/pickup/station-recovery.

## Implementation Sequence

1. Implement escape capsule eligibility and ejection states.
2. Implement rescue branch resolver and timeouts.
3. Wire frontend capsule/recovery state UX.
4. Add tests and balancing pass.

## Acceptance Criteria

- [ ] Destroyed ships with escape capsules can eject into capsule state.
- [ ] Rescue resolves deterministically to pickup or station transfer.
- [ ] Post-rescue persistence and penalties are consistent and logged.
- [ ] Combat/rescue SFX cues match collision, ejection, and transfer states.

## Risks and Mitigations

- Risk: exploit loops for low-penalty destruction.
  - Mitigation: bounded penalties and anti-farming guardrails.

## Test and Validation Evidence

- `backend`: `pytest backend/tests/test_escape_capsule_recovery.py`
- `frontend`: `npm run test -- <escape-capsule-tests>`

## Documentation Update Checklist

- [ ] `prd/prd.md` reviewed for alignment.
- [ ] `prd/design/core-system-design-index.md` reviewed for impacted docs.
- [ ] Impacted `prd/design/*.md` docs updated in this batch.
- [ ] Batch status updated with evidence.
