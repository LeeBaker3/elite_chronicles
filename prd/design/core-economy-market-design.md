# Core System Design — Economy and Markets

Status: Active  
Last Updated: 2026-03-04  
Owners: Product + Backend + Frontend

## Objective

- Define deterministic market behavior across local/system/regional scopes
  with tunable balance and anti-exploit guardrails.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Market simulation rules | 5.6, 9 | Economy stories in 5.14 | Supply/demand and events |
| Market schema/contracts | 6.4, 7.3 | Trading endpoints and snapshots | Additive contract evolution |
| Batch coupling anchor | 15.13 | Politics-economy coupling | Integration surface |

### PRD Update Needed

- None.

## System Scope

### In Scope
- Production/consumption, pricing movement, ripple behavior, stock dynamics.

### Out of Scope
- Full macroeconomic taxation simulation beyond current PRD scope.

## Domain Model

- `commodities`, `station_inventory`, `station_economy_rules`, `market_history`.

## Runtime Behavior

- Micro/macro tick processing, staged ripple propagation, clamped repricing.

## Current State Starter (Batches 01-11)

- Market summary API baseline is implemented with station-level scarcity and
  freshness visibility for decision support (`Batch 01`, `Batch 02`).
- Manual/admin-triggered deterministic economy tick baseline is implemented
  with bounded quantity updates (`Batch 02`).
- Simulate/read-only market freshness exploration path exists for summary
  inspection workflows (`Batch 02`).
- Two-station trade continuity in one gameplay session is validated via end-
  to-end flow (`Batch 04`).
- Off-screen mutable-state catch-up model and deterministic continuity
  contracts are documented/implemented at local-chart layer (`Batch 09`).
- In-system and galactic navigation views now consume richer system overview
  metadata used by market/economy-facing destination decisions (`10`, `11`).

## Code-Truth Update (2026-03-04)

- Backend status: verified active market/tick APIs
  (`GET /api/markets/{system_id}/summary`, `POST /api/markets/tick`) and
  station trade API (`POST /api/stations/{station_id}/trade`).
- Frontend status: verified active runtime calls to market summary/tick and
  station trade flows.

## API and Data Contracts

- Market quote/summary endpoints with explicit status/error behavior.

## Failure Modes and Guardrails

- Runaway price loops, stockout cascades, exploit route concentration.

## Observability and Operations

- Price drift metrics, stockout rate, changed-cell ratio, tick budget usage.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_markets_tick_admin_logs.py`
  - `pytest backend/tests/test_stations_trade.py`

## Open Questions

- Default profile values for launch and event windows.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent economy/market design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
