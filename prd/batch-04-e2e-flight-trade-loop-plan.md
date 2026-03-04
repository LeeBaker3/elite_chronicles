# Batch 04 Implementation Plan — End-to-End Flight + Trade Loop MVP

Date: 2026-02-16  
Owner: Product + Full-Stack Engineering

## Objective

Deliver a complete playable loop in one continuous session:
- start docked at Station A,
- execute a buy/sell trade,
- undock,
- fly in-space with current flight controls,
- select destination from system map,
- jump to destination system,
- approach/dock at Station B,
- complete another trade.

## Why This Batch Next

Batch 01–03 provide most underlying APIs (trade, dock/undock, jump, telemetry, comms/admin).
Current gap is true end-to-end continuity and travel flow realism:
- map-first destination selection,
- jump to system space (not immediate station docking),
- explicit station approach and docking in destination system.

## In Scope

### 1) End-to-End Scenario Contract
- Define one canonical MVP path for QA/demo:
  1. authenticate,
  2. docked trade at origin station,
  3. undock + fly,
  4. select destination system on map,
  5. jump,
  6. approach destination station,
  7. dock + trade.
- Add explicit status messaging in UI for each step.

### 2) System Map Destination Selection
- Add map panel for star-system selection (minimal 2D tactical map acceptable).
- Distinguish system destination from station destination.
- Preserve current station select flow for docking/trade actions.

### 3) Jump Arrival Flow Correction
- Update jump semantics to arrive in destination system space, not auto-docked.
- Persist arrival context for scanner/flight HUD:
  - system id,
  - arrival position,
  - nearest station hints.
- Keep fuel/cooldown constraints already implemented.

### 4) Destination Station Approach + Dock
- Require explicit destination station selection after system arrival.
- Keep docking endpoint as the final authoritative transition to docked state.
- Preserve existing state guards and conflict handling.

### 5) Trade Parity Across Two Stations
- Ensure trading works at both origin and destination stations in one session.
- Preserve credit/cargo updates and inventory drift behavior.

### 6) Validation and Demo Script
- Add backend tests for non-auto-docking jump arrival and post-jump docking/trade flow.
- Add frontend integration-level behavior checks for map selection and mode transitions.
- Add a short scripted MVP walkthrough in docs.

## Out of Scope (Explicit)

- Full orbital mechanics or gravity-well simulation.
- Dynamic route planning with multi-hop optimization.
- Combat/interdiction during jump.
- Multiplayer positional synchronization.

## API Contract Notes

- Preserve existing `POST /api/ships/{ship_id}/jump` while extending response fields additively.
- Keep error/status discipline already used across APIs (`401`, `403`, `404`, `409`, `422`).
- Do not break existing frontend fields; add optional telemetry fields for map/system arrival context.

## Implementation Sequence

1. Define and add minimal system-map state in backend/frontend contracts.
2. Update jump behavior to destination-system in-space arrival.
3. Wire frontend map select -> jump request path.
4. Enforce explicit post-jump station approach + docking path.
5. Validate two-station trade loop in one session.
6. Add tests and docs walkthrough.

## Acceptance Criteria

- Player can run the full docked trade -> flight -> jump -> docked trade loop without resetting session.
- Jump no longer auto-docks at destination station.
- Destination system selection is map-driven in UI.
- Destination station docking remains explicit and successful.
- End-to-end tests and manual walkthrough pass.

## Execution Status Update (2026-02-16)

Status: In Progress (Core Contract + UI Routing Complete)

### Implemented in Current Iteration

- Jump contract now supports system-level targeting (`destination_system_id`) with backward-compatible station targeting (`destination_station_id`).
- Jump arrival behavior now lands ships in destination system deep space (no auto-docking).
- Commander location after jump is persisted as deep-space with destination system context.
- Flight mode now includes a system-map destination selector plus approach-station selector.
- Jump status messaging now reflects system arrival and explicit follow-up docking/trade step.
- Existing dock/trade flows remain available for post-jump completion of the loop.

### Validation Snapshot

- Backend: `pytest tests/test_players_ships_markets.py` -> 18 passed.
- Frontend: `npm run lint` and `npm run test -- --run` -> all checks passed.

### Live End-to-End Smoke Walkthrough (2026-02-18)

- Script used: `backend/scripts/smoke_batch04_flow.py`
- Runtime target: local `uvicorn` session on `http://127.0.0.1:8000`
- Scenario stations:
  - Origin: `Vega Tradeport (#1)`
  - Destination: `Vega Tradeport Annex (#2)`
- Scenario ship id: `8`

Observed request sequence and outcomes:

1. `POST /api/auth/register` -> `200`
2. `GET /api/stations` -> `200`
3. `POST /api/ships/8/dock` (origin alignment probe) -> `409` (`Ship already docked at this station`) [expected and valid]
4. `GET /api/stations/1/inventory` -> `200`
5. `POST /api/stations/1/trade` (buy x1) -> `200`
6. `POST /api/ships/8/undock` -> `200` (`in-space`)
7. `POST /api/ships/8/jump` -> `200` (`in-space` arrival; no auto-dock)
8. `POST /api/ships/8/dock` (destination) -> `200` (`docked`)
9. `POST /api/stations/2/trade` (sell x1) -> `200`
10. `GET /api/ships/8/operations?limit=6` -> `200`

Result: full Batch 04 loop executed successfully in one continuous authenticated session.

### Remaining for Full Batch Closure

- Manual walkthrough script is now available for QA/demo handoff (`backend/scripts/smoke_batch04_flow.py`).
- Add any additional E2E checks if we introduce stricter station-approach constraints in later slices.

## PRD Alignment

- Core game loop steps 2–4 are now continuous in one flow.
- Satisfies `5.3 Ship State and Flight Metrics` and `5.6 Economy and Trading` integration expectation.
- Advances user-story acceptance for persistent ship/location and trade progression.
