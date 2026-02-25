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
