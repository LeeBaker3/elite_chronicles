# Batch 22 Implementation Plan — Contact Coordinate Authority + Scanner/Chart/Flight Sync

Date: 2026-03-09  
Owner: Product + Backend + Frontend

## Objective

Stabilize contact rendering and distance behavior across the scanner, local chart, and flight scene so the same object keeps the same identity, distance meaning, and positional authority across all views.
- Remove coordinate-authority ambiguity between `relative_*_km`, `scene_*`, and frontend-only `presentation_*` fields.
- Ensure chart, scanner, and flight scene use one deterministic reconstruction path for the same contact.
- Eliminate visible jumps caused by mixed-unit fallback paths and stale cross-view refresh timing.
- Make docking distance semantics explicit and consistent between scanner UI and approach HUD.
- Preserve existing target/waypoint behavior while reducing hidden coupling between render-only and gameplay-authoritative coordinates.

## Why This Batch Next

- Recent investigation found concrete evidence that cross-view contact rendering is currently not governed by a single unambiguous authority model.
- The highest-risk defect is not cosmetic. It reduces player trust in travel, approach, and target selection by making planets, stations, and other contacts appear to move or change distance arbitrarily.
- Batch 09, Batch 10, and the current core flight design established identity parity and local-target workflows. This batch is the cleanup and hardening pass needed to make those systems reliable under active flight.
- This batch reduces regression risk before later combat, convoy, and multiplayer traffic work adds more moving contacts into the same rendering stack.

## PRD Alignment (Required)

Every batch plan must align to `prd/prd.md`.

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Coordinate authority contract cleanup | 5.3, 5.13, 5.14 | Ship persistence and recovery acceptance | Keep server/world position authority intact while fixing client reconstruction |
| Tactical scanner/chart/flight parity | 5.3.2, 5.14 | Scanner range and clarity acceptance | Scanner grid remains tactical while list/chart/flight use consistent geometry |
| Station and docking distance semantics | 5.7, 5.14 | Station navigation and docking flows | Clarify center distance vs docking-port distance |
| Local chart refresh and snapshot consistency | 5.3.2, 5.13, 5.14 | Stable local navigation UX | Avoid mixed snapshots across chart and scanner |
| Debuggability and telemetry guardrails | 5.11, 5.12 | Logs and monitoring stories | Add diagnostics for authority source, snapshot epoch, and fallback usage |

### Alignment Rules

- Reference exact PRD section numbers and keep scope tied to existing PRD requirements.
- This batch is implementation-hardening and contract cleanup; no PRD expansion is required if scope remains additive.

### PRD Update Needed

- None expected, unless a new persistent snapshot/version field becomes user-visible or part of documented API guarantees.

## Core Design Alignment (Required)

Every batch plan must align to long-lived core system design docs in `prd/design/`.

### Design Doc References

- Canonical index: `prd/design/core-system-design-index.md`
- Impacted design docs:
  - `prd/design/core-flight-navigation-design.md`
  - `prd/design/core-stations-locations-design.md`
  - `prd/design/core-system-design-index.md`

### Design Alignment Rules

- The current flight design doc already states that `relative_*_km` is canonical and `scene_*` is fallback only.
- This batch must either bring implementation fully into line with that rule or revise the design doc to describe the real multi-layer coordinate model more explicitly.
- Any threshold-based split between near-field physical rendering and far-field presentation rendering must be documented as a first-class rule, not left implicit in frontend heuristics.

## Execution Status Update (2026-03-09)

Status: Implemented and validated (targeted)

### Implemented in This Iteration

- [x] Batch plan drafted from verified code-review findings.
- [x] Open scope decisions collected from product/implementation owner.
- [x] Backend scanner and local-chart payloads now emit shared snapshot metadata.
- [x] Frontend scanner/chart merge now rejects incompatible snapshots.
- [x] Local-chart anchoring now uses canonical `relative_*_km` resolution.
- [x] Celestial anchors now render from physical ship-relative km for this batch.
- [x] Focused docking approach UI now labels `SURFACE` versus `PORT` distance mode explicitly.
- [x] Root/backend README notes and changelog entries now document snapshot compatibility fields and docking-distance labeling behavior.
- [x] Targeted backend/frontend regressions passed after implementation.

### Remaining / Follow-up

