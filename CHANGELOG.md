# Changelog

All notable changes to this project are documented in this file.

## [Unreleased] - 2026-02-13

### Added
- Shared UI foundation primitives: `Tooltip`, `ToastProvider`, and `DataState`.
- Frontend unit test setup with Vitest + Testing Library.
- Primitive unit tests for `Tooltip`, `ToastProvider`, and `DataState`.
- UI foundations tracking/migration docs:
  - `prd/ui-foundations-checklist.md`
  - `prd/ui-foundations-implementation-plan.md`
  - `prd/ui-foundations-migration-notes.md`

### Changed
- Standardized market, cargo, and story panels to explicit loading/empty/error states.
- Migrated recoverable UI failures to toast retry/action patterns.
- Updated frontend docs with primitive usage, accessibility expectations, and test commands.
- Updated root README product docs links for UI foundations artifacts.

### Fixed
- Removed one-off empty-state implementation in favor of shared `DataState`.
- Stabilized primitive test isolation/cleanup for consistent test runs.
