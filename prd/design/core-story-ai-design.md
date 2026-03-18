# Core System Design — Story and AI Interaction

Status: Active  
Last Updated: 2026-03-12  
Owners: Product + Backend + Frontend

## Objective

- Define AI-assisted story interaction with explicit confirmation and safe,
  deterministic state transitions.
- Define the shared story and AI interaction contract that must remain
  consistent across first-party runtimes even if the presentation layer
  differs.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Story interaction loop | 5.8, 6.6, 8 | Confirmation-before-action stories in 5.14 | Safety + relevance controls |
| Story persistence and updates | 6.6 | Session continuity | Durable state |

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
- Prompt context assembly, AI response contract, confirmation gate,
  state application.
- Shared interpretation, confirmation, and state-application semantics across
  web and desktop clients.

### Out of Scope
- Autonomous AI actions without player confirmation.
- Platform-specific narrative presentation or input-shell details beyond
  shared contract meaning.

## Domain Model

- `story_sessions`, `story_nodes`, `story_choices`.
- Multi-client rule:
  - interpretation, confirmation, and story-state progression semantics must
    remain shared across first-party clients.

## Runtime Behavior

- Input -> interpretation -> confirmation -> effect application pipeline.
- Runtime split:
  - this doc defines shared story interaction meaning and safety contract,
  - browser story presentation belongs in
    `frontend-web-runtime-design.md`,
  - desktop story presentation and input shell belongs in
    `frontend-desktop-runtime-design.md`.

## Current State Starter (Batches 01-11)

- Story/session baseline exists in prototype scope and is referenced as
  available before Batch 04 planning.
- No major story-system expansion batch is completed in 01-11; planned
  narrative deepening remains in later scope (`Batch 18`).
- Admin/moderation foundations relevant to story safety exist via logs/admin
  controls and role gating (`Batches 02-03`).
- Galactic/local navigation improvements now provide stronger location context
  surfaces that future story hooks can consume (`Batches 09-11`).

## Code-Truth Update (2026-03-04)

- Backend status: verified active story flow endpoints for sessions, start,
  interpret, confirm, and proceed under `/api/story/*`.
- Frontend status: verified active runtime interpretation/confirmation
  round-trip calls.

## API and Data Contracts

- Story endpoint contracts with explicit interpretation + confirmation fields.
- Shared client-platform contract reference:
  - `prd/design/core-client-platform-contract-design.md`
- Multi-client compatibility rules:
  - first-party clients must interpret story response, confirmation, and
    progression fields the same way,
  - clients may differ in narrative presentation, but not in the meaning of
    interpretation or confirmation state.

## Failure Modes and Guardrails

- Hallucinated actions, unsafe outputs, double-apply on confirmation.
- Runtime drift where web and desktop imply different confirmation meaning or
  state-application timing for the same story payload.

## Observability and Operations

- Confirmation acceptance rate, moderation events, AI timeout/error rates.
- Keep story interaction diagnostics comparable across first-party client
  platforms.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_story.py`

## Open Questions

- Narrative branching constraints for long-running sessions.
- Whether the first desktop slice should include full story-mode parity or
  defer richer narrative presentation while preserving the same story backend
  contract.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent story/AI design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
- 2026-03-12 — Batch 12.5 — Cross-linked shared story/AI rules to the
  client-platform contract and separated runtime-specific behavior into web
  and desktop companion docs.
