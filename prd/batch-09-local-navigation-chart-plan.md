# Batch 09 Implementation Plan — Local Navigation Chart + Scanner Tandem Workflow

Date: 2026-02-18  
Owner: Product + Backend + Frontend

## Objective

Deliver a classic local navigation chart that works in tandem with scanner and flight controls:
- local chart for current system contacts,
- scanner and chart selection sync,
- route/target selection workflow from chart to flight,
- deterministic and reproducible star-system body generation,
- persistent world updates (economy/politics) while players are away.

## Why This Batch Next

After collision/docking safety, pilots need stronger local navigation readability:
- scanner offers tactical proximity awareness,
- local chart offers strategic in-system target planning,
- both must stay synchronized to avoid cognitive mismatch.

## In Scope

### 1) Local Navigation Chart View
- Add dedicated local chart panel for current star system.
- Render key local contacts with clear type styling:
  - stars,
  - planets,
  - stations,
  - nearby ships (optional filtered mode).
- Provide retro/classic visual language inspired by attached references while staying readable.

### 2) Scanner <-> Chart Sync (Tandem)
- Selecting a contact in scanner highlights same contact in local chart.
- Selecting a contact in local chart sets scanner selected contact.
- Shared selected-contact details panel (name/type/distance/targetability).

### 3) Local Targeting and Waypointing
- Chart supports setting local waypoint/approach target.
- Flight mode consumes selected local target without manual re-entry.
- Preserve keyboard reachability and compact controls.

### 4) Contact Filtering and Layer Controls (MVP)
- Toggle visibility layers by type (station/planet/star/ship).
- Keep default view simple with all major navigation objects visible.

### 5) Validation
- Frontend tests for sync behavior between chart and scanner selection.
- Backend tests for local contacts consistency and deterministic ordering.
- Manual checks for accessibility and legibility at multiple viewport sizes.

### 6) Deterministic System Body Generation (Stars, Planets, Moons, Stations)
- Define a seeded generation procedure per star system to determine:
  - number of planets,
  - planet classes/types,
  - planet size class/radius,
  - orbital distance from the system star,
  - number of moons per planet,
  - moon class/type and size,
  - station assignments by orbiting host planet/moon.
- Require reproducible outputs from `(system_seed, generation_version)` so a revisited system keeps the same physical layout.
- Keep generation rules versioned and backward-compatible through migration policy.

### 7) Persistent Dynamic State While Unloaded
- Separate immutable/semi-immutable world structure from mutable simulation state:
  - structure: star/planet/moon/station topology and baseline physical properties,
  - mutable: commodity stock levels, market pricing, faction influence, political state, traffic density.
- Run background/tick simulation for systems even when players are not present.
- Ensure systems resume with continuous economic and political progression, not reset snapshots.

### 8) Accurate Planetary Body Rendering in UI
- Render planet and moon sizes proportionally according to canonical body radius scale (with documented visual scaling policy for readability).
- Render type/class-specific visual treatments (e.g., rocky, gas giant, ice, barren) in local chart and related tactical UI panels.
- Keep station orbit context visible and tied to host body labels.
- Require deterministic rendering inputs from backend contracts so repeated visits produce consistent visuals.

### 9) Scanner Tactical Range Cap + Player Scaling (MVP)
- Scanner grid render scope must be local/tactical to the player ship, not deep-system scale.
- Default scanner grid render cap is `100 km` from player ship.
- Contacts beyond selected scanner range are not rendered as in-grid blips.
- Out-of-range contacts remain visible in contact list/meta with true distance labels.
- Provide player-adjustable scanner range presets for practical local use:
  - 25 km,
  - 50 km,
  - 100 km (default),
  - 250 km,
  - 500 km.
- Scanner UI should show the active range preset so scale is explicit during navigation.

## Out of Scope (Explicit)

- Full orbital simulation in chart view.
- Real-time tactical combat overlays.
- Editable notes/bookmarks per local contact (can follow later).

