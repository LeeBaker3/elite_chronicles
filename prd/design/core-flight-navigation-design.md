# Core System Design — Ship Flight and Navigation

Status: Active  
Last Updated: 2026-03-12  
Owners: Product + Backend + Frontend

## Objective

- Define the canonical model for local-space flight, hyperspace travel,
  scanner telemetry, local/system chart behavior, waypoint tracking, docking,
  and 3D scene rendering.
- Document which coordinate spaces are authoritative, which are presentation
  only, and how contacts must be tracked consistently across backend and
  frontend.
- Define the shared flight/navigation contract that must remain consistent
  across first-party runtimes even when web and desktop presentation differs.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Ship movement and persistence | 5.3, 5.13, 5.14 | Persistent ship/location state | Server authority for mutable ship state |
| Hyperspace and local transfer | 5.3.1, 5.14 | Fuel/range/travel constraints | Distinct hyperspace vs in-system transfer paths |
| Scanner and tactical contacts | 5.3.2, 5.7, 5.14 | Tactical scanner range and local awareness | True-distance list labels and stable contact identity |
| Station/planet approach and docking | 5.7, 5.14 | Navigation to stations and locations | Docking corridor and local waypoint flow |
| Logs and observability | 5.11, 5.12 | Admin/system monitoring stories | Flight, chart, scanner, and jump diagnostics |

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
- Ship position, velocity, fuel, jump phase, and destination lock state.
- Local contact generation for stars, planets, moons, stations, and ships.
- Contact identity and coordinate contracts across backend and frontend.
- Scanner list, scanner HUD, flight scene markers, local chart rows, and
  galactic jump-planning interactions.
- Docking approach, local transfer, hyperspace jump, collision checks, and
  position synchronization.
- Shared flight/navigation meanings that must be stable across web and desktop
  clients.

### Out of Scope
- Full orbital mechanics simulation with continuous gravity integration.
- Newtonian combat flight model.
- Autonomous NPC navigation authority beyond contact presentation.
- Platform-specific scene implementation details that belong in runtime docs.

## Domain Model

- Authoritative ship state:
  - Persisted on the backend in ship world coordinates:
    `position_x`, `position_y`, `position_z`, `velocity_x`, `velocity_y`,
    `velocity_z`, `status`, `flight_phase`, and destination lock fields.
- Contact identity:
  - Canonical frontend/backend shared identity is string form
    `<contact_type>-<numeric_id>`.
  - Valid local target contact types are `station`, `planet`, `moon`, `star`.
  - Ship contacts are trackable scanner contacts but not valid local-transfer
    or docking targets.
- Contact coordinate layers:
  - `position_*` on world entities and ships are authoritative absolute world
    positions in kilometers.
  - `relative_*_km` on local contacts are the canonical ship-relative contact
    positions in kilometers.
  - `scene_*` are compressed presentation coordinates used only when canonical
    relative positions are unavailable.
  - `presentation_*` are frontend-only celestial fallback positions for scene
    layout when local chart-derived relative coordinates are synthesized.
  - `chart_*` are chart display coordinates derived from authoritative world
    positions or from anchored relative positions, not an independent source of
    truth.
- Multi-client rule:
  - all first-party clients must preserve the same identity, coordinate, and
    flight-phase meanings defined here and in
    `core-client-platform-contract-design.md`.
- Waypoint and target state:
  - Station hyperspace target is tracked through locked destination station and
    contact fields.
  - In-system waypoint/transfer target is tracked through local target contact
    identity and local waypoint UI state.
  - Docking approach target is a stronger temporary override while the ship is
    inside the docking approach phase.

## Runtime Behavior

### 1. World-Space Authority

- Backend ship state is authoritative for all persistent space mechanics.
- `GET /api/ships/{ship_id}/flight-snapshot` is the preferred lightweight
  authoritative polling surface for active clients:
  - it returns current ship telemetry,
  - it returns `ship_version` and `local_snapshot_version`,
  - it returns backend-guided `suggested_poll_interval_ms`,
  - it indicates whether scanner/chart payloads should be refreshed.
- `POST /api/ships/{ship_id}/navigation-intent` is the preferred
  backend-owned correction surface for immediate navigation actions such as
  `gain_clearance`.
- `POST /api/ships/{ship_id}/position-sync` remains provisional and should not
  be treated as the long-term production movement contract.
