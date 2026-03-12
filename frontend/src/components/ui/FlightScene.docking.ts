export type DockingApproachStage = "hold-entry" | "hold-align" | "tunnel-entry" | "final-approach";

export type DockingScreenValidity = {
    portVisibleOnScreen: boolean;
    portCenteredOnScreen: boolean;
    portStrictlyCenteredOnScreen: boolean;
};

export type DockingStageTransition = {
    nextStage: DockingApproachStage;
    reason: string;
};

export type DockingCompletionWindow = {
    completed: boolean;
    reason: string | null;
};

export type DockingTransitionConfig = {
    holdPointThresholdKm: number;
    holdEntryMinDurationMs: number;
    holdEntryAlignCosine: number;
    holdEntryCorridorToleranceKm: number;
    holdAlignRequiredCosine: number;
    holdAlignCorridorToleranceKm: number;
    holdAlignDurationMs: number;
    holdAlignStableMs: number;
    holdAlignMaxDurationMs: number;
    holdAlignTimeoutRequiredCosine: number;
    holdAlignTimeoutCorridorToleranceKm: number;
    holdAlignTimeoutMaxDistanceKm: number;
    holdAlignFinalEntryMaxDistanceKm: number;
    holdAlignResetAlignmentCosine: number;
    holdAlignResetCorridorMinKm: number;
    holdAlignResetTimeoutMs: number;
    holdAlignResetCooldownMs: number;
    tunnelEntryMinDurationMs: number;
    tunnelEntryFinalTriggerKm: number;
    finalHardLockAlignmentCosine: number;
    finalInsidePortCorridorMaxKm: number;
    finalReacquireMinElapsedMs: number;
    finalReacquireCooldownMs: number;
    finalReacquireMinDistanceKm: number;
    finalReacquireAlignmentCosine: number;
    finalReacquireCorridorMinKm: number;
};

export type DockingCompletionConfig = {
    finalHardLockThresholdKm: number;
    completeMinTunnelPenetrationKm: number;
    finalHardLockAlignmentCosine: number;
    finalInsidePortCorridorMaxKm: number;
    finalInsidePortMaxSpeed: number;
    finalInsidePortThresholdKm: number;
    completeStrictTunnelPenetrationKm: number;
    finalInsidePortApproachMaxKm: number;
    finalNearPortThresholdKm: number;
    finalNearPortApproachMaxKm: number;
    finalNearPortCorridorMaxKm: number;
    finalNearPortMaxSpeed: number;
    finalStageMinDurationMs: number;
    portThresholdKm: number;
    directPortAlignmentCosine: number;
    directPortCorridorMaxKm: number;
    directPortApproachMaxKm: number;
    directPortMaxSpeed: number;
    finalStageForceCompleteMs: number;
    portFallbackThresholdKm: number;
    fallbackAlignmentCosine: number;
    fallbackCorridorMaxKm: number;
};

export type DockingRotationMatchConfig = {
    rotationMatchMaxDistanceKm: number;
    rotationMatchFinalDistanceKm: number;
    rotationMatchHoldAlignAlignmentCosine: number;
    rotationMatchFinalAlignmentCosine: number;
    rotationMatchHoldAlignCorridorMaxKm: number;
    rotationMatchFinalCorridorMaxKm: number;
    rotationMatchReleaseAlignmentCosine: number;
    rotationMatchReleaseCorridorMaxKm: number;
    rotationMatchReleaseFinalCorridorMaxKm: number;
};

export const calculateDockingCameraPresentationBlend = (params: {
    stage: DockingApproachStage;
    distanceToPortKm: number;
    presentationRangeKm: number;
}): number => {
    const { stage, distanceToPortKm, presentationRangeKm } = params;
    if (presentationRangeKm <= 0) {
        return 0;
    }

    const normalized = Math.max(0, Math.min(1, 1 - (distanceToPortKm / presentationRangeKm)));
    if (stage === "final-approach") {
        return normalized;
    }
    if (stage === "hold-align") {
        return Math.max(0, Math.min(0.45, normalized * 0.45));
    }
    return 0;
};

