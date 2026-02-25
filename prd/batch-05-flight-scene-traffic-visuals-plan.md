# Batch 05 Implementation Plan — Flight Scene Realism + Station Traffic MVP

Date: 2026-02-16  
Owner: Product + Frontend + Backend

## Objective

Upgrade the current flight scene from placeholder primitives to a credible 80s Elite-inspired space presentation with:
- one realistic-looking player ship,
- one realistic-looking station,
- ambient AI traffic (ships approaching/leaving station),
- richer star background presentation.

## Why This Batch Next

Batch 04 establishes a complete functional loop.
This batch focuses on visual immersion and world believability while keeping mechanics stable.

## In Scope

### 1) Player Ship Visual Upgrade
- Replace primitive cone ship with one reusable MVP ship asset/style.
- Keep collision/physics scope unchanged.
- Ensure render performance remains stable.

### 2) Station Visual Upgrade
- Add one station model/style with docking orientation cues.
- Keep one station archetype for MVP visual baseline.
- Reuse same station art style in all systems for now.

### 3) Ambient NPC Traffic (Visual-Only Baseline)
- Spawn AI traffic ships near station with deterministic paths:
  - approach lane,
  - departure lane,
  - loop reset.
- NPCs can reuse the same MVP ship style.
- Treat as visual simulation first (no combat, no collisions, no persistence requirement).

### 4) Background Starfield Upgrade
- Replace sparse static stars with denser layered starfield.
- Add subtle parallax/depth cues to improve realism.
- Keep one star type visually for MVP consistency.

### 5) HUD/UX Compatibility
- Keep existing command strips and telemetry cards.
- Do not remove current loading/empty/error handling.
- Preserve WebGL fallback path.

## Out of Scope (Explicit)

- Multiple ship classes or faction paint schemes.
- Station interiors or docking bay cinematics.
- Volumetric nebulae/post-processing heavy effects.
- Combat behavior for traffic ships.

## Implementation Notes

- Prefer lightweight assets/materials suitable for browser performance.
- Maintain existing design-token discipline for surrounding UI shell.
- Keep traffic generation deterministic for testability.

## Implementation Sequence

1. Select/prepare MVP ship and station visual assets.
2. Integrate assets into `FlightScene` with current camera/HUD.
3. Add traffic spawner + simple approach/depart paths.
4. Upgrade starfield layering/parallax.
5. Add feature flags/tuning constants.
6. Validate performance and fallback behavior.

## Acceptance Criteria

- Flight scene clearly shows one realistic player ship and one realistic station.
- Other ships visibly approach and leave station in repeatable patterns.
- Background stars appear denser/more realistic than current prototype.
- Existing controls and telemetry remain functional.
- Frontend lint/tests remain green.

## Execution Status Update (2026-02-18)

Status: Completed

### Implemented in Current Iteration

- Replaced the prior primitive player cone with a more detailed MVP ship silhouette (fuselage, wings, cockpit canopy, and engine glow).
- Added a single reusable station model in-scene with docking-lane cue geometry.
- Added deterministic ambient traffic lanes with repeated approach/departure ship movement around the station.
- Upgraded background presentation to a denser layered starfield with depth variance and a distant system star anchor.
- Added in-UI flight `Render Profile` tuning (`Performance` / `Balanced` / `Cinematic`) to adjust star density, traffic volume, and canvas DPR for lightweight performance control.
- Preserved existing flight controls, camera-follow behavior, jump progress UI, and WebGL fallback integration.

### Validation Snapshot

- Frontend lint: `npm run lint` -> pass.
- Frontend tests: `npm run test -- --run` -> 10 passed.

### Remaining for Batch 05 Closure

- Follow-up tuning can continue under Batch 06+ based on playtesting; no blocking items remain for Batch 05 scope.

## PRD Alignment

- Supports `3. Product Pillars / Immersion` and `5.7 Stations and Planetary Locations` presentation goals.
- Improves fidelity toward the PRD target audience expectation for classic space-sim feel.
