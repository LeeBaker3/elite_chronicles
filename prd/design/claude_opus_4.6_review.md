# Deep Review: Contact Rendering Desynchronization

Second-pass review covering scanner HUD math, polling staleness, distance divergence, orbital timing, type alignment, and design doc validation.

---

## Area 1 — Scanner HUD Contact Projection

**Location:** `frontend/src/app/page.tsx` — `scannerHudContacts` useMemo (~L7013)

- Live contacts use `live.plane_x` / `live.plane_y` emitted per-frame from FlightScene.
- Fallback contacts divide `fallbackRelativeX / scannerPlaneRangeKm` to get a [-1, 1] ratio.
- Fallback uses `(-fallbackRelativeZ)` with negation to convert Z-depth to scanner forward-back axis.
- Altitude range is `scannerRangeKm * 0.44`, tied proportionally to planar range.

**Issue — Live-to-fallback transition discontinuity:**
When a contact drops live telemetry and switches to fallback mid-flight, the coordinate basis changes silently. Live `plane_x` is camera-derived and stable across range changes. Fallback `plane_x` is recalculated by dividing km by scanner range. If scanner range changes at the same moment telemetry drops, the dot teleports on the HUD.

---

## Area 2 — Distance Calculation Divergence

**Backend:**
- All contact types use `_distance_km_from_xyz` — standard Euclidean `sqrt(x² + y² + z²)`, returning `int`.

**Frontend (FlightScene telemetry):**
- Most contacts: `Math.hypot(relativeX, relativeY, relativeZ)` — identical Euclidean formula.
- **Docking approach station:** distance is measured to the **docking port position**, not the station center.

**Issue — Docking distance mismatch:**
During docking approach, the scanner list still shows backend `distance_km` (to station center) but the flight HUD and waypoint marker show distance to the port. These can differ by the station's physical radius plus the port offset. The user sees two contradictory numbers for the same station.

---

## Area 3 — Orbital Position Timing

**Station positions are static.** `orbit_phase_deg` is written once during system generation and never advanced by a simulation tick. Both the local-chart endpoint and the scanner endpoint read the same stored `position_x/y/z` from the database.

**Finding:** No temporal drift between chart and scanner for station positions — they are always identical because orbits do not move. However, `_ensure_station_host_assignments()` in `celestial_generation_service.py` can **recalculate** station positions if host body data changes (e.g., during a generation version bump). If a generation bump occurs between a chart fetch and a scanner fetch, the two responses could reflect different station coordinates for one poll cycle.

---

## Area 4 — ScannerLiveContact Type Alignment

- `page.tsx` `ScannerLiveContact`: `relative_x_km?: number` (optional)
- `FlightScene.tsx` `ScannerTelemetryContact`: `relative_x_km?: number` (optional)

Types are aligned. The `Number.isFinite()` guards in both scanner HUD fallback and FlightScene render correctly handle `undefined`. No silent undefined propagation risk found here.

---

## Area 5 — Design Document vs Implementation

**Document:** `prd/design/core-flight-navigation-design.md`

| Rule | Documented | Implemented | Match |
|------|-----------|-------------|-------|
| Waypoint priority order (docking > local waypoint > locked contact > locked station ID) | Section 6 | `flightWaypointContactId` useMemo | Yes |
| Prefer `relative_*_km` over `scene_*` everywhere | Section "Domain Model" | FlightScene, scanner HUD, chart | Yes |
| Distance display: snapshot-first, live fallback | Section 3 | `resolveScannerDisplayDistanceKm` | Yes |
| `STATION_SCENE_TO_WORLD_SCALE` inverse math | Not documented | Exists in code at `1 / 0.11` | Gap — undocumented constant |

