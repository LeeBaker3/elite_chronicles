import { describe, expect, it } from "vitest";

import {
    advanceDockingAttitude,
    advanceManualPitch,
    desiredDockingPitchFromDirection,
    desiredDockingYawFromDirection,
    projectCameraSpacePointToNdc,
    projectCameraSpaceSphereToNdc,
    resolveCelestialRenderRadius,
    resolveContactDistanceKm,
    resolveProjectedSphereLabelAnchorNdc,
    resolveScannerReferenceVector,
    shortestAngleDelta,
} from "./FlightScene.math";

describe("FlightScene manual pitch controls", () => {
    it("supports continuous pitch loops and returns near the starting attitude", () => {
        const startPitchRadians = 0;
        const pitchInput = 1;
        const deltaSeconds = 1 / 60;
        const totalSecondsForFullLoop = (Math.PI * 2) / 1.2;
        const steps = Math.round(totalSecondsForFullLoop / deltaSeconds);

        let pitchRadians = startPitchRadians;
        for (let step = 0; step < steps; step += 1) {
            pitchRadians = advanceManualPitch(
                pitchRadians,
                pitchInput,
                deltaSeconds,
            );
        }

        expect(Math.abs(pitchRadians - startPitchRadians)).toBeLessThan(0.06);
    });
});

describe("FlightScene docking attitude convergence", () => {
    it("resolves negative desired pitch when docking target is below reticle", () => {
        const desiredPitch = desiredDockingPitchFromDirection(-0.28, 0.47 * Math.PI);
        expect(desiredPitch).toBeLessThan(0);
    });

    it("resolves positive desired pitch when docking target is above reticle", () => {
        const desiredPitch = desiredDockingPitchFromDirection(0.31, 0.47 * Math.PI);
        expect(desiredPitch).toBeGreaterThan(0);
    });

    it("converges pitch and yaw toward docking target without runaway", () => {
        let yaw = 0.9;
        let pitch = 0.55;

        const desiredYaw = desiredDockingYawFromDirection(0.18, -0.98);
        const desiredPitch = desiredDockingPitchFromDirection(-0.24, 0.47 * Math.PI);
        const initialYawError = Math.abs(shortestAngleDelta(yaw, desiredYaw));
        const initialPitchError = Math.abs(desiredPitch - pitch);

        for (let step = 0; step < 240; step += 1) {
            const next = advanceDockingAttitude({
                currentYawRadians: yaw,
                currentPitchRadians: pitch,
                desiredYawRadians: desiredYaw,
                desiredPitchRadians: desiredPitch,
                maxPitchRadians: 0.47 * Math.PI,
                maxYawRateRadPerSec: 1.1,
                maxPitchRateRadPerSec: 0.9,
                deltaSeconds: 1 / 60,
            });
            yaw = next.yawRadians;
            pitch = next.pitchRadians;
        }

        const finalYawError = Math.abs(shortestAngleDelta(yaw, desiredYaw));
        const finalPitchError = Math.abs(desiredPitch - pitch);

        expect(finalYawError).toBeLessThan(initialYawError * 0.25);
        expect(finalPitchError).toBeLessThan(initialPitchError * 0.25);
        expect(pitch).toBeLessThan(0);
    });
});

