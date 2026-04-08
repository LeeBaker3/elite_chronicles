# Frontend Runtime Design — Desktop Client

Status: Draft  
Last Updated: 2026-03-12  
Owners: Product + Desktop + Backend

## Objective

- Define Panda3D desktop runtime behavior for the planned first-party desktop
  client.
- Document desktop-specific scene, floating-origin, camera, input, and audio
  behavior without changing shared gameplay authority.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Desktop runtime as supported first-party client | 5.0, 5.14 | Same persistent commander and ship state | Desktop presentation differs, authority does not |
| Desktop flight rendering and navigation behavior | 5.3, 5.3.1, 5.3.2, 5.7, 5.14 | Flight, scanner, chart, and docking clarity | Panda3D runtime owns rendering and controls |
| Desktop audio, recovery, and error handling | 5.12, 5.13, 5.14 | Safe fallbacks and clear state restore | Desktop adapts shared event taxonomy |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Panda3D application bootstrap and scene ownership.
- Floating-origin rendering and large-scale local-space presentation.
- Desktop input mapping, camera behavior, UI shell, and audio routing.
- Desktop-specific recovery behavior and developer-run startup flow.

### Out of Scope
- Shared backend authority rules.
- Browser-specific behavior.
- Production packaging/distribution details unless later approved.

## Domain Model

- Desktop runtime state includes:
  - authenticated session/bootstrap state,
  - scene graph and render entities,
  - floating-origin transform state,
  - camera and control modes,
  - Panda3D audio routing and settings state,
  - desktop UI shell and debug overlays.
- Shared domain meaning for contacts, flight phases, targets, and events comes
  from backend/core docs.

## Runtime Behavior

- Desktop runtime is responsible for:
  - Panda3D app lifecycle,
  - backend connectivity and response handling,
  - scene graph updates,
  - player input collection,
  - camera behavior,
  - local transform recalculation from authoritative backend state,
  - desktop audio playback and settings routing.
- Desktop runtime is the preferred long-term first-party gameplay client.
- When implementation tradeoffs arise between web and desktop runtimes, prefer
  solutions that preserve backend authority and improve desktop performance,
  control feel, and rendering clarity; the web client may absorb compatibility
  adjustments where needed.
- Floating-origin policy:
  - player ship remains near local origin in client space,
  - world objects render relative to authoritative player position,
  - absolute backend coordinates remain unchanged.
- Floating-origin implementation policy:
  - use authoritative backend coordinates as the only source of truth,
  - derive desktop-local transforms from the latest accepted
    `flight-snapshot` ship position,
  - reset the local origin whenever camera precision or scene jitter would
    exceed desktop presentation tolerances,
  - never write rebased coordinates back to backend state.
- Desktop runtime may improve immersion, camera, and control feel, but it must
  not introduce local simulation authority for world-state outcomes.

## Floating-Origin Policy

- Authority boundary:
  - backend world coordinates stay absolute and authoritative,
  - desktop floating-origin coordinates are presentation-only,
  - input/control code may predict visuals locally but must reconcile against
    backend snapshots.
- Rebase trigger guidance:
  - rebase locally when camera precision, depth sorting, or scene jitter makes
    nearby interaction presentation unstable,
  - do not use rebasing as a gameplay event or state transition.
- Required diagnostics:
  - expose dev-only overlays or logs for authoritative ship position, local
    origin offset, and one representative contact transform,
  - log snapshot-version mismatches and absolute-to-local transform anomalies
    as contract/runtime issues.

## Placeholder Asset Strategy

- The first desktop slice should use placeholder-safe assets for ships,
  stations, celestial bodies, UI chrome, and audio feedback where production
  assets are not ready.
- Placeholder assets must:
  - preserve contact identity and class readability,
  - preserve scale/category cues needed for navigation and docking,
  - be replaceable without changing backend contracts or runtime logic.
- Production art integration must remain a separate concern from the initial
  contract/bootstrap and parity work.

## API and Data Contracts