## Data and Contract Additions

- Reuse and extend local contacts contract:
  - stable contact ids,
  - contact type,
  - distance/bearing,
  - optional chart projection coordinates.
- Add deterministic world-structure fields:
  - `generation_version`,
  - `system_seed`,
  - per-body `body_type`, `radius_km`, `orbit_radius_km`, `parent_body_id`,
  - station `host_body_id` and orbital metadata.
- Add mutable-state fields for off-screen continuity:
  - economic tick cursor,
  - commodity stock state,
  - political/faction state snapshot metadata.
- Keep additive fields only.

## Concrete Data Model Spec (v1)

### 1) Structural Tables (Deterministic)

- `star_systems` (existing, additive fields)
  - `id` (PK)
  - `name`
  - `seed`
  - `generation_version` (int, non-null)
  - `position_x`, `position_y`, `position_z`
  - `created_at`, `updated_at`

- `celestial_bodies` (new)
  - `id` (PK)
  - `system_id` (FK -> `star_systems.id`, indexed)
  - `body_kind` (`star` | `planet` | `moon`)
  - `body_type` (e.g., `g-class`, `rocky`, `gas-giant`, `ice`)
  - `name`
  - `seed_fragment` (int/bigint deterministic sub-seed)
  - `parent_body_id` (nullable FK -> `celestial_bodies.id`)
  - `orbit_index` (int, deterministic ordering within parent)
  - `orbit_radius_km` (numeric)
  - `radius_km` (numeric)
  - `mass_kg` (numeric, optional in v1)
  - `axial_tilt_deg` (numeric, optional in v1)
  - `position_x`, `position_y`, `position_z` (chart baseline anchors)
  - `render_profile` (json/text for deterministic frontend mapping)

- `stations` (existing, additive fields)
  - `host_body_id` (nullable FK -> `celestial_bodies.id`, indexed)
  - `orbit_radius_km` (nullable numeric)
  - `orbit_phase_deg` (nullable numeric)
  - Existing archetype fields remain authoritative for station visual family.

### 2) Mutable Simulation Tables (Continuous Updates)

- `system_simulation_state` (new)
  - `system_id` (PK/FK -> `star_systems.id`)
  - `last_economy_tick_at` (timestamp)
  - `last_politics_tick_at` (timestamp)
  - `economy_tick_cursor` (bigint/int)
  - `politics_tick_cursor` (bigint/int)
  - `version` (optimistic concurrency)

- `station_inventory` (existing, mutable)
  - remains mutable while system unloaded via tick pipeline.
  - add/retain `updated_at`, `version` for deterministic replay ordering.

- `system_political_state` (new, minimal v1)
  - `system_id` (PK/FK)
  - `faction_control_json` (json)
  - `security_level`
  - `stability_score`
  - `updated_at`

### 3) Deterministic Identity and Rebuild Rules

- Stable body id derivation rule (service-level):
  - deterministic key tuple = (`system_id`, `generation_version`, `body_kind`, `parent_body_id`, `orbit_index`).
- Deterministic generation function inputs:
  - (`system.seed`, `generation_version`).
- Structural generation outputs must be idempotent:
  - rerunning generation with same inputs must produce same body count, types, sizes, and orbit ordering.

### 4) Generation Procedure Requirements (Per System)

- Step 1: generate exactly one primary star (`body_kind=star`, `orbit_index=0`).
- Step 2: generate planet count via seeded distribution bounds (configurable by system class).
- Step 3: for each planet, derive:
  - `body_type`,
  - `radius_km`,
  - `orbit_radius_km`,
  - baseline chart coordinates.
- Step 4: for each planet, generate moon count via seeded bounds by planet type/size.
- Step 5: for each moon, derive type/size/orbit deterministically.
- Step 6: assign stations to host planet/moon by deterministic policy + authored overrides.

### 5) Off-Screen Continuity Procedure

