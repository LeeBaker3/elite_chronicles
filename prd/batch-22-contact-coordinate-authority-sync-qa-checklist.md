# Batch 22 Manual QA Checklist — Contact Coordinate Authority Sync

Date: 2026-03-12  
Owner: Product + QA + Frontend + Backend

## Objective

Provide a repeatable manual QA checklist and evidence template for the last
open Batch 22 validation item: proving that the original “contacts jump around”
bug class is fixed and that docking distance labels remain understandable
across scanner, chart, and flight surfaces.

## Scope

This checklist covers:
- chart/scanner snapshot compatibility behavior,
- local-contact identity and positional stability across view changes,
- docking distance mode readability (`SURFACE` vs `PORT`),
- targeted before/after evidence capture for the original repro path.

This checklist does not replace automated tests. It complements:
- targeted backend pytest in `backend/tests/test_players_ships_markets.py`
- targeted backend pytest in `backend/tests/test_systems_local_chart.py`
- targeted frontend vitest in `frontend/src/app/page.scanner-flight.test.tsx`

## Environment Prerequisites

- Backend running with local Batch 22 changes applied.
- Frontend running against the same backend.
- Test user with an in-space ship in a system containing at least:
  - one station,
  - one planet,
  - one moon or star contact.
- Scanner and local chart both reachable from the current gameplay flow.
- If possible, keep a screen recording running for the repro scenarios.

## Suggested Local Runbook

Use these commands for the current workspace layout.

### 1) Start Backend

```bash
cd backend
set -a && source ./.env && set +a
../.venv/bin/uvicorn app.main:app --reload
```

Tester notes:
- This uses the repo `.venv` plus `backend/.env`.
- If you need to run targeted backend verification first, use:

```bash
cd backend
set -a && source ./.env && set +a
PYTHONPATH=. ../.venv/bin/python -m pytest tests/test_players_ships_markets.py tests/test_systems_local_chart.py
```

### 2) Start Frontend

```bash
cd frontend
npm run dev
```

Tester notes:
- Open the local Next.js URL shown in the terminal.
- Login through the app UI so `elite_token` and `elite_user_id` are written to local storage by the normal auth flow.

### 3) Confirm Ship/Test State

Quick ship inspection and top-up helpers:

```bash
cd backend
../.venv/bin/python scripts/dev_ship_tools.py status --ship-id 1
../.venv/bin/python scripts/dev_ship_tools.py top-up --ship-id 1
```

Tester notes:
- Use the status command first to confirm the ship is not stuck docked or in an unusable state.
- Use the top-up command if fuel/energy/shields would otherwise block the movement scenarios.
- If your active test ship is not `1`, substitute the correct ship ID.

### 4) Optional Sanity Flows

Docking-range sanity check:

```bash
cd backend
../.venv/bin/python scripts/smoke_docking_range.py
```

Jump/local-transfer sanity check:

```bash
cd backend
../.venv/bin/python scripts/smoke_jump_modes.py
```

Tester notes:
- These are optional pre-QA confidence checks, not substitutes for the manual scenarios below.
- If either smoke flow fails, fix that first before trusting manual QA results.

## Tester Notes For This Batch

- Prefer one stable commander/save state for the full checklist so selection persistence and contact identity are easier to compare.
- Start the checklist from an in-space state, not a docked state, unless a scenario says otherwise.
- When capturing before/after evidence, use the same target contact name across scanner, chart, and flight when possible.
- For docking-distance checks, capture the exact text shown in the `Dock Target Range` surface.
- For snapshot mismatch checks, capture the exact text shown when the chart is waiting for a compatible snapshot.
- If a scenario fails, record whether the problem looked like:
  - identity drift,
  - position jump,
  - distance disagreement,
  - stale chart/scanner mismatch,
  - or unclear mode labeling.

## Evidence Capture Rules

For each scenario below, capture the following:
- `Result`: `Pass` or `Fail`
- `Before`: short note or screenshot/video reference showing the prior bug or setup state
- `After`: short note or screenshot/video reference showing the fixed behavior
- `Observed labels`: exact wording for any `SURFACE`, `PORT`, snapshot mismatch, or target status text
- `Notes`: anything unexpected, ambiguous, or worth follow-up

Use the template block in each scenario or copy the summary table at the end.

## Scenario 1 — Original Contact-Jump Repro

Goal:
- Confirm the same contact no longer appears to jump between scanner, local chart,
  and flight scene during ordinary refresh/update flow.

Steps:
1. Start in flight with a visible station and at least one celestial contact.
2. Open Flight mode and note the selected contact name and distance.
3. Open System mode and confirm the same contact is selected or re-select it.
4. Trigger ordinary scanner refresh behavior by waiting for the normal update cycle
   or changing focus between contacts.
