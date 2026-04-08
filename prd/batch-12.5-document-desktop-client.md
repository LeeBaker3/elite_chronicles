# Batch 12.5 Implementation Plan — Desktop Client Parallel Track

Date: 2026-03-12  
Owner: Product + Backend + Frontend + Desktop

## Objective

- Add a Python desktop client using Panda3D that runs in parallel with the
  existing web client.
- Bring the desktop client up to functional parity with the gameplay and
  interaction scope delivered across Batches 01-12.
- Preserve the current FastAPI backend as the authoritative simulation layer
  and keep web-client behavior working throughout the rollout.
- Keep all persistent simulation, world-state authority, and multiplayer
  synchronization on the server while the desktop client owns rendering,
  camera, input, and scene presentation.
- Establish explicit design-governance rules for backend, web, and desktop
  runtime responsibilities so future batches do not re-document the same
  systems three times.
- Favor implementation decisions that improve the desktop client as the
  long-term primary runtime, while keeping the backend authoritative and the
  web client operational through compatibility changes where needed.

## Why This Batch Next

- The project now has enough backend authority and frontend contract maturity
  to support a second client without changing the simulation architecture.
- The current web client already proves the backend contract for auth, player
  state, trading, comms, flight, scanner, local chart, galactic navigation,
  and audio hints. That makes this the right point to add a richer desktop
  renderer rather than redesigning the server.
- Rendering, input feel, camera control, and immersion are now the main gaps
  relative to the intended product direction, not core simulation coverage.
- If desktop work starts without a documented contract boundary, the codebase
  will drift into web-only assumptions and duplicated client logic.

## PRD Alignment (Required)

Every batch plan must align to `prd/prd.md`.

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Shared auth/session and player bootstrap in desktop client | 5.1, 5.2, 5.14 | Player login and persistent state restore | Desktop must reuse existing backend auth and player-state contracts |
| Ship telemetry, flight, jump, docking, and recovery parity | 5.3, 5.3.1, 5.13, 5.14 | Persistent ship state and travel flow | Backend remains authoritative; desktop is presentation plus input only |
| Tactical scanner, local chart, and galactic chart parity | 5.3.2, 5.7, 5.14 | Navigation clarity and local awareness | Desktop must consume the same contact and chart identities as web |
| Trade, stations, and location service parity | 5.6, 5.7, 5.14 | Trade loop and location differentiation | Preserve station-services workflow through shared APIs |
| Comms parity | 5.9, 5.14 | Local and delayed communication workflows | Desktop should not invent a separate comms transport |
| Audio and feedback parity | 5.12, 5.14 | Clear user feedback and safe fallbacks | Reuse canonical event taxonomy from Batch 12 |
| Platform-governance and client-boundary clarification | 1.1, 3, 5.13 | Product-direction and persistence architecture | PRD currently under-specifies a multi-client product |

### PRD Update Needed

Yes. The current PRD still describes the product as browser-based and does not
explicitly define a multi-client architecture.

Proposed PRD edits:

- Summary:
  - Replace "browser-based, multiplayer space trading and exploration game"
    with "multi-client space trading and exploration game with a web client and
    a desktop client sharing one authoritative backend".
- 1.1 Goals:
  - Add "Support multiple first-party clients against a shared authoritative
    backend, beginning with web and Panda3D desktop clients".
- 3 Product Pillars:
  - Expand immersion language to allow platform-specific presentation while
    preserving shared simulation authority.
- 5 Functional Requirements:
  - Add a client-platform note stating that web and desktop clients may differ
    in presentation and controls but must use shared backend contracts for
    simulation state.
- 5.14 User Stories and Acceptance Criteria:
  - Add a story that a player can use either first-party client to access the
    same persistent commander, ship state, and world data without client-driven
    simulation divergence.

## Core Design Alignment (Required)

Every batch plan must align to long-lived core system design docs in
`prd/design/`.

### Design Doc References

- Canonical index: `prd/design/core-system-design-index.md`
- Existing impacted design docs:
  - `prd/design/core-auth-design.md`
  - `prd/design/core-player-state-design.md`
  - `prd/design/core-flight-navigation-design.md`
  - `prd/design/core-economy-market-design.md`
  - `prd/design/core-stations-locations-design.md`
  - `prd/design/core-comms-design.md`
  - `prd/design/core-audio-sfx-design.md`
