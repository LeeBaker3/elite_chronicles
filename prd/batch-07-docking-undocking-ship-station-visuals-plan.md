# Batch 07 Implementation Plan — Docking/Undocking Visuals + Cobra Mk I + Classic Station Art

Date: 2026-02-18  
Owner: Product + Frontend + Backend

## Objective

Deliver a visually coherent docking/undocking presentation with clear state authority:
- docked flight mode shows a station bay scene instead of active free-fly,
- in-space mode keeps active 3D flight controls,
- first ship visual target is Cobra Mk I,
- first station visual target is classic Elite-style Coriolis-inspired bay language.

## Execution Status Update (2026-02-18)

Status: ✅ Batch 07 complete

### Follow-up implementation update (2026-02-23)
- Added persistent ship archetype identity on ships (`ship_archetype_id`) and seeded Cobra Mk I baseline archetype.
- Added deterministic `render_seed` on ships/stations/celestial bodies for stable cross-session reconstruction.
- Migrated ship visual selection to archetype lookup (`ship_archetype_id -> ship_archetypes.key`) and removed name-derived inference.
- Added first renderer LOD budget guardrails in flight rendering:
  - Cobra traffic count cap by profile (`performance/balanced/cinematic`),
  - station render count cap by profile,
  - celestial mesh segment tiers by distance (`near/mid/far`).
- Added regression coverage for local-target transfer and archetype-driven visual-key behavior.

### Completed in this batch so far
- Docked/in-space state authority is telemetry-driven in the main flight UI.
- Flight mode while docked now renders a docked bay scene (not active free-fly).
- Additive visual contract fields are live from backend ship telemetry:
  - `ship_visual_key`
  - `docked_station_archetype_name`
  - `docked_station_archetype_shape`
- Docked bay rendering now branches by station archetype shape:
  - `coriolis`
  - `orbis`
  - `default` fallback for unknown shapes
- In-space station rendering now branches by station contact archetype shape (`coriolis` / `orbis` / `default`).
- Flight traffic now uses scanner ship contacts with `ship_visual_key` (fallback-safe) and nearest-station anchoring.
- Flight controls now support direct station docking (`Dock`) from flight mode using selected/target station context.
- Flight transit phases now include cinematic station tunnel sequences:
  - inbound: `docking-transit-internal`
  - outbound: `undocking-transit-internal`
- Transit cinematic sequencing is backend-safe:
  - dock/undock API remains source of truth,
  - frontend runs short transit phase lock to avoid telemetry race overrides.
- Flight scene now supports data-driven ship model registry usage across:
  - player ship model,
  - traffic ship model,
  - transit tunnel ship pass-through.
- Audio cues now include docking transit events:
  - `dock.transit_enter`
  - `dock.transit_exit`
- Cobra visual language is aligned across:
  - in-space traffic ships,
  - docked bay ship presentation.
- Tests now cover:
  - frontend `orbis` docked variant path
  - frontend unknown-shape fallback to `default`
  - backend `orbis` telemetry values
  - backend unknown-shape pass-through behavior

### Current expected player-visible behavior
- While **docked** and viewing Flight mode: you should see the docked bay presentation.
- While **in-space** and viewing Flight mode: you should see active 3D flight with archetype-driven station visuals and traffic ships.
- While in-space, players can dock at a station via flight controls (`Dock`) targeting the selected scanner station or current target station.
- On docking completion, players now see an inbound tunnel transit cinematic before returning to idle flight phase.
- On undock, players now see an outbound tunnel transit cinematic from station interior to clear-space flight.

### Remaining for later batches (post-07)
- Expand beyond Cobra Mk I to multiple ship archetype families.
- Introduce formal archetype persistence (`ship_archetype_id`, `render_seed`) for deterministic cross-session reconstruction.
- Add richer LOD/instancing budgets and visual asset pipeline migration.

## Why This Batch Next

Recent scanner/flight improvements exposed a UX gap:
- players can enter Flight while docked (intended),
- but docked presentation lacked a believable parked-ship scene,
- and asset/data contracts for ship-class/station-archetype visuals are still implicit.

This batch formalizes those contracts and upgrades visuals without introducing full asset pipelines prematurely.

## Current System Review (2026-02-18)

### Backend/Data Observations
- `ships` currently stores `name` and telemetry state, but no explicit `hull_model`/`ship_class` visual key.
- `station_archetypes` already stores `shape` (e.g., `coriolis`), which can drive station visual selection.
- Ship telemetry schema currently returns ship runtime stats and status, but not station archetype or explicit ship visual id.

### Frontend Observations
- Docked/in-space gating is now telemetry-authoritative.
- Docked Flight currently uses a stylized bay scene; this is a UI-only composition and not yet data-driven by archetype/model IDs.

## In Scope

### 1) Visual Contract Baseline
- Add additive fields for visual selection (no breaking changes):
  - ship visual key (e.g., `ship_visual_key`),
  - docked station archetype shape/key in relevant flight payload context.
- Keep existing API behavior backward compatible.

### 2) Cobra Mk I Visual Baseline
- Provide one canonical Cobra Mk I presentation for:
  - docked bay scene,
  - in-space player ship scene parity checks.