- `POST /api/ships/{ship_id}/flight-state` remains provisional for legacy web
  sequencing and restore behavior.
- Runtime-specific note:
  - browser and desktop clients may use different rendering and control
    strategies, but both must treat backend ship state as the only persistent
    authority.
- Scalability rule:
  - clients render and interpolate locally,
  - clients poll `flight-snapshot` at backend-guided cadence instead of
    syncing every frame,
  - clients refresh heavier local-space payloads only after meaningful state
    changes, navigation intents, or snapshot-version changes.

### 2. Contact Generation and Identity

- `GET /api/ships/{ship_id}/local-contacts` produces the active in-system
  contact set.
- Local contacts include stars, planets, moons, stations, and other ships in
  the current system.
- Each contact carries:
  - stable `id`
  - `contact_type`
  - user-facing `name`
  - true `distance_km`
  - optional structural metadata such as `body_type`, `radius_km`,
    `orbit_radius_km`, `orbiting_planet_name`, `station_archetype_shape`, and
    `ship_visual_key`
  - canonical `relative_x_km`, `relative_y_km`, `relative_z_km`
  - compressed `scene_x`, `scene_y`, `scene_z` fallback coordinates
- Local-space payloads also carry shared snapshot metadata:
  - `snapshot_version`
  - `snapshot_generated_at`
- Rule:
  - If a contact has `relative_*_km`, all flight, scanner, marker, and chart
    systems must prefer that data over `scene_*`.
- This rule is shared across first-party runtimes and must not be redefined in
  web or desktop rendering code.

### 3. Scanner Model

- Scanner behavior has two distinct surfaces:
  - contact list and detail panels driven from snapshot backend contacts
  - HUD/grid blips driven from live flight-scene telemetry with backend
    snapshot fallback
- Distance policy:
  - display distance is snapshot-first so list values stay stable and readable
  - live distance is only used when snapshot distance is unavailable
- Projection policy:
  - HUD placement uses canonical plane projection from ship-relative contact
    pose
  - altitude no longer determines whether an in-range blip may appear on the
    scanner grid
  - `scene_*` fallback is only used when no canonical relative position exists
- Selection policy:
  - scanner selection is a UI focus mechanism, not an authority source for
    flight state
  - `POST /api/ships/{ship_id}/scanner-selection` records selected contact
    diagnostics/telemetry only
- Refresh policy:
  - scanner contacts should not be polled at render cadence,
  - clients should use `flight-snapshot` as the authoritative lightweight poll
    surface and refresh scanner payloads when backend snapshot/version signals
    require it or after explicit navigation/flight intents complete.

### 4. Local Chart and World Reconstruction

- `GET /api/systems/{system_id}/local-chart` provides the structured star,
  planets, moons, stations, and mutable local target state for the current
  system.
- Scanner and local-chart payloads must expose compatible snapshot metadata so
  the frontend can reject mixed-snapshot reconstruction.
- The frontend local chart reconstructs contact positions by preferring:
  1. anchored world position derived from a known station world coordinate plus
     live `relative_*_km`
  2. backend contact `relative_*_km`
  3. compressed fallback coordinates only when neither of the above exists
- Result:
  - chart rows are not a separate truth source
  - chart, scanner, and flight scene should describe the same target set using
    the same stable contact IDs and the same relative/world geometry basis

### 5. Flight Scene Rendering

- The 3D flight scene uses contact identity shared with scanner/chart state.
- Rendering order of trust for positions:
  1. `relative_*_km` for near-field local rendering
  2. synthesized celestial anchor positions that preserve the same physical
     relative km basis as scanner/chart contacts
  3. `scene_*` only as fallback presentation data
- Current batch policy:
  - celestial anchors render from physical ship-relative km, not a separate
    compressed orbit-layout projection
- Marker policy:
  - focused contact marker and waypoint marker resolve from the same canonical
    contact ID model
  - docking approach target overrides generic waypoint target
  - local waypoint contact overrides generic destination lock when both exist
  - waypoint torus visibility depends on a resolved waypoint target position,
    not merely jump phase labels
- Station rendering:
  - station visual shape is driven by `station_archetype_shape`
  - docking port position is derived deterministically from the station model
    and shape-specific anchor data
  - docking visuals may add presentation detail, but may not redefine target
    identity or contact position authority
- Runtime split:
  - this doc defines the shared rendering-input data contract,
  - browser-specific rendering behavior belongs in
    `frontend-web-runtime-design.md`,
  - Panda3D scene, floating-origin, and camera behavior belongs in
    `frontend-desktop-runtime-design.md`.