- [ ] Execute the manual QA checklist in `prd/batch-22-contact-coordinate-authority-sync-qa-checklist.md` and record before/after evidence for the original “contacts jump around” repro path.
- [ ] Make an explicit contract decision on docking distance mode after manual QA: keep the current frontend-derived `PORT`/`SURFACE` labeling model, or add backend-visible `distance_mode` metadata in a follow-up if cross-surface drift/debuggability still needs server-side exposure.

## Readiness Checklist (Pre-Implementation Gate)

- [x] Coordinate authority model is chosen and written down in one place.
- [x] Distance semantics for docking mode are explicitly approved.
- [x] Refresh/snapshot policy between scanner and chart is defined.
- [x] Far-field celestial rendering strategy is agreed.
- [x] Impacted design docs are identified and linked.
- [x] Validation strategy and manual QA scenarios are documented.
- [x] Risk rollback path is defined for marker/chart regressions.

## In Scope

### 1) Coordinate Authority Contract
- Define one canonical meaning for each layer:
  - `position_*`: absolute world coordinates
  - `relative_*_km`: canonical ship-relative coordinates
  - `scene_*`: backend compressed fallback coordinates
  - `presentation_*`: frontend presentation-only positions if retained
- Remove mixed-unit interpretation in chart anchoring and any other reconstruction path.
- Ensure every fallback path is explicit about unit type and intended use.

### 2) Cross-View Position Reconstruction
- Unify how chart, scanner HUD, flight markers, and flight celestial anchors derive contact positions.
- Eliminate cases where the same contact is rendered from station-inverse math in one view, raw relative km in another, and synthesized presentation scaling in a third.
- Use true ship-relative km for celestial anchors across flight-facing surfaces in this batch.
- Remove dead or misleading presentation-only paths that imply a compressed celestial layout while runtime rendering still prefers canonical relative km.

### 3) Refresh and Snapshot Consistency
- Make scanner and local chart refresh behavior coherent during active flight.
- Keep the local chart event-driven in this batch rather than polling it at scanner cadence.
- Add a shared snapshot/version/epoch strategy so the frontend can detect when chart and scanner payloads came from different world states.
- Prevent chart refresh lag from making the same contact appear to shift between chart and scanner after ship movement or local transfer by rejecting or deferring mismatched snapshots.

### 4) Distance Semantics Cleanup
- Standardize which UI surfaces show:
  - contact center distance,
  - station surface distance, and/or
  - docking-port distance.
- Keep scanner list values stable and readable on center/surface semantics while allowing focused docking approach UI to show docking-port distance.
- Make the distance-mode difference explicit in code and UI labels/tooling so the two readouts do not look like accidental disagreement.

### 5) Observability and Guardrails
- Add diagnostics for:
  - authority source chosen for a rendered contact,
  - fallback usage frequency,
  - chart/scanner snapshot mismatch,
  - docking distance mode.
- Make it straightforward to debug “why did this contact move” from logs or client debug output.

### 6) Validation
- Backend tests for consistent contact contract shape and snapshot/version fields.
- Frontend tests for chart/scanner/flight parity and no mixed-unit fallback.
- Manual QA across station approach, local transfer to celestial targets, scanner range changes, docking approach, and chart target selection.

## Out of Scope (Explicit)

- Full orbital mechanics simulation or continuously advancing celestial orbits.
- Major visual redesign of the scanner or chart UI.
- Combat-flight balancing, NPC traffic AI, or convoy behavior.
- Replacing the entire flight scene render architecture unless needed later as follow-up work.

## Sound Effects / Audio Feedback (Required)

No new audio event family is required for the core fix. Existing flight/docking cues remain in place.

If UI clarification is added for distance-mode transitions, reuse existing event categories rather than adding a new sound taxonomy in this batch.

Validation criteria:
- No duplicate or misleading audio cue should trigger solely because chart/scanner contact authority changes internally.
- Docking approach audio should remain tied to flight phase, not to internal coordinate-source switches.

## Supporting Functionality Required

### Backend Systems
- Optional additive contact snapshot/version field on scanner and local-chart responses.
- Clear contract helpers for coordinate-source semantics and any far-field presentation threshold if backend participates.
- Stable distance-mode metadata where docking-specific distances are exposed.

### Frontend Systems
- Single coordinate-source resolver used by chart, scanner fallback, waypoint markers, and celestial anchors.
- Shared snapshot merge behavior for scanner contacts and local chart data.
- Explicit UI handling for docking distance mode if center vs port semantics remain different.
- Debug-only instrumentation path for contact authority/fallback tracing.

