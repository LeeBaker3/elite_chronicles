# Batch 11 Implementation Plan — Galactic Chart + Hyperspace Navigation + Star Data

Date: 2026-02-18  
Owner: Product + Backend + Frontend

## Objective

Deliver a galactic chart navigation system tied to hyperspace travel:
- galaxy-scale map and system targeting,
- direct hyperspace jump workflow to other star systems,
- route feasibility based on the current ship/engine hyperspace capability,
- dual chart views (whole-galaxy and local reachable-range view),
- system detail inspection from local reachable-range view,
- star-system data generation procedures for systems, planets, and stations,
- star-system overview payloads that include associated planets and stations,
- star-map dataset strategy that can reflect real known formations where feasible.

## Why This Batch Next

Local navigation (Batch 09) solves in-system orientation, but long-range progression requires:
- an explorable galactic map,
- chart-driven hyperspace planning,
- consistent star/system data representation at scale.

This batch assumes Batch 10 foundations are in place:
- deterministic in-system celestial identity and rendering parity,
- stable local target and travel workflows,
- baseline jump audiovisual timing hooks usable by hyperspace flow.

Readiness gate: do not start Batch 11 implementation workstreams until the
Batch 10 readiness checklist is completed or an explicit blocker waiver is
recorded with owner and date.

Gate status update (2026-02-25): Batch 10 has been closed as completed; this
prerequisite is satisfied.

## PRD Alignment (Required)

Every batch plan must align to `prd/prd.md`.

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Galactic chart targeting + cross-system jump workflow | 5.3, 5.3.1 | Jump constraint and initiation rules | Applies chart-selected destination to ship jump flow with shared validation reasons |
| Reachability + route assistance in chart UI | 5.3.1, 5.14 (Player and Ship State) | Fuel/range readiness and clear blocked-state UX | Exposes direct feasibility and multi-hop fallback when direct jump is blocked |
| Local reachable-system detail inspection | 5.14 (Player and Ship State) | Player navigation clarity and destination context | Surfaces economy/government/tech/population and jump readiness fields |
| Deterministic star-system generation + overview payloads | 5.13, 5.14 | State persistence/recovery and deterministic content behavior | Provides repeatable generation/backfill path and additive overview contracts |
| Batch handoff alignment | 15.6, 15.7 | Sequencing from in-system travel to galactic chart scope | Batch 10 completion gate satisfied before Batch 11 implementation workstreams |

### Alignment Rules

- Scope remains additive to existing PRD requirements and execution-batch references.
- No breaking PRD deltas were introduced in this batch close.
- PRD update needed: none for MVP close; advanced route-cost heuristics remain deferred follow-up scope.

## Execution Status Update (2026-03-02)

Status: Completed (MVP + hardening scope closed)

Implemented in current slice:
- Dedicated frontend `Galaxy` mode is now separated from local `System` mode
  (System remains local planets/moons/stations lock+jump workflow).
- Backend galaxy endpoints are implemented:
  - `GET /api/systems/galaxy/systems`
  - `GET /api/systems/galaxy/systems/{system_id}/overview`
- Dataset-source metadata and mode support are exposed on galaxy endpoints
  (`dataset_mode=canonical|real_inspired`) with source governance metadata.
- Multi-hop route suggestion for range-limited targets is returned in
  galaxy overview jump metadata.
- Frontend galaxy map now supports explicit pan/zoom controls and reset view
  for in-map navigation.
- Frontend overview panel now surfaces jump readiness, route suggestion,
  and dataset source details.
- Backend galaxy endpoint tests were added for metadata, dataset mode
  validation, and route suggestion behavior.
- Deterministic generation procedures and operations scripts are available:
  - `scripts/bootstrap_known_star_systems.py` (initial generation + idempotent upsert)
  - `scripts/generate_galaxy_system_details.py` (deterministic regeneration/details)
  - `scripts/backfill_station_orbits.py` (station host-orbit backfill)
- Live API sweep and targeted tests/lint have passed in local validation.

Deferred (explicitly out of this batch close):
- Production-grade real catalog ingestion pipeline (current implementation is
  a governed mode contract and metadata baseline).
- Advanced route-cost heuristics beyond shortest-hop deterministic routing.

