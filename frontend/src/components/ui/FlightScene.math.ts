/**
 * Keep flight angle math in a standalone module so math-only tests do not
 * import the full FlightScene tree (Three.js / React Three Fiber runtime).
 */
const FULL_TURN_RADIANS = Math.PI * 2;
const MANUAL_PITCH_RATE = 1.2;

const clamp = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) {
        return min;
    }
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

export const normalizeSignedAngle = (angle: number): number => {
    if (!Number.isFinite(angle)) {
        return 0;
    }
    const wrapped = (angle + Math.PI) % FULL_TURN_RADIANS;
    const normalized = wrapped < 0
        ? wrapped + FULL_TURN_RADIANS
        : wrapped;
    return normalized - Math.PI;
};

export const advanceManualPitch = (
    currentPitchRadians: number,
    pitchInput: number,
    deltaSeconds: number,
): number => normalizeSignedAngle(
    currentPitchRadians + pitchInput * MANUAL_PITCH_RATE * deltaSeconds,
);

export const normalizeHeading = (angleRadians: number): number => {
    if (!Number.isFinite(angleRadians)) {
        return 0;
    }
    const wrapped = angleRadians % FULL_TURN_RADIANS;
    return wrapped < 0 ? wrapped + FULL_TURN_RADIANS : wrapped;
};

export const shortestAngleDelta = (
    fromHeadingRadians: number,
    toHeadingRadians: number,
): number => {
    const normalizedFrom = normalizeHeading(fromHeadingRadians);
    const normalizedTo = normalizeHeading(toHeadingRadians);
    let delta = normalizedTo - normalizedFrom;
    if (delta > Math.PI) {
        delta -= FULL_TURN_RADIANS;
    } else if (delta < -Math.PI) {
        delta += FULL_TURN_RADIANS;
    }
    return delta;
};

export const desiredDockingPitchFromDirection = (
    normalizedDirectionY: number,
    maxPitchRadians: number,
): number => clamp(
    Math.asin(clamp(normalizedDirectionY, -1, 1)),
    -Math.abs(maxPitchRadians),
    Math.abs(maxPitchRadians),
);

export const desiredDockingYawFromDirection = (
    normalizedDirectionX: number,
    normalizedDirectionZ: number,
): number => normalizeHeading(Math.atan2(-normalizedDirectionX, -normalizedDirectionZ));

export const advanceDockingAttitude = (params: {
    currentYawRadians: number;
    currentPitchRadians: number;
    desiredYawRadians: number;
    desiredPitchRadians: number;
    maxPitchRadians: number;
    maxYawRateRadPerSec: number;
    maxPitchRateRadPerSec: number;
    deltaSeconds: number;
}): { yawRadians: number; pitchRadians: number } => {
    const {
        currentYawRadians,
        currentPitchRadians,
        desiredYawRadians,
        desiredPitchRadians,
        maxPitchRadians,
        maxYawRateRadPerSec,
        maxPitchRateRadPerSec,
        deltaSeconds,
    } = params;

    const yawDelta = shortestAngleDelta(currentYawRadians, desiredYawRadians);
    const yawStep = clamp(
        yawDelta,
        -(Math.max(0, maxYawRateRadPerSec) * Math.max(0, deltaSeconds)),
        Math.max(0, maxYawRateRadPerSec) * Math.max(0, deltaSeconds),
    );
    const nextYaw = normalizeHeading(currentYawRadians + yawStep);

    const pitchDelta = desiredPitchRadians - currentPitchRadians;
    const pitchStep = clamp(
        pitchDelta,
        -(Math.max(0, maxPitchRateRadPerSec) * Math.max(0, deltaSeconds)),
        Math.max(0, maxPitchRateRadPerSec) * Math.max(0, deltaSeconds),
    );
    const nextPitch = clamp(
        currentPitchRadians + pitchStep,
        -Math.abs(maxPitchRadians),
        Math.abs(maxPitchRadians),
    );

    return {
        yawRadians: nextYaw,
        pitchRadians: nextPitch,
    };
};