### Observability and Operations
- Structured logs or debug traces for selected contact authority source.
- Regression fixtures covering station, planet, moon, star, and ship contacts.
- Manual QA checklist for “contact moves unexpectedly” scenarios.

## Data and Contract Additions

- Additive only.
- Candidate additions:
  - `snapshot_version` or `snapshot_generated_at` on scanner and local-chart payloads
  - explicit `distance_mode` on backend contact payloads where needed
  - optional `coordinate_mode` metadata if the contract needs to distinguish physical vs presentation positions
- Compatibility constraints:
  - existing fields remain present during migration
  - old clients must not break if new metadata is ignored
  - no silent semantic shift of existing fields without design-doc update

## Scope Decisions Locked for Batch 22

- Far-field rendering: true physical ship-relative km everywhere in this batch.
- Docking distance policy: stable scanner list distance plus focused docking-port distance is allowed, but the mode split must be explicit.
- Chart refresh policy: local chart remains event-driven, gated by shared snapshot/version metadata rather than high-frequency polling.
- Precision scope: keep integer-km contact coordinates for this batch; sub-kilometer precision is a follow-up candidate, not a Batch 22 requirement.

## Implementation Sequence

0. Readiness and design lock
- Confirm authority model, docking distance policy, and refresh strategy.
- Update `prd/design/core-flight-navigation-design.md` with final rules before or alongside code changes.

1. Backend contract work
- Add snapshot/version metadata to scanner and local-chart endpoints.
- Expose any required distance-mode or coordinate-mode metadata explicitly.
- Ensure tests lock down contact identity, canonical relative coordinates, and additive response compatibility.

2. Frontend authority resolver
- Introduce one shared resolver for contact position authority.
- Remove mixed-unit inverse scaling fallback from chart anchoring and equivalent paths.
- Make celestial anchor rendering follow the chosen physical ship-relative rule and remove misleading dead-path presentation fallbacks where appropriate.

3. Refresh coordination
- Coordinate scanner and local-chart refresh logic during active flight and post-transfer/post-docking transitions.
- Reject or defer mixed snapshot application when payload versions do not match.

4. Distance semantics UX
- Clearly label docking-port vs center/surface distance behavior rather than forcing one unified value everywhere.
- Ensure focused target UI and scanner list do not appear contradictory.

5. Validation and docs
- Add regression tests.
- Update core design docs and batch status.
- Record manual QA evidence.

## Concrete Task Checklist

### Backend Slice

- [x] Add shared snapshot metadata to `GET /api/ships/{ship_id}/local-contacts`.
- [x] Add matching snapshot metadata to `GET /api/systems/{system_id}/local-chart`.
- [x] Decide whether snapshot metadata is version-only, timestamp-only, or both, and document the contract.
- [ ] Add explicit distance-mode metadata only if post-fix manual QA shows frontend-derived mode labeling is insufficient for consistency, observability, or future API consumers.
- [x] Add tests covering additive compatibility of new scanner/local-chart fields.
- [x] Add tests proving contact IDs and canonical `relative_*_km` remain stable after contract expansion.

### Frontend Slice

- [x] Introduce one shared coordinate-authority resolver for chart/scanner/flight consumers.
- [x] Remove mixed-unit inverse station-scene fallback from local-chart anchored reconstruction.
- [x] Replace duplicated ad hoc fallback logic with explicit source-priority helpers.
- [x] Make celestial anchor rendering use the locked physical ship-relative path consistently.
- [x] Remove or repurpose dead `presentation_*`-driven celestial fallback paths so implementation matches documented intent.
- [x] Gate chart/scanner state application on shared snapshot compatibility.
- [x] Keep local chart event-driven, but reject or defer stale chart/scanner combinations.
- [x] Make docking distance mode explicit in the focused approach UI and any related labels/tooltips.
- [x] Preserve waypoint priority and selected-contact behavior while refactoring coordinate logic.

### Test Slice

- [x] Add frontend regression coverage for chart/scanner parity after active flight movement.
- [x] Add frontend regression coverage for local transfer to station, planet, moon, and star contacts.
- [x] Add frontend regression coverage for scanner range changes while telemetry remains active.
- [x] Add frontend regression coverage for docking distance-mode labeling and non-contradictory readouts.
- [x] Add backend tests for snapshot metadata presence and stability.
- [ ] Execute `prd/batch-22-contact-coordinate-authority-sync-qa-checklist.md` and attach before/after evidence for the core “contact jumps around” bug class.