**Gap:** The `STATION_SCENE_TO_WORLD_SCALE_XZ = 1 / 0.11` constant and its chart-anchoring fallback logic are not mentioned anywhere in the design document. This is the exact pathway that causes the mixed-unit bug (Finding #1 in the initial review).

---

## Area 6 — Frontend Polling Cadence and Stale Data

**Scanner contacts** (`/api/ships/{id}/local-contacts`) and **local chart** (`/api/systems/{id}/local-chart`) are **not polled on a timer**. They are fetched on-demand:
- After jump completion
- After docking/undocking
- On explicit user refresh

When both are fetched together (e.g., post-jump), they are fired as independent `void` promises with no coordination:
```typescript
void fetchScannerContacts({ silent: true });
if (scannerSystemId) {
  void fetchLocalChart(scannerSystemId, { silent: true });
}
```

**Issue — No atomicity guarantee:**
If the server state changes between the two requests (e.g., a generation version bump triggers station repositioning), scanner data and chart data can reflect different world states. There is no epoch/version field to detect this. One can succeed while the other fails, leaving the UI with mismatched datasets and no retry-both mechanism.

**Issue — No periodic refresh during flight:**
Once in-flight, there is no polling loop. Scanner contacts go stale. If the ship flies significant distances, the backend `distance_km` and `relative_*_km` values shown in the scanner list remain frozen at the values from the last fetch. Only the live FlightScene telemetry updates, creating a growing gap between "scanner list distance" and "HUD marker distance."

---

## Area 7 — Contact ID Consistency

- Backend scanner: `f"{body.body_kind}-{body.id}"` → `"star-1"`, `"planet-5"`, `"station-42"`
- Backend chart: returns raw numeric `id` fields on `LocalChartBody` and `LocalChartStation`.
- Frontend `buildFlightCelestialAnchors`: manually constructs `"star-${star.id}"`, `"planet-${planet.id}"` before looking up scanner matches.

**Finding:** IDs match because the frontend manually prefixes chart body IDs to match scanner convention. This works but is fragile — any change to the scanner ID format would silently break chart-to-scanner matching with no type-level protection.

---

## Area 8 — FlightScene State Reset on Scanner Poll

When new scanner data arrives as updated props:
- React re-renders FlightScene immediately.
- `celestialAnchorPosition()` and `sceneAnchorPosition()` compute positions directly from latest prop values.
- **No interpolation or transition logic exists.** Objects snap to new positions instantly.

**Issue:** If a contact disappears from one poll and reappears in the next (e.g., a ship that briefly left scanner range), it teleports. Combined with the lack of periodic polling (Area 6), a single stale-then-fresh cycle produces a visible jump proportional to how far the ship has moved since the last fetch.

---

## Area 9 — `presentation_x/y/z` vs `relative_x_km` Redundancy

`buildFlightCelestialAnchors` returns **both** on every anchor:
- `relative_x_km`: raw chart position delta from star (`body.position_x - star.position_x`)
- `presentation_x`: scaled orbit-layout value (`rel_x * directionScale`, compressed for visual spacing)

`FlightScene.tsx` `celestialAnchorPosition()` checks `relative_x_km` first. If finite, it uses that and **completely ignores** `presentation_x`.

**Issue:** Since `relative_x_km` is always finite (it's a simple integer subtraction), `presentation_x` is **never used** for celestial anchors. The carefully computed orbit-layout scaling in `buildFlightCelestialAnchors` (the `orbitRadiusByBodyId` / `directionScale` math) is dead code in the current rendering path. Planets are placed at raw km distances rather than the intended compressed orbit layout.

---

## Area 10 — Backend Schema: Integer-Only Precision

`LocalScannerContact` in `backend/app/schemas/ships.py`:
```python
relative_x_km: int
relative_y_km: int
relative_z_km: int
scene_x: float
scene_y: float
scene_z: float
```

All `relative_*_km` fields are `int`. Database positions are stored as integers. The difference of two integers is an integer.

**Issue:** Sub-kilometer precision is completely lost. Two ships 500 meters apart both report `distance_km = 0` or `1` depending on rounding. Stations orbiting at fractional-km offsets have their positions truncated. This is acceptable for interplanetary distances but problematic for:
- Docking approach (final km of approach loses granularity)
- Ship-to-ship proximity (collision checks need sub-km data)
- Any future feature requiring meter-level accuracy

---

## Summary Table

| # | Area | Severity | Type |
|---|------|----------|------|
| 1 | Scanner HUD live-to-fallback transition jump | Medium | Rendering |
| 2 | Docking distance measured to port vs center | Medium | Data contract |
| 3 | Generation-version bump can desync chart/scanner for one cycle | Low | Timing |
| 4 | Type definitions aligned | — | No issue |
| 5 | `STATION_SCENE_TO_WORLD_SCALE` undocumented | Medium | Documentation gap |
| 6 | No polling loop during flight; stale scanner data | High | Architecture |
| 6b | Independent fire-and-forget fetches with no atomicity | High | Architecture |
| 7 | Contact ID matching works but is fragile | Medium | Maintainability |
| 8 | Contacts teleport on prop update, no interpolation | Medium | UX |
| 9 | `presentation_x/y/z` is dead code; orbit layout never renders | High | Dead code / design intent lost |
| 10 | Integer-only km precision loses sub-km detail | High | Data precision |
