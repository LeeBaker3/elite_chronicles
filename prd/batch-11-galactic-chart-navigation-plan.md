# Batch 11 Implementation Plan — Galactic Chart + Hyperspace Navigation + Star Data

Date: 2026-02-18  
Owner: Product + Backend + Frontend

## Objective

Deliver a galactic chart navigation system tied to hyperspace travel:
- galaxy-scale map and system targeting,
- route feasibility based on ship jump capability,
- hyperspace workflow integrated with chart selections,
- star-map dataset strategy that can reflect real known formations where feasible.

## Why This Batch Next

Local navigation (Batch 09) solves in-system orientation, but long-range progression requires:
- an explorable galactic map,
- chart-driven hyperspace planning,
- consistent star/system data representation at scale.

This batch assumes Batch 10 foundations are in place:
- deterministic in-system celestial identity and rendering parity,
- stable local target and travel workflows,
- baseline jump audiovisual timing hooks usable by hyperspace flow.

Readiness gate: do not start Batch 11 implementation workstreams until the
Batch 10 readiness checklist is completed or an explicit blocker waiver is
recorded with owner and date.

## Execution Status Update (2026-02-20)

Status: Planned

## In Scope

### 1) Galactic Chart Core
- Add galaxy chart panel with systems rendered at galactic coordinates.
- Support panning/zooming and selected-system focus.
- Highlight current system, selected destination, and reachable systems.

### 2) Hyperspace Integration
- Selecting destination in chart can set jump target workflow.
- Enforce jump constraints in planning and execution:
  - fuel requirements,
  - range limits,
  - cooldown/phase restrictions.
- Surface clear pre-jump validation reasons in UI.

### 3) Route and Reachability Assistance
- Show direct jump feasibility from current system.
- Provide optional multi-hop route suggestion (MVP shortest-hop or shortest-cost strategy).
- Indicate blocked/unreachable systems with explicit rationale.

### 4) Star Chart Data Strategy (Real Formations Where Possible)
- Support two dataset modes:
  - **Canonical gameplay map** (balanced handcrafted/procedural layout),
  - **Real-star inspired map** using imported astronomical catalogs where license/coverage permits.
- Preserve deterministic coordinate transforms for repeatable rendering.
- Keep data ingestion pipeline versioned and auditable.
- Treat real-star mode as best-effort and source-governed; canonical mode remains guaranteed fallback.

### 5) Validation
- Backend tests for route feasibility and jump validation logic.
- Frontend tests for chart selection and reachability display.
- Data validation checks for coordinate normalization and deterministic output.

## Out of Scope (Explicit)

- Full astrophysical simulation or exact relativistic travel.
- Real-time moving stars/celestial proper motion.
- Procedural nebula volumetrics.

## Supporting Functionality Required

### Hyperspace Engine Support
- Ship jump capability model (range, fuel curve, modifiers).
- Jump planning service for direct and multi-hop checks.
- Unified validation API used by both chart and flight controls.
- Shared error-reason taxonomy (fuel/range/cooldown/gravity-well/interdiction) for consistent UX.
- Deterministic route scoring strategy to avoid client/server route mismatches.

### Star/System Data Services
- System index endpoint with coordinates and metadata for chart rendering.
- Dataset versioning (`star_data_version`) and migration tooling.
- Optional import adapters for known catalog sources (subject to licensing and quality constraints).
- Source governance metadata:
  - `source_name`,
  - `license_type`,
  - `source_version`,
  - ingestion timestamp.
- Coordinate normalization policy (units, epoch, origin transform) documented and testable.

### Caching and Performance
- Spatial indexing for nearest/reachable queries.
- Paginated/region-based chart data retrieval for large maps.
- Client memoization and progressive rendering.
- Max payload budgets and chart viewport request limits.
- Graceful degraded mode for low-memory devices and high-density sectors.

### Data Quality and Determinism
- Validation pipeline checks:
  - duplicate/invalid system coordinates,
  - unreachable-isolated nodes policy,
  - deterministic id generation from source rows.
- Snapshot baseline tests to ensure same dataset version renders same system map.

### Security and Abuse Controls
- Rate limits for chart/system search and route computation endpoints.
- Auth and ownership checks aligned with existing ship jump endpoints.

### Observability and Operations
- Metrics:
  - route compute latency,
  - reachable query latency,
  - chart payload size distribution,
  - jump rejection reason distribution.
- Operational runbook for dataset roll-forward/rollback.

## Data and Contract Additions

- System chart contract fields:
  - `system_id`, `name`, `x/y/z`, `faction`, `economy`, `tech_level`,
  - `reachable_from_current` (or equivalent computed state),
  - optional `dataset_source`/`catalog_ref` metadata.
- Route contract fields:
  - list of hops,
  - estimated fuel,
  - estimated risk/cost.

## Implementation Sequence

0. Define dataset governance and coordinate normalization rules.
1. Define galactic chart system data contract and backend query endpoint.
2. Implement chart UI rendering with selection + pan/zoom.
3. Add hyperspace feasibility checks and chart-to-flight handoff.
4. Implement optional multi-hop route suggestion.
5. Add real-star dataset ingestion baseline and deterministic mapping rules.
6. Add observability/limits/rollout controls.
7. Add tests and performance verification.

## Acceptance Criteria

- Player can open galactic chart and select destination systems.
- Chart indicates which systems are reachable under current ship constraints.
- Hyperspace jump flow can consume chart-selected destinations.
- Route suggestion works for unreachable direct targets (if multi-hop enabled).
- Star/system chart data is deterministic and versioned.
- Frontend lint/tests pass; targeted backend tests pass.

## Risks and Mitigations

- Risk: Real-star catalogs introduce licensing/format complexity.
  - Mitigation: pluggable data-source mode + explicit source metadata + fallback canonical map.
- Risk: Large chart datasets reduce performance.
  - Mitigation: spatial indexing + viewport-windowed loading + client caching.
- Risk: Chart/flight jump validations diverge.
  - Mitigation: shared backend validation service consumed by all clients.