export const calculateDockingScreenValidity = (params: {
    ndcX: number;
    ndcY: number;
    inView: boolean;
    centerMaxX: number;
    centerMaxY: number;
    strictCenterMaxX: number;
    strictCenterMaxY: number;
}): DockingScreenValidity => {
    const {
        ndcX,
        ndcY,
        inView,
        centerMaxX,
        centerMaxY,
        strictCenterMaxX,
        strictCenterMaxY,
    } = params;
    const portVisibleOnScreen = inView;
    const portCenteredOnScreen = (
        portVisibleOnScreen
        && Math.abs(ndcX) <= centerMaxX
        && Math.abs(ndcY) <= centerMaxY
    );
    const portStrictlyCenteredOnScreen = (
        portVisibleOnScreen
        && Math.abs(ndcX) <= strictCenterMaxX
        && Math.abs(ndcY) <= strictCenterMaxY
    );
    return {
        portVisibleOnScreen,
        portCenteredOnScreen,
        portStrictlyCenteredOnScreen,
    };
};

export const resolveDockingStageTransition = (params: {
    stage: DockingApproachStage;
    nowMs: number;
    stageStartedAtMs: number;
    holdAlignAlignedSinceMs: number;
    lastResetAtMs: number;
    lastFinalReacquireAtMs: number;
    holdEntryDistanceRemainingKm: number;
    distanceToPortKm: number;
    distanceToApproachPointKm: number;
    stageDistanceRemainingKm: number;
    reticleAlignmentCosine: number;
    corridorLateralOffsetKm: number;
    tunnelPenetrationDepthKm: number;
    config: DockingTransitionConfig;
}): DockingStageTransition | null => {
    const {
        stage,
        nowMs,
        stageStartedAtMs,
        holdAlignAlignedSinceMs,
        lastResetAtMs,
        lastFinalReacquireAtMs,
        holdEntryDistanceRemainingKm,
        distanceToPortKm,
        reticleAlignmentCosine,
        corridorLateralOffsetKm,
        tunnelPenetrationDepthKm,
        config,
    } = params;

    if (stage === "hold-entry") {
        const holdEntryElapsedMs = nowMs - stageStartedAtMs;
        const holdEntryReadyForAlign = (
            holdEntryDistanceRemainingKm <= config.holdPointThresholdKm
            && holdEntryElapsedMs >= config.holdEntryMinDurationMs
            && reticleAlignmentCosine >= config.holdEntryAlignCosine
            && corridorLateralOffsetKm <= config.holdEntryCorridorToleranceKm
        );
        return holdEntryReadyForAlign
            ? { nextStage: "hold-align", reason: "hold-entry-threshold-reached" }
            : null;
    }

    if (stage === "hold-align") {
        const holdAlignElapsedMs = nowMs - stageStartedAtMs;
        const holdAlignAligned = (
            reticleAlignmentCosine >= config.holdAlignRequiredCosine
            && params.stageDistanceRemainingKm <= config.holdPointThresholdKm
            && corridorLateralOffsetKm <= config.holdAlignCorridorToleranceKm
        );
        const holdAlignStableMs = holdAlignAligned && holdAlignAlignedSinceMs > 0
            ? nowMs - holdAlignAlignedSinceMs
            : 0;
        const holdAlignTimeout = holdAlignElapsedMs >= config.holdAlignMaxDurationMs;
        const holdAlignTimeoutEligible = (
            reticleAlignmentCosine >= config.holdAlignTimeoutRequiredCosine
            && corridorLateralOffsetKm <= config.holdAlignTimeoutCorridorToleranceKm
            && distanceToPortKm <= config.holdAlignTimeoutMaxDistanceKm
            && distanceToPortKm <= config.holdAlignFinalEntryMaxDistanceKm
        );
        if (
            (holdAlignTimeout && holdAlignTimeoutEligible)
            || (
                distanceToPortKm <= config.holdAlignFinalEntryMaxDistanceKm
                && holdAlignElapsedMs >= config.holdAlignDurationMs
                && holdAlignStableMs >= config.holdAlignStableMs
            )
        ) {
            return {
                nextStage: "tunnel-entry",
                reason: holdAlignTimeout ? "hold-align-timeout-eligible" : "hold-align-stable",
            };
        }

        const holdAlignResetEligible = (
            holdAlignElapsedMs >= config.holdAlignResetTimeoutMs
            && (nowMs - lastResetAtMs) >= config.holdAlignResetCooldownMs
            && (
                reticleAlignmentCosine <= config.holdAlignResetAlignmentCosine
                || corridorLateralOffsetKm >= config.holdAlignResetCorridorMinKm
            )
        );
        return holdAlignResetEligible
            ? { nextStage: "hold-entry", reason: "hold-align-reset-reapproach" }
            : null;
    }

    if (stage === "tunnel-entry") {
        const tunnelEntryElapsedMs = nowMs - stageStartedAtMs;
        const tunnelEntryReadyForFinal = (
            tunnelEntryElapsedMs >= config.tunnelEntryMinDurationMs
            && tunnelPenetrationDepthKm >= config.tunnelEntryFinalTriggerKm
            && corridorLateralOffsetKm <= config.finalInsidePortCorridorMaxKm
            && reticleAlignmentCosine >= config.finalHardLockAlignmentCosine
        );
        return tunnelEntryReadyForFinal
            ? { nextStage: "final-approach", reason: "tunnel-entry-depth-reached" }
            : null;
    }

    if (stage === "final-approach") {
        const finalApproachElapsedMs = nowMs - stageStartedAtMs;
        const reacquireEligible = (
            finalApproachElapsedMs >= config.finalReacquireMinElapsedMs
            && (nowMs - lastFinalReacquireAtMs) >= config.finalReacquireCooldownMs
            && distanceToPortKm > config.finalReacquireMinDistanceKm
            && (
                reticleAlignmentCosine <= config.finalReacquireAlignmentCosine
                || corridorLateralOffsetKm >= config.finalReacquireCorridorMinKm
            )
        );
        return reacquireEligible
            ? { nextStage: "hold-align", reason: "final-approach-reacquire" }
            : null;
    }

    return null;
};

