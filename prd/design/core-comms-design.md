# Core System Design — Communications and Messaging

Status: Active  
Last Updated: 2026-03-12  
Owners: Product + Backend + Frontend

## Objective

- Define local real-time comms and delayed interstellar messaging with
  deterministic routing, delivery status, and moderation controls.
- Define the shared communications contract that must remain consistent across
  first-party runtimes even if web and desktop presentation differs.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Local + delayed messaging | 5.9, 7.6 | Communication stories in 5.14 | Delay model and status tracking |
| Abuse and safety controls | 5.9, 11, 13 | Rate limits and moderation | Operational safeguards |

### PRD Update Needed

- None.

### Companion Design Docs

- Shared client-platform authority baseline:
  `prd/design/core-client-platform-contract-design.md`
- Browser runtime behavior:
  `prd/design/frontend-web-runtime-design.md`
- Desktop runtime behavior:
  `prd/design/frontend-desktop-runtime-design.md`

## System Scope

### In Scope
- Local comms channels, relay routing, delayed delivery lifecycle.
- Shared message, delivery-state, and moderation semantics across web and
  desktop clients.

### Out of Scope
- Voice comms.
- Platform-specific message presentation and UI-shell details beyond shared
  contract meaning.

## Domain Model

- Messages, channel reads, relay path metadata, delivery timestamps.
- Multi-client rule:
  - message status meanings, delivery lifecycle, and moderation semantics must
    remain shared across first-party clients.

## Runtime Behavior

- Real-time local publish and delayed delivery worker flow.
- Runtime split:
  - this doc defines shared messaging lifecycle and status meaning,
  - browser channel/message presentation belongs in
    `frontend-web-runtime-design.md`,
  - desktop messaging presentation and interaction shell belongs in
    `frontend-desktop-runtime-design.md`.

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
- Shared client-platform contract reference:
  - `prd/design/core-client-platform-contract-design.md`
- Multi-client compatibility rules:
  - first-party clients must interpret `instant`, `queued`, `delivered`, and
    related status fields the same way,
  - clients may differ in message layout or notification UX, but not in
    underlying delivery semantics.

## Failure Modes and Guardrails

- Delivery duplication, routing dead ends, moderation bypass.
- Runtime drift where web and desktop communicate different delivery-state or
  read-state meaning for the same backend message.

## Observability and Operations

- Delivery latency, queue backlog, failed-route count, moderation actions.
- Keep comms diagnostics comparable across first-party client platforms.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_comms.py`

## Open Questions

- Global relay re-route strategy under partial outages.
- Whether desktop should mirror the current web comms workflow closely or use
  a different interaction shell while preserving the same backend contract.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent communications design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
- 2026-03-12 — Batch 12.5 — Cross-linked shared comms rules to the client-
  platform contract and separated runtime-specific behavior into web and
  desktop companion docs.