describe("FlightScene docking screen framing math", () => {
    it("treats a centered point ahead of the camera as visible", () => {
        const projected = projectCameraSpacePointToNdc({
            cameraSpaceX: 0,
            cameraSpaceY: 0,
            cameraSpaceZ: -10,
            verticalFovDegrees: 30,
            aspectRatio: 16 / 9,
        });

        expect(projected.inFront).toBe(true);
        expect(projected.inView).toBe(true);
        expect(projected.ndcX).toBeCloseTo(0, 6);
        expect(projected.ndcY).toBeCloseTo(0, 6);
    });

    it("rejects a point outside the frustum bounds", () => {
        const projected = projectCameraSpacePointToNdc({
            cameraSpaceX: 6,
            cameraSpaceY: 0,
            cameraSpaceZ: -4,
            verticalFovDegrees: 30,
            aspectRatio: 16 / 9,
        });

        expect(projected.inFront).toBe(true);
        expect(projected.inView).toBe(false);
        expect(projected.ndcX).toBeGreaterThan(1);
    });

    it("rejects a point behind the camera", () => {
        const projected = projectCameraSpacePointToNdc({
            cameraSpaceX: 0,
            cameraSpaceY: 0,
            cameraSpaceZ: 2,
            verticalFovDegrees: 30,
            aspectRatio: 16 / 9,
        });

        expect(projected.inFront).toBe(false);
        expect(projected.inView).toBe(false);
    });

    it("keeps a large sphere visible when its center falls outside the frustum", () => {
        const projected = projectCameraSpaceSphereToNdc({
            cameraSpaceX: 15,
            cameraSpaceY: 0,
            cameraSpaceZ: -10,
            radius: 10,
            verticalFovDegrees: 60,
            aspectRatio: 16 / 9,
            marginX: 0,
            marginY: 0,
        });

        expect(projected.inFront).toBe(true);
        expect(projected.centerInView).toBe(false);
        expect(projected.sphereInView).toBe(true);
        expect(projected.ndcRadiusX).toBeGreaterThan(0.9);
    });

    it("anchors large visible spheres on the limb facing the reticle", () => {
        const anchor = resolveProjectedSphereLabelAnchorNdc({
            projectedSphere: {
                depth: 10,
                ndcX: -0.45,
                ndcY: 0.05,
                ndcRadiusX: 1.2,
                ndcRadiusY: 1.0,
                inFront: true,
                centerInView: true,
                sphereInView: true,
            },
            targetNdcX: 0,
            targetNdcY: 0,
        });

        expect(anchor.usesLimbAnchor).toBe(true);
        expect(anchor.ndcX).toBeGreaterThan(0.6);
        expect(Math.abs(anchor.ndcY)).toBeLessThan(0.1);
    });

    it("keeps small in-view spheres anchored at their center", () => {
        const anchor = resolveProjectedSphereLabelAnchorNdc({
            projectedSphere: {
                depth: 10,
                ndcX: 0.18,
                ndcY: -0.12,
                ndcRadiusX: 0.08,
                ndcRadiusY: 0.08,
                inFront: true,
                centerInView: true,
                sphereInView: true,
            },
            targetNdcX: 0,
            targetNdcY: 0,
        });

        expect(anchor.usesLimbAnchor).toBe(false);
        expect(anchor.ndcX).toBeCloseTo(0.18, 6);
        expect(anchor.ndcY).toBeCloseTo(-0.12, 6);
    });
});

describe("FlightScene contact distance resolution", () => {
    it("uses surface distance for celestial contacts", () => {
        expect(resolveContactDistanceKm({
            contactType: "planet",
            centerDistanceKm: 256000,
            radiusKm: 255982,
        })).toEqual({
            distanceKm: 18,
            mode: "surface",
        });
    });

    it("prefers docking port distance when requested", () => {
        expect(resolveContactDistanceKm({
            contactType: "station",
            centerDistanceKm: 42,
            radiusKm: 12,
            dockingPortDistanceKm: 3.4,
            useDockingPortDistance: true,
        })).toEqual({
            distanceKm: 3.4,
            mode: "port",
        });
    });
});

describe("FlightScene scanner reference vector", () => {
    it("uses a surface-distance vector for nearby celestial contacts", () => {
        expect(resolveScannerReferenceVector({
            contactType: "planet",
            centerX: 3000,
            centerY: 0,
            centerZ: -4000,
            displayedDistanceKm: 50,
        })).toEqual({
            x: 30,
            y: 0,
            z: -40,
        });
    });

    it("keeps center vectors for non-celestial contacts", () => {
        expect(resolveScannerReferenceVector({
            contactType: "station",
            centerX: 30,
            centerY: 0,
            centerZ: -40,
            displayedDistanceKm: 5,
        })).toEqual({
            x: 30,
            y: 0,
            z: -40,
        });
    });
});

describe("FlightScene celestial render radius", () => {
    it("uses physical radius for nearby planets", () => {
        expect(resolveCelestialRenderRadius({
            bodyKind: "planet",
            bodyType: "gas-giant",
            radiusKm: 42092,
            distanceKm: 13,
        })).toBe(42092);
    });

    it("keeps compressed proxy radius for distant planets", () => {
        expect(resolveCelestialRenderRadius({
            bodyKind: "planet",
            bodyType: "gas-giant",
            radiusKm: 42092,
            distanceKm: 417270,
        })).toBeCloseTo(8.5, 1);
    });
});
