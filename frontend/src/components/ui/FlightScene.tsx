"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, RefObject } from "react";
import { DoubleSide, Euler, Quaternion, Vector3 } from "three";
import type { Group, Mesh, PerspectiveCamera } from "three";
import {
    advanceDockingAttitude,
    advanceManualPitch,
    desiredDockingPitchFromDirection,
    desiredDockingYawFromDirection,
    projectCameraSpaceSphereToNdc,
    normalizeSignedAngle,
    projectCameraSpacePointToNdc,
    resolveCelestialRenderRadius,
    resolveContactDistanceKm,
    resolveProjectedSphereLabelAnchorNdc,
    resolveScannerReferenceVector,
} from "./FlightScene.math";
import {
    calculateDockingCameraPresentationBlend,
    calculateDockingScreenValidity,
    resolveDockingCompletionWindow,
    resolveDockingRotationMatch,
    resolveDockingStageTransition,
} from "./FlightScene.docking";
import type { DockingApproachStage } from "./FlightScene.docking";
import styles from "./FlightScene.module.css";

type ScannerAnchorContact = {
    id: string;
    contact_type: "ship" | "station" | "planet" | "moon" | "star";
    body_kind?: "star" | "planet" | "moon";
    body_type?: string | null;
    radius_km?: number | null;
    name: string;
    distance_km: number;
    relative_x_km?: number;
    relative_y_km?: number;
    relative_z_km?: number;
    scene_x: number;
    scene_y: number;
    scene_z: number;
    orbiting_planet_name?: string | null;
    station_archetype_shape?: string | null;
    ship_visual_key?: string | null;
};

type CelestialPresentationAnchor = {
    id: string;
    contact_type: "planet" | "moon" | "star";
    name: string;
    distance_km: number;
    orbiting_planet_name?: string | null;
    body_kind: "star" | "planet" | "moon";
    body_type?: string | null;
    radius_km?: number | null;
    relative_x_km?: number;
    relative_y_km?: number;
    relative_z_km?: number;
    presentation_x: number;
    presentation_y: number;
    presentation_z: number;
};

type FlightSceneSpawnDirective = {
    mode: "undock-exit";
    stationContactId: string;
    nonce: number;
};

type FlightCameraMode = "boresight" | "cockpit";

type FlightSceneProps = {
    jumpPhase:
    | "idle"
    | "docking-approach"
    | "docking-transit-internal"
    | "undocking-transit-internal"
    | "destination-locked"
    | "charging"
    | "jumping"
    | "arrived"
    | "error";
    jumpProgress: number;
    renderProfile: "performance" | "balanced" | "cinematic";
    cameraMode?: FlightCameraMode;
    shipVisualKey?: string | null;
    stationShapeKey?: string | null;
    transitStationLabel?: string | null;
    focusedContact: ScannerAnchorContact | null;
    scannerRangeKm?: number;
    scannerContacts: ScannerAnchorContact[];
    celestialAnchors: CelestialPresentationAnchor[];
    onSpeedChange?: (speed: number) => void;
    onRollChange?: (rollDegrees: number) => void;
    onScannerTelemetryChange?: (contacts: ScannerTelemetryContact[]) => void;
    onCollision?: (event: FlightSceneCollisionEvent) => void;
    dockingApproachContactId?: string | null;
    waypointContactId?: string | null;
    onDockingApproachProgress?: (payload: {
        progress: number;
        distanceKm: number;
        targetName: string;
        stage: "hold-entry" | "hold-align" | "tunnel-entry" | "final-approach";
    }) => void;
    onDockingApproachComplete?: () => void;
    onDockingDebug?: (payload: DockingDebugPayload) => void;
    dockingRotationMatchEnabled?: boolean;
    showContactLabels?: boolean;
    spawnDirective?: FlightSceneSpawnDirective | null;
    onSpawnDirectiveApplied?: (nonce: number) => void;
};

type FlightSceneContactLabel = {
    id: string;
    name: string;
    leftPercent: number;
    topPercent: number;
    isSelected: boolean;
};

type FlightSceneCollisionEvent = {
    contactId: string;
    contactType: ScannerAnchorContact["contact_type"];
    contactName: string;
    distance: number;
    speed: number;
    severity: "glancing" | "critical";
};

type DockingDebugPayload = {
    event:
    | "contact-missing"
    | "target-acquired"
    | "stage-transition"
    | "telemetry"
    | "complete-window";
    jumpPhase: FlightSceneProps["jumpPhase"];
    contactId: string;
    targetName?: string;
    stage?: DockingApproachStage;
    reason?: string;
    distanceToPortKm?: number;
    distanceToApproachPointKm?: number;
    stageDistanceRemainingKm?: number;
    reticleAlignmentCosine?: number;
    corridorLateralOffsetKm?: number;
    shouldMatchStationRotation?: boolean;
    stationRotationRadians?: number;
    shipSpeedKmPerSec?: number;
    shipPosition?: { x: number; y: number; z: number };
    portCorePosition?: { x: number; y: number; z: number };
    portApproachPosition?: { x: number; y: number; z: number };
    stationCenter?: { x: number; y: number; z: number };
    portVisibleOnScreen?: boolean;
    portCenteredOnScreen?: boolean;
    portScreenOffsetX?: number;
    portScreenOffsetY?: number;
    portScreenDepthKm?: number;
};

type ScannerTelemetryContact = {
    id: string;
    relative_x: number;
    relative_y: number;
    relative_z: number;
    relative_x_km?: number;
    relative_y_km?: number;
    relative_z_km?: number;
    forward_distance: number;
    plane_x: number;
    plane_y: number;
    altitude: number;
    in_view: boolean;
    fov_x: number;
    fov_y: number;
    horizontal_fov_degrees: number;
    vertical_fov_degrees: number;
    distance: number;
    distance_mode: "surface" | "port";
    label_fov_x?: number;
    label_fov_y?: number;
};

type InputState = {
    yawLeft: boolean;
    yawRight: boolean;
    rollLeft: boolean;
    rollRight: boolean;
    throttleUp: boolean;
    throttleDown: boolean;
    throttleToZero: boolean;
    pitchUp: boolean;
    pitchDown: boolean;
};

const clamp = (value: number, min: number, max: number): number => {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

const FORWARD_SPEED_LIMIT = 12;
const REVERSE_SPEED_LIMIT = -5;
const FORWARD_ACCELERATION = 7.5;
const REVERSE_ACCELERATION = 6;
const FULL_TURN_RADIANS = Math.PI * 2;
const ROLL_RATE = 1.6;
const AUTOPILOT_MAX_PITCH_RADIANS = Math.PI * 0.47;
const COBRA_TRAFFIC_LOD_BUDGET_BY_PROFILE: Record<FlightSceneProps["renderProfile"], number> = {
    performance: 2,
    balanced: 4,
    cinematic: 6,
};
const STATION_LOD_BUDGET_BY_PROFILE: Record<FlightSceneProps["renderProfile"], number> = {
    performance: 3,
    balanced: 5,
    cinematic: 7,
};
const CELESTIAL_LOD_BUDGET_BY_PROFILE: Record<FlightSceneProps["renderProfile"], number> = {
    performance: 10,
    balanced: 14,
    cinematic: 20,
};
const CELESTIAL_SPHERE_SEGMENTS_BY_TIER = {
    near: 20,
    mid: 14,
    far: 9,
};
const CELESTIAL_OVERLAY_SEGMENTS_BY_TIER = {
    near: 18,
    mid: 12,
    far: 8,
};
const CELESTIAL_LOD_DISTANCE_KM = {
    near: 140_000,
    mid: 880_000,
};
const LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM = 1;

const normalizeHeading = (angle: number): number => {
    if (!Number.isFinite(angle)) {
        return 0;
    }
    const wrapped = angle % FULL_TURN_RADIANS;
    return wrapped < 0 ? wrapped + FULL_TURN_RADIANS : wrapped;
};

function anchorColor(contactType: ScannerAnchorContact["contact_type"]): string {
    if (contactType === "star") {
        return "#ffe8aa";
    }
    if (contactType === "planet") {
        return "#8ec9ff";
    }
    if (contactType === "moon") {
        return "#9fd6b8";
    }
    if (contactType === "station") {
        return "#67dcbe";
    }
    return "#8fb3ff";
}

function resolveCelestialAnchorColor(contact: CelestialPresentationAnchor): string {
    const bodyKind = contact.body_kind;
    const bodyType = (contact.body_type || "").trim().toLowerCase();

    if (bodyKind === "star") {
        if (bodyType === "m-class") {
            return "#ff9a7a";
        }
        if (bodyType === "k-class") {
            return "#ffc27a";
        }
        return "#ffe8aa";
    }

    if (bodyKind === "moon") {
        if (bodyType === "ice") {
            return "#c8eaff";
        }
        return "#9fd6b8";
    }

    if (bodyKind === "planet") {
        if (bodyType === "gas-giant") {
            return "#d4b877";
        }
        if (bodyType === "oceanic") {
            return "#72baff";
        }
        if (bodyType === "desert") {
            return "#d9b581";
        }
        if (bodyType === "volcanic") {
            return "#ff9a72";
        }
        return "#8ec9ff";
    }

    return anchorColor(contact.contact_type);
}

function resolveCelestialAnchorSize(contact: CelestialPresentationAnchor): number {
    return resolveCelestialRenderRadius({
        bodyKind: contact.body_kind,
        bodyType: contact.body_type,
        radiusKm: contact.radius_km,
        distanceKm: contact.distance_km,
    });
}

function resolveCelestialLodTier(contact: CelestialPresentationAnchor): "near" | "mid" | "far" {
    const distanceKm = Number(contact.distance_km);
    if (!Number.isFinite(distanceKm)) {
        return "mid";
    }
    if (distanceKm <= CELESTIAL_LOD_DISTANCE_KM.near) {
        return "near";
    }
    if (distanceKm <= CELESTIAL_LOD_DISTANCE_KM.mid) {
        return "mid";
    }
    return "far";
}

function resolveCelestialSphereSegments(contact: CelestialPresentationAnchor): [number, number] {
    const tier = resolveCelestialLodTier(contact);
    const baseSegments = CELESTIAL_SPHERE_SEGMENTS_BY_TIER[tier];
    if (contact.body_kind === "star") {
        return [baseSegments + 4, baseSegments + 4];
    }
    return [baseSegments, baseSegments];
}

function resolveCelestialOverlaySegments(contact: CelestialPresentationAnchor): [number, number] {
    const tier = resolveCelestialLodTier(contact);
    const baseSegments = CELESTIAL_OVERLAY_SEGMENTS_BY_TIER[tier];
    return [baseSegments, baseSegments];
}

function contactHashUnit(contact: CelestialPresentationAnchor): number {
    let hash = 2166136261;
    const key = `${contact.id}:${contact.name}:${contact.body_type ?? ""}`;
    for (let index = 0; index < key.length; index += 1) {
        hash ^= key.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
}

function resolveSurfaceAccentColor(contact: CelestialPresentationAnchor): string {
    const bodyType = (contact.body_type || "").trim().toLowerCase();
    if (bodyType === "oceanic") {
        return "#6fbf75";
    }
    if (bodyType === "desert") {
        return "#bf965e";
    }
    if (bodyType === "volcanic") {
        return "#6e2a25";
    }
    if (bodyType === "ice") {
        return "#d7efff";
    }
    if (bodyType === "gas-giant") {
        return "#cfa86b";
    }
    return "#6fa890";
}

function resolveCloudLayer(contact: CelestialPresentationAnchor): {
    color: string;
    opacity: number;
} | null {
    const bodyType = (contact.body_type || "").trim().toLowerCase();
    if (contact.body_kind === "moon" || contact.body_kind === "star") {
        return null;
    }
    if (bodyType === "desert") {
        return { color: "#e8ddcb", opacity: 0.12 };
    }
    if (bodyType === "volcanic") {
        return { color: "#f2a28c", opacity: 0.08 };
    }
    return { color: "#e8f4ff", opacity: 0.22 };
}

function shouldRenderPlanetRing(contact: CelestialPresentationAnchor): boolean {
    if (contact.body_kind !== "planet") {
        return false;
    }
    const bodyType = (contact.body_type || "").trim().toLowerCase();
    if (bodyType === "gas-giant") {
        return true;
    }
    return contactHashUnit(contact) > 0.9;
}

function contactHasPhysicalLocalCoordinates(contact: ScannerAnchorContact): boolean {
    return (
        Number.isFinite(contact.relative_x_km)
        && Number.isFinite(contact.relative_y_km)
        && Number.isFinite(contact.relative_z_km)
    );
}

function contactUsesPhysicalNearFieldSpace(contact: ScannerAnchorContact): boolean {
    return contactHasPhysicalLocalCoordinates(contact);
}

function resolveContactRenderPosition(
    contact: ScannerAnchorContact,
    out: Vector3,
): Vector3 {
    if (contactUsesPhysicalNearFieldSpace(contact)) {
        return out.set(
            Number(contact.relative_x_km) * LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM,
            Number(contact.relative_y_km) * LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM,
            Number(contact.relative_z_km) * LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM,
        );
    }

    return out.set(contact.scene_x, contact.scene_y, contact.scene_z);
}

function sceneAnchorPosition(contact: ScannerAnchorContact): [number, number, number] {
    if (contactUsesPhysicalNearFieldSpace(contact)) {
        return [
            Number(contact.relative_x_km) * LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM,
            Number(contact.relative_y_km) * LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM,
            Number(contact.relative_z_km) * LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM,
        ];
    }
    return [contact.scene_x, contact.scene_y, contact.scene_z];
}

function celestialAnchorPosition(anchor: CelestialPresentationAnchor): [number, number, number] {
    if (
        Number.isFinite(anchor.relative_x_km)
        && Number.isFinite(anchor.relative_y_km)
        && Number.isFinite(anchor.relative_z_km)
    ) {
        return [
            Number(anchor.relative_x_km) * LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM,
            Number(anchor.relative_y_km) * LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM,
            Number(anchor.relative_z_km) * LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM,
        ];
    }
    return [anchor.presentation_x, anchor.presentation_y, anchor.presentation_z];
}

function resolveContactMarkerPosition(
    contact: ScannerAnchorContact,
    celestialAnchor: CelestialPresentationAnchor | null,
): [number, number, number] {
    void celestialAnchor;
    return sceneAnchorPosition(contact);
}

type ShipVisualKey = "cobra-mk1" | "default";

function resolveShipVisualKey(shape: string | null | undefined): ShipVisualKey {
    const normalized = shape?.trim().toLowerCase();
    if (normalized === "cobra-mk1") {
        return "cobra-mk1";
    }
    return "default";
}

function ShipModelGeometry({
    visualKey,
}: {
    visualKey: ShipVisualKey;
}): ReactElement {
    if (visualKey === "default") {
        return (
            <group>
                <mesh position={[0, 0, 0.18]}>
                    <coneGeometry args={[0.1, 0.5, 10]} />
                    <meshStandardMaterial metalness={0.55} roughness={0.36} />
                </mesh>
                <mesh position={[0, -0.02, -0.05]}>
                    <boxGeometry args={[0.3, 0.04, 0.14]} />
                    <meshStandardMaterial metalness={0.55} roughness={0.36} />
                </mesh>
                <mesh position={[0, -0.05, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.025, 0.025, 0.06, 8]} />
                    <meshStandardMaterial emissive="#67d8ff" emissiveIntensity={0.8} metalness={0.18} roughness={0.3} />
                </mesh>
            </group>
        );
    }

    return (
        <group scale={[1.35, 1, 1.25]}>
            <mesh position={[0, 0.01, 0.1]} rotation={[Math.PI / 2, Math.PI / 4, 0]}>
                <cylinderGeometry args={[0.03, 0.31, 0.92, 4]} />
                <meshStandardMaterial
                    color="#a8afb7"
                    emissive="#1b2633"
                    emissiveIntensity={0.12}
                    metalness={0.62}
                    roughness={0.34}
                />
            </mesh>

            <mesh position={[0, -0.06, -0.04]}>
                <boxGeometry args={[0.56, 0.06, 0.7]} />
                <meshStandardMaterial
                    color="#979ea7"
                    emissive="#17212d"
                    emissiveIntensity={0.1}
                    metalness={0.58}
                    roughness={0.38}
                />
            </mesh>

            <mesh position={[-0.22, -0.035, 0.02]} rotation={[0.05, 0, -0.17]}>
                <boxGeometry args={[0.34, 0.028, 0.22]} />
                <meshStandardMaterial
                    color="#979ea7"
                    emissive="#17212d"
                    emissiveIntensity={0.1}
                    metalness={0.56}
                    roughness={0.36}
                />
            </mesh>
            <mesh position={[0.22, -0.035, 0.02]} rotation={[0.05, 0, 0.17]}>
                <boxGeometry args={[0.34, 0.028, 0.22]} />
                <meshStandardMaterial
                    color="#979ea7"
                    emissive="#17212d"
                    emissiveIntensity={0.1}
                    metalness={0.56}
                    roughness={0.36}
                />
            </mesh>

            <mesh position={[0, 0.065, 0.16]}>
                <boxGeometry args={[0.12, 0.03, 0.16]} />
                <meshStandardMaterial emissive="#2b5d82" emissiveIntensity={0.34} metalness={0.22} roughness={0.16} />
            </mesh>

            <mesh position={[0, 0.045, 0.14]}>
                <boxGeometry args={[0.015, 0.01, 0.32]} />
                <meshStandardMaterial color="#b8bec6" metalness={0.4} roughness={0.34} />
            </mesh>

            <mesh position={[-0.11, 0.02, 0.04]} rotation={[0, 0, -0.12]}>
                <boxGeometry args={[0.012, 0.012, 0.42]} />
                <meshStandardMaterial color="#b8bec6" metalness={0.38} roughness={0.34} />
            </mesh>
            <mesh position={[0.11, 0.02, 0.04]} rotation={[0, 0, 0.12]}>
                <boxGeometry args={[0.012, 0.012, 0.42]} />
                <meshStandardMaterial color="#b8bec6" metalness={0.38} roughness={0.34} />
            </mesh>

            <mesh position={[-0.09, -0.065, -0.39]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.024, 0.024, 0.08, 10]} />
                <meshStandardMaterial emissive="#67d8ff" emissiveIntensity={0.95} metalness={0.2} roughness={0.28} />
            </mesh>
            <mesh position={[0.09, -0.065, -0.39]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.024, 0.024, 0.08, 10]} />
                <meshStandardMaterial emissive="#67d8ff" emissiveIntensity={0.95} metalness={0.2} roughness={0.28} />
            </mesh>
        </group>
    );
}

function ShipModel({
    shipVisualKey,
    scale,
}: {
    shipVisualKey: string | null | undefined;
    scale?: [number, number, number];
}): ReactElement {
    return (
        <group scale={scale}>
            <ShipModelGeometry visualKey={resolveShipVisualKey(shipVisualKey)} />
        </group>
    );
}

function PlayerShipModel({
    shipRef,
    shipVisualKey,
}: {
    shipRef: RefObject<Group | null>;
    shipVisualKey: string | null | undefined;
}): ReactElement {
    return (
        <group ref={shipRef} position={[0, 0, 0]} visible={false}>
            <ShipModel shipVisualKey={shipVisualKey} scale={[2.2, 1.7, 2.1]} />
        </group>
    );
}

function TrafficShipModel({
    shipVisualKey,
}: {
    shipVisualKey: string | null | undefined;
}): ReactElement {
    return <ShipModel shipVisualKey={shipVisualKey} />;
}

type StationShapeKey = "coriolis" | "orbis" | "default";

function resolveStationShapeKey(shape: string | null | undefined): StationShapeKey {
    const normalizedShape = shape?.trim().toLowerCase();
    if (normalizedShape === "coriolis") {
        return "coriolis";
    }
    if (normalizedShape === "orbis") {
        return "orbis";
    }
    return "default";
}

const STATION_BASE_RADIUS_BY_SHAPE: Record<StationShapeKey, number> = {
    coriolis: 5.9,
    orbis: 4.9,
    default: 5.9,
};

const STATION_DOCKING_PORT_LOCAL_ANCHOR_BY_SHAPE: Record<StationShapeKey, [number, number, number]> = {
    coriolis: [0, 0, 5.56],
    orbis: [0, 0, 5.1],
    default: [0, 0, 3.55],
};

const STATION_ROTATION_RATE_BY_SHAPE: Record<StationShapeKey, number> = {
    coriolis: 0.22,
    orbis: 0.14,
    default: 0.12,
};

function resolveStationRotationRadians(
    contact: ScannerAnchorContact,
    elapsedSeconds: number,
): number {
    const shape = resolveStationShapeKey(contact.station_archetype_shape);
    const rotationRate = STATION_ROTATION_RATE_BY_SHAPE[shape]
        ?? STATION_ROTATION_RATE_BY_SHAPE.default;
    const phaseSeed = `${contact.id}:${contact.name}`;
    let hash = 0;
    for (let index = 0; index < phaseSeed.length; index += 1) {
        hash = ((hash * 31) + phaseSeed.charCodeAt(index)) >>> 0;
    }
    const phaseRadians = ((hash % 360) * Math.PI) / 180;
    return (elapsedSeconds * rotationRate) + phaseRadians;
}

