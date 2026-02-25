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

## Next Slice Proposal — Flight 3D Phase 1 (MVP)

Date: 2026-02-16  
Owner: Product + Frontend + Backend

### Objective

Introduce a minimal 3D flight scene that is visually interactive and synchronized with existing ship state operations, without implementing full physics/combat.

### In Scope

1) 3D Flight View Container (Frontend)
- Add a dedicated 3D viewport in Flight mode only.
- Render using `three.js` via `@react-three/fiber`.
- Keep current HUD/status panels around the viewport.

2) Core Scene Elements
- Player ship marker/model (simple primitive is acceptable).
- Station waypoint marker for selected destination.
- Starfield/background and basic scene lighting.
- Camera follow framing for player ship.

3) Basic Flight Interaction
- Keyboard movement for pitch/yaw/throttle (MVP controls).
- Optional auto-level damping for stability.
- "Jump" remains API-driven (existing backend endpoint), triggered from current controls.

4) State Synchronization
- Keep existing backend source of truth for docked/in-space transitions.
- Reflect `shipTelemetry.status`, fuel, and selected destination in the 3D view overlays.
- Preserve existing error/toast behavior for failed operations.

5) Performance and Accessibility Baseline
- Provide fallback to current non-3D HUD if WebGL is unavailable.
- Target smooth interaction on mid-range hardware.
- Keep all operational actions keyboard reachable outside canvas focus traps.

### Out of Scope (Phase 1)

- Combat, weapon systems, and real DPS calculations.
- Collision physics and damage simulation.
- Multiplayer positional sync.
- Procedural planets/asteroid fields.
- Gravity wells/misjump mechanics.

### API/Contract Notes

- No required backend schema changes for Phase 1.
- Reuse existing endpoints:
  - `POST /api/ships/{id}/undock`
  - `POST /api/ships/{id}/jump`
  - `GET /api/ships/{id}`
- Maintain existing status/error code behavior.

### Implementation Sequence

1. Add flight 3D feature flag + fallback path.
2. Integrate `@react-three/fiber` scene scaffold in Flight mode.
3. Render ship + waypoint + camera follow.
4. Wire controls and HUD telemetry overlays.
5. Connect jump/destination actions to existing API flow.
6. Add failure fallback and loading/error states.
7. Run lint/tests and perform manual smoke checks.

### Acceptance Criteria

- Flight mode displays a working 3D scene on supported browsers.
- User can control heading/throttle in-scene (MVP controls).
- Destination waypoint appears and updates with selected station.
- Existing jump operation still works and updates UI state correctly.
- Fallback non-3D presentation works when WebGL is unavailable.
- Frontend lint passes.

### Risks and Mitigations

- Risk: 3D integration degrades performance.
  - Mitigation: start with low-poly primitives, limited post effects, capped render complexity.
- Risk: Input conflicts with existing keyboard shortcuts.
  - Mitigation: scope key handlers to active Flight canvas focus state.
- Risk: Scope creep toward full simulation.
  - Mitigation: enforce out-of-scope list and defer physics/combat.

## Execution Status Update (2026-02-16)

### Completed in Current Iteration

- Flight 3D scaffold is integrated and feature-flagged.
- WebGL fallback path is implemented for unsupported clients.
- Waypoint lock/unlock and jump charge/jump phase UX are wired.
- Jump cooldown is backend-authoritative and exposed to frontend telemetry.
- Cooldown synchronization now supports both:
  - `jump_cooldown_seconds`
  - `jump_cooldown_until`
- Flight layout was rebalanced:
  - top context area made taller,
  - telemetry moved into Systems panel,
  - comms card made full-width in context area,
  - system/location moved under scanner in two-column format.

### Validation Snapshot

- Backend targeted suite passing:
  - `tests/test_players_ships_markets.py`
- Frontend checks passing:
  - `npm run lint`
  - `npm run test -- --run`

## Next Slice Proposal — Flight Phase 2 (State Authority + UX Hardening)

Date: 2026-02-16  
Owner: Product + Frontend + Backend

### Objective

Stabilize flight interactions by making transient flight state more server-authoritative, while tightening UX feedback and keeping scope MVP.

### In Scope

1) Server Flight State Persistence (Minimal)
- Persist active transient flight state fields for current ship/session:
  - `flight_phase` (`idle`, `destination-locked`, `charging`, `jumping`, `arrived`, `error`)
  - locked destination station id (nullable)
  - optional phase start timestamp.
- Ensure reconnect/refresh restores consistent state.

2) Backend Contract Extension
- Extend ship telemetry response with optional flight state fields.
- Keep backward compatibility for existing frontend fields.
- Preserve current status code/error-envelope discipline.

3) Frontend Hydration + Recovery
- Hydrate flight mode from backend flight state when telemetry loads.
- If local transient state conflicts with backend, backend state wins.
- Keep current toasts and explicit error/success states.

4) Jump UX Hardening
- Improve disabled-state reasons for jump action (tooltip/status text parity).
- Keep cooldown messaging clear and consistent with absolute timestamp support.

### Out of Scope (Phase 2)

- Combat systems and damage simulation.
- Real-time multiplayer positional sync.
- Advanced physics/collision systems.
- Procedural world generation.

### Implementation Sequence

1. Define minimal backend schema/fields for transient flight state.
2. Extend ships API schema/response and update tests.
3. Update frontend telemetry hydration and conflict resolution.
4. Harden jump control status/tooltip messaging.
5. Run backend targeted pytest + frontend lint/tests.

### Acceptance Criteria

- Refresh/relogin does not lose active flight destination/phase context.
- Frontend flight state remains consistent with backend telemetry after ops.
- Jump button disabled-state reason remains accurate during cooldown/invalid state.
- Existing automated checks remain green.

