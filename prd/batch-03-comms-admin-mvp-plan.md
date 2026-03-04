# Batch 03 Implementation Plan — Comms + Admin Controls MVP

Date: 2026-02-16  
Owner: Product + Full-Stack Engineering

## Objective

Close the remaining MVP-critical PRD gaps after Batch 01/02 + Flight slices:
- meaningful communication flow (local + delayed interstellar behavior),
- baseline admin user management,
- logs usability parity for live operations.

## Why This Batch Next

Batch 01/02 delivered core ship/economy/log baselines and recent iterations hardened flight state and UX.
The largest remaining MVP gaps in `prd.md` are:
- communication acceptance criteria depth (shared local behavior and delayed relay semantics),
- admin acceptance criteria beyond logs (`manage users`).

This batch targets those gaps without expanding into full multiplayer/WebSocket scale.

## In Scope

### 1) Comms State Model Hardening (Backend)
- Keep existing REST comms endpoints and extend behavior to be location-aware and less purely per-user seeded.
- Introduce deterministic channel context resolution:
  - station-local context (station scoped),
  - system-traffic context (system scoped),
  - interstellar relay context (queued semantics).
- Preserve existing read-state tracking and response shape compatibility.

### 2) Delayed Interstellar Delivery (MVP)
- Add minimal queued-delivery mechanics for interstellar messages:
  - on send, persist queued with `deliver_at`,
  - on list/fetch, release messages whose `deliver_at <= now`,
  - keep local channels instant.
- Delay model can be fixed/config-backed for MVP (no full route graph required).

### 3) Admin User Management Baseline
- Add `GET /api/admin/users`:
  - paged/limited list with id, email, username, role, status, is_alive, location summary.
- Add `PATCH /api/admin/users/{id}`:
  - allow role/status updates with guard rails (e.g., avoid self-lockout edge cases).
- Enforce strict admin-only access (`403` for non-admin).

### 4) Logs Follow Mode (MVP REST Form)
- Extend `GET /api/admin/logs` with `follow` mode semantics suitable for polling:
  - cursor or `since` timestamp support,
  - return only entries after cursor when provided.
- Keep existing filters: `level`, `tail`, `contains`, `regex`.

### 5) Frontend Console Wiring
- Comms panel:
  - surface delivery state (`instant` vs `queued`/delivered),
  - keep explicit loading/empty/error states via existing primitives.
- Admin panel (admin-only):
  - users table/list with role/status controls,
  - logs follow polling toggle using new API param.
- Use existing UI system only (`Tooltip`, `ToastProvider`, `DataState`).

### 6) Tests and Validation
- Backend pytest coverage for:
  - delayed interstellar delivery lifecycle,
  - admin users list/update auth + validation paths,
  - logs follow cursor/since behavior.
- Frontend:
  - `npm run lint` and `npm run test -- --run` remain green,
  - focused tests only for new shared logic if introduced.

## Out of Scope (Explicit)

- WebSocket chat transport and presence.
- Full relay node pathfinding/hop simulation.
- Moderation queue/workflow implementation.
- Full admin dashboard redesign and metrics/settings suite.
- Real-time push streams (SSE/WS); polling is acceptable for MVP.

## API Contract Notes

- Preserve existing error envelope discipline:
  - `error.code`, `message`, `details`, `trace_id` where applicable.
- Keep status code discipline:
  - `200` success,
  - `401` unauthorized,
  - `403` forbidden,
  - `404` not found,
  - `409` conflict,
  - `422` validation failures.
- Keep backward compatibility for current comms response fields.

## Data/Migration Expectations

- Reuse existing comms tables where possible.
- Add minimal columns only if required for delayed delivery and logs follow cursoring:
  - e.g., `deliver_at`/`delivered_at` guarantees, indexed created timestamp.
- Include Alembic migration(s) only when schema changes are required.

## Implementation Sequence

1. Confirm current comms/admin contracts and define additive schema changes.
2. Implement delayed interstellar delivery semantics in comms service/API.
3. Implement admin users list/update endpoints + authorization guards.
4. Extend admin logs endpoint with `follow` polling cursor/since behavior.
5. Wire frontend comms delivery states and admin users/log-follow controls.
6. Run targeted backend pytest + frontend lint/tests.
7. Update docs (`README.md`, `backend/README.md`, `CHANGELOG.md`).

## Acceptance Criteria

- Interstellar comms messages can be queued and later appear as delivered based on delay rules.
- Local comms remain instant and readable in current console UI.
- Admin can list users and update role/status through API and frontend controls.
- Admin logs support follow-style polling without reloading full history each refresh.
- Existing automated checks remain green.

## Execution Status Update (2026-02-16)

Status: Completed

### Implemented in This Batch

- Comms delayed interstellar delivery lifecycle implemented (`queued` -> `delivered`) with unread gating until delivery release.
- Admin user management baseline implemented:
  - `GET /api/admin/users`
  - `PATCH /api/admin/users/{id}` with self-lockout guard rails.
- Admin logs incremental follow support implemented:
  - `GET /api/admin/logs` supports `since` cursor and returns `next_since`.
- Frontend console wiring completed for:
  - admin users list/update controls,
  - logs follow polling toggle,
  - comms delivery-state labeling parity (`instant`, `queued`, `delivered`).

### Validation Snapshot

- Backend: `pytest tests/test_markets_tick_admin_logs.py tests/test_comms.py` -> 23 passed.
- Frontend: `npm run lint` and `npm run test -- --run` -> all checks passed.

### Acceptance Criteria Status

- [x] Interstellar comms messages queue and later deliver by delay rules.
- [x] Local comms remain instant and visible in console UI.
- [x] Admin can list users and update role/status through API and frontend controls.
- [x] Admin logs support follow-style incremental polling.
- [x] Automated checks are green for covered backend/frontend suites.

## Risks and Mitigations

- Risk: Comms changes break current seeded-message UX.
  - Mitigation: preserve backward-compatible response shape and add migration-safe defaults.
- Risk: Admin update endpoint could allow unsafe role transitions.
  - Mitigation: explicit validation rules and protected self-update constraints.
- Risk: Follow polling creates noisy/expensive queries.
  - Mitigation: capped tail, cursor-based incremental fetch, and index use.

## MVP Completion Snapshot (Post-Batch Target)

After this batch, MVP coverage should include:
- auth + player/ship core loop,
- economy tick + market visibility,
- story interpret/confirm flow,
- comms baseline with delayed relay semantics,
- admin logs + user management baseline.

## Next Slice Proposal — Batch 04 (Post-MVP Stabilization)

- Performance and observability pass (query optimization, log volume controls).
- Security hardening pass (rate limits on comms/admin mutations, stricter audit trails).
- UX polish pass for admin/comms flows without expanding scope to full multiplayer transport.
