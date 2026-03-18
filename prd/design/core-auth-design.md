# Core System Design — Accounts and Authentication

Status: Active  
Last Updated: 2026-03-12  
Owners: Product + Backend + Frontend

## Objective

- Provide secure account lifecycle, session/auth handling, and role-based
  access for player and admin workflows.
- Define the shared authentication and authorization contract that must remain
  consistent across first-party runtimes.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Registration/login/session flows | 5.1, 6.1, 7.1 | Authentication stories in 5.14 | Secure token/session behavior |
| Roles and authorization | 5.1, 7.7, 7.8 | Admin access restrictions | Enforce 401/403 semantics |
| Error contracts | 7.9 | Clear auth failures | Consistent JSON error shape |

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
- Account registration/login, session lifecycle, password reset, role checks.
- Shared auth/session semantics across web and desktop clients.

### Out of Scope
- External OAuth providers (unless separately approved).
- Platform-specific session-storage implementation details beyond shared
  contract rules.

## Domain Model

- `users`, `sessions`, `password_reset_tokens`, `roles`, `audit_logs`.
- Multi-client rule:
  - auth identity, role meaning, and error semantics must remain shared across
    first-party clients even if session storage or startup UX differs.

## Runtime Behavior

- Request-driven auth validation and session/token checks.
- Role gating at API boundaries.
- Runtime split:
  - this doc defines shared auth meaning and backend expectations,
  - browser auth storage and UX handling belongs in
    `frontend-web-runtime-design.md`,
  - desktop auth storage, expiry handling, and reconnect UX belongs in
    `frontend-desktop-runtime-design.md`.

## Current State Starter (Batches 01-11)

- Baseline auth/session flows are present and support core gameplay API access
  (`Batch 01` dependency baseline).
- Admin route gating is active across logs and user-management endpoints
  (`Batch 02`, `Batch 03`).
- Error/response discipline for auth/authorization is consistently called out
  in batch contracts (`401/403/422` with structured error envelope).
- No OAuth/SSO expansion is implemented in batches 01-11; auth remains
  project-native credentials/session handling.
- Security hardening broad pass remains planned for later-phase release
  readiness (`Batch 21`).

## Code-Truth Update (2026-03-04)

- Backend status: verified implemented auth endpoints
  (`POST /api/auth/register`, `POST /api/auth/login`).
- Frontend status: verified active runtime calls to both auth endpoints.

## API and Data Contracts

- Auth endpoints and admin auth checks per PRD sections above.
- Shared client-platform contract reference:
  - `prd/design/core-client-platform-contract-design.md`
- Multi-client compatibility rules:
  - login and auth failure semantics must remain consistent,
  - role enforcement must not vary by first-party client,
  - clients may store or restore credentials differently, but they must use
    the same backend auth contract.
  - development-only desktop plaintext token storage is acceptable as a
    temporary bootstrap concession,
  - production desktop releases must use OS-backed secure credential storage.

## Failure Modes and Guardrails

- Brute-force/rate-limit abuse, token replay, stale sessions.
- Runtime drift where web and desktop interpret auth expiry or unauthorized
  responses differently enough to change user-visible access semantics.

## Observability and Operations

- Auth failure rates, login latency, reset-token usage, role-change audit logs.
- Keep auth diagnostics comparable across client platforms.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_auth_starter_ship.py`

## Open Questions

- Whether first-party desktop should rely on the same token lifecycle shape as
  the web client or whether explicit desktop refresh/relogin rules need to be
  documented separately without changing the shared backend contract.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent core auth design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
- 2026-03-12 — Batch 12.5 — Cross-linked shared auth rules to the client-
  platform contract and separated runtime-specific auth handling into web and
  desktop companion docs.
