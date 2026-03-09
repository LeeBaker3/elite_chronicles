import { describe, expect, it } from "vitest";

import {
    calculateDockingCameraPresentationBlend,
    calculateDockingScreenValidity,
    resolveDockingCompletionWindow,
    resolveDockingRotationMatch,
    resolveDockingStageTransition,
} from "./FlightScene.docking";

const transitionConfig = {
    holdPointThresholdKm: 0.42,
    holdEntryMinDurationMs: 2600,
    holdEntryAlignCosine: Math.cos((36 * Math.PI) / 180),
    holdEntryCorridorToleranceKm: 0.18,
    holdAlignRequiredCosine: Math.cos((8 * Math.PI) / 180),
    holdAlignCorridorToleranceKm: 0.22,
    holdAlignDurationMs: 900,
    holdAlignStableMs: 650,
    holdAlignMaxDurationMs: 9000,
    holdAlignTimeoutRequiredCosine: Math.cos((14 * Math.PI) / 180),
    holdAlignTimeoutCorridorToleranceKm: 0.34,
    holdAlignTimeoutMaxDistanceKm: 1.15,
    holdAlignFinalEntryMaxDistanceKm: 0.82,
    holdAlignResetAlignmentCosine: Math.cos((58 * Math.PI) / 180),
    holdAlignResetCorridorMinKm: 0.16,
    holdAlignResetTimeoutMs: 4200,
    holdAlignResetCooldownMs: 2200,
    tunnelEntryMinDurationMs: 550,
    tunnelEntryFinalTriggerKm: 0.18,
    finalHardLockAlignmentCosine: Math.cos((10 * Math.PI) / 180),
    finalInsidePortCorridorMaxKm: 0.05,
    finalReacquireMinElapsedMs: 850,
    finalReacquireCooldownMs: 1600,
    finalReacquireMinDistanceKm: 0.2,
    finalReacquireAlignmentCosine: Math.cos((68 * Math.PI) / 180),
    finalReacquireCorridorMinKm: 0.18,
};

const completionConfig = {
    finalHardLockThresholdKm: 0.14,
    completeMinTunnelPenetrationKm: 0.32,
    finalHardLockAlignmentCosine: Math.cos((10 * Math.PI) / 180),
    finalInsidePortCorridorMaxKm: 0.05,
    finalInsidePortMaxSpeed: 0.05,
    finalInsidePortThresholdKm: 0.11,
    completeStrictTunnelPenetrationKm: 0.36,
    finalInsidePortApproachMaxKm: 0.09,
    finalNearPortThresholdKm: 0.115,
    finalNearPortApproachMaxKm: 0.055,
    finalNearPortCorridorMaxKm: 0.03,
    finalNearPortMaxSpeed: 0.04,
    finalStageMinDurationMs: 4200,
    portThresholdKm: 0.28,
    directPortAlignmentCosine: Math.cos((4 * Math.PI) / 180),
    directPortCorridorMaxKm: 0.026,
    directPortApproachMaxKm: 0.062,
    directPortMaxSpeed: 0.05,
    finalStageForceCompleteMs: 12000,
    portFallbackThresholdKm: 0.48,
    fallbackAlignmentCosine: Math.cos((20 * Math.PI) / 180),
    fallbackCorridorMaxKm: 0.11,
};

const rotationMatchConfig = {
    rotationMatchMaxDistanceKm: 2,
    rotationMatchFinalDistanceKm: 0.24,
    rotationMatchHoldAlignAlignmentCosine: Math.cos((70 * Math.PI) / 180),
    rotationMatchFinalAlignmentCosine: Math.cos((28 * Math.PI) / 180),
    rotationMatchHoldAlignCorridorMaxKm: 0.34,
    rotationMatchFinalCorridorMaxKm: 0.08,
    rotationMatchReleaseAlignmentCosine: Math.cos((56 * Math.PI) / 180),
    rotationMatchReleaseCorridorMaxKm: 0.14,
    rotationMatchReleaseFinalCorridorMaxKm: 0.1,
};

