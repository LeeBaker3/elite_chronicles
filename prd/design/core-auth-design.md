# Core System Design — Accounts and Authentication

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Provide secure account lifecycle, session/auth handling, and role-based
  access for player and admin workflows.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Registration/login/session flows | 5.1, 6.1, 7.1 | Authentication stories in 5.14 | Secure token/session behavior |
| Roles and authorization | 5.1, 7.7, 7.8 | Admin access restrictions | Enforce 401/403 semantics |
| Error contracts | 7.9 | Clear auth failures | Consistent JSON error shape |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Account registration/login, session lifecycle, password reset, role checks.

### Out of Scope
- External OAuth providers (unless separately approved).

## Domain Model

- `users`, `sessions`, `password_reset_tokens`, `roles`, `audit_logs`.

## Runtime Behavior

- Request-driven auth validation and session/token checks.
- Role gating at API boundaries.

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

## Failure Modes and Guardrails

- Brute-force/rate-limit abuse, token replay, stale sessions.

## Observability and Operations

- Auth failure rates, login latency, reset-token usage, role-change audit logs.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_auth_starter_ship.py`

## Open Questions

- None currently.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent core auth design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