export type ProjectedCameraSpacePoint = {
    depth: number;
    ndcX: number;
    ndcY: number;
    inFront: boolean;
    inView: boolean;
};

export const projectCameraSpacePointToNdc = (params: {
    cameraSpaceX: number;
    cameraSpaceY: number;
    cameraSpaceZ: number;
    verticalFovDegrees: number;
    aspectRatio: number;
}): ProjectedCameraSpacePoint => {
    const {
        cameraSpaceX,
        cameraSpaceY,
        cameraSpaceZ,
        verticalFovDegrees,
        aspectRatio,
    } = params;

    const depth = -cameraSpaceZ;
    if (
        !Number.isFinite(depth)
        || depth <= 0
        || !Number.isFinite(verticalFovDegrees)
        || verticalFovDegrees <= 0
        || !Number.isFinite(aspectRatio)
        || aspectRatio <= 0
    ) {
        return {
            depth,
            ndcX: Number.POSITIVE_INFINITY,
            ndcY: Number.POSITIVE_INFINITY,
            inFront: false,
            inView: false,
        };
    }

    const halfVerticalSpan = Math.tan((verticalFovDegrees * Math.PI) / 360) * depth;
    const halfHorizontalSpan = halfVerticalSpan * aspectRatio;
    if (halfVerticalSpan <= 0 || halfHorizontalSpan <= 0) {
        return {
            depth,
            ndcX: Number.POSITIVE_INFINITY,
            ndcY: Number.POSITIVE_INFINITY,
            inFront: true,
            inView: false,
        };
    }

    const ndcX = cameraSpaceX / halfHorizontalSpan;
    const ndcY = cameraSpaceY / halfVerticalSpan;
    return {
        depth,
        ndcX,
        ndcY,
        inFront: true,
        inView: Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1,
    };
};

export type ProjectedCameraSpaceSphere = {
    depth: number;
    ndcX: number;
    ndcY: number;
    ndcRadiusX: number;
    ndcRadiusY: number;
    inFront: boolean;
    centerInView: boolean;
    sphereInView: boolean;
};

export const projectCameraSpaceSphereToNdc = (params: {
    cameraSpaceX: number;
    cameraSpaceY: number;
    cameraSpaceZ: number;
    radius: number;
    verticalFovDegrees: number;
    aspectRatio: number;
    marginX?: number;
    marginY?: number;
}): ProjectedCameraSpaceSphere => {
    const {
        cameraSpaceX,
        cameraSpaceY,
        cameraSpaceZ,
        radius,
        verticalFovDegrees,
        aspectRatio,
        marginX = 0,
        marginY = 0,
    } = params;

    const pointProjection = projectCameraSpacePointToNdc({
        cameraSpaceX,
        cameraSpaceY,
        cameraSpaceZ,
        verticalFovDegrees,
        aspectRatio,
    });
    if (!pointProjection.inFront) {
        return {
            depth: pointProjection.depth,
            ndcX: pointProjection.ndcX,
            ndcY: pointProjection.ndcY,
            ndcRadiusX: 0,
            ndcRadiusY: 0,
            inFront: false,
            centerInView: false,
            sphereInView: false,
        };
    }

    const depth = pointProjection.depth;
    const effectiveRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    const verticalMargin = Math.max(0, marginY);
    const horizontalMargin = Math.max(0, marginX);
    const centerInView = (
        Math.abs(pointProjection.ndcX) <= (1 + horizontalMargin)
        && Math.abs(pointProjection.ndcY) <= (1 + verticalMargin)
    );

    if (effectiveRadius <= 0) {
        return {
            depth,
            ndcX: pointProjection.ndcX,
            ndcY: pointProjection.ndcY,
            ndcRadiusX: 0,
            ndcRadiusY: 0,
            inFront: true,
            centerInView,
            sphereInView: centerInView,
        };
    }

    if (depth <= effectiveRadius) {
        return {
            depth,
            ndcX: pointProjection.ndcX,
            ndcY: pointProjection.ndcY,
            ndcRadiusX: Number.POSITIVE_INFINITY,
            ndcRadiusY: Number.POSITIVE_INFINITY,
            inFront: true,
            centerInView,
            sphereInView: true,
        };
    }

    const halfVerticalSpan = Math.tan((verticalFovDegrees * Math.PI) / 360) * depth;
    const halfHorizontalSpan = halfVerticalSpan * aspectRatio;
    if (halfVerticalSpan <= 0 || halfHorizontalSpan <= 0) {
        return {
            depth,
            ndcX: pointProjection.ndcX,
            ndcY: pointProjection.ndcY,
            ndcRadiusX: 0,
            ndcRadiusY: 0,
            inFront: true,
            centerInView,
            sphereInView: centerInView,
        };
    }

    const ndcRadiusX = effectiveRadius / halfHorizontalSpan;
    const ndcRadiusY = effectiveRadius / halfVerticalSpan;
    const sphereInView = (
        Math.abs(pointProjection.ndcX) <= (1 + horizontalMargin + ndcRadiusX)
        && Math.abs(pointProjection.ndcY) <= (1 + verticalMargin + ndcRadiusY)
    );

    return {
        depth,
        ndcX: pointProjection.ndcX,
        ndcY: pointProjection.ndcY,
        ndcRadiusX,
        ndcRadiusY,
        inFront: true,
        centerInView,
        sphereInView,
    };
};

