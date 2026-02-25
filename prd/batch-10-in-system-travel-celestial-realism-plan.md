# Batch 10 Implementation Plan — In-System Travel Completion + Celestial Realism + Interactive 3D System Chart

Date: 2026-02-19  
Owner: Product + Backend + Frontend

## Objective

Complete in-system travel so celestial bodies are physically believable, visually distinct, persistent, and fully navigable in gameplay:
- stars, planets, and moons rendered by class/type,
- station placement biased near planetary orbits,
- deterministic and reproducible system generation,
- selectable planets/moons/stations in system tools with jump/approach workflow,
- consistent object data across scanner, system map, and chart views.

## Why This Batch Next

Local chart/scanner synchronization exists, but in-system travel is not yet fully realized as a physical, believable simulation layer. This batch closes the gap between:
- generated world data,
- rendered world visuals,
- flight navigation workflow,
- and player trust in persistent system identity.

## Execution Status Update (2026-02-20)

Status: In Progress

Completed slice (2026-02-23):
- Added generic local-target authority contract for in-system navigation:
  - ship telemetry now carries `flight_locked_destination_contact_type` +
    `flight_locked_destination_contact_id` (station/planet/moon/star),
  - new backend endpoint `/api/ships/{ship_id}/local-target` supports
    `lock` / `transfer` / `clear` with server-authoritative state updates.
- Updated local-chart mutable-state contract to expose
  `local_target_contact_type` + `local_target_contact_id`.
- Frontend approach/waypoint flow now prefers authoritative local-target API
  for lock/transfer, with compatibility fallback when endpoint is unavailable.
- System chart now includes a true WebGL 3D render layer (Three.js/R3F) while
  retaining deterministic overlay hit-testing for navigation precision.
- Added first renderer LOD budgets and enforcement for traffic ships,
  stations, and celestial meshes/rings by profile + distance tier.
- Added regression coverage for local-target transfer and archetype-resolved
  ship visual identity behavior.

Completed slice (2026-02-20):
- Frontend shared flight-audio dispatcher scaffold implemented with typed
  taxonomy, cooldown gates, and category-level rate caps.
- Dispatcher wired to scanner/system target acquisition + waypoint lock
  actions, jump phase transitions, and local-chart audio hints.
- Reduced-audio fallback behavior added (suppresses heavy motion-loop/
  throttle cues when reduced-motion preference is active).
- Flight settings now include persisted user audio controls (`Audio Cues`
  + `Reduced Audio`) wired into dispatcher gating.
- Added shared flight-audio playback adapter scaffold behind dispatched
  events, with deterministic event-to-cue mapping and safe no-audio
  fallback (`blocked/unsupported/error`) behavior.
- Added adapter unit coverage and integrated scanner/flight regression
  validation (`50/50` tests passing) plus frontend lint pass.
- Hardened local-chart audio hint ingestion with deterministic dedupe and
  signature-based replay suppression so repeated payload reads do not
  re-trigger duplicate hint events.
- Added regression coverage for duplicate hint-key dispatch behavior.
- Added shared canonical flight-phase parser and applied normalization
  across ship telemetry sync + local-chart mutable-state ingestion to
  prevent unknown phase drift between scanner/chart/flight views.
- Added regression coverage for unknown phase fallback behavior
  (`Chart idle`).
- Added canonical local-target-status parser (`none`, `in-system-locked`,
  `out-of-system-locked`, `unknown-target`) and fallback normalization to
  keep scanner/chart/flight status labels contract-safe under unexpected
  backend strings.
- Added regression coverage for unknown target-status fallback (`none`).
- Added deterministic celestial chart visual resolver (body-kind/type-aware
  color/token/scale mapping) for stars, planets, and moons.
- Local chart now includes moon rows from `moons_by_parent_body_id` and
  renders moon-specific visual labels; system chart plot styling now uses
  body metadata rather than contact type alone.
- Added regression coverage for moon-row rendering in the system chart list.
- Flight scene celestial anchors now prefer local-chart body metadata and
  include moon anchors (with scanner fallback), so in-flight rendering can
  show star/planet/moon context consistently.
