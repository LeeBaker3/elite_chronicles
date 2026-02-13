# Batch 01 Implementation Plan — Core Systems Completion

Date: 2026-02-13  
Owner: Product + Full-Stack Engineering

## Objective

Deliver the next high-value slice from PRD Phase 2 (Core Systems):
- ship state operations,
- baseline economy tick visibility,
- player state visibility,
while keeping scope small enough for one implementation batch.

## Why This Batch Next

Current prototype already supports auth, station trade, cargo, and story session start/list.
The biggest gap to Phase 2 readiness is operational ship state + system-level market visibility.
This batch closes that gap without jumping to full multiplayer complexity.

## In Scope

### 1) Player State Endpoint
- Add `GET /api/players/me`.
- Return current player state needed by frontend console:
  - `id`, `email`, `username`, `credits`, `role`,
  - `is_alive`, `location_type`, `location_id`.

### 2) Ship Operations Endpoints (MVP)
- Add `POST /api/ships/{id}/dock`.
- Add `POST /api/ships/{id}/undock`.
- Add `POST /api/ships/{id}/refuel`.

Expected MVP behavior:
- Dock validates station exists and ship ownership.
- Undock requires currently docked state.
- Refuel requires docked state and clamps fuel to `fuel_cap`.
- Responses return updated ship snapshot (`ShipResponse` parity fields).

### 3) Market Summary Endpoint
- Add `GET /api/markets/{system_id}/summary`.
- Return station-level aggregate summary for UI decisions (not full analytics):
  - station id/name,
  - commodity count,
  - top scarcity signals (simple heuristic),
  - last inventory update timestamp.

### 4) Frontend Console Wiring
- Add "Commander State" panel (uses `GET /api/players/me`).
- Add "Ship Ops" controls:
  - Dock (station select),
  - Undock,
  - Refuel.
- Add "System Market Summary" panel bound to selected station/system.
- Use existing `Tooltip`, `ToastProvider`, and `DataState` only.

### 5) Tests and Validation
- Backend pytest coverage for:
  - players/me auth success + unauthorized,
  - dock/undock/refuel success + key conflict/validation paths,
  - market summary response shape.
- Frontend:
  - keep lint green,
  - add focused tests only for any new shared UI logic.

## Out of Scope (Explicit)

- Real-time WebSocket multiplayer chat.
- Full economy simulation scheduler/worker.
- Missions/reputation feature implementation.
- Admin panel and logs UI.
- Jump/combat mechanics.

## API Contract Notes

- Maintain existing error envelope parity (`error.code`, `message`, `details`, `trace_id`) where applicable.
- Keep status code discipline:
  - `200` success,
  - `401` unauthorized,
  - `404` not found,
  - `409` invalid state conflicts,
  - `422` validation failures.

## Data/Migration Expectations

- Reuse existing `ships` fields (`status`, `docked_station_id`, fuel fields).
- Add minimal schema only if required for market summary performance.
- If adding materialized/aggregate helper table, include Alembic migration and seed-safe defaults.

## Implementation Sequence

1. Backend schema/service prep (only if needed).
2. `GET /api/players/me` endpoint + tests.
3. Ship ops endpoints + tests.
4. Market summary endpoint + tests.
5. Frontend panel wiring and fetch/error states.
6. End-to-end smoke path (auth → players/me → dock/refuel/undock → market summary).
7. Docs update (`README.md`, `backend/README.md`, changelog entry).

## Acceptance Criteria

- Authenticated user can fetch own player state from UI.
- User can dock/undock/refuel with clear success/failure feedback.
- System summary panel loads and handles loading/empty/error states consistently.
- New backend tests pass for all endpoints in scope.
- Frontend lint passes; no one-off UI primitives introduced.

## Risks and Mitigations

- Risk: Ship state transitions become inconsistent.
  - Mitigation: state-guarded transitions + conflict tests.
- Risk: Summary endpoint becomes too heavy.
  - Mitigation: simple aggregate response first; optimize only if needed.
- Risk: Scope creep into missions/chat/jump mechanics.
  - Mitigation: strict out-of-scope list above.