function resolveStationBaseRadius(shape: StationShapeKey): number {
    return STATION_BASE_RADIUS_BY_SHAPE[shape] ?? STATION_BASE_RADIUS_BY_SHAPE.default;
}

function resolveStationRenderScale(contact: ScannerAnchorContact): number {
    if (contactHasPhysicalLocalCoordinates(contact)) {
        return LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM;
    }
    return stationDistanceScale(contact.distance_km);
}

function resolveDockingPortWorldPosition(
    contact: ScannerAnchorContact,
    out: Vector3,
    elapsedSeconds: number,
    options?: { trackRotation?: boolean },
): Vector3 {
    const shape = resolveStationShapeKey(contact.station_archetype_shape);
    const distanceScale = resolveStationRenderScale(contact);
    const [localX, localY, localZ] = STATION_DOCKING_PORT_LOCAL_ANCHOR_BY_SHAPE[shape]
        ?? STATION_DOCKING_PORT_LOCAL_ANCHOR_BY_SHAPE.default;
    const rotationRadians = options?.trackRotation === false
        ? 0
        : resolveStationRotationRadians(contact, elapsedSeconds);
    const sinRotation = Math.sin(rotationRadians);
    const cosRotation = Math.cos(rotationRadians);
    const rotatedLocalX = (localX * cosRotation) - (localY * sinRotation);
    const rotatedLocalY = (localX * sinRotation) + (localY * cosRotation);

    resolveContactRenderPosition(contact, out);
    out.x += rotatedLocalX * distanceScale;
    out.y += rotatedLocalY * distanceScale;
    out.z += localZ * distanceScale;
    return out;
}

function RectDockingTunnelInsert({
    positionZ,
    outerWidth,
    outerHeight,
    innerWidth,
    innerHeight,
    depth,
    guideLightColor = "#89c8ff",
    guideFrameCount = 6,
    showLandingPadTerminus = false,
}: {
    positionZ: number;
    outerWidth: number;
    outerHeight: number;
    innerWidth: number;
    innerHeight: number;
    depth: number;
    guideLightColor?: string;
    guideFrameCount?: number;
    showLandingPadTerminus?: boolean;
}): ReactElement {
    const sideWallWidth = Math.max(0.06, (outerWidth - innerWidth) / 2);
    const topWallHeight = Math.max(0.06, (outerHeight - innerHeight) / 2);
    const sideOffsetX = (innerWidth / 2) + (sideWallWidth / 2);
    const topOffsetY = (innerHeight / 2) + (topWallHeight / 2);
    const lipDepth = Math.max(0.08, depth * 0.08);
    const frameThickness = Math.max(0.018, Math.min(innerWidth, innerHeight) * 0.044);
    const guideInset = frameThickness * 1.2;
    const guideStartZ = (depth / 2) - 0.34;
    const guideEndZ = (-depth / 2) + 0.4;
    const guideFrameSafeCount = Math.max(3, guideFrameCount);
    const backWallZ = (-depth / 2) + 0.06;

    return (
        <group position={[0, 0, positionZ]}>
            <mesh position={[-sideOffsetX, 0, 0]}>
                <boxGeometry args={[sideWallWidth, outerHeight, depth]} />
                <meshStandardMaterial
                    color="#04080f"
                    emissive="#08131d"
                    emissiveIntensity={0.16}
                    metalness={0.03}
                    roughness={0.96}
                />
            </mesh>
            <mesh position={[sideOffsetX, 0, 0]}>
                <boxGeometry args={[sideWallWidth, outerHeight, depth]} />
                <meshStandardMaterial
                    color="#04080f"
                    emissive="#08131d"
                    emissiveIntensity={0.16}
                    metalness={0.03}
                    roughness={0.96}
                />
            </mesh>
            <mesh position={[0, topOffsetY, 0]}>
                <boxGeometry args={[innerWidth, topWallHeight, depth]} />
                <meshStandardMaterial
                    color="#050a12"
                    emissive="#0a1622"
                    emissiveIntensity={0.14}
                    metalness={0.03}
                    roughness={0.96}
                />
            </mesh>
            <mesh position={[0, -topOffsetY, 0]}>
                <boxGeometry args={[innerWidth, topWallHeight, depth]} />
                <meshStandardMaterial
                    color="#050a12"
                    emissive="#0a1622"
                    emissiveIntensity={0.14}
                    metalness={0.03}
                    roughness={0.96}
                />
            </mesh>
            <mesh position={[0, topOffsetY, (depth / 2) - (lipDepth / 2)]}>
                <boxGeometry args={[innerWidth, topWallHeight * 0.88, lipDepth]} />
                <meshStandardMaterial
                    color="#0b1420"
                    emissive="#173148"
                    emissiveIntensity={0.26}
                    metalness={0.08}
                    roughness={0.82}
                />
            </mesh>
            <mesh position={[0, -topOffsetY, (depth / 2) - (lipDepth / 2)]}>
                <boxGeometry args={[innerWidth, topWallHeight * 0.88, lipDepth]} />
                <meshStandardMaterial
                    color="#0b1420"
                    emissive="#173148"
                    emissiveIntensity={0.26}
                    metalness={0.08}
                    roughness={0.82}
                />
            </mesh>
            <mesh position={[-sideOffsetX, 0, (depth / 2) - (lipDepth / 2)]}>
                <boxGeometry args={[sideWallWidth * 0.88, innerHeight, lipDepth]} />
                <meshStandardMaterial
                    color="#0b1420"
                    emissive="#173148"
                    emissiveIntensity={0.26}
                    metalness={0.08}
                    roughness={0.82}
                />
            </mesh>
            <mesh position={[sideOffsetX, 0, (depth / 2) - (lipDepth / 2)]}>
                <boxGeometry args={[sideWallWidth * 0.88, innerHeight, lipDepth]} />
                <meshStandardMaterial
                    color="#0b1420"
                    emissive="#173148"
                    emissiveIntensity={0.26}
                    metalness={0.08}
                    roughness={0.82}
                />
            </mesh>

            {Array.from({ length: guideFrameSafeCount }, (_, index) => {
                const ratio = guideFrameSafeCount === 1
                    ? 0
                    : index / (guideFrameSafeCount - 1);
                const frameWidth = Math.max(
                    innerWidth * 0.46,
                    innerWidth - (guideInset * ratio * 2.2),
                );
                const frameHeight = Math.max(
                    innerHeight * 0.46,
                    innerHeight - (guideInset * ratio * 1.8),
                );
                const frameZ = guideStartZ - ((guideStartZ - guideEndZ) * ratio);
                const emissiveIntensity = index === 0 ? 0.82 : index % 2 === 0 ? 0.54 : 0.38;
                return (
                    <group key={`rect-docking-guide-${index}`} position={[0, 0, frameZ]}>
                        <mesh position={[0, frameHeight / 2, 0]}>
                            <boxGeometry args={[frameWidth, frameThickness, frameThickness]} />
                            <meshStandardMaterial
                                color={guideLightColor}
                                emissive={guideLightColor}
                                emissiveIntensity={emissiveIntensity}
                                metalness={0.22}
                                roughness={0.24}
                            />
                        </mesh>
                        <mesh position={[0, -(frameHeight / 2), 0]}>
                            <boxGeometry args={[frameWidth, frameThickness, frameThickness]} />
                            <meshStandardMaterial
                                color={guideLightColor}
                                emissive={guideLightColor}
                                emissiveIntensity={emissiveIntensity}
                                metalness={0.22}
                                roughness={0.24}
                            />
                        </mesh>
                        <mesh position={[-(frameWidth / 2), 0, 0]}>
                            <boxGeometry args={[frameThickness, frameHeight, frameThickness]} />
                            <meshStandardMaterial
                                color={guideLightColor}
                                emissive={guideLightColor}
                                emissiveIntensity={emissiveIntensity}
                                metalness={0.22}
                                roughness={0.24}
                            />
                        </mesh>
                        <mesh position={[frameWidth / 2, 0, 0]}>
                            <boxGeometry args={[frameThickness, frameHeight, frameThickness]} />
                            <meshStandardMaterial
                                color={guideLightColor}
                                emissive={guideLightColor}
                                emissiveIntensity={emissiveIntensity}
                                metalness={0.22}
                                roughness={0.24}
                            />
                        </mesh>
                    </group>
                );
            })}

            {showLandingPadTerminus ? (
                <group position={[0, 0, backWallZ + 0.02]}>
                    <mesh position={[0, 0, 0.04]}>
                        <boxGeometry args={[innerWidth * 1.08, innerHeight * 1.08, 0.78]} />
                        <meshStandardMaterial
                            color="#02050a"
                            emissive="#040a12"
                            emissiveIntensity={0.04}
                            metalness={0.02}
                            roughness={0.98}
                        />
                    </mesh>
                    <mesh position={[0, 0.02, 0.44]}>
                        <planeGeometry args={[innerWidth * 0.74, innerHeight * 0.7]} />
                        <meshStandardMaterial
                            color="#02050a"
                            emissive="#060d16"
                            emissiveIntensity={0.05}
                            metalness={0.02}
                            roughness={0.98}
                            side={DoubleSide}
                        />
                    </mesh>
                    <mesh position={[0, -(innerHeight * 0.35), 0.5]}>
                        <boxGeometry args={[innerWidth * 0.78, innerHeight * 0.08, 0.12]} />
                        <meshStandardMaterial
                            color="#0c131b"
                            emissive="#09111a"
                            emissiveIntensity={0.08}
                            metalness={0.12}
                            roughness={0.9}
                        />
                    </mesh>
                    <mesh position={[0, -(innerHeight * 0.325), 0.59]}>
                        <boxGeometry args={[innerWidth * 0.48, innerHeight * 0.018, 0.026]} />
                        <meshStandardMaterial
                            color={guideLightColor}
                            emissive={guideLightColor}
                            emissiveIntensity={0.78}
                            metalness={0.14}
                            roughness={0.28}
                        />
                    </mesh>
                    <mesh position={[0, -(innerHeight * 0.25), 0.54]}>
                        <boxGeometry args={[innerWidth * 0.045, innerHeight * 0.12, 0.018]} />
                        <meshStandardMaterial
                            color={guideLightColor}
                            emissive={guideLightColor}
                            emissiveIntensity={0.52}
                            metalness={0.14}
                            roughness={0.28}
                        />
                    </mesh>
                    <mesh position={[0, -(innerHeight * 0.25), 0.54]}>
                        <boxGeometry args={[innerWidth * 0.18, innerHeight * 0.018, 0.018]} />
                        <meshStandardMaterial
                            color={guideLightColor}
                            emissive={guideLightColor}
                            emissiveIntensity={0.52}
                            metalness={0.14}
                            roughness={0.28}
                        />
                    </mesh>
                    <mesh position={[-(innerWidth * 0.28), -(innerHeight * 0.325), 0.56]}>
                        <boxGeometry args={[innerWidth * 0.045, innerHeight * 0.05, 0.04]} />
                        <meshStandardMaterial
                            color="#d2f1ff"
                            emissive="#a8e8ff"
                            emissiveIntensity={0.66}
                            metalness={0.06}
                            roughness={0.36}
                        />
                    </mesh>
                    <mesh position={[innerWidth * 0.28, -(innerHeight * 0.325), 0.56]}>
                        <boxGeometry args={[innerWidth * 0.045, innerHeight * 0.05, 0.04]} />
                        <meshStandardMaterial
                            color="#d2f1ff"
                            emissive="#a8e8ff"
                            emissiveIntensity={0.66}
                            metalness={0.06}
                            roughness={0.36}
                        />
                    </mesh>
                    <mesh position={[0, innerHeight * 0.22, 0.48]}>
                        <boxGeometry args={[innerWidth * 0.6, innerHeight * 0.022, 0.02]} />
                        <meshStandardMaterial
                            color="#09131d"
                            emissive="#102030"
                            emissiveIntensity={0.2}
                            metalness={0.1}
                            roughness={0.7}
                        />
                    </mesh>
                </group>
            ) : (
                <mesh position={[0, 0, backWallZ]}>
                    <planeGeometry args={[innerWidth * 0.64, innerHeight * 0.64]} />
                    <meshStandardMaterial
                        color="#07111b"
                        emissive="#0d1b2a"
                        emissiveIntensity={0.12}
                        metalness={0.06}
                        roughness={0.92}
                        side={DoubleSide}
                    />
                </mesh>
            )}
        </group>
    );
}

function RoundDockingTunnelInsert({
    positionZ,
    radius,
    depth,
}: {
    positionZ: number;
    radius: number;
    depth: number;
}): ReactElement {
    return (
        <group position={[0, 0, positionZ]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[radius, radius, depth, 24, 1, true]} />
                <meshStandardMaterial
                    color="#04080f"
                    emissive="#08131d"
                    emissiveIntensity={0.16}
                    metalness={0.03}
                    roughness={0.96}
                    side={DoubleSide}
                />
            </mesh>
            <mesh position={[0, 0, (depth / 2) - 0.04]}>
                <circleGeometry args={[radius * 0.94, 24]} />
                <meshStandardMaterial
                    color="#02050a"
                    emissive="#06101a"
                    emissiveIntensity={0.06}
                    metalness={0}
                    roughness={1}
                    side={DoubleSide}
                />
            </mesh>
            <mesh position={[0, 0, (-depth / 2) + 0.02]}>
                <circleGeometry args={[radius * 0.88, 24]} />
                <meshStandardMaterial
                    color="#02050a"
                    emissive="#08111a"
                    emissiveIntensity={0.08}
                    metalness={0}
                    roughness={1}
                    transparent
                    opacity={0.9}
                    side={DoubleSide}
                />
            </mesh>
        </group>
    );
}

function CoriolisDockingMouthFrame(): ReactElement {
    const mouthOuterWidth = 1.78;
    const mouthOuterHeight = 1.32;
    const mouthInnerWidth = 1.02;
    const mouthInnerHeight = 0.76;
    const collarDepth = 0.34;
    const sidePanelWidth = (mouthOuterWidth - mouthInnerWidth) / 2;
    const topPanelHeight = (mouthOuterHeight - mouthInnerHeight) / 2;
    const sideOffsetX = (mouthInnerWidth / 2) + (sidePanelWidth / 2);
    const topOffsetY = (mouthInnerHeight / 2) + (topPanelHeight / 2);
    const guideColor = "#8fd3ff";

    return (
        <group position={[0, 0, 5.34]}>
            <mesh position={[0, topOffsetY, 0]}>
                <boxGeometry args={[mouthInnerWidth * 1.14, topPanelHeight, collarDepth]} />
                <meshStandardMaterial
                    color="#313a44"
                    emissive="#111a25"
                    emissiveIntensity={0.12}
                    metalness={0.24}
                    roughness={0.8}
                />
            </mesh>
            <mesh position={[0, -topOffsetY, 0]}>
                <boxGeometry args={[mouthInnerWidth * 1.14, topPanelHeight, collarDepth]} />
                <meshStandardMaterial
                    color="#313a44"
                    emissive="#111a25"
                    emissiveIntensity={0.12}
                    metalness={0.24}
                    roughness={0.8}
                />
            </mesh>
            <mesh position={[-sideOffsetX, 0, 0]}>
                <boxGeometry args={[sidePanelWidth, mouthInnerHeight * 1.14, collarDepth]} />
                <meshStandardMaterial
                    color="#313a44"
                    emissive="#111a25"
                    emissiveIntensity={0.12}
                    metalness={0.24}
                    roughness={0.8}
                />
            </mesh>
            <mesh position={[sideOffsetX, 0, 0]}>
                <boxGeometry args={[sidePanelWidth, mouthInnerHeight * 1.14, collarDepth]} />
                <meshStandardMaterial
                    color="#313a44"
                    emissive="#111a25"
                    emissiveIntensity={0.12}
                    metalness={0.24}
                    roughness={0.8}
                />
            </mesh>

            <mesh position={[0, (mouthOuterHeight / 2) + 0.06, 0.12]} rotation={[-0.48, 0, 0]}>
                <boxGeometry args={[mouthOuterWidth * 0.94, 0.14, 0.58]} />
                <meshStandardMaterial
                    color="#242c35"
                    emissive="#0d151e"
                    emissiveIntensity={0.08}
                    metalness={0.2}
                    roughness={0.84}
                />
            </mesh>
            <mesh position={[0, -((mouthOuterHeight / 2) + 0.06), 0.12]} rotation={[0.48, 0, 0]}>
                <boxGeometry args={[mouthOuterWidth * 0.94, 0.14, 0.58]} />
                <meshStandardMaterial
                    color="#242c35"
                    emissive="#0d151e"
                    emissiveIntensity={0.08}
                    metalness={0.2}
                    roughness={0.84}
                />
            </mesh>
            <mesh position={[-((mouthOuterWidth / 2) + 0.06), 0, 0.12]} rotation={[0, 0.48, 0]}>
                <boxGeometry args={[0.14, mouthOuterHeight * 0.92, 0.58]} />
                <meshStandardMaterial
                    color="#242c35"
                    emissive="#0d151e"
                    emissiveIntensity={0.08}
                    metalness={0.2}
                    roughness={0.84}
                />
            </mesh>
            <mesh position={[(mouthOuterWidth / 2) + 0.06, 0, 0.12]} rotation={[0, -0.48, 0]}>
                <boxGeometry args={[0.14, mouthOuterHeight * 0.92, 0.58]} />
                <meshStandardMaterial
                    color="#242c35"
                    emissive="#0d151e"
                    emissiveIntensity={0.08}
                    metalness={0.2}
                    roughness={0.84}
                />
            </mesh>

            <mesh position={[0, (mouthInnerHeight / 2) + 0.02, 0.28]}>
                <boxGeometry args={[mouthInnerWidth, 0.02, 0.02]} />
                <meshStandardMaterial color={guideColor} emissive={guideColor} emissiveIntensity={0.72} />
            </mesh>
            <mesh position={[0, -((mouthInnerHeight / 2) + 0.02), 0.28]}>
                <boxGeometry args={[mouthInnerWidth, 0.02, 0.02]} />
                <meshStandardMaterial color={guideColor} emissive={guideColor} emissiveIntensity={0.72} />
            </mesh>
            <mesh position={[-((mouthInnerWidth / 2) + 0.02), 0, 0.28]}>
                <boxGeometry args={[0.02, mouthInnerHeight, 0.02]} />
                <meshStandardMaterial color={guideColor} emissive={guideColor} emissiveIntensity={0.72} />
            </mesh>
            <mesh position={[(mouthInnerWidth / 2) + 0.02, 0, 0.28]}>
                <boxGeometry args={[0.02, mouthInnerHeight, 0.02]} />
                <meshStandardMaterial color={guideColor} emissive={guideColor} emissiveIntensity={0.72} />
            </mesh>
        </group>
    );
}

function CoriolisFrontHullShell(): ReactElement {
    const shellCenterZ = 4.28;
    const openingWidth = 1.72;
    const openingHeight = 1.24;
    const shellDepth = 0.72;
    const shellColor = "#3a434d";
    const ribColor = "#38414a";

    return (
        <group>
            <mesh position={[0, 0.9, shellCenterZ]} rotation={[-0.62, 0, 0]}>
                <boxGeometry args={[2.18, 0.3, shellDepth]} />
                <meshStandardMaterial color={shellColor} metalness={0.16} roughness={0.82} />
            </mesh>
            <mesh position={[0, -0.9, shellCenterZ]} rotation={[0.62, 0, 0]}>
                <boxGeometry args={[2.18, 0.3, shellDepth]} />
                <meshStandardMaterial color={shellColor} metalness={0.16} roughness={0.82} />
            </mesh>
            <mesh position={[-1.1, 0, shellCenterZ]} rotation={[0, 0.62, 0]}>
                <boxGeometry args={[0.3, 1.7, shellDepth]} />
                <meshStandardMaterial color={shellColor} metalness={0.16} roughness={0.82} />
            </mesh>
            <mesh position={[1.1, 0, shellCenterZ]} rotation={[0, -0.62, 0]}>
                <boxGeometry args={[0.3, 1.7, shellDepth]} />
                <meshStandardMaterial color={shellColor} metalness={0.16} roughness={0.82} />
            </mesh>

            <mesh position={[0, 0, shellCenterZ + 0.04]}>
                <boxGeometry args={[openingWidth, openingHeight, 0.14]} />
                <meshStandardMaterial color="#202933" metalness={0.08} roughness={0.9} />
            </mesh>
            <mesh position={[0, 1.08, 3.9]} rotation={[-0.46, 0, 0]}>
                <boxGeometry args={[2.28, 0.1, 0.44]} />
                <meshStandardMaterial color={ribColor} metalness={0.1} roughness={0.86} />
            </mesh>
            <mesh position={[0, -1.08, 3.9]} rotation={[0.46, 0, 0]}>
                <boxGeometry args={[2.28, 0.1, 0.44]} />
                <meshStandardMaterial color={ribColor} metalness={0.1} roughness={0.86} />
            </mesh>
            <mesh position={[-1.24, 0, 3.9]} rotation={[0, 0.46, 0]}>
                <boxGeometry args={[0.1, 1.98, 0.44]} />
                <meshStandardMaterial color={ribColor} metalness={0.1} roughness={0.86} />
            </mesh>
            <mesh position={[1.24, 0, 3.9]} rotation={[0, -0.46, 0]}>
                <boxGeometry args={[0.1, 1.98, 0.44]} />
                <meshStandardMaterial color={ribColor} metalness={0.1} roughness={0.86} />
            </mesh>
        </group>
    );
}