### 6. Waypoint Tracking and Target Priority

- Canonical target priority in flight-facing UI:
  1. active docking approach target
  2. explicit local waypoint contact
  3. locked destination contact
  4. locked destination station expressed as `station-<id>`
- Rationale:
  - local system navigation can legitimately maintain both a generic locked
    destination and a specific local waypoint, especially for planets/stars
  - the explicit local waypoint is the stronger user intent for in-system
    travel and marker rendering
- Local chart waypoint toggle behavior:
  - station selection locks station destination and clears local waypoint state
  - planet/star/moon selection locks the specific local target contact and may
    also populate generic destination-contact fields for persistence parity

### 7. Local Transfer and Hyperspace

- Hyperspace jump:
  - `POST /api/ships/{ship_id}/jump`
  - used for system-to-system travel via a destination station/system pair
  - requires fuel and safe exit constraints
- Local transfer:
  - `POST /api/ships/{ship_id}/local-target` with action `transfer`
  - used for in-system relocation toward a locked station, planet, moon, or star
  - writes authoritative ship position near the target in world space
- Celestial transfer rule:
  - transfer placement for stars/planets/moons must use body radius plus
    standoff distance, never a raw center-point offset only
  - this keeps post-transfer ship placement physically outside large bodies and
    keeps scanner/chart/render distance behavior coherent

### 8. Docking and Position Sync

- Docking is a local in-system maneuver layered on top of the same contact and
  waypoint model.
- `POST /api/ships/{ship_id}/dock` validates docking-computer range and target
  station rules.
- During docking approach, the frontend may sync ship position to keep backend
  world state aligned with the rendered final docking path.
- Docking computer/collision safety corridor temporarily suppresses collision
  responses that would conflict with deterministic docking completion.

## Current State Starter (Batches 01-11)

- End-to-end flight-trade loop is established: trade -> undock -> jump ->
  approach -> dock -> trade (`Batch 04`).
- Flight scene realism baseline delivered with deterministic traffic visuals,
  station presentation, and render-profile controls (`Batch 05`, `Batch 07`).
- Local scanner contacts for ships/stations/planets/stars are implemented with
  synchronized selection and detail surfaces (`Batch 06`, `Batch 09`).
- Docking safety mechanics are in place: docking-computer range tiers,
  approach phase, collision checks, and checkpoint recovery (`Batch 08`).
- Local chart/scanner tandem and waypoint workflow are implemented with
  deterministic contact/state contracts (`Batch 09`).
- In-system travel and chart interactions are completed with local-target
  authority APIs and deterministic celestial identity parity (`Batch 10`).
- Galactic chart and hyperspace navigation are completed with mode switching,
  reachability evaluation, and destination overview contracts (`Batch 11`).

## Code-Truth Update (2026-03-09)

- Backend status: verified active ship flight/scanner endpoints:
  - `GET /api/ships/{ship_id}`
  - `GET /api/ships/{ship_id}/local-contacts`
  - `GET /api/ships/{ship_id}/operations`
  - `POST /api/ships/{ship_id}/scanner-selection`
  - `POST /api/ships/{ship_id}/dock`
  - `POST /api/ships/{ship_id}/undock`
  - `POST /api/ships/{ship_id}/jump`
  - `POST /api/ships/{ship_id}/local-target`
  - `POST /api/ships/{ship_id}/collision-check`
  - `POST /api/ships/{ship_id}/crash-recovery`
  - `POST /api/ships/{ship_id}/flight-state`
  - `POST /api/ships/{ship_id}/position-sync`
- Backend status: verified active systems endpoints:
  - `GET /api/systems/galaxy/systems`
  - `GET /api/systems/galaxy/systems/{system_id}/overview`
  - `GET /api/systems/{system_id}/local-chart`
- Backend contacts now expose physical relative fields on local contacts.
- Frontend runtime actively uses the above surfaces for scanner, chart, flight
  scene, docking, jump, and collision flows.
- Frontend now treats canonical relative contact pose as the primary basis for:
  - scanner HUD blips
  - celestial markers
  - waypoint/focus markers
  - local chart row placement
- `scene_*` remains a fallback display contract, not the primary local-space
  truth when `relative_*_km` is present.

## API and Data Contracts

Shared client-platform contract reference:
- `prd/design/core-client-platform-contract-design.md`

