# Gemini 3.1 Pro Findings: Coordinate & Distance Desync Architectures

A comprehensive review of the frontend rendering layers, local navigation chart math, and backend scanner coordinate systems revealed three major architectural issues causing planets, stations, and other contacts to jump around, change scales, or appear incorrectly across the different views.

## 1. The Mixed-Unit Telemetry Bug (Chart/Scanner Jumping)

There is a dangerous unit collision happening between the `FlightScene` component and the `page.tsx` Local Chart tracking.

*   **The Cause:** In `FlightScene.tsx` (`resolveContactRenderPosition`), contacts are translated into 3D positions using either physical kilometers `relative_x_km` (1 unit = 1km) *or* logarithmically compressed `scene_x` coordinates (which are values like 11, 20, etc). When the scene emits live telemetry in `useFrame`, it populates `liveContact.relative_x` directly from the 3D position vector regardless of which scale was used.
*   **The Failure Point:** In `page.tsx` (`resolveAnchoredPosition`), if `liveContact.relative_x_km` happen to be missing or undefined, the system falls back to `liveContact.relative_x * STATION_SCENE_TO_WORLD_SCALE_XZ`. Since `STATION_SCENE_TO_WORLD_SCALE_XZ` is `9.09`, if `relative_x` was *already* populated with physical kilometers, the chart ends up applying the multiplier dynamically to kilometers, launching targets millions or billions of kilometers away abruptly.

## 2. Star-Anchoring vs Ship-Anchoring (Parallax/Placement Bug)

The reason background planets feel disconnected from your immediate scanner space (e.g. why they don't seem to get closer when flying from a station to a planet) is that they are being hardcoded to the *Star's perspective*, not the ship's.

*   **The Cause:** In `page.tsx` (`buildFlightCelestialAnchors`), the function builds the skybox planets by mapping `rel_x = body.position_x - star.position_x`. 
*   **The Failure Point:** It explicitly discards `scannerMatch.relative_x_km` (which correctly knows where the ship is relative to the planet) and forces the data into the 3D scene as if the `camera` (which represents your ship at origin `0,0,0`) is physically stationed dead center inside the primary star. When you fly forwards, nearby stations move past you normally, but the planets stay rigidly anchored to the star's coordinate offset. 

## 3. WebGL / Float32 Precision Destruction (Mesh Flickering & Jumping)

The "jittering" or visual jumping of objects in the 3D flight scene is directly caused by a fundamental limit of 3D graphics (WebGL) when scaling is mixed with massive distances.

*   **The Cause:** In `resolveContactRenderPosition`, you place Three.js `Vector3` nodes identically to `relative_x_km` uncompressed `(e.g., X = 450,000,000)`. Simultaneously, `resolveCelestialAnchorSize` scales the physical meshed *radius* of the planet using log math down to about `6.0 to 18.0` units so it fits on camera. 
*   **The Failure Point:** Three.js shaders run on `Float32` math, which fundamentally only possesses ~7 significant digits. Placing a `6.0` radius sphere at `450,000,000.0` units away destroys the vertex math. The float precision step at 400 million is exactly 32. This means every individual pixel of the planet is being forced to snap to 32-unit invisible grid lines. Moving the camera slightly makes the mesh spasm violently and jump 32 units at a time. 

---

## Suggestions for Next Steps & Design Fixes

1. **Strictly isolate `scene_x` from `relative_x_km`**: Make `relative_x` always mean KM. Never mix fallback values in the same variable loop. The Chart should purely rely on the backend DB locations if the scanner drops track, not blindly apply `9.09` scaling to a potentially raw kilometer layout.
2. **Move Background Celestials out of "True World Space"**: For objects past ~50,000 km, you cannot physically render them at their true distance in WebGL. You need to implement a **skybox projection sphere** (or "far clipping camera"). Background planets should be drawn ~500-1000 units away from the camera, rotated correctly based on their bearing, but mimicking the visual angular size of their massive real distance.
3. **Anchor FlightScene Celestials correctly**: Refactor `buildFlightCelestialAnchors` to calculate `rel_x / rel_y / rel_z` from the **Ship's world position** (via real scanner telemetry), not the Star's position. This ensures the parallax of moving between bodies actually updates the sky panorama and shifts the entire solar system toward you naturally.