### Documentation Slice

- [x] Update `prd/design/core-flight-navigation-design.md` to reflect the locked physical-rendering decision for this batch.
- [x] Update `prd/design/core-flight-navigation-design.md` to explicitly document snapshot gating between chart and scanner.
- [x] Update `prd/design/core-stations-locations-design.md` if docking distance semantics become part of location/station design behavior.
- [x] Update this batch plan status/checklists as implementation lands.

## Acceptance Criteria

- [x] A given contact renders from one documented coordinate authority path across chart, scanner, and flight scene for the same state snapshot.
- [x] Local chart anchoring no longer applies inverse station scene scaling to mixed-unit live telemetry.
- [x] Celestial anchors use documented physical ship-relative rendering in this batch, with no dead-path ambiguity from unused presentation fallback logic.
- [x] Scanner and local chart payloads expose enough metadata for the frontend to detect mixed snapshots.
- [x] During active flight, chart/scanner state does not visibly desync after ordinary movement, local transfer, or docking approach refreshes when snapshot metadata matches; mismatched payloads are not silently merged.
- [x] Docking-related distance displays are internally consistent or explicitly labeled by mode.
- [x] Waypoint priority behavior remains unchanged: docking target > local waypoint > locked contact > locked station ID.
- [x] Scanner grid behavior remains tactical-range bounded and is not regressed by the coordinate-authority cleanup.
- [x] Frontend lint and targeted regression suites pass.
- [x] Backend tests for contact contracts and snapshot metadata pass.

## Risks and Mitigations

- Risk: Fixing authority rules breaks current waypoint or docking visuals.
  - Mitigation: Add focused regression tests for waypoint priority, docking approach markers, and selected-contact persistence.
- Risk: Snapshot coordination adds UI latency or missed updates.
  - Mitigation: Use additive metadata first and fail open in debug builds before enforcing strict gating.
- Risk: Far-field celestial rendering decision expands scope.
  - Mitigation: Batch 22 is locked to physical ship-relative rendering; any future far-field presentation layer is a follow-up batch, not hidden scope growth here.
- Risk: Existing design doc language is too absolute for current render architecture.
  - Mitigation: Update the design doc and acceptance criteria in the same PR so implementation and docs remain aligned.

## Test and Validation Evidence

- Executed commands:
  - `backend`: `cd backend && set -a && source ./.env && set +a && PYTHONPATH=. ../.venv/bin/python -m pytest tests/test_players_ships_markets.py tests/test_systems_local_chart.py`
  - `frontend`: `cd frontend && npm run lint`
  - `frontend targeted`: `cd frontend && npm run test -- src/app/page.scanner-flight.test.tsx`
- Results:
  - backend targeted pytest: `51 passed in 19.35s`
  - frontend targeted vitest: `69 passed`
  - frontend lint: passed
- Manual validation scenarios:
  - transfer to star/planet/moon
  - station approach and docking distance readout
  - scanner range preset changes during active flight
  - chart/scanner consistency after position sync refreshes
- Manual QA artifact:
  - `prd/batch-22-contact-coordinate-authority-sync-qa-checklist.md`
- Environment notes:
  - backend targeted pytest requires `TEST_DATABASE_URL` from `backend/.env`
  - manual QA evidence is still pending capture

## Documentation Update Checklist

- [x] `prd/prd.md` reviewed for alignment.
- [x] `prd/design/core-system-design-index.md` reviewed for impacted docs.
- [x] `prd/design/core-flight-navigation-design.md` updated in this batch.
- [x] `prd/design/core-stations-locations-design.md` reviewed/updated if docking distance semantics change.
- [x] Batch plan updated with current status.
- [x] `CHANGELOG.md` updated when user-visible/dev-facing behavior changes.
- [x] `README.md` and/or `backend/README.md` updated if debug workflows or response contracts change.

## Open Questions / Follow-Up Candidates

1. If true physical ship-relative celestial rendering still proves visually unstable or unreadable after the contract cleanup, should a later batch introduce a documented far-field presentation layer?
2. If docking distance mode remains confusing after labeling, should a later batch unify all visible distance readouts to one basis?
3. If event-driven chart refresh plus snapshot gating still feels stale in playtests, should a later batch move chart refresh onto an active-flight cadence?
4. When combat/traffic density increases, does the contact contract need sub-kilometer precision for close-approach and collision-facing systems?