function CoriolisStationModel(): ReactElement {
    return (
        <group>
            <mesh position={[0, 0, -2.08]}>
                <octahedronGeometry args={[5.72, 0]} />
                <meshStandardMaterial color="#b7bdc5" metalness={0.42} roughness={0.54} />
            </mesh>

            <CoriolisFrontHullShell />

            <mesh position={[0, 0, -2.96]}>
                <octahedronGeometry args={[4.92, 0]} />
                <meshStandardMaterial
                    color="#1d232b"
                    emissive="#060b10"
                    emissiveIntensity={0.08}
                    metalness={0.2}
                    roughness={0.9}
                />
            </mesh>

            <CoriolisDockingMouthFrame />

            <RectDockingTunnelInsert
                positionZ={4.18}
                outerWidth={1.72}
                outerHeight={1.28}
                innerWidth={1.04}
                innerHeight={0.82}
                depth={3.36}
                guideLightColor="#82c8ff"
                guideFrameCount={6}
                showLandingPadTerminus
            />
        </group>
    );
}

function OrbisStationModel(): ReactElement {
    return (
        <group>
            <mesh>
                <sphereGeometry args={[4.8, 26, 26]} />
                <meshStandardMaterial color="#bac0c8" metalness={0.2} roughness={0.64} />
            </mesh>

            <mesh position={[0, 0, 5.1]}>
                <cylinderGeometry args={[0.82, 0.82, 0.4, 24]} />
                <meshStandardMaterial emissive="#5acfff" emissiveIntensity={0.68} metalness={0.22} roughness={0.24} />
            </mesh>

            <RoundDockingTunnelInsert
                positionZ={4.18}
                radius={0.7}
                depth={1.9}
            />
        </group>
    );
}

function DefaultStationModel(): ReactElement {
    return (
        <group>
            <mesh>
                <sphereGeometry args={[3.8, 22, 22]} />
                <meshStandardMaterial color="#b2b8c0" metalness={0.15} roughness={0.66} />
            </mesh>

            <mesh rotation={[Math.PI / 4, Math.PI / 8, 0]}>
                <boxGeometry args={[6.8, 6.8, 6.8]} />
                <meshStandardMaterial color="#c2c8d0" metalness={0.36} roughness={0.54} />
            </mesh>

            <mesh position={[0, 0, 3.55]}>
                <cylinderGeometry args={[0.62, 0.62, 0.3, 18]} />
                <meshStandardMaterial emissive="#4ac9ff" emissiveIntensity={0.52} metalness={0.2} roughness={0.24} />
            </mesh>

            <RectDockingTunnelInsert
                positionZ={2.9}
                outerWidth={0.8}
                outerHeight={0.8}
                innerWidth={0.5}
                innerHeight={0.5}
                depth={1.24}
                guideLightColor="#7fc7ff"
                guideFrameCount={4}
            />
        </group>
    );
}

function stationDistanceScale(distanceKm: number): number {
    const distance = Math.max(1, Number(distanceKm) || 1);
    return clamp(0.65 / Math.sqrt(distance), 0.012, 0.08);
}

function StationModel({
    contact,
    stationRef,
}: {
    contact: ScannerAnchorContact;
    stationRef?: (element: Group | null) => void;
}): ReactElement {
    const position = sceneAnchorPosition(contact);
    const shape = resolveStationShapeKey(contact.station_archetype_shape);
    const distanceScale = resolveStationRenderScale(contact);
    if (shape === "coriolis") {
        return (
            <group
                position={position}
                scale={[distanceScale, distanceScale, distanceScale]}
                ref={stationRef}
            >
                <CoriolisStationModel />
            </group>
        );
    }
    if (shape === "orbis") {
        return (
            <group
                position={position}
                scale={[distanceScale, distanceScale, distanceScale]}
                ref={stationRef}
            >
                <OrbisStationModel />
            </group>
        );
    }
    return (
        <group
            position={position}
            scale={[distanceScale, distanceScale, distanceScale]}
            ref={stationRef}
        >
            <DefaultStationModel />
        </group>
    );
}

function resolveStationCollisionRadiusKm(contact: ScannerAnchorContact): number {
    const shape = resolveStationShapeKey(contact.station_archetype_shape);
    const scaledRadius = (resolveStationBaseRadius(shape) * resolveStationRenderScale(contact)) + 0.08;
    return Math.max(0.22, scaledRadius);
}

