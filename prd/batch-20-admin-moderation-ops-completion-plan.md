# Batch 20 Implementation Plan — Admin, Moderation, and Operations Control Plane Completion

Date: 2026-02-25  
Owner: Product + Backend + Frontend

## Objective

- Complete admin control-plane capabilities required by PRD.
- Finalize content moderation workflows for AI/story and chat safety.
- Deliver operations-facing metrics/settings interfaces for live tuning.

## Why This Batch Next

- As gameplay systems expand, governance and operational controls become mandatory.
- PRD admin requirements are partially implemented but not fully closed.
- This batch de-risks production operations and moderation burden.

## PRD Alignment (Required)

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Admin panel completion | 5.11, 7.7 | User/admin settings/metrics routes | Role-gated management workflows |
| Content moderation queue | 5.8, 13 | AI and chat abuse risk mitigation | Review, approve/remove flow |
| Live settings controls | 5.11, 9, 11 | Runtime economy/story/system tuning | Audited settings updates |

## Execution Status Update (2026-02-25)

Status: Planned

## Readiness Checklist (Pre-Implementation Gate)

- [ ] Admin permission boundaries verified end-to-end.
- [ ] Moderation queue schema and retention policy defined.
- [ ] Metrics and settings audit requirements documented.

## In Scope

### 1) Admin Feature Completion
- Complete users/logs/metrics/settings administration workflow.
- Preserve strict role checks and audit records.

### 2) Moderation Workflow
- Add review queue for AI/story/chat flagged content.
- Add approve/remove/escalate actions with reason codes.

### 3) Ops Tuning Controls
- Provide safe settings edits for economy/comms/story controls.
- Add guardrails for risky runtime changes.

### 4) Validation
- Backend auth and moderation tests.
- Frontend admin workflow tests.

## Out of Scope (Explicit)

- ML-based automatic moderation model training.
- External SIEM integration.

## Sound Effects / Audio Feedback (Required)

- `admin.action_success`
  - Trigger: privileged admin command succeeds.
  - Cooldown: 200ms.
  - Channel: `uiVolume`.
- `admin.action_blocked`
  - Trigger: unauthorized or blocked admin action attempt.
  - Cooldown: 350ms.
  - Channel: `alertVolume`.
- `moderation.warning_issued`
  - Trigger: moderator warning issued to player/session.
  - Cooldown: 300ms.
  - Channel: `alertVolume`.
- `moderation.escalation_created`
  - Trigger: incident escalation ticket created.
  - Cooldown: 300ms.
  - Channel: `uiVolume`.
- `ops.runbook_step_complete`
  - Trigger: runbook checklist step completed.
  - Cooldown: 220ms.
  - Channel: `uiVolume`.
- `ops.incident_resolved`
  - Trigger: incident closure and state normalization.
  - Cooldown: 300ms.
  - Channel: `uiVolume`.

## Supporting Functionality Required

### Backend Systems
- Admin settings API finalization.
- Moderation queue service and audit trails.

### Frontend Systems
- Admin dashboard flows for metrics/settings/moderation.

### Observability and Operations
- Metrics: moderation backlog, decision latency, settings change count.

## Data and Contract Additions

- Additive moderation fields: `status`, `decision`, `reason`, `reviewed_by`.
- Additive settings metadata: `changed_by`, `changed_at`, `change_reason`.

## Implementation Sequence

1. Finalize moderation queue model and APIs.
2. Complete admin metrics/settings endpoints.
3. Wire frontend admin workflows and guards.
4. Add tests and operational runbook notes.

## Acceptance Criteria

- [ ] Admin can manage users, view metrics/logs, and update settings safely.
- [ ] Moderation workflow supports review and resolution with auditability.
- [ ] Role-gating and audit logs are enforced.
- [ ] Admin/moderation/ops SFX cues signal success, block, escalation, and resolution states.

## Risks and Mitigations

- Risk: unsafe settings edits impact live gameplay.
  - Mitigation: guardrails, validation, and audited rollback controls.

## Test and Validation Evidence

- `backend`: `pytest backend/tests/test_admin_moderation.py`
- `frontend`: `npm run test -- <admin-workflow-tests>`

## Documentation Update Checklist

- [ ] `prd/prd.md` reviewed for alignment.
- [ ] Batch status updated with evidence.