- The desktop client uses the same backend APIs as the web client.
- Required contract behavior:
  - shared auth and player bootstrap semantics,
  - shared ship-state and navigation semantics,
  - shared `flight-snapshot` bootstrap and polling semantics,
  - shared contact identity and snapshot semantics,
  - additive compatibility for new fields,
  - shared error-envelope interpretation.
- Short-term implementation strategy:
  - keep separate desktop adapters for backend payloads and runtime workflows,
  - add contract tests for the payloads and status/error handling shared with
    the web client.
- Medium-term implementation strategy:
  - extract shared typed models only after desktop parity work proves which
    payloads and normalization rules are actually stable.
- Desktop runtime may add platform-specific adapter layers, but those adapters
  must preserve shared backend/core meanings.
- Desktop auth-storage rule:
  - local plaintext token persistence is acceptable for development-only
    bootstrap work,
  - production desktop releases must migrate to OS-backed secure credential
    storage.
- Flight-contract rule:
  - desktop should prefer intent-oriented backend actions as the long-term
    boundary,
  - desktop bootstrap should prefer `players/me` plus
    `ships/{ship_id}/flight-snapshot` before loading local contacts/chart,
  - desktop should prefer low-frequency `flight-snapshot` polling plus local
    interpolation over any per-frame backend sync pattern,
  - if temporary use of lower-level endpoints such as `flight-state` or
    `position-sync` is required, keep them behind a desktop adapter and do not
    bless them as the long-term shared-client contract,
  - backend-owned `flight-control` is acceptable as the bounded manual-flight
    control surface when intent-only APIs are not yet available.

## Failure Modes and Guardrails

- Risk: floating-origin bugs visually hide backend/world-coordinate problems.
  - Guardrail: validate absolute-to-local transform math and log mismatches.
- Risk: desktop-specific convenience logic becomes simulation authority.
  - Guardrail: keep intent submission separate from resolved backend state.
- Risk: Panda3D performance or asset gaps slow parity work.
  - Guardrail: start with placeholder-safe assets and explicit LOD budgets.
- Risk: session handling diverges from web behavior in undocumented ways.
  - Guardrail: document desktop auth storage, expiry handling, and reconnect
    flow as first-class runtime behavior.
- Risk: desktop hardcodes the web client's lower-level flight sequencing and
  locks in the current fragile surface.
  - Guardrail: isolate low-level flight calls behind the desktop adapter layer
    and keep the long-term direction intent-oriented.

## Observability and Operations

- Log desktop startup failures, auth failures, scene-load failures, contract
  mismatches, and floating-origin anomalies.
- Keep diagnostic data comparable with web runtime for shared gameplay flows.
- Add debug overlays or dev diagnostics for coordinate authority, target
  identity, and snapshot compatibility during implementation.

## Validation and Test Evidence

- Planned desktop checks:
  - developer smoke run for:
    `login -> load player -> load ship -> undock -> local contacts/chart -> jump -> dock -> trade`
- Minimum thin-bootstrap checks:
  - `players/me` resolves a usable commander and primary ship,
  - `flight-snapshot` resolves current system and refresh guidance,
  - `local-contacts` and `local-chart` can be loaded against the snapshot
    system and snapshot version,
  - docked and in-space bootstrap both choose the correct desktop scene.
- Shared checks that must remain green:
  - `cd backend && ../.venv/bin/python -m pytest -q`
  - `cd frontend && npm run lint`
- Manual checks:
  - compare one end-to-end trade/flight loop across web and desktop

## Open Questions

- Which desktop UI framework or in-engine UI approach should wrap Panda3D HUD
  and menu surfaces.

## Batch Change Log

- 2026-03-12 — Batch 12.5 — Created Panda3D desktop runtime design doc for
  scene, floating-origin, camera, input, and audio responsibilities.
- 2026-03-13 — Batch 12.5 — Filled floating-origin policy, placeholder asset
  strategy, and thin `flight-snapshot` bootstrap guidance for the desktop
  runtime.
