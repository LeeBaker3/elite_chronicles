import { describe, expect, it } from "vitest";

import {
    advanceDockingAttitude,
    advanceManualPitch,
    desiredDockingPitchFromDirection,
    desiredDockingYawFromDirection,
    projectCameraSpacePointToNdc,
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
});
