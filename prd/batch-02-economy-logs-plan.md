# Batch 02 Implementation Plan — Economy Tick + Logs Baseline

Date: 2026-02-13  
Owner: Product + Full-Stack Engineering

## Objective

Complete the remaining high-priority PRD Phase 2 items after Batch 01:
- baseline economy tick processing,
- user-facing market freshness visibility,
- foundational logs API for operational debugging.

## Why This Batch Next

Batch 01 delivered player state, ship ops, and market summary APIs.  
PRD Phase 2 still calls out economy tick and logs as core systems.  
This batch closes Phase 2 without expanding into multiplayer/WebSocket scope.

## Execution Status Update (2026-02-20)

Status: Completed

## In Scope

### 1) Economy Tick Baseline (Manual + API Trigger)
- Add a deterministic economy tick service that updates `station_inventory` using:
  - production rate,
  - consumption rate,
  - quantity clamp to `[0, max_capacity]`.
- Keep rates simple and config-backed initially:
  - default rates by commodity category or station defaults.
- Add API endpoint:
  - `POST /api/markets/tick` (admin-guard or development-guarded for now).

### 2) Market Freshness + Drift Visibility
- Extend market summary response with per-station freshness fields:
  - `updated_seconds_ago`,
  - `stale` boolean.
- Add optional query param for dry-run simulation:
  - `GET /api/markets/{system_id}/summary?simulate_ticks=1`
- Keep simulation read-only when `simulate_ticks` is used.

### 3) Logs API Baseline
- Add `GET /api/admin/logs` with simple filters:
  - `level` (optional),
  - `tail` (default 100, max 1000),
  - `contains` (substring filter).
- Return structured rows suitable for future admin panel usage.
- Keep auth requirement strict (`admin` role only).

### 4) Frontend Console Wiring (MVP)
- Add small "Market Tick" operator panel:
  - run tick,
  - refresh market summary,
  - show last tick result.
- Add lightweight "Logs Viewer" panel (admin-only visibility):
  - tail count input,
  - optional contains filter,
  - refresh action.
- Continue using only existing UI primitives:
  - `Tooltip`, `ToastProvider`, `DataState`.

### 5) Tests and Validation
- Backend tests:
  - tick updates inventory with bounds,
  - summary freshness fields,
  - admin logs endpoint auth (401/403) and happy path.
- Frontend validation:
  - `npm run test`, `npm run lint` green.

## Out of Scope (Explicit)

- Scheduled worker/cron runtime for autonomous ticks.
- Full station economy rules table and advanced event modifiers.
- WebSocket live updates for market/log streams.
- Full admin dashboard UX.

## API Contract Notes

- Preserve existing error envelope shape (`error.code`, `message`, `details`, `trace_id`).
- Keep status code discipline:
  - `200` success,
  - `401` unauthorized,
  - `403` forbidden,
  - `422` validation failures.

## Data/Migration Expectations

- Add minimal schema only if needed:
  - economy rule table or per-station tick metadata.
- If new table added, include Alembic migration and seed defaults.

## Implementation Sequence

1. Economy tick service in backend services layer.
2. Tick API endpoint + tests.
3. Market summary freshness/simulation extension + tests.
4. Logs API baseline + tests.
5. Frontend tick/log panels with explicit loading/empty/error states.
6. Validation: backend pytest + frontend test/lint.
7. Docs updates (`backend/README.md`, `README.md`, changelog).

## Acceptance Criteria

- Manual tick endpoint updates station inventory deterministically.
- Market summary indicates freshness and handles optional simulation mode.
- Admin logs endpoint works with filters and access control.
- Frontend surfaces tick and logs operations with clear user feedback.
- Regression suite passes in configured test DB.

## Risks and Mitigations

- Risk: Tick logic introduces unstable price/quantity drift.
  - Mitigation: deterministic formulas + bounded updates + tests.
- Risk: Logs endpoint exposes sensitive data.
  - Mitigation: redact sensitive tokens/credentials and restrict by role.
- Risk: Admin-only paths block regular testing.
  - Mitigation: include explicit role-fixture tests for auth behavior.
