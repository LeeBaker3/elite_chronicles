# Batch 14 Implementation Plan — Real-Time Multiplayer Sync + In-System Communications

Date: 2026-02-25  
Owner: Product + Backend + Frontend

## Objective

- Deliver ship-to-ship and player-to-player communications with clear in-system behavior.
- Support instant local comms inside valid local scope and delayed relay delivery beyond local scope.
- Add multiplayer state synchronization channels for system/station/player contexts.
- Keep messaging deterministic, rate-limited, and moderation-safe.

## Why This Batch Next

- Existing comms baseline is mostly REST-driven and does not complete the real-time multiplayer target.
- Core gameplay clarity improves when player comms and shared state are synchronized live.
- This batch reduces risk of future rework in missions, combat, and station social gameplay.

## PRD Alignment (Required)

Every batch plan must align to `prd/prd.md`.

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Local instant communications | 5.9 | "Local real-time chat" acceptance | WebSocket station/system channels |
| Inter-system delayed comms | 5.9, 7.6, 7.10 | Delayed relay delivery behavior | Deterministic `deliver_at` rules |
| Multiplayer sync channels | 15 Phase 3, 11 | Shared world persistence and latency | `/ws/system`, `/ws/station`, `/ws/player` |
| Abuse controls and moderation | 5.9, 11, 13 | Rate limit + moderation safeguards | Additive control layer |

## Execution Status Update (2026-02-25)

Status: Planned

### Implemented in This Iteration

- [ ] N/A

### Remaining / Follow-up

- [ ] Full implementation

## Readiness Checklist (Pre-Implementation Gate)

- [ ] Channel authorization model is defined per scope (`system`, `station`, `player`).
- [ ] Delivery-latency policy is documented for local vs relay comms.
- [ ] Rate-limit and moderation boundaries are specified.
- [ ] Test harness exists for concurrent socket clients.
- [ ] Multiplayer conflict strategy is documented (`version` checks, `409 conflict_version`, retry-safe idempotency).

## In Scope

### 1) Real-Time Comms Channels
- Implement authenticated WebSocket channels for local comms.
- Ensure scoped routing for station/system presence.

### 2) Relay Delay and Delivery Mechanics
- Keep local comms instant where local-scope rules allow.
- Route beyond-local messages via deterministic delay calculations.
- Surface queued/delivered status to UI.

### 3) Multiplayer State Sync Foundation
- Broadcast key shared events (presence, channel activity, status updates).
- Add reconnect/resume behavior for dropped sockets.

### 4) Validation
- Backend tests for authorization, delay routing, and ordering.
- Frontend tests for live message delivery state rendering.
- Manual multi-client smoke test.

## Out of Scope (Explicit)

- Voice comms.
- End-to-end encryption redesign.

## Sound Effects / Audio Feedback (Required)

- `comms.local_send`
  - Trigger: successful local in-system/station message send
  - Cooldown: 150ms
  - Channel: `commsVolume`
- `comms.relay_queued`
  - Trigger: message accepted for delayed relay delivery
  - Cooldown: 250ms
  - Channel: `commsVolume`
- `comms.relay_delivered`
  - Trigger: delayed relay transitions to delivered state
  - Cooldown: 300ms
  - Channel: `commsVolume`
- `comms.channel_join`
  - Trigger: successful join to a socket channel
  - Cooldown: 250ms
  - Channel: `uiVolume`
- `comms.channel_reconnect`
  - Trigger: reconnect succeeds after socket interruption
  - Cooldown: 500ms
  - Channel: `uiVolume`

## Supporting Functionality Required

### Backend Systems
- WebSocket gateway and scoped message router.
- Delay scheduler for relay deliveries.
- Abuse controls (rate limits, content checks).
- Conflict-safe state updates with optimistic locking and deterministic retry behavior.

### Frontend Systems
- Channel subscription management and reconnect logic.
- Live message stream rendering with delivery-state badges.

### Observability and Operations
- Metrics: message latency, relay queue depth, socket reconnect rate.
- Structured comms logs with redaction.

## Data and Contract Additions

- Additive message metadata: `scope`, `deliver_at`, `delivered_at`, `status`.
- Additive socket payload fields: `channel_id`, `sender_context`, `trace_id`.

## Implementation Sequence

0. Finalize scope and authorization contract.
1. Implement WebSocket channel routing.
2. Implement delayed relay queue processing.
3. Wire frontend real-time channel and status UX.
4. Add tests and run multi-client validation.

## Acceptance Criteria

- [ ] In-scope local comms deliver instantly and reliably.
- [ ] Beyond-local comms follow deterministic delay and status transitions.
- [ ] Socket authorization and moderation/rate limits are enforced.
- [ ] SFX triggers fire once per event transition with cooldown-safe behavior.
- [ ] Concurrent multiplayer updates return deterministic conflicts and support safe retries.

## Risks and Mitigations

- Risk: race conditions causing duplicate/out-of-order messages.
  - Mitigation: sequence ids and deterministic ordering checks.
- Risk: abusive message volume.
  - Mitigation: per-user and per-channel throttling + moderation filters.

## Test and Validation Evidence

- Commands run:
  - `backend`: `pytest backend/tests/test_comms.py`
  - `frontend`: `npm run test -- <comms-tests>`
- Known environment limits must be recorded.

## Documentation Update Checklist

- [ ] `prd/prd.md` reviewed for alignment.
- [ ] Batch plan status updated.
- [ ] `CHANGELOG.md` updated if user-visible behavior changes.