### Contact Contract

| Field Group | Purpose | Canonical Use |
|---|---|---|
| `id`, `contact_type`, `name` | Stable identity and display naming | Shared across scanner, chart, flight, waypoints |
| `snapshot_version`, `snapshot_generated_at` | Snapshot compatibility metadata | Detect and reject mixed scanner/chart states |
| `distance_km` | Snapshot contact distance | Scanner lists, chart rows, status text |
| `relative_x_km`, `relative_y_km`, `relative_z_km` | Physical ship-relative position in km | Primary input for render, marker, and chart alignment |
| `scene_x`, `scene_y`, `scene_z` | Compressed presentation position | Fallback only |
| `radius_km`, `body_type`, `orbit_*`, `station_archetype_shape`, `ship_visual_key` | Visual and contextual metadata | Scene rendering and detail surfaces |

### Ship Flight Contract

- Persisted flight fields:
  - `flight_phase`
  - `flight_locked_destination_station_id`
  - `flight_locked_destination_contact_type`
  - `flight_locked_destination_contact_id`
- Local target state must remain additive/backward-compatible:
  - station lock remains supported for legacy flow compatibility
  - generic contact lock carries the authoritative non-station target identity

### Chart Contract

- Local chart returns:
  - system/star/planet/moon/station structural data
  - mutable local target state
  - deterministic body IDs that must match scanner contact IDs by type/id pair
- Frontend chart display coordinates are derived presentation outputs and must
  not be treated as a new persisted coordinate system.

## Failure Modes and Guardrails

- Coordinate-space drift:
  - scanner, chart, and flight scene must not each invent separate target
    positions for the same contact
- Target-state drift:
  - local waypoint state must not be hidden behind weaker generic destination
    lock precedence
- Fallback leakage:
  - `scene_*` fallback must not silently override valid `relative_*_km`
    contracts
- Invalid travel transitions:
  - local transfer requires in-space state and valid in-system target contact
  - hyperspace jump requires fuel, cooldown clearance, and valid destination
- Celestial transfer placement bug class:
  - stars/planets/moons must never place the ship near body center after
    transfer
- Docking-state race conditions:
  - docking approach, dock request, position sync, and collision safety
    corridor must remain phase-aware
- Runtime drift:
  - web and desktop runtimes must not reinterpret flight phases, target
    priority, or coordinate authority differently for the same backend state

## Observability and Operations

- Measure and monitor:
  - flight tick / frame update health
  - scanner refresh cadence and response errors
  - local-chart sync success/failure
  - jump and local-transfer failure reasons
  - docking debug events and completion timing
  - collision-check frequency and recovery outcomes
- Logging expectations:
  - scanner/chart/flight target IDs should be comparable in logs
  - local-target and docking operations should record resolved contact identity
  - admin/support diagnostics must be able to answer which contact was locked,
    rendered, transferred toward, and docked against

## Validation and Test Evidence

- Frontend tests:
  - `npm run lint`
  - `npm run test -- page.scanner-flight.test.tsx`
  - `npm run test -- scannerDistance.test.ts`
  - `npm run test -- FlightScene.controls.test.ts`
  - `npm run test -- FlightScene.docking.test.ts`
- Backend tests:
  - `pytest backend/tests/test_players_ships_markets.py`
  - `pytest backend/tests/test_systems_local_chart.py`
- Verified regression themes covered in tests:
  - canonical scanner plane projection
  - snapshot-first scanner distance display
  - waypoint propagation into flight scene
  - additive local contact `relative_*_km` contracts
  - local transfer placement outside planetary radius

## Open Questions

- Whether long-range celestial presentation needs an explicit documented scale
  contract beyond current fallback/presentation rules if richer orbital motion
  is introduced later.
- Whether scanner and chart should expose more explicit debug overlays for
  contact source selection (`relative_*_km` vs fallback) in developer mode.
- Whether a shared client helper layer should own some flight/navigation
  contract resolution currently embedded in web runtime code before desktop
  implementation expands.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent flight/navigation design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
- 2026-03-09 — Space mechanics rewrite — Expanded doc to define authoritative world space, contact identity, scanner/chart/render contracts, waypoint priority, and local transfer rules.
- 2026-03-12 — Batch 12.5 — Cross-linked flight/navigation authority to the
  shared client-platform contract and separated runtime-specific behavior into
  web and desktop companion docs.