## Readiness Checklist (Pre-Implementation Gate)

- [x] Dependencies from prior batches are available and verified (Batch 10 closed).
- [x] API/data contracts needed for this batch are defined.
- [x] Validation strategy and environment prerequisites are documented.
- [x] Risks and rollback approach are identified.

## In Scope

### 1) Galactic Chart Core
- Add galaxy chart panel with systems rendered at galactic coordinates.
- Support panning/zooming and selected-system focus.
- Provide two explicit modes:
  - **Whole Galaxy View**: full map exploration and destination scouting.
  - **Local Reachable View**: filtered subset of nearby systems reachable under
    current hyperspace constraints.
- Highlight current system, selected destination, and reachable systems.

### 2) Hyperspace Integration
- Selecting destination in chart can set jump target workflow.
- Enforce jump constraints in planning and execution:
  - fuel requirements,
  - range limits derived from active ship/engine stats,
  - cooldown/phase restrictions.
- Surface clear pre-jump validation reasons in UI.
- Allow confirmed jump initiation to another star system directly from chart
  selection flow when constraints pass.

### 3) Route and Reachability Assistance
- Show direct jump feasibility from current system.
- Provide optional multi-hop route suggestion (MVP shortest-hop or shortest-cost strategy).
- Indicate blocked/unreachable systems with explicit rationale.

### 4) Local Reachable-System Detail Inspection
- In **Local Reachable View**, selecting a system opens a detail panel/card.
- Detail surface should include at minimum:
  - system name,
  - economy,
  - government,
  - tech level,
  - population (or availability status if data is deferred).
- Detail panel must also show:
  - estimated jump fuel,
  - reachability status,
  - primary block reason if not reachable.
- Detail panel overview must include associated bodies/infrastructure:
  - planet count and moon count,
  - station count,
  - station names/archetype labels (or summarized list when dense),
  - primary notable planet entries (name/type) from generated data.

### 5) Star-System Data Generation Procedures
- Define deterministic generation procedure for galactic systems at this stage,
  including:
  - system seed/version policy,
  - associated planet/moon generation rules,
  - associated station generation/assignment rules.
- Provide operational procedures for data lifecycle:
  - initial generation,
  - idempotent regeneration/rebuild,
  - backfill for newly introduced fields.
- Require scriptable execution paths for local/dev/staging environments with
  validation output and failure handling.

### 6) Star Chart Data Strategy (Real Formations Where Possible)
- Support two dataset modes:
  - **Canonical gameplay map** (balanced handcrafted/procedural layout),
  - **Real-star inspired map** using imported astronomical catalogs where license/coverage permits.
- Preserve deterministic coordinate transforms for repeatable rendering.
- Keep data ingestion pipeline versioned and auditable.
- Treat real-star mode as best-effort and source-governed; canonical mode remains guaranteed fallback.

### 7) Validation
- Backend tests for route feasibility and jump validation logic.
- Frontend tests for:
  - chart mode switching (whole galaxy vs local reachable),
  - chart selection and reachability display,
  - local reachable-system detail panel rendering.
- Generation validation checks for:
  - deterministic output across reruns,
  - associated planet/station linkage completeness,
  - overview payload completeness for system details.
- Data validation checks for coordinate normalization and deterministic output.

## Out of Scope (Explicit)

- Full astrophysical simulation or exact relativistic travel.
- Real-time moving stars/celestial proper motion.
- Procedural nebula volumetrics.

## Sound Effects / Audio Feedback (Required)

Batch-11 remains chart/planning-centric; no new mandatory SFX keys are introduced
in this batch close. Existing jump transition cues continue to apply.

- `flight.jump.charge.start`
  - Trigger: confirmed hyperspace jump initiation sequence from chart-selected destination.
  - Cooldown: one trigger per jump sequence.
  - Channel: `flightVolume`.
- `flight.jump.transit.loop`
  - Trigger: active hyperspace transit phase.
  - Cooldown: phase-scoped loop.
  - Channel: `flightVolume`.
- `flight.jump.exit.complete`
  - Trigger: successful hyperspace exit into destination system.
  - Cooldown: one trigger per completed jump.
  - Channel: `flightVolume`.