- On system read/load:
  - compute elapsed time since `last_*_tick_at`,
  - apply bounded catch-up ticks in deterministic batches,
  - persist updated economic/political state,
  - return current snapshot to client.
- Tick execution order:
  1. economy ticks (`station_inventory`, market derivatives),
  2. political ticks (`system_political_state`),
  3. derived UI summaries.
- Structural tables (`celestial_bodies`, station host-body links) are not mutated by off-screen ticks.

### 6) Indexing and Constraints (Minimum)

- `celestial_bodies`
  - unique (`system_id`, `generation_version`, `body_kind`, `parent_body_id`, `orbit_index`)
  - index (`system_id`, `body_kind`)
  - index (`system_id`, `parent_body_id`)
- `stations`
  - index (`system_id`, `host_body_id`)
- `system_simulation_state`
  - PK (`system_id`)

### 7) API Contract Shape (Local Chart Payload)

- `GET /api/systems/{id}/local-chart`
  - `system`: id, name, seed hash/version metadata
  - `star`: single star body
  - `planets`: list with size/type/orbit fields
  - `moons`: list grouped by `parent_body_id`
  - `stations`: list with `host_body_id`, orbit metadata
  - `mutable_state`: market/politics summary timestamps and cursors
- Client rendering rule:
  - use backend-provided body size/type and deterministic render profile only; no client-random generation.

## Supporting Functionality Required (Implementation Readiness)

### Backend Systems
- Deterministic local-contacts ordering policy (stable sort key for UI parity).
- Optional chart projection helper fields (if server-provided) with reproducible mapping.
- Contract versioning note for additive chart-related fields.
- Seeded star-system body generation service with explicit algorithm versioning.
- Persistence layer separating structural system data from mutable simulation overlays.
- Off-screen simulation scheduler/pipeline for market and political updates.

### Frontend State Architecture
- Shared selected-contact store used by scanner and chart (single source of truth).
- Debounced refresh/merge behavior that preserves selected contact when still valid.
- Persisted local chart preferences (layers/zoom/center) with safe defaults.

### UX and Accessibility
- Keyboard-navigable chart target selection and layer toggles.
- Non-color-only differentiation (shape/icon/labels) for contact types.
- Empty/error/loading states aligned with existing DataState patterns.

### Performance and Rendering
- Hard cap and prioritization policy for rendered contacts (nearest-first).
- Memoized projection transforms and selective rerender strategy.
- Fallback simplified rendering mode for low-end devices.
- Deterministic size-scaling pipeline for planets/moons with readable min/max clamps.
- Visual LOD policy by body size/type without changing canonical identity.

### Observability and Operations
- Structured interaction logs for selection source (`scanner` vs `chart`) and sync outcomes.
- Metrics:
  - chart open frequency,
  - selection sync failure count,
  - chart render time budget compliance.

### Test and QA Support
- Unit tests for projection mapping and deterministic ordering.
- Integration tests for scanner->chart and chart->scanner synchronization.
- Regression checks for selected-contact persistence across refresh cycles.
- Golden-seed tests to confirm same system seed produces identical planet/moon/station layout.
- Continuity tests verifying off-screen ticks mutate economy/politics while preserving structural layout.
- Rendering contract tests verifying body type/size inputs map to expected chart visuals.

## Determinism and Persistence Rules

- Structural determinism:
  - Physical system composition derives only from stable seed + generation version.
  - Structural records are immutable except via explicit migration/version upgrade flow.
- Mutable simulation continuity:
  - Economy and political state evolve by ticks over elapsed time regardless of player presence.
  - On system load, apply elapsed ticks before serving UI-facing state.
- Authoritative source split:
  - backend is authoritative for structure and mutable state,
  - frontend renders from backend contracts without ad-hoc random generation.

## UX/Interaction Rules

