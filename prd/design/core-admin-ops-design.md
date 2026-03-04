# Core System Design — Admin, Moderation, and Operations

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Define operational controls for user/admin management, logging, moderation,
  system health, and safe LiveOps tuning workflows.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Admin capabilities | 5.11, 7.7 | Admin stories in 5.14 | Role-gated controls |
| Logging and reliability | 5.12, 11 | Observability and error handling | Redaction and structured logs |
| Risk controls | 13 | Exploit and abuse mitigation | Operational guardrails |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Admin role operations, logs/metrics, moderation, settings/tuning controls.

### Out of Scope
- Full BI warehouse/reporting platform.

## Domain Model

- Admin settings, audit logs, moderation actions, service health metrics.

## Runtime Behavior

- Privileged control flows with role enforcement and auditable changes.

## Current State Starter (Batches 01-11)

- Admin logs API baseline is implemented with filtering semantics and strict
  admin authorization (`Batch 02`).
- Logs incremental follow semantics (`since`/cursor style polling) are
  available for lightweight live operations workflows (`Batch 03`).
- Admin user-management baseline is implemented (`GET/PATCH admin users`)
  with role/status guard rails including self-lockout protections (`Batch 03`).
- Structured operational observability expanded through later flight batches
  (collision, docking, chart, jump flow instrumentation) (`Batches 08-11`).
- Full moderation control-plane completion is planned in later-phase scope
  (`Batch 20`).

## Code-Truth Update (2026-03-04)

- Backend status: verified active admin APIs for users list/update,
  logs retrieval, and starter-location with admin authorization.
- Frontend status: verified active runtime admin users/logs calls, including
  user role/status patch operations.

## API and Data Contracts

- Admin endpoints and standardized error/authorization responses.

## Failure Modes and Guardrails

- Unauthorized admin actions, unsafe live tuning, missing audit traces.

## Observability and Operations

- Admin action audit completeness, log pipeline health, alerting coverage.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_markets_tick_admin_logs.py`

## Open Questions

- Final two-person approval UX for high-impact settings.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent admin/ops design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
