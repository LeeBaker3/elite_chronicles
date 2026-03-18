# Frontend Runtime Design — Web Client

Status: Active  
Last Updated: 2026-03-12  
Owners: Product + Frontend + Backend

## Objective

- Document browser-specific runtime behavior for the existing web client.
- Keep browser rendering, input, audio, and UX behavior aligned to the shared
  backend/core contract without redefining gameplay authority.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Browser client runtime behavior | 5.0, 5.14 | Supported first-party client behavior | Browser remains current reference runtime |
| Browser auth, state restore, and feedback flows | 5.1, 5.2, 5.12, 5.13 | Clear UX and recovery behavior | Uses web storage/browser event model |
| Browser flight, scanner, chart, and audio presentation | 5.3, 5.3.2, 5.7, 5.14 | Flight and navigation clarity | Uses browser rendering/input/audio constraints |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Browser-specific rendering/runtime behavior.
- Web input model, state hydration, browser audio policies, and UI workflow
  conventions.
- Recovery and fallback behavior shaped by browser limitations.

### Out of Scope
- Shared backend authority rules.
- Desktop/Panda3D runtime implementation.
- API contract ownership beyond how the web client consumes it.

## Domain Model

- Browser runtime state includes:
  - auth token/session handling in browser-safe storage patterns,
  - page-level UI state,
  - scanner/chart/flight presentation state,
  - browser audio priming and mute behavior,
  - browser-specific rendering fallbacks.
- Shared domain meaning still comes from backend/core docs.

## Runtime Behavior

- The web client acts as the current reference implementation for many shared
  contracts, but it is not the authority source.
- Browser runtime is responsible for:
  - page and mode composition,
  - fetch lifecycle handling,
  - browser input collection,
  - browser-safe audio playback rules,
  - visual feedback and accessibility behavior.
- Browser limitations such as audio unlock, tab focus, and rendering support
  may shape runtime behavior, but they must not alter backend contract
  meanings.

## API and Data Contracts

- The web client consumes shared backend APIs and must preserve:
  - status-code handling,
  - error-envelope handling,
  - shared identity semantics,
  - snapshot/version compatibility rules,
  - additive field compatibility.
- Web-only helpers that interpret shared payloads should be treated as runtime
  adapters, not hidden contract ownership.

## Failure Modes and Guardrails

- Risk: browser autoplay and audio-context rules suppress feedback.
  - Guardrail: prime audio via explicit user interaction and degrade safely.
- Risk: page-level state grows into hidden contract behavior.
  - Guardrail: extract shared semantics when other runtimes need them.
- Risk: browser refresh or expired auth causes confusing state loss.
  - Guardrail: preserve clear unauthorized handling, reload-safe hydration, and
    visible status messaging.

## Observability and Operations

- Track browser-specific auth expiry, fetch failures, audio fallback counts,
  and chart/scanner sync diagnostics.
- Keep web telemetry comparable to future desktop telemetry for the same
  gameplay events.

## Validation and Test Evidence

- Frontend checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test -- --run`
- Targeted runtime checks:
  - scanner/flight/chart tests
  - audio settings and event-dispatch tests
- Manual checks:
  - browser login, trade, flight, scanner, chart, and audio flow

## Open Questions

- Whether the web client should be gradually refactored to isolate shared
  contract-resolution logic into a platform-neutral layer before desktop scope
  grows.

## Batch Change Log

- 2026-03-12 — Batch 12.5 — Created browser runtime design doc to separate
  web-specific behavior from shared backend/core contract rules.