- Flight scene celestial anchor visuals now resolve deterministic color and
  size from body-kind/body-type/radius metadata instead of contact type
  alone.
- Tuned in-flight celestial anchor projection for readability in large
  systems using non-linear radial scaling plus a minimum non-star orbit
  floor so nearby planets/moons remain visible while preserving far-body
  context.
- Tuned FlightScene body-size clamping by body kind/type (including gas
  giant and stellar class handling) to keep moon/planet/star silhouettes
  visually distinct under extreme zoom levels.
- Upgraded in-flight celestial meshes from marker-like basic dots to
  larger body-like lit spheres with star halo treatment so planets/moons/
  stars read as celestial bodies during live flight.
- Reworked in-flight orbital projection spacing with deterministic
  ordered orbit separation so planets/moons are no longer visually clumped
  and travel spacing better reflects navigation/jump-style progression.
- Added deterministic body-detail layering in flight view:
  - gas-giant-first ring policy (plus rare rocky rings),
  - cloud shell pass for atmospheric worlds,
  - surface accent overlay tinting for oceanic/desert/volcanic/ice bodies.
- System quick actions now support waypoint/approach on celestial targets
  (star/planet/moon contacts) with local transfer-jump workflow; long-range
  inter-planet moves are surfaced as transfer-jump-required rather than
  manual-close approach.
- Added regression coverage for planet-target transfer jump workflow;
  scanner-flight suite passes (`50/50`) and frontend lint passes.
- Celestial range telemetry now uses astronomical scaling (millions-of-km
  class readouts) while preserving station/local tactical distances.
- Celestial approach behavior is now conditional:
  - nearby targets keep manual-flight approach flow,
  - far targets mark manual cruise impractical and run transfer jump via
    Approach action.
- Added regression coverage for both nearby-manual and far-transfer planet
  workflows; scanner-flight suite passes (`51/51`) and frontend lint passes.
- Moons promoted to first-class system contacts (`moon` type) across local
  chart layers, system chart tokens/selection, waypoint/approach quick
  actions, and flight anchor typing/fallback rendering.
- Fixed system-chart selection flow for chart-only contacts not present in
  scanner feed, enabling moon selection + targeting parity.
- Added regression coverage for moon-anchor propagation into flight scene;
  scanner/flight suite passes (`49/49`) and frontend lint passes.
- Full frontend regression sweep passes (`69/69`), and runtime sanity check
  confirms active dev server responds `200 OK` at `localhost:3000`.
- Regression coverage added for typed dispatcher events; frontend scanner/
  flight suite and lint pass.

## Logical Prerequisites (Must Exist First)

Batch 10 depends on the following already-delivered foundations before
full implementation proceeds:
- Batch 08 collision safety baseline must remain active so in-system
  travel cannot strand players in invalid crash loops.
- Batch 09 local chart + scanner tandem selection flow must remain the
  canonical target-selection entry point.
- Canonical object identity contract (`id`, `type`, anchor coordinates,
  and distance semantics) must be stable across scanner/chart/flight.
- Local flight phase state model (idle, approach, transfer/jump, arrival)
  must be defined once and reused by UI, telemetry, and audio hooks.
- Deterministic generation policy `(system_seed, generation_version)`
  must be finalized before adding new body profile mappings.

If any item above is missing, resolve it as a blocking subtask first and
link the resolution in this batch checklist.

## Batch 10 Readiness Checklist

Use this gate before beginning implementation workstreams:

- [x] Batch 08 collision safety baseline is enabled in target environments.
- [x] Batch 09 scanner/chart tandem selection remains stable in regression checks.
- [x] Canonical identity contract is unchanged and documented (`id`, `type`,
  anchor coordinates, distance semantics).
- [x] Shared local flight phase model is finalized and used by backend +
  frontend (`idle`, `approach`, `transfer/jump`, `arrival`).
- [x] Deterministic generation contract is locked (`system_seed`,
  `generation_version`) with snapshot tests passing.
- [x] Audio event dispatcher scaffold exists and can receive typed events from
  scanner/chart/flight flows.
- [x] Accessibility baseline is defined for audio feedback (reduced-audio/
  fallback cues) before SFX rollout.

