"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";

type SystemChart3DContact = {
  id: string;
  contact_type: "ship" | "station" | "planet" | "moon" | "star";
  chart_x: number;
  chart_y: number;
  chart_z: number;
  radius_km: number | null;
  color: string;
};

type SystemChart3DProps = {
  contacts: SystemChart3DContact[];
  selectedContactId: string | null;
  targetedContactId: string | null;
  centerX: number;
  centerZ: number;
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
};

type RenderPoint = {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  selected: boolean;
  targeted: boolean;
};

const clamp = (value: number, minimum: number, maximum: number): number => {
  return Math.max(minimum, Math.min(maximum, value));
};

export function SystemChart3D({
  contacts,
  selectedContactId,
  targetedContactId,
  centerX,
  centerZ,
  yawDeg,
  pitchDeg,
  zoom,
}: SystemChart3DProps) {
  const points = useMemo<RenderPoint[]>(() => {
    if (!contacts.length) {
      return [];
    }

    const translated = contacts.map((contact) => ({
      id: contact.id,
      contact_type: contact.contact_type,
      x: contact.chart_x - centerX,
      y: contact.chart_y,
      z: contact.chart_z - centerZ,
      radius_km: contact.radius_km,
      color: contact.color,
    }));

    const maxExtent = Math.max(
      1,
      ...translated.map((entry) => Math.max(Math.abs(entry.x), Math.abs(entry.z))),
    );
    const worldScale = maxExtent / 24;
    const zoomScale = clamp(1 / Math.max(0.2, zoom), 0.25, 4);

    return translated.map((entry) => {
      const baseRadius = entry.contact_type === "star"
        ? 1.6
        : entry.contact_type === "station"
          ? 0.6
          : entry.contact_type === "planet"
            ? 0.9
            : entry.contact_type === "moon"
              ? 0.55
              : 0.45;
      const scaledRadius = entry.radius_km && entry.radius_km > 0
        ? clamp(Math.log10(entry.radius_km + 10) * 0.16, 0.35, 1.8)
        : baseRadius;

      return {
        id: entry.id,
        x: (entry.x / worldScale) * zoomScale,
        y: (entry.y / worldScale) * zoomScale * 0.5,
        z: (entry.z / worldScale) * zoomScale,
        radius: scaledRadius,
        color: entry.color,
        selected: entry.id === selectedContactId,
        targeted: entry.id === targetedContactId,
      };
    });
  }, [centerX, centerZ, contacts, selectedContactId, targetedContactId, zoom]);

  const yawRad = (yawDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const cameraDistance = clamp(42 / Math.max(0.35, zoom), 18, 70);

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="demand"
      camera={{ position: [0, 10, cameraDistance], fov: 45, near: 0.1, far: 500 }}
    >
      <color attach="background" args={["#020714"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 16, 10]} intensity={1.1} />
      <pointLight position={[-8, 6, -12]} intensity={0.35} color="#4fd4ff" />

      <group rotation={[pitchRad, yawRad, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
          <ringGeometry args={[6, 26, 80]} />
          <meshBasicMaterial color="#1f6d95" transparent opacity={0.22} />
        </mesh>

        {points.map((point) => (
          <group key={point.id} position={[point.x, point.y, point.z]}>
            {point.targeted ? (
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[point.radius + 0.36, 0.08, 10, 32]} />
                <meshBasicMaterial color="#f7b34d" transparent opacity={0.85} />
              </mesh>
            ) : null}
            {point.selected ? (
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[point.radius + 0.2, 0.05, 10, 24]} />
                <meshBasicMaterial color="#9ce9ff" transparent opacity={0.75} />
              </mesh>
            ) : null}
            <mesh>
              <sphereGeometry args={[point.radius, 18, 18]} />
              <meshStandardMaterial color={point.color} emissive={point.color} emissiveIntensity={0.18} />
            </mesh>
          </group>
        ))}
      </group>
    </Canvas>
  );
}