- New design docs required before or alongside implementation:
  - `prd/design/core-client-platform-contract-design.md`
  - `prd/design/frontend-web-runtime-design.md`
  - `prd/design/frontend-desktop-runtime-design.md`

### Design Alignment Rules

- Backend authority and API contract rules belong in shared backend/core
  design docs, not in duplicated platform documents.
- Web and desktop runtime behavior should be documented separately where
  input, rendering, asset, scene, or UX behavior diverges.
- Shared domain rules such as contact identity, world-coordinate authority,
  flight phase meanings, and audio event naming must stay in shared core docs.
- If a design rule is platform-specific, the shared design doc should link to
  the runtime doc rather than absorb platform-only implementation detail.

## Execution Status Update (2026-03-13)

Status: In Progress

### Implemented in This Iteration

- [x] Desktop-client direction reviewed against current backend and web-client
  architecture.
- [x] Scope intent confirmed: near-complete parity for Batches 01-12, not a
  narrow prototype.
- [x] Design-governance need identified: current docs are not yet structured
  for backend plus web plus desktop evolution.
- [x] Shared contract audit materially advanced across auth, player bootstrap,
  ship bootstrap, local contacts, local chart, jump planning, navigation
  intent, and backend-owned flight snapshot/control surfaces.
- [x] Backend contract tests and desktop adapter tests cover the current
  cross-client bootstrap and smoke-critical status/error semantics.
- [x] Desktop scaffold now includes a CLI, saved-session bootstrap, typed HTTP
  adapters, and a scripted smoke path instead of scaffold-only placeholders.

### Remaining / Follow-up

- [x] Create the shared backend/core and platform runtime design docs.
- [x] Audit existing backend contracts and add contract tests before any shared
  client-model extraction.
- [x] Scaffold the desktop client package and local developer workflow.
- [ ] Harden the thin desktop bootstrap around `flight-snapshot` plus
  snapshot-compatible local contacts/chart reads.
- [ ] Deliver parity workstreams in phased slices without breaking web-client
  behavior.

## Readiness Checklist (Pre-Implementation Gate)

- [x] Desktop runtime root path is decided and reserved in the repository as
  `desktop/`.
- [x] Panda3D version, Python version, and local environment bootstrap steps
  are documented.
- [x] Auth/session handling rules for desktop are agreed.
- [x] Shared client contract strategy is chosen.
- [x] Floating-origin policy is documented against existing backend world-space
  authority rules.
- [x] Asset strategy for desktop placeholders versus production art is defined.
- [x] Validation matrix covers backend, web regression, and desktop smoke flow.

## In Scope

### 1) Parallel Client Architecture

- Add a new Python desktop client that talks to the existing FastAPI backend.
- Keep the web client operational; this batch does not replace it.
- Repository placement is locked as a top-level sibling app:
  - `backend/`
  - `frontend/`
  - `desktop/`
  - `prd/`
- Keep all authoritative simulation on the server:
  - world coordinates,
  - player position,
  - ship state,
  - travel state,
  - economy,
  - comms,
  - multiplayer-visible state.
- Limit desktop authority to:
  - rendering,
  - camera,
  - player input,
  - scene management,
  - floating-origin presentation transforms,
  - local audiovisual feedback.

### 2) Batch 01-12 Functional Parity Target

- Authentication and commander bootstrap parity.
- Player and ship-state parity.
- Trade/station workflow parity.
- Comms parity.
- End-to-end dock -> undock -> flight -> jump -> dock loop parity.
- Flight-scene traffic and station presentation parity.
- Celestial and scanner contact parity.
- Docking/undocking and collision-safety parity.
- Local chart and galactic chart parity.
- Audio event and settings parity using the existing canonical event-key model.
- Desktop scope for this batch stops at Batch 01-12 plus client-platform
  groundwork.
- Story and mission surfaces remain out of scope for the first desktop slice
  even though the backend and web client continue to support them.

### 3) Desktop Flight Runtime

- Implement Panda3D scene graph ownership for stars, planets, moons, stations,
  traffic ships, and player ship presentation.
