# Batch 18 Implementation Plan — Station Narrative Gameplay + Mission Loop Expansion

Date: 2026-02-25  
Owner: Product + Backend + Frontend

## Objective

- Expand in-station text/chat-driven gameplay into a structured loop.
- Deliver mission acquisition and completion flows tightly integrated with station narrative interactions.
- Connect NPC station interactions to story choices, rewards, and reputation.

## Why This Batch Next

- Current station narrative interactions are not yet a full gameplay loop.
- Mission depth and station role-play depend on stronger in-station interaction design.
- This batch ties together NPC, politics, and story systems in player-facing gameplay.

## PRD Alignment (Required)

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Text adventure confirmation loop | 5.8, 8 | AI-assisted story with explicit confirm | Preserve moderation and safety |
| Mission acquisition/turn-in flow | 5.10, 7.4 | Missions + reputation outcomes | Station-driven mission board |
| In-station chat interaction flow | 5.9 | Local social interaction context | Station channels + NPC hooks |

## Execution Status Update (2026-02-25)

Status: Planned

## Readiness Checklist (Pre-Implementation Gate)

- [ ] Story state model and mission linking schema defined.
- [ ] NPC interaction contract and moderation path finalized.
- [ ] Reward/reputation update rules documented.

## In Scope

### 1) Station Narrative Runtime
- Expand in-station story interactions with explicit intent confirmation.
- Support branching outcomes that affect reputation and mission access.

### 2) Mission Board + Narrative Hooks
- Introduce mission offers tied to station context and NPC roles.
- Support accept/progress/turn-in narrative steps.

### 3) Station Chat-Driven Interactions
- Support station chat hooks for mission cues and social narrative triggers.
- Keep moderation and safety controls.

### 4) Validation
- Backend tests for story/mission state transitions.
- Frontend tests for narrative flow and mission UI states.

## Out of Scope (Explicit)

- Full voice-acted narrative scenes.
- Dynamic cinematic cutscenes.

## Sound Effects / Audio Feedback (Required)

- `story.session_start`
  - Trigger: station narrative session enters active state
  - Cooldown: 300ms
  - Channel: `uiVolume`
- `story.choice_confirmed`
  - Trigger: player confirms interpreted narrative action
  - Cooldown: 220ms
  - Channel: `uiVolume`
- `missions.offer_received`
  - Trigger: mission offer appears from station interaction
  - Cooldown: 300ms
  - Channel: `uiVolume`
- `missions.accepted`
  - Trigger: mission acceptance confirmed
  - Cooldown: 250ms
  - Channel: `uiVolume`
- `missions.completed`
  - Trigger: mission completion/turn-in success
  - Cooldown: 350ms
  - Channel: `uiVolume`
- `story.invalid_action`
  - Trigger: narrative input rejected/invalid
  - Cooldown: 350ms
  - Channel: `alertVolume`

## Supporting Functionality Required

### Backend Systems
- Story/mission linkage service.
- Safe interpretation/confirmation pipeline.

### Frontend Systems
- Station narrative shell with explicit state feedback.
- Mission board and mission-progress status UX.

### Observability and Operations
- Metrics: mission acceptance rates, completion rates, abandonment rates.

## Data and Contract Additions

- Additive mission-story relation fields and station interaction context.
- Additive narrative action telemetry fields.

## Implementation Sequence

1. Define story-mission contracts and migrations.
2. Implement backend station narrative mission flows.
3. Wire frontend station narrative + mission interfaces.
4. Add tests and moderation validations.

## Acceptance Criteria

- [ ] Players can acquire and complete missions through station narrative interactions.
- [ ] Narrative choices feed reputation/reward outcomes.
- [ ] Chat-driven station interactions remain moderated and stable.
- [ ] Narrative and mission SFX cues fire at the correct interaction boundaries.

## Risks and Mitigations

- Risk: mission-state drift between narrative and mission endpoints.
  - Mitigation: server-authoritative transaction boundaries and idempotent updates.

## Test and Validation Evidence

- `backend`: `pytest backend/tests/test_story_missions_station.py`
- `frontend`: `npm run test -- <station-narrative-tests>`

## Documentation Update Checklist

- [ ] `prd/prd.md` reviewed for alignment.
- [ ] Batch status updated with evidence.
