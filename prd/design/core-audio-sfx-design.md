# Core System Design — Audio SFX and Settings

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Frontend + Backend

## Objective

- Define stable event-driven SFX behavior and user-controlled audio settings
  across existing gameplay systems without changing gameplay authority.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Audio SFX coverage and event-key policy | 15.8 | Batch 12 cross-batch coverage | Additive event taxonomy |
| Settings controls + accessibility | 10, 12, 16 | UX readability + acceptance criteria | Persistent controls + safe defaults |
| Runtime routing and stability constraints | 15.8 | Dispatcher and manifest behavior | Deterministic cooldown/cap rules |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Event-key taxonomy, dispatcher rules, settings controls, file-based asset map.

### Out of Scope
- Voice-over, music scoring, and gameplay-authoritative audio mechanics.

## Domain Model

- Event keys (`ops.*`, `trade.*`, `comms.*`, `flight.*`, `scanner.*`,
  `chart.*`, `collision.*`, `admin.*`).
- Settings model (`masterEnabled`, `sfxEnabled`, channel volumes).
- File-based asset mapping manifest under frontend audio utilities.

## Runtime Behavior

- Frontend dispatcher is the only playback path.
- Playback policy applies per-event cooldown, category caps, and duplicate
  suppression.
- Audio failures degrade silently without blocking gameplay state transitions.

## Current State Starter (Batch 12)

- Canonical event key table is maintained in
  `prd/batch-12-audio-event-key-table.md`.
- Dispatcher coverage includes Batch 01-09 operational flows for
  ops/trade/comms/admin/flight/scanner/chart/collision domains.
- Backend local-chart audio hint keys align to canonical chart/flight/ops names.
- Asset model is file-based under `frontend/public/audio/sfx/` with unique path
  per event key.

## Code-Truth Update (2026-03-04)

- Backend status: verified active supporting hints/contracts for canonical
  chart/flight/ops event naming where backend emits audio-related metadata.
- Frontend status: verified dispatcher + manifest wiring and runtime event
  coverage for Batch 12 canonical keys.

## API and Data Contracts

- Additive client settings contract:
  `audio.masterEnabled`, `audio.sfxEnabled`, `audio.masterVolume`,
  `audio.uiVolume`, `audio.flightVolume`, `audio.alertVolume`,
  `audio.commsVolume`.
- Additive-only event-key policy after adoption.

## Failure Modes and Guardrails

- Trigger spam causing noise fatigue.
- Missing/duplicate asset mappings.
- Accessibility regressions from high alert mix.
- Guardrails: cooldown windows, category caps, per-channel controls,
  non-blocking fallback behavior.

## Observability and Operations

- Track suppressed-event reasons and missing-asset fallbacks.
- Keep manifest integrity checks in frontend test workflow.

## Validation and Test Evidence

- Frontend checks:
  - `npm run lint`
  - `npm run test`
- Manifest invariants:
  - all canonical keys resolve,
  - one unique asset path per event key,
  - mapped assets exist.

## Open Questions

- Whether to persist per-event advanced overrides beyond channel-level controls.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent core audio SFX design doc.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.