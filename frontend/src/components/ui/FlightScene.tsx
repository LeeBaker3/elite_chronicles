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
    normalizeSignedAngle,
} from "./FlightScene.math";
import styles from "./FlightScene.module.css";

type ScannerAnchorContact = {
    id: string;
    contact_type: "ship" | "station" | "planet" | "moon" | "star";
    body_kind?: "star" | "planet" | "moon";
    body_type?: string | null;
    radius_km?: number | null;
    name: string;
    distance_km: number;
    scene_x: number;
    scene_y: number;
    scene_z: number;
    orbiting_planet_name?: string | null;
    station_archetype_shape?: string | null;
    ship_visual_key?: string | null;
};

type FlightSceneSpawnDirective = {
    mode: "undock-exit";
    stationContactId: string;
    nonce: number;
};

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
    shipVisualKey?: string | null;
    stationShapeKey?: string | null;
    transitStationLabel?: string | null;
    focusedContact: ScannerAnchorContact | null;
    scannerContacts: ScannerAnchorContact[];
    celestialAnchors: ScannerAnchorContact[];
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
        stage: "hold-entry" | "hold-align" | "final-approach";
    }) => void;
    onDockingApproachComplete?: () => void;
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

type ScannerTelemetryContact = {
    id: string;
    relative_x: number;
    relative_y: number;
    relative_z: number;
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

type DockingApproachStage = "hold-entry" | "hold-align" | "final-approach";

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

function resolveCelestialAnchorColor(contact: ScannerAnchorContact): string {
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

function resolveCelestialAnchorSize(contact: ScannerAnchorContact): number {
    const radiusKm = Number(contact.radius_km);
    const bodyKind = contact.body_kind;
    const bodyType = (contact.body_type || "").trim().toLowerCase();

    if (Number.isFinite(radiusKm) && radiusKm > 0) {
        const normalized = Math.log10(Math.max(1, radiusKm));
        const scaled = 3.1 + ((normalized - 2) * 1.72);
        if (bodyKind === "star") {
            if (bodyType === "m-class") {
                return clamp(scaled, 10.5, 18.5);
            }
            return clamp(scaled, 13.8, 24.5);
        }
        if (bodyKind === "moon") {
            return clamp(scaled, 1.2, 3.2);
        }
        if (bodyType === "gas-giant") {
            return clamp(scaled, 8.5, 16.8);
        }
        return clamp(scaled, 3.6, 8.2);
    }

    if (contact.contact_type === "star") {
        return 14;
    }
    if (contact.contact_type === "planet") {
        return 4.5;
    }
    return anchorSize(contact.contact_type);
}

function resolveCelestialLodTier(contact: ScannerAnchorContact): "near" | "mid" | "far" {
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

function resolveCelestialSphereSegments(contact: ScannerAnchorContact): [number, number] {
    const tier = resolveCelestialLodTier(contact);
    const baseSegments = CELESTIAL_SPHERE_SEGMENTS_BY_TIER[tier];
    if (contact.body_kind === "star") {
        return [baseSegments + 4, baseSegments + 4];
    }
    return [baseSegments, baseSegments];
}

function resolveCelestialOverlaySegments(contact: ScannerAnchorContact): [number, number] {
    const tier = resolveCelestialLodTier(contact);
    const baseSegments = CELESTIAL_OVERLAY_SEGMENTS_BY_TIER[tier];
    return [baseSegments, baseSegments];
}

function contactHashUnit(contact: ScannerAnchorContact): number {
    let hash = 2166136261;
    const key = `${contact.id}:${contact.name}:${contact.body_type ?? ""}`;
    for (let index = 0; index < key.length; index += 1) {
        hash ^= key.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
}

function resolveSurfaceAccentColor(contact: ScannerAnchorContact): string {
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

function resolveCloudLayer(contact: ScannerAnchorContact): {
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

function shouldRenderPlanetRing(contact: ScannerAnchorContact): boolean {
    if (contact.body_kind !== "planet") {
        return false;
    }
    const bodyType = (contact.body_type || "").trim().toLowerCase();
    if (bodyType === "gas-giant") {
        return true;
    }
    return contactHashUnit(contact) > 0.9;
}

function anchorSize(contactType: ScannerAnchorContact["contact_type"]): number {
    if (contactType === "star") {
        return 1.5;
    }
    if (contactType === "planet") {
        return 0.9;
    }
    if (contactType === "moon") {
        return 0.7;
    }
    if (contactType === "station") {
        return 0.44;
    }
    return 0.32;
}

function sceneAnchorPosition(contact: ScannerAnchorContact): [number, number, number] {
    return [contact.scene_x, contact.scene_y, contact.scene_z];
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
    coriolis: [0, 0, 5.62],
    orbis: [0, 0, 5.1],
    default: [0, 0, 3.55],
};

function resolveStationBaseRadius(shape: StationShapeKey): number {
    return STATION_BASE_RADIUS_BY_SHAPE[shape] ?? STATION_BASE_RADIUS_BY_SHAPE.default;
}

function resolveDockingPortWorldPosition(
    contact: ScannerAnchorContact,
    out: Vector3,
): Vector3 {
    const shape = resolveStationShapeKey(contact.station_archetype_shape);
    const distanceScale = stationDistanceScale(contact.distance_km);
    const [localX, localY, localZ] = STATION_DOCKING_PORT_LOCAL_ANCHOR_BY_SHAPE[shape]
        ?? STATION_DOCKING_PORT_LOCAL_ANCHOR_BY_SHAPE.default;

    return out.set(
        contact.scene_x + (localX * distanceScale),
        contact.scene_y + (localY * distanceScale),
        contact.scene_z + (localZ * distanceScale),
    );
}

function CoriolisStationModel(): ReactElement {
    return (
        <group>
            <mesh rotation={[Math.PI / 4, 0, 0]}>
                <octahedronGeometry args={[5.7, 0]} />
                <meshStandardMaterial color="#b7bdc5" metalness={0.42} roughness={0.54} />
            </mesh>

            <mesh position={[0, 0, 5.32]}>
                <boxGeometry args={[1.2, 0.95, 0.44]} />
                <meshStandardMaterial color="#3b424c" metalness={0.3} roughness={0.72} />
            </mesh>

            <mesh position={[0, 0, 5.62]}>
                <boxGeometry args={[0.72, 0.26, 0.14]} />
                <meshStandardMaterial emissive="#4ac9ff" emissiveIntensity={0.8} metalness={0.22} roughness={0.22} />
            </mesh>

            <mesh position={[-3.8, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.18, 0.18, 2.2, 10]} />
                <meshStandardMaterial metalness={0.46} roughness={0.44} />
            </mesh>
            <mesh position={[3.8, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.18, 0.18, 2.2, 10]} />
                <meshStandardMaterial metalness={0.46} roughness={0.44} />
            </mesh>
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
    const distanceScale = stationDistanceScale(contact.distance_km);
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
    const scaledRadius = (resolveStationBaseRadius(shape) * stationDistanceScale(contact.distance_km)) + 0.08;
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
    shipVisualKey,
    focusedContact,
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
    showContactLabels,
    spawnDirective,
    onSpawnDirectiveApplied,
    onContactLabelAnchorsChange,
}: {
    jumpPhase: FlightSceneProps["jumpPhase"];
    renderProfile: FlightSceneProps["renderProfile"];
    shipVisualKey?: string | null;
    focusedContact: ScannerAnchorContact | null;
    scannerContacts: ScannerAnchorContact[];
    celestialAnchors: ScannerAnchorContact[];
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
    const cockpitOffsetRef = useRef(new Vector3(0, 0.2, 0.18));
    const cockpitWorldOffsetRef = useRef(new Vector3());
    const scannerRelativeVectorRef = useRef(new Vector3());
    const scannerCameraRelativeVectorRef = useRef(new Vector3());
    const scannerInverseQuaternionRef = useRef(new Quaternion());
    const lastScannerTelemetrySentAtRef = useRef(0);
    const lastContactLabelSignatureRef = useRef("");
    const lastCollisionAtRef = useRef(0);
    const activeCollisionContactIdRef = useRef<string | null>(null);
    const dockingApproachInitialDistanceRef = useRef<number | null>(null);
    const dockingApproachCompleteSentRef = useRef(false);
    const dockingApproachLastProgressRef = useRef(-1);
    const dockingApproachStageRef = useRef<DockingApproachStage>("hold-entry");
    const dockingApproachLastTargetIdRef = useRef<string | null>(null);
    const dockingApproachStageStartedAtRef = useRef(0);
    const dockingHoldAlignAlignedSinceRef = useRef(0);
    const dockingApproachPortCorePositionRef = useRef(new Vector3());
    const dockingApproachPortPositionRef = useRef(new Vector3());
    const dockingApproachHoldPointRef = useRef(new Vector3());
    const dockingApproachEntryVectorRef = useRef(new Vector3(0, 0, 1));
    const dockingDesiredVectorRef = useRef(new Vector3());
    const dockingAimDirectionRef = useRef(new Vector3());
    const dockingAvoidanceVectorRef = useRef(new Vector3());
    const dockingTemporaryVectorRef = useRef(new Vector3());
    const dockingCameraAimPositionRef = useRef(new Vector3());
    const dockingCameraToPortRef = useRef(new Vector3());
    const dockingForwardVectorRef = useRef(new Vector3(0, 0, -1));
    const dockingShipToPortDirectionRef = useRef(new Vector3(0, 0, -1));
    const dockingFilteredAimDirectionRef = useRef(new Vector3(0, 0, -1));
    const dockingVelocityTargetDirectionRef = useRef(new Vector3(0, 0, -1));
    const dockingVelocityParallelRef = useRef(new Vector3());
    const dockingVelocityLateralRef = useRef(new Vector3());
    const dockingOrientationEulerRef = useRef(new Euler(0, 0, 0, "YXZ"));
    const dockingOrientationQuaternionRef = useRef(new Quaternion());
    const spawnDirectiveAppliedNonceRef = useRef<number | null>(null);

    const SCANNER_PLANE_RANGE = 110;
    const SCANNER_ALTITUDE_RANGE = 48;
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
    const DOCKING_HOLD_ALIGN_STABLE_MS = 650;
    const DOCKING_HOLD_ALIGN_MAX_SPEED = 0.12;
    const DOCKING_HOLD_ENTRY_TURN_RAMP_MS = 1650;
    const DOCKING_HOLD_ENTRY_INITIAL_YAW_RATE = 0.62;
    const DOCKING_HOLD_ENTRY_INITIAL_PITCH_RATE = 0.48;
    const DOCKING_FINAL_MIN_SPEED = 0.08;
    const DOCKING_FINAL_CLOSE_MIN_SPEED = 0.025;
    const DOCKING_FINAL_MAX_SPEED = 0.35;
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
    const DOCKING_FINAL_CAPTURE_ALIGNMENT_COSINE = Math.cos((7 * Math.PI) / 180);
    const DOCKING_RETICLE_LOCK_RANGE_KM = 0.8;
    const DOCKING_RETICLE_EARLY_LOCK_RANGE_KM = 3.2;
    const DOCKING_RETICLE_HOLD_ENTRY_BLEND = 0.72;
    const DOCKING_RETICLE_HOLD_ALIGN_BLEND = 0.92;
    const DOCKING_RETICLE_HARD_LOCK_BLEND = 0.92;
    const DOCKING_AVOIDANCE_RADIUS = 2.35;
    const DOCKING_FINAL_STAGE_MIN_DURATION_MS = 4200;
    const DOCKING_FINAL_STAGE_FORCE_COMPLETE_MS = 12000;
    const DOCKING_UNDOCK_EXIT_FORWARD_SPEED = 0.78;
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

    const waypointTargetContact = useMemo(() => {
        if (dockingApproachTargetContact) {
            return dockingApproachTargetContact;
        }
        if (!waypointContactId) {
            return null;
        }
        return scannerContacts.find((contact) => contact.id === waypointContactId) ?? null;
    }, [dockingApproachTargetContact, scannerContacts, waypointContactId]);

    useEffect(() => {
        dockingApproachInitialDistanceRef.current = null;
        dockingApproachCompleteSentRef.current = false;
        dockingApproachLastProgressRef.current = -1;
        dockingApproachStageRef.current = "hold-entry";
        dockingApproachLastTargetIdRef.current = null;
        dockingApproachStageStartedAtRef.current = 0;
        dockingHoldAlignAlignedSinceRef.current = 0;
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

        const directionAwayFromStation = dockingTemporaryVectorRef.current.set(
            -stationContact.scene_x,
            -stationContact.scene_y,
            -stationContact.scene_z,
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

    const waypointPosition = useMemo<[number, number, number] | null>(() => {
        if (!waypointTargetContact) {
            return null;
        }
        return [
            waypointTargetContact.scene_x,
            waypointTargetContact.scene_y,
            waypointTargetContact.scene_z,
        ];
    }, [waypointTargetContact]);

    const focusedContactPosition = useMemo<[number, number, number] | null>(() => {
        if (!focusedContact) {
            return null;
        }
        return [
            focusedContact.scene_x,
            focusedContact.scene_y,
            focusedContact.scene_z,
        ];
    }, [focusedContact]);

    const showFocusedContactIndicator = Boolean(
        focusedContactPosition
        && focusedContact?.id
        && focusedContact.id !== waypointTargetContact?.id,
    );

    const showWaypointIndicator = (
        jumpPhase === "destination-locked"
        || jumpPhase === "charging"
        || jumpPhase === "jumping"
        || jumpPhase === "docking-approach"
    );

    const trafficCount = COBRA_TRAFFIC_LOD_BUDGET_BY_PROFILE[renderProfile];

    const trafficContacts = useMemo(
        () => [...shipContacts]
            .sort((left, right) => left.distance_km - right.distance_km)
            .slice(0, trafficCount),
        [shipContacts, trafficCount],
    );

    const visibleCelestialAnchors = useMemo(
        () => celestialAnchors
            .filter((contact) => contact.contact_type !== "station")
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

        const isDockingApproachActive = Boolean(
            dockingApproachContactId
            && dockingApproachTargetContact,
        );

        const input = inputRef.current;
        if (isDockingApproachActive && dockingApproachTargetContact) {
            const approachTargetId = dockingApproachTargetContact.id;
            const stationCollisionRadiusKm = resolveStationCollisionRadiusKm(
                dockingApproachTargetContact,
            );
            const stationCenter = dockingTemporaryVectorRef.current.set(
                dockingApproachTargetContact.scene_x,
                dockingApproachTargetContact.scene_y,
                dockingApproachTargetContact.scene_z,
            );
            const portCorePosition = resolveDockingPortWorldPosition(
                dockingApproachTargetContact,
                dockingApproachPortCorePositionRef.current,
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

            if (dockingApproachLastTargetIdRef.current !== approachTargetId) {
                dockingApproachLastTargetIdRef.current = approachTargetId;
                dockingApproachStageRef.current = "hold-entry";
                dockingApproachStageStartedAtRef.current = performance.now();
                dockingHoldAlignAlignedSinceRef.current = 0;

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

            if (dockingApproachStageRef.current === "hold-entry") {
                const holdDistanceRemaining = ship.position.distanceTo(
                    dockingApproachHoldPointRef.current,
                );
                const holdEntryElapsedMs = performance.now() - dockingApproachStageStartedAtRef.current;
                if (
                    holdDistanceRemaining <= DOCKING_HOLD_POINT_THRESHOLD
                    && holdEntryElapsedMs >= DOCKING_HOLD_ENTRY_MIN_DURATION_MS
                ) {
                    dockingApproachStageRef.current = "hold-align";
                    dockingApproachStageStartedAtRef.current = performance.now();
                    dockingHoldAlignAlignedSinceRef.current = 0;
                }
            }

            const activeApproachStage = dockingApproachStageRef.current;
            const stageTarget = activeApproachStage === "final-approach"
                ? portPosition
                : dockingApproachHoldPointRef.current;
            const stageDistanceRemaining = ship.position.distanceTo(stageTarget);
            const distanceToPort = ship.position.distanceTo(portCorePosition);
            const distanceToApproachPoint = ship.position.distanceTo(portPosition);

            const pathDirection = dockingDesiredVectorRef.current
                .copy(stageTarget)
                .sub(ship.position);
            if (pathDirection.lengthSq() <= 0.000001) {
                pathDirection.copy(entryVector).multiplyScalar(-1);
            }

            const avoidanceVector = dockingAvoidanceVectorRef.current.set(0, 0, 0);
            for (const trafficContact of shipContacts) {
                dockingTemporaryVectorRef.current
                    .set(
                        ship.position.x - trafficContact.scene_x,
                        ship.position.y - trafficContact.scene_y,
                        ship.position.z - trafficContact.scene_z,
                    );
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
            const orientation = dockingOrientationQuaternionRef.current.setFromEuler(
                dockingOrientationEulerRef.current.set(
                    pitchRef.current,
                    yawRef.current,
                    rollRef.current,
                    "YXZ",
                ),
            );
            const cameraAimPosition = dockingCameraAimPositionRef.current
                .copy(cockpitOffsetRef.current)
                .applyQuaternion(orientation)
                .add(ship.position);
            const cameraToPort = dockingCameraToPortRef.current
                .copy(portCorePosition)
                .sub(cameraAimPosition);
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
                } else {
                    aimDirection.copy(cameraToPort);
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

            rollRef.current = normalizeSignedAngle(
                rollRef.current * Math.max(0, 1 - ((finalCaptureActive ? 5.2 : 3.2) * delta)),
            );

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
            const reticleAlignmentCosine = shipForward.dot(shipToPortDirection);
            const corridorLateralOffset = (() => {
                const offsetFromPort = dockingTemporaryVectorRef.current
                    .copy(ship.position)
                    .sub(portPosition);
                const projectedAlongEntry = offsetFromPort.dot(entryVector);
                offsetFromPort.addScaledVector(entryVector, -projectedAlongEntry);
                return offsetFromPort.length();
            })();

            if (activeApproachStage === "hold-align") {
                const nowMs = performance.now();
                const holdAlignElapsedMs = nowMs - dockingApproachStageStartedAtRef.current;
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
                const holdAlignStableMs = dockingHoldAlignAlignedSinceRef.current > 0
                    ? nowMs - dockingHoldAlignAlignedSinceRef.current
                    : 0;
                const holdAlignTimeout = holdAlignElapsedMs >= DOCKING_HOLD_ALIGN_MAX_DURATION_MS;
                const holdAlignTimeoutEligible = (
                    reticleAlignmentCosine >= DOCKING_HOLD_ALIGN_TIMEOUT_REQUIRED_COSINE
                    && corridorLateralOffset <= DOCKING_HOLD_ALIGN_TIMEOUT_CORRIDOR_TOLERANCE_KM
                );
                if (
                    (holdAlignTimeout && holdAlignTimeoutEligible)
                    || (
                        holdAlignElapsedMs >= DOCKING_HOLD_ALIGN_DURATION_MS
                        && holdAlignStableMs >= DOCKING_HOLD_ALIGN_STABLE_MS
                    )
                ) {
                    dockingApproachStageRef.current = "final-approach";
                    dockingApproachStageStartedAtRef.current = nowMs;
                    dockingHoldAlignAlignedSinceRef.current = 0;
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
            if (activeApproachStage !== "hold-entry") {
                const trajectoryAimBlend = finalCaptureActive
                    ? DOCKING_TRAJECTORY_AIM_BLEND_CAPTURE
                    : activeApproachStage === "final-approach"
                        ? DOCKING_TRAJECTORY_AIM_BLEND_FINAL
                        : DOCKING_TRAJECTORY_AIM_BLEND_HOLD_ALIGN;
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
                const reticleAligned = reticleAlignmentCosine >= DOCKING_FINAL_CAPTURE_ALIGNMENT_COSINE;

                if (finalApproachElapsedMs >= DOCKING_FINAL_STAGE_MIN_DURATION_MS) {
                    const directPortWindowReached = (
                        distanceToPort <= DOCKING_PORT_THRESHOLD
                        && reticleAligned
                    );
                    const fallbackWindowReached = (
                        finalApproachElapsedMs >= DOCKING_FINAL_STAGE_FORCE_COMPLETE_MS
                        && distanceToPort <= DOCKING_PORT_FALLBACK_THRESHOLD
                        && distanceToApproachPoint <= DOCKING_PORT_THRESHOLD
                    );

                    if (directPortWindowReached || fallbackWindowReached) {
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
            isDockingApproachActive
            || jumpPhase === "docking-approach"
            || jumpPhase === "docking-transit-internal"
        );
        if (onCollision && !isDockingSequenceActive) {
            const collisionRadiusByType: Record<Exclude<
                ScannerAnchorContact["contact_type"],
                "station"
            >, number> = {
                ship: 0.72,
                planet: 2.0,
                moon: 1.55,
                star: 2.4,
            };
            let nearestCollision: {
                contact: ScannerAnchorContact;
                distance: number;
            } | null = null;

            for (const contact of scannerContacts) {
                const radius = contact.contact_type === "station"
                    ? (() => {
                        const shape = resolveStationShapeKey(contact.station_archetype_shape);
                        const baseStationRadius = shape === "orbis" ? 4.9 : 5.9;
                        const stationRadius = (
                            baseStationRadius * stationDistanceScale(contact.distance_km)
                        ) + 0.08;
                        return Math.max(0.22, stationRadius);
                    })()
                    : collisionRadiusByType[contact.contact_type];
                const distance = Math.hypot(
                    contact.scene_x - ship.position.x,
                    contact.scene_y - ship.position.y,
                    contact.scene_z - ship.position.z,
                );
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
                        || nearestCollision.contact.contact_type === "star"
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
        const cockpitOffset = cockpitWorldOffsetRef.current
            .copy(cockpitOffsetRef.current)
            .applyQuaternion(ship.quaternion);
        camera.position.set(
            ship.position.x + cockpitOffset.x,
            ship.position.y + cockpitOffset.y,
            ship.position.z + cockpitOffset.z,
        );
        camera.quaternion.copy(ship.quaternion);

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

            const relativeFromCamera = scannerCameraRelativeVectorRef.current
                .set(
                    contact.scene_x - camera.position.x,
                    contact.scene_y - camera.position.y,
                    contact.scene_z - camera.position.z,
                )
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

            const stationScale = stationDistanceScale(contact.distance_km);
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
                    const relativeFromShip = scannerRelativeVectorRef.current
                        .set(
                            contact.scene_x - ship.position.x,
                            contact.scene_y - ship.position.y,
                            contact.scene_z - ship.position.z,
                        )
                        .applyQuaternion(inverseOrientation);

                    const relativeX = relativeFromShip.x;
                    const relativeY = relativeFromShip.y;
                    const relativeZ = relativeFromShip.z;
                    const centerDistance = Math.hypot(relativeX, relativeY, relativeZ);
                    const stationSurfaceDistance = contact.contact_type === "station"
                        ? Math.max(0, centerDistance - resolveStationCollisionRadiusKm(contact))
                        : centerDistance;
                    const isDockingPortDistanceContact = (
                        isDockingApproachActive
                        && contact.contact_type === "station"
                        && contact.id === dockingApproachContactId
                    );
                    const distanceMode: ScannerTelemetryContact["distance_mode"] = isDockingPortDistanceContact
                        ? "port"
                        : "surface";
                    const reportedDistance = (() => {
                        if (!isDockingPortDistanceContact) {
                            return stationSurfaceDistance;
                        }
                        const portWorldPosition = resolveDockingPortWorldPosition(
                            contact,
                            dockingCameraToPortRef.current,
                        );
                        return Math.hypot(
                            portWorldPosition.x - ship.position.x,
                            portWorldPosition.y - ship.position.y,
                            portWorldPosition.z - ship.position.z,
                        );
                    })();
                    const forwardDistance = -relativeZ;
                    const planarX = clamp(relativeX / SCANNER_PLANE_RANGE, -1, 1);
                    const planarY = clamp(forwardDistance / SCANNER_PLANE_RANGE, -1, 1);
                    const altitude = clamp(relativeY / SCANNER_ALTITUDE_RANGE, -1, 1);

                    const relativeFromCamera = scannerCameraRelativeVectorRef.current
                        .set(
                            contact.scene_x - camera.position.x,
                            contact.scene_y - camera.position.y,
                            contact.scene_z - camera.position.z,
                        )
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

                    const inView = (
                        cameraForwardDistance > 0
                        && (() => {
                            const inViewMarginByType: Record<ScannerAnchorContact["contact_type"], number> = {
                                ship: 0.5,
                                station: 1.05,
                                planet: 1.2,
                                moon: 1.15,
                                star: 1.35,
                            };
                            const margin = inViewMarginByType[contact.contact_type] ?? 0;
                            return (
                                Math.abs(fovX) <= (1 + margin)
                                && Math.abs(fovY) <= (1 + margin)
                            );
                        })()
                    );

                    return {
                        id: contact.id,
                        relative_x: relativeX,
                        relative_y: relativeY,
                        relative_z: relativeZ,
                        forward_distance: forwardDistance,
                        plane_x: planarX,
                        plane_y: planarY,
                        altitude,
                        in_view: inView,
                        fov_x: Number.isFinite(fovX) ? fovX : 0,
                        fov_y: Number.isFinite(fovY) ? fovY : 0,
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
                    const labelAnchors = telemetryContacts
                        .filter((telemetry) => telemetry.in_view)
                        .map((telemetry) => {
                            const contact = contactById.get(telemetry.id);
                            if (!contact) {
                                return null;
                            }

                            const rawLeftPercent = 50 + (telemetry.fov_x * 50);
                            const rawTopPercent = 50 - (telemetry.fov_y * 50);

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
                        .slice(0, 12)
                        .map((anchor) => ({
                            id: anchor.id,
                            name: anchor.name,
                            leftPercent: anchor.leftPercent,
                            topPercent: anchor.topPercent,
                            isSelected: anchor.isSelected,
                        }));

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
            const x = contact.scene_x + drift;
            const y = contact.scene_y + bob;
            const z = contact.scene_z;

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
                <mesh ref={waypointRef} position={waypointPosition} visible={showWaypointIndicator}>
                    <torusGeometry args={[1.1, 0.14, 14, 28]} />
                    <meshStandardMaterial wireframe emissive="#59d4ff" emissiveIntensity={0.35} />
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
                    <group key={`anchor-${contact.id}`} position={sceneAnchorPosition(contact)}>
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
        shipVisualKey,
        stationShapeKey,
        transitStationLabel,
        focusedContact,
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
                    camera={{ position: [0, 2, 6], fov: 62 }}
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
                            shipVisualKey={shipVisualKey}
                            focusedContact={focusedContact}
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