Batch kickoff rule: do not mark Batch 10 as in-progress until every item is
checked or an explicit blocker waiver is recorded with owner and date.

## In Scope

### 1) Celestial Visual Identity by Body Type
- Render stars, planets, and moons with deterministic type/class visual profiles.
- Examples (style targets):
  - gas giant profile (Jupiter-like banding and scale cues),
  - desert rocky profile (Mars-like tone/terrain styling),
  - ice, barren, oceanic, and volcanic variants.
- Ensure profile selection is deterministic from backend body contract fields.

### 2) Persistent Deterministic Celestial Generation
- Keep system body generation reproducible from `(system_seed, generation_version)`.
- Ensure repeat visits yield identical:
  - body count,
  - body type/class,
  - radius,
  - orbital radius/order,
  - station-host relationships.
- Maintain strict backward compatibility via versioned generation policy.

### 3) Orbital Mechanics Fidelity (Data-Level Correctness)
- Enforce orbital metadata correctness in data and rendering transforms:
  - canonical `radius_km`,
  - `orbit_radius_km`,
  - parent-child relationships,
  - deterministic orbit index ordering.
- Keep visual scaling readable while preserving physics-derived ordering and proportionality constraints.

### 4) Station Placement and Orbit Context
- Make station placement predominantly near host planets/moons by deterministic policy.
- Surface host-body context in UI (labels/details) consistently.
- Preserve authored overrides where needed while keeping policy defaults reliable.

### 5) In-System Navigation and Jump/Approach Targeting
- Player can select a planet/moon/station in system tools and initiate local navigation workflow.
- Define clear behavior for selected body travel intent:
  - route/approach targeting,
  - local jump/transfer gating,
  - status feedback on feasibility and phase.
- Keep controls keyboard reachable and compact.

### 6) Interactive 3D System Chart as Navigation Tool
- Upgrade chart/system visualization to interactive 3D for current system.
- Required interactions:
  - rotate/pan/zoom,
  - select bodies/contacts,
  - highlight selected target and relative position context.
- Chart must remain useful for planning, not decorative:
  - clear depth cues,
  - readable labels,
  - selection fidelity tied to navigation actions.

### 7) Cross-View Data Consistency Guarantees
- Ensure scanner, system map, chart, and flight view agree on object identity and state.
- Shared canonical object fields across views:
  - id, type, name,
  - distance/relative vectors,
  - position anchors,
  - body class/radius/orbit metadata.
- Prevent drift between visual location and selected/targeted contact state.

### 8) Validation
- Backend tests for deterministic generation and persisted identity invariants.
- Frontend tests for cross-view selection and position consistency.
- Manual QA pass for in-system navigation usability and chart readability.

### 9) Flight Audio Foundations for In-System Travel
- Add movement-loop audio layer for normal in-system flight (engine/background motion noise).
- Add throttle-coupled SFX behavior:
  - acceleration cue ramps,
  - deceleration cue ramps,
  - smooth transitions to avoid abrupt audio pops.
- Add jump audio events tied to jump visual states:
  - pre-jump charge sound,
  - jump transit burst,
  - jump exit/re-entry cue.
- Keep audio states deterministic and synced with flight phase transitions.

## Out of Scope (Explicit)

- Full N-body gravitational simulation.
- Atmospheric flight and surface landing gameplay implementation.
- Tactical combat overhaul (covered in later collision/combat batches).

## Supporting Functionality Required

### Backend Systems
- Deterministic body generation service with explicit versioning.
- Stable object identity mapping across API payloads.
- Station host-assignment policy with deterministic defaults + override support.
- Local navigation endpoint support for planet/moon/station target intents.

### Frontend Systems
- Shared selection/target source of truth used by scanner + chart + flight HUD.
- 3D chart interaction layer with deterministic projection and selection hit testing.
- Unified details panel model for selected celestial contacts.
- Strong error/loading/empty states for each in-system data path.

### Data Consistency and Persistence
- Immutable/semi-immutable structural body data persisted separately from mutable simulation state.
- Explicit validation checks to reject structurally inconsistent body graphs.
- Contract version markers included in chart/scanner/system payloads.

