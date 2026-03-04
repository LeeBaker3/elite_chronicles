# Batch 15 Implementation Plan — NPC Population Framework (In-Ship + Station)

Date: 2026-02-25  
Owner: Product + Backend + Frontend

## Objective

- Introduce baseline NPC characters visible across flight and station gameplay.
- Add NPC ship pilots in-space and station NPCs while docked.
- Provide deterministic spawn/behavior baselines tied to system context.
- Create hooks for missions, comms, and politics interactions.

## Why This Batch Next

- Current world lacks population presence, reducing immersion and gameplay variety.
- NPC presence is a prerequisite for richer mission, social, and economy loops.
- This batch lays the foundation for convoy and station narrative depth.

## PRD Alignment (Required)

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| In-space NPC pilots | 3, 5.2, 5.7 | Immersion and world persistence | Deterministic traffic actors |
| Station NPC population | 5.7, 5.8 | Docked interaction readiness | Supports narrative mode hooks |
| Reputation/faction-aware NPC roles | 5.10, 2.2 | Persona and mission flow support | Additive behavior tags |

## Execution Status Update (2026-02-25)

Status: Planned

## Readiness Checklist (Pre-Implementation Gate)

- [ ] NPC schema and identity rules defined.
- [ ] Spawn budget and density limits set by system/station profile.
- [ ] UI representation standards agreed (flight, station panels).
- [ ] Mission and comms integration hooks documented.

## In Scope

### 1) NPC Entity Baseline
- Define NPC character and NPC ship records with deterministic identity fields.
- Add role categories (trader, security, civilian, broker, technician).

### 2) In-Space NPC Presence
- Spawn NPC ships in local system contexts.
- Expose them as contacts for scanner/comms/targeting where applicable.

### 3) Station NPC Presence
- Render docked/station NPC availability in station interfaces.
- Support basic interaction metadata for future mission/dialog use.

### 4) Validation
- Backend tests for deterministic spawn and role assignment.
- Frontend tests for NPC display states.
- Manual QA for density/performance sanity.

## Out of Scope (Explicit)

- Full NPC AI behavior trees.
- Cinematic dialog systems.

## Sound Effects / Audio Feedback (Required)

- `npc.spawn_visible`
  - Trigger: NPC becomes visible in local context (rate-limited)
  - Cooldown: 1000ms
  - Channel: `uiVolume`
- `npc.contact_selected`
  - Trigger: player selects NPC ship/contact in scanner/chart
  - Cooldown: 200ms
  - Channel: `uiVolume`
- `npc.station_greeting`
  - Trigger: initiating station NPC interaction
  - Cooldown: 300ms
  - Channel: `uiVolume`
- `npc.role_alert_security`
  - Trigger: security NPC status escalation near player
  - Cooldown: 800ms
  - Channel: `alertVolume`

## Supporting Functionality Required

### Backend Systems
- NPC spawn service and persistence policy.
- Role assignment with system/faction context.

### Frontend Systems
- NPC listing/markers in station and flight UI.
- Empty/loading/error states for NPC feeds.

### Observability and Operations
- Metrics: NPC spawn counts, despawn churn, render load impact.

## Data and Contract Additions

- Additive entity fields: `npc_id`, `npc_role`, `faction_id`, `home_system_id`.
- Additive station payload blocks for available NPC interactions.

## Implementation Sequence

1. Add NPC models/schemas and migration.
2. Implement deterministic spawn and exposure endpoints.
3. Wire station and flight UI visibility.
4. Add tests and performance checks.

## Acceptance Criteria

- [ ] NPC ships appear in-space with deterministic roles.
- [ ] Station NPCs appear in docked contexts and are queryable.
- [ ] NPC data is available to future mission/comms workflows.
- [ ] NPC-related SFX cues are implemented with non-spam cooldown behavior.

## Risks and Mitigations

- Risk: overpopulation hurts performance.
  - Mitigation: hard spawn caps and profile-based budgets.

## Test and Validation Evidence

- `backend`: `pytest backend/tests/test_npc_population.py`
- `frontend`: `npm run test -- <npc-ui-tests>`

## Documentation Update Checklist

- [ ] `prd/prd.md` reviewed for alignment.
- [ ] Batch status updated as work progresses.