- Implement a floating-origin renderer where the player ship remains near local
  origin while server coordinates remain absolute.
- Preserve the existing contact identity contract:
  - canonical ID is `<contact_type>-<numeric_id>`.
- Use backend relative/world coordinate data as the authority source.
- Do not generate client-only simulation state for orbital placement,
  ship authority, or travel resolution.

### 4) Desktop UX and Control Layer

- Desktop-specific UX is allowed, but gameplay workflows must remain legible
  against the same backend states used by the web client.
- Keyboard and mouse baseline is required in this batch.
- Input mapping, pause/focus behavior, and camera modes must be explicitly
  documented.
- If desktop diverges from web UI structure, terminology and state meanings
  must still match the shared domain model.

### 5) Shared Contract and Developer Workflow

- Define one documented strategy for sharing or synchronizing request/response
  models between web and desktop clients.
- Short-term decision:
  - use separate web and desktop adapters with contract tests guarding shared
    backend payloads and status/error semantics.
- Medium-term decision:
  - extract shared typed models only after desktop parity work proves which
    payloads and normalization rules are stable.
- Prefer additive backend changes only when a real client parity blocker is
  found.
- Add local developer startup instructions for backend plus desktop smoke flow.
- Define desktop smoke test expectations for login, system load, flight, chart,
  trade, and audio settings.

### 6) Validation

- Backend regression coverage must continue to pass.
- Existing web validation must continue to pass.
- Desktop must gain smoke or targeted automated checks where practical.
- Manual QA must include same-scenario parity checks across web and desktop for
  key Batches 01-12 behaviors.

## Out of Scope (Explicit)

- Replacing the web client.
- Moving simulation authority into Panda3D client code.
- Forking backend APIs into web-only and desktop-only variants without strong
  justification.
- Production installer/updater pipeline in the first slice.
- Full combat expansion beyond the currently delivered Batch 01-12 baseline.
- Full continuous orbital mechanics simulation.
- Console controller support unless explicitly added as follow-up scope.

## Sound Effects / Audio Feedback (Required)

No new event taxonomy is required. The desktop client should reuse the
canonical Batch 12 event naming model and map it onto Panda3D-capable playback
surfaces.

- `ops.*`, `trade.*`, `comms.*`, `flight.*`, `scanner.*`, `chart.*`,
  `collision.*`, `admin.*`
  - Trigger: same gameplay moments already defined in Batch 12 and the core
    audio design docs.
  - Cooldown: preserve event-level anti-spam behavior equivalent to current
    frontend policy.
  - Channel: preserve logical category routing even if the desktop mixer
    implementation differs.

Validation criteria:

- Desktop does not invent renamed event keys for already-defined gameplay
  actions.
- Audio disable/reduced-audio behavior does not block gameplay.
- Shared gameplay actions fire semantically equivalent cues across web and
  desktop even if asset implementation differs.

## Supporting Functionality Required

### Backend Systems

- Preserve current auth, player, ship, trade, comms, and systems APIs.
- Keep story and mission APIs working for backend/web, but do not treat them as
  required parity scope for the first desktop slice.
- Audit for client assumptions that are currently encoded only in the web app.
- Add additive metadata only where desktop parity cannot be achieved cleanly
  from the current contract.
- Add client-platform diagnostics where useful, such as `client_platform` in
  observability/logging contexts.

### Frontend-Web Systems

- Remain operational during the transition to desktop parity.
- Accept minor compatibility changes or middleware where needed so long-term
  architecture can favor the desktop runtime without changing backend
  authority.
- Avoid embedding contract rules only in page-level UI logic where desktop
  also needs them.
- Extract shared contract or state-resolution helpers when that reduces drift.

### Frontend-Desktop Systems

- New desktop package layout should remain modular, for example:
  - `desktop/pyproject.toml`
  - `desktop/README.md`
  - `desktop/desktop_client/main.py`
  - `desktop/desktop_client/network_client.py`
  - `desktop/desktop_client/session_store.py`
  - `desktop/desktop_client/scene_manager.py`
  - `desktop/desktop_client/system_renderer.py`
  - `desktop/desktop_client/ship_controller.py`
  - `desktop/desktop_client/floating_origin.py`
  - `desktop/desktop_client/audio_router.py`
  - `desktop/desktop_client/ui/`
