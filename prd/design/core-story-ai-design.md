# Core System Design — Story and AI Interaction

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Define AI-assisted story interaction with explicit confirmation and safe,
  deterministic state transitions.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Story interaction loop | 5.8, 6.6, 8 | Confirmation-before-action stories in 5.14 | Safety + relevance controls |
| Story persistence and updates | 6.6 | Session continuity | Durable state |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Prompt context assembly, AI response contract, confirmation gate,
  state application.

### Out of Scope
- Autonomous AI actions without player confirmation.

## Domain Model

- `story_sessions`, `story_nodes`, `story_choices`.

## Runtime Behavior

- Input -> interpretation -> confirmation -> effect application pipeline.

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

## Failure Modes and Guardrails

- Hallucinated actions, unsafe outputs, double-apply on confirmation.

## Observability and Operations

- Confirmation acceptance rate, moderation events, AI timeout/error rates.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_story.py`

## Open Questions

- Narrative branching constraints for long-running sessions.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent story/AI design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