function StationTransitTunnel({
    stationShape,
    progress,
}: {
    stationShape: StationShapeKey;
    progress: number;
}): ReactElement {
    const ringColor = stationShape === "orbis" ? "#7fd3ff" : "#89c8ff";
    const tunnelLength = stationShape === "orbis" ? 42 : 46;
    const flowOffset = -((progress / 100) * 5.2);
    const frameWidth = stationShape === "orbis" ? 4.35 : 4.75;
    const frameHeight = stationShape === "orbis" ? 3.2 : 3.45;
    const wallThickness = stationShape === "orbis" ? 0.22 : 0.26;
    const wallDepth = tunnelLength;

    return (
        <group position={[0, 0, -12]}>
            <mesh position={[0, frameHeight / 2 + (wallThickness / 2), 0]}>
                <boxGeometry args={[frameWidth + wallThickness * 2, wallThickness, wallDepth]} />
                <meshStandardMaterial
                    color="#2c3c4e"
                    emissive="#0f1724"
                    emissiveIntensity={0.52}
                    roughness={0.78}
                    metalness={0.25}
                />
            </mesh>
            <mesh position={[0, -(frameHeight / 2 + (wallThickness / 2)), 0]}>
                <boxGeometry args={[frameWidth + wallThickness * 2, wallThickness, wallDepth]} />
                <meshStandardMaterial
                    color="#2c3c4e"
                    emissive="#0f1724"
                    emissiveIntensity={0.52}
                    roughness={0.78}
                    metalness={0.25}
                />
            </mesh>
            <mesh position={[-(frameWidth / 2 + (wallThickness / 2)), 0, 0]}>
                <boxGeometry args={[wallThickness, frameHeight, wallDepth]} />
                <meshStandardMaterial
                    color="#2c3c4e"
                    emissive="#0f1724"
                    emissiveIntensity={0.52}
                    roughness={0.78}
                    metalness={0.25}
                />
            </mesh>
            <mesh position={[frameWidth / 2 + (wallThickness / 2), 0, 0]}>
                <boxGeometry args={[wallThickness, frameHeight, wallDepth]} />
                <meshStandardMaterial
                    color="#2c3c4e"
                    emissive="#0f1724"
                    emissiveIntensity={0.52}
                    roughness={0.78}
                    metalness={0.25}
                />
            </mesh>

            <group position={[0, 0, tunnelLength / 2 - 1.4]}>
                <mesh position={[0, frameHeight / 2, 0]}>
                    <boxGeometry args={[frameWidth, 0.08, 0.08]} />
                    <meshStandardMaterial color={ringColor} emissive={ringColor} emissiveIntensity={0.82} />
                </mesh>
                <mesh position={[0, -frameHeight / 2, 0]}>
                    <boxGeometry args={[frameWidth, 0.08, 0.08]} />
                    <meshStandardMaterial color={ringColor} emissive={ringColor} emissiveIntensity={0.82} />
                </mesh>
                <mesh position={[-frameWidth / 2, 0, 0]}>
                    <boxGeometry args={[0.08, frameHeight, 0.08]} />
                    <meshStandardMaterial color={ringColor} emissive={ringColor} emissiveIntensity={0.82} />
                </mesh>
                <mesh position={[frameWidth / 2, 0, 0]}>
                    <boxGeometry args={[0.08, frameHeight, 0.08]} />
                    <meshStandardMaterial color={ringColor} emissive={ringColor} emissiveIntensity={0.82} />
                </mesh>
            </group>

            {Array.from({ length: 10 }, (_, index) => {
                const depth = (index * 4) - 18 + flowOffset;
                const emissiveBoost = index % 2 === 0 ? 0.72 : 0.52;
                return (
                    <group key={`transit-guide-${index}`} position={[0, 0, depth]}>
                        <mesh position={[0, frameHeight / 2, 0]}>
                            <boxGeometry args={[frameWidth, 0.042, 0.042]} />
                            <meshStandardMaterial emissive={ringColor} emissiveIntensity={emissiveBoost} />
                        </mesh>
                        <mesh position={[0, -frameHeight / 2, 0]}>
                            <boxGeometry args={[frameWidth, 0.042, 0.042]} />
                            <meshStandardMaterial emissive={ringColor} emissiveIntensity={emissiveBoost} />
                        </mesh>
                        <mesh position={[-frameWidth / 2, 0, 0]}>
                            <boxGeometry args={[0.042, frameHeight, 0.042]} />
                            <meshStandardMaterial emissive={ringColor} emissiveIntensity={emissiveBoost} />
                        </mesh>
                        <mesh position={[frameWidth / 2, 0, 0]}>
                            <boxGeometry args={[0.042, frameHeight, 0.042]} />
                            <meshStandardMaterial emissive={ringColor} emissiveIntensity={emissiveBoost} />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
}

function FlightTransitScene({
    jumpPhase,
    jumpProgress,
    shipVisualKey,
    stationShapeKey,
}: {
    jumpPhase: FlightSceneProps["jumpPhase"];
    jumpProgress: number;
    shipVisualKey: string | null | undefined;
    stationShapeKey: string | null | undefined;
}): ReactElement {
    const outbound = jumpPhase === "undocking-transit-internal";
    const inboundProgress = clamp(jumpProgress, 0, 100);
    const transitProgress = clamp(jumpProgress, 0, 100);
    const outboundProgress = clamp(transitProgress / 100, 0, 1);
    const smoothRatio = (value: number): number => {
        const ratio = clamp(value, 0, 1);
        return ratio * ratio * (3 - (2 * ratio));
    };
    const outboundLiftRatio = smoothRatio(outboundProgress / 0.24);
    const outboundTurnRatio = smoothRatio((outboundProgress - 0.24) / 0.32);
    const outboundCruiseRatio = smoothRatio((outboundProgress - 0.56) / 0.44);
    const outboundCameraTravelRatio = smoothRatio((outboundProgress - 0.16) / 0.84);
    const inboundTransitCruiseRatioRaw = clamp(inboundProgress / 70, 0, 1);
    const inboundTransitCruiseRatio = inboundTransitCruiseRatioRaw <= 0.15
        ? Math.pow(inboundTransitCruiseRatioRaw / 0.15, 2) * 0.15
        : 0.15 + ((inboundTransitCruiseRatioRaw - 0.15) / 0.85) * 0.85;
    const inboundLandingRatio = clamp((inboundProgress - 70) / 30, 0, 1);
    const inboundShipZ = inboundProgress <= 70
        ? 6.2 - (inboundTransitCruiseRatio * 32.2)
        : -26 - (inboundLandingRatio * 5.6);
    const inboundShipY = inboundProgress <= 70
        ? -0.1
        : -0.1 - (inboundLandingRatio * 1.45);
    const outboundShipZ = -31.1
        + (outboundLiftRatio * 1.3)
        + (outboundTurnRatio * 2.2)
        + (outboundCruiseRatio * 34.6);
    const outboundShipY = -1.78
        + (outboundLiftRatio * 1.18)
        + (outboundTurnRatio * 0.2)
        - (outboundCruiseRatio * 0.16);
    const outboundShipYaw = Math.PI * (1 - outboundTurnRatio);
    const outboundShipPitch = 0.1
        - (outboundTurnRatio * 0.12)
        - (outboundCruiseRatio * 0.04);
    const outboundShipRoll = 0.08 * Math.sin(outboundTurnRatio * Math.PI);
    const shipZ = outbound ? outboundShipZ : inboundShipZ;
    const shipY = outbound ? outboundShipY : inboundShipY;
    const inboundShipPitch = -0.04 - (inboundLandingRatio * 0.16);

    const TransitCameraRig = (): ReactElement => {
        useFrame(({ camera }) => {
            const perspectiveCamera = camera as PerspectiveCamera;
            if (outbound) {
                const outboundCameraZ = -18.4 + (outboundCameraTravelRatio * 27.2);
                const outboundCameraY = 0.32 - (outboundCameraTravelRatio * 0.08);
                perspectiveCamera.position.set(0, outboundCameraY, outboundCameraZ);
                perspectiveCamera.lookAt(0, shipY + 0.06, shipZ - 1.1);
                return;
            }

            const landingLookDown = clamp(inboundProgress / 100, 0, 1);
            perspectiveCamera.position.set(0, 0.24, 8.9);
            perspectiveCamera.lookAt(
                0,
                -0.02 - (landingLookDown * 0.28),
                -17.5 - (landingLookDown * 11.5),
            );
        });

        return <></>;
    };

    return (
        <>
            <TransitCameraRig />
            <color attach="background" args={["#02060e"]} />
            <ambientLight intensity={0.35} />
            <directionalLight position={[6, 10, -4]} intensity={0.58} color="#c8e7ff" />
            <pointLight position={[0, 0, 9]} intensity={0.88} color="#85d4ff" />

            <StationTransitTunnel
                stationShape={resolveStationShapeKey(stationShapeKey)}
                progress={jumpProgress}
            />

            <mesh position={[0, -1.78, -31]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[2.15, 28]} />
                <meshStandardMaterial color="#0f1828" emissive="#103447" emissiveIntensity={0.48} />
            </mesh>
            <mesh position={[0, -1.77, -31]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[1.48, 2.02, 24]} />
                <meshStandardMaterial emissive="#74d7ff" emissiveIntensity={0.8} side={DoubleSide} />
            </mesh>
            <mesh position={[0, -1.76, -31]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.24, 0.34, 14]} />
                <meshStandardMaterial emissive="#8fe5ff" emissiveIntensity={0.75} side={DoubleSide} />
            </mesh>
            <mesh position={[-2.15, -1.72, -30.4]}>
                <boxGeometry args={[0.12, 0.14, 0.44]} />
                <meshStandardMaterial emissive="#e6b470" emissiveIntensity={0.74} />
            </mesh>
            <mesh position={[2.15, -1.72, -30.4]}>
                <boxGeometry args={[0.12, 0.14, 0.44]} />
                <meshStandardMaterial emissive="#e6b470" emissiveIntensity={0.74} />
            </mesh>

            <group
                position={[0, shipY, shipZ]}
                rotation={[
                    outbound ? outboundShipPitch : inboundShipPitch,
                    outbound ? outboundShipYaw : Math.PI,
                    outbound ? outboundShipRoll : 0,
                ]}
            >
                <ShipModel shipVisualKey={shipVisualKey} scale={[2.5, 2.0, 2.5]} />
                {!outbound ? (
                    <>
                        <pointLight
                            position={[0, 0.08, 0.2]}
                            intensity={0.95}
                            color="#bfeaff"
                            distance={8}
                        />
                        <mesh position={[0, -0.05, -0.25]}>
                            <sphereGeometry args={[0.12, 10, 10]} />
                            <meshStandardMaterial emissive="#89dcff" emissiveIntensity={1.05} />
                        </mesh>
                    </>
                ) : null}
            </group>
        </>
    );
}

function FlightSceneContent({
    jumpPhase,
    renderProfile,
    cameraMode = "boresight",
    shipVisualKey,
    focusedContact,
    scannerRangeKm = 25,
    scannerContacts,
    celestialAnchors,
    onSpeedChange,
    onRollChange,
    onScannerTelemetryChange,
    onCollision,
    dockingApproachContactId,
    waypointContactId,
    onDockingApproachProgress,
    onDockingApproachComplete,
    onDockingDebug,
    dockingRotationMatchEnabled,
    showContactLabels,
    spawnDirective,
    onSpawnDirectiveApplied,
    onContactLabelAnchorsChange,
}: {
    jumpPhase: FlightSceneProps["jumpPhase"];
    renderProfile: FlightSceneProps["renderProfile"];
    cameraMode?: FlightCameraMode;
    shipVisualKey?: string | null;
    focusedContact: ScannerAnchorContact | null;
    scannerRangeKm?: number;
    scannerContacts: ScannerAnchorContact[];
    celestialAnchors: CelestialPresentationAnchor[];
    onSpeedChange?: (speed: number) => void;
    onRollChange?: (rollDegrees: number) => void;
    onScannerTelemetryChange?: (contacts: ScannerTelemetryContact[]) => void;
    onCollision?: (event: FlightSceneCollisionEvent) => void;
    dockingApproachContactId?: string | null;
    waypointContactId?: string | null;
    onDockingApproachProgress?: (payload: {
        progress: number;
        distanceKm: number;
        targetName: string;
        stage: DockingApproachStage;
    }) => void;
    onDockingApproachComplete?: () => void;
    onDockingDebug?: (payload: DockingDebugPayload) => void;
    dockingRotationMatchEnabled?: boolean;
    showContactLabels?: boolean;
    spawnDirective?: FlightSceneSpawnDirective | null;
    onSpawnDirectiveApplied?: (nonce: number) => void;
    onContactLabelAnchorsChange?: (anchors: FlightSceneContactLabel[]) => void;
}): ReactElement {
    const shipRef = useRef<Group>(null);
    const waypointRef = useRef<Mesh>(null);
    const focusRingRef = useRef<Mesh>(null);
    const stationRefs = useRef<Record<string, Group | null>>({});
    const trafficRefs = useRef<Array<Group | null>>([]);
    const inputRef = useRef<InputState>({
        yawLeft: false,
        yawRight: false,
        rollLeft: false,
        rollRight: false,
        throttleUp: false,
        throttleDown: false,
        throttleToZero: false,
        pitchUp: false,
        pitchDown: false,
    });
    const velocityRef = useRef(0);
    const worldVelocityRef = useRef(new Vector3());
    const lastReportedSpeedRef = useRef(Number.NaN);
    const lastReportedRollRef = useRef(Number.NaN);
    const yawRef = useRef(0);
    const pitchRef = useRef(0);
    const rollRef = useRef(0);
    const forwardVectorRef = useRef(new Vector3(0, 0, 1));
    const flightCameraCockpitOffsetRef = useRef(new Vector3(0, 0.2, 0.18));
    const flightCameraBoresightOffsetRef = useRef(new Vector3(0, 0, 0));
    const dockingCameraDockingOffsetRef = useRef(new Vector3(0, 0, 0));
    const cockpitWorldOffsetRef = useRef(new Vector3());
    const dockingCameraPresentationOffsetRef = useRef(
        cameraMode === "cockpit"
            ? new Vector3(0, 0.2, 0.18)
            : new Vector3(0, 0, 0),
    );
    const cameraOffsetBlendRef = useRef(
        cameraMode === "cockpit"
            ? new Vector3(0, 0.2, 0.18)
            : new Vector3(0, 0, 0),
    );
    const cameraOffsetTargetRef = useRef(
        cameraMode === "cockpit"
            ? new Vector3(0, 0.2, 0.18)
            : new Vector3(0, 0, 0),
    );
    const scannerRelativeVectorRef = useRef(new Vector3());
    const scannerPlaneVectorRef = useRef(new Vector3());
    const scannerCameraRelativeVectorRef = useRef(new Vector3());
    const scannerInverseQuaternionRef = useRef(new Quaternion());
    const lastScannerTelemetrySentAtRef = useRef(0);
    const lastContactLabelSignatureRef = useRef("");
    const lastCollisionAtRef = useRef(0);
    const activeCollisionContactIdRef = useRef<string | null>(null);
    const lastJumpPhaseRef = useRef(jumpPhase);
    const dockingApproachInitialDistanceRef = useRef<number | null>(null);
    const dockingApproachCompleteSentRef = useRef(false);
    const dockingApproachLastProgressRef = useRef(-1);
    const dockingApproachStageRef = useRef<DockingApproachStage>("hold-entry");
    const dockingApproachLastTargetIdRef = useRef<string | null>(null);
    const dockingApproachStageStartedAtRef = useRef(0);
    const dockingHoldAlignAlignedSinceRef = useRef(0);
    const dockingFinalReacquireLastAtRef = useRef(0);
    const dockingLastResetAtRef = useRef(0);
    const dockingRotationMatchLatchedRef = useRef(false);
    const dockingApproachPortCorePositionRef = useRef(new Vector3());
    const dockingApproachPortPositionRef = useRef(new Vector3());
    const dockingApproachTunnelEntryPositionRef = useRef(new Vector3());
    const dockingApproachHoldPointRef = useRef(new Vector3());
    const dockingApproachStationCenterRef = useRef(new Vector3());
    const dockingApproachEntryVectorRef = useRef(new Vector3(0, 0, 1));
    const dockingDesiredVectorRef = useRef(new Vector3());
    const dockingAimDirectionRef = useRef(new Vector3());
    const dockingAvoidanceVectorRef = useRef(new Vector3());
    const dockingTemporaryVectorRef = useRef(new Vector3());
    const dockingCameraAimPositionRef = useRef(new Vector3());
    const dockingCameraToPortRef = useRef(new Vector3());
    const dockingPortCameraSpaceRef = useRef(new Vector3());
    const dockingForwardVectorRef = useRef(new Vector3(0, 0, -1));
    const dockingShipToPortDirectionRef = useRef(new Vector3(0, 0, -1));
    const dockingAlignmentDirectionRef = useRef(new Vector3(0, 0, -1));
    const dockingFilteredAimDirectionRef = useRef(new Vector3(0, 0, -1));
    const dockingVelocityTargetDirectionRef = useRef(new Vector3(0, 0, -1));
    const dockingVelocityParallelRef = useRef(new Vector3());
    const dockingVelocityLateralRef = useRef(new Vector3());
    const dockingOrientationEulerRef = useRef(new Euler(0, 0, 0, "YXZ"));
    const dockingCameraOffsetQuaternionRef = useRef(new Quaternion());
    const dockingCameraQuaternionRef = useRef(new Quaternion());
    const dockingCameraInverseQuaternionRef = useRef(new Quaternion());
    const spawnDirectiveAppliedNonceRef = useRef<number | null>(null);
    const lastDockingDebugTelemetryAtRef = useRef(0);
    const lastDockingDebugContactMissingAtRef = useRef(0);
    const dockingCameraPresentationTargetRef = useRef(0);
    const dockingCameraPresentationBlendRef = useRef(0);
    const dockingCameraTargetFovRef = useRef(62);
    const dockingCameraTargetNearRef = useRef(0.1);

    const SCANNER_PLANE_RANGE = Math.max(1, scannerRangeKm);
    const SCANNER_ALTITUDE_RANGE = Math.max(10, SCANNER_PLANE_RANGE * 0.44);
    const DOCKING_PORT_THRESHOLD = 0.28;
    const DOCKING_PORT_FALLBACK_THRESHOLD = 0.48;
    const DOCKING_PORT_MIN_STANDOFF_KM = 0.02;
    const DOCKING_PORT_SURFACE_CLEARANCE_KM = 0.035;
    const DOCKING_HOLD_DISTANCE_MIN = 2.35;
    const DOCKING_HOLD_DISTANCE_MAX = 3.25;
    const DOCKING_HOLD_POINT_THRESHOLD = 0.42;
    const DOCKING_HOLD_MAX_SPEED = 1.1;
    const DOCKING_HOLD_ENTRY_MIN_DURATION_MS = 2600;
    const DOCKING_HOLD_ALIGN_DURATION_MS = 900;
    const DOCKING_HOLD_ALIGN_MAX_DURATION_MS = 9000;
    const DOCKING_HOLD_ALIGN_REQUIRED_COSINE = Math.cos((8 * Math.PI) / 180);
    const DOCKING_HOLD_ALIGN_TIMEOUT_REQUIRED_COSINE = Math.cos((14 * Math.PI) / 180);
    const DOCKING_HOLD_ALIGN_CORRIDOR_TOLERANCE_KM = 0.22;
    const DOCKING_HOLD_ALIGN_TIMEOUT_CORRIDOR_TOLERANCE_KM = 0.34;
    const DOCKING_HOLD_ALIGN_TIMEOUT_MAX_DISTANCE_KM = 1.15;
    const DOCKING_HOLD_ALIGN_RESET_ALIGNMENT_COSINE = Math.cos((58 * Math.PI) / 180);
    const DOCKING_HOLD_ALIGN_RESET_CORRIDOR_MIN_KM = 0.16;
    const DOCKING_HOLD_ALIGN_RESET_TIMEOUT_MS = 4200;
    const DOCKING_HOLD_ALIGN_RESET_COOLDOWN_MS = 2200;
    const DOCKING_HOLD_ALIGN_FINAL_ENTRY_MAX_DISTANCE_KM = 0.82;
    const DOCKING_HOLD_ALIGN_STABLE_MS = 650;
    const DOCKING_HOLD_ALIGN_MAX_SPEED = 0.08;
    const DOCKING_HOLD_ALIGN_RECOVERY_MAX_SPEED = 0.055;
    const DOCKING_TUNNEL_ENTRY_TARGET_OFFSET_KM = 0.22;
    const DOCKING_TUNNEL_ENTRY_FINAL_TRIGGER_KM = 0.18;
    const DOCKING_TUNNEL_ENTRY_MIN_DURATION_MS = 550;
    const DOCKING_TUNNEL_ENTRY_MIN_SPEED = 0.03;
    const DOCKING_TUNNEL_ENTRY_MAX_SPEED = 0.11;
    const DOCKING_TUNNEL_ENTRY_ACCELERATION = 0.66;
    const DOCKING_HOLD_ENTRY_ALIGN_COSINE = Math.cos((36 * Math.PI) / 180);
    const DOCKING_HOLD_ENTRY_CORRIDOR_TOLERANCE_KM = 0.18;
    const DOCKING_HOLD_ENTRY_NEAR_PORT_SPEED = 0.24;
    const DOCKING_HOLD_ENTRY_NEAR_PORT_DISTANCE_KM = 2.2;
    const DOCKING_HOLD_ENTRY_ACCELERATION = 0.95;
    const DOCKING_HOLD_ALIGN_ACCELERATION = 0.6;
    const DOCKING_FINAL_APPROACH_ACCELERATION = 0.72;
    const DOCKING_HOLD_ENTRY_TURN_RAMP_MS = 1650;
    const DOCKING_HOLD_ENTRY_INITIAL_YAW_RATE = 0.62;
    const DOCKING_HOLD_ENTRY_INITIAL_PITCH_RATE = 0.48;
    const DOCKING_FINAL_MIN_SPEED = 0.08;
    const DOCKING_FINAL_MAX_SPEED = 0.35;
    const DOCKING_FINAL_CLOSE_MIN_SPEED = 0.025;
    const DOCKING_FINAL_CLOSE_RANGE_KM = 0.55;
    const DOCKING_FINAL_CLOSE_BRAKE_FACTOR = 0.32;
    const DOCKING_FINAL_CLOSE_ACCELERATION = 1.9;
    const DOCKING_FINAL_CLOSE_YAW_RATE = 1.1;
    const DOCKING_FINAL_CLOSE_PITCH_RATE = 0.9;
    const DOCKING_FINAL_CAPTURE_DISTANCE_KM = 0.3;
    const DOCKING_FINAL_CAPTURE_MIN_SPEED = 0.015;
    const DOCKING_FINAL_CAPTURE_MAX_SPEED = 0.08;
    const DOCKING_FINAL_CAPTURE_ACCELERATION = 0.7;
    const DOCKING_FINAL_CAPTURE_YAW_RATE = 1.45;
    const DOCKING_FINAL_CAPTURE_PITCH_RATE = 1.15;
    const DOCKING_FALLBACK_ALIGNMENT_COSINE = Math.cos((20 * Math.PI) / 180);
    const DOCKING_FALLBACK_CORRIDOR_MAX_KM = 0.11;
    const DOCKING_FINAL_HARD_LOCK_THRESHOLD = 0.14;
    const DOCKING_FINAL_HARD_LOCK_ALIGNMENT_COSINE = Math.cos((10 * Math.PI) / 180);
    const DOCKING_FINAL_INSIDE_PORT_THRESHOLD_KM = 0.11;
    const DOCKING_FINAL_INSIDE_PORT_CORRIDOR_MAX_KM = 0.05;
    const DOCKING_FINAL_INSIDE_PORT_APPROACH_MAX_KM = 0.09;
    const DOCKING_FINAL_INSIDE_PORT_MAX_SPEED = 0.05;
    const DOCKING_FINAL_NEAR_PORT_THRESHOLD_KM = 0.115;
    const DOCKING_FINAL_NEAR_PORT_CORRIDOR_MAX_KM = 0.03;
    const DOCKING_FINAL_NEAR_PORT_APPROACH_MAX_KM = 0.055;
    const DOCKING_FINAL_NEAR_PORT_MAX_SPEED = 0.04;
    const DOCKING_DIRECT_PORT_ALIGNMENT_COSINE = Math.cos((4 * Math.PI) / 180);
    const DOCKING_DIRECT_PORT_CORRIDOR_MAX_KM = 0.026;
    const DOCKING_DIRECT_PORT_APPROACH_MAX_KM = 0.062;
    const DOCKING_DIRECT_PORT_MAX_SPEED = 0.05;
    const DOCKING_COMPLETE_MIN_TUNNEL_PENETRATION_KM = 0.32;
    const DOCKING_COMPLETE_STRICT_TUNNEL_PENETRATION_KM = 0.36;
    const DOCKING_COMPLETE_SCREEN_CENTER_MAX_X = 0.72;
    const DOCKING_COMPLETE_SCREEN_CENTER_MAX_Y = 0.66;
    const DOCKING_COMPLETE_SCREEN_STRICT_CENTER_MAX_X = 0.52;
    const DOCKING_COMPLETE_SCREEN_STRICT_CENTER_MAX_Y = 0.48;
    const DOCKING_PORT_ROTATION_MATCH_RANGE_KM = 2.0;
    const DOCKING_ROTATION_MATCH_MAX_DISTANCE_KM = 2.0;
    const DOCKING_ROTATION_MATCH_ROLL_RATE = 3.2;
    const DOCKING_ROTATION_MATCH_HOLD_ALIGN_ALIGNMENT_COSINE = Math.cos((70 * Math.PI) / 180);
    const DOCKING_ROTATION_MATCH_FINAL_ALIGNMENT_COSINE = Math.cos((28 * Math.PI) / 180);
    const DOCKING_ROTATION_MATCH_HOLD_ALIGN_CORRIDOR_MAX_KM = 0.34;
    const DOCKING_ROTATION_MATCH_FINAL_CORRIDOR_MAX_KM = 0.08;
    const DOCKING_ROTATION_MATCH_FINAL_DISTANCE_KM = 0.24;
    const DOCKING_ROTATION_MATCH_RELEASE_ALIGNMENT_COSINE = Math.cos((56 * Math.PI) / 180);
    const DOCKING_ROTATION_MATCH_RELEASE_CORRIDOR_MAX_KM = 0.14;
    const DOCKING_ROTATION_MATCH_RELEASE_FINAL_CORRIDOR_MAX_KM = 0.1;
    const DOCKING_FINAL_RECOVERY_ALIGNMENT_COSINE = Math.cos((34 * Math.PI) / 180);
    const DOCKING_FINAL_RECOVERY_MAX_SPEED = 0.045;
    const DOCKING_FINAL_RECOVERY_CORRIDOR_MAX_KM = 0.26;
    const DOCKING_FINAL_REACQUIRE_ALIGNMENT_COSINE = Math.cos((68 * Math.PI) / 180);
    const DOCKING_FINAL_REACQUIRE_CORRIDOR_MIN_KM = 0.18;
    const DOCKING_FINAL_REACQUIRE_MIN_DISTANCE_KM = 0.2;
    const DOCKING_FINAL_REACQUIRE_MIN_ELAPSED_MS = 850;
    const DOCKING_FINAL_REACQUIRE_COOLDOWN_MS = 1600;
    const DOCKING_RESET_HOLD_DISTANCE_MIN = 1.35;
    const DOCKING_RESET_HOLD_DISTANCE_MAX = 2.2;
    const DOCKING_RETICLE_LOCK_RANGE_KM = 0.8;
    const DOCKING_RETICLE_EARLY_LOCK_RANGE_KM = 3.2;
    const DOCKING_RETICLE_HOLD_ENTRY_BLEND = 0.72;
    const DOCKING_RETICLE_HOLD_ALIGN_BLEND = 0.92;
    const DOCKING_RETICLE_HARD_LOCK_BLEND = 0.92;
    const DOCKING_RETICLE_ALIGNMENT_BLEND_RANGE_KM = 0.7;
    const DOCKING_RETICLE_CAMERA_BIAS_HOLD_ALIGN = 0.58;
    const DOCKING_RETICLE_CAMERA_BIAS_FINAL = 0.34;
    const DOCKING_RETICLE_CAMERA_BIAS_CAPTURE = 0.2;
    const DOCKING_AVOIDANCE_RADIUS = 2.35;
    const DOCKING_FINAL_STAGE_MIN_DURATION_MS = 4200;
    const DOCKING_FINAL_STAGE_FORCE_COMPLETE_MS = 12000;
    const DOCKING_UNDOCK_EXIT_FORWARD_SPEED = 0.78;
    const DOCKING_TRAJECTORY_AIM_BLEND_HOLD_ENTRY = 0.22;
    const DOCKING_TRAJECTORY_AIM_BLEND_HOLD_ALIGN = 0.64;
    const DOCKING_TRAJECTORY_AIM_BLEND_FINAL = 0.82;
    const DOCKING_TRAJECTORY_AIM_BLEND_CAPTURE = 0.92;
    const DOCKING_HOLD_ALIGN_LATERAL_DAMPING = 3.6;
    const DOCKING_FINAL_LATERAL_DAMPING = 5.4;
    const DOCKING_FINAL_CAPTURE_LATERAL_DAMPING = 7.2;
    const DOCKING_AIM_SMOOTH_RATE_HOLD_ENTRY = 4.4;
    const DOCKING_AIM_SMOOTH_RATE_HOLD_ALIGN = 2.3;
    const DOCKING_AIM_SMOOTH_RATE_FINAL = 2.8;
    const DOCKING_AIM_SMOOTH_RATE_CAPTURE = 4.1;
    const FLIGHT_CAMERA_BASE_FOV = 62;
    const FLIGHT_CAMERA_BASE_NEAR = 0.1;
    const DOCKING_CAMERA_HOLD_ALIGN_FOV = 48;
    const DOCKING_CAMERA_FINAL_FOV = 32;
    const DOCKING_CAMERA_CAPTURE_FOV = 20;
    const DOCKING_CAMERA_HOLD_ALIGN_NEAR = 0.05;
    const DOCKING_CAMERA_FINAL_NEAR = 0.02;
    const DOCKING_CAMERA_CAPTURE_NEAR = 0.008;
    const DOCKING_CAMERA_PRESENTATION_RANGE_KM = 1.4;
    const DOCKING_CAMERA_BLEND_SMOOTH_RATE = 2.8;
    const DOCKING_CAMERA_FOV_SMOOTH_RATE = 3.8;
    const dockingStageTransitionConfig = {
        holdPointThresholdKm: DOCKING_HOLD_POINT_THRESHOLD,
        holdEntryMinDurationMs: DOCKING_HOLD_ENTRY_MIN_DURATION_MS,
        holdEntryAlignCosine: DOCKING_HOLD_ENTRY_ALIGN_COSINE,
        holdEntryCorridorToleranceKm: DOCKING_HOLD_ENTRY_CORRIDOR_TOLERANCE_KM,
        holdAlignRequiredCosine: DOCKING_HOLD_ALIGN_REQUIRED_COSINE,
        holdAlignCorridorToleranceKm: DOCKING_HOLD_ALIGN_CORRIDOR_TOLERANCE_KM,
        holdAlignDurationMs: DOCKING_HOLD_ALIGN_DURATION_MS,
        holdAlignStableMs: DOCKING_HOLD_ALIGN_STABLE_MS,
        holdAlignMaxDurationMs: DOCKING_HOLD_ALIGN_MAX_DURATION_MS,
        holdAlignTimeoutRequiredCosine: DOCKING_HOLD_ALIGN_TIMEOUT_REQUIRED_COSINE,
        holdAlignTimeoutCorridorToleranceKm: DOCKING_HOLD_ALIGN_TIMEOUT_CORRIDOR_TOLERANCE_KM,
        holdAlignTimeoutMaxDistanceKm: DOCKING_HOLD_ALIGN_TIMEOUT_MAX_DISTANCE_KM,
        holdAlignFinalEntryMaxDistanceKm: DOCKING_HOLD_ALIGN_FINAL_ENTRY_MAX_DISTANCE_KM,
        holdAlignResetAlignmentCosine: DOCKING_HOLD_ALIGN_RESET_ALIGNMENT_COSINE,
        holdAlignResetCorridorMinKm: DOCKING_HOLD_ALIGN_RESET_CORRIDOR_MIN_KM,
        holdAlignResetTimeoutMs: DOCKING_HOLD_ALIGN_RESET_TIMEOUT_MS,
        holdAlignResetCooldownMs: DOCKING_HOLD_ALIGN_RESET_COOLDOWN_MS,
        tunnelEntryMinDurationMs: DOCKING_TUNNEL_ENTRY_MIN_DURATION_MS,
        tunnelEntryFinalTriggerKm: DOCKING_TUNNEL_ENTRY_FINAL_TRIGGER_KM,
        finalHardLockAlignmentCosine: DOCKING_FINAL_HARD_LOCK_ALIGNMENT_COSINE,
        finalInsidePortCorridorMaxKm: DOCKING_FINAL_INSIDE_PORT_CORRIDOR_MAX_KM,
        finalReacquireMinElapsedMs: DOCKING_FINAL_REACQUIRE_MIN_ELAPSED_MS,
        finalReacquireCooldownMs: DOCKING_FINAL_REACQUIRE_COOLDOWN_MS,
        finalReacquireMinDistanceKm: DOCKING_FINAL_REACQUIRE_MIN_DISTANCE_KM,
        finalReacquireAlignmentCosine: DOCKING_FINAL_REACQUIRE_ALIGNMENT_COSINE,
        finalReacquireCorridorMinKm: DOCKING_FINAL_REACQUIRE_CORRIDOR_MIN_KM,
    };
    const dockingCompletionConfig = {
        finalHardLockThresholdKm: DOCKING_FINAL_HARD_LOCK_THRESHOLD,
        completeMinTunnelPenetrationKm: DOCKING_COMPLETE_MIN_TUNNEL_PENETRATION_KM,
        finalHardLockAlignmentCosine: DOCKING_FINAL_HARD_LOCK_ALIGNMENT_COSINE,
        finalInsidePortCorridorMaxKm: DOCKING_FINAL_INSIDE_PORT_CORRIDOR_MAX_KM,
        finalInsidePortMaxSpeed: DOCKING_FINAL_INSIDE_PORT_MAX_SPEED,
        finalInsidePortThresholdKm: DOCKING_FINAL_INSIDE_PORT_THRESHOLD_KM,
        completeStrictTunnelPenetrationKm: DOCKING_COMPLETE_STRICT_TUNNEL_PENETRATION_KM,
        finalInsidePortApproachMaxKm: DOCKING_FINAL_INSIDE_PORT_APPROACH_MAX_KM,
        finalNearPortThresholdKm: DOCKING_FINAL_NEAR_PORT_THRESHOLD_KM,
        finalNearPortApproachMaxKm: DOCKING_FINAL_NEAR_PORT_APPROACH_MAX_KM,
        finalNearPortCorridorMaxKm: DOCKING_FINAL_NEAR_PORT_CORRIDOR_MAX_KM,
        finalNearPortMaxSpeed: DOCKING_FINAL_NEAR_PORT_MAX_SPEED,
        finalStageMinDurationMs: DOCKING_FINAL_STAGE_MIN_DURATION_MS,
        portThresholdKm: DOCKING_PORT_THRESHOLD,
        directPortAlignmentCosine: DOCKING_DIRECT_PORT_ALIGNMENT_COSINE,
        directPortCorridorMaxKm: DOCKING_DIRECT_PORT_CORRIDOR_MAX_KM,
        directPortApproachMaxKm: DOCKING_DIRECT_PORT_APPROACH_MAX_KM,
        directPortMaxSpeed: DOCKING_DIRECT_PORT_MAX_SPEED,
        finalStageForceCompleteMs: DOCKING_FINAL_STAGE_FORCE_COMPLETE_MS,
        portFallbackThresholdKm: DOCKING_PORT_FALLBACK_THRESHOLD,
        fallbackAlignmentCosine: DOCKING_FALLBACK_ALIGNMENT_COSINE,
        fallbackCorridorMaxKm: DOCKING_FALLBACK_CORRIDOR_MAX_KM,
    };
    const dockingRotationMatchConfig = {
        rotationMatchMaxDistanceKm: DOCKING_ROTATION_MATCH_MAX_DISTANCE_KM,
        rotationMatchFinalDistanceKm: DOCKING_ROTATION_MATCH_FINAL_DISTANCE_KM,
        rotationMatchHoldAlignAlignmentCosine: DOCKING_ROTATION_MATCH_HOLD_ALIGN_ALIGNMENT_COSINE,
        rotationMatchFinalAlignmentCosine: DOCKING_ROTATION_MATCH_FINAL_ALIGNMENT_COSINE,
        rotationMatchHoldAlignCorridorMaxKm: DOCKING_ROTATION_MATCH_HOLD_ALIGN_CORRIDOR_MAX_KM,
        rotationMatchFinalCorridorMaxKm: DOCKING_ROTATION_MATCH_FINAL_CORRIDOR_MAX_KM,
        rotationMatchReleaseAlignmentCosine: DOCKING_ROTATION_MATCH_RELEASE_ALIGNMENT_COSINE,
        rotationMatchReleaseCorridorMaxKm: DOCKING_ROTATION_MATCH_RELEASE_CORRIDOR_MAX_KM,
        rotationMatchReleaseFinalCorridorMaxKm: DOCKING_ROTATION_MATCH_RELEASE_FINAL_CORRIDOR_MAX_KM,
    };

    const starCount = renderProfile === "performance"
        ? 160
        : renderProfile === "cinematic"
            ? 360
            : 260;

    const stars = useMemo<Array<{
        position: [number, number, number];
        size: number;
        color: string;
        opacity: number;
    }>>(() => (
        Array.from({ length: starCount }, (_, index) => {
            const layer = index % 4;
            const shellRadius = layer === 0
                ? 48
                : layer === 1
                    ? 96
                    : layer === 2
                        ? 152
                        : 228;
            const shellJitter = ((index * 17) % 19) - 9;
            const radius = shellRadius + (shellJitter * 0.65);

            const ratio = (index + 0.5) / starCount;
            const polar = Math.acos(1 - (2 * ratio));
            const azimuth = index * 2.399963229728653;
            const sinPolar = Math.sin(polar);

            const x = Math.cos(azimuth) * sinPolar * radius;
            const y = Math.cos(polar) * radius;
            const z = Math.sin(azimuth) * sinPolar * radius;

            const size = layer === 0
                ? 0.05
                : layer === 1
                    ? 0.07
                    : layer === 2
                        ? 0.09
                        : 0.032;
            return {
                position: [x, y, z],
                size,
                color: layer === 3 ? "#dbe8ff" : "#f4f9ff",
                opacity: layer === 3 ? 0.42 : 0.9,
            };
        })
    ), [starCount]);

    const stationContacts = useMemo(
        () => scannerContacts
            .filter((contact) => contact.contact_type === "station")
            .sort((left, right) => left.distance_km - right.distance_km)
            .slice(0, STATION_LOD_BUDGET_BY_PROFILE[renderProfile]),
        [renderProfile, scannerContacts],
    );

    const shipContacts = useMemo(
        () => scannerContacts.filter((contact) => contact.contact_type === "ship"),
        [scannerContacts],
    );

    const dockingApproachTargetContact = useMemo(() => {
        if (!dockingApproachContactId) {
            return null;
        }
        return scannerContacts.find((contact) => contact.id === dockingApproachContactId) ?? null;
    }, [dockingApproachContactId, scannerContacts]);

    const celestialAnchorById = useMemo(
        () => new Map(celestialAnchors.map((anchor) => [anchor.id, anchor])),
        [celestialAnchors],
    );

    const waypointTargetId = dockingApproachTargetContact?.id ?? waypointContactId ?? null;

    const waypointTargetContact = useMemo(() => {
        if (dockingApproachTargetContact) {
            return dockingApproachTargetContact;
        }
        if (!waypointTargetId) {
            return null;
        }
        return scannerContacts.find((contact) => contact.id === waypointTargetId) ?? null;
    }, [dockingApproachTargetContact, scannerContacts, waypointTargetId]);

    const waypointTargetCelestialAnchor = useMemo(() => {
        if (!waypointTargetId || dockingApproachTargetContact) {
            return null;
        }
        return celestialAnchorById.get(waypointTargetId) ?? null;
    }, [celestialAnchorById, dockingApproachTargetContact, waypointTargetId]);

    const focusedContactCelestialAnchor = useMemo(() => {
        if (!focusedContact) {
            return null;
        }
        return celestialAnchorById.get(focusedContact.id) ?? null;
    }, [celestialAnchorById, focusedContact]);

    useEffect(() => {
        dockingApproachInitialDistanceRef.current = null;
        dockingApproachCompleteSentRef.current = false;
        dockingApproachLastProgressRef.current = -1;
        dockingApproachStageRef.current = "hold-entry";
        dockingApproachLastTargetIdRef.current = null;
        dockingApproachStageStartedAtRef.current = 0;
        dockingHoldAlignAlignedSinceRef.current = 0;
        dockingFinalReacquireLastAtRef.current = 0;
        dockingLastResetAtRef.current = 0;
        dockingRotationMatchLatchedRef.current = false;
    }, [dockingApproachContactId]);

    useEffect(() => {
        if (!spawnDirective || spawnDirective.mode !== "undock-exit") {
            return;
        }
        if (spawnDirectiveAppliedNonceRef.current === spawnDirective.nonce) {
            return;
        }

        const ship = shipRef.current;
        if (!ship) {
            return;
        }
        const stationContact = scannerContacts.find((contact) => (
            contact.id === spawnDirective.stationContactId
            && contact.contact_type === "station"
        ));
        if (!stationContact) {
            return;
        }

        const [stationX, stationY, stationZ] = sceneAnchorPosition(stationContact);
        const directionAwayFromStation = dockingTemporaryVectorRef.current.set(
            -stationX,
            -stationY,
            -stationZ,
        );
        if (directionAwayFromStation.lengthSq() <= 0.000001) {
            directionAwayFromStation.set(0, 0, 1);
        } else {
            directionAwayFromStation.normalize();
        }

        ship.position.set(0, 0, 0);
        yawRef.current = desiredDockingYawFromDirection(
            directionAwayFromStation.x,
            directionAwayFromStation.z,
        );
        pitchRef.current = desiredDockingPitchFromDirection(
            directionAwayFromStation.y,
            AUTOPILOT_MAX_PITCH_RADIANS,
        );
        rollRef.current = 0;

        worldVelocityRef.current
            .copy(directionAwayFromStation)
            .multiplyScalar(DOCKING_UNDOCK_EXIT_FORWARD_SPEED);
        velocityRef.current = worldVelocityRef.current.length();
        lastReportedSpeedRef.current = Number.NaN;
        lastReportedRollRef.current = Number.NaN;
        activeCollisionContactIdRef.current = null;
        lastCollisionAtRef.current = 0;

        spawnDirectiveAppliedNonceRef.current = spawnDirective.nonce;
        onSpawnDirectiveApplied?.(spawnDirective.nonce);
    }, [
        onSpawnDirectiveApplied,
        scannerContacts,
        spawnDirective,
    ]);

    useEffect(() => {
        const ship = shipRef.current;
        const previousJumpPhase = lastJumpPhaseRef.current;
        lastJumpPhaseRef.current = jumpPhase;

        if (!ship || jumpPhase !== "arrived" || previousJumpPhase === "arrived") {
            return;
        }

        ship.position.set(0, 0, 0);
        worldVelocityRef.current.set(0, 0, 0);
        velocityRef.current = 0;
        lastReportedSpeedRef.current = Number.NaN;
    }, [jumpPhase]);

    const waypointPosition = useMemo<[number, number, number] | null>(() => {
        if (waypointTargetContact) {
            return resolveContactMarkerPosition(
                waypointTargetContact,
                celestialAnchorById.get(waypointTargetContact.id) ?? null,
            );
        }
        if (!waypointTargetCelestialAnchor) {
            return null;
        }
        return celestialAnchorPosition(waypointTargetCelestialAnchor);
    }, [celestialAnchorById, waypointTargetCelestialAnchor, waypointTargetContact]);

    const focusedContactPosition = useMemo<[number, number, number] | null>(() => {
        if (!focusedContact) {
            return null;
        }
        return resolveContactMarkerPosition(focusedContact, focusedContactCelestialAnchor);
    }, [focusedContact, focusedContactCelestialAnchor]);

    const showFocusedContactIndicator = Boolean(
        focusedContactPosition
        && focusedContact?.id
        && focusedContact.id !== waypointTargetId,
    );

    const waypointIndicatorScale = useMemo(() => {
        if (waypointTargetContact?.contact_type === "station") {
            return resolveStationCollisionRadiusKm(waypointTargetContact) + 1.2;
        }
        if (waypointTargetCelestialAnchor) {
            return resolveCelestialAnchorSize(waypointTargetCelestialAnchor) + 1.1;
        }
        return 1.8;
    }, [waypointTargetCelestialAnchor, waypointTargetContact]);

    const showWaypointIndicator = Boolean(waypointPosition && waypointTargetId);

    const trafficCount = COBRA_TRAFFIC_LOD_BUDGET_BY_PROFILE[renderProfile];

    const trafficContacts = useMemo(
        () => [...shipContacts]
            .sort((left, right) => left.distance_km - right.distance_km)
            .slice(0, trafficCount),
        [shipContacts, trafficCount],
    );

    const visibleCelestialAnchors = useMemo(
        () => celestialAnchors
            .sort((left, right) => left.distance_km - right.distance_km)
            .slice(0, CELESTIAL_LOD_BUDGET_BY_PROFILE[renderProfile]),
        [celestialAnchors, renderProfile],
    );

    useEffect(() => {
        const isPitchUpKey = (event: KeyboardEvent): boolean => {
            const key = event.key.toLowerCase();
            return event.code === "KeyI" || event.code === "KeyP" || event.code === "ArrowUp" || key === "i" || key === "p" || event.key === "ArrowUp";
        };

        const isPitchDownKey = (event: KeyboardEvent): boolean => {
            const key = event.key.toLowerCase();
            return event.code === "KeyK" || event.code === "KeyL" || event.code === "ArrowDown" || key === "k" || key === "l" || event.key === "ArrowDown";
        };

        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.code === "KeyA") {
                inputRef.current.yawLeft = true;
            }
            if (event.code === "KeyD") {
                inputRef.current.yawRight = true;
            }
            if (event.code === "KeyQ") {
                inputRef.current.rollLeft = true;
            }
            if (event.code === "KeyE") {
                inputRef.current.rollRight = true;
            }
            if (event.code === "KeyW") {
                inputRef.current.throttleUp = true;
            }
            if (event.code === "KeyS") {
                inputRef.current.throttleDown = true;
            }
            if (event.code === "KeyX") {
                inputRef.current.throttleToZero = true;
            }
            if (isPitchUpKey(event)) {
                if (event.code === "ArrowUp" || event.key === "ArrowUp") {
                    event.preventDefault();
                }
                inputRef.current.pitchUp = true;
            }
            if (isPitchDownKey(event)) {
                if (event.code === "ArrowDown" || event.key === "ArrowDown") {
                    event.preventDefault();
                }
                inputRef.current.pitchDown = true;
            }
        };

        const onKeyUp = (event: KeyboardEvent): void => {
            if (event.code === "KeyA") {
                inputRef.current.yawLeft = false;
            }
            if (event.code === "KeyD") {
                inputRef.current.yawRight = false;
            }
            if (event.code === "KeyQ") {
                inputRef.current.rollLeft = false;
            }
            if (event.code === "KeyE") {
                inputRef.current.rollRight = false;
            }
            if (event.code === "KeyW") {
                inputRef.current.throttleUp = false;
            }
            if (event.code === "KeyS") {
                inputRef.current.throttleDown = false;
            }
            if (event.code === "KeyX") {
                inputRef.current.throttleToZero = false;
            }
            if (isPitchUpKey(event)) {
                if (event.code === "ArrowUp" || event.key === "ArrowUp") {
                    event.preventDefault();
                }
                inputRef.current.pitchUp = false;
            }
            if (isPitchDownKey(event)) {
                if (event.code === "ArrowDown" || event.key === "ArrowDown") {
                    event.preventDefault();
                }
                inputRef.current.pitchDown = false;
            }
        };

        const resetInputState = (): void => {
            inputRef.current = {
                yawLeft: false,
                yawRight: false,
                rollLeft: false,
                rollRight: false,
                throttleUp: false,
                throttleDown: false,
                throttleToZero: false,
                pitchUp: false,
                pitchDown: false,
            };
        };

        const onVisibilityChange = (): void => {
            if (document.visibilityState !== "visible") {
                resetInputState();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", resetInputState);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", resetInputState);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, []);

    useFrame((state, delta) => {
        const ship = shipRef.current;
        if (!ship) {
            return;
        }

        const dockingApproachRequested = Boolean(dockingApproachContactId);
        const isDockingApproachActive = Boolean(
            dockingApproachContactId
            && dockingApproachTargetContact,
        );

        if (dockingApproachRequested && !isDockingApproachActive && onDockingDebug) {
            const nowMs = performance.now();
            if (nowMs - lastDockingDebugContactMissingAtRef.current >= 1000) {
                lastDockingDebugContactMissingAtRef.current = nowMs;
                onDockingDebug({
                    event: "contact-missing",
                    jumpPhase,
                    contactId: dockingApproachContactId ?? "unknown",
                    reason: "docking-target-contact-not-in-scanner-feed",
                });
            }
        }

        const input = inputRef.current;
        if (isDockingApproachActive && dockingApproachTargetContact) {
            const approachTargetId = dockingApproachTargetContact.id;
            const stationCollisionRadiusKm = resolveStationCollisionRadiusKm(
                dockingApproachTargetContact,
            );
            const stationCenter = resolveContactRenderPosition(
                dockingApproachTargetContact,
                dockingApproachStationCenterRef.current,
            );
            const portCorePosition = resolveDockingPortWorldPosition(
                dockingApproachTargetContact,
                dockingApproachPortCorePositionRef.current,
                state.clock.elapsedTime,
            );
            const entryVector = dockingApproachEntryVectorRef.current
                .copy(portCorePosition)
                .sub(stationCenter);
            if (entryVector.lengthSq() <= 0.000001) {
                entryVector.set(0, 0, 1);
            } else {
                entryVector.normalize();
            }
            const portCoreDistanceToCenter = stationCenter.distanceTo(portCorePosition);
            const portStandoffKm = Math.max(
                DOCKING_PORT_MIN_STANDOFF_KM,
                (stationCollisionRadiusKm + DOCKING_PORT_SURFACE_CLEARANCE_KM) - portCoreDistanceToCenter,
            );
            const portPosition = dockingApproachPortPositionRef.current
                .copy(portCorePosition)
                .addScaledVector(entryVector, portStandoffKm);
            const tunnelEntryPosition = dockingApproachTunnelEntryPositionRef.current
                .copy(portCorePosition)
                .addScaledVector(entryVector, -DOCKING_TUNNEL_ENTRY_TARGET_OFFSET_KM);

            if (dockingApproachLastTargetIdRef.current !== approachTargetId) {
                dockingApproachLastTargetIdRef.current = approachTargetId;
                dockingApproachStageRef.current = "hold-entry";
                dockingApproachStageStartedAtRef.current = performance.now();
                dockingHoldAlignAlignedSinceRef.current = 0;

                onDockingDebug?.({
                    event: "target-acquired",
                    jumpPhase,
                    contactId: approachTargetId,
                    targetName: dockingApproachTargetContact.name,
                    stage: "hold-entry",
                });

                const holdDistance = DOCKING_HOLD_DISTANCE_MIN
                    + (Math.random() * (DOCKING_HOLD_DISTANCE_MAX - DOCKING_HOLD_DISTANCE_MIN));

                dockingApproachHoldPointRef.current
                    .copy(portPosition)
                    .addScaledVector(entryVector, holdDistance);
                const initialFilteredAim = dockingFilteredAimDirectionRef.current
                    .copy(dockingApproachHoldPointRef.current)
                    .sub(ship.position);
                if (initialFilteredAim.lengthSq() <= 0.000001) {
                    initialFilteredAim.copy(entryVector).multiplyScalar(-1);
                } else {
                    initialFilteredAim.normalize();
                }

                const initialPathDistance = ship.position.distanceTo(
                    dockingApproachHoldPointRef.current,
                ) + dockingApproachHoldPointRef.current.distanceTo(portCorePosition);
                dockingApproachInitialDistanceRef.current = Math.max(
                    initialPathDistance,
                    DOCKING_PORT_THRESHOLD,
                );
            }

            const holdEntryDistanceRemaining = dockingApproachStageRef.current === "hold-entry"
                ? ship.position.distanceTo(dockingApproachHoldPointRef.current)
                : Number.POSITIVE_INFINITY;

            const distanceToPort = ship.position.distanceTo(portCorePosition);
            const distanceToApproachPoint = ship.position.distanceTo(portPosition);
            const tunnelPenetrationDepthKm = Math.max(
                0,
                -dockingTemporaryVectorRef.current
                    .copy(ship.position)
                    .sub(portPosition)
                    .dot(entryVector),
            );
            const activeApproachStage = dockingApproachStageRef.current;
            const dockingCameraPresentationBlend = calculateDockingCameraPresentationBlend({
                stage: activeApproachStage,
                distanceToPortKm: distanceToPort,
                presentationRangeKm: DOCKING_CAMERA_PRESENTATION_RANGE_KM,
            });
            dockingCameraPresentationTargetRef.current = dockingCameraPresentationBlend;
            const baseFlightCameraOffset = cameraMode === "cockpit"
                ? flightCameraCockpitOffsetRef.current
                : flightCameraBoresightOffsetRef.current;
            dockingCameraPresentationOffsetRef.current
                .copy(baseFlightCameraOffset)
                .lerp(dockingCameraDockingOffsetRef.current, dockingCameraPresentationBlend);
            if (activeApproachStage === "hold-align") {
                const dynamicHoldDistance = clamp(
                    (distanceToPort * 0.22) + 0.18,
                    0.28,
                    0.62,
                );
                dockingApproachHoldPointRef.current
                    .copy(portPosition)
                    .addScaledVector(entryVector, dynamicHoldDistance);
            }
            const stageTarget = activeApproachStage === "final-approach"
                ? portCorePosition
                : activeApproachStage === "tunnel-entry"
                    ? tunnelEntryPosition
                    : dockingApproachHoldPointRef.current;
            const stageDistanceRemaining = ship.position.distanceTo(stageTarget);
            const rotationMatchInRange = (
                Boolean(dockingRotationMatchEnabled)
                && activeApproachStage !== "hold-entry"
                &&
                distanceToPort <= DOCKING_PORT_ROTATION_MATCH_RANGE_KM
            );

            const pathDirection = dockingDesiredVectorRef.current
                .copy(stageTarget)
                .sub(ship.position);
            if (pathDirection.lengthSq() <= 0.000001) {
                pathDirection.copy(entryVector).multiplyScalar(-1);
            }

            const avoidanceVector = dockingAvoidanceVectorRef.current.set(0, 0, 0);
            for (const trafficContact of shipContacts) {
                dockingTemporaryVectorRef.current
                    .copy(resolveContactRenderPosition(trafficContact, dockingTemporaryVectorRef.current))
                    .sub(ship.position)
                    .multiplyScalar(-1);
                const trafficDistance = dockingTemporaryVectorRef.current.length();
                if (trafficDistance <= 0.001 || trafficDistance >= DOCKING_AVOIDANCE_RADIUS) {
                    continue;
                }

                const influence = (DOCKING_AVOIDANCE_RADIUS - trafficDistance)
                    / DOCKING_AVOIDANCE_RADIUS;
                avoidanceVector.addScaledVector(
                    dockingTemporaryVectorRef.current.normalize(),
                    influence,
                );
            }
            const applyAvoidance = activeApproachStage === "hold-entry";
            if (applyAvoidance && avoidanceVector.lengthSq() > 0.0001) {
                pathDirection.addScaledVector(avoidanceVector.normalize(), 0.85);
            }
            pathDirection.normalize();

            const aimDirection = dockingAimDirectionRef.current.copy(pathDirection);
            const finalCaptureActive = (
                activeApproachStage === "final-approach"
                && distanceToPort <= DOCKING_FINAL_CAPTURE_DISTANCE_KM
            );
            dockingCameraTargetFovRef.current = activeApproachStage === "final-approach"
                ? (
                    finalCaptureActive
                        ? DOCKING_CAMERA_CAPTURE_FOV
                        : (
                            DOCKING_CAMERA_FINAL_FOV
                            + ((FLIGHT_CAMERA_BASE_FOV - DOCKING_CAMERA_FINAL_FOV)
                                * (1 - dockingCameraPresentationBlend))
                        )
                )
                    : activeApproachStage === "hold-align"
                        ? (
                            FLIGHT_CAMERA_BASE_FOV
                            - ((FLIGHT_CAMERA_BASE_FOV - DOCKING_CAMERA_HOLD_ALIGN_FOV)
                                * dockingCameraPresentationBlend)
                        )
                    : FLIGHT_CAMERA_BASE_FOV;
            dockingCameraTargetNearRef.current = activeApproachStage === "final-approach"
                ? (
                    finalCaptureActive
                        ? DOCKING_CAMERA_CAPTURE_NEAR
                        : (
                            DOCKING_CAMERA_FINAL_NEAR
                            + ((FLIGHT_CAMERA_BASE_NEAR - DOCKING_CAMERA_FINAL_NEAR)
                                * (1 - dockingCameraPresentationBlend))
                        )
                )
                : activeApproachStage === "hold-align"
                    ? (
                        FLIGHT_CAMERA_BASE_NEAR
                        - ((FLIGHT_CAMERA_BASE_NEAR - DOCKING_CAMERA_HOLD_ALIGN_NEAR)
                            * dockingCameraPresentationBlend)
                    )
                    : FLIGHT_CAMERA_BASE_NEAR;
            const cameraOffsetOrientation = dockingCameraOffsetQuaternionRef.current.setFromEuler(
                dockingOrientationEulerRef.current.set(
                    pitchRef.current,
                    yawRef.current,
                    0,
                    "YXZ",
                ),
            );
            const cameraAimPosition = dockingCameraAimPositionRef.current
                .copy(dockingCameraPresentationOffsetRef.current)
                .applyQuaternion(cameraOffsetOrientation)
                .add(ship.position);
            const cameraToPort = dockingCameraToPortRef.current
                .copy(portCorePosition)
                .sub(cameraAimPosition);
            const sceneCamera = state.camera as PerspectiveCamera;
            const displayedDockingCameraFov = sceneCamera.fov + (
                dockingCameraTargetFovRef.current - sceneCamera.fov
            ) * clamp(DOCKING_CAMERA_FOV_SMOOTH_RATE * delta, 0, 1);
            const portCameraSpace = dockingPortCameraSpaceRef.current
                .copy(portCorePosition)
                .sub(cameraAimPosition)
                .applyQuaternion(
                    dockingCameraInverseQuaternionRef.current
                        .copy(
                            dockingCameraQuaternionRef.current.setFromEuler(
                                dockingOrientationEulerRef.current.set(
                                    pitchRef.current,
                                    yawRef.current,
                                    rollRef.current,
                                    "YXZ",
                                ),
                            ),
                        )
                        .invert(),
                );
            const portScreenProjection = projectCameraSpacePointToNdc({
                cameraSpaceX: portCameraSpace.x,
                cameraSpaceY: portCameraSpace.y,
                cameraSpaceZ: portCameraSpace.z,
                verticalFovDegrees: displayedDockingCameraFov,
                aspectRatio: Math.max(0.1, sceneCamera.aspect),
            });
            const screenValidity = calculateDockingScreenValidity({
                ndcX: portScreenProjection.ndcX,
                ndcY: portScreenProjection.ndcY,
                inView: portScreenProjection.inView,
                centerMaxX: DOCKING_COMPLETE_SCREEN_CENTER_MAX_X,
                centerMaxY: DOCKING_COMPLETE_SCREEN_CENTER_MAX_Y,
                strictCenterMaxX: DOCKING_COMPLETE_SCREEN_STRICT_CENTER_MAX_X,
                strictCenterMaxY: DOCKING_COMPLETE_SCREEN_STRICT_CENTER_MAX_Y,
            });
            const {
                portVisibleOnScreen,
                portCenteredOnScreen,
            } = screenValidity;
            if (cameraToPort.lengthSq() > 0.000001) {
                cameraToPort.normalize();
                const reticleBlend = activeApproachStage === "hold-entry"
                    ? Math.max(
                        DOCKING_RETICLE_HOLD_ENTRY_BLEND,
                        clamp(
                            1 - (distanceToPort / DOCKING_RETICLE_EARLY_LOCK_RANGE_KM),
                            0,
                            1,
                        ) * 0.28,
                    )
                    : activeApproachStage === "hold-align"
                        ? DOCKING_RETICLE_HOLD_ALIGN_BLEND
                        : finalCaptureActive
                            ? DOCKING_RETICLE_HARD_LOCK_BLEND
                            : Math.max(
                                0.82,
                                clamp(
                                    1 - (distanceToPort / DOCKING_RETICLE_LOCK_RANGE_KM),
                                    0,
                                    1,
                                ),
                            );
                if (activeApproachStage === "hold-entry") {
                    aimDirection.lerp(cameraToPort, reticleBlend).normalize();
                } else if (finalCaptureActive) {
                    aimDirection.copy(pathDirection).normalize();
                } else {
                    const cameraBias = finalCaptureActive
                        ? DOCKING_RETICLE_CAMERA_BIAS_CAPTURE
                        : activeApproachStage === "hold-align"
                            ? DOCKING_RETICLE_CAMERA_BIAS_HOLD_ALIGN
                            : DOCKING_RETICLE_CAMERA_BIAS_FINAL;
                    aimDirection.copy(pathDirection);
                    aimDirection.lerp(cameraToPort, cameraBias).normalize();
                }
            }
            const filteredAimDirection = dockingFilteredAimDirectionRef.current;
            if (filteredAimDirection.lengthSq() <= 0.000001) {
                filteredAimDirection.copy(aimDirection);
            } else {
                const aimSmoothingRate = finalCaptureActive
                    ? DOCKING_AIM_SMOOTH_RATE_CAPTURE
                    : activeApproachStage === "final-approach"
                        ? DOCKING_AIM_SMOOTH_RATE_FINAL
                        : activeApproachStage === "hold-align"
                            ? DOCKING_AIM_SMOOTH_RATE_HOLD_ALIGN
                            : DOCKING_AIM_SMOOTH_RATE_HOLD_ENTRY;
                const aimSmoothingFactor = clamp(aimSmoothingRate * delta, 0, 1);
                filteredAimDirection.lerp(aimDirection, aimSmoothingFactor);
            }
            if (filteredAimDirection.lengthSq() <= 0.000001) {
                filteredAimDirection.copy(pathDirection);
            }
            filteredAimDirection.normalize();

            const desiredYaw = desiredDockingYawFromDirection(
                filteredAimDirection.x,
                filteredAimDirection.z,
            );
            const desiredPitch = desiredDockingPitchFromDirection(
                filteredAimDirection.y,
                AUTOPILOT_MAX_PITCH_RADIANS,
            );
            const closeRangeFinalApproach = (
                activeApproachStage === "final-approach"
                && distanceToPort <= DOCKING_FINAL_CLOSE_RANGE_KM
            );
            const holdEntryTurnRampRatio = activeApproachStage === "hold-entry"
                ? clamp(
                    (performance.now() - dockingApproachStageStartedAtRef.current) / DOCKING_HOLD_ENTRY_TURN_RAMP_MS,
                    0,
                    1,
                )
                : 1;
            const maxYawRate = finalCaptureActive
                ? DOCKING_FINAL_CAPTURE_YAW_RATE
                : closeRangeFinalApproach
                    ? DOCKING_FINAL_CLOSE_YAW_RATE
                    : (
                        DOCKING_HOLD_ENTRY_INITIAL_YAW_RATE
                        + ((1.9 - DOCKING_HOLD_ENTRY_INITIAL_YAW_RATE) * holdEntryTurnRampRatio)
                    );
            const maxPitchRate = finalCaptureActive
                ? DOCKING_FINAL_CAPTURE_PITCH_RATE
                : closeRangeFinalApproach
                    ? DOCKING_FINAL_CLOSE_PITCH_RATE
                    : (
                        DOCKING_HOLD_ENTRY_INITIAL_PITCH_RATE
                        + ((1.4 - DOCKING_HOLD_ENTRY_INITIAL_PITCH_RATE) * holdEntryTurnRampRatio)
                    );

            const nextAttitude = advanceDockingAttitude({
                currentYawRadians: yawRef.current,
                currentPitchRadians: pitchRef.current,
                desiredYawRadians: desiredYaw,
                desiredPitchRadians: desiredPitch,
                maxPitchRadians: AUTOPILOT_MAX_PITCH_RADIANS,
                maxYawRateRadPerSec: maxYawRate,
                maxPitchRateRadPerSec: maxPitchRate,
                deltaSeconds: delta,
            });
            yawRef.current = nextAttitude.yawRadians;
            pitchRef.current = nextAttitude.pitchRadians;

            const shipToPortDirection = dockingShipToPortDirectionRef.current
                .copy(portCorePosition)
                .sub(ship.position);
            if (shipToPortDirection.lengthSq() <= 0.000001) {
                shipToPortDirection.copy(entryVector).multiplyScalar(-1);
            } else {
                shipToPortDirection.normalize();
            }
            const shipForward = dockingForwardVectorRef.current
                .set(0, 0, -1)
                .applyEuler(dockingOrientationEulerRef.current.set(
                    pitchRef.current,
                    yawRef.current,
                    rollRef.current,
                    "YXZ",
                ))
                .normalize();
            const reticleAlignmentDirection = dockingAlignmentDirectionRef.current
                .copy(shipToPortDirection);
            if (cameraToPort.lengthSq() > 0.000001) {
                const closeRangeAlignmentBlend = clamp(
                    1 - (distanceToPort / DOCKING_RETICLE_ALIGNMENT_BLEND_RANGE_KM),
                    0,
                    1,
                );
                reticleAlignmentDirection.lerp(cameraToPort, closeRangeAlignmentBlend);
                if (reticleAlignmentDirection.lengthSq() <= 0.000001) {
                    reticleAlignmentDirection.copy(shipToPortDirection);
                } else {
                    reticleAlignmentDirection.normalize();
                }
            }
            const reticleAlignmentCosine = shipForward.dot(reticleAlignmentDirection);
            const corridorLateralOffset = (() => {
                const offsetFromPort = dockingTemporaryVectorRef.current
                    .copy(ship.position)
                    .sub(portPosition);
                const projectedAlongEntry = offsetFromPort.dot(entryVector);
                offsetFromPort.addScaledVector(entryVector, -projectedAlongEntry);
                return offsetFromPort.length();
            })();
            const holdEntryTransition = activeApproachStage === "hold-entry"
                ? resolveDockingStageTransition({
                    stage: activeApproachStage,
                    nowMs: performance.now(),
                    stageStartedAtMs: dockingApproachStageStartedAtRef.current,
                    holdAlignAlignedSinceMs: dockingHoldAlignAlignedSinceRef.current,
                    lastResetAtMs: dockingLastResetAtRef.current,
                    lastFinalReacquireAtMs: dockingFinalReacquireLastAtRef.current,
                    holdEntryDistanceRemainingKm: holdEntryDistanceRemaining,
                    distanceToPortKm: distanceToPort,
                    distanceToApproachPointKm: distanceToApproachPoint,
                    stageDistanceRemainingKm: stageDistanceRemaining,
                    reticleAlignmentCosine,
                    corridorLateralOffsetKm: corridorLateralOffset,
                    tunnelPenetrationDepthKm,
                    config: dockingStageTransitionConfig,
                })
                : null;
            if (holdEntryTransition) {
                dockingApproachStageRef.current = holdEntryTransition.nextStage;
                dockingApproachStageStartedAtRef.current = performance.now();
                dockingHoldAlignAlignedSinceRef.current = 0;
                onDockingDebug?.({
                    event: "stage-transition",
                    jumpPhase,
                    contactId: approachTargetId,
                    targetName: dockingApproachTargetContact.name,
                    stage: holdEntryTransition.nextStage,
                    reason: holdEntryTransition.reason,
                    distanceToPortKm: distanceToPort,
                    distanceToApproachPointKm: distanceToApproachPoint,
                    reticleAlignmentCosine,
                    corridorLateralOffsetKm: corridorLateralOffset,
                });
            }
            const applyRotationMatch = resolveDockingRotationMatch({
                stage: activeApproachStage,
                rotationMatchEnabled: rotationMatchInRange,
                rotationMatchLatched: dockingRotationMatchLatchedRef.current,
                distanceToPortKm: distanceToPort,
                reticleAlignmentCosine,
                corridorLateralOffsetKm: corridorLateralOffset,
                config: dockingRotationMatchConfig,
            });
            dockingRotationMatchLatchedRef.current = applyRotationMatch;

            if (applyRotationMatch) {
                const desiredRoll = normalizeSignedAngle(
                    resolveStationRotationRadians(
                        dockingApproachTargetContact,
                        state.clock.elapsedTime,
                    ),
                );
                const rollDelta = normalizeSignedAngle(desiredRoll - rollRef.current);
                const maxRollStep = DOCKING_ROTATION_MATCH_ROLL_RATE * delta;
                const nextRollStep = clamp(rollDelta, -maxRollStep, maxRollStep);
                rollRef.current = normalizeSignedAngle(rollRef.current + nextRollStep);
            } else {
                rollRef.current = normalizeSignedAngle(
                    rollRef.current * Math.max(0, 1 - ((finalCaptureActive ? 5.2 : 3.2) * delta)),
                );
            }

            if (activeApproachStage === "hold-align") {
                const nowMs = performance.now();
                const holdAlignAligned = (
                    reticleAlignmentCosine >= DOCKING_HOLD_ALIGN_REQUIRED_COSINE
                    && stageDistanceRemaining <= DOCKING_HOLD_POINT_THRESHOLD
                    && corridorLateralOffset <= DOCKING_HOLD_ALIGN_CORRIDOR_TOLERANCE_KM
                );
                if (holdAlignAligned) {
                    if (dockingHoldAlignAlignedSinceRef.current <= 0) {
                        dockingHoldAlignAlignedSinceRef.current = nowMs;
                    }
                } else {
                    dockingHoldAlignAlignedSinceRef.current = 0;
                }
                const holdAlignTransition = resolveDockingStageTransition({
                    stage: activeApproachStage,
                    nowMs,
                    stageStartedAtMs: dockingApproachStageStartedAtRef.current,
                    holdAlignAlignedSinceMs: dockingHoldAlignAlignedSinceRef.current,
                    lastResetAtMs: dockingLastResetAtRef.current,
                    lastFinalReacquireAtMs: dockingFinalReacquireLastAtRef.current,
                    holdEntryDistanceRemainingKm: holdEntryDistanceRemaining,
                    distanceToPortKm: distanceToPort,
                    distanceToApproachPointKm: distanceToApproachPoint,
                    stageDistanceRemainingKm: stageDistanceRemaining,
                    reticleAlignmentCosine,
                    corridorLateralOffsetKm: corridorLateralOffset,
                    tunnelPenetrationDepthKm,
                    config: dockingStageTransitionConfig,
                });
                if (holdAlignTransition) {
                    if (holdAlignTransition.nextStage === "hold-entry") {
                        dockingLastResetAtRef.current = nowMs;
                        const resetHoldDistance = DOCKING_RESET_HOLD_DISTANCE_MIN
                            + (Math.random()
                                * (DOCKING_RESET_HOLD_DISTANCE_MAX - DOCKING_RESET_HOLD_DISTANCE_MIN));
                        dockingApproachHoldPointRef.current
                            .copy(portPosition)
                            .addScaledVector(entryVector, resetHoldDistance);
                        worldVelocityRef.current.multiplyScalar(0.4);
                    }
                    dockingApproachStageRef.current = holdAlignTransition.nextStage;
                    dockingApproachStageStartedAtRef.current = nowMs;
                    dockingHoldAlignAlignedSinceRef.current = 0;
                    onDockingDebug?.({
                        event: "stage-transition",
                        jumpPhase,
                        contactId: approachTargetId,
                        targetName: dockingApproachTargetContact.name,
                        stage: holdAlignTransition.nextStage,
                        reason: holdAlignTransition.reason,
                        distanceToPortKm: distanceToPort,
                        distanceToApproachPointKm: distanceToApproachPoint,
                        reticleAlignmentCosine,
                        corridorLateralOffsetKm: corridorLateralOffset,
                    });
                }
            }

            if (activeApproachStage === "tunnel-entry") {
                const nowMs = performance.now();
                const tunnelEntryTransition = resolveDockingStageTransition({
                    stage: activeApproachStage,
                    nowMs,
                    stageStartedAtMs: dockingApproachStageStartedAtRef.current,
                    holdAlignAlignedSinceMs: dockingHoldAlignAlignedSinceRef.current,
                    lastResetAtMs: dockingLastResetAtRef.current,
                    lastFinalReacquireAtMs: dockingFinalReacquireLastAtRef.current,
                    holdEntryDistanceRemainingKm: holdEntryDistanceRemaining,
                    distanceToPortKm: distanceToPort,
                    distanceToApproachPointKm: distanceToApproachPoint,
                    stageDistanceRemainingKm: stageDistanceRemaining,
                    reticleAlignmentCosine,
                    corridorLateralOffsetKm: corridorLateralOffset,
                    tunnelPenetrationDepthKm,
                    config: dockingStageTransitionConfig,
                });
                if (tunnelEntryTransition) {
                    dockingApproachStageRef.current = tunnelEntryTransition.nextStage;
                    dockingApproachStageStartedAtRef.current = nowMs;
                    onDockingDebug?.({
                        event: "stage-transition",
                        jumpPhase,
                        contactId: approachTargetId,
                        targetName: dockingApproachTargetContact.name,
                        stage: tunnelEntryTransition.nextStage,
                        reason: tunnelEntryTransition.reason,
                        distanceToPortKm: distanceToPort,
                        distanceToApproachPointKm: distanceToApproachPoint,
                        reticleAlignmentCosine,
                        corridorLateralOffsetKm: corridorLateralOffset,
                    });
                }
            }

            if (activeApproachStage === "final-approach") {
                const nowMs = performance.now();
                const finalApproachTransition = resolveDockingStageTransition({
                    stage: activeApproachStage,
                    nowMs,
                    stageStartedAtMs: dockingApproachStageStartedAtRef.current,
                    holdAlignAlignedSinceMs: dockingHoldAlignAlignedSinceRef.current,
                    lastResetAtMs: dockingLastResetAtRef.current,
                    lastFinalReacquireAtMs: dockingFinalReacquireLastAtRef.current,
                    holdEntryDistanceRemainingKm: holdEntryDistanceRemaining,
                    distanceToPortKm: distanceToPort,
                    distanceToApproachPointKm: distanceToApproachPoint,
                    stageDistanceRemainingKm: stageDistanceRemaining,
                    reticleAlignmentCosine,
                    corridorLateralOffsetKm: corridorLateralOffset,
                    tunnelPenetrationDepthKm,
                    config: dockingStageTransitionConfig,
                });
                if (finalApproachTransition) {
                    dockingFinalReacquireLastAtRef.current = nowMs;
                    const reacquireHoldDistance = clamp(
                        distanceToPort + 0.32,
                        0.48,
                        1.05,
                    );
                    dockingApproachHoldPointRef.current
                        .copy(portPosition)
                        .addScaledVector(entryVector, reacquireHoldDistance);
                    dockingApproachStageRef.current = finalApproachTransition.nextStage;
                    dockingApproachStageStartedAtRef.current = nowMs;
                    dockingHoldAlignAlignedSinceRef.current = 0;
                    onDockingDebug?.({
                        event: "stage-transition",
                        jumpPhase,
                        contactId: approachTargetId,
                        targetName: dockingApproachTargetContact.name,
                        stage: finalApproachTransition.nextStage,
                        reason: finalApproachTransition.reason,
                        distanceToPortKm: distanceToPort,
                        distanceToApproachPointKm: distanceToApproachPoint,
                        reticleAlignmentCosine,
                        corridorLateralOffsetKm: corridorLateralOffset,
                    });
                }
            }

            if (onDockingDebug) {
                const nowMs = performance.now();
                if (nowMs - lastDockingDebugTelemetryAtRef.current >= 250) {
                    lastDockingDebugTelemetryAtRef.current = nowMs;
                    onDockingDebug({
                        event: "telemetry",
                        jumpPhase,
                        contactId: approachTargetId,
                        targetName: dockingApproachTargetContact.name,
                        stage: activeApproachStage,
                        distanceToPortKm: distanceToPort,
                        distanceToApproachPointKm: distanceToApproachPoint,
                        stageDistanceRemainingKm: stageDistanceRemaining,
                        reticleAlignmentCosine,
                        corridorLateralOffsetKm: corridorLateralOffset,
                        shouldMatchStationRotation: applyRotationMatch,
                        stationRotationRadians: resolveStationRotationRadians(
                            dockingApproachTargetContact,
                            state.clock.elapsedTime,
                        ),
                        shipSpeedKmPerSec: worldVelocityRef.current.length(),
                        shipPosition: {
                            x: ship.position.x,
                            y: ship.position.y,
                            z: ship.position.z,
                        },
                        stationCenter: {
                            x: stationCenter.x,
                            y: stationCenter.y,
                            z: stationCenter.z,
                        },
                        portCorePosition: {
                            x: portCorePosition.x,
                            y: portCorePosition.y,
                            z: portCorePosition.z,
                        },
                        portApproachPosition: {
                            x: portPosition.x,
                            y: portPosition.y,
                            z: portPosition.z,
                        },
                        portVisibleOnScreen,
                        portCenteredOnScreen,
                        portScreenOffsetX: portScreenProjection.ndcX,
                        portScreenOffsetY: portScreenProjection.ndcY,
                        portScreenDepthKm: portScreenProjection.depth,
                    });
                }
            }

            let desiredSpeed = activeApproachStage === "hold-entry"
                ? clamp(
                    Math.max(0.45, stageDistanceRemaining * 0.62),
                    0.45,
                    DOCKING_HOLD_MAX_SPEED,
                )
                : activeApproachStage === "hold-align"
                    ? clamp(
                        Math.max(0.04, stageDistanceRemaining * 0.22),
                        0.04,
                        DOCKING_HOLD_ALIGN_MAX_SPEED,
                    )
                : activeApproachStage === "tunnel-entry"
                    ? clamp(
                        Math.max(DOCKING_TUNNEL_ENTRY_MIN_SPEED, stageDistanceRemaining * 0.34),
                        DOCKING_TUNNEL_ENTRY_MIN_SPEED,
                        DOCKING_TUNNEL_ENTRY_MAX_SPEED,
                    )
                : (() => {
                    const finalMinSpeed = finalCaptureActive
                        ? DOCKING_FINAL_CAPTURE_MIN_SPEED
                        : closeRangeFinalApproach
                            ? DOCKING_FINAL_CLOSE_MIN_SPEED
                            : DOCKING_FINAL_MIN_SPEED;
                    const finalMaxSpeed = finalCaptureActive
                        ? DOCKING_FINAL_CAPTURE_MAX_SPEED
                        : DOCKING_FINAL_MAX_SPEED;
                    return clamp(
                        Math.max(finalMinSpeed, distanceToPort * 0.46),
                        finalMinSpeed,
                        finalMaxSpeed,
                    );
                })();
            if (
                activeApproachStage === "hold-entry"
                && distanceToPort <= DOCKING_HOLD_ENTRY_NEAR_PORT_DISTANCE_KM
            ) {
                desiredSpeed = Math.min(desiredSpeed, DOCKING_HOLD_ENTRY_NEAR_PORT_SPEED);
            }
            const holdAlignNeedsRecovery = (
                activeApproachStage === "hold-align"
                && (
                    reticleAlignmentCosine <= DOCKING_HOLD_ALIGN_RESET_ALIGNMENT_COSINE
                    || corridorLateralOffset >= DOCKING_HOLD_ALIGN_RESET_CORRIDOR_MIN_KM
                )
            );
            if (holdAlignNeedsRecovery) {
                desiredSpeed = Math.min(desiredSpeed, DOCKING_HOLD_ALIGN_RECOVERY_MAX_SPEED);
            }
            const finalApproachNeedsRecovery = (
                activeApproachStage === "final-approach"
                && (
                    reticleAlignmentCosine < DOCKING_FINAL_RECOVERY_ALIGNMENT_COSINE
                    || corridorLateralOffset > DOCKING_FINAL_RECOVERY_CORRIDOR_MAX_KM
                )
            );
            if (finalApproachNeedsRecovery) {
                desiredSpeed = Math.min(desiredSpeed, DOCKING_FINAL_RECOVERY_MAX_SPEED);
            }
            if (closeRangeFinalApproach && !finalCaptureActive) {
                const closeRangeBrakeCap = Math.max(
                    DOCKING_FINAL_CLOSE_MIN_SPEED,
                    distanceToPort * DOCKING_FINAL_CLOSE_BRAKE_FACTOR,
                );
                desiredSpeed = Math.min(desiredSpeed, closeRangeBrakeCap);
            } else if (finalCaptureActive) {
                desiredSpeed = Math.min(
                    desiredSpeed,
                    Math.max(
                        DOCKING_FINAL_CAPTURE_MIN_SPEED,
                        distanceToPort * 0.28,
                    ),
                );
            }
            const driveDirection = dockingVelocityTargetDirectionRef.current.copy(pathDirection);
            const baseTrajectoryAimBlend = finalCaptureActive
                ? DOCKING_TRAJECTORY_AIM_BLEND_CAPTURE
                : activeApproachStage === "final-approach"
                    ? DOCKING_TRAJECTORY_AIM_BLEND_FINAL
                    : activeApproachStage === "hold-align"
                        ? DOCKING_TRAJECTORY_AIM_BLEND_HOLD_ALIGN
                        : DOCKING_TRAJECTORY_AIM_BLEND_HOLD_ENTRY;
            const trajectoryAimBlend = activeApproachStage === "final-approach" && !finalCaptureActive
                ? Math.max(
                    0.12,
                    baseTrajectoryAimBlend * (
                        1 - (clamp(
                            corridorLateralOffset / DOCKING_FINAL_RECOVERY_CORRIDOR_MAX_KM,
                            0,
                            1,
                        ) * 0.75)
                    ),
                )
                : baseTrajectoryAimBlend;
            if (trajectoryAimBlend > 0) {
                driveDirection.lerp(filteredAimDirection, trajectoryAimBlend);
                if (driveDirection.lengthSq() <= 0.000001) {
                    driveDirection.copy(pathDirection);
                } else {
                    driveDirection.normalize();
                }
            }
            const targetVelocity = scannerRelativeVectorRef.current
                .copy(driveDirection)
                .multiplyScalar(desiredSpeed);
            const velocityDeltaVector = scannerCameraRelativeVectorRef.current
                .copy(targetVelocity)
                .sub(worldVelocityRef.current);
            const speedDelta = desiredSpeed - worldVelocityRef.current.length();
            let acceleration = speedDelta >= 0 ? FORWARD_ACCELERATION : REVERSE_ACCELERATION;
            if (activeApproachStage === "hold-entry") {
                acceleration = Math.min(acceleration, DOCKING_HOLD_ENTRY_ACCELERATION);
            } else if (activeApproachStage === "hold-align") {
                acceleration = Math.min(acceleration, DOCKING_HOLD_ALIGN_ACCELERATION);
            } else if (activeApproachStage === "tunnel-entry") {
                acceleration = Math.min(acceleration, DOCKING_TUNNEL_ENTRY_ACCELERATION);
            } else if (activeApproachStage === "final-approach") {
                acceleration = Math.min(acceleration, DOCKING_FINAL_APPROACH_ACCELERATION);
            }
            if (finalCaptureActive) {
                acceleration = Math.min(acceleration, DOCKING_FINAL_CAPTURE_ACCELERATION);
            } else if (closeRangeFinalApproach) {
                acceleration = Math.min(acceleration, DOCKING_FINAL_CLOSE_ACCELERATION);
            }
            const maxDeltaMagnitude = acceleration * delta;
            if (velocityDeltaVector.length() > maxDeltaMagnitude) {
                velocityDeltaVector.setLength(maxDeltaMagnitude);
            }
            worldVelocityRef.current.add(velocityDeltaVector);
            if (activeApproachStage !== "hold-entry") {
                const velocityParallel = dockingVelocityParallelRef.current
                    .copy(driveDirection)
                    .multiplyScalar(worldVelocityRef.current.dot(driveDirection));
                const velocityLateral = dockingVelocityLateralRef.current
                    .copy(worldVelocityRef.current)
                    .sub(velocityParallel);
                if (velocityLateral.lengthSq() > 0.0000001) {
                    const lateralDamping = finalCaptureActive
                        ? DOCKING_FINAL_CAPTURE_LATERAL_DAMPING
                        : closeRangeFinalApproach
                            ? DOCKING_FINAL_LATERAL_DAMPING
                            : activeApproachStage === "final-approach"
                                ? DOCKING_FINAL_LATERAL_DAMPING * 0.9
                                : DOCKING_HOLD_ALIGN_LATERAL_DAMPING;
                    const dampingFactor = clamp(lateralDamping * delta, 0, 1);
                    worldVelocityRef.current.addScaledVector(velocityLateral, -dampingFactor);
                }
            }
            velocityRef.current = worldVelocityRef.current.length();

            if (
                !dockingApproachCompleteSentRef.current
                && activeApproachStage === "final-approach"
            ) {
                const finalApproachElapsedMs = performance.now() - dockingApproachStageStartedAtRef.current;
                const completionWindow = resolveDockingCompletionWindow({
                    finalApproachElapsedMs,
                    distanceToPortKm: distanceToPort,
                    tunnelPenetrationDepthKm: tunnelPenetrationDepthKm,
                    reticleAlignmentCosine,
                    corridorLateralOffsetKm: corridorLateralOffset,
                    shipSpeedKmPerSec: worldVelocityRef.current.length(),
                    distanceToApproachPointKm: distanceToApproachPoint,
                    screenValidity,
                    config: dockingCompletionConfig,
                });

                if (completionWindow.completed) {
                    onDockingDebug?.({
                        event: "complete-window",
                        jumpPhase,
                        contactId: approachTargetId,
                        targetName: dockingApproachTargetContact.name,
                        stage: "final-approach",
                        reason: completionWindow.reason ?? undefined,
                        distanceToPortKm: distanceToPort,
                        distanceToApproachPointKm: distanceToApproachPoint,
                        reticleAlignmentCosine,
                        corridorLateralOffsetKm: corridorLateralOffset,
                        shipPosition: {
                            x: ship.position.x,
                            y: ship.position.y,
                            z: ship.position.z,
                        },
                        stationCenter: {
                            x: stationCenter.x,
                            y: stationCenter.y,
                            z: stationCenter.z,
                        },
                        portCorePosition: {
                            x: portCorePosition.x,
                            y: portCorePosition.y,
                            z: portCorePosition.z,
                        },
                        portApproachPosition: {
                            x: portPosition.x,
                            y: portPosition.y,
                            z: portPosition.z,
                        },
                        portVisibleOnScreen,
                        portCenteredOnScreen,
                        portScreenOffsetX: portScreenProjection.ndcX,
                        portScreenOffsetY: portScreenProjection.ndcY,
                        portScreenDepthKm: portScreenProjection.depth,
                    });
                    velocityRef.current = 0;
                    worldVelocityRef.current.set(0, 0, 0);
                    dockingApproachCompleteSentRef.current = true;
                    if (onDockingApproachProgress) {
                        onDockingApproachProgress({
                            progress: 100,
                            distanceKm: 0,
                            targetName: dockingApproachTargetContact.name,
                            stage: "final-approach",
                        });
                    }
                    onDockingApproachComplete?.();
                    return;
                }
            }

            if (onDockingApproachProgress && dockingApproachInitialDistanceRef.current !== null) {
                const initialDistance = Math.max(
                    dockingApproachInitialDistanceRef.current,
                    DOCKING_PORT_THRESHOLD,
                );
                const remainingDistance = activeApproachStage === "hold-entry"
                    ? stageDistanceRemaining + distanceToPort
                    : distanceToPort;
                const progress = clamp(
                    (1 - (remainingDistance / initialDistance)) * 100,
                    0,
                    100,
                );
                if (progress - dockingApproachLastProgressRef.current >= 1) {
                    dockingApproachLastProgressRef.current = progress;
                    onDockingApproachProgress({
                        progress,
                        distanceKm: Math.max(0, distanceToPort),
                        targetName: dockingApproachTargetContact.name,
                        stage: activeApproachStage,
                    });
                }
            }
        } else {
            const yawInput = (input.yawLeft ? 1 : 0) - (input.yawRight ? 1 : 0);
            const rollInput = (input.rollRight ? 1 : 0) - (input.rollLeft ? 1 : 0);
            const throttleInput = (input.throttleUp ? 1 : 0) - (input.throttleDown ? 1 : 0);
            const throttleToZero = input.throttleToZero;
            const pitchInput = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0);

            yawRef.current = normalizeHeading(yawRef.current + yawInput * 1.6 * delta);
            pitchRef.current = advanceManualPitch(
                pitchRef.current,
                pitchInput,
                delta,
            );
            rollRef.current = normalizeSignedAngle(
                rollRef.current + rollInput * ROLL_RATE * delta,
            );


            const maxSpeedMagnitude = FORWARD_SPEED_LIMIT;
            if (throttleToZero) {
                const currentSpeedMagnitude = worldVelocityRef.current.length();
                const counterThrust = REVERSE_ACCELERATION * delta;
                if (currentSpeedMagnitude <= counterThrust) {
                    worldVelocityRef.current.set(0, 0, 0);
                } else if (currentSpeedMagnitude > 0) {
                    const decelFactor = (currentSpeedMagnitude - counterThrust) / currentSpeedMagnitude;
                    worldVelocityRef.current.multiplyScalar(decelFactor);
                }
            } else if (throttleInput !== 0) {
                const acceleration = throttleInput > 0
                    ? FORWARD_ACCELERATION
                    : -REVERSE_ACCELERATION;
                worldVelocityRef.current.addScaledVector(forwardVectorRef.current, acceleration * delta);
                const speedMagnitude = worldVelocityRef.current.length();
                if (speedMagnitude > maxSpeedMagnitude) {
                    worldVelocityRef.current.setLength(maxSpeedMagnitude);
                }
            }

            velocityRef.current = clamp(
                worldVelocityRef.current.dot(forwardVectorRef.current),
                REVERSE_SPEED_LIMIT,
                FORWARD_SPEED_LIMIT,
            );
        }

        if (onSpeedChange) {
            const currentSpeed = velocityRef.current;
            const lastReportedSpeed = lastReportedSpeedRef.current;
            if (
                !Number.isFinite(lastReportedSpeed)
                || Math.abs(currentSpeed - lastReportedSpeed) >= 0.05
            ) {
                lastReportedSpeedRef.current = currentSpeed;
                onSpeedChange(currentSpeed);
            }
        }

        if (onRollChange) {
            const rollDegrees = rollRef.current * (180 / Math.PI);
            const lastReportedRoll = lastReportedRollRef.current;
            if (
                !Number.isFinite(lastReportedRoll)
                || Math.abs(rollDegrees - lastReportedRoll) >= 0.5
            ) {
                lastReportedRollRef.current = rollDegrees;
                onRollChange(rollDegrees);
            }
        }

        ship.rotation.order = "YXZ";
        ship.rotation.x = pitchRef.current;
        ship.rotation.y = yawRef.current;
        ship.rotation.z = rollRef.current;

        forwardVectorRef.current
            .set(0, 0, -1)
            .applyEuler(ship.rotation)
            .normalize();

        ship.position.x += worldVelocityRef.current.x * delta;
        ship.position.y += worldVelocityRef.current.y * delta;
        ship.position.z += worldVelocityRef.current.z * delta;

        const isDockingSequenceActive = (
            dockingApproachRequested
            || jumpPhase === "docking-approach"
            || jumpPhase === "docking-transit-internal"
        );
        if (onCollision && !isDockingSequenceActive) {
            let nearestCollision: {
                contact: ScannerAnchorContact;
                distance: number;
            } | null = null;

            for (const contact of scannerContacts) {
                if (
                    contact.contact_type !== "station"
                    && contact.contact_type !== "ship"
                ) {
                    continue;
                }
                const radius = contact.contact_type === "station"
                    ? resolveStationCollisionRadiusKm(contact)
                    : 0.72;
                const distance = resolveContactRenderPosition(
                    contact,
                    dockingTemporaryVectorRef.current,
                ).distanceTo(ship.position);
                if (distance > radius) {
                    continue;
                }
                if (nearestCollision === null || distance < nearestCollision.distance) {
                    nearestCollision = { contact, distance };
                }
            }

            if (nearestCollision === null) {
                activeCollisionContactIdRef.current = null;
            } else {
                const now = state.clock.elapsedTime;
                const contactId = nearestCollision.contact.id;
                const repeatedContact = activeCollisionContactIdRef.current === contactId;
                const cooldownElapsed = (now - lastCollisionAtRef.current) >= 1.2;
                if (!repeatedContact || cooldownElapsed) {
                    const speed = worldVelocityRef.current.length();
                    const severity: "glancing" | "critical" = (
                        nearestCollision.contact.contact_type === "station"
                        || speed >= 3.5
                    )
                        ? "critical"
                        : "glancing";

                    onCollision({
                        contactId,
                        contactType: nearestCollision.contact.contact_type,
                        contactName: nearestCollision.contact.name,
                        distance: nearestCollision.distance,
                        speed,
                        severity,
                    });
                    activeCollisionContactIdRef.current = contactId;
                    lastCollisionAtRef.current = now;
                }
            }
        }

        const camera = state.camera as PerspectiveCamera;
        const cameraBlendTarget = isDockingSequenceActive
            ? dockingCameraPresentationTargetRef.current
            : 0;
        const cameraBlendStep = clamp(DOCKING_CAMERA_BLEND_SMOOTH_RATE * delta, 0, 1);
        dockingCameraPresentationBlendRef.current += (
            cameraBlendTarget - dockingCameraPresentationBlendRef.current
        ) * cameraBlendStep;
        const cameraPresentationBlend = dockingCameraPresentationBlendRef.current;
        const cameraOffsetOrientation = isDockingSequenceActive
            ? dockingCameraOffsetQuaternionRef.current.setFromEuler(
                dockingOrientationEulerRef.current.set(
                    pitchRef.current,
                    yawRef.current,
                    0,
                    "YXZ",
                ),
            )
            : ship.quaternion;
        const baseFlightCameraOffset = cameraMode === "cockpit"
            ? flightCameraCockpitOffsetRef.current
            : flightCameraBoresightOffsetRef.current;
        const cameraOffsetTarget = cameraOffsetTargetRef.current
            .copy(baseFlightCameraOffset)
            .lerp(dockingCameraDockingOffsetRef.current, cameraPresentationBlend);
        const blendedCameraOffset = cameraOffsetBlendRef.current.lerp(
            cameraOffsetTarget,
            cameraBlendStep,
        );
        const cockpitOffset = cockpitWorldOffsetRef.current
            .copy(blendedCameraOffset)
            .applyQuaternion(cameraOffsetOrientation);
        camera.position.set(
            ship.position.x + cockpitOffset.x,
            ship.position.y + cockpitOffset.y,
            ship.position.z + cockpitOffset.z,
        );
        camera.quaternion.copy(ship.quaternion);
        const targetFov = isDockingSequenceActive
            ? dockingCameraTargetFovRef.current
            : FLIGHT_CAMERA_BASE_FOV;
        const fovStep = clamp(DOCKING_CAMERA_FOV_SMOOTH_RATE * delta, 0, 1);
        camera.fov += (targetFov - camera.fov) * fovStep;
        camera.near = isDockingSequenceActive
            ? dockingCameraTargetNearRef.current
            : FLIGHT_CAMERA_BASE_NEAR;
        camera.updateProjectionMatrix();

        const inverseCameraOrientation = scannerInverseQuaternionRef.current
            .copy(camera.quaternion)
            .invert();
        const verticalHalfFovRadians = (camera.fov * Math.PI) / 360;
        const tanVerticalHalfFov = Math.tan(verticalHalfFovRadians);
        const horizontalHalfFovRadians = Math.atan(tanVerticalHalfFov * camera.aspect);
        const tanHorizontalHalfFov = Math.tan(horizontalHalfFovRadians);

        stationContacts.forEach((contact) => {
            const stationGroup = stationRefs.current[contact.id];
            if (!stationGroup) {
                return;
            }

            stationGroup.rotation.set(
                0,
                0,
                resolveStationRotationRadians(contact, state.clock.elapsedTime),
            );
            const baseStationScale = resolveStationRenderScale(contact);
            stationGroup.scale.set(baseStationScale, baseStationScale, baseStationScale);

            const relativeFromCamera = scannerCameraRelativeVectorRef.current
                .copy(resolveContactRenderPosition(contact, scannerCameraRelativeVectorRef.current))
                .sub(camera.position)
                .applyQuaternion(inverseCameraOrientation);

            const cameraForwardDistance = -relativeFromCamera.z;
            if (cameraForwardDistance <= 0) {
                stationGroup.visible = false;
                return;
            }

            const fovX = tanHorizontalHalfFov > 0
                ? (relativeFromCamera.x / cameraForwardDistance) / tanHorizontalHalfFov
                : Number.POSITIVE_INFINITY;
            const fovY = tanVerticalHalfFov > 0
                ? (relativeFromCamera.y / cameraForwardDistance) / tanVerticalHalfFov
                : Number.POSITIVE_INFINITY;

            const stationScale = resolveStationRenderScale(contact);
            const stationRadius = 5.9 * stationScale;
            const distanceToContact = Math.max(0.001, relativeFromCamera.length());
            const apparentRadius = stationRadius / distanceToContact;
            const horizontalPadding = clamp(
                tanHorizontalHalfFov > 0 ? apparentRadius / tanHorizontalHalfFov : 0.02,
                0.02,
                0.25,
            );
            const verticalPadding = clamp(
                tanVerticalHalfFov > 0 ? apparentRadius / tanVerticalHalfFov : 0.02,
                0.02,
                0.25,
            );

            stationGroup.visible = (
                Number.isFinite(fovX)
                && Number.isFinite(fovY)
                && Math.abs(fovX) <= (1 + horizontalPadding)
                && Math.abs(fovY) <= (1 + verticalPadding)
            );
        });

        const shouldEmitScannerTelemetry = Boolean(
            onScannerTelemetryChange
            || (showContactLabels && onContactLabelAnchorsChange),
        );

        if (shouldEmitScannerTelemetry) {
            const now = state.clock.elapsedTime;
            if (now - lastScannerTelemetrySentAtRef.current >= 0.1) {
                const inverseOrientation = scannerInverseQuaternionRef.current
                    .copy(ship.quaternion)
                    .invert();

                const telemetryContacts = scannerContacts.map((contact) => {
                    const relativeFromShipWorld = scannerRelativeVectorRef.current
                        .copy(resolveContactRenderPosition(contact, scannerRelativeVectorRef.current))
                        .sub(ship.position);
                    const centerDistance = relativeFromShipWorld.length();
                    const isDockingPortDistanceContact = (
                        dockingApproachRequested
                        && contact.contact_type === "station"
                        && contact.id === dockingApproachContactId
                    );
                    const dockingPortDistance = (() => {
                        if (!isDockingPortDistanceContact) {
                            return null;
                        }
                        const portWorldPosition = resolveDockingPortWorldPosition(
                            contact,
                            dockingCameraToPortRef.current,
                            state.clock.elapsedTime,
                        );
                        return Math.hypot(
                            portWorldPosition.x - ship.position.x,
                            portWorldPosition.y - ship.position.y,
                            portWorldPosition.z - ship.position.z,
                        );
                    })();
                    const distanceResolution = resolveContactDistanceKm({
                        contactType: contact.contact_type,
                        centerDistanceKm: centerDistance,
                        radiusKm: contact.contact_type === "station"
                            ? resolveStationCollisionRadiusKm(contact)
                            : contact.radius_km,
                        dockingPortDistanceKm: dockingPortDistance,
                        useDockingPortDistance: isDockingPortDistanceContact,
                    });
                    const reportedDistance = distanceResolution.distanceKm;
                    const distanceMode: ScannerTelemetryContact["distance_mode"] = distanceResolution.mode;
                    const scannerReferenceVector = resolveScannerReferenceVector({
                        contactType: contact.contact_type,
                        centerX: relativeFromShipWorld.x,
                        centerY: relativeFromShipWorld.y,
                        centerZ: relativeFromShipWorld.z,
                        displayedDistanceKm: reportedDistance,
                    });
                    const scannerReferenceLocal = scannerPlaneVectorRef.current
                        .set(
                            scannerReferenceVector.x,
                            scannerReferenceVector.y,
                            scannerReferenceVector.z,
                        )
                        .applyQuaternion(inverseOrientation);
                    const forwardDistance = -scannerReferenceLocal.z;
                    const planarX = clamp(scannerReferenceLocal.x / SCANNER_PLANE_RANGE, -1, 1);
                    const planarY = clamp(forwardDistance / SCANNER_PLANE_RANGE, -1, 1);
                    const altitude = clamp(scannerReferenceLocal.y / SCANNER_ALTITUDE_RANGE, -1, 1);

                    const relativeFromCamera = scannerCameraRelativeVectorRef.current
                        .copy(resolveContactRenderPosition(contact, scannerCameraRelativeVectorRef.current))
                        .sub(camera.position)
                        .applyQuaternion(inverseOrientation);

                    const cameraForwardDistance = -relativeFromCamera.z;
                    const verticalHalfFovRadians = (camera.fov * Math.PI) / 360;
                    const tanVerticalHalfFov = Math.tan(verticalHalfFovRadians);
                    const horizontalHalfFovRadians = Math.atan(tanVerticalHalfFov * camera.aspect);
                    const tanHorizontalHalfFov = Math.tan(horizontalHalfFovRadians);

                    const fovX = cameraForwardDistance > 0 && tanHorizontalHalfFov > 0
                        ? (relativeFromCamera.x / cameraForwardDistance) / tanHorizontalHalfFov
                        : Number.POSITIVE_INFINITY;
                    const fovY = cameraForwardDistance > 0 && tanVerticalHalfFov > 0
                        ? (relativeFromCamera.y / cameraForwardDistance) / tanVerticalHalfFov
                        : Number.POSITIVE_INFINITY;

                    const inViewMarginByType: Record<ScannerAnchorContact["contact_type"], number> = {
                        ship: 0.5,
                        station: 1.05,
                        planet: 1.2,
                        moon: 1.15,
                        star: 1.35,
                    };
                    const inViewMargin = inViewMarginByType[contact.contact_type] ?? 0;
                    const projectedContactRadius = (() => {
                        if (contact.contact_type === "station") {
                            return resolveStationCollisionRadiusKm(contact);
                        }
                        if (
                            contact.contact_type === "planet"
                            || contact.contact_type === "moon"
                            || contact.contact_type === "star"
                        ) {
                            return resolveCelestialRenderRadius({
                                bodyKind: contact.contact_type === "star"
                                    ? "star"
                                    : contact.contact_type === "moon"
                                        ? "moon"
                                        : "planet",
                                bodyType: contact.body_type,
                                radiusKm: contact.radius_km,
                                distanceKm: reportedDistance,
                            });
                        }
                        return 0;
                    })();
                    const projectedContact = projectCameraSpaceSphereToNdc({
                        cameraSpaceX: relativeFromCamera.x,
                        cameraSpaceY: relativeFromCamera.y,
                        cameraSpaceZ: relativeFromCamera.z,
                        radius: projectedContactRadius,
                        verticalFovDegrees: camera.fov,
                        aspectRatio: camera.aspect,
                        marginX: inViewMargin,
                        marginY: inViewMargin,
                    });
                    const inView = projectedContact.sphereInView;
                    const labelAnchor = (
                        contact.contact_type === "planet"
                        || contact.contact_type === "moon"
                        || contact.contact_type === "star"
                    )
                        ? resolveProjectedSphereLabelAnchorNdc({
                            projectedSphere: projectedContact,
                            targetNdcX: 0,
                            targetNdcY: 0,
                        })
                        : {
                            ndcX: fovX,
                            ndcY: fovY,
                            usesLimbAnchor: false,
                        };

                    return {
                        id: contact.id,
                        relative_x: relativeFromShipWorld.x,
                        relative_y: relativeFromShipWorld.y,
                        relative_z: relativeFromShipWorld.z,
                        relative_x_km: (
                            contactUsesPhysicalNearFieldSpace(contact)
                        )
                            ? relativeFromShipWorld.x / LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM
                            : undefined,
                        relative_y_km: (
                            contactUsesPhysicalNearFieldSpace(contact)
                        )
                            ? relativeFromShipWorld.y / LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM
                            : undefined,
                        relative_z_km: (
                            contactUsesPhysicalNearFieldSpace(contact)
                        )
                            ? relativeFromShipWorld.z / LOCAL_NEAR_FIELD_RENDER_UNITS_PER_KM
                            : undefined,
                        forward_distance: forwardDistance,
                        plane_x: planarX,
                        plane_y: planarY,
                        altitude,
                        in_view: inView,
                        fov_x: Number.isFinite(fovX) ? fovX : 0,
                        fov_y: Number.isFinite(fovY) ? fovY : 0,
                        label_fov_x: Number.isFinite(labelAnchor.ndcX)
                            ? labelAnchor.ndcX
                            : (Number.isFinite(fovX) ? fovX : 0),
                        label_fov_y: Number.isFinite(labelAnchor.ndcY)
                            ? labelAnchor.ndcY
                            : (Number.isFinite(fovY) ? fovY : 0),
                        horizontal_fov_degrees: (horizontalHalfFovRadians * 2 * 180) / Math.PI,
                        vertical_fov_degrees: camera.fov,
                        distance: reportedDistance,
                        distance_mode: distanceMode,
                    };
                });

                lastScannerTelemetrySentAtRef.current = now;
                if (onScannerTelemetryChange) {
                    onScannerTelemetryChange(telemetryContacts);
                }

                if (showContactLabels && onContactLabelAnchorsChange) {
                    const contactById = new Map(
                        scannerContacts.map((contact) => [contact.id, contact]),
                    );
                    const selectedContactId = focusedContact?.id ?? null;
                    const priorityLabelIds = Array.from(new Set(
                        [selectedContactId, waypointTargetId]
                            .filter((value): value is string => Boolean(value)),
                    ));
                    const labelAnchorCandidates = telemetryContacts
                        .filter((telemetry) => telemetry.in_view)
                        .map((telemetry) => {
                            const contact = contactById.get(telemetry.id);
                            if (!contact) {
                                return null;
                            }

                            const labelFovX = telemetry.label_fov_x ?? telemetry.fov_x;
                            const labelFovY = telemetry.label_fov_y ?? telemetry.fov_y;
                            const rawLeftPercent = 50 + (labelFovX * 50);
                            const rawTopPercent = 50 - (labelFovY * 50);

                            return {
                                id: contact.id,
                                name: contact.name,
                                leftPercent: clamp(rawLeftPercent, 4, 96),
                                topPercent: clamp(rawTopPercent - 4.5, 4, 96),
                                isSelected: selectedContactId === contact.id,
                                distance: telemetry.distance,
                            };
                        })
                        .filter((anchor): anchor is {
                            id: string;
                            name: string;
                            leftPercent: number;
                            topPercent: number;
                            isSelected: boolean;
                            distance: number;
                        } => Boolean(anchor))
                        .sort((left, right) => left.distance - right.distance)
                        .map((anchor) => ({
                            id: anchor.id,
                            name: anchor.name,
                            leftPercent: anchor.leftPercent,
                            topPercent: anchor.topPercent,
                            isSelected: anchor.isSelected,
                        }));
                    const prioritizedLabelAnchors = priorityLabelIds
                        .map((contactId) => (
                            labelAnchorCandidates.find((anchor) => anchor.id === contactId) ?? null
                        ))
                        .filter((anchor): anchor is FlightSceneContactLabel => Boolean(anchor));
                    const supplementalLabelAnchors = labelAnchorCandidates.filter(
                        (anchor) => !priorityLabelIds.includes(anchor.id),
                    );
                    const labelAnchors = [
                        ...prioritizedLabelAnchors,
                        ...supplementalLabelAnchors,
                    ].slice(0, 12);

                    const signature = labelAnchors
                        .map((anchor) => (
                            `${anchor.id}:${anchor.leftPercent.toFixed(1)}:${anchor.topPercent.toFixed(1)}:${anchor.isSelected ? "1" : "0"}`
                        ))
                        .join("|");

                    if (signature !== lastContactLabelSignatureRef.current) {
                        lastContactLabelSignatureRef.current = signature;
                        onContactLabelAnchorsChange(labelAnchors);
                    }
                }
            }
        }

        if (waypointRef.current) {
            waypointRef.current.rotation.x += delta * 0.35;
            waypointRef.current.rotation.y += delta * 0.8;
        }
        if (focusRingRef.current) {
            focusRingRef.current.rotation.z -= delta * 0.45;
        }

        const sceneTime = state.clock.elapsedTime;
        trafficContacts.forEach((contact, index) => {
            const trafficShip = trafficRefs.current[index];
            if (!trafficShip) {
                return;
            }

            const drift = Math.sin((sceneTime * 0.6) + index) * 0.35;
            const bob = Math.sin((sceneTime * 1.1) + (index * 0.8)) * 0.18;
            const renderPosition = resolveContactRenderPosition(
                contact,
                dockingTemporaryVectorRef.current,
            );
            const x = renderPosition.x + drift;
            const y = renderPosition.y + bob;
            const z = renderPosition.z;

            trafficShip.position.set(x, y, z);

            trafficShip.rotation.y = Math.sin((sceneTime * 0.35) + index) * 0.22;
            trafficShip.rotation.x = Math.cos((sceneTime * 0.45) + index) * 0.04;
        });
    });

    return (
        <>
            <color attach="background" args={["#03070f"]} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[14, 18, -6]} intensity={0.62} />
            <pointLight position={[52, 34, -90]} intensity={1.05} distance={240} color="#ffecc3" />

            <PlayerShipModel shipRef={shipRef} shipVisualKey={shipVisualKey} />

            {stationContacts.map((stationContact) => (
                <StationModel
                    key={`station-model-${stationContact.id}`}
                    contact={stationContact}
                    stationRef={(element: Group | null) => {
                        stationRefs.current[stationContact.id] = element;
                    }}
                />
            ))}

            {waypointPosition ? (
                <mesh
                    ref={waypointRef}
                    position={waypointPosition}
                    visible={showWaypointIndicator}
                    scale={[waypointIndicatorScale, waypointIndicatorScale, waypointIndicatorScale]}
                    renderOrder={20}
                >
                    <torusGeometry args={[1, 0.08, 18, 42]} />
                    <meshStandardMaterial
                        color="#8fe7ff"
                        emissive="#59d4ff"
                        emissiveIntensity={0.9}
                        wireframe
                        transparent
                        opacity={0.95}
                        depthTest={false}
                        toneMapped={false}
                    />
                </mesh>
            ) : null}

            {focusedContactPosition ? (
                <mesh
                    ref={focusRingRef}
                    position={focusedContactPosition}
                    visible={showFocusedContactIndicator}
                    rotation={[Math.PI / 2, 0, 0]}
                >
                    <torusGeometry args={[0.84, 0.08, 14, 28]} />
                    <meshStandardMaterial wireframe emissive="#ffcc67" emissiveIntensity={0.34} />
                </mesh>
            ) : null}

            {trafficContacts.map((contact, index) => (
                <group
                    key={`traffic-${contact.id}`}
                    ref={(element: Group | null) => {
                        trafficRefs.current[index] = element;
                    }}
                    position={sceneAnchorPosition(contact)}
                >
                    <TrafficShipModel shipVisualKey={contact.ship_visual_key} />
                </group>
            ))}

            {stars.map((star, index) => (
                <mesh key={`star-${index}`} position={star.position}>
                    <sphereGeometry args={[star.size, 6, 6]} />
                    <meshBasicMaterial
                        color={star.color}
                        transparent
                        opacity={star.opacity}
                    />
                </mesh>
            ))}

            {visibleCelestialAnchors
                .map((contact) => (
                    <group key={`anchor-${contact.id}`} position={celestialAnchorPosition(contact)}>
                        {contact.body_kind !== "star" ? (
                            <mesh rotation={[Math.PI * 0.18, 0, Math.PI * contactHashUnit(contact)]}>
                                <icosahedronGeometry
                                    args={[
                                        resolveCelestialAnchorSize(contact) * 0.96,
                                        resolveCelestialLodTier(contact) === "near"
                                            ? 2
                                            : resolveCelestialLodTier(contact) === "mid"
                                                ? 1
                                                : 0,
                                    ]}
                                />
                                <meshStandardMaterial
                                    color={resolveSurfaceAccentColor(contact)}
                                    transparent
                                    opacity={0.24}
                                    roughness={0.92}
                                    metalness={0.03}
                                />
                            </mesh>
                        ) : null}
                        <mesh>
                            <sphereGeometry
                                args={[
                                    resolveCelestialAnchorSize(contact),
                                    resolveCelestialSphereSegments(contact)[0],
                                    resolveCelestialSphereSegments(contact)[1],
                                ]}
                            />
                            <meshStandardMaterial
                                color={resolveCelestialAnchorColor(contact)}
                                emissive={resolveCelestialAnchorColor(contact)}
                                emissiveIntensity={contact.body_kind === "star" ? 0.95 : 0.18}
                                roughness={contact.body_kind === "star" ? 0.56 : 0.88}
                                metalness={contact.body_kind === "star" ? 0.02 : 0.08}
                                side={DoubleSide}
                            />
                        </mesh>
                        {resolveCloudLayer(contact) ? (
                            <mesh>
                                <sphereGeometry
                                    args={[
                                        resolveCelestialAnchorSize(contact) * 1.03,
                                        resolveCelestialOverlaySegments(contact)[0],
                                        resolveCelestialOverlaySegments(contact)[1],
                                    ]}
                                />
                                <meshStandardMaterial
                                    color={resolveCloudLayer(contact)?.color}
                                    transparent
                                    opacity={resolveCloudLayer(contact)?.opacity}
                                    roughness={1}
                                    metalness={0}
                                    side={DoubleSide}
                                />
                            </mesh>
                        ) : null}
                        {shouldRenderPlanetRing(contact) ? (
                            <mesh rotation={[Math.PI / 2.45, 0, Math.PI * contactHashUnit(contact)]}>
                                <ringGeometry
                                    args={[
                                        resolveCelestialAnchorSize(contact) * 1.45,
                                        resolveCelestialAnchorSize(contact) * 2.45,
                                        resolveCelestialLodTier(contact) === "near"
                                            ? 64
                                            : resolveCelestialLodTier(contact) === "mid"
                                                ? 42
                                                : 28,
                                    ]}
                                />
                                <meshStandardMaterial
                                    color="#c9b793"
                                    transparent
                                    opacity={0.36}
                                    roughness={0.95}
                                    metalness={0.04}
                                    side={DoubleSide}
                                />
                            </mesh>
                        ) : null}
                        {contact.body_kind === "star" ? (
                            <mesh>
                                <sphereGeometry
                                    args={[
                                        resolveCelestialAnchorSize(contact) * 1.32,
                                        resolveCelestialOverlaySegments(contact)[0],
                                        resolveCelestialOverlaySegments(contact)[1],
                                    ]}
                                />
                                <meshBasicMaterial
                                    color={resolveCelestialAnchorColor(contact)}
                                    transparent
                                    opacity={0.18}
                                    side={DoubleSide}
                                />
                            </mesh>
                        ) : null}
                    </group>
                ))}

        </>
    );
}

export function FlightScene(props: FlightSceneProps): ReactElement {
    const {
        jumpPhase,
        jumpProgress,
        renderProfile,
        cameraMode = "boresight",
        shipVisualKey,
        stationShapeKey,
        transitStationLabel,
        focusedContact,
        scannerRangeKm = 25,
        scannerContacts,
        celestialAnchors,
        onSpeedChange,
        onRollChange,
        onScannerTelemetryChange,
        onCollision,
        dockingApproachContactId,
        waypointContactId,
        onDockingApproachProgress,
        onDockingApproachComplete,
        onDockingDebug,
        dockingRotationMatchEnabled,
        showContactLabels,
        spawnDirective,
        onSpawnDirectiveApplied,
    } = props;
    const [contactLabelAnchors, setContactLabelAnchors] = useState<
        FlightSceneContactLabel[]
    >([]);

    const isTransitPhase = (
        jumpPhase === "docking-transit-internal"
        || jumpPhase === "undocking-transit-internal"
    );

    const jumpPhaseLabel =
        jumpPhase === "docking-approach"
            ? "Docking approach"
            : jumpPhase === "docking-transit-internal"
                ? "Docking tunnel"
                : jumpPhase === "undocking-transit-internal"
                    ? "Undocking tunnel"
            : jumpPhase === "destination-locked"
                ? "Waypoint locked"
                : jumpPhase === "charging"
                    ? "Charging"
                    : jumpPhase === "jumping"
                        ? "Jumping"
                        : jumpPhase === "arrived"
                            ? "Arrived"
                            : jumpPhase === "error"
                                ? "Error"
                                : "Idle";

    const dprRange: [number, number] = renderProfile === "performance"
        ? [1, 1.2]
        : renderProfile === "cinematic"
            ? [1, 2]
            : [1, 1.6];

    return (
        <section className={styles.flightSceneShell}>
            <div className={styles.flightSceneCanvasWrap}>
                <Canvas
                    camera={{ position: [0, 2, 6], fov: 62, near: 0.1, far: 200000 }}
                    dpr={dprRange}
                    className={styles.flightSceneCanvas}
                >
                    {isTransitPhase ? (
                        <FlightTransitScene
                            jumpPhase={jumpPhase}
                            jumpProgress={jumpProgress}
                            shipVisualKey={shipVisualKey}
                            stationShapeKey={stationShapeKey}
                        />
                    ) : (
                        <FlightSceneContent
                            jumpPhase={jumpPhase}
                            renderProfile={renderProfile}
                            cameraMode={cameraMode}
                            shipVisualKey={shipVisualKey}
                            focusedContact={focusedContact}
                            scannerRangeKm={scannerRangeKm}
                            scannerContacts={scannerContacts}
                            celestialAnchors={celestialAnchors}
                            onSpeedChange={onSpeedChange}
                            onRollChange={onRollChange}
                            onScannerTelemetryChange={onScannerTelemetryChange}
                            onCollision={onCollision}
                            dockingApproachContactId={dockingApproachContactId}
                            waypointContactId={waypointContactId}
                            onDockingApproachProgress={onDockingApproachProgress}
                            onDockingApproachComplete={onDockingApproachComplete}
                            onDockingDebug={onDockingDebug}
                            dockingRotationMatchEnabled={dockingRotationMatchEnabled}
                            showContactLabels={showContactLabels}
                            spawnDirective={spawnDirective}
                            onSpawnDirectiveApplied={onSpawnDirectiveApplied}
                            onContactLabelAnchorsChange={setContactLabelAnchors}
                        />
                    )}
                </Canvas>
                <div className={styles.flightReticle} aria-hidden="true">
                    <span className={styles.flightReticleArmTop} />
                    <span className={styles.flightReticleArmRight} />
                    <span className={styles.flightReticleArmBottom} />
                    <span className={styles.flightReticleArmLeft} />
                    <span className={styles.flightReticleCenter} />
                </div>
                {showContactLabels && !isTransitPhase ? (
                    <div className={styles.flightContactLabelsOverlay} aria-hidden="true">
                        {contactLabelAnchors.map((anchor) => (
                            <span
                                key={`flight-contact-label-${anchor.id}`}
                                className={anchor.isSelected
                                    ? `${styles.flightContactLabel} ${styles.flightContactLabelSelected}`
                                    : styles.flightContactLabel}
                                style={{
                                    left: `${anchor.leftPercent}%`,
                                    top: `${anchor.topPercent}%`,
                                }}
                            >
                                {anchor.name}
                            </span>
                        ))}
                    </div>
                ) : null}
            </div>
            <div
                className={styles.flightJumpProgress}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={jumpProgress}
                aria-valuetext={`${jumpPhaseLabel} (${jumpProgress}%)`}
            >
                <span style={{ width: `${jumpProgress}%` }} />
            </div>
            <p className={styles.flightSceneHint}>
                Pilot view: <strong>W/S</strong> throttle, <strong>A/D</strong> yaw,
                <strong> Q/E</strong> roll,
                <strong> I/K</strong> pitch (<strong>P/L</strong> or <strong>↑/↓</strong> also),
                <strong> X</strong> gradual zero-throttle · Pitch Mode: <strong>Normal</strong>
            </p>
            {isTransitPhase ? (
                <p className={styles.flightSceneHint}>
                    Tunnel transit: {transitStationLabel || "Station corridor"} ·
                    {jumpPhase === "docking-transit-internal"
                        ? " inbound docking clamps"
                        : " outbound departure vector"}
                </p>
            ) : null}
        </section>
    );
}