5. Trigger local chart refresh behavior through the normal event-driven path
   such as target changes, transfer completion, or docking-approach transitions.
6. Compare the same contact across:
   - scanner list,
   - system chart row/selection,
   - flight scene focused target.
7. Repeat while moving the ship a modest amount in-system.

Pass criteria:
- The same contact keeps the same identity across all three surfaces.
- No visible position or distance jump occurs solely from mixed scanner/chart state.
- If snapshots are incompatible, the chart defers with an explicit waiting/error state
  instead of silently rendering mismatched geometry.

Evidence template:
- Result:
- Before:
- After:
- Observed labels:
- Notes:

## Scenario 2 — Snapshot Mismatch Guardrail

Goal:
- Confirm the frontend rejects mixed scanner/chart snapshots instead of merging them.

Steps:
1. Start in flight and open System mode.
2. Create or wait for a state transition that changes local-space generation/snapshot state.
3. Observe local chart behavior while scanner data and chart data are temporarily out of sync.

Pass criteria:
- Local chart does not silently merge incompatible data.
- The UI shows an explicit compatibility wait state such as
  `Local chart awaiting compatible snapshot.`
- Once compatible data arrives, chart content resumes normally.

Evidence template:
- Result:
- Before:
- After:
- Observed labels:
- Notes:

## Scenario 3 — Station Approach Distance Consistency

Goal:
- Confirm station targeting remains readable before docking approach begins.

Steps:
1. Select a station target in Flight mode without starting docking approach.
2. Observe the dock target range label and scanner list distance.
3. Compare scanner/list/flight text for the same target.

Pass criteria:
- Distance labels are stable and readable.
- Pre-approach station targeting uses the expected non-port label basis.
- No contradictory or unexplained distance text is shown.

Evidence template:
- Result:
- Before:
- After:
- Observed labels:
- Notes:

## Scenario 4 — Active Docking Approach Port Labeling

Goal:
- Confirm the focused docking approach UI explicitly switches to `PORT` mode when appropriate.

Steps:
1. Select a station target in Flight mode.
2. Start docking approach.
3. Observe the focused dock target range text during active approach.
4. Compare it with the pre-approach state from Scenario 3.

Pass criteria:
- Active docking approach clearly indicates `PORT` distance mode when that mode is in effect.
- The label change appears intentional, not like conflicting data.
- Any in-range/out-of-range message remains understandable with the mode label.

Evidence template:
- Result:
- Before:
- After:
- Observed labels:
- Notes:

## Scenario 5 — Local Transfer to Celestial Target

Goal:
- Confirm local transfer or ordinary movement toward a planet, moon, or star does not
  cause cross-surface authority drift.

Steps:
1. Select a planet, moon, or star target.
2. Perform the normal local transfer or manual approach flow.
3. Observe scanner distance, chart selection, and flight-scene focus before and after movement.

Pass criteria:
- Contact identity remains stable.
- Distances change smoothly and plausibly.
- No sudden fallback-style positional jump appears on chart refresh.

Evidence template:
- Result:
- Before:
- After:
- Observed labels:
- Notes:

## Scenario 6 — Scanner Range Preset Changes During Flight

Goal:
- Confirm scanner tactical-range changes do not break contact identity or chart parity.

Steps:
1. Start in Flight mode with multiple contacts in range and out of range.
2. Change scanner presets across at least two values.
3. Compare scanner grid visibility, scanner list distances, and chart/flight selection state.

Pass criteria:
- Grid visibility changes with range presets as expected.
- Contact list identity and selected-contact parity remain stable.
- No contact appears to “teleport” because of a range preset change.

Evidence template:
- Result:
- Before:
- After:
- Observed labels:
- Notes:

## Follow-Up Decision Gate

After completing the checklist, answer this explicitly:

`Is the current frontend-derived docking distance mode sufficient?`

Choose one:
- `Yes`: keep current model; no backend `distance_mode` field needed now.
- `No`: create a follow-up item to add backend-visible `distance_mode` metadata.

Decision notes:
- Reason:
- Evidence references:
- Follow-up issue/doc link:

## Summary Table

| Scenario | Result | Before Evidence | After Evidence | Notes |
|---|---|---|---|---|
| Original contact-jump repro | TBD |  |  |  |
| Snapshot mismatch guardrail | TBD |  |  |  |
| Station approach distance consistency | TBD |  |  |  |
| Active docking approach port labeling | TBD |  |  |  |
| Local transfer to celestial target | TBD |  |  |  |
| Scanner range preset changes | TBD |  |  |  |
