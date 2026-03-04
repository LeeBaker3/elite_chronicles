# Batch 12 Implementation Plan — Audio SFX Coverage (Batch 01–09) + Settings Menu Controls

Date: 2026-02-19  
Owner: Product + Frontend + Backend

## Objective

Implement audio special effects across previously delivered gameplay features (Batch 01–09) and make audio behavior configurable from the in-game settings menu.

This batch focuses on:
- consistent event-driven SFX coverage for existing features,
- predictable and non-spammy playback behavior,
- accessibility-safe and user-controlled audio settings.

## Why This Batch Next

Core gameplay loops and navigation systems are already in place through Batch 09, but user feedback quality is still heavily visual/textual.

Adding structured SFX now improves:
- player feedback clarity,
- state transition readability,
- immersion across docked, flight, scanner, trade, comms, and safety flows,
without changing core mechanics.

## Execution Status Update (2026-02-20)

Status: Planned

## Review Summary — Batch 01–09 Audio Targets

### Batch 01 (Core Systems: player/ship ops/market summary)
- Add SFX for:
  - dock success/fail,
  - undock success/fail,
  - refuel success,
  - invalid operation/error.

### Batch 02 (Economy tick + logs)
- Add SFX for:
  - admin market tick success,
  - admin market tick failure,
  - logs refresh completion.

### Batch 03 (Comms + admin controls)
- Add SFX for:
  - local comm send,
  - relay comm queued,
  - relay comm delivered,
  - admin user role/status change success/fail.

### Batch 04 (End-to-end flight + trade loop)
- Add SFX for:
  - map destination selected,
  - jump initiated,
  - jump arrival,
  - docked-trade loop step completion.

### Batch 05 (Flight visuals + traffic)
- Add SFX for:
  - ambient engine bed while in-space,
  - station traffic flyby (subtle near-pass cue),
  - cockpit confirmation chirps for mode/state changes.

### Batch 06 (Celestials + scanner contacts)
- Add SFX for:
  - scanner ping/sweep,
  - contact selected,
  - contact class cue (star/planet/station/ship),
  - waypoint/focus marker confirmation.

### Batch 07 (Docking/undocking visuals)
- Add SFX for:
  - docked bay ambience loop,
  - docking request accepted/rejected,
  - docking bay guidance cue,
  - undock launch cue.

### Batch 08 (Collision + docking safety + recovery)
- Add SFX for:
  - glancing impact,
  - critical impact,
  - warning alarm,
  - crash recovery start/complete.

### Batch 09 (Local chart + scanner tandem)
- Add SFX for:
  - chart open/focus,
  - scanner-chart sync success/fail,
  - waypoint lock/unlock,
  - layer toggle on/off.

## In Scope

### 1) Unified Audio Event Catalog for Existing Features
- Define and implement typed event keys for all Batch 01–09 target actions.
- Use additive taxonomy grouped by domain:
  - `ops.*`, `trade.*`, `comms.*`, `flight.*`, `scanner.*`, `chart.*`, `collision.*`, `admin.*`.

### 2) Centralized Playback Dispatcher
- Route all SFX through one frontend dispatcher (no direct component-level playback calls).
- Enforce deterministic playback policy:
  - per-event cooldown,
  - per-category concurrency cap,
  - duplicate suppression windows.

### 3) Settings Menu Audio Controls (Required)
- Add a dedicated Audio section in settings with:
  - `Master Audio` on/off toggle,
  - `SFX Enabled` on/off toggle,
  - `Master Volume` slider,
  - `UI/Notification Volume` slider,
  - `Flight/Engine Volume` slider,
  - `Alert/Warning Volume` slider,
  - optional `Comms/Message Volume` slider.
- Persist settings locally and load safely on startup.
- Keep keyboard reachable and accessible labels for all controls.

### 4) Accessibility and Fallback Behavior
- Respect reduced-audio preference pathways where available.
- If audio is disabled or asset load fails:
  - no crashes,
  - no blocked gameplay,
  - optional lightweight telemetry/log record.

### 5) Validation
- Frontend tests for:
  - dispatcher routing,
  - cooldown/concurrency behavior,
  - settings persistence and defaults,
  - mute/volume behavior.
- Manual QA checklist for all mapped Batch 01–09 actions.

## Out of Scope (Explicit)

- New gameplay mechanics tied to audio.
- Voice-over, music score system, or dynamic soundtrack authoring.
- Positional 3D spatial audio simulation beyond lightweight panning defaults.

## Supporting Functionality Required

### Frontend Systems
- Shared audio dispatcher utility as single playback path.
- Settings state and persistence layer for audio controls.
- Deterministic event wiring from existing UI/feature flows.

### Backend Systems (Optional/Telemetry)
- Additive analytics hooks for audio event observability when enabled.
- No gameplay authority changes required for SFX-only behavior.

### QA and Accessibility
- Test matrix covering mute, volume, fallback, and rapid-event throttling.
- Accessibility checks for reduced-audio preference handling and keyboard
  settings reachability.

## Data and Contract Additions

- Additive client settings model (example):
  - `audio.masterEnabled: boolean`
  - `audio.sfxEnabled: boolean`
  - `audio.masterVolume: number (0..1)`
  - `audio.uiVolume: number (0..1)`
  - `audio.flightVolume: number (0..1)`
  - `audio.alertVolume: number (0..1)`
  - `audio.commsVolume: number (0..1)`
- Optional additive backend telemetry hook fields for future analytics:
  - `audio_event_key`,
  - `playback_suppressed_reason`.

## Implementation Sequence

0. Finalize Batch 01–09 audio event coverage matrix and event naming policy.
1. Implement shared audio dispatcher and per-category mix/cooldown rules.
2. Add settings menu audio controls and local persistence.
3. Wire SFX triggers for Batch 01–04 operational flows.
4. Wire SFX triggers for Batch 05–07 flight/scanner/docking visuals.
5. Wire SFX triggers for Batch 08–09 collision and chart/scanner sync flows.
6. Add tests and run manual QA checklist.
7. Tune default volumes and document fallback/accessibility behavior.

## Acceptance Criteria

- All major user-facing actions from Batch 01–09 have mapped SFX events.
- Audio playback is routed only through shared dispatcher logic.
- Settings menu exposes master/sfx toggles and category volume controls.
- Audio settings persist across reloads and apply immediately.
- Muting audio does not break feature behavior.
- Frontend lint/tests pass; targeted backend tests (if telemetry hooks added) pass.

## Risks and Mitigations

- Risk: SFX noise fatigue from repeated events.
  - Mitigation: cooldown windows, category caps, and conservative default volume mix.
- Risk: Inconsistent event usage across components.
  - Mitigation: typed event catalog and dispatcher-only playback rule.
- Risk: Accessibility regressions from loud alerts.
  - Mitigation: separate alert volume channel and opt-out controls.
- Risk: Asset failures causing runtime issues.
  - Mitigation: silent fallback with non-blocking error handling.

## Dependency Notes

- Depends on Batch 01–09 feature set being stable and event points unchanged.
- Should align with Batch 10+ audio taxonomy to avoid duplicate event namespaces.

## Deliverables

- Batch 12 audio event catalog document/table (keys -> trigger points).
- Settings menu audio section implementation.
- Dispatcher utility with tests.
- QA checklist for Batch 01–09 audio coverage verification.

## Batch 12 Item — Audio Event Key Table

- Add a standalone event-key reference:
  - [batch-12-audio-event-key-table.md](batch-12-audio-event-key-table.md)
- The table is authoritative for:
  - event key naming,
  - trigger source,
  - default audio category,
  - cooldown guidance,
  - user-setting channel mapping.
