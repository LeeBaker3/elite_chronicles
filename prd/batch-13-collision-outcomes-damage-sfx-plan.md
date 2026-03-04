# Batch 13 Implementation Plan — Collision Outcomes, Damage Model, and Impact SFX

Date: 2026-03-04  
Owner: Product + Backend + Frontend

## Objective

Evolve collisions from simple proximity warnings into outcome-driven gameplay with object-specific consequences:
- star/sun heat and destruction pipeline,
- planet impact vs. future landing branch,
- ship-to-ship momentum + damage resolution,
- station impact with high-risk catastrophic outcomes,
- synchronized visual/audio collision feedback.

## Why This Batch Next

Current collision behavior is useful for warnings but not yet a full gameplay system:
- impact outcomes are not differentiated enough by object type,
- player expectation is physical consequence (bounce, damage, destruction),
- audio cues are now required for feedback quality and readability.

## PRD Alignment (Required)

### PRD Mapping

| Batch Item | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Collision outcome matrix | 5.4, 6.7 | Combat determinism and fairness | Typed per-object outcomes |
| Destruction and recovery behavior | 5.13, 5.14 | Crash recovery and persistence | State-safe post-impact flow |
| Escape capsule and rescue branch | 5.4, 5.13 | Survival path after destruction | Pickup or station transfer |
| Impact SFX/feedback | 10, 11 | Readability and feedback quality | Cooldown and accessibility-safe |

## Core Design Alignment (Required)

- Core Flight Navigation design: [prd/design/core-flight-navigation-design.md](prd/design/core-flight-navigation-design.md)
  - Aligns waypoint lock, transit phase, and jump-state event semantics.
- Core Combat & Recovery design: [prd/design/core-combat-recovery-design.md](prd/design/core-combat-recovery-design.md)
  - Aligns collision outcome severity, damage progression, destruction, and recovery semantics.
- Core Audio SFX design: [prd/design/core-audio-sfx-design.md](prd/design/core-audio-sfx-design.md)
  - Aligns event-key naming, playback constraints, accessibility behavior, and asset governance.

Implementation rule for this batch:
- Any change to collision/damage/audio behavior must update the corresponding
  core design docs in the same PR (or include explicit rationale and a linked
  follow-up if deferred).

## Execution Status Update (2026-02-20)

Status: Planned

## Readiness Checklist

- [ ] PRD mapping validated for all in-scope items.
- [ ] Core design alignment validated (`core-flight-navigation`,
      `core-combat-recovery`, `core-audio-sfx`).
- [ ] Additive API/contract changes drafted with backward compatibility notes.
- [ ] Backend test plan drafted for outcome matrix + damage sequencing.
- [ ] Frontend test plan drafted for state transitions + feedback rendering.
- [ ] Audio validation pass criteria defined (cooldowns/concurrency/accessibility).
- [ ] Telemetry and log fields defined for collision observability.

## In Scope

### 1) Collision Outcome Matrix by Contact Type
- Define authoritative outcome rules for:
  - `star` / `sun`,
  - `planet`,
  - `station`,
  - `ship`.
- Add deterministic threshold logic so identical conditions produce identical outcomes.

### 2) Star/Sun Hazard Model
- Add heat accumulation while inside star hazard envelope.
- Heat first degrades shields, then hull.
- At critical thermal threshold, ship destruction sequence is triggered.
- Surface clear progression states in UI (e.g., overheating, shield collapse, critical hull, destruction).

### 3) Planet Collision and Future Landing Compatibility
- Distinguish two paths:
  - valid landing corridor/state (future extension hook),
  - non-landing impact/crash path.
- For now, non-landing impacts trigger crash outcome and damage/destruction as configured.
- Keep contract extensible for later atmospheric entry and landing mechanics.

### 4) Ship-to-Ship Collision Response
- Add relative-speed and effective-mass based impact severity.
- Resolve outcomes with:
  - bounce/deflection impulse,
  - shield and hull damage distribution,
  - optional temporary control disruption for high-energy impacts.
- Ensure both involved ships receive coherent state updates.

### 5) Ship-to-Station Collision Response
- Treat stations as effectively immovable for MVP response.
- Low-speed/edge contacts can glancing-damage and deflect.
- High-speed collisions can catastrophically destroy the player ship.
- Ensure station collision feedback is immediate and unambiguous.

### 6) Impact Feedback: Visual + Sound
- Add event-driven impact SFX catalog with at least:
  - glancing hit,
  - heavy hit,
  - shield collapse,
  - overheat warning,
  - destruction event.
- Keep audio mixing rules clear (cooldowns, overlap caps, per-severity gain).
- Maintain synchronized feedback: state change, VFX, and SFX should align within same event frame budget.

### 7) Validation
- Backend tests for collision outcome matrix and damage math.
- Frontend tests for collision status transitions and user-visible feedback state.
- Manual tuning pass for readability/feel at low, medium, and high speeds.

### 8) Escape Capsule and Rescue Outcomes
- Add escape capsule ejection branch when ship destruction occurs and capsule is available.
- Add rescue outcomes:
  - pickup by nearby eligible ship,
  - fallback transfer to nearest reachable station when pickup does not occur.
