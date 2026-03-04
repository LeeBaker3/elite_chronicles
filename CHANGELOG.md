# Changelog

All notable changes to this project are documented in this file.

## [Unreleased] - 2026-02-13

### Added
- Manifest-backed frontend media SFX system with canonical event-key mapping,
  file-based audio resolver, and integrity tests:
  - `frontend/src/components/audio/audioManifest.ts`
  - `frontend/src/components/audio/audioManifest.test.ts`
  - `frontend/public/audio/sfx/*`
- Cross-batch core design governance and living design artifacts under
  `prd/design/`, including a canonical system index, reusable template,
  per-system design docs, and a code-truth implementation audit snapshot.
- Batch 12 governance alignment updates: canonical `prd/design` audio design
  doc, Batch 12 plan/core-design alignment sections, and PRD design-reference
  link update for audio SFX architecture.
- Shared UI foundation primitives: `Tooltip`, `ToastProvider`, and `DataState`.
- Frontend unit test setup with Vitest + Testing Library.
- Primitive unit tests for `Tooltip`, `ToastProvider`, and `DataState`.
- UI foundations tracking/migration docs:
  - `prd/ui-foundations-checklist.md`
  - `prd/ui-foundations-implementation-plan.md`
  - `prd/ui-foundations-migration-notes.md`
- Batch 03 MVP-completion planning doc:
  - `prd/batch-03-comms-admin-mvp-plan.md`
- Economy tick service baseline and admin logs API baseline.
- Admin user-management API baseline with `GET /api/admin/users` and `PATCH /api/admin/users/{id}` plus self-lockout guards.
- Backend regression tests for market tick behavior, simulation non-mutation, and admin logs access/filtering.
- Ship jump endpoint (`POST /api/ships/{ship_id}/jump`) with fuel use and destination docking.
- Story interpret/confirm/proceed controls in the frontend console.
- MVP objective checklist panel to verify end-to-end playable loop completion.
- Local admin bootstrap helper script and backend README instructions for promoting a registered account to admin without seeding default admin credentials.
- Elevated-user sanity-check helper script to list admin/moderator accounts (`backend/scripts/list_admins.py`).
- Comms delivery timestamp migration for delayed interstellar message lifecycle (`0007_comms_delivery_timestamps`).
- MVP end-to-end planning/review docs for flight-trade loop, flight scene realism + traffic, and celestial scanner scope:
  - `prd/mvp-e2e-prd-review-2026-02-16.md`
  - `prd/batch-04-e2e-flight-trade-loop-plan.md`
  - `prd/batch-05-flight-scene-traffic-visuals-plan.md`
  - `prd/batch-06-system-celestials-scanner-plan.md`
- Online real-star naming ingestion for galaxy bootstrap via HYG catalog source with deterministic fallback support (`backend/scripts/bootstrap_known_star_systems.py`).
- Backend tests for bootstrap real-name extraction/selection behavior (`backend/tests/test_bootstrap_known_star_systems.py`).

### Changed
- Migrated frontend flight/scanner/chart/admin/comms/trade media playback from
  generated tone data URIs to manifest-resolved WAV assets in
  `frontend/public/audio/sfx`.
- Expanded frontend audio event dispatch coverage in
  `frontend/src/app/page.tsx` for scanner class cues, chart interactions,
  docking/undocking phases, collision lifecycle, comms delivery states,
  admin actions, and trade loop completion.
- Aligned backend local-chart audio hint contract to canonical event names in
  `backend/app/api/systems.py` and synchronized tests in
  `backend/tests/test_systems_local_chart.py` and
  `frontend/src/app/page.scanner-flight.test.tsx`.
- Standardized market, cargo, and story panels to explicit loading/empty/error states.
- Migrated recoverable UI failures to toast retry/action patterns.
- Updated frontend docs with primitive usage, accessibility expectations, and test commands.
- Updated root README product docs links for UI foundations artifacts.
- Extended market summary payload with freshness metadata and optional simulation support.
- Added frontend console panels for market tick operations and admin log viewing.
- Secured station trade endpoint with auth + ship ownership checks and credit accounting.
- Updated ship dock/undock operations to synchronize player location state.
- Added backend migration troubleshooting notes for Comms (`0002_comms_messages`) including recovery via Alembic stamp when table state and revision history diverge.
- Added admin logs regex filtering support in API and frontend console controls, including invalid-pattern validation.
- Extended admin logs API with `since` cursor support for follow-style polling.
- Expanded backend admin logs test coverage to include explicit unauthenticated `401` and new Batch 03 admin/log cursor paths.
- Added frontend admin users management panel and admin logs follow-mode toggle wired to `since`/`next_since` cursor polling.
- Implemented delayed interstellar comms semantics: outbound relay messages queue and auto-transition to `delivered` when due; queued inbound relay messages are excluded from unread counts until released.
- Expanded comms backend tests to cover queued-to-delivered transition and unread gating for delayed inbound messages.
- Updated frontend comms delivery rendering to support and label `queued`/`delivered`/`instant` states clearly.
- Updated bootstrap runbook in backend docs with online real-name flags, dataset source override options, timeout/max-name controls, and fallback behavior notes (`backend/README.md`).

### Fixed
- Removed one-off empty-state implementation in favor of shared `DataState`.
- Stabilized primitive test isolation/cleanup for consistent test runs.

## [0.5.0] - 2026-02-16

### Changed
- Updated frontend Story/Ship/Flight displays to prefer station names over raw station IDs where available.
- Updated backend ship operation log `details` for dock/undock/jump to emit station names at source with `Station #<id>` fallback.
- Documented ship operation `details` API contract in backend and root README files.
- Updated ship jump semantics to arrive in destination system deep-space (no auto-dock) while preserving backward-compatible station-target jump input.
- Extended ship jump request contract to support `destination_system_id` alongside `destination_station_id`.
- Added flight-mode system destination routing in frontend with a system-map selector and explicit approach-station targeting for post-jump docking/trade continuation.
- Added backend Batch 04 smoke-flow runbook in `backend/README.md` and updated `scripts/smoke_batch04_flow.py` to run without requiring manual `PYTHONPATH` setup.
- Upgraded FlightScene visuals with a detailed MVP ship silhouette, station model, deterministic ambient station traffic, and denser layered starfield presentation.
- Added flight-mode `Render Profile` control (`Performance` / `Balanced` / `Cinematic`) to tune traffic density, star density, and render DPR for local performance vs fidelity.
- Added local scanner contacts API (`GET /api/ships/{ship_id}/local-contacts`) returning current-system `ship`/`station`/`planet`/`star` contacts with scanner bearings and distance metadata.
- Upgraded frontend scanner from placeholder ring/blip to selectable multi-contact rendering with type-specific markers and contact list metadata.
- Extended scanner contacts payload with station orbit context (`orbiting_planet_name`) and scene anchor coordinates (`scene_x`, `scene_y`, `scene_z`) for contact-to-scene synchronization.
- Updated flight scene to render scanner-synchronized celestial/station anchors and selected-contact focus targeting, including explicit station orbit context in UI text.