### Performance and UX
- Contact/body render prioritization and LOD rules for dense systems.
- Memoized transforms for chart rendering and selection raycasts.
- Fallback simplification mode for lower-end devices.

### Observability
- Metrics:
  - selection sync success/failure across views,
  - chart render time budget compliance,
  - local target acquisition success rate,
  - deterministic generation mismatch count (should remain zero).

### Sound Effects / Audio Feedback (Required)
- Add in-system navigation SFX baseline for:
  - target acquisition,
  - target lock/confirm,
  - invalid action/reject,
  - approach-ready cue.
- Add propulsion and movement SFX baseline for:
  - acceleration,
  - deceleration,
  - continuous in-system motion bed (low-level engine/background movement noise).
- Add jump audiovisual sync requirements:
  - jump SFX start/peak/end must align to jump phase transitions and associated visual effects.
- Keep audio trigger behavior deterministic and cooldown-gated.
- Respect accessibility preferences where available.

### Sound Effects Framework (Implementation Contract)
- Introduce a single frontend flight-audio event dispatcher so scanner,
  chart, and flight HUD do not trigger audio independently.
- Use a typed event taxonomy to keep future expansion predictable:
  - `nav.target_acquired`
  - `nav.target_locked`
  - `nav.invalid_action`
  - `nav.approach_ready`
  - `flight.throttle_accel`
  - `flight.throttle_decel`
  - `flight.motion_loop`
  - `jump.charge_start`
  - `jump.transit_peak`
  - `jump.exit`
- Enforce per-event cooldown windows and global concurrency caps to
  prevent audio spam.
- Define category-level mix policy (navigation, propulsion, jump) so one
  category cannot starve another during rapid state changes.
- Provide silent fallback behavior (log + no crash) when assets fail to
  load or user/device disables sound.
- Respect reduced-motion/reduced-audio preferences by replacing long
  loops or heavy effects with short, minimal cues.
- Keep event payload shape additive and versioned to support future
  server-authored audio hints without breaking older clients.

## Data and Contract Additions

- Extend body/contact payloads (additive only) with fields needed for chart/flight parity:
  - body class/type render profile key,
  - canonical radius and orbit metadata,
  - parent/host relationships,
  - stable chart anchor coordinates.
- Add optional local-target intent status fields for UI feedback.
- Add optional audio metadata fields for deterministic timing:
  - `flight_phase`,
  - `transition_started_at`,
  - `audio_event_hints[]`.

## Implementation Sequence

0. Finalize canonical celestial contract and consistency invariants.
1. Complete deterministic body generation + persistence checks.
2. Implement/verify station-near-planet placement policy.
3. Build interactive 3D system chart foundation.
4. Wire cross-view selection and local target actions (planet/moon/station).
5. Implement shared flight-phase state machine + audio event dispatcher.
6. Add in-system navigation status and feedback (including SFX events).
7. Add tests for determinism, consistency, interaction, and audio event
  sequencing.
8. QA and tuning pass for readability, usability, and physical
  believability.

## Acceptance Criteria

- Systems render stars/planets/moons/stations with deterministic type-accurate visuals.
- Re-entering same system reproduces same physical layout and identities.
- Stations are typically near planetary bodies per policy.
- Player can select planets/moons/stations and initiate local navigation actions.
- Interactive 3D chart is usable for planning and precise target selection.
- Scanner, chart, system map, and flight view remain data-consistent.
- Audio cues follow deterministic flight/jump phases with no duplicate
  trigger spam in normal usage.
- Accessibility settings can reduce or suppress non-critical audio cues
  without breaking navigation feedback.
- Frontend lint/tests pass; targeted backend tests pass.

## Risks and Mitigations

- Risk: Visual style drift from canonical body data.
  - Mitigation: deterministic render profile mapping from backend fields only.
- Risk: Cross-view desync of selected/targeted object.
  - Mitigation: shared selection source of truth + consistency tests.
- Risk: Dense-system chart interaction becomes noisy or slow.
  - Mitigation: LOD, prioritization, and interaction throttling.
- Risk: Believability suffers if orbital values feel arbitrary.
  - Mitigation: explicit validation rules and physically coherent generation bands.
