# Batch 12 Audio Event Key Table

Date: 2026-02-19  
Owner: Product + Frontend + Backend

## Purpose

Provide one authoritative mapping for Batch 12 SFX events across Batch 01–09 features.

## Implementation Status (2026-03-04)

- Canonical event keys in this table are wired in frontend dispatcher flows.
- Local-chart backend hint keys use canonical chart/ops/flight names.
- Asset policy: each event key resolves to a unique file under `frontend/public/audio/sfx/`.
- Manifest source: `frontend/src/components/audio/audioManifest.ts`.

## Event Naming Rules

- Format: `domain.action[_result]`
- Domain set: `ops`, `trade`, `comms`, `flight`, `scanner`, `chart`, `collision`, `admin`
- Event keys are additive and stable once released.

## Coverage Table (Batch 01–09)

| Batch | Event Key | Trigger Point | Category | Suggested Cooldown | Settings Channel |
|---|---|---|---|---|---|
| 01 | `ops.dock_success` | Dock request succeeds | ui | 200ms | `uiVolume` |
| 01 | `ops.dock_reject` | Dock request fails/range/state invalid | alert | 300ms | `alertVolume` |
| 01 | `ops.undock_success` | Undock succeeds | ui | 200ms | `uiVolume` |
| 01 | `ops.refuel_success` | Refuel succeeds | ui | 250ms | `uiVolume` |
| 02 | `admin.market_tick_success` | Admin tick endpoint returns success | ui | 250ms | `uiVolume` |
| 02 | `admin.market_tick_fail` | Admin tick endpoint returns error | alert | 350ms | `alertVolume` |
| 02 | `admin.logs_refresh` | Admin logs refreshed | ui | 250ms | `uiVolume` |
| 03 | `comms.local_send` | Local message send success | comms | 150ms | `commsVolume` |
| 03 | `comms.relay_queued` | Relay message queued | comms | 250ms | `commsVolume` |
| 03 | `comms.relay_delivered` | Relay delivery state changes to delivered | comms | 300ms | `commsVolume` |
| 03 | `admin.user_update_success` | Admin role/status change succeeds | ui | 250ms | `uiVolume` |
| 03 | `admin.user_update_fail` | Admin role/status change fails | alert | 350ms | `alertVolume` |
| 04 | `flight.destination_selected` | Destination selected on map | ui | 200ms | `uiVolume` |
| 04 | `flight.jump_initiated` | Jump sequence starts | flight | 500ms | `flightVolume` |
| 04 | `flight.jump_arrived` | Jump completes/arrival state entered | flight | 600ms | `flightVolume` |
| 04 | `trade.loop_step_complete` | Trade loop step marked complete | ui | 250ms | `uiVolume` |
| 05 | `flight.engine_loop_start` | In-space engine bed starts | flight | n/a (loop) | `flightVolume` |
| 05 | `flight.traffic_flyby` | Nearby traffic pass detected | flight | 1200ms | `flightVolume` |
| 05 | `flight.mode_confirm` | Flight mode state confirmation | ui | 200ms | `uiVolume` |
| 06 | `scanner.ping` | Scanner sweep update | scanner | 500ms | `uiVolume` |
| 06 | `scanner.contact_selected` | Scanner contact selected | scanner | 180ms | `uiVolume` |
| 06 | `scanner.contact_class_star` | Star selected/focused | scanner | 250ms | `uiVolume` |
| 06 | `scanner.contact_class_planet` | Planet selected/focused | scanner | 250ms | `uiVolume` |
| 06 | `scanner.contact_class_station` | Station selected/focused | scanner | 250ms | `uiVolume` |
| 06 | `scanner.contact_class_ship` | Ship selected/focused | scanner | 250ms | `uiVolume` |
| 07 | `ops.docking_request_accept` | Dock request enters approach flow | ui | 250ms | `uiVolume` |
| 07 | `ops.docking_request_reject` | Dock request rejected | alert | 350ms | `alertVolume` |
| 07 | `flight.docked_bay_ambience_start` | Docked bay scene active | flight | n/a (loop) | `flightVolume` |
| 07 | `ops.undock_launch` | Undock transition starts | flight | 500ms | `flightVolume` |
| 08 | `collision.glancing_hit` | Glancing collision resolved | alert | 350ms | `alertVolume` |
| 08 | `collision.critical_hit` | Critical collision resolved | alert | 500ms | `alertVolume` |
| 08 | `collision.warning_alarm` | Collision warning threshold crossed | alert | 1200ms | `alertVolume` |
| 08 | `ops.crash_recovery_start` | Crash recovery initiated | alert | 600ms | `alertVolume` |
| 08 | `ops.crash_recovery_complete` | Crash recovery complete | ui | 500ms | `uiVolume` |
| 09 | `chart.open` | Local chart opened | ui | 250ms | `uiVolume` |
| 09 | `chart.sync_success` | Scanner-chart sync success event | ui | 220ms | `uiVolume` |
| 09 | `chart.sync_fail` | Scanner-chart sync failure event | alert | 350ms | `alertVolume` |
| 09 | `chart.waypoint_lock` | Waypoint locked | ui | 220ms | `uiVolume` |
| 09 | `chart.waypoint_unlock` | Waypoint unlocked | ui | 220ms | `uiVolume` |
| 09 | `chart.layer_toggle_on` | Layer toggled on | ui | 120ms | `uiVolume` |
| 09 | `chart.layer_toggle_off` | Layer toggled off | ui | 120ms | `uiVolume` |

## Settings Channel Mapping

- `masterEnabled` controls all playback globally.
- `sfxEnabled` controls non-music SFX playback.
- `masterVolume` scales all channels.
- `uiVolume` applies to `ui`, `scanner`, and `chart` classes.
- `flightVolume` applies to `flight` classes.
- `alertVolume` applies to `alert` classes.
- `commsVolume` applies to `comms` classes.

## Notes

- Cooldown values are baseline defaults and should be tuned with QA.
- Loop events (`engine_loop_start`, `docked_bay_ambience_start`) should be managed by explicit start/stop state transitions, not repeated trigger spam.
- Additive-only rule: new keys can be added; existing keys should not be renamed after adoption.
- Canonical design reference: `prd/design/core-audio-sfx-design.md`.