export const resolveProjectedSphereLabelAnchorNdc = (params: {
    projectedSphere: ProjectedCameraSpaceSphere;
    targetNdcX?: number;
    targetNdcY?: number;
    limbThresholdNdc?: number;
}): { ndcX: number; ndcY: number; usesLimbAnchor: boolean } => {
    const {
        projectedSphere,
        targetNdcX = 0,
        targetNdcY = 0,
        limbThresholdNdc = 0.35,
    } = params;

    const fallback = {
        ndcX: projectedSphere.ndcX,
        ndcY: projectedSphere.ndcY,
        usesLimbAnchor: false,
    };

    if (!projectedSphere.inFront || !projectedSphere.sphereInView) {
        return fallback;
    }

    const useLimbAnchor = (
        !projectedSphere.centerInView
        || projectedSphere.ndcRadiusX >= limbThresholdNdc
        || projectedSphere.ndcRadiusY >= limbThresholdNdc
    );
    if (!useLimbAnchor) {
        return fallback;
    }

    if (!Number.isFinite(projectedSphere.ndcRadiusX) || !Number.isFinite(projectedSphere.ndcRadiusY)) {
        return {
            ndcX: targetNdcX,
            ndcY: targetNdcY,
            usesLimbAnchor: true,
        };
    }

    if (projectedSphere.ndcRadiusX <= 0 || projectedSphere.ndcRadiusY <= 0) {
        return fallback;
    }

    let directionX = targetNdcX - projectedSphere.ndcX;
    let directionY = targetNdcY - projectedSphere.ndcY;
    if (Math.abs(directionX) < 1e-6 && Math.abs(directionY) < 1e-6) {
        directionX = 0;
        directionY = -1;
    }

    const denominator = Math.sqrt(
        ((directionX * directionX) / (projectedSphere.ndcRadiusX * projectedSphere.ndcRadiusX))
        + ((directionY * directionY) / (projectedSphere.ndcRadiusY * projectedSphere.ndcRadiusY)),
    );
    if (!Number.isFinite(denominator) || denominator <= 0) {
        return fallback;
    }

    const scale = 1 / denominator;
    return {
        ndcX: projectedSphere.ndcX + (directionX * scale),
        ndcY: projectedSphere.ndcY + (directionY * scale),
        usesLimbAnchor: true,
    };
};