export const resolveDockingRotationMatch = (params: {
    stage: DockingApproachStage;
    rotationMatchEnabled: boolean;
    rotationMatchLatched: boolean;
    distanceToPortKm: number;
    reticleAlignmentCosine: number;
    corridorLateralOffsetKm: number;
    config: DockingRotationMatchConfig;
}): boolean => {
    const {
        stage,
        rotationMatchEnabled,
        rotationMatchLatched,
        distanceToPortKm,
        reticleAlignmentCosine,
        corridorLateralOffsetKm,
        config,
    } = params;
    if (!rotationMatchEnabled || stage === "hold-entry") {
        return false;
    }

    const inRange = distanceToPortKm <= config.rotationMatchMaxDistanceKm;
    const matchDistanceLimit = stage === "final-approach"
        ? config.rotationMatchFinalDistanceKm
        : config.rotationMatchMaxDistanceKm;
    const matchAlignmentThreshold = stage === "final-approach"
        ? config.rotationMatchFinalAlignmentCosine
        : config.rotationMatchHoldAlignAlignmentCosine;
    const matchCorridorMax = stage === "final-approach"
        ? config.rotationMatchFinalCorridorMaxKm
        : config.rotationMatchHoldAlignCorridorMaxKm;
    const releaseCorridorMax = stage === "final-approach"
        ? config.rotationMatchReleaseFinalCorridorMaxKm
        : config.rotationMatchReleaseCorridorMaxKm;

    const shouldMatchStationRotation = (
        inRange
        && distanceToPortKm <= matchDistanceLimit
        && reticleAlignmentCosine >= matchAlignmentThreshold
        && corridorLateralOffsetKm <= matchCorridorMax
    );
    const shouldKeepRotationMatch = (
        rotationMatchLatched
        && inRange
        && distanceToPortKm <= matchDistanceLimit
        && reticleAlignmentCosine >= config.rotationMatchReleaseAlignmentCosine
        && corridorLateralOffsetKm <= releaseCorridorMax
    );
    return shouldMatchStationRotation || shouldKeepRotationMatch;
};

