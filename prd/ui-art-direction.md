# UI Art Direction — Elite Chronicles

Date: 2026-02-16
Owner: Product + Frontend

## Goal
Blend the current modern UI with the docked-trade feel of classic Elite so the game feels cohesive across all modes.

## North Star
"Retro command terminal inside a modern web shell."

- Keep the current visual system (existing tokens, spacing, panel language).
- Introduce classic Elite cues through layout, information density, and typography rhythm.
- Preserve readability and accessibility first.

## Visual Pillars

### 1) Framed Console Surfaces
- Prefer strong bordered panels and nested sub-panels.
- Use existing token primitives (`--panel`, `--panel-strong`, `--edge`, `--ink`, `--muted`).
- Avoid free-floating cards; favor cockpit/terminal framing.

### 2) Data-First Presentation
- Prioritize dense but legible tabular information for trade/ship stats.
- Use mono typography where values are compared (prices, qty, cargo, fuel).
- Keep labels short and uppercase in control strips.

### 3) Mode Identity, Shared DNA
- Every game mode should feel distinct, but clearly part of the same interface family.
- Keep one shared shell (top-level framing, status language, interaction rules).
- Swap interior module layout by mode instead of re-theming everything.

## Mode-Specific Direction

### A) Docked Trade (reference-inspired)
Primary inspiration from the attached classic station market view.

- Use a "market terminal" composition:
  - left: commodity list/table
  - right: selected commodity + quantity/action controls
  - bottom strip: cash, cargo, ship state chips
- Emphasize row highlighting and immediate numeric comparison (buy/sell/qty/hold).
- Keep action buttons as command-strip controls rather than large CTA blocks.

### B) Spaceflight
- Use a "flight HUD" composition with central situational area and side telemetry.
- Present key gauges as horizontal bars/chips (fuel, shields, hull, heat).
- Keep control verbs compact: jump, dock request, scan, route.

### C) Docking / Undocking
- Transitional mode should feel procedural:
  - checklist panel
  - progress state
  - warnings/conflicts shown as explicit status lines
- Reuse toast only for cross-mode notifications; keep docking outcomes inline.

### D) Text Adventure
- Use "narrative terminal" style:
  - scene output panel
  - interpretation panel
  - confirm/cancel command row
- Preserve current confirmation requirement and make consequences explicit.
- Keep prose area visually calmer than trading/flight modes.

### E) Messaging / Comms
- Use split view:
  - channel/thread list
  - active message timeline
  - compose box with delivery metadata
- Surface delay/relay state as first-class message metadata.

## Interaction Language

- Primary interactions: command buttons, segmented mode toggles, keyboard-reachable controls.
- Status hierarchy:
  1. inline panel status (most local)
  2. mode-level status strip
  3. global toast (cross-cutting)
- Error recovery should always present one immediate action.

## Information Architecture

- Keep player-facing gameplay panels in main view.
- Keep development/debug controls behind the Advanced/Debug window.
- In future, mode navigation should be explicit tabs/commands, for example:
  - Trade
  - Flight
  - Story
  - Comms
  - Ship

## Implementation Constraints

- No new ad-hoc color palette; use existing global tokens.
- Keep using shared primitives (`Tooltip`, `ToastProvider`, `DataState`).
- Preserve loading/empty/error states in every panel.
- Maintain API contract parity and clear non-2xx handling.

## Suggested Rollout

### Phase 1 — Docked Trade Visual Pass
- Convert trade panel into denser terminal/table layout.
- Add compact bottom status strip (cash/cargo/ship).
- Tighten spacing/typography rhythm for numeric scanning.

### Phase 2 — Shared Mode Shell
- Introduce explicit mode navigation and per-mode content regions.
- Keep current data wiring; change layout structure only.

### Phase 3 — Flight + Story Harmonization
- Add flight HUD panel language.
- Refine story terminal styling to match shell while keeping narrative readability.

### Phase 4 — Messaging UI
- Implement comms split view with delivery-delay metadata styling.

## Acceptance Criteria

- Trade view clearly evokes classic Elite station market behavior without becoming unreadable.
- Mode transitions feel like one product, not separate apps.
- Debug/development data stays out of the default player view.
- All states remain accessible and keyboard-reachable.
