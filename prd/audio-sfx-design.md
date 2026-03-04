# Audio SFX Design (Batch 12)

Superseded reference:
- Canonical maintained design doc is now
  `prd/design/core-audio-sfx-design.md`.

Date: 2026-03-04  
Owner: Frontend + Product

## Goals

- Keep event-to-sound mapping explicit and stable.
- Keep audio assets external to code for quick swap/replacement.
- Preserve deterministic dispatcher behavior (cooldowns + category caps).

## File-Based Asset Model

- SFX assets live in `frontend/public/audio/sfx/`.
- Each event key maps to one unique file path:
  - `event.key.name` -> `/audio/sfx/event-key-name.wav`
- Diagnostic tone path remains:
  - `/audio/sfx/diagnostic-tone.wav`

## Runtime Wiring

- Manifest source: `frontend/src/components/audio/audioManifest.ts`
  - authoritative event key list (`FLIGHT_MEDIA_AUDIO_EVENT_KEYS`)
  - resolver (`resolveFlightMediaAudioSfxUri`)
- Dispatcher source: `frontend/src/app/page.tsx`
  - event routing
  - per-event cooldown
  - category cap + reduced-audio suppression
- Playback engines:
  - media-audio uses manifest file paths directly
  - web-audio uses adapter mapping fallback for legacy cues

## Maintainability Rules

- Do not embed WAV/base64 data in source.
- Keep event key naming additive-only.
- Replacing a sound should only require swapping the corresponding `.wav` file.
- Add/update tests whenever event keys or manifest entries change.

## Validation

- Manifest integrity tests:
  - all event keys resolve
  - all event paths are unique
  - all mapped files exist
- Integration tests:
  - canonical chart/audio events dispatch from user flows
- Regression:
  - frontend lint + full frontend test suite