describe("FlightScene docking helpers", () => {
    it("calculates boresight presentation blend by stage", () => {
        expect(calculateDockingCameraPresentationBlend({
            stage: "hold-entry",
            distanceToPortKm: 0.3,
            presentationRangeKm: 1.4,
        })).toBe(0);

        expect(calculateDockingCameraPresentationBlend({
            stage: "hold-align",
            distanceToPortKm: 0.7,
            presentationRangeKm: 1.4,
        })).toBeCloseTo(0.225, 6);

        expect(calculateDockingCameraPresentationBlend({
            stage: "final-approach",
            distanceToPortKm: 0.35,
            presentationRangeKm: 1.4,
        })).toBeCloseTo(0.75, 6);
    });

    it("derives centered and strict screen validity from projected NDC", () => {
        expect(calculateDockingScreenValidity({
            ndcX: 0.4,
            ndcY: 0.3,
            inView: true,
            centerMaxX: 0.72,
            centerMaxY: 0.66,
            strictCenterMaxX: 0.52,
            strictCenterMaxY: 0.48,
        })).toEqual({
            portVisibleOnScreen: true,
            portCenteredOnScreen: true,
            portStrictlyCenteredOnScreen: true,
        });

        expect(calculateDockingScreenValidity({
            ndcX: 0.7,
            ndcY: 0.1,
            inView: true,
            centerMaxX: 0.72,
            centerMaxY: 0.66,
            strictCenterMaxX: 0.52,
            strictCenterMaxY: 0.48,
        }).portStrictlyCenteredOnScreen).toBe(false);
    });

    it("transitions from hold-entry to hold-align when corridor and attitude are valid", () => {
        const transition = resolveDockingStageTransition({
            stage: "hold-entry",
            nowMs: 3000,
            stageStartedAtMs: 0,
            holdAlignAlignedSinceMs: 0,
            lastResetAtMs: 0,
            lastFinalReacquireAtMs: 0,
            holdEntryDistanceRemainingKm: 0.3,
            distanceToPortKm: 1.5,
            distanceToApproachPointKm: 0.4,
            stageDistanceRemainingKm: 0.3,
            reticleAlignmentCosine: 0.9,
            corridorLateralOffsetKm: 0.1,
            tunnelPenetrationDepthKm: 0,
            config: transitionConfig,
        });

        expect(transition).toEqual({
            nextStage: "hold-align",
            reason: "hold-entry-threshold-reached",
        });
    });

    it("transitions from tunnel-entry to final-approach on sufficient penetration", () => {
        const transition = resolveDockingStageTransition({
            stage: "tunnel-entry",
            nowMs: 1200,
            stageStartedAtMs: 0,
            holdAlignAlignedSinceMs: 0,
            lastResetAtMs: 0,
            lastFinalReacquireAtMs: 0,
            holdEntryDistanceRemainingKm: Number.POSITIVE_INFINITY,
            distanceToPortKm: 0.15,
            distanceToApproachPointKm: 0.04,
            stageDistanceRemainingKm: 0.12,
            reticleAlignmentCosine: 0.99,
            corridorLateralOffsetKm: 0.02,
            tunnelPenetrationDepthKm: 0.22,
            config: transitionConfig,
        });

        expect(transition).toEqual({
            nextStage: "final-approach",
            reason: "tunnel-entry-depth-reached",
        });
    });

    it("latches rotation match while release tolerances remain valid", () => {
        const shouldMatch = resolveDockingRotationMatch({
            stage: "hold-align",
            rotationMatchEnabled: true,
            rotationMatchLatched: true,
            distanceToPortKm: 0.8,
            reticleAlignmentCosine: 0.7,
            corridorLateralOffsetKm: 0.12,
            config: rotationMatchConfig,
        });

        expect(shouldMatch).toBe(true);
    });

    it("rejects completion when the port is not screen-centered", () => {
        const completion = resolveDockingCompletionWindow({
            finalApproachElapsedMs: 5000,
            distanceToPortKm: 0.1,
            tunnelPenetrationDepthKm: 0.4,
            reticleAlignmentCosine: 0.999,
            corridorLateralOffsetKm: 0.01,
            shipSpeedKmPerSec: 0.03,
            distanceToApproachPointKm: 0.03,
            screenValidity: {
                portVisibleOnScreen: true,
                portCenteredOnScreen: false,
                portStrictlyCenteredOnScreen: false,
            },
            config: completionConfig,
        });

        expect(completion).toEqual({
            completed: false,
            reason: null,
        });
    });

    it("selects the hard-lock completion window when all strict checks pass", () => {
        const completion = resolveDockingCompletionWindow({
            finalApproachElapsedMs: 5000,
            distanceToPortKm: 0.1,
            tunnelPenetrationDepthKm: 0.35,
            reticleAlignmentCosine: 0.999,
            corridorLateralOffsetKm: 0.01,
            shipSpeedKmPerSec: 0.03,
            distanceToApproachPointKm: 0.03,
            screenValidity: {
                portVisibleOnScreen: true,
                portCenteredOnScreen: true,
                portStrictlyCenteredOnScreen: true,
            },
            config: completionConfig,
        });

        expect(completion).toEqual({
            completed: true,
            reason: "hard-lock-window",
        });
    });
});