export const resolveScannerReferenceVector = (params: {
    contactType: "ship" | "station" | "planet" | "moon" | "star";
    centerX: number;
    centerY: number;
    centerZ: number;
    displayedDistanceKm: number;
}): { x: number; y: number; z: number } => {
    const {
        contactType,
        centerX,
        centerY,
        centerZ,
        displayedDistanceKm,
    } = params;

    const centerDistanceKm = Math.hypot(centerX, centerY, centerZ);
    if (
        !Number.isFinite(centerDistanceKm)
        || centerDistanceKm <= 0
        || !Number.isFinite(displayedDistanceKm)
    ) {
        return {
            x: centerX,
            y: centerY,
            z: centerZ,
        };
    }

    const shouldUseSurfaceVector = (
        (contactType === "planet" || contactType === "moon" || contactType === "star")
        && displayedDistanceKm >= 0
        && displayedDistanceKm < centerDistanceKm
    );
    if (!shouldUseSurfaceVector) {
        return {
            x: centerX,
            y: centerY,
            z: centerZ,
        };
    }

    const scale = displayedDistanceKm / centerDistanceKm;
    return {
        x: centerX * scale,
        y: centerY * scale,
        z: centerZ * scale,
    };
};

export const resolveContactDistanceKm = (params: {
    contactType: "ship" | "station" | "planet" | "moon" | "star";
    centerDistanceKm: number;
    radiusKm?: number | null;
    dockingPortDistanceKm?: number | null;
    useDockingPortDistance?: boolean;
}): { distanceKm: number; mode: "surface" | "port" } => {
    const {
        contactType,
        centerDistanceKm,
        radiusKm,
        dockingPortDistanceKm,
        useDockingPortDistance = false,
    } = params;

    if (useDockingPortDistance && Number.isFinite(dockingPortDistanceKm)) {
        return {
            distanceKm: Math.max(0, Number(dockingPortDistanceKm)),
            mode: "port",
        };
    }

    if (contactType === "station" || contactType === "planet" || contactType === "moon" || contactType === "star") {
        const effectiveRadiusKm = Number.isFinite(radiusKm) ? Math.max(0, Number(radiusKm)) : 0;
        return {
            distanceKm: Math.max(0, centerDistanceKm - effectiveRadiusKm),
            mode: "surface",
        };
    }

    return {
        distanceKm: Math.max(0, centerDistanceKm),
        mode: "surface",
    };
};

export const resolveCelestialRenderRadius = (params: {
    bodyKind: "star" | "planet" | "moon";
    bodyType?: string | null;
    radiusKm?: number | null;
    distanceKm?: number | null;
}): number => {
    const {
        bodyKind,
        bodyType,
        radiusKm,
        distanceKm,
    } = params;

    const effectiveRadiusKm = Number.isFinite(radiusKm)
        ? Math.max(0, Number(radiusKm))
        : 0;
    const surfaceDistanceKm = Number.isFinite(distanceKm)
        ? Math.max(0, Number(distanceKm))
        : Number.POSITIVE_INFINITY;

    if (bodyKind !== "star" && effectiveRadiusKm > 0) {
        const physicalRenderThresholdKm = Math.max(5_000, effectiveRadiusKm * 3);
        if (surfaceDistanceKm <= physicalRenderThresholdKm) {
            return effectiveRadiusKm;
        }
    }

    if (effectiveRadiusKm > 0) {
        const normalized = Math.log10(Math.max(1, effectiveRadiusKm));
        const scaled = 3.1 + ((normalized - 2) * 1.72);
        const normalizedBodyType = (bodyType || "").trim().toLowerCase();
        if (bodyKind === "star") {
            if (normalizedBodyType === "m-class") {
                return clamp(scaled, 10.5, 18.5);
            }
            return clamp(scaled, 13.8, 24.5);
        }
        if (bodyKind === "moon") {
            return clamp(scaled, 1.2, 3.2);
        }
        if (normalizedBodyType === "gas-giant") {
            return clamp(scaled, 8.5, 16.8);
        }
        return clamp(scaled, 3.6, 8.2);
    }

    if (bodyKind === "star") {
        return 14;
    }
    if (bodyKind === "planet") {
        return 4.5;
    }
    return 0.7;
};