Accessibility behavior:
- Honors global mute/reduced-audio settings and existing volume routing.
- No chart-only audio dependency is required to complete navigation actions.

Validation criteria:
- Jump chart workflow triggers expected flight jump cues exactly once per
  transition stage.
- Muted/reduced-audio modes preserve full navigation functionality.

## Supporting Functionality Required

### Hyperspace Engine Support
- Ship jump capability model (range, fuel curve, modifiers).
- Jump planning service for direct and multi-hop checks.
- Unified validation API used by both chart and flight controls.
- Shared error-reason taxonomy (fuel/range/cooldown/gravity-well/interdiction) for consistent UX.
- Deterministic route scoring strategy to avoid client/server route mismatches.

### View-Mode and Reachability Services
- Backend-computed reachable-system subset endpoint (or additive mode on
  existing system index endpoint) keyed by:
  - current system,
  - current ship/engine hyperspace capability,
  - current fuel state.
- Deterministic filter semantics so UI mode toggles do not produce drift between
  displayed reachability and jump validation.

### Star/System Data Services
- System index endpoint with coordinates and metadata for chart rendering.
- Dataset versioning (`star_data_version`) and migration tooling.
- Star-system detail endpoint/service including associated generated planets,
  moons, and stations for overview display.
- Optional import adapters for known catalog sources (subject to licensing and quality constraints).
- Source governance metadata:
  - `source_name`,
  - `license_type`,
  - `source_version`,
  - ingestion timestamp.
- Coordinate normalization policy (units, epoch, origin transform) documented and testable.

### Data Generation Operations
- Seed/backfill scripts and runbooks for system generation updates.
- Deterministic regeneration guardrails:
  - fixed seed + version input contracts,
  - idempotent writes,
  - mismatch detection/reporting.
- Procedure docs for when to regenerate versus when to migrate existing data.

### Caching and Performance
- Spatial indexing for nearest/reachable queries.
- Paginated/region-based chart data retrieval for large maps.
- Client memoization and progressive rendering.
- Max payload budgets and chart viewport request limits.
- Graceful degraded mode for low-memory devices and high-density sectors.

### Data Quality and Determinism
- Validation pipeline checks:
  - duplicate/invalid system coordinates,
  - unreachable-isolated nodes policy,
  - deterministic id generation from source rows.
- Snapshot baseline tests to ensure same dataset version renders same system map.

### Security and Abuse Controls
- Rate limits for chart/system search and route computation endpoints.
- Auth and ownership checks aligned with existing ship jump endpoints.

### Observability and Operations
- Metrics:
  - route compute latency,
  - reachable query latency,
  - chart payload size distribution,
  - jump rejection reason distribution.
- Operational runbook for dataset roll-forward/rollback.

## Data and Contract Additions

- System chart contract fields:
  - `system_id`, `name`, `x/y/z`, `faction`, `economy`, `tech_level`,
  - `reachable_from_current` (or equivalent computed state),
  - `view_mode` support (`galaxy`, `local_reachable`) in query and response
    metadata,
  - optional `dataset_source`/`catalog_ref` metadata.
- Route contract fields:
  - list of hops,
  - estimated fuel,
  - estimated risk/cost.
- Local system detail contract fields (additive):
  - `government`,
  - `population`,
  - `reachability_status`,
  - `reachability_reason`,
  - `estimated_jump_fuel`.
- System overview contract block (additive):
  - `planets_total`,
  - `moons_total`,
  - `stations_total`,
  - `planets[]` (summary: `name`, `body_type`, `orbit_index`),
  - `stations[]` (summary: `name`, `archetype`, `host_body_name`).

## API Contract Examples (Batch-11 MVP)

### `GET /api/systems/galaxy/systems`

Purpose:
- return systems for chart rendering,
- support `view_mode=galaxy` and `view_mode=local_reachable`.

Query params (MVP):
- `ship_id` (required)
- `view_mode` (`galaxy` | `local_reachable`, default `galaxy`)
- `include_unreachable` (`true` | `false`, default `true`)

Response shape (MVP):
- `current_system_id`
- `view_mode`
- `systems[]` with:
  - `system_id`, `name`, `x`, `y`, `z`, `economy`, `government`, `tech_level`,
  - `reachable_from_current`,
  - `estimated_jump_fuel`,
  - `reachability_reason` (nullable)

