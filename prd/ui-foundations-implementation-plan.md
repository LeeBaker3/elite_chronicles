# UI Foundations Implementation Plan

Status owner: Product + Frontend Engineering

This plan tracks execution of UI foundation work in phased increments.

## Phase Board

### Phase 1 — Tooltip Primitive
- [x] Define shared tooltip API contract
- [x] Implement tooltip primitive and provider
- [x] Validate accessibility behavior (`aria-describedby`, keyboard, blur/escape)
- [x] Migrate top 3 high-confusion controls
- [x] Close issue: [#1](https://github.com/LeeBaker3/elite_chronicles/issues/1)

### Phase 2 — Toast System
- [x] Implement global toast provider at app root
- [x] Add variants (`success`, `info`, `warning`, `error`)
- [x] Define stack limit, timeout, dedupe, and action/retry behavior
- [x] Replace current status flash patterns in first wave screens
- [x] Close issue: [#2](https://github.com/LeeBaker3/elite_chronicles/issues/2)

### Phase 3 — Loading/Empty/Error Patterns
- [x] Implement shared empty-state pattern and usage rules
- [x] Standardize loading/empty/error handling in market, story, cargo views
- [x] Verify copy style is concise and actionable
- [x] Close issue: [#3](https://github.com/LeeBaker3/elite_chronicles/issues/3)

### Phase 4 — Audit + Cleanup
- [x] Audit all frontend screens for one-off UI primitives
- [x] Replace or document exceptions with owners/TODOs
- [x] Publish final usage examples and migration notes
- [x] Close issue: [#4](https://github.com/LeeBaker3/elite_chronicles/issues/4)

## Execution Notes
- Keep scope focused on primitives and migration, not feature expansion.
- New feature PRs should default to shared primitives once Phase 1/2 are available.
- Use this plan alongside `prd/ui-foundations-checklist.md` acceptance criteria.
- Migration details and documented exceptions live in `prd/ui-foundations-migration-notes.md`.
