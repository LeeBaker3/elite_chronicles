# Core System Design — Communications and Messaging

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Define local real-time comms and delayed interstellar messaging with
  deterministic routing, delivery status, and moderation controls.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Local + delayed messaging | 5.9, 7.6 | Communication stories in 5.14 | Delay model and status tracking |
| Abuse and safety controls | 5.9, 11, 13 | Rate limits and moderation | Operational safeguards |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Local comms channels, relay routing, delayed delivery lifecycle.

### Out of Scope
- Voice comms.

## Domain Model

- Messages, channel reads, relay path metadata, delivery timestamps.

## Runtime Behavior

- Real-time local publish and delayed delivery worker flow.

## Current State Starter (Batches 01-11)

- Communications MVP is completed with location-aware channel contexts and
  delayed interstellar delivery semantics (`Batch 03`).
- Interstellar lifecycle supports queue -> deliver behavior using
  `deliver_at`-style timing, while local context remains instant (`Batch 03`).
- Read-state and delivery-state labeling are surfaced in frontend console
  flows (`instant`, `queued`, `delivered`) (`Batch 03`).
- Contract compatibility and incremental logs-follow style operations were
  hardened for ops usage during MVP completion (`Batch 03`).
- Full websocket/presence transport remains intentionally deferred beyond the
  01-11 slice.

## Code-Truth Update (2026-03-04)

- Backend status: verified active comms endpoints for channel list, messages
  list/send, and channel read updates, with message/read-state models present.
- Frontend status: verified active runtime comms API calls.

## API and Data Contracts

- Message send/read/status contracts and delivery metadata fields.

## Failure Modes and Guardrails

- Delivery duplication, routing dead ends, moderation bypass.

## Observability and Operations

- Delivery latency, queue backlog, failed-route count, moderation actions.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_comms.py`

## Open Questions

- Global relay re-route strategy under partial outages.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent communications design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