- Network layer must reuse backend request/response semantics rather than
  screen-scraping or browser-specific assumptions.
- Scene layer must support large-distance rendering through floating origin and
  LOD policy.
- Control layer must separate input intent from backend-authoritative state.
- Desktop flight integration should target an intent-oriented adapter boundary.
- If the current backend still requires lower-level flight endpoints such as
  `flight-state` or `position-sync`, wrap them behind a desktop adapter and do
  not treat them as the long-term cross-client contract.

### Observability and Operations

- Add logs/telemetry that make web and desktop sessions comparable.
- Log desktop parity failures as contract mismatches, not generic render bugs.
- Record backend errors with enough client-platform context to isolate whether
  a failure is web-specific, desktop-specific, or contract-wide.

## Data and Contract Additions

- Preferred approach: no breaking API changes.
- Candidate additive work if required:
  - shared generated or hand-maintained client data models,
  - explicit client-safe auth/session refresh guidance,
  - explicit render-hint metadata where the web client currently relies on
    hardcoded assumptions,
  - observability fields identifying first-party client platform.
- Coordinate rules:
  - backend absolute coordinates remain authoritative,
  - desktop floating-origin coordinates are presentation-only,
  - desktop must compute local transforms from authoritative backend state.

## Implementation Sequence

0. Readiness and documentation lock
- Approve desktop-client scope and PRD delta.
- Create shared backend/core plus platform runtime design docs.
- Repository placement locked at `desktop/`.
- Decide Python version, Panda3D version, and local run workflow.

1. Contract audit and shared model strategy
- Inventory current Batch 01-12 backend endpoints used by the web client.
- Identify rules currently hidden in page-level web code.
- Implement contract tests for the shared payloads and runtime-critical status
  handling used by both clients.
- Keep separate web and desktop adapters for the first slice.
- Revisit shared typed-model extraction only after the parity slice stabilizes.

Current status:
- Completed for the current bootstrap-critical surface.
- Recent work replaced browser-owned manual position sync with
  backend-owned flight control plus `flight-snapshot` refresh guidance, which
  narrows the long-term desktop adapter boundary.

2. Desktop scaffold
- Create the desktop client package, app bootstrap, config loading, auth
  session storage, and backend connectivity path.
- Add a minimal scene loop and error-safe startup flow.

Current status:
- Base scaffold is present in `desktop/`.
- Immediate next slice is to keep the bootstrap path thin and authoritative:
  `players/me` -> `ships/{ship_id}/flight-snapshot` -> snapshot-compatible
  `local-contacts` / `local-chart`.

3. Core gameplay parity pass
- Implement auth, player bootstrap, ship fetch, station and market flows,
  comms, and end-to-end trade loop support.
- Exclude story and mission UI/workflow work from this slice.

4. Flight and navigation parity pass
- Implement flight scene, scanner contacts, local chart, galactic chart,
  local targeting, jump flow, docking, undocking, and collision-aware flows.
- Prefer backend intent endpoints and keep any lower-level flight sync calls
  behind a desktop-only adapter boundary.

5. Floating-origin and rendering hardening
- Lock precision strategy, scene update cadence, LOD policy, and large-scale
  rendering rules for planets, stars, stations, and nearby ships.

6. Audio and settings parity pass
- Reuse canonical event taxonomy and implement desktop settings for audio
  enablement and volume categories.

7. Validation and rollout guardrails
- Run backend regression, web regression, and desktop smoke validation.
- Use the Batch 12.5 contract-test matrix to define the minimum pre-desktop
  compatibility checks:
  - `prd/batch-12.5-contract-test-matrix.md`
- Document any contract gaps before adding backend fields.

Current status:
- Backend targeted regression, frontend lint, and desktop tests are green after
  the backend-owned flight-control migration.
- The next validation expansion should keep one scripted desktop smoke path as
  the required guardrail before broader parity work.

## Acceptance Criteria

- [ ] A desktop client can authenticate against the existing backend and load
  the current player and ship state without a desktop-specific backend fork.