- Scanner and chart share a single source of truth for selected contact id.
- If a selected contact disappears (range/status), selection gracefully falls back.
- Navigation actions should not silently fail; always show status/feedback.
- Scanner grid must not imply proximity for far contacts; only contacts inside active scanner range render on-grid.
- Active scanner range setting must be visible in scanner UI and persist per player session/preferences.

## Implementation Sequence

0. Finalize shared selection state and deterministic ordering contract.
1. Define seeded system-generation contract (planets/moons/station orbits) and versioning rules.
2. Implement/verify backend structural generation persistence for all systems.
3. Implement off-screen mutable-state simulation continuity (economy/politics ticks).
4. Define local chart projection model from local contacts and body-orbit metadata.
5. Add local chart UI shell and rendering primitives with size/type-accurate body visuals.
6. Implement scanner/chart bidirectional selection sync.
7. Add waypoint/approach target actions from chart.
8. Add layer toggles, state persistence, and observability hooks.
9. Add deterministic, continuity, and rendering contract tests; validate.

## Acceptance Criteria

- Local chart renders current system objects with distinct type visuals.
- Scanner and chart selections remain synchronized both directions.
- Player can set a local target from chart and use it in flight flow.
- Contact selection remains stable and deterministic after refreshes.
- Revisiting the same system yields the same star/planet/moon/station physical layout.
- Planet/moon size and type visuals are consistent with backend-provided body contracts.
- Economy and political state continue to evolve while player is away and are reflected on return.
- Scanner grid defaults to 100 km local tactical range and displays that active range setting.
- Player can change scanner range preset (25/50/100/250/500 km) and setting persists.
- Contacts beyond selected scanner range do not render as in-grid blips but remain listed with accurate distance.
- Frontend lint/tests pass; targeted backend tests pass.

## Execution Status Update (2026-02-18)

### Implemented

- [x] Local chart renders stars/planets/stations with deterministic backend contracts.
- [x] Scanner and chart selection synchronization works in both directions.
- [x] Shared selected-contact details are surfaced with scanner/chart tandem behavior.
- [x] Local waypoint/approach actions flow from chart selection into flight workflow.
- [x] Layer toggles (star/planet/station/ship) implemented with persisted preferences.
- [x] Selected-contact persistence across refresh/reload implemented with graceful fallback.
- [x] Deterministic system body generation contract enforced by regression tests.
- [x] Off-screen mutable-state catch-up on system read implemented and validated.
- [x] Continuity tests verify mutable-state advancement while structure remains stable.
- [x] Rendering contract tests cover body type/size label mapping and sparse-system rendering.
- [x] Observability hooks implemented for chart opens, selection sync, chart sync, and render budget.
- [x] In-app developer observability panel added with aggregated counters and event feed.
- [x] Chart clutter policy hardened: nearest-first capped ship rows in local chart.

### Remaining / Follow-up

- [ ] Add full background scheduler/worker pipeline for off-screen simulation beyond read-time catch-up.
- [ ] Expand accessibility QA pass (keyboard-only + screen-reader semantics) across viewport breakpoints.
- [ ] Add broader performance profiling/threshold checks for dense-system contact loads.
- [ ] Implement scanner tactical range cap and player-selectable scanner scale presets in flight scanner HUD.
- [ ] Capture final Batch 09 sign-off notes in changelog/release summary once merged.

## Risks and Mitigations

- Risk: Selection desync between scanner and chart.
  - Mitigation: shared single-state contact selection id.
- Risk: Chart clutter in dense systems.
  - Mitigation: lightweight layer toggles + nearest-first emphasis.
- Risk: Performance drops with many contacts.
  - Mitigation: capped render count + memoized projection mapping.
- Risk: Determinism drift after generation-rule changes.
  - Mitigation: explicit `generation_version` and migration scripts with golden-seed regression tests.
- Risk: Off-screen simulation cost at scale.
  - Mitigation: coarse-grained tick batching, bounded catch-up windows, and incremental processing.
