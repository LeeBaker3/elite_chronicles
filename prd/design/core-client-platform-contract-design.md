# Core System Design — Client Platform Contract and Authority

Status: Active  
Last Updated: 2026-03-12  
Owners: Product + Backend + Frontend + Desktop

## Objective

- Define the shared backend/core contract rules that every first-party client
  must obey.
- Keep authoritative simulation, identity, state semantics, and event
  taxonomies stable across web and desktop runtimes.
- Prevent client divergence by documenting which behaviors are shared domain
  rules versus runtime-specific presentation choices.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Multi-client authority model | 5.0, 5.13, 5.14 | Shared persistent state across clients | Backend remains authoritative |
| Auth, player, and ship contract reuse | 5.1, 5.2, 5.3, 5.14 | Same commander and ship state regardless of client | No client-specific gameplay forks |
| Shared contact identity and coordinate meaning | 5.3, 5.3.1, 5.3.2, 5.7, 5.14 | Stable navigation and flight semantics | Shared IDs, phases, and coordinate rules |
| Shared error and event taxonomy discipline | 5.12, 5.14 | Predictable client behavior and diagnostics | Additive-only contract evolution |

### PRD Update Needed

- None. `prd/prd.md` now includes the multi-client product direction and the
  client-platform architecture baseline.

## System Scope

### In Scope
- Authority boundaries between backend and first-party clients.
- Shared identity formats, coordinate meanings, state semantics, and event
  naming.
- Shared error-envelope expectations and additive contract policy.
- Contract reuse across web and desktop clients.

### Out of Scope
- Browser-only layout or input behavior.
- Panda3D-only scene/camera/control implementation details.
- Renderer asset pipelines except where they affect shared contract meaning.

## Domain Model

- Authoritative backend domains:
  - auth/session state,
  - player identity and location,
  - ship state,
  - world coordinates,
  - economy,
  - comms,
  - story state,
  - admin/ops state.
- Shared identity invariants:
  - contact identity uses `<contact_type>-<numeric_id>`.
  - flight phases, target semantics, and snapshot metadata keep the same
    meanings across clients.
- Shared coordinate invariants:
  - backend absolute world coordinates are authoritative.
  - client-local transforms are presentation-only.
  - client floating-origin logic must derive from backend authority and must
    not redefine persistent world position.
- Shared event invariants:
  - gameplay event taxonomy remains additive and stable across clients,
    including canonical audio event keys.

## Runtime Behavior

- Backend is the only authority for persistent simulation outcomes.
- Clients may differ in how they render or collect input, but they must submit
  intent through shared backend APIs and interpret response fields using the
  same documented meanings.
- Shared contract changes must be additive by default.
- If a new client requires a backend field, prefer adding explicit metadata
  over encoding behavior in runtime-only heuristics.
- Runtime docs may refine platform behavior, but they may not redefine shared
  identity, authority, or state semantics.
- Platform-priority rule:
  - long-term implementation choices should favor the desktop runtime as the
    primary performance-sensitive client,
  - the web client may use compatibility middleware or minor workflow changes
    where needed, provided shared backend semantics remain intact.
- Short-term client-platform strategy:
  - web and desktop keep separate runtime adapters,
  - contract tests guard shared payload, status-code, and error-envelope
    behavior.
- Medium-term client-platform strategy:
  - shared typed models may be extracted after desktop parity work confirms
    which payloads and normalization rules are stable enough to centralize.
- Long-term flight-contract direction:
  - first-party clients should converge toward intent-oriented backend
    interactions,
  - lower-level flight synchronization endpoints may exist during transition,
    but they should not become undocumented shared contract truth.

## API and Data Contracts

- Shared contract surfaces include at minimum:
  - auth endpoints,
  - player-state endpoint,
  - ship-state and ship-operation endpoints,
  - local contacts,
  - local chart,
  - galactic chart and overview endpoints,
  - market and station endpoints,
  - comms endpoints,
  - story endpoints where applicable.
- Contract rules:
  - preserve status-code discipline,
  - preserve structured error envelopes,
  - preserve shared identity and snapshot metadata semantics,
  - do not fork request or response shapes by first-party client unless
    explicitly approved and documented.
- Contract-governance rule:
  - if a client needs adapter logic to normalize or sequence a shared workflow,
    capture that in contract tests and runtime docs rather than letting one
    client's implementation become hidden contract ownership.
- Shared event taxonomy rules:
  - canonical event names remain shared across clients,
  - platform runtimes may map them to different playback or presentation
    mechanisms without renaming the domain events.

## Failure Modes and Guardrails

- Risk: web-only helper logic becomes hidden contract truth.
  - Guardrail: elevate shared semantics into backend/core docs or shared helper
    modules when a second client depends on them.
- Risk: desktop floating-origin math masks authoritative coordinate mistakes.
  - Guardrail: log and test absolute-to-local transform consistency.
- Risk: clients drift on error handling or stale-state assumptions.
  - Guardrail: keep shared error-envelope and snapshot/version policies
    documented and testable.
- Risk: platform-specific docs redefine shared domain language.
  - Guardrail: platform docs must link back to this doc for authority rules.

## Observability and Operations

- Log client-platform context where useful for debugging.
- Keep backend logs able to compare the same action across web and desktop.
- Track contract mismatch failures, stale snapshot handling, auth expiry, and
  client-specific recovery paths separately.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_auth_starter_ship.py`
  - `pytest backend/tests/test_players_ships_markets.py`
- Frontend tests:
  - `cd frontend && npm run lint`
  - targeted scanner/chart/flight parity tests as implementation evolves
- Contract checks:
  - add cross-client contract tests for auth, player/ship bootstrap, local
    contacts, local chart, and key error/status handling before desktop parity
    scope expands
  - reference matrix:
    `prd/batch-12.5-contract-test-matrix.md`
- Manual checks:
  - compare the same player/ship workflow across web and desktop once desktop
    runtime exists

## Open Questions

- Whether first-party client platform should be surfaced in all request
  telemetry or only in diagnostic contexts.

## Batch Change Log

- 2026-03-12 — Batch 12.5 — Created shared client-platform contract and
  authority design doc for multi-client governance.