- Keep lightweight geometry/CSS-first approach for MVP.

### 3) Classic Station Bay Language (Coriolis-Inspired)
- Standardize bay visual primitives:
  - docking door aperture,
  - guide lights/lanes,
  - caution deck markings,
  - ambient bay glow.
- Ensure docked mode reads as “parked in bay,” not “flight-ready.”

### 4) State & Interaction Guardrails
- Docked state:
  - show bay view,
  - keep undock available,
  - disable in-space-only controls.
- In-space state:
  - show active flight scene,
  - disable station-only maintenance actions.

### 5) Validation
- Frontend tests for docked/in-space view switching.
- Backend tests for additive visual fields (if introduced this batch).
- Lint/tests green on both sides.

### 6) Docking/Undocking Transit Cinematics
- Implement transit-only flight phases for station tunnel presentation:
  - `docking-transit-internal`
  - `undocking-transit-internal`
- Keep backend API contract unchanged (`/dock`, `/undock` endpoints).
- Use additive frontend-only progress sequencing for cinematic timing.
- Ensure transit blocks conflicting actions (e.g., repeat undock/jump overlap).

## Out of Scope (Explicit)

- Full GLTF asset import pipeline.
- Multiple ship classes beyond Cobra Mk I.
- Multiple station art families beyond initial Coriolis baseline.

## API/Schema Notes

- Preserve existing ship endpoints and status/error discipline.
- Additive fields only; no removals/renames.
- Continue auth and ownership checks for flight/ship endpoints.

## Implementation Sequence

1. Define visual-key contract fields in backend schema/response.
2. Wire backend population of ship/station visual keys.
3. Map visual keys in frontend flight/docked renderer.
4. Improve docked bay composition with Cobra Mk I + Coriolis cues.
5. Add/adjust tests and run lint/test validation.

## Acceptance Criteria

- Flight mode while docked shows a docked-bay scene with Cobra Mk I baseline representation.
- Flight mode while in-space shows active flight rendering only.
- Players can dock at a station from flight controls by the end of Batch 07.
- Successful dock operation triggers inbound tunnel transit phase before idle.
- Successful undock operation triggers outbound tunnel transit phase before idle.
- Station-only actions are disabled in-space; in-space actions are disabled while docked.
- Visual selection path is data-contract ready (additive, backward compatible).
- Frontend lint/tests pass; targeted backend tests pass.

## Risks and Mitigations

- Risk: Overfitting visuals to a single hardcoded ship name.
  - Mitigation: introduce explicit visual key field and fallback mapping.
- Risk: Drift between backend archetype data and frontend rendering assumptions.
  - Mitigation: backend-provided visual/archetype keys as source of truth.
- Risk: Scope creep into full asset pipeline.
  - Mitigation: keep MVP to one ship + one station family with documented follow-ups.

## Deterministic Content System (Consistency + Rebuildability)

To guarantee ships/stations/planets always render the same way and can be recreated efficiently, use a two-layer model:

### 1) Persistent Archetypes (authoritative identity)
- Add canonical archetype tables (or equivalent configs):
  - `ship_archetypes` (`id`, `visual_key`, `silhouette_family`, `scale_profile`, `lod_profile`)
  - `station_archetypes` (already present; continue using `shape` + style metadata)
  - `planet_archetypes` (`id`, `class`, `palette`, `shader_profile`, `lod_profile`)
- Runtime entities reference archetypes by stable foreign keys (`archetype_id`) rather than inferred names.
- API responses always include stable render contract keys (`ship_visual_key`, `station_shape`, `planet_class`).

### 2) Deterministic Variants (seeded appearance)
- Every renderable entity stores a deterministic seed (`render_seed`).
- Visual variation derives only from `(archetype_id, render_seed, version)`.
- Never use non-seeded random values at runtime for mesh dimensions/material tweaks.
- Result: the same entity rebuilds identically across sessions, platforms, and clients.

## Performance Rules for Large Scale Content

### Render Pipeline Constraints
- Use LOD tiers per archetype (`near`, `mid`, `far`) with hard triangle/material budgets.
- Use GPU instancing for repeated classes (traffic ships, asteroids, distant stations).
- Keep deterministic impostors/sprites for far objects.
- Use pooled object reuse for transient traffic contacts to reduce GC churn.

### Simulation/Spawn Constraints
- Keep spawn descriptors lightweight (`type`, `archetype_id`, `render_seed`, transform/state).
- Resolve full visual params client-side from archetype cache + seed.
- Version archetype definitions (`archetype_version`) so visual migrations are controlled and reversible.

## Batch 07 Follow-up Tasks (Actionable)

1. ✅ Introduce persistent `ship_archetype_id` on `ships` and seed with Cobra Mk I archetype.
2. ✅ Add `render_seed` to ships/stations/planets and expose in internal contracts.
3. ✅ Move `_ship_visual_key` from name-based inference to archetype-based lookup.
4. ✅ Define first LOD budgets for Cobra/station/planet and enforce in renderer.
5. ✅ Add consistency tests: same archetype + stable seed contract yields stable render identity keys.