### `GET /api/systems/galaxy/systems/{system_id}/overview`

Purpose:
- provide local-view detail panel data.

Query params (MVP):
- `ship_id` (required)

Response shape (MVP):
- `system` object (`id`, `name`, `economy`, `government`, `tech_level`, `population`)
- `jump` object (`reachable`, `estimated_jump_fuel`, `reason`)
- `overview` object:
  - `planets_total`, `moons_total`, `stations_total`,
  - `planets[]` (summary),
  - `stations[]` (summary)

### `POST /api/ships/{ship_id}/hyperspace-target`

Purpose:
- set chart-selected destination system as active hyperspace target.

Request body (MVP):
- `destination_system_id`

Response shape (MVP):
- `ship_id`
- `destination_system_id`
- `reachable`
- `estimated_jump_fuel`
- `reason` (nullable)

### `POST /api/ships/{ship_id}/jump`

Batch-11 requirement note:
- existing jump operation must accept chart-selected destination workflow and
  perform cross-system jump when validation passes.

## Implementation Sequence

0. Define dataset governance and coordinate normalization rules.
1. Define galactic chart system data contract and backend query endpoint.
2. Define and implement deterministic star-system generation/backfill procedures
  for systems, planets, moons, and stations.
3. Implement chart UI rendering with selection + pan/zoom and explicit
  mode toggle (`Whole Galaxy` / `Local Reachable`).
4. Add hyperspace feasibility checks and chart-to-flight handoff.
5. Add local reachable-system detail panel and system overview presentation
  (including associated planets/stations).
6. Implement optional multi-hop route suggestion.
7. Add real-star dataset ingestion baseline and deterministic mapping rules.
8. Add observability/limits/rollout controls.
9. Add tests and performance verification.

## Acceptance Criteria

- Player can open galactic chart and select destination systems.
- Chart provides both full-galaxy and local reachable-range modes.
- Local reachable-range mode only shows systems reachable under the active
  ship/engine hyperspace capability (and current fuel constraints).
- Chart indicates which systems are reachable under current ship constraints.
- Hyperspace jump flow can consume chart-selected destinations and initiate
  cross-system jump when validation passes.
- In local reachable-range mode, selecting a star system shows details
  (economy/government/tech level/population when available) plus jump
  readiness details.
- Star-system data generation procedures exist and are executable for local/dev/
  staging, producing associated planets/moons/stations deterministically.
- Star-system detail overview includes associated planets and stations from
  generated data.
- Route suggestion works for unreachable direct targets (if multi-hop enabled).
- Star/system chart data is deterministic and versioned.
- Frontend lint/tests pass; targeted backend tests pass.

## Risks and Mitigations

- Risk: Real-star catalogs introduce licensing/format complexity.
  - Mitigation: pluggable data-source mode + explicit source metadata + fallback canonical map.
- Risk: Large chart datasets reduce performance.
  - Mitigation: spatial indexing + viewport-windowed loading + client caching.
- Risk: Chart/flight jump validations diverge.
  - Mitigation: shared backend validation service consumed by all clients.

## Test and Validation Evidence

- Execution date: 2026-03-04
- Commands run:
  - `backend`: `cd backend && set -a && source .env && set +a && PYTHONPATH=. /Users/lee/Library/Mobile\ Documents/com~apple~CloudDocs/Projects/Elite/root/.venv/bin/python -m pytest`
    - Result: pass (`112 passed`).
  - `frontend`: `cd frontend && npm run lint && npm run test && npm run build`
    - `npm run lint`: pass.
    - `npm run test`: pass (`83 passed`).
    - `npm run build`: pass.
- Environment notes:
  - Backend test bootstrap requires exporting `.env` values into the shell
    process so `TEST_DATABASE_URL` is available at runtime.

## Documentation Update Checklist

- [x] `prd/prd.md` reviewed for alignment.
- [x] Batch plan updated with current status.
- [ ] `CHANGELOG.md` updated when user-visible/dev-facing behavior changes.
- [ ] `README.md`/`backend/README.md` updated for setup or workflow changes.