- [ ] The thin desktop bootstrap path consumes `flight-snapshot` plus
  snapshot-compatible local contacts/chart reads without relying on deprecated
  browser-owned position sync semantics.
- [ ] The desktop client can complete the Batch 04 trade/flight loop using the
  same backend workflows as the web client.
- [ ] Desktop flight/scanner/local-chart/galaxy-chart flows consume the same
  stable contact identities and coordinate-authority rules documented in core
  design docs.
- [ ] Floating-origin rendering keeps the player near local origin in client
  space while preserving authoritative backend world coordinates unchanged.
- [ ] The existing web client remains functional and regression validation does
  not fail because of desktop-client introduction.
- [ ] Audio events and settings follow the canonical Batch 12 naming and
  fallback policy.
- [ ] New design docs clearly separate shared backend authority from web-only
  and desktop-only runtime concerns.

## Risks and Mitigations

- Risk: Desktop implementation duplicates business rules that already live in
  web-only code.
  - Mitigation: perform contract audit first and extract shared rules where
    justified.

- Risk: The PRD and design docs stay web-centric, causing future desktop work
  to drift without governance.
  - Mitigation: create shared/backend plus runtime-specific design docs before
    major implementation.

- Risk: Floating-origin implementation hides coordinate-authority mistakes.
  - Mitigation: explicitly test server absolute coordinates against desktop
    local transforms and log mismatches.

- Risk: Panda3D rendering and asset pipelines create scope blowout before core
  parity is proven.
  - Mitigation: use placeholder-safe assets and lock the first slice to
    functional parity before art polish.

- Risk: Auth/session handling differs subtly between browser and desktop.
  - Mitigation: document token/session storage, expiry handling, and relogin
    behavior as first-class design work.

- Risk: Near-complete Batch 01-12 parity is too large for one implementation
  push.
  - Mitigation: execute in sub-phases under this batch plan and keep explicit
    parity checkpoints.

## Test and Validation Evidence

Planned validation commands:

- `backend`: `cd backend && ../.venv/bin/python -m pytest -q`
- `frontend`: `cd frontend && npm run lint`
- `frontend targeted`: targeted vitest for flight/chart/scanner flows as needed
- `desktop`: developer smoke run command to be defined when scaffold is added
  around the required path:
  `login -> load player -> load ship -> undock -> local contacts/chart -> jump -> dock -> trade`

Known environment limitations:

- Full Panda3D gameplay runtime and packaging workflow are not yet present in
  the repository beyond the current scaffold.
- Desktop automated test strategy is not yet defined and must be established as
  part of implementation readiness.

## Documentation Update Checklist

- [x] `prd/prd.md` reviewed for alignment.
- [x] `prd/design/core-system-design-index.md` reviewed for impacted docs.
- [x] `prd/prd.md` updated to describe a multi-client product.
- [x] New shared backend/core and platform runtime design docs created.
- [x] `prd/design/core-system-design-index.md` updated with any new design doc
  rows required.
- [x] Batch plan updated with current execution status.
- [x] `README.md` updated with desktop client structure and startup guidance.
- [x] `backend/README.md` updated if backend contract or local env guidance
  changes.

## Missing Considerations Raised During Review

- The prompt assumes API reuse, but the repository currently has no formal
  shared client SDK or generated schema layer. The chosen short-term answer is
  separate runtime adapters plus contract tests, with shared typed models
  deferred until the contract stabilizes.
- Desktop auth/session storage is temporarily allowed to use plaintext local
  persistence for development only; production desktop secure storage remains a
  release-readiness requirement.
- Story and mission workflows are intentionally out of scope for the first
  desktop slice even though the backend and web client continue to support
  them.
- Desktop flight should move toward a stricter intent-oriented boundary rather
  than turning the current low-level flight sync surface into a permanent
  shared-client contract.
- The shared contract is now moving in that direction: desktop/web should treat
  `flight-snapshot` and backend-owned control/intents as the durable boundary,
  with any legacy lower-level endpoints kept adapter-local only.
- The current PRD/design stack is system-oriented, not platform-oriented; that
  is good for shared rules, but it needs runtime-layer docs so platform
  implementation detail has somewhere clean to live.