export const resolveDockingCompletionWindow = (params: {
    finalApproachElapsedMs: number;
    distanceToPortKm: number;
    tunnelPenetrationDepthKm: number;
    reticleAlignmentCosine: number;
    corridorLateralOffsetKm: number;
    shipSpeedKmPerSec: number;
    distanceToApproachPointKm: number;
    screenValidity: DockingScreenValidity;
    config: DockingCompletionConfig;
}): DockingCompletionWindow => {
    const {
        finalApproachElapsedMs,
        distanceToPortKm,
        tunnelPenetrationDepthKm,
        reticleAlignmentCosine,
        corridorLateralOffsetKm,
        shipSpeedKmPerSec,
        distanceToApproachPointKm,
        screenValidity,
        config,
    } = params;

    const hardLockWindowReached = (
        distanceToPortKm <= config.finalHardLockThresholdKm
        && tunnelPenetrationDepthKm >= config.completeMinTunnelPenetrationKm
        && reticleAlignmentCosine >= config.finalHardLockAlignmentCosine
        && corridorLateralOffsetKm <= config.finalInsidePortCorridorMaxKm
        && shipSpeedKmPerSec <= config.finalInsidePortMaxSpeed
        && screenValidity.portCenteredOnScreen
    );
    if (hardLockWindowReached) {
        return { completed: true, reason: "hard-lock-window" };
    }

    const insidePortWindowReached = (
        distanceToPortKm <= config.finalInsidePortThresholdKm
        && tunnelPenetrationDepthKm >= config.completeStrictTunnelPenetrationKm
        && distanceToApproachPointKm <= config.finalInsidePortApproachMaxKm
        && corridorLateralOffsetKm <= config.finalInsidePortCorridorMaxKm
        && shipSpeedKmPerSec <= config.finalInsidePortMaxSpeed
        && screenValidity.portCenteredOnScreen
    );
    if (insidePortWindowReached) {
        return { completed: true, reason: "inside-port-window" };
    }

    const nearPortWindowReached = (
        distanceToPortKm <= config.finalNearPortThresholdKm
        && tunnelPenetrationDepthKm >= config.completeStrictTunnelPenetrationKm
        && distanceToApproachPointKm <= config.finalNearPortApproachMaxKm
        && corridorLateralOffsetKm <= config.finalNearPortCorridorMaxKm
        && shipSpeedKmPerSec <= config.finalNearPortMaxSpeed
        && screenValidity.portStrictlyCenteredOnScreen
    );
    if (nearPortWindowReached) {
        return { completed: true, reason: "near-port-window" };
    }

    if (finalApproachElapsedMs < config.finalStageMinDurationMs) {
        return { completed: false, reason: null };
    }

    const directPortWindowReached = (
        distanceToPortKm <= config.portThresholdKm
        && tunnelPenetrationDepthKm >= config.completeStrictTunnelPenetrationKm
        && reticleAlignmentCosine >= config.directPortAlignmentCosine
        && corridorLateralOffsetKm <= config.directPortCorridorMaxKm
        && distanceToApproachPointKm <= config.directPortApproachMaxKm
        && shipSpeedKmPerSec <= config.directPortMaxSpeed
        && screenValidity.portStrictlyCenteredOnScreen
    );
    if (directPortWindowReached) {
        return { completed: true, reason: "direct-port-window" };
    }

    const fallbackWindowReached = (
        finalApproachElapsedMs >= config.finalStageForceCompleteMs
        && distanceToPortKm <= config.portFallbackThresholdKm
        && tunnelPenetrationDepthKm >= config.completeMinTunnelPenetrationKm
        && distanceToApproachPointKm <= config.portThresholdKm
        && reticleAlignmentCosine >= config.fallbackAlignmentCosine
        && corridorLateralOffsetKm <= config.fallbackCorridorMaxKm
        && shipSpeedKmPerSec <= config.directPortMaxSpeed
        && screenValidity.portCenteredOnScreen
    );
    return fallbackWindowReached
        ? { completed: true, reason: "fallback-window" }
        : { completed: false, reason: null };
};