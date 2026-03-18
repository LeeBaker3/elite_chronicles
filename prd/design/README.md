# Core System Design Docs

This folder contains **living design documents** for core systems.
These documents are cross-batch references and must be updated as each
batch implements or changes system behavior.

## Purpose

- Provide stable architecture references across batches.
- Keep implementation details aligned to `prd/prd.md`.
- Track evolving decisions, constraints, and operational guardrails.

## Maintenance Rules

1. **Cross-reference PRD sections explicitly** in each design doc.
2. **Update the system doc in the same PR** as code or batch plan changes.
3. Keep changes additive and backward-compatible unless a breaking change
   is explicitly approved and documented.
4. Add a dated entry to each doc's **Change Log** section when behavior or
   contracts are updated.
5. If scope extends beyond current PRD, add a **PRD Update Needed** section
   with exact proposed text changes.

## Required Sections (all system docs)

Use `template-core-system-design.md` as the base and keep these sections:

- Objective
- PRD Alignment
- System Scope (In/Out)
- Domain Model
- Runtime Behavior / Tick or Event Flow
- API and Data Contracts
- Failure Modes and Guardrails
- Observability and Operations
- Validation and Test Evidence
- Batch Change Log

## Update Workflow

1. Update relevant batch plan in `prd/`.
2. Update affected system design docs in this folder.
3. Ensure links between batch plan and system docs are current.
4. Record validation evidence and open follow-ups.

## Naming Convention

- `core-<system>-design.md` for long-lived system docs.
- `integration-<domain>-design.md` for cross-system coupling docs.
- `frontend-<platform>-runtime-design.md` for platform-specific runtime docs
   that depend on shared core-system authority.

## Index

See `core-system-design-index.md` for canonical mapping between systems,
PRD sections, and owning batches.
