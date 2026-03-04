# Batch 17 Implementation Plan — System Politics Engine + Economy Coupling

Date: 2026-02-25  
Owner: Product + Backend + Frontend

## Objective

- Add persistent system politics progression tied to factions and stability.
- Couple political shifts to economy behavior, trade routes, and market conditions.
- Surface political/economic effects in player-facing UIs and mission contexts.

## Why This Batch Next

- Economy simulation depth is limited without political drivers.
- Faction and mission systems need a consistent world-state backbone.
- This batch enables meaningful system-level consequences.

## PRD Alignment (Required)

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Political state persistence | 5.10, 6.5 | Faction reputation and mission ecosystem | Per-system political snapshots |
| Economy impact coupling | 5.6, 9 | Dynamic prices/availability by events | Shortage/boom/raids integration |
| UI visibility of politics effects | 5.6, 5.10 | Player readability of world changes | Additive market/faction indicators |

## Execution Status Update (2026-02-25)

Status: Planned

## Readiness Checklist (Pre-Implementation Gate)

- [ ] Political state model and transitions are defined.
- [ ] Economy coupling coefficients and guardrails are documented.
- [ ] Mission/reputation integration points are approved.

## In Scope

### 1) System Politics Model
- Track control, stability, and security per system.
- Apply deterministic political ticks.

### 2) Politics-to-Economy Coupling
- Adjust prices, stock availability, and risk modifiers from political state.
- Publish event markers for player readability.

### 3) Gameplay Surface Integration
- Expose political/economic state in market and system summaries.
- Add hooks for mission generation and faction outcomes.

### 4) Validation
- Backend tests for deterministic political/economy progression.
- Frontend tests for state presentation.

## Out of Scope (Explicit)

- Deep diplomacy simulation UI.
- Player-led government mechanics.

## Sound Effects / Audio Feedback (Required)

- `admin.politics_tick_applied`
  - Trigger: system politics tick successfully updates state
  - Cooldown: 400ms
  - Channel: `uiVolume`
- `trade.market_shift_minor`
  - Trigger: moderate economy shift from political state change
  - Cooldown: 600ms
  - Channel: `uiVolume`
- `trade.market_shift_major`
  - Trigger: large market shock (shortage/boom/raid) from politics events
  - Cooldown: 900ms
  - Channel: `alertVolume`
- `nav.security_level_changed`
  - Trigger: security tier changes for current system
  - Cooldown: 700ms
  - Channel: `alertVolume`

## Supporting Functionality Required

### Backend Systems
- Political tick engine and coupling calculator.
- State persistence and event emission.

### Frontend Systems
- Political/economy indicators in relevant panels.

### Observability and Operations
- Metrics: stability drift, event frequency, market shock severity.

## Data and Contract Additions

- Additive fields: `security_level`, `stability_score`, `control_faction_id`.
- Additive market summary impact metadata.

## Implementation Sequence

1. Implement political state schema and tick logic.
2. Integrate coupling into economy summaries/ticks.
3. Wire UI indicators and mission hooks.
4. Validate/tune coefficients.

## Acceptance Criteria

- [ ] Political state persists and progresses deterministically.
- [ ] Political changes materially affect economy behavior.
- [ ] Effects are visible to players in system/market context.
- [ ] Politics/economy SFX cues align with event severity and cooldown rules.

## Risks and Mitigations

- Risk: runaway instability loops.
  - Mitigation: clamped deltas and bounded event probabilities.

## Test and Validation Evidence

- `backend`: `pytest backend/tests/test_system_politics.py`
- `frontend`: `npm run test -- <politics-ui-tests>`

## Documentation Update Checklist

- [ ] `prd/prd.md` reviewed for alignment.
- [ ] Batch status updated with evidence.