- Apply deterministic penalties/recovery effects for cargo, credits, and mission continuity.
- Emit explicit operation logs and player-visible status transitions for ejection/rescue.

## Out of Scope (Explicit)

- Full rigid-body physics simulation across all world objects.
- Detailed debris simulation and salvage loops.
- Full planetary landing gameplay implementation (only compatibility hooks in this batch).

## Supporting Functionality Required

### Backend Systems
- Collision resolver service with typed outcome policies per contact type.
- Damage pipeline with shield/hull sequencing and destruction state.
- Thermal subsystem for star proximity accumulation/decay.
- Event payload contract for collision telemetry and UI/SFX triggers.
- Deterministic replayable ordering for multi-event collisions in same tick.

### Frontend Systems
- Collision event consumer with typed states (glancing/critical/thermal/destruction).
- Unified feedback dispatcher for HUD status, flash/shake, and SFX playback.
- Safe fallback behavior when SFX assets fail to load.
- Reduced-motion/reduced-audio accessibility behavior.

### Audio Systems
- Initial SFX asset registry and key mapping.
- Client playback utility with:
  - debounce/cooldown,
  - concurrency limits,
  - severity-based volume curves.
- Hook points for future engine/hardware audio profile options.

### Observability
- Metrics:
  - collision count by type and severity,
  - destruction causes,
  - shield-failure rate,
  - SFX trigger/playback success rate.
- Structured logs with collision inputs and resolved outcomes.

## Data and Contract Additions

- Additive collision fields (example shape):
  - `collision_context.type`,
  - `relative_speed`,
  - `relative_mass_factor`,
  - `thermal_delta`,
  - `shield_delta`,
  - `hull_delta`,
  - `resolved_outcome`,
  - `destruction_triggered`.
- Additive feedback fields:
  - `sfx_event_key[]`,
  - `vfx_event_key[]`.
- Additive survival fields:
  - `escape_capsule_available`,
  - `escape_capsule_state`,
  - `rescue_outcome` (`picked_up` | `station_transfer` | `failed`),
  - `rescue_target_id`.
- Keep backward compatibility by making new fields optional for older clients.

## Implementation Sequence

0. Finalize collision outcome matrix and severity thresholds.
1. Implement backend collision resolver and damage sequencing.
2. Add thermal hazard pipeline for star proximity.
3. Add station and ship impact-specific response logic.
4. Add planet crash vs landing-compatible branch hooks.
5. Implement frontend event consumer updates and feedback synchronization.
6. Add SFX playback layer and initial impact sound set.
7. Add tests, balancing pass, and telemetry verification.

## Acceptance Criteria

- Star proximity can overheat ship, collapse shields, and destroy hull at critical thresholds.
- Planet impact triggers crash outcome when not in landing-compatible state.
- Ship-to-ship collision resolves with bounce + damage based on relative factors.
- Ship-to-station high-speed impact can destroy player ship; low-speed contacts remain differentiated.
- Collision VFX and SFX fire reliably and match severity.
- Destroyed ships with installed escape capsules can eject and resolve into deterministic rescue outcomes.
- Frontend lint/tests pass; targeted backend tests pass.

## Risks and Mitigations

- Risk: Overly punishing collisions reduce playability.
  - Mitigation: tuneable thresholds and staged rollout with telemetry.
- Risk: Event spam causes visual/audio fatigue.
  - Mitigation: cooldown windows, grouping, and concurrency caps.
- Risk: Client/server divergence in collision outcomes.
  - Mitigation: backend-authoritative resolution plus explicit client event contracts.

## Test and Validation Evidence

- Planned backend evidence:
  - Collision resolver unit tests per contact type (`star`, `planet`,
    `station`, `ship`).
  - Damage pipeline sequencing tests (shield before hull, destruction thresholds,
    recovery branch triggers).
  - Contract tests for additive collision/audio payload fields.
- Planned frontend evidence:
  - UI state tests for warning/glancing/critical/destruction transitions.
  - Audio event dispatch tests for collision and recovery event keys.
  - Accessibility checks for reduced-audio behavior and safe fallbacks.
- Manual evidence:
  - Scenario pass for low/medium/high velocity impacts,
  - Star overheat progression verification,
  - Escape capsule + rescue outcome flow verification.

## Documentation Update Checklist

- [ ] Update [CHANGELOG.md](CHANGELOG.md) with Batch 13 behavior/design deltas.
- [ ] Update relevant core design docs in [prd/design](prd/design)
      (`core-combat-recovery-design`, `core-flight-navigation-design`,
      `core-audio-sfx-design`) when implementation changes land.
- [ ] Update PRD references if scope/contract changes exceed mapped sections.
- [ ] Add or update runbook/testing notes in backend/frontend README files.

## Sound Effects Requirement for Batch Documents (New Standard)

From Batch 13 onward, each batch plan should include a dedicated **Sound Effects / Audio Feedback** section that specifies:
- event list,
- trigger rules,
- accessibility behavior,
- validation criteria.

This keeps gameplay feedback design consistent across future batches.
