# Batch 16 Implementation Plan — Ship/Station Archetype Expansion + Cargo Convoys

Date: 2026-03-04  
Owner: Product + Backend + Frontend

## Objective

- Expand playable and ambient ship archetypes beyond current baseline.
- Expand station archetype coverage and service differences.
- Introduce cargo convoy systems as persistent economy actors.
- Connect convoy behavior to route risk and local traffic context.

## Why This Batch Next

- Expanded archetypes improve gameplay readability and progression identity.
- Convoys are needed to make economy movement visible and dynamic.
- This batch builds directly on NPC population and local navigation foundations.

## PRD Alignment (Required)

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Additional ship archetypes | 5.3, 5.5, 6.3 | Ship progression and role diversity | Additive ship class data |
| Additional station archetypes | 5.7, Appendix A | Station identity and service variety | Distinct service profiles |
| Cargo convoy simulation | 5.6 | NPC trade fleets and dynamic price impact | System-level flow visibility |

## Core Design Alignment (Required)

### Design Doc References

- Canonical index: `prd/design/core-system-design-index.md`
- Impacted design docs:
  - `prd/design/core-flight-navigation-design.md`
  - `prd/design/core-stations-locations-design.md`
  - `prd/design/core-economy-market-design.md`

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

- [ ] Archetype compatibility matrix defined (ship, station, services).
- [ ] Convoy route model and risk model documented.
- [ ] Economy integration hooks approved.
- [ ] Impacted `prd/design/` docs are reviewed and linked.

## In Scope

### 1) Ship Archetype Expansion
- Add multiple ship archetypes with distinct capability profiles.
- Keep deterministic visual and stat mapping.

### 2) Station Archetype Expansion
- Add additional station types with service and tech-level variance.
- Ensure station visuals and services stay contract-consistent.

### 3) Cargo Convoys
- Add convoy entities moving between stations/systems.
- Feed convoy arrivals/departures into inventory/economy adjustments.

### 4) Validation
- Backend tests for convoy movement + inventory influence.
- Frontend tests for archetype rendering/labels.

## Out of Scope (Explicit)

- Fully simulated escort combat AI.
- Dynamic station construction.

## Sound Effects / Audio Feedback (Required)

- `flight.convoy_detected`
  - Trigger: convoy enters local scanner/system visibility
  - Cooldown: 600ms
  - Channel: `flightVolume`
- `flight.convoy_docked`
  - Trigger: convoy completes station delivery event
  - Cooldown: 700ms
  - Channel: `uiVolume`
- `ops.archetype_switch_confirm`
  - Trigger: selecting/changing ship archetype or station context in UI
  - Cooldown: 250ms
  - Channel: `uiVolume`
- `alert.convoy_disrupted`
  - Trigger: convoy route disruption/failed delivery
  - Cooldown: 900ms
  - Channel: `alertVolume`

## Supporting Functionality Required

### Backend Systems
- Archetype registry and compatibility resolver.
- Convoy scheduler/state machine.

### Frontend Systems
- Archetype-aware rendering + badges in relevant views.
- Convoy visibility signals in system charts.

### Observability and Operations
- Metrics: convoy throughput, failed deliveries, archetype utilization.

## Data and Contract Additions

- Additive fields: `ship_archetype_tier`, `station_service_profile`, `convoy_state`.
- Contract additions for convoy route status and ETA.

## Implementation Sequence

1. Add archetype data models and migrations.
2. Implement convoy scheduler and economy hooks.
3. Wire frontend archetype/convoy visibility.
4. Validate and tune.

## Acceptance Criteria

- [ ] Multiple ship and station archetypes are available and consistent.
- [ ] Convoys visibly and mechanically affect economy flows.
- [ ] Archetype/convoy information is surfaced in gameplay UI.
- [ ] Convoy/archetype SFX cues fire on correct state transitions.

## Risks and Mitigations

- Risk: economy volatility from convoy swings.
  - Mitigation: bounded influence coefficients and staged tuning.

## Test and Validation Evidence

- `backend`: `pytest backend/tests/test_convoys.py`
- `frontend`: `npm run test -- <archetype-convoy-tests>`

## Documentation Update Checklist

- [ ] `prd/prd.md` reviewed for alignment.
- [ ] `prd/design/core-system-design-index.md` reviewed for impacted docs.
- [ ] Impacted `prd/design/*.md` docs updated in this batch.
- [ ] Batch status and acceptance evidence updated.
