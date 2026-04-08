# Core System Design — Economy and Markets

Status: Active  
Last Updated: 2026-03-12  
Owners: Product + Backend + Frontend

## Objective

- Define deterministic market behavior across local/system/regional scopes
  with tunable balance and anti-exploit guardrails.
- Define the shared economy and market contract that must remain consistent
  across first-party runtimes even when presentation or workflow differs.

## PRD Alignment

| Design Area | PRD Section | Requirement/Story Link | Notes |
|---|---|---|---|
| Market simulation rules | 5.6, 9 | Economy stories in 5.14 | Supply/demand and events |
| Market schema/contracts | 6.4, 7.3 | Trading endpoints and snapshots | Additive contract evolution |
| Batch coupling anchor | 15.13 | Politics-economy coupling | Integration surface |

### PRD Update Needed

- None.

### Companion Design Docs

- Shared client-platform authority baseline:
  `prd/design/core-client-platform-contract-design.md`
- Browser runtime behavior:
  `prd/design/frontend-web-runtime-design.md`
- Desktop runtime behavior:
  `prd/design/frontend-desktop-runtime-design.md`

## System Scope

### In Scope
- Production/consumption, pricing movement, ripple behavior, stock dynamics.
- Shared trade, quote, and market-summary semantics across web and desktop
  clients.

### Out of Scope
- Full macroeconomic taxation simulation beyond current PRD scope.
- Platform-specific storefront, market-table, or trade-input UX details beyond
  shared contract meaning.

## Domain Model

- `commodities`, `station_inventory`, `station_economy_rules`, `market_history`.
- Multi-client rule:
  - commodity identity, quote meaning, stock movement, and trade outcome
    semantics must remain shared across first-party clients.

## Runtime Behavior

- Micro/macro tick processing, staged ripple propagation, clamped repricing.
- Runtime split:
  - this doc defines shared market-state and trade outcome meaning,
  - browser market/trade workflow presentation belongs in
    `frontend-web-runtime-design.md`,
  - desktop market/trade workflow presentation belongs in
    `frontend-desktop-runtime-design.md`.

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
- Shared client-platform contract reference:
  - `prd/design/core-client-platform-contract-design.md`
- Multi-client compatibility rules:
  - first-party clients must interpret quote freshness, stock changes, and
    trade success/failure semantics the same way,
  - clients may differ in rendering and input flow, but must not fork trading
    rules or status meanings.

## Failure Modes and Guardrails

- Runaway price loops, stockout cascades, exploit route concentration.
- Runtime drift where web and desktop display conflicting market state or trade
  outcome meaning for the same backend response.

## Observability and Operations

- Price drift metrics, stockout rate, changed-cell ratio, tick budget usage.
- Keep trade and market diagnostics comparable across first-party client
  platforms.

## Validation and Test Evidence

- Backend tests:
  - `pytest backend/tests/test_markets_tick_admin_logs.py`
  - `pytest backend/tests/test_stations_trade.py`

## Open Questions

- Default profile values for launch and event windows.
- Whether shared client models for market and station trade payloads should be
  formalized before desktop-client trade flows are implemented.

## Batch Change Log

- 2026-03-04 — Governance setup — Created persistent economy/market design doc.
- 2026-03-04 — Seeded current-state starter from Batches 01-11.
- 2026-03-04 — Code-truth audit — Verified implementation state against audited backend and frontend code.
- 2026-03-12 — Batch 12.5 — Cross-linked shared economy and trade rules to
  the client-platform contract and separated runtime-specific behavior into
  web and desktop companion docs.
