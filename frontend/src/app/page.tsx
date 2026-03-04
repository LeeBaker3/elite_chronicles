"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { DataState } from "../components/ui/DataState";
import {
  createBrowserAudioContext,
  FlightAudioAdapter,
  type FlightAudioPlaybackResult,
} from "../components/audio/flightAudioAdapter";
import { resolveChartPointVisual } from "../components/ui/celestialVisuals";
import { useToast } from "../components/ui/ToastProvider";
import { Tooltip } from "../components/ui/Tooltip";
import { resolveScannerDisplayDistanceKm } from "./scannerDistance";
import styles from "./page.module.css";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";
const DEV_TOOLS_STORAGE_KEY = "elite_dev_tools_open";
const MISSION_FILTER_STORAGE_KEY = "elite_mission_filter";
const MISSION_SORT_STORAGE_KEY = "elite_mission_sort";
const ACTIVE_MODE_STORAGE_KEY = "elite_active_mode";
const NAVIGATION_VIEW_STORAGE_KEY = "elite_navigation_view";
const LOCAL_CHART_LAYERS_STORAGE_KEY = "elite_local_chart_layers";
const LOCAL_CHART_VIEW_STORAGE_KEY = "elite_local_chart_view";
const LOCAL_CHART_SORT_STORAGE_KEY = "elite_local_chart_sort";
const SCANNER_SELECTED_CONTACT_STORAGE_KEY = "elite_scanner_selected_contact";
const SCANNER_RANGE_STORAGE_KEY = "elite_scanner_range_km";
const FLIGHT_CONTACT_LABELS_STORAGE_KEY = "elite_flight_contact_labels";
const FLIGHT_SCANNER_DEBUG_STORAGE_KEY = "elite_flight_scanner_debug";
const FLIGHT_AUDIO_ENABLED_STORAGE_KEY = "elite_flight_audio_enabled";
const FLIGHT_REDUCED_AUDIO_STORAGE_KEY = "elite_flight_reduced_audio";
const FLIGHT_AUDIO_ENGINE_STORAGE_KEY = "elite_flight_audio_engine";
const FLIGHT_3D_ENABLED = process.env.NEXT_PUBLIC_FLIGHT_3D !== "false";

const FlightScene = dynamic(
  () => import("../components/ui/FlightScene").then((module) => module.FlightScene),
  { ssr: false }
);

type AuthMode = "login" | "register";
type TradeDirection = "buy" | "sell";
type NavigationView = "system" | "galaxy";
type GameMode = "trade" | "flight" | "story" | "comms" | "ship" | "navigation" | "system" | "galaxy";
const FLIGHT_PHASE = {
  IDLE: "idle",
  DOCKING_APPROACH: "docking-approach",
  DOCKING_TRANSIT_IN: "docking-transit-internal",
  UNDOCKING_TRANSIT_OUT: "undocking-transit-internal",
  DESTINATION_LOCKED: "destination-locked",
  CHARGING: "charging",
  JUMPING: "jumping",
  ARRIVED: "arrived",
  ERROR: "error",
} as const;

type FlightJumpPhase = (typeof FLIGHT_PHASE)[keyof typeof FLIGHT_PHASE];
type FlightRenderProfile = "performance" | "balanced" | "cinematic";
type LocalTargetStatus =
  | "none"
  | "in-system-locked"
  | "out-of-system-locked"
  | "unknown-target";
type FlightAudioEventName =
  | "nav.target_acquired"
  | "nav.target_locked"
  | "nav.invalid_action"
  | "nav.approach_ready"
  | "dock.transit_enter"
  | "dock.transit_exit"
  | "flight.throttle_accel"
  | "flight.throttle_decel"
  | "flight.motion_loop"
  | "jump.charge_start"
  | "jump.transit_peak"
  | "jump.hyperspace_charge_start"
  | "jump.hyperspace_transit_peak"
  | "jump.exit"
  | "jump.exit_stabilize"
  | "jump.hyperspace_exit"
  | "jump.hyperspace_exit_stabilize";
type FlightAudioCategory = "navigation" | "propulsion" | "jump" | "docking";
type FlightAudioEngine = "web-audio" | "media-audio";

type FlightAudioDispatchSummary = {
  lastEvent: FlightAudioEventName | "none";
  dispatchedCount: number;
  blockedCooldownCount: number;
  blockedCategoryCapCount: number;
  blockedSettingsCount: number;
};

type FlightAudioPlaybackSummary = {
  lastResult: FlightAudioPlaybackResult | "none";
  playedCount: number;
  blockedSettingsCount: number;
  blockedReducedCount: number;
  unsupportedCount: number;
  errorCount: number;
};

const FLIGHT_MAX_SPEED_UNITS = 12;
const SCANNER_LIST_MAX_ROWS = 8;
const LOCAL_CHART_MAX_SHIP_ROWS = 3;
const LOCAL_CHART_RENDER_BUDGET_MS = 12;
const SCANNER_RANGE_PRESETS_KM = [25, 50, 100, 250, 500] as const;
const DEFAULT_SCANNER_RANGE_KM = 100;
const FLIGHT_DOCKING_TRANSIT_DURATION_MS = 3600;
const FLIGHT_UNDOCKING_TRANSIT_DURATION_MS = 4400;
const FLIGHT_AUDIO_CATEGORY_WINDOW_MS = 1400;
const FLIGHT_AUDIO_EVENT_CATEGORY: Record<FlightAudioEventName, FlightAudioCategory> = {
  "nav.target_acquired": "navigation",
  "nav.target_locked": "navigation",
  "nav.invalid_action": "navigation",
  "nav.approach_ready": "navigation",
  "dock.transit_enter": "docking",
  "dock.transit_exit": "docking",
  "flight.throttle_accel": "propulsion",
  "flight.throttle_decel": "propulsion",
  "flight.motion_loop": "propulsion",
  "jump.charge_start": "jump",
  "jump.transit_peak": "jump",
  "jump.hyperspace_charge_start": "jump",
  "jump.hyperspace_transit_peak": "jump",
  "jump.exit": "jump",
  "jump.exit_stabilize": "jump",
  "jump.hyperspace_exit": "jump",
  "jump.hyperspace_exit_stabilize": "jump",
};
const FLIGHT_AUDIO_EVENT_COOLDOWN_MS: Record<FlightAudioEventName, number> = {
  "nav.target_acquired": 180,
  "nav.target_locked": 450,
  "nav.invalid_action": 700,
  "nav.approach_ready": 650,
  "dock.transit_enter": 900,
  "dock.transit_exit": 900,
  "flight.throttle_accel": 420,
  "flight.throttle_decel": 420,
  "flight.motion_loop": 1200,
  "jump.charge_start": 900,
  "jump.transit_peak": 900,
  "jump.hyperspace_charge_start": 900,
  "jump.hyperspace_transit_peak": 900,
  "jump.exit": 900,
  "jump.exit_stabilize": 1200,
  "jump.hyperspace_exit": 900,
  "jump.hyperspace_exit_stabilize": 1200,
};
const FLIGHT_AUDIO_CATEGORY_MAX_EVENTS: Record<FlightAudioCategory, number> = {
  navigation: 6,
  propulsion: 4,
  jump: 4,
  docking: 2,
};

const FLIGHT_AUDIO_EVENT_NAMES = new Set<FlightAudioEventName>([
  "nav.target_acquired",
  "nav.target_locked",
  "nav.invalid_action",
  "nav.approach_ready",
  "dock.transit_enter",
  "dock.transit_exit",
  "flight.throttle_accel",
  "flight.throttle_decel",
  "flight.motion_loop",
  "jump.charge_start",
  "jump.transit_peak",
  "jump.hyperspace_charge_start",
  "jump.hyperspace_transit_peak",
  "jump.exit",
  "jump.exit_stabilize",
  "jump.hyperspace_exit",
  "jump.hyperspace_exit_stabilize",
]);

const FLIGHT_MEDIA_REDUCED_AUDIO_EVENTS = new Set<FlightAudioEventName>([
  "flight.motion_loop",
  "flight.throttle_accel",
  "flight.throttle_decel",
]);

const FLIGHT_MEDIA_AUDIO_CUE_MAP: Record<FlightAudioEventName, {
  frequencyStartHz: number;
  frequencyEndHz?: number;
  durationSeconds: number;
  amplitude: number;
  waveform: "sine" | "triangle" | "sawtooth" | "square" | "hybrid";
}> = {
  "nav.target_acquired": {
    frequencyStartHz: 660,
    durationSeconds: 0.08,
    amplitude: 0.5,
    waveform: "triangle",
  },
  "nav.target_locked": {
    frequencyStartHz: 740,
    durationSeconds: 0.1,
    amplitude: 0.52,
    waveform: "triangle",
  },
  "nav.invalid_action": {
    frequencyStartHz: 220,
    durationSeconds: 0.16,
    amplitude: 0.45,
    waveform: "sawtooth",
  },
  "nav.approach_ready": {
    frequencyStartHz: 520,
    durationSeconds: 0.12,
    amplitude: 0.46,
    waveform: "triangle",
  },
  "dock.transit_enter": {
    frequencyStartHz: 300,
    frequencyEndHz: 260,
    durationSeconds: 0.22,
    amplitude: 0.5,
    waveform: "hybrid",
  },
  "dock.transit_exit": {
    frequencyStartHz: 560,
    frequencyEndHz: 620,
    durationSeconds: 0.16,
    amplitude: 0.52,
    waveform: "triangle",
  },
  "flight.throttle_accel": {
    frequencyStartHz: 180,
    frequencyEndHz: 220,
    durationSeconds: 0.12,
    amplitude: 0.36,
    waveform: "sine",
  },
  "flight.throttle_decel": {
    frequencyStartHz: 150,
    frequencyEndHz: 120,
    durationSeconds: 0.12,
    amplitude: 0.36,
    waveform: "sine",
  },
  "flight.motion_loop": {
    frequencyStartHz: 120,
    durationSeconds: 0.14,
    amplitude: 0.3,
    waveform: "sine",
  },
  "jump.charge_start": {
    frequencyStartHz: 140,
    frequencyEndHz: 320,
    durationSeconds: 0.44,
    amplitude: 0.72,
    waveform: "hybrid",
  },
  "jump.transit_peak": {
    frequencyStartHz: 980,
    frequencyEndHz: 640,
    durationSeconds: 0.36,
    amplitude: 0.86,
    waveform: "square",
  },
  "jump.hyperspace_charge_start": {
    frequencyStartHz: 120,
    frequencyEndHz: 420,
    durationSeconds: 0.54,
    amplitude: 0.9,
    waveform: "hybrid",
  },
  "jump.hyperspace_transit_peak": {
    frequencyStartHz: 1220,
    frequencyEndHz: 540,
    durationSeconds: 0.42,
    amplitude: 0.92,
    waveform: "square",
  },
  "jump.exit": {
    frequencyStartHz: 700,
    frequencyEndHz: 500,
    durationSeconds: 0.3,
    amplitude: 0.72,
    waveform: "triangle",
  },
  "jump.exit_stabilize": {
    frequencyStartHz: 520,
    frequencyEndHz: 340,
    durationSeconds: 0.46,
    amplitude: 0.62,
    waveform: "hybrid",
  },
  "jump.hyperspace_exit": {
    frequencyStartHz: 880,
    frequencyEndHz: 460,
    durationSeconds: 0.34,
    amplitude: 0.88,
    waveform: "hybrid",
  },
  "jump.hyperspace_exit_stabilize": {
    frequencyStartHz: 420,
    frequencyEndHz: 260,
    durationSeconds: 0.52,
    amplitude: 0.68,
    waveform: "triangle",
  },
};

const parseFlightAudioEventName = (value: unknown): FlightAudioEventName | null => {
  if (typeof value !== "string") {
    return null;
  }
  return FLIGHT_AUDIO_EVENT_NAMES.has(value as FlightAudioEventName)
    ? (value as FlightAudioEventName)
    : null;
};

const createMediaToneWavDataUri = (
  frequencyStartHz: number,
  frequencyEndHz: number,
  durationSeconds: number,
  amplitude: number,
  waveform: "sine" | "triangle" | "sawtooth" | "square" | "hybrid",
): string => {
  const sampleRate = 48_000;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataSize = sampleCount * 2;
  const totalSize = 44 + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    const progress = sampleIndex / Math.max(1, sampleCount - 1);
    const frequencyHz = (
      frequencyStartHz
      + ((frequencyEndHz - frequencyStartHz) * progress)
    );
    const phase = 2 * Math.PI * frequencyHz * time;
    const attack = Math.min(1, time / 0.04);
    const release = Math.min(1, (durationSeconds - time) / 0.16);
    const envelope = Math.max(0, Math.min(1, attack, release));

    const sine = Math.sin(phase);
    const square = Math.sign(sine);
    const saw = 2 * ((frequencyHz * time) - Math.floor(0.5 + (frequencyHz * time)));
    const triangle = (2 / Math.PI) * Math.asin(sine);

    const waveformSample = waveform === "sine"
      ? sine
      : waveform === "square"
        ? square
        : waveform === "sawtooth"
          ? saw
          : waveform === "triangle"
            ? triangle
            : (0.45 * saw) + (0.35 * triangle) + (0.2 * sine);

    const layered = waveformSample + (0.2 * Math.sin(phase * 0.5));
    const shaped = Math.tanh(layered * 1.25);
    const sample = shaped * amplitude * envelope;
    view.setInt16(44 + (sampleIndex * 2), Math.max(-1, Math.min(1, sample)) * 32767, true);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
};

const FLIGHT_PHASE_VALUES = new Set<FlightJumpPhase>(Object.values(FLIGHT_PHASE));
const LOCAL_TARGET_STATUS_VALUES = new Set<LocalTargetStatus>([
  "none",
  "in-system-locked",
  "out-of-system-locked",
  "unknown-target",
]);

const parseFlightJumpPhase = (value: unknown): FlightJumpPhase | null => {
  if (typeof value !== "string") {
    return null;
  }
  return FLIGHT_PHASE_VALUES.has(value as FlightJumpPhase)
    ? (value as FlightJumpPhase)
    : null;
};

const parseLocalTargetStatus = (value: unknown): LocalTargetStatus | null => {
  if (typeof value !== "string") {
    return null;
  }
  return LOCAL_TARGET_STATUS_VALUES.has(value as LocalTargetStatus)
    ? (value as LocalTargetStatus)
    : null;
};

const createMediaDiagnosticWavDataUri = (): string => (
  createMediaToneWavDataUri(880, 880, 1.2, 0.85, "square")
);

const isTransitFlightPhase = (phase: FlightJumpPhase): boolean => (
  phase === FLIGHT_PHASE.DOCKING_TRANSIT_IN
  || phase === FLIGHT_PHASE.UNDOCKING_TRANSIT_OUT
);

type InventoryItem = {
  name: string;
  commodity_id: number;
  quantity: number;
  buy_price: number;
  sell_price: number;
};

type CargoItem = {
  commodity_id: number;
  commodity_name: string;
  quantity: number;
};

type ShipCargoData = {
  ship_id: number;
  cargo_capacity: number;
  cargo_used: number;
  cargo_free: number;
  items: CargoItem[];
};

type ShipTelemetry = {
  id: number;
  name: string;
  ship_visual_key: string;
  ship_archetype_id?: number | null;
  render_seed?: number;
  docking_computer_tier: string;
  docking_computer_range_km: number;
  docked_station_archetype_name: string | null;
  docked_station_archetype_shape: string | null;
  hull_max?: number;
  hull_current: number;
  shields_max?: number;
  shields_current: number;
  energy_cap?: number;
  energy_current: number;
  fuel_current: number;
  fuel_cap: number;
  cargo_capacity: number;
  position_x?: number;
  position_y?: number;
  position_z?: number;
  status: string;
  docked_station_id: number | null;
  flight_phase: FlightJumpPhase;
  flight_locked_destination_station_id: number | null;
  flight_locked_destination_contact_type?: "station" | "planet" | "moon" | "star" | null;
  flight_locked_destination_contact_id?: number | null;
  flight_phase_started_at: string | null;
  jump_cooldown_seconds: number;
  jump_cooldown_until: string | null;
};

type ScannerContactType = "ship" | "station" | "planet" | "moon" | "star";
type LocalChartLayerKey = ScannerContactType;
type LocalChartSortKey = "distance" | "type" | "radius" | "name";
type SortDirection = "asc" | "desc";
type SystemChartScaleMode = "eased" | "linear";

type LocalChartSortState = {
  key: LocalChartSortKey;
  direction: SortDirection;
};

type FuelAlertLevel = "normal" | "warning" | "critical";

const FUEL_WARNING_THRESHOLD_PERCENT = 20;
const FUEL_CRITICAL_THRESHOLD_PERCENT = 10;
const JUMP_FUEL_COST = 20;
const CELESTIAL_DISTANCE_REALISM_MULTIPLIER = 1;
const LOCAL_TRANSFER_JUMP_RECOMMENDED_DISTANCE_KM = 1_500_000;
const HYPERSPACE_INITIATION_MIN_CLEARANCE_KM = 100;
const STATION_SCENE_TO_WORLD_SCALE_XZ = 1 / 0.11;
const STATION_SCENE_TO_WORLD_SCALE_Y = 1 / 0.08;

const getFuelAlertLevel = (fuelPercent: number): FuelAlertLevel => {
  if (fuelPercent <= FUEL_CRITICAL_THRESHOLD_PERCENT) {
    return "critical";
  }
  if (fuelPercent <= FUEL_WARNING_THRESHOLD_PERCENT) {
    return "warning";
  }
  return "normal";
};

const LOCAL_CHART_LAYER_OPTIONS: { key: LocalChartLayerKey; label: string }[] = [
  { key: "star", label: "Stars" },
  { key: "planet", label: "Planets" },
  { key: "moon", label: "Moons" },
  { key: "station", label: "Stations" },
  { key: "ship", label: "Ships" },
];

const DEFAULT_LOCAL_CHART_LAYERS: Record<LocalChartLayerKey, boolean> = {
  star: true,
  planet: true,
  moon: true,
  station: true,
  ship: true,
};

const LOCAL_CHART_MIN_ZOOM = 0.00000001;
const LOCAL_CHART_MAX_ZOOM = 20;
const LOCAL_CHART_BUTTON_PAN_PIXELS = 36;
const LOCAL_CHART_VIEWPORT_WIDTH_PX = 520;
const LOCAL_CHART_VIEWPORT_HEIGHT_PX = 420;
const LOCAL_CHART_FIT_MARGIN_PX = 28;

const clampLocalChartZoom = (zoom: number): number => (
  Math.max(LOCAL_CHART_MIN_ZOOM, Math.min(LOCAL_CHART_MAX_ZOOM, zoom))
);

const resolveLocalChartContactType = (
  localChartData: LocalChartResponse | null,
  contactId: string,
): ScannerContactType | null => {
  if (!localChartData) {
    return null;
  }

  if (contactId === `star-${localChartData.star.id}`) {
    return "star";
  }

  if (contactId.startsWith("planet-")) {
    const planetId = Number(contactId.replace("planet-", ""));
    if (
      Number.isInteger(planetId)
      && localChartData.planets.some((planet) => planet.id === planetId)
    ) {
      return "planet";
    }
  }

  if (contactId.startsWith("moon-")) {
    const moonId = Number(contactId.replace("moon-", ""));
    if (
      Number.isInteger(moonId)
      && Object.values(localChartData.moons_by_parent_body_id)
        .flat()
        .some((moon) => moon.id === moonId)
    ) {
      return "moon";
    }
  }

  if (contactId.startsWith("station-")) {
    const stationId = Number(contactId.replace("station-", ""));
    if (
      Number.isInteger(stationId)
      && localChartData.stations.some((station) => station.id === stationId)
    ) {
      return "station";
    }
  }

  return null;
};

type LocalChartViewPreferences = {
  zoom: number;
  center_x: number;
  center_z: number;
  yaw_deg: number;
  pitch_deg: number;
  scale_mode: SystemChartScaleMode;
};

const DEFAULT_LOCAL_CHART_VIEW: LocalChartViewPreferences = {
  zoom: 1,
  center_x: 0,
  center_z: 0,
  yaw_deg: 18,
  pitch_deg: 22,
  scale_mode: "eased",
};

const buildDefaultLocalChartView = (
  localChartData: LocalChartResponse | null,
): LocalChartViewPreferences => {
  if (!localChartData) {
    return DEFAULT_LOCAL_CHART_VIEW;
  }

  const starX = localChartData.star.position_x;
  const starZ = localChartData.star.position_z;
  const bodyDistancesKm = [
    ...localChartData.planets.map((planet) => Math.hypot(
      planet.position_x - starX,
      planet.position_z - starZ,
    )),
    ...Object.values(localChartData.moons_by_parent_body_id)
      .flat()
      .map((moon) => Math.hypot(
        moon.position_x - starX,
        moon.position_z - starZ,
      )),
    ...localChartData.stations.map((station) => Math.hypot(
      station.position_x - starX,
      station.position_z - starZ,
    )),
  ];
  const furthestBodyDistanceKm = Math.max(...bodyDistancesKm, 1);
  const fitRadiusPx = Math.max(
    24,
    (Math.min(LOCAL_CHART_VIEWPORT_WIDTH_PX, LOCAL_CHART_VIEWPORT_HEIGHT_PX) / 2)
    - LOCAL_CHART_FIT_MARGIN_PX,
  );
  const fittedZoom = roundLocalChartControlValue(
    clampLocalChartZoom(fitRadiusPx / furthestBodyDistanceKm),
  );

  return {
    ...DEFAULT_LOCAL_CHART_VIEW,
    zoom: fittedZoom,
    center_x: roundLocalChartControlValue(starX),
    center_z: roundLocalChartControlValue(starZ),
  };
};

type SelectionSyncSource =
  | "system-chart"
  | "scanner-hud-blip"
  | "scanner-hud-list"
  | "scanner-refresh";

type SystemChartObservabilityEventName =
  | "chart-open"
  | "selection-sync"
  | "chart-sync"
  | "chart-render-budget";

type SystemChartObservabilityDetail = {
  event: SystemChartObservabilityEventName;
  timestamp: string;
  openCount?: number;
  source?: SelectionSyncSource;
  success?: boolean;
  contactId?: string;
  reason?: string;
  successCount?: number;
  failureCount?: number;
  systemId?: number;
  budgetMs?: number;
  computeDurationMs?: number;
  rowCount?: number;
  zoom?: number;
};

type SystemChartObservabilitySummary = {
  chartOpenCount: number;
  syncSuccessCount: number;
  syncFailureCount: number;
  chartSyncSuccessCount: number;
  chartSyncFailureCount: number;
  renderBudgetBreachCount: number;
  lastSyncSource: SelectionSyncSource | null;
  lastSyncReason: string | null;
  lastRenderDurationMs: number | null;
  lastRenderBudgetMs: number | null;
  lastEventAt: string | null;
};

type SystemChartObservabilityEventLogEntry = {
  id: string;
  timestamp: string;
  event: SystemChartObservabilityEventName;
  source: SelectionSyncSource | "system";
  outcome: "success" | "failure" | "info";
  message: string;
};

type ScannerContact = {
  id: string;
  contact_type: ScannerContactType;
  name: string;
  distance_km: number;
  bearing_x: number;
  bearing_y: number;
  orbiting_planet_name?: string | null;
  station_archetype_shape?: string | null;
  ship_visual_key?: string | null;
  scene_x: number;
  scene_y: number;
  scene_z: number;
  body_kind?: "star" | "planet" | "moon";
  body_type?: string | null;
  radius_km?: number | null;
};

type ScannerHudContact = ScannerContact & {
  left: number;
  planeTop: number;
  dotTop: number;
  altitude: number;
  inView: boolean;
  isBeyondScannerRange: boolean;
  relativeX: number;
  relativeY: number;
  relativeZ: number;
  displayDistance: number;
  visibleOnScannerGrid: boolean;
  planeX: number;
  planeY: number;
  fovX: number;
  fovY: number;
  forwardDistance: number;
  scannerLeft: number;
  scannerTop: number;
};

type ScannerContactsResponse = {
  ship_id: number;
  system_id: number;
  system_name: string;
  generation_version: number;
  contacts: ScannerContact[];
};

type LocalChartBody = {
  id: number;
  body_kind: "star" | "planet" | "moon";
  body_type: string;
  name: string;
  generation_version: number;
  parent_body_id: number | null;
  orbit_index: number;
  orbit_radius_km: number;
  radius_km: number;
  position_x: number;
  position_y: number;
  position_z: number;
};

type LocalChartStation = {
  id: number;
  name: string;
  host_body_id: number | null;
  orbit_radius_km: number | null;
  orbit_phase_deg: number | null;
  position_x: number;
  position_y: number;
  position_z: number;
};

type LocalChartResponse = {
  system: {
    id: number;
    name: string;
    generation_version: number;
    seed_hash: string;
    contract_version?: string;
  };
  star: LocalChartBody;
  planets: LocalChartBody[];
  moons_by_parent_body_id: Record<string, LocalChartBody[]>;
  stations: LocalChartStation[];
  mutable_state?: {
    economy_tick_cursor: number;
    politics_tick_cursor: number;
    last_economy_tick_at: string | null;
    last_politics_tick_at: string | null;
    security_level: string;
    stability_score: number;
    flight_phase?: string;
    transition_started_at?: string | null;
    local_target_contact_type?: "station" | "planet" | "moon" | "star" | null;
    local_target_contact_id?: string | null;
    local_target_status?: string;
    audio_event_hints?: string[];
  };
};

type LocalChartRow = {
  id: string;
  contact_type: ScannerContactType;
  body_kind: "star" | "planet" | "moon" | "station" | "ship";
  body_type: string | null;
  name: string;
  visual_label: string;
  radius_km: number | null;
  distance_km: number | null;
  orbit_label: string;
  chart_x: number;
  chart_y: number;
  chart_z: number;
};

type ScannerLiveContact = {
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
  distance_mode?: "surface" | "port";
};

type FlightDockingApproachProgress = {
  progress: number;
  distanceKm: number;
  targetName: string;
  stage: "hold-entry" | "hold-align" | "final-approach";
};

type FlightSpawnDirective = {
  mode: "undock-exit";
  stationContactId: string;
  nonce: number;
};

const sanitizeCollisionStatusMessage = (message: string | null | undefined): string => {
  const normalized = (message || "").trim();
  if (!normalized) {
    return "Collision monitor online.";
  }

  const withoutSeparatorDebug = normalized.split(" · ")[0] || normalized;
  const diagMarkerIndex = withoutSeparatorDebug.toLowerCase().indexOf(": diag:");
  if (diagMarkerIndex >= 0) {
    return withoutSeparatorDebug.slice(0, diagMarkerIndex).trim();
  }

  return withoutSeparatorDebug;
};

const isSafetyCorridorCollisionStatus = (status: string | null | undefined): boolean => {
  const normalized = (status || "").trim().toLowerCase();
  return (
    normalized.startsWith("docking computer safety corridor active")
    || normalized.startsWith("transit safety corridor active")
  );
};

const roundLocalChartControlValue = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const absoluteValue = Math.abs(value);
  if (absoluteValue > 0 && absoluteValue < LOCAL_CHART_MIN_ZOOM) {
    return Number(value.toFixed(12));
  }

  if (absoluteValue >= 0.01) {
    return Number(value.toFixed(3));
  }

  return Number(value.toFixed(10));
};

type CollisionCheckResponse = {
  ship: ShipTelemetry;
  collision: boolean;
  severity: "none" | "glancing" | "critical" | string;
  object_type: string | null;
  object_id: string | null;
  object_name: string | null;
  distance_km: number | null;
  shields_damage: number;
  hull_damage: number;
  recovered: boolean;
  message: string;
};

type FlightImpactEntry = {
  id: string;
  severity: string;
  label: string;
};

type ShipOperationLogEntry = {
  ship_id: number;
  operation: string;
  cost_credits: number;
  credits_after: number | null;
  status: string;
  details: string;
  timestamp: string;
};

type ShipOpsFilter = "all" | "maintenance" | "travel";

type StationOption = {
  id: number;
  name: string;
  system_id: number;
};

type SystemMapOption = {
  id: number;
  label: string;
  stations: StationOption[];
};

type GalaxyChartViewMode = "galaxy" | "local_reachable";
type GalaxyDatasetMode = "canonical" | "real_inspired";

type GalaxySystemEntry = {
  system_id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  economy: string;
  government: string;
  tech_level: number;
  population: number;
  reachable_from_current: boolean;
  estimated_jump_fuel: number | null;
  reachability_reason: string | null;
};

type GalaxySystemsResponse = {
  current_system_id: number;
  view_mode: GalaxyChartViewMode;
  dataset_source?: {
    mode: GalaxyDatasetMode;
    source_name: string;
    license_type: string;
    source_version: string;
    generated_at: string;
  };
  systems: GalaxySystemEntry[];
};

type GalaxySystemOverviewResponse = {
  system: {
    id: number;
    name: string;
    economy: string;
    government: string;
    tech_level: number;
    population: number;
  };
  jump: {
    reachable: boolean;
    estimated_jump_fuel: number | null;
    reason: string | null;
    route_hops?: number[];
    route_hop_names?: string[];
    route_total_estimated_fuel?: number | null;
  };
  dataset_source?: {
    mode: GalaxyDatasetMode;
    source_name: string;
    license_type: string;
    source_version: string;
    generated_at: string;
  };
  overview: {
    planets_total: number;
    moons_total: number;
    stations_total: number;
    planets: Array<{
      name: string;
      body_type: string;
      orbit_index: number;
    }>;
    stations: Array<{
      name: string;
      archetype: string | null;
      host_body_name: string | null;
    }>;
  };
};

type CommanderProfile = {
  id: number;
  email: string;
  username: string;
  role: string;
  credits: number;
  is_alive: boolean;
  location_type: string | null;
  location_id: number | null;
};

type MarketStationSummary = {
  station_id: number;
  station_name: string;
  commodity_count: number;
  scarcity_count: number;
  last_inventory_update: string | null;
  updated_seconds_ago: number | null;
  stale: boolean;
};

type AdminLogEntry = {
  timestamp: string | null;
  level: string;
  logger: string | null;
  source: string;
  message: string;
};

type AdminLogsResponsePayload = {
  entries: AdminLogEntry[];
  next_since: string | null;
};

type AdminUserItem = {
  id: number;
  email: string;
  username: string;
  role: string;
  status: string;
  is_alive: boolean;
  location_type: string | null;
  location_id: number | null;
  location_label: string;
};

type AdminUsersResponsePayload = {
  users: AdminUserItem[];
  total: number;
  limit: number;
  offset: number;
};

type StorySessionItem = {
  id: number;
  location_type: string;
  location_id: number;
  status: string;
};

type MissionAvailableItem = {
  id: number;
  station_id: number;
  station_name: string;
  faction_id: number | null;
  title: string;
  description: string;
  reward_credits: number;
  status: string;
  expires_at: string | null;
  accepted: boolean;
};

type MissionAssignedItem = {
  mission_id: number;
  station_id: number;
  station_name: string;
  title: string;
  reward_credits: number;
  status: string;
  accepted_at: string;
  completed_at: string | null;
};

type MissionStatusFilter = "all" | "accepted" | "completed" | "abandoned";
type MissionSortOrder = "newest" | "oldest";

type CommsChannelScope = "local" | "interstellar";

type CommsChannel = {
  id: string;
  name: string;
  scope: CommsChannelScope;
  delayLabel: string;
  unread: number;
};

type CommsMessage = {
  id: string;
  author: string;
  body: string;
  timestamp: string;
  direction: "inbound" | "outbound";
  delivery: "instant" | "queued" | "delivered";
};

type CommsChannelApi = {
  id: string;
  name: string;
  scope: CommsChannelScope;
  delay_label: string;
  unread: number;
};

type CommsMessageApi = {
  id: string;
  author: string;
  body: string;
  timestamp: string;
  direction: "inbound" | "outbound";
  delivery: "instant" | "queued" | "delivered";
};

const formatCommsDeliveryLabel = (delivery: CommsMessage["delivery"]): string => {
  if (delivery === "queued") {
    return "Queued";
  }
  if (delivery === "delivered") {
    return "Delivered";
  }
  return "Instant";
};

const mapCommsChannel = (channel: CommsChannelApi): CommsChannel => ({
  id: channel.id,
  name: channel.name,
  scope: channel.scope,
  delayLabel: channel.delay_label,
  unread: channel.unread,
});

const mapCommsMessage = (message: CommsMessageApi): CommsMessage => ({
  id: message.id,
  author: message.author,
  body: message.body,
  timestamp: message.timestamp,
  direction: message.direction,
  delivery: message.delivery,
});

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
};

const percentageFromCurrentAndMax = (
  currentValue: number,
  maxValue: number | undefined,
): number => {
  if (!Number.isFinite(currentValue)) {
    return 0;
  }

  if (Number.isFinite(maxValue) && (maxValue ?? 0) > 0) {
    return clampPercent((currentValue / (maxValue as number)) * 100);
  }

  return clampPercent(currentValue);
};

const sleep = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
};

const parseStationContactId = (contactId: string): number | null => {
  const match = contactId.match(/^station-(\d+)$/i);
  if (!match) {
    return null;
  }
  const parsedStationId = Number(match[1]);
  return Number.isInteger(parsedStationId) && parsedStationId > 0
    ? parsedStationId
    : null;
};

const parseLocalTargetContactId = (
  contactId: string,
): { contactType: "station" | "planet" | "moon" | "star"; contactId: number } | null => {
  const match = contactId.match(/^(station|planet|moon|star)-(\d+)$/i);
  if (!match) {
    return null;
  }
  const parsedContactId = Number(match[2]);
  if (!Number.isInteger(parsedContactId) || parsedContactId <= 0) {
    return null;
  }
  return {
    contactType: match[1].toLowerCase() as "station" | "planet" | "moon" | "star",
    contactId: parsedContactId,
  };
};

const formatBodyVisualLabel = (bodyType: string, radiusKm: number): string => {
  const normalizedBodyType = bodyType.trim() || "unknown";
  const normalizedRadiusKm = Number.isFinite(radiusKm) && radiusKm > 0
    ? Math.round(radiusKm)
    : 0;
  return `${normalizedBodyType} · r${normalizedRadiusKm.toLocaleString()}km`;
};

const formatScannerDistanceKm = (distanceKm: number): string => {
  const normalizedDistanceKm = Number.isFinite(distanceKm)
    ? Math.max(0, distanceKm)
    : 0;
  const units: Array<{ threshold: number; suffix: string }> = [
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];

  const matchedUnit = units.find((unit) => normalizedDistanceKm >= unit.threshold);
  if (matchedUnit) {
    return `${(normalizedDistanceKm / matchedUnit.threshold).toFixed(2)}${matchedUnit.suffix} km`;
  }

  return `${normalizedDistanceKm.toFixed(1)} km`;
};

const countLocalChartRows = (payload: LocalChartResponse): number => {
  const moonCount = Object.values(payload.moons_by_parent_body_id).reduce(
    (total, moons) => total + moons.length,
    0,
  );
  return 1 + payload.planets.length + moonCount + payload.stations.length;
};

const normalizeLocalChartPayload = (payload: LocalChartResponse): LocalChartResponse => {
  const mutableState = payload.mutable_state;
  return {
    ...payload,
    system: {
      ...payload.system,
      contract_version: payload.system.contract_version || "local-chart.v0",
    },
    mutable_state: {
      economy_tick_cursor: Number.isFinite(mutableState?.economy_tick_cursor)
        ? Number(mutableState?.economy_tick_cursor)
        : 0,
      politics_tick_cursor: Number.isFinite(mutableState?.politics_tick_cursor)
        ? Number(mutableState?.politics_tick_cursor)
        : 0,
      last_economy_tick_at: mutableState?.last_economy_tick_at ?? null,
      last_politics_tick_at: mutableState?.last_politics_tick_at ?? null,
      security_level: (mutableState?.security_level || "medium").trim() || "medium",
      stability_score: Number.isFinite(mutableState?.stability_score)
        ? Number(mutableState?.stability_score)
        : 50,
      flight_phase: parseFlightJumpPhase(mutableState?.flight_phase) || FLIGHT_PHASE.IDLE,
      transition_started_at: mutableState?.transition_started_at ?? null,
      local_target_contact_type: mutableState?.local_target_contact_type ?? null,
      local_target_contact_id: mutableState?.local_target_contact_id ?? null,
      local_target_status: parseLocalTargetStatus(mutableState?.local_target_status) || "none",
      audio_event_hints: Array.isArray(mutableState?.audio_event_hints)
        ? mutableState.audio_event_hints.filter((hint) => typeof hint === "string")
        : [],
    },
  };
};

const FLIGHT_CELESTIAL_SCENE_RADIUS_UNITS = 560;
const FLIGHT_CELESTIAL_ORBIT_EXPONENT = 1.2;
const FLIGHT_CELESTIAL_MIN_ORBIT_UNITS = 90;
const FLIGHT_CELESTIAL_MIN_ORBIT_STEP_UNITS = 68;

const buildFlightCelestialAnchors = (
  localChartData: LocalChartResponse,
  scannerContacts: ScannerContact[],
): ScannerContact[] => {
  const scannerContactById = new Map(scannerContacts.map((contact) => [contact.id, contact]));
  const star = localChartData.star;

  const bodies: Array<{
    id: string;
    name: string;
    body_kind: "star" | "planet" | "moon";
    body_type: string;
    radius_km: number;
    position_x: number;
    position_y: number;
    position_z: number;
  }> = [
      {
        id: `star-${star.id}`,
        name: star.name,
        body_kind: "star",
        body_type: star.body_type,
        radius_km: star.radius_km,
        position_x: star.position_x,
        position_y: star.position_y,
        position_z: star.position_z,
      },
      ...localChartData.planets.map((planet) => ({
        id: `planet-${planet.id}`,
        name: planet.name,
        body_kind: "planet" as const,
        body_type: planet.body_type,
        radius_km: planet.radius_km,
        position_x: planet.position_x,
        position_y: planet.position_y,
        position_z: planet.position_z,
      })),
      ...Object.values(localChartData.moons_by_parent_body_id)
        .flat()
        .map((moon) => ({
          id: `moon-${moon.id}`,
          name: moon.name,
          body_kind: "moon" as const,
          body_type: moon.body_type,
          radius_km: moon.radius_km,
          position_x: moon.position_x,
          position_y: moon.position_y,
          position_z: moon.position_z,
        })),
    ];

  const relativeBodies = bodies.map((body) => ({
    ...body,
    rel_x: body.position_x - star.position_x,
    rel_y: body.position_y - star.position_y,
    rel_z: body.position_z - star.position_z,
  }));

  const maxExtent = Math.max(
    ...relativeBodies.map((body) => Math.hypot(body.rel_x, body.rel_y, body.rel_z)),
    1,
  );
  const orbitRadiusByBodyId = new Map<string, number>();
  const sortedBodies = [...relativeBodies]
    .filter((body) => body.body_kind !== "star")
    .sort((left, right) => {
      const leftDistance = Math.hypot(left.rel_x, left.rel_y, left.rel_z);
      const rightDistance = Math.hypot(right.rel_x, right.rel_y, right.rel_z);
      return leftDistance - rightDistance;
    });

  let lastOrbitUnits = FLIGHT_CELESTIAL_MIN_ORBIT_UNITS - FLIGHT_CELESTIAL_MIN_ORBIT_STEP_UNITS;
  sortedBodies.forEach((body) => {
    const fallbackDistanceKm = Math.hypot(body.rel_x, body.rel_y, body.rel_z);
    const normalizedDistance = Math.min(
      1,
      Math.max(0, fallbackDistanceKm / maxExtent),
    );
    const easedRadiusUnits =
      Math.pow(normalizedDistance, FLIGHT_CELESTIAL_ORBIT_EXPONENT)
      * FLIGHT_CELESTIAL_SCENE_RADIUS_UNITS;
    const baseOrbitUnits = Math.max(FLIGHT_CELESTIAL_MIN_ORBIT_UNITS, easedRadiusUnits);
    const enforcedOrbitUnits = Math.max(
      baseOrbitUnits,
      lastOrbitUnits + FLIGHT_CELESTIAL_MIN_ORBIT_STEP_UNITS,
    );
    orbitRadiusByBodyId.set(body.id, enforcedOrbitUnits);
    lastOrbitUnits = enforcedOrbitUnits;
  });

  return relativeBodies.map((body) => {
    const scannerMatch = scannerContactById.get(body.id);
    const fallbackDistanceKm = Math.hypot(body.rel_x, body.rel_y, body.rel_z);
    const orbitRadiusUnits = body.body_kind === "star"
      ? 0
      : (orbitRadiusByBodyId.get(body.id) ?? FLIGHT_CELESTIAL_MIN_ORBIT_UNITS);
    const directionScale = fallbackDistanceKm > 0
      ? orbitRadiusUnits / fallbackDistanceKm
      : 0;

    return {
      id: body.id,
      name: body.name,
      contact_type: body.body_kind === "star"
        ? "star"
        : body.body_kind === "moon"
          ? "moon"
          : "planet",
      distance_km: scannerMatch?.distance_km ?? fallbackDistanceKm,
      bearing_x: scannerMatch?.bearing_x ?? 0,
      bearing_y: scannerMatch?.bearing_y ?? 0,
      orbiting_planet_name: scannerMatch?.orbiting_planet_name ?? null,
      station_archetype_shape: null,
      ship_visual_key: null,
      scene_x: body.rel_x * directionScale,
      scene_y: body.rel_y * directionScale,
      scene_z: body.rel_z * directionScale,
      body_kind: body.body_kind,
      body_type: body.body_type,
      radius_km: body.radius_km,
    };
  });
};

export default function Home() {
  const { showToast } = useToast();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready for jump clearance.");
  const [token, setToken] = useState<string | null>(null);
  const [authStateHydrated, setAuthStateHydrated] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [stationId, setStationId] = useState("1");
  const [stationOptions, setStationOptions] = useState<StationOption[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [selectedCommodity, setSelectedCommodity] = useState<number | null>(null);
  const [tradeQty, setTradeQty] = useState("1");
  const [shipId, setShipId] = useState("1");
  const [shipCargo, setShipCargo] = useState<ShipCargoData | null>(null);
  const [shipTelemetry, setShipTelemetry] = useState<ShipTelemetry | null>(null);
  const [shipTelemetryLoading, setShipTelemetryLoading] = useState(false);
  const [shipTelemetryError, setShipTelemetryError] = useState<string | null>(null);
  const [scannerContacts, setScannerContacts] = useState<ScannerContact[]>([]);
  const [scannerSystemId, setScannerSystemId] = useState<number | null>(null);
  const [scannerSystemName, setScannerSystemName] = useState<string | null>(null);
  const [, setScannerGenerationVersion] = useState<number | null>(null);
  const [scannerContactsLoading, setScannerContactsLoading] = useState(false);
  const [scannerContactsError, setScannerContactsError] = useState<string | null>(null);
  const [scannerSelectedContactId, setScannerSelectedContactId] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "";
    }

    try {
      return window.localStorage.getItem(SCANNER_SELECTED_CONTACT_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [scannerRangeKm, setScannerRangeKm] = useState<number>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SCANNER_RANGE_KM;
    }

    try {
      const storedRaw = window.localStorage.getItem(SCANNER_RANGE_STORAGE_KEY);
      if (!storedRaw) {
        return DEFAULT_SCANNER_RANGE_KM;
      }
      const parsed = Number(storedRaw);
      if (
        Number.isInteger(parsed)
        && SCANNER_RANGE_PRESETS_KM.includes(parsed as (typeof SCANNER_RANGE_PRESETS_KM)[number])
      ) {
        return parsed;
      }
      return DEFAULT_SCANNER_RANGE_KM;
    } catch {
      return DEFAULT_SCANNER_RANGE_KM;
    }
  });
  const [scannerLiveContacts, setScannerLiveContacts] = useState<ScannerLiveContact[]>([]);
  const [localChartData, setLocalChartData] = useState<LocalChartResponse | null>(null);
  const [localChartLoading, setLocalChartLoading] = useState(false);
  const [localChartError, setLocalChartError] = useState<string | null>(null);
  const [localChartLayers, setLocalChartLayers] = useState<Record<LocalChartLayerKey, boolean>>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_LOCAL_CHART_LAYERS;
    }

    try {
      const storedRaw = window.localStorage.getItem(LOCAL_CHART_LAYERS_STORAGE_KEY);
      if (!storedRaw) {
        return DEFAULT_LOCAL_CHART_LAYERS;
      }
      const parsed = JSON.parse(storedRaw) as Partial<Record<LocalChartLayerKey, boolean>>;
      return {
        star: typeof parsed.star === "boolean" ? parsed.star : true,
        planet: typeof parsed.planet === "boolean" ? parsed.planet : true,
        moon: typeof parsed.moon === "boolean" ? parsed.moon : true,
        station: typeof parsed.station === "boolean" ? parsed.station : true,
        ship: typeof parsed.ship === "boolean" ? parsed.ship : true,
      };
    } catch {
      return DEFAULT_LOCAL_CHART_LAYERS;
    }
  });
  const [localChartView, setLocalChartView] = useState<LocalChartViewPreferences>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_LOCAL_CHART_VIEW;
    }

    try {
      const storedRaw = window.localStorage.getItem(LOCAL_CHART_VIEW_STORAGE_KEY);
      if (!storedRaw) {
        return DEFAULT_LOCAL_CHART_VIEW;
      }
      const parsed = JSON.parse(storedRaw) as Partial<LocalChartViewPreferences>;
      const zoom = Number(parsed.zoom);
      const centerX = Number(parsed.center_x);
      const centerZ = Number(parsed.center_z);
      const yaw = Number(parsed.yaw_deg);
      const pitch = Number(parsed.pitch_deg);
      const scaleMode: SystemChartScaleMode = parsed.scale_mode === "linear"
        ? "linear"
        : "eased";

      return {
        zoom: Number.isFinite(zoom) && zoom > 0
          ? clampLocalChartZoom(zoom)
          : DEFAULT_LOCAL_CHART_VIEW.zoom,
        center_x: Number.isFinite(centerX) ? centerX : 0,
        center_z: Number.isFinite(centerZ) ? centerZ : 0,
        yaw_deg: Number.isFinite(yaw) ? Math.max(-180, Math.min(180, yaw)) : DEFAULT_LOCAL_CHART_VIEW.yaw_deg,
        pitch_deg: Number.isFinite(pitch) ? Math.max(-75, Math.min(75, pitch)) : DEFAULT_LOCAL_CHART_VIEW.pitch_deg,
        scale_mode: scaleMode,
      };
    } catch {
      return DEFAULT_LOCAL_CHART_VIEW;
    }
  });
  const [localChartSortState, setLocalChartSortState] = useState<LocalChartSortState>(() => {
    if (typeof window === "undefined") {
      return {
        key: "distance",
        direction: "asc",
      };
    }

    try {
      const storedRaw = window.localStorage.getItem(LOCAL_CHART_SORT_STORAGE_KEY);
      if (!storedRaw) {
        return {
          key: "distance",
          direction: "asc",
        };
      }

      const parsed = JSON.parse(storedRaw) as Partial<LocalChartSortState>;
      const key = parsed.key;
      const direction = parsed.direction;

      return {
        key:
          key === "distance"
            || key === "type"
            || key === "radius"
            || key === "name"
            ? key
            : "distance",
        direction: direction === "asc" || direction === "desc" ? direction : "asc",
      };
    } catch {
      return {
        key: "distance",
        direction: "asc",
      };
    }
  });
  const [cargoLoading, setCargoLoading] = useState(false);
  const [cargoError, setCargoError] = useState<string | null>(null);
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const [tradeStatus, setTradeStatus] = useState("Awaiting market data.");
  const [tradeLoading, setTradeLoading] = useState(false);
  const [showAuthMenu, setShowAuthMenu] = useState(false);
  const [showDeveloperTools, setShowDeveloperTools] = useState(false);
  const [activeMode, setActiveMode] = useState<GameMode>("trade");
  const [navigationView, setNavigationView] = useState<NavigationView>("system");
  const isNavigationMode = activeMode === "navigation";
  const isSystemModeActive = activeMode === "system"
    || (isNavigationMode && navigationView === "system");
  const isGalaxyModeActive = activeMode === "galaxy"
    || (isNavigationMode && navigationView === "galaxy");
  const isNavigationContextMode = isSystemModeActive || isGalaxyModeActive;
  const [systemChartObservability, setSystemChartObservability] = useState<SystemChartObservabilitySummary>({
    chartOpenCount: 0,
    syncSuccessCount: 0,
    syncFailureCount: 0,
    chartSyncSuccessCount: 0,
    chartSyncFailureCount: 0,
    renderBudgetBreachCount: 0,
    lastSyncSource: null,
    lastSyncReason: null,
    lastRenderDurationMs: null,
    lastRenderBudgetMs: null,
    lastEventAt: null,
  });
  const [systemChartObservabilityEvents, setSystemChartObservabilityEvents] =
    useState<SystemChartObservabilityEventLogEntry[]>([]);
  const [storySessions, setStorySessions] = useState<StorySessionItem[]>([]);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [selectedStorySessionId, setSelectedStorySessionId] = useState("");
  const [storyInput, setStoryInput] = useState("");
  const [storyInterpretation, setStoryInterpretation] = useState<string | null>(null);
  const [storyOutcome, setStoryOutcome] = useState<string | null>(null);
  const [storyActionLoading, setStoryActionLoading] = useState(false);
  const [missionsAvailable, setMissionsAvailable] = useState<MissionAvailableItem[]>([]);
  const [missionsAssigned, setMissionsAssigned] = useState<MissionAssignedItem[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(false);
  const [missionsError, setMissionsError] = useState<string | null>(null);
  const [missionStatus, setMissionStatus] = useState("Mission board idle.");
  const [missionStatusFilter, setMissionStatusFilter] = useState<MissionStatusFilter>("all");
  const [missionSortOrder, setMissionSortOrder] = useState<MissionSortOrder>("newest");
  const [creatingDummyMission, setCreatingDummyMission] = useState(false);
  const [acceptingMissionId, setAcceptingMissionId] = useState<number | null>(null);
  const [completingMissionId, setCompletingMissionId] = useState<number | null>(null);
  const [abandoningMissionId, setAbandoningMissionId] = useState<number | null>(null);
  const [commanderProfile, setCommanderProfile] = useState<CommanderProfile | null>(null);
  const [commanderLoading, setCommanderLoading] = useState(false);
  const [commanderError, setCommanderError] = useState<string | null>(null);
  const [marketSummary, setMarketSummary] = useState<MarketStationSummary[]>([]);
  const [marketSummaryLoading, setMarketSummaryLoading] = useState(false);
  const [marketSummaryError, setMarketSummaryError] = useState<string | null>(null);
  const [shipOpsLoading, setShipOpsLoading] = useState(false);
  const [shipOpsStatus, setShipOpsStatus] = useState("Ship operations idle.");
  const [dockStationId, setDockStationId] = useState("1");
  const [refuelAmount, setRefuelAmount] = useState("40");
  const [repairAmount, setRepairAmount] = useState("20");
  const [shieldRechargeAmount, setShieldRechargeAmount] = useState("30");
  const [energyRechargeAmount, setEnergyRechargeAmount] = useState("30");
  const [shipOperations, setShipOperations] = useState<ShipOperationLogEntry[]>([]);
  const [shipOperationsLoading, setShipOperationsLoading] = useState(false);
  const [shipOperationsError, setShipOperationsError] = useState<string | null>(null);
  const [shipOpsFilter, setShipOpsFilter] = useState<ShipOpsFilter>("all");
  const [marketTickSteps, setMarketTickSteps] = useState("1");
  const [marketTickLoading, setMarketTickLoading] = useState(false);
  const [marketTickStatus, setMarketTickStatus] = useState("Market tick idle.");
  const [simulateTicks, setSimulateTicks] = useState("0");
  const [adminLogs, setAdminLogs] = useState<AdminLogEntry[]>([]);
  const [adminLogsLoading, setAdminLogsLoading] = useState(false);
  const [adminLogsError, setAdminLogsError] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [adminUsersRoleEdits, setAdminUsersRoleEdits] = useState<Record<number, string>>({});
  const [adminUsersStatusEdits, setAdminUsersStatusEdits] = useState<Record<number, string>>({});
  const [adminUserSavingId, setAdminUserSavingId] = useState<number | null>(null);
  const [logsFollowEnabled, setLogsFollowEnabled] = useState(false);
  const [logsSinceCursor, setLogsSinceCursor] = useState<string | null>(null);
  const [logsTail, setLogsTail] = useState("100");
  const [logsContains, setLogsContains] = useState("");
  const [logsRegex, setLogsRegex] = useState("");
  const [logsLevel, setLogsLevel] = useState("ALL");
  const [commsChannels, setCommsChannels] = useState<CommsChannel[]>([]);
  const [commsSelectedChannelId, setCommsSelectedChannelId] = useState("");
  const [commsSelectedMessageId, setCommsSelectedMessageId] = useState("");
  const [commsMessages, setCommsMessages] = useState<Record<string, CommsMessage[]>>({});
  const [commsLoading, setCommsLoading] = useState(false);
  const [commsError, setCommsError] = useState<string | null>(null);
  const [commsDraft, setCommsDraft] = useState("");
  const [commsSending, setCommsSending] = useState(false);
  const [commsStatus, setCommsStatus] = useState("Comms relay idle.");
  const commsUnreadBaselineRef = useRef<number | null>(null);
  const [completedTrades, setCompletedTrades] = useState(0);
  const [completedJumps, setCompletedJumps] = useState(0);
  const [completedStoryActions, setCompletedStoryActions] = useState(0);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [flightWebglState, setFlightWebglState] = useState<
    "checking" | "supported" | "unsupported"
  >("checking");
  const [flightJumpPhase, setFlightJumpPhase] = useState<FlightJumpPhase>(FLIGHT_PHASE.IDLE);
  const [flightJumpProgress, setFlightJumpProgress] = useState(0);
  const [flightTransitStationLabel, setFlightTransitStationLabel] = useState<string | null>(null);
  const [flightDestinationLockedId, setFlightDestinationLockedId] = useState<number | null>(null);
  const [flightDestinationLockedContactId, setFlightDestinationLockedContactId] = useState<string | null>(null);
  const [flightJumpCooldownUntil, setFlightJumpCooldownUntil] = useState<number | null>(null);
  const [flightJumpCooldownSeconds, setFlightJumpCooldownSeconds] = useState(0);
  const [flightRenderProfile, setFlightRenderProfile] = useState<FlightRenderProfile>("balanced");
  const [showFlightSettings, setShowFlightSettings] = useState(false);
  const [showFlightContactLabels, setShowFlightContactLabels] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.localStorage.getItem(FLIGHT_CONTACT_LABELS_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [showFlightScannerDebug, setShowFlightScannerDebug] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.localStorage.getItem(FLIGHT_SCANNER_DEBUG_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [selectedJumpSystemId, setSelectedJumpSystemId] = useState("");
  const [galaxyChartViewMode, setGalaxyChartViewMode] =
    useState<GalaxyChartViewMode>("local_reachable");
  const [galaxyDatasetMode] =
    useState<GalaxyDatasetMode>("canonical");
  const [galaxyMapZoom, setGalaxyMapZoom] = useState(1);
  const [galaxyMapPanX, setGalaxyMapPanX] = useState(0);
  const [galaxyMapPanZ, setGalaxyMapPanZ] = useState(0);
  const [galaxySystems, setGalaxySystems] = useState<GalaxySystemEntry[]>([]);
  const [galaxySystemsLoading, setGalaxySystemsLoading] = useState(false);
  const [galaxySystemsError, setGalaxySystemsError] = useState<string | null>(null);
  const [galaxyCurrentSystemId, setGalaxyCurrentSystemId] = useState<number | null>(null);
  const [selectedGalaxySystemId, setSelectedGalaxySystemId] = useState("");
  const [galaxyMapLabelSystemId, setGalaxyMapLabelSystemId] = useState("");
  const [galaxySystemOverview, setGalaxySystemOverview] =
    useState<GalaxySystemOverviewResponse | null>(null);
  const [galaxySystemOverviewLoading, setGalaxySystemOverviewLoading] =
    useState(false);
  const [galaxySystemOverviewError, setGalaxySystemOverviewError] =
    useState<string | null>(null);
  const [flightSpeedUnits, setFlightSpeedUnits] = useState(0);
  const [flightRollDegrees, setFlightRollDegrees] = useState(0);
  const [flightDockingApproachTargetStationId, setFlightDockingApproachTargetStationId] =
    useState<number | null>(null);
  const [flightDockingApproachTargetContactId, setFlightDockingApproachTargetContactId] =
    useState<string | null>(null);
  const [flightLocalWaypointContactId, setFlightLocalWaypointContactId] =
    useState<string | null>(null);
  const [flightCollisionStatus, setFlightCollisionStatus] = useState("Collision monitor idle.");
  const [flightRecentImpacts, setFlightRecentImpacts] = useState<FlightImpactEntry[]>([]);
  const [flightAudioDispatchSummary, setFlightAudioDispatchSummary] =
    useState<FlightAudioDispatchSummary>({
      lastEvent: "none",
      dispatchedCount: 0,
      blockedCooldownCount: 0,
      blockedCategoryCapCount: 0,
      blockedSettingsCount: 0,
    });
  const [flightAudioPlaybackSummary, setFlightAudioPlaybackSummary] =
    useState<FlightAudioPlaybackSummary>({
      lastResult: "none",
      playedCount: 0,
      blockedSettingsCount: 0,
      blockedReducedCount: 0,
      unsupportedCount: 0,
      errorCount: 0,
    });
  const [flightAudioEnabled, setFlightAudioEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    try {
      return window.localStorage.getItem(FLIGHT_AUDIO_ENABLED_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [flightAudioEngine, setFlightAudioEngine] = useState<FlightAudioEngine>(() => {
    if (typeof window === "undefined") {
      return "media-audio";
    }

    try {
      const stored = window.localStorage.getItem(FLIGHT_AUDIO_ENGINE_STORAGE_KEY);
      return stored === "web-audio" || stored === "media-audio"
        ? stored
        : "media-audio";
    } catch {
      return "media-audio";
    }
  });
  const [reducedAudioPreferenceEnabled, setReducedAudioPreferenceEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.localStorage.getItem(FLIGHT_REDUCED_AUDIO_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [reducedMotionPreferenceEnabled, setReducedMotionPreferenceEnabled] = useState(false);
  const reducedAudioEnabled = useMemo(
    () => reducedMotionPreferenceEnabled || reducedAudioPreferenceEnabled,
    [reducedAudioPreferenceEnabled, reducedMotionPreferenceEnabled],
  );
  const systemChartRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const systemChartPointRefs = useRef<Record<string, SVGCircleElement | null>>({});
  const [flightImpactFlash, setFlightImpactFlash] = useState<"none" | "glancing" | "critical">("none");
  const [flightJumpCompletionVfx, setFlightJumpCompletionVfx] = useState<"none" | "flash" | "stabilize" | "reduced">("none");
  const [flightJumpVisualMode, setFlightJumpVisualMode] = useState<"none" | "hyperspace">("none");
  const [flightSceneResetKey, setFlightSceneResetKey] = useState(0);
  const [flightSpawnDirective, setFlightSpawnDirective] = useState<FlightSpawnDirective | null>(null);
  const collisionToastSignatureRef = useRef("");
  const collisionRecoveryInFlightRef = useRef(false);
  const dockingApproachCompletionInFlightRef = useRef(false);
  const dockingApproachLastProgressRef = useRef(-1);
  const dockingApproachLastDistanceRef = useRef(Number.NaN);
  const dockingContactResyncAttemptAtRef = useRef(0);
  const dockingContactResyncAttemptsRef = useRef(0);
  const flightTransitTimerRef = useRef<number | null>(null);
  const flightTransitPhaseLockUntilRef = useRef(0);
  const flightJumpPhaseLockUntilRef = useRef(0);
  const flightImpactFlashTimeoutRef = useRef<number | null>(null);
  const flightJumpCompletionVfxTimeoutRef = useRef<number | null>(null);
  const flightJumpCompletionClearTimeoutRef = useRef<number | null>(null);
  const flightJumpStabilizeAudioTimeoutRef = useRef<number | null>(null);
  const flightPositionSyncInFlightRef = useRef(false);
  const flightPositionSyncLastSentAtRef = useRef(0);
  const flightPositionSyncLastScannerRefreshAtRef = useRef(0);
  const flightPositionSyncLastCoordsRef = useRef<{
    x: number;
    y: number;
    z: number;
  } | null>(null);
  const authExpiredHandledRef = useRef(false);
  const activeProximityCollisionContactIdRef = useRef<string | null>(null);
  const systemChartOpenCountRef = useRef(0);
  const systemChartSyncSuccessCountRef = useRef(0);
  const systemChartSyncFailureCountRef = useRef(0);
  const previousActiveModeRef = useRef<GameMode>(activeMode);
  const previousNavigationViewRef = useRef<NavigationView>(navigationView);
  const autoFittedLocalChartSystemIdRef = useRef<number | null>(null);
  const localChartViewInteractedRef = useRef(false);
  const previousFlightSpeedUnitsRef = useRef(0);
  const previousFuelAlertLevelRef = useRef<FuelAlertLevel>("normal");
  const previousFuelAlertShipIdRef = useRef<number | null>(null);
  const localChartHintDispatchSignatureRef = useRef("");
  const flightAudioLastEventAtRef = useRef<Record<FlightAudioEventName, number>>({
    "nav.target_acquired": 0,
    "nav.target_locked": 0,
    "nav.invalid_action": 0,
    "nav.approach_ready": 0,
    "dock.transit_enter": 0,
    "dock.transit_exit": 0,
    "flight.throttle_accel": 0,
    "flight.throttle_decel": 0,
    "flight.motion_loop": 0,
    "jump.charge_start": 0,
    "jump.transit_peak": 0,
    "jump.hyperspace_charge_start": 0,
    "jump.hyperspace_transit_peak": 0,
    "jump.exit": 0,
    "jump.exit_stabilize": 0,
    "jump.hyperspace_exit": 0,
    "jump.hyperspace_exit_stabilize": 0,
  });
  const flightAudioCategoryWindowRef = useRef<Record<FlightAudioCategory, number[]>>({
    navigation: [],
    propulsion: [],
    jump: [],
    docking: [],
  });
  const systemChartDragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
    startCenterX: number;
    startCenterZ: number;
    panMode: boolean;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startYaw: DEFAULT_LOCAL_CHART_VIEW.yaw_deg,
    startPitch: DEFAULT_LOCAL_CHART_VIEW.pitch_deg,
    startCenterX: DEFAULT_LOCAL_CHART_VIEW.center_x,
    startCenterZ: DEFAULT_LOCAL_CHART_VIEW.center_z,
    panMode: false,
  });

  const emitSystemChartObservability = useCallback((
    eventName: string,
    payload: Record<string, unknown>,
  ): void => {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(new CustomEvent("elite:system-chart-observability", {
      detail: {
        event: eventName,
        timestamp: new Date().toISOString(),
        ...payload,
      },
    }));
  }, []);

  const dispatchFlightAudioEvent = useCallback((
    eventName: FlightAudioEventName,
    payload?: Record<string, unknown>,
  ): boolean => {
    if (typeof window === "undefined") {
      return false;
    }

    if (!flightAudioEnabled) {
      setFlightAudioDispatchSummary((current) => ({
        ...current,
        blockedSettingsCount: current.blockedSettingsCount + 1,
      }));
      return false;
    }

    if (
      reducedAudioEnabled
      && (
        eventName === "flight.motion_loop"
        || eventName === "flight.throttle_accel"
        || eventName === "flight.throttle_decel"
      )
    ) {
      setFlightAudioDispatchSummary((current) => ({
        ...current,
        blockedSettingsCount: current.blockedSettingsCount + 1,
      }));
      return false;
    }

    const now = Date.now();
    const cooldownMs = FLIGHT_AUDIO_EVENT_COOLDOWN_MS[eventName];
    const lastEventAt = flightAudioLastEventAtRef.current[eventName] || 0;
    if (now - lastEventAt < cooldownMs) {
      setFlightAudioDispatchSummary((current) => ({
        ...current,
        blockedCooldownCount: current.blockedCooldownCount + 1,
      }));
      return false;
    }

    const category = FLIGHT_AUDIO_EVENT_CATEGORY[eventName];
    const categoryWindow = flightAudioCategoryWindowRef.current[category] || [];
    const recentEvents = categoryWindow.filter(
      (timestamp) => now - timestamp <= FLIGHT_AUDIO_CATEGORY_WINDOW_MS,
    );
    if (recentEvents.length >= FLIGHT_AUDIO_CATEGORY_MAX_EVENTS[category]) {
      flightAudioCategoryWindowRef.current[category] = recentEvents;
      setFlightAudioDispatchSummary((current) => ({
        ...current,
        blockedCategoryCapCount: current.blockedCategoryCapCount + 1,
      }));
      return false;
    }

    recentEvents.push(now);
    flightAudioCategoryWindowRef.current[category] = recentEvents;
    flightAudioLastEventAtRef.current[eventName] = now;

    setFlightAudioDispatchSummary((current) => ({
      ...current,
      lastEvent: eventName,
      dispatchedCount: current.dispatchedCount + 1,
    }));

    try {
      window.dispatchEvent(new CustomEvent("elite:flight-audio-event", {
        detail: {
          event: eventName,
          category,
          timestamp: new Date().toISOString(),
          ...payload,
        },
      }));
      return true;
    } catch {
      return false;
    }
  }, [flightAudioEnabled, reducedAudioEnabled]);

  const flightAudioAdapter = useMemo(() => (
    new FlightAudioAdapter(
      () => ({
        audioEnabled: flightAudioEnabled,
        reducedAudioEnabled,
      }),
      createBrowserAudioContext,
    )
  ), [flightAudioEnabled, reducedAudioEnabled]);
  const mediaAudioDiagnosticWavUri = useMemo(
    () => createMediaDiagnosticWavDataUri(),
    [],
  );
  const mediaAudioCueUriByEvent = useMemo(
    () => Object.fromEntries(
      Object.entries(FLIGHT_MEDIA_AUDIO_CUE_MAP).map(([eventName, cue]) => [
        eventName,
        createMediaToneWavDataUri(
          cue.frequencyStartHz,
          cue.frequencyEndHz ?? cue.frequencyStartHz,
          cue.durationSeconds,
          cue.amplitude,
          cue.waveform,
        ),
      ]),
    ) as Record<FlightAudioEventName, string>,
    [],
  );

  const playFlightMediaAudioEvent = useCallback(async (
    eventName: FlightAudioEventName,
  ): Promise<FlightAudioPlaybackResult> => {
    if (!flightAudioEnabled) {
      return "blocked_settings";
    }

    if (reducedAudioEnabled && FLIGHT_MEDIA_REDUCED_AUDIO_EVENTS.has(eventName)) {
      return "blocked_reduced";
    }

    const toneUri = mediaAudioCueUriByEvent[eventName];
    if (!toneUri) {
      return "error";
    }

    try {
      const audio = new Audio(toneUri);
      audio.volume = 1;
      await audio.play();
      return "played";
    } catch {
      return "error";
    }
  }, [flightAudioEnabled, mediaAudioCueUriByEvent, reducedAudioEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onFlightAudioEvent = (event: Event): void => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      const parsedEventName = parseFlightAudioEventName(detail?.event);
      if (!parsedEventName) {
        return;
      }

      const applyPlaybackResult = (playbackResult: FlightAudioPlaybackResult): void => {
        setFlightAudioPlaybackSummary((current) => ({
          ...current,
          lastResult: playbackResult,
          playedCount: current.playedCount + (playbackResult === "played" ? 1 : 0),
          blockedSettingsCount:
            current.blockedSettingsCount + (playbackResult === "blocked_settings" ? 1 : 0),
          blockedReducedCount:
            current.blockedReducedCount + (playbackResult === "blocked_reduced" ? 1 : 0),
          unsupportedCount:
            current.unsupportedCount + (playbackResult === "unsupported" ? 1 : 0),
          errorCount: current.errorCount + (playbackResult === "error" ? 1 : 0),
        }));
      };

      if (flightAudioEngine === "media-audio") {
        void playFlightMediaAudioEvent(parsedEventName).then(applyPlaybackResult);
        return;
      }

      applyPlaybackResult(flightAudioAdapter.play(parsedEventName));
    };

    window.addEventListener("elite:flight-audio-event", onFlightAudioEvent as EventListener);

    return () => {
      window.removeEventListener("elite:flight-audio-event", onFlightAudioEvent as EventListener);
    };
  }, [flightAudioAdapter, flightAudioEngine, playFlightMediaAudioEvent]);

  const handleFlightAudioTest = useCallback(async (): Promise<void> => {
    if (!flightAudioEnabled) {
      const message = "Enable Audio Cues in Flight Settings first.";
      setShipOpsStatus(message);
      showToast({ message, variant: "warning" });
      return;
    }

    const primed = await flightAudioAdapter.primeAsync();
    if (!primed) {
      const message = "Audio context blocked by browser or device settings.";
      setShipOpsStatus(message);
      showToast({ message, variant: "warning" });
      return;
    }

    const playbackResult = flightAudioAdapter.playDiagnosticTone();
    const debugSnapshot = flightAudioAdapter.getDebugSnapshot();
    setFlightAudioPlaybackSummary((current) => ({
      ...current,
      lastResult: playbackResult,
      playedCount: current.playedCount + (playbackResult === "played" ? 1 : 0),
      blockedSettingsCount:
        current.blockedSettingsCount + (playbackResult === "blocked_settings" ? 1 : 0),
      blockedReducedCount:
        current.blockedReducedCount + (playbackResult === "blocked_reduced" ? 1 : 0),
      unsupportedCount:
        current.unsupportedCount + (playbackResult === "unsupported" ? 1 : 0),
      errorCount: current.errorCount + (playbackResult === "error" ? 1 : 0),
    }));

    const debugSummary = debugSnapshot.contextAvailable
      ? `context=${debugSnapshot.contextState} sampleRate=${debugSnapshot.sampleRate ?? "n/a"} baseLatency=${debugSnapshot.baseLatency ?? "n/a"} outputLatency=${debugSnapshot.outputLatency ?? "n/a"}`
      : "context=none";

    if (playbackResult === "played") {
      setShipOpsStatus(`Audio diagnostic tone played (${debugSummary}).`);
      showToast({ message: `Audio diagnostic tone played (${debugSummary}).`, variant: "success" });
      return;
    }

    const message = `Audio test unavailable (${playbackResult}; ${debugSummary}).`;
    setShipOpsStatus(message);
    showToast({ message, variant: "warning" });
  }, [flightAudioAdapter, flightAudioEnabled, showToast]);

  const handleFlightMediaAudioTest = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const diagnosticAudio = new Audio(mediaAudioDiagnosticWavUri);
      diagnosticAudio.volume = 1;
      await diagnosticAudio.play();
      const message = "Media audio diagnostic tone played.";
      setShipOpsStatus(message);
      showToast({ message, variant: "success" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      const message = `Media audio test unavailable (${reason}).`;
      setShipOpsStatus(message);
      showToast({ message, variant: "warning" });
    }
  }, [mediaAudioDiagnosticWavUri, showToast]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const primeAudio = (): void => {
      void flightAudioAdapter.primeAsync().then((isPrimed) => {
        if (!isPrimed) {
          return;
        }

        window.removeEventListener("pointerdown", primeAudio);
        window.removeEventListener("keydown", primeAudio);
        window.removeEventListener("touchstart", primeAudio);
      });
    };

    window.addEventListener("pointerdown", primeAudio);
    window.addEventListener("keydown", primeAudio);
    window.addEventListener("touchstart", primeAudio);

    return () => {
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
      window.removeEventListener("touchstart", primeAudio);
    };
  }, [flightAudioAdapter]);

  const handleUnauthorizedResponse = useCallback((message?: string): void => {
    if (!token || authExpiredHandledRef.current) {
      return;
    }

    authExpiredHandledRef.current = true;
    setToken(null);
    setUserId(null);
    window.localStorage.removeItem("elite_token");
    window.localStorage.removeItem("elite_user_id");
    window.localStorage.removeItem(ACTIVE_MODE_STORAGE_KEY);
    setShowAuthMenu(false);
    setShowDeveloperTools(false);
    setActiveMode("trade");
    setStatus(message ?? "Session expired. Please log in again.");
    showToast({
      message: message ?? "Session expired. Please log in again.",
      variant: "warning",
    });
  }, [showToast, token]);

  useEffect(() => {
    if (token) {
      authExpiredHandledRef.current = false;
    }
  }, [token]);

  const recordSystemChartSelectionSync = useCallback((
    source: SelectionSyncSource,
    success: boolean,
    contactId: string,
    reason?: string,
  ): void => {
    if (success) {
      systemChartSyncSuccessCountRef.current += 1;
    } else {
      systemChartSyncFailureCountRef.current += 1;
    }

    emitSystemChartObservability("selection-sync", {
      source,
      success,
      contactId,
      reason,
      successCount: systemChartSyncSuccessCountRef.current,
      failureCount: systemChartSyncFailureCountRef.current,
    });
  }, [emitSystemChartObservability]);

  const logScannerSelection = useCallback((
    source: SelectionSyncSource,
    contactId: string,
    contacts: ScannerContact[],
  ): void => {
    if (source !== "scanner-hud-blip" && source !== "scanner-hud-list") {
      return;
    }
    if (!token) {
      return;
    }
    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      return;
    }

    const selectedContact = contacts.find((contact) => contact.id === contactId);
    if (!selectedContact) {
      return;
    }

    const prioritizedContactIds = [
      contactId,
      ...contacts.filter((contact) => contact.id !== contactId).map((contact) => contact.id),
    ];
    const visibleContactIds = prioritizedContactIds.slice(0, SCANNER_LIST_MAX_ROWS);

    void fetch(`${API_BASE}/api/ships/${parsedShipId}/scanner-selection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        selected_contact_id: selectedContact.id,
        selected_contact_name: selectedContact.name,
        selected_contact_type: selectedContact.contact_type,
        source,
        visible_contact_ids: visibleContactIds,
        total_contacts: contacts.length,
        visible_contacts_count: visibleContactIds.length,
      }),
    }).catch(() => {
      return undefined;
    });
  }, [shipId, token]);

  const selectScannerContactWithSource = useCallback((
    contactId: string,
    source: SelectionSyncSource,
    contactsOverride?: ScannerContact[],
  ): boolean => {
    const contacts = contactsOverride ?? scannerContacts;
    const scannerContact = contacts.find((contact) => contact.id === contactId) ?? null;
    const chartContactType = resolveLocalChartContactType(localChartData, contactId);

    const hasContact = scannerContact !== null || chartContactType !== null;
    if (!hasContact) {
      recordSystemChartSelectionSync(source, false, contactId, "contact-not-found");
      return false;
    }

    setScannerSelectedContactId(contactId);
    recordSystemChartSelectionSync(source, true, contactId);
    logScannerSelection(source, contactId, contacts);

    if (source !== "scanner-refresh") {
      dispatchFlightAudioEvent("nav.target_acquired", {
        source,
        contact_id: contactId,
        contact_type: scannerContact?.contact_type ?? chartContactType ?? "unknown",
      });
    }

    return true;
  }, [
    dispatchFlightAudioEvent,
    localChartData,
    logScannerSelection,
    recordSystemChartSelectionSync,
    scannerContacts,
  ]);

  const syncFlightStateFromShipTelemetry = useCallback(
    (telemetry: Partial<ShipTelemetry> | null | undefined): void => {
      const serverPhase = telemetry?.flight_phase;
      const parsedServerPhase = parseFlightJumpPhase(serverPhase);
      const lockActive = (
        Date.now() < flightTransitPhaseLockUntilRef.current
        || Date.now() < flightJumpPhaseLockUntilRef.current
      );
      if (parsedServerPhase && !lockActive) {
        setFlightJumpPhase(parsedServerPhase);
      }

      const lockedId = telemetry?.flight_locked_destination_station_id;
      if (typeof lockedId === "number" && lockedId > 0) {
        setFlightDestinationLockedId(lockedId);
      } else if (lockedId === null) {
        setFlightDestinationLockedId(null);
      }

      const lockedContactType = telemetry?.flight_locked_destination_contact_type;
      const lockedContactId = telemetry?.flight_locked_destination_contact_id;
      if (
        (lockedContactType === "station"
          || lockedContactType === "planet"
          || lockedContactType === "moon"
          || lockedContactType === "star")
        && typeof lockedContactId === "number"
        && lockedContactId > 0
      ) {
        setFlightDestinationLockedContactId(`${lockedContactType}-${lockedContactId}`);
      } else if (lockedContactType === null || lockedContactId === null) {
        setFlightDestinationLockedContactId(null);
      } else if (typeof lockedId === "number" && lockedId > 0) {
        setFlightDestinationLockedContactId(`station-${lockedId}`);
      }
    },
    [],
  );

  const syncJumpCooldownFromShipTelemetry = useCallback(
    (telemetry: Partial<ShipTelemetry> | null | undefined): void => {
      const cooldownUntilRaw = telemetry?.jump_cooldown_until;
      if (typeof cooldownUntilRaw === "string" && cooldownUntilRaw.trim()) {
        const cooldownUntilMs = Date.parse(cooldownUntilRaw);
        if (Number.isFinite(cooldownUntilMs) && cooldownUntilMs > Date.now()) {
          setFlightJumpCooldownUntil(cooldownUntilMs);
          return;
        }
      }

      const cooldownSeconds = telemetry?.jump_cooldown_seconds;
      if (typeof cooldownSeconds === "number" && cooldownSeconds > 0) {
        setFlightJumpCooldownUntil(Date.now() + (cooldownSeconds * 1000));
        return;
      }

      setFlightJumpCooldownUntil(null);
    },
    [],
  );

  const persistFlightState = useCallback(
    async (
      phase: FlightJumpPhase,
      lockedDestinationStationId: number | null,
      lockedDestinationContactId: string | null = null,
    ): Promise<void> => {
      if (!token) {
        return;
      }

      const parsedShipId = Number(shipId);
      if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
        return;
      }

      try {
        const parsedLockedContact = lockedDestinationContactId
          ? parseLocalTargetContactId(lockedDestinationContactId)
          : null;
        const contactType = parsedLockedContact?.contactType || null;
        const contactId = parsedLockedContact?.contactId ?? null;
        const stationId = lockedDestinationStationId
          ?? (contactType === "station" ? contactId : null);
        const response = await fetch(`${API_BASE}/api/ships/${parsedShipId}/flight-state`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            flight_phase: phase,
            flight_locked_destination_station_id: stationId,
            flight_locked_destination_contact_type: contactType,
            flight_locked_destination_contact_id: contactId,
          }),
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        setShipTelemetry(data);
        syncJumpCooldownFromShipTelemetry(data);
        syncFlightStateFromShipTelemetry(data);
      } catch { }
    },
    [
      shipId,
      syncFlightStateFromShipTelemetry,
      syncJumpCooldownFromShipTelemetry,
      token,
    ],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem("elite_token");
    const storedUser = window.localStorage.getItem("elite_user_id");
    const storedDevTools = window.localStorage.getItem(DEV_TOOLS_STORAGE_KEY);
    const storedMissionFilter = window.localStorage.getItem(MISSION_FILTER_STORAGE_KEY);
    const storedMissionSort = window.localStorage.getItem(MISSION_SORT_STORAGE_KEY);
    const storedActiveMode = window.localStorage.getItem(ACTIVE_MODE_STORAGE_KEY);
    const storedNavigationView = window.localStorage.getItem(NAVIGATION_VIEW_STORAGE_KEY);
    if (stored) {
      setToken(stored);
    }
    if (storedUser) {
      setUserId(Number(storedUser));
    }
    if (storedDevTools === "1") {
      setShowDeveloperTools(true);
    }
    if (
      storedMissionFilter === "all"
      || storedMissionFilter === "accepted"
      || storedMissionFilter === "completed"
      || storedMissionFilter === "abandoned"
    ) {
      setMissionStatusFilter(storedMissionFilter);
    }
    if (storedMissionSort === "newest" || storedMissionSort === "oldest") {
      setMissionSortOrder(storedMissionSort);
    }
    if (storedNavigationView === "system" || storedNavigationView === "galaxy") {
      setNavigationView(storedNavigationView);
    }
    if (
      storedActiveMode === "trade"
      || storedActiveMode === "flight"
      || storedActiveMode === "ship"
      || storedActiveMode === "story"
      || storedActiveMode === "comms"
      || storedActiveMode === "navigation"
      || storedActiveMode === "system"
      || storedActiveMode === "galaxy"
    ) {
      if (storedActiveMode === "system" || storedActiveMode === "galaxy") {
        setNavigationView(storedActiveMode);
        setActiveMode("navigation");
      } else {
        setActiveMode(storedActiveMode);
      }
    }

    setAuthStateHydrated(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      DEV_TOOLS_STORAGE_KEY,
      showDeveloperTools ? "1" : "0"
    );
  }, [showDeveloperTools]);

  useEffect(() => {
    if (!FLIGHT_3D_ENABLED) {
      setFlightWebglState("unsupported");
      return;
    }

    const canvas = document.createElement("canvas");
    const hasWebgl = Boolean(
      canvas.getContext("webgl2")
      || canvas.getContext("webgl")
      || canvas.getContext("experimental-webgl")
    );
    setFlightWebglState(hasWebgl ? "supported" : "unsupported");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotionPreferenceEnabled(query.matches);
    };

    update();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => {
        query.removeEventListener("change", update);
      };
    }

    query.addListener(update);
    return () => {
      query.removeListener(update);
    };
  }, []);

  useEffect(() => {
    if (!flightJumpCooldownUntil) {
      setFlightJumpCooldownSeconds(0);
      return;
    }

    const updateRemaining = (): void => {
      const remainingMs = flightJumpCooldownUntil - Date.now();
      if (remainingMs <= 0) {
        setFlightJumpCooldownUntil(null);
        setFlightJumpCooldownSeconds(0);
        return;
      }
      setFlightJumpCooldownSeconds(Math.ceil(remainingMs / 1000));
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 250);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [flightJumpCooldownUntil]);

  useEffect(() => {
    window.localStorage.setItem(MISSION_FILTER_STORAGE_KEY, missionStatusFilter);
  }, [missionStatusFilter]);

  useEffect(() => {
    window.localStorage.setItem(MISSION_SORT_STORAGE_KEY, missionSortOrder);
  }, [missionSortOrder]);

  useEffect(() => {
    if (!token) {
      return;
    }
    window.localStorage.setItem(ACTIVE_MODE_STORAGE_KEY, activeMode);
  }, [activeMode, token]);

  useEffect(() => {
    window.localStorage.setItem(NAVIGATION_VIEW_STORAGE_KEY, navigationView);
  }, [navigationView]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNow(new Date());
    }, 1000 * 30);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const canSubmit = useMemo(() => {
    if (!email || !password) return false;
    if (mode === "register" && !username) return false;
    return !loading;
  }, [email, password, username, mode, loading]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setStatus("Contacting station control...");

    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload =
      mode === "register"
        ? { email, username, password }
        : { email, password };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Auth failed.";
        setStatus(message);
        showToast({ message, variant: "error" });
        setLoading(false);
        return;
      }

      setToken(data.token);
      setUserId(data.user_id);
      window.localStorage.setItem("elite_token", data.token);
      window.localStorage.setItem("elite_user_id", String(data.user_id));
      setStatus("Docking sequence green. Token stored.");
      showToast({ message: "Authentication successful.", variant: "success" });
    } catch {
      setStatus("Network failure. Check API availability.");
      showToast({ message: "Network failure. Check API availability.", variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  function handleLogout(options?: {
    silentToast?: boolean;
    statusMessage?: string;
  }): void {
    setToken(null);
    setUserId(null);
    window.localStorage.removeItem("elite_token");
    window.localStorage.removeItem("elite_user_id");
    window.localStorage.removeItem(DEV_TOOLS_STORAGE_KEY);
    window.localStorage.removeItem(ACTIVE_MODE_STORAGE_KEY);
    setStatus(options?.statusMessage ?? "Login required to access market.");
    if (!options?.silentToast) {
      showToast({ message: "Logged out. Login required to access market.", variant: "info" });
    }
    setShowAuthMenu(false);
    setShowDeveloperTools(false);
    setActiveMode("trade");
    setShipCargo(null);
    setShipTelemetry(null);
    setShipTelemetryLoading(false);
    setShipTelemetryError(null);
    setStorySessions([]);
    setSelectedStorySessionId("");
    setStoryInput("");
    setStoryInterpretation(null);
    setStoryOutcome(null);
    setMissionsAvailable([]);
    setMissionsAssigned([]);
    setMissionsLoading(false);
    setMissionsError(null);
    setMissionStatus("Mission board idle.");
    setMissionStatusFilter("all");
    setMissionSortOrder("newest");
    setCreatingDummyMission(false);
    setAcceptingMissionId(null);
    setCompletingMissionId(null);
    setAbandoningMissionId(null);
    setStationOptions([]);
    setCommanderProfile(null);
    setMarketSummary([]);
    setMarketSummaryError(null);
    setCommsChannels([]);
    setCommsSelectedChannelId("");
    setCommsSelectedMessageId("");
    setCommsMessages({});
    setCommsLoading(false);
    setCommsError(null);
    setCommsDraft("");
    setCommsSending(false);
    setCommsStatus("Comms relay idle.");
    commsUnreadBaselineRef.current = null;
    setCompletedTrades(0);
    setCompletedJumps(0);
    setCompletedStoryActions(0);
    setFlightCollisionStatus("Collision monitor idle.");
    setFlightRecentImpacts([]);
    collisionToastSignatureRef.current = "";
    authExpiredHandledRef.current = false;
  }

  const handleSwitchAccount = () => {
    handleLogout();
    setMode("login");
    setPassword("");
  };

  const fetchInventory = useCallback(async (options?: { silent?: boolean; stationIdOverride?: string }) => {
    const targetStationId = (options?.stationIdOverride ?? stationId).trim();
    if (!targetStationId) return;
    setInventoryLoading(true);
    setInventoryError(null);
    if (!options?.silent) {
      setTradeStatus("Polling station market feed...");
    }
    try {
      const response = await fetch(
        `${API_BASE}/api/stations/${targetStationId}/inventory`,
        {
          headers: token
            ? { Authorization: `Bearer ${token}` }
            : undefined,
        }
      );
      const data = await response.json();
      if (!response.ok) {
        const message =
          data?.error?.message || data?.detail || "Inventory unavailable.";
        if (!options?.silent) {
          setTradeStatus(message);
          showToast({
            message,
            variant: "error",
            actionLabel: "Retry",
            onAction: () => {
              void fetchInventory({ silent: false });
            },
          });
        }
        setInventoryError(message);
        setInventory([]);
        return;
      }
      setInventory(data);
      if (data.length && selectedCommodity === null) {
        setSelectedCommodity(data[0].commodity_id);
      }
      if (!options?.silent) {
        setTradeStatus("Market data locked.");
      }
    } catch {
      setInventoryError("Market uplink failed.");
      if (!options?.silent) {
        setTradeStatus("Market uplink failed.");
        showToast({
          message: "Market uplink failed.",
          variant: "error",
          actionLabel: "Retry",
          onAction: () => {
            void fetchInventory({ silent: false });
          },
        });
      }
      setInventory([]);
    } finally {
      setInventoryLoading(false);
    }
  }, [selectedCommodity, showToast, stationId, token]);

  const fetchStations = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/stations`);
      const data = await response.json();
      if (!response.ok) {
        showToast({
          message: "Unable to load stations.",
          variant: "warning",
          actionLabel: "Retry",
          onAction: () => {
            void fetchStations();
          },
        });
        return;
      }
      setStationOptions(data);
      if (data.length) {
        const currentDockStationId = Number(dockStationId);
        const dockStation = data.find((station: StationOption) => station.id === currentDockStationId);
        const initialStation = dockStation ?? data[0];
        setSelectedJumpSystemId(String(initialStation.system_id));
        if (!dockStation) {
          setDockStationId(String(initialStation.id));
        }
      }
      if (data.length && !data.some((station: StationOption) => String(station.id) === stationId)) {
        setStationId(String(data[0].id));
      }
    } catch {
      setStationOptions([]);
      showToast({
        message: "Unable to load stations.",
        variant: "warning",
        actionLabel: "Retry",
        onAction: () => {
          void fetchStations();
        },
      });
    }
  }, [dockStationId, showToast, stationId]);

  const fetchStorySessions = useCallback(async () => {
    if (!token) return;
    setStoryLoading(true);
    setStoryError(null);
    try {
      const response = await fetch(`${API_BASE}/api/story/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        handleUnauthorizedResponse("Session expired while loading story sessions.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setStorySessions([]);
        setStoryError("Unable to load story sessions.");
        showToast({
          message: "Unable to load story sessions.",
          variant: "warning",
          actionLabel: "Retry",
          onAction: () => {
            void fetchStorySessions();
          },
        });
        return;
      }
      setStorySessions(data);
      if (data.length && !data.some((session: StorySessionItem) => String(session.id) === selectedStorySessionId)) {
        setSelectedStorySessionId(String(data[0].id));
      }
    } catch {
      setStorySessions([]);
      setStoryError("Unable to load story sessions.");
      showToast({
        message: "Unable to load story sessions.",
        variant: "warning",
        actionLabel: "Retry",
        onAction: () => {
          void fetchStorySessions();
        },
      });
    } finally {
      setStoryLoading(false);
    }
  }, [handleUnauthorizedResponse, selectedStorySessionId, showToast, token]);

  const handleStoryInterpret = async () => {
    if (!token) return;
    const sessionId = Number(selectedStorySessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      showToast({ message: "Select a story session first.", variant: "warning" });
      return;
    }
    if (!storyInput.trim()) {
      showToast({ message: "Enter a story action to interpret.", variant: "warning" });
      return;
    }

    setStoryActionLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/story/interpret`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          player_input: storyInput,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || "Unable to interpret story action.";
        showToast({ message, variant: "error" });
        return;
      }
      setStoryInterpretation(data.interpretation);
      setStoryOutcome(null);
    } catch {
      showToast({ message: "Unable to interpret story action.", variant: "error" });
    } finally {
      setStoryActionLoading(false);
    }
  };

  const handleStoryConfirm = async (confirmAction: boolean) => {
    if (!token) return;
    const sessionId = Number(selectedStorySessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      showToast({ message: "Select a story session first.", variant: "warning" });
      return;
    }

    setStoryActionLoading(true);
    try {
      const confirmResponse = await fetch(`${API_BASE}/api/story/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, confirm: confirmAction }),
      });
      const confirmData = await confirmResponse.json();
      if (!confirmResponse.ok) {
        const message = confirmData?.error?.message || "Unable to confirm story action.";
        showToast({ message, variant: "error" });
        return;
      }

      if (!confirmAction) {
        setStoryInterpretation(null);
        setStoryOutcome("Action cancelled.");
        return;
      }

      const proceedResponse = await fetch(`${API_BASE}/api/story/proceed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, confirm: true }),
      });
      const proceedData = await proceedResponse.json();
      if (!proceedResponse.ok) {
        const message = proceedData?.error?.message || "Unable to proceed story action.";
        showToast({ message, variant: "error" });
        return;
      }

      setStoryInterpretation(null);
      setStoryOutcome(`${proceedData.outcome} (${proceedData.next_state})`);
      setCompletedStoryActions((previous) => previous + 1);
      showToast({ message: "Story action applied.", variant: "success" });
      void fetchStorySessions();
    } catch {
      showToast({ message: "Unable to apply story action.", variant: "error" });
    } finally {
      setStoryActionLoading(false);
    }
  };

  const fetchCommanderProfile = useCallback(async () => {
    if (!token) return;
    setCommanderLoading(true);
    setCommanderError(null);
    try {
      const response = await fetch(`${API_BASE}/api/players/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        handleUnauthorizedResponse("Session expired while loading commander state.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || "Unable to load commander state.";
        setCommanderProfile(null);
        setCommanderError(message);
        return;
      }
      setCommanderProfile(data);
    } catch {
      setCommanderProfile(null);
      setCommanderError("Unable to load commander state.");
    } finally {
      setCommanderLoading(false);
    }
  }, [handleUnauthorizedResponse, token]);

  const handleStoryStart = async () => {
    if (!token || !stationId.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/api/story/start/${stationId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        showToast({
          message: "Unable to start story session.",
          variant: "error",
          actionLabel: "Retry",
          onAction: () => {
            void handleStoryStart();
          },
        });
        return;
      }
      await fetchStorySessions();
      setStatus("Story session started.");
      showToast({ message: "Story session started.", variant: "success" });
    } catch {
      setStatus("Unable to start story session.");
      showToast({
        message: "Unable to start story session.",
        variant: "error",
        actionLabel: "Retry",
        onAction: () => {
          void handleStoryStart();
        },
      });
    }
  };

  const fetchShipCargo = useCallback(async (options?: { silent?: boolean }) => {
    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setShipCargo(null);
      setCargoError("Ship ID must be a valid positive number.");
      return;
    }

    setCargoLoading(true);
    setCargoError(null);
    try {
      const response = await fetch(`${API_BASE}/api/ships/${parsedShipId}/cargo`);
      const data = await response.json();
      if (!response.ok) {
        const message =
          data?.error?.message || data?.detail || "Cargo unavailable.";
        if (!options?.silent) {
          setTradeStatus(message);
          showToast({
            message,
            variant: "warning",
            actionLabel: "Retry",
            onAction: () => {
              void fetchShipCargo({ silent: false });
            },
          });
        }
        setCargoError(message);
        setShipCargo(null);
        return;
      }
      setShipCargo(data);
    } catch {
      setCargoError("Cargo uplink failed.");
      if (!options?.silent) {
        setTradeStatus("Cargo uplink failed.");
        showToast({
          message: "Cargo uplink failed.",
          variant: "error",
          actionLabel: "Retry",
          onAction: () => {
            void fetchShipCargo({ silent: false });
          },
        });
      }
      setShipCargo(null);
    } finally {
      setCargoLoading(false);
    }
  }, [shipId, showToast]);

  const fetchShipTelemetry = useCallback(async (options?: { silent?: boolean }) => {
    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setShipTelemetry(null);
      setShipTelemetryError("Ship ID must be a valid positive number.");
      return;
    }

    setShipTelemetryLoading(true);
    setShipTelemetryError(null);
    try {
      const response = await fetch(`${API_BASE}/api/ships/${parsedShipId}`, {
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : undefined,
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Ship telemetry unavailable.";
        if (!options?.silent) {
          showToast({ message, variant: "warning" });
        }
        setShipTelemetry(null);
        setShipTelemetryError(message);
        return;
      }
      setShipTelemetry(data);
      syncJumpCooldownFromShipTelemetry(data);
      syncFlightStateFromShipTelemetry(data);
    } catch {
      const message = "Ship telemetry unavailable.";
      if (!options?.silent) {
        showToast({ message, variant: "warning" });
      }
      setShipTelemetry(null);
      setShipTelemetryError(message);
    } finally {
      setShipTelemetryLoading(false);
    }
  }, [
    shipId,
    showToast,
    syncFlightStateFromShipTelemetry,
    syncJumpCooldownFromShipTelemetry,
    token,
  ]);

  const updateLocalTargetIntent = useCallback(async (
    action: "lock" | "transfer" | "clear",
    contactId: string | null,
  ): Promise<ShipTelemetry | null> => {
    if (!token) {
      return null;
    }

    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      return null;
    }

    const parsedContact = contactId ? parseLocalTargetContactId(contactId) : null;
    if (action !== "clear" && !parsedContact) {
      return null;
    }

    try {
      const response = await fetch(`${API_BASE}/api/ships/${parsedShipId}/local-target`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          contact_type: parsedContact?.contactType ?? null,
          contact_id: parsedContact?.contactId ?? null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        return null;
      }
      const typedTelemetry = data as ShipTelemetry;
      setShipTelemetry(typedTelemetry);
      syncJumpCooldownFromShipTelemetry(typedTelemetry);
      syncFlightStateFromShipTelemetry(typedTelemetry);
      return typedTelemetry;
    } catch {
      return null;
    }
  }, [
    shipId,
    syncFlightStateFromShipTelemetry,
    syncJumpCooldownFromShipTelemetry,
    token,
  ]);

  const fetchScannerContacts = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) {
      setScannerContacts([]);
      setScannerSystemId(null);
      setScannerSystemName(null);
      setScannerGenerationVersion(null);
      setScannerContactsError(null);
      setScannerSelectedContactId("");
      setScannerLiveContacts([]);
      setLocalChartData(null);
      setLocalChartError(null);
      return;
    }

    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setScannerContacts([]);
      setScannerSystemId(null);
      setScannerSystemName(null);
      setScannerGenerationVersion(null);
      setScannerContactsError("Ship ID must be a valid positive number.");
      setScannerSelectedContactId("");
      setScannerLiveContacts([]);
      setLocalChartData(null);
      setLocalChartError(null);
      return;
    }

    setScannerContactsLoading(true);
    setScannerContactsError(null);
    try {
      const response = await fetch(`${API_BASE}/api/ships/${parsedShipId}/local-contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Scanner contacts unavailable.";
        setScannerContacts([]);
        setScannerSystemId(null);
        setScannerSystemName(null);
        setScannerGenerationVersion(null);
        setScannerContactsError(message);
        setScannerLiveContacts([]);
        setLocalChartData(null);
        setLocalChartError(null);
        if (!options?.silent) {
          showToast({ message, variant: "warning" });
        }
        return;
      }

      const payload = data as ScannerContactsResponse;
      const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
      setScannerContacts(contacts);
      setScannerLiveContacts([]);
      setScannerSystemId(Number.isInteger(payload.system_id) ? payload.system_id : null);
      setScannerSystemName(payload.system_name || null);
      setScannerGenerationVersion(
        Number.isInteger(payload.generation_version) ? payload.generation_version : null,
      );
      setScannerSelectedContactId((current) => {
        if (
          current
          && (
            contacts.some((contact) => contact.id === current)
            || resolveLocalChartContactType(localChartData, current) !== null
          )
        ) {
          return current;
        }

        const fallbackContactId = contacts[0]?.id ?? "";
        if (fallbackContactId) {
          recordSystemChartSelectionSync("scanner-refresh", true, fallbackContactId);
        } else if (current) {
          recordSystemChartSelectionSync("scanner-refresh", false, current, "no-contacts");
        }
        return fallbackContactId;
      });
    } catch {
      const message = "Scanner contacts unavailable.";
      setScannerContacts([]);
      setScannerSystemId(null);
      setScannerSystemName(null);
      setScannerGenerationVersion(null);
      setScannerContactsError(message);
      setScannerLiveContacts([]);
      setLocalChartData(null);
      setLocalChartError(null);
      if (!options?.silent) {
        showToast({ message, variant: "warning" });
      }
    } finally {
      setScannerContactsLoading(false);
    }
  }, [
    localChartData,
    recordSystemChartSelectionSync,
    shipId,
    showToast,
    token,
  ]);

  const fetchLocalChart = useCallback(async (
    systemId: number,
    options?: { silent?: boolean },
  ) => {
    if (!token || !Number.isInteger(systemId) || systemId <= 0) {
      setLocalChartData(null);
      setLocalChartError(null);
      return;
    }

    setLocalChartLoading(true);
    setLocalChartError(null);
    try {
      const response = await fetch(`${API_BASE}/api/systems/${systemId}/local-chart`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Local chart unavailable.";
        setLocalChartData(null);
        setLocalChartError(message);
        emitSystemChartObservability("chart-sync", {
          systemId,
          success: false,
          reason: message,
          rowCount: 0,
        });
        if (!options?.silent) {
          showToast({ message, variant: "warning" });
        }
        return;
      }

      const chartPayload = normalizeLocalChartPayload(data as LocalChartResponse);
      setLocalChartData(chartPayload);
      emitSystemChartObservability("chart-sync", {
        systemId,
        success: true,
        rowCount: countLocalChartRows(chartPayload),
      });
    } catch {
      const message = "Local chart unavailable.";
      setLocalChartData(null);
      setLocalChartError(message);
      emitSystemChartObservability("chart-sync", {
        systemId,
        success: false,
        reason: message,
        rowCount: 0,
      });
      if (!options?.silent) {
        showToast({ message, variant: "warning" });
      }
    } finally {
      setLocalChartLoading(false);
    }
  }, [emitSystemChartObservability, showToast, token]);

  const fetchGalaxySystems = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) {
      setGalaxySystems([]);
      setGalaxySystemsError(null);
      return;
    }

    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setGalaxySystems([]);
      setGalaxySystemsError("Ship ID must be a valid positive number.");
      return;
    }

    setGalaxySystemsLoading(true);
    setGalaxySystemsError(null);
    try {
      const params = new URLSearchParams({
        ship_id: String(parsedShipId),
        view_mode: galaxyChartViewMode,
      });
      if (galaxyDatasetMode !== "canonical") {
        params.set("dataset_mode", galaxyDatasetMode);
      }
      const response = await fetch(
        `${API_BASE}/api/systems/galaxy/systems?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Galaxy chart unavailable.";
        setGalaxySystems([]);
        setGalaxySystemsError(message);
        if (!options?.silent) {
          showToast({ message, variant: "warning" });
        }
        return;
      }

      const payload = data as GalaxySystemsResponse;
      const systems = Array.isArray(payload.systems) ? payload.systems : [];
      const currentSystemId = Number.isInteger(payload.current_system_id)
        ? payload.current_system_id
        : null;
      setGalaxyCurrentSystemId(currentSystemId);
      setGalaxySystems(systems);
      setSelectedGalaxySystemId((current) => {
        if (current && systems.some((entry) => String(entry.system_id) === current)) {
          return current;
        }
        if (currentSystemId !== null) {
          const currentSystemIdString = String(currentSystemId);
          if (systems.some((entry) => String(entry.system_id) === currentSystemIdString)) {
            return currentSystemIdString;
          }
        }
        return systems[0] ? String(systems[0].system_id) : "";
      });
    } catch {
      const message = "Galaxy chart unavailable.";
      setGalaxySystems([]);
      setGalaxySystemsError(message);
      if (!options?.silent) {
        showToast({ message, variant: "warning" });
      }
    } finally {
      setGalaxySystemsLoading(false);
    }
  }, [galaxyChartViewMode, galaxyDatasetMode, shipId, showToast, token]);

  const fetchGalaxySystemOverview = useCallback(async (
    systemId: number,
    options?: { silent?: boolean },
  ) => {
    if (!token || !Number.isInteger(systemId) || systemId <= 0) {
      setGalaxySystemOverview(null);
      setGalaxySystemOverviewError(null);
      return;
    }

    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setGalaxySystemOverview(null);
      setGalaxySystemOverviewError("Ship ID must be a valid positive number.");
      return;
    }

    setGalaxySystemOverviewLoading(true);
    setGalaxySystemOverviewError(null);
    try {
      const params = new URLSearchParams({ ship_id: String(parsedShipId) });
      if (galaxyDatasetMode !== "canonical") {
        params.set("dataset_mode", galaxyDatasetMode);
      }
      const response = await fetch(
        `${API_BASE}/api/systems/galaxy/systems/${systemId}/overview?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "System overview unavailable.";
        setGalaxySystemOverview(null);
        setGalaxySystemOverviewError(message);
        if (!options?.silent) {
          showToast({ message, variant: "warning" });
        }
        return;
      }

      setGalaxySystemOverview(data as GalaxySystemOverviewResponse);
    } catch {
      const message = "System overview unavailable.";
      setGalaxySystemOverview(null);
      setGalaxySystemOverviewError(message);
      if (!options?.silent) {
        showToast({ message, variant: "warning" });
      }
    } finally {
      setGalaxySystemOverviewLoading(false);
    }
  }, [galaxyDatasetMode, shipId, showToast, token]);

  useEffect(() => {
    setGalaxyMapZoom(1);
    setGalaxyMapPanX(0);
    setGalaxyMapPanZ(0);
  }, [galaxyChartViewMode]);

  const triggerFlightImpactFlash = useCallback((severity: "glancing" | "critical") => {
    const transitActive = isTransitFlightPhase(flightJumpPhase);
    const dockingApproachActive = flightDockingApproachTargetStationId !== null;
    const safetyCorridorActive = isSafetyCorridorCollisionStatus(flightCollisionStatus);
    if (transitActive || dockingApproachActive || safetyCorridorActive) {
      setFlightImpactFlash("none");
      if (flightImpactFlashTimeoutRef.current !== null) {
        window.clearTimeout(flightImpactFlashTimeoutRef.current);
        flightImpactFlashTimeoutRef.current = null;
      }
      return;
    }

    setFlightImpactFlash(severity === "critical" ? "critical" : "glancing");
    if (flightImpactFlashTimeoutRef.current !== null) {
      window.clearTimeout(flightImpactFlashTimeoutRef.current);
    }
    const flashDurationMs = severity === "critical" ? 420 : 260;
    flightImpactFlashTimeoutRef.current = window.setTimeout(() => {
      setFlightImpactFlash("none");
      flightImpactFlashTimeoutRef.current = null;
    }, flashDurationMs);
  }, [
    flightCollisionStatus,
    flightDockingApproachTargetStationId,
    flightJumpPhase,
  ]);

  const clearFlightImpactFlash = useCallback(() => {
    setFlightImpactFlash("none");
    if (flightImpactFlashTimeoutRef.current !== null) {
      window.clearTimeout(flightImpactFlashTimeoutRef.current);
      flightImpactFlashTimeoutRef.current = null;
    }
  }, []);

  const triggerFlightJumpCompletionEffects = useCallback((
    payload?: Record<string, unknown>,
    options?: { jumpMode?: "system" | "hyperspace" },
  ): void => {
    const jumpMode = options?.jumpMode ?? "system";
    const exitEvent = jumpMode === "hyperspace"
      ? "jump.hyperspace_exit"
      : "jump.exit";
    const stabilizeEvent = jumpMode === "hyperspace"
      ? "jump.hyperspace_exit_stabilize"
      : "jump.exit_stabilize";

    dispatchFlightAudioEvent(exitEvent, payload);

    if (flightJumpStabilizeAudioTimeoutRef.current !== null) {
      window.clearTimeout(flightJumpStabilizeAudioTimeoutRef.current);
    }
    flightJumpStabilizeAudioTimeoutRef.current = window.setTimeout(() => {
      dispatchFlightAudioEvent(stabilizeEvent, payload);
      flightJumpStabilizeAudioTimeoutRef.current = null;
    }, 320);

    if (flightJumpCompletionVfxTimeoutRef.current !== null) {
      window.clearTimeout(flightJumpCompletionVfxTimeoutRef.current);
    }
    if (flightJumpCompletionClearTimeoutRef.current !== null) {
      window.clearTimeout(flightJumpCompletionClearTimeoutRef.current);
    }

    if (reducedMotionPreferenceEnabled) {
      setFlightJumpCompletionVfx("reduced");
      flightJumpCompletionClearTimeoutRef.current = window.setTimeout(() => {
        setFlightJumpCompletionVfx("none");
        flightJumpCompletionClearTimeoutRef.current = null;
      }, 900);
      return;
    }

    setFlightJumpCompletionVfx("flash");
    flightJumpCompletionVfxTimeoutRef.current = window.setTimeout(() => {
      setFlightJumpCompletionVfx("stabilize");
      flightJumpCompletionVfxTimeoutRef.current = null;
    }, 280);
    flightJumpCompletionClearTimeoutRef.current = window.setTimeout(() => {
      setFlightJumpCompletionVfx("none");
      flightJumpCompletionClearTimeoutRef.current = null;
    }, 1450);
  }, [dispatchFlightAudioEvent, reducedMotionPreferenceEnabled]);

  useEffect(() => {
    if (
      flightJumpPhase === FLIGHT_PHASE.IDLE
      || flightJumpPhase === FLIGHT_PHASE.DESTINATION_LOCKED
      || flightJumpPhase === FLIGHT_PHASE.ERROR
    ) {
      setFlightJumpVisualMode("none");
    }
  }, [flightJumpPhase]);

  const fetchCollisionTelemetry = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) {
      setFlightCollisionStatus("Collision monitor idle.");
      setFlightRecentImpacts([]);
      return;
    }

    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setFlightCollisionStatus("Collision monitor unavailable.");
      setFlightRecentImpacts([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/ships/${parsedShipId}/collision-check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        if (!options?.silent) {
          const message = data?.error?.message || data?.detail || "Collision monitor unavailable.";
          showToast({ message, variant: "warning" });
        }
        setFlightCollisionStatus("Collision monitor unavailable.");
        setFlightRecentImpacts([]);
        return;
      }

      const payload = data as CollisionCheckResponse;
      setShipTelemetry(payload.ship);
      syncJumpCooldownFromShipTelemetry(payload.ship);
      syncFlightStateFromShipTelemetry(payload.ship);
      setFlightCollisionStatus(sanitizeCollisionStatusMessage(payload.message));

      if (payload.collision) {
        const signature = `${payload.severity}:${payload.object_id ?? "unknown"}:${payload.recovered ? "r" : "n"}`;
        const severityLabel = payload.severity.toUpperCase();
        const objectLabel = payload.object_name ?? payload.object_type ?? "unknown object";
        const distanceLabel = typeof payload.distance_km === "number"
          ? `${payload.distance_km.toFixed(1)}km`
          : "range unknown";
        setFlightRecentImpacts((current) => {
          if (current[0]?.id === signature) {
            return current;
          }
          const nextEntry: FlightImpactEntry = {
            id: signature,
            severity: payload.severity,
            label: `${severityLabel} · ${objectLabel} · ${distanceLabel}`,
          };
          return [nextEntry, ...current].slice(0, 3);
        });
        if (collisionToastSignatureRef.current !== signature) {
          triggerFlightImpactFlash(payload.severity === "critical" ? "critical" : "glancing");
          if (!options?.silent) {
            const variant = payload.severity === "critical" ? "error" : "warning";
            showToast({
              message: sanitizeCollisionStatusMessage(payload.message),
              variant,
            });
          }
          collisionToastSignatureRef.current = signature;
        }
        return;
      }

      const normalizedMessage = (payload.message || "").trim().toLowerCase();
      if (normalizedMessage.startsWith("no impact")) {
        collisionToastSignatureRef.current = "";
      }
      clearFlightImpactFlash();
    } catch {
      if (!options?.silent) {
        showToast({ message: "Collision monitor unavailable.", variant: "warning" });
      }
      setFlightCollisionStatus("Collision monitor unavailable.");
      setFlightRecentImpacts([]);
    }
  }, [
    shipId,
    showToast,
    syncFlightStateFromShipTelemetry,
    syncJumpCooldownFromShipTelemetry,
    token,
    triggerFlightImpactFlash,
    clearFlightImpactFlash,
  ]);

  const fetchShipOperations = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) {
      setShipOperations([]);
      setShipOperationsError(null);
      return;
    }
    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setShipOperations([]);
      setShipOperationsError("Ship ID must be a valid positive number.");
      return;
    }

    setShipOperationsLoading(true);
    setShipOperationsError(null);
    try {
      const response = await fetch(
        `${API_BASE}/api/ships/${parsedShipId}/operations?limit=8`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await response.json();
      if (!response.ok) {
        const message =
          data?.error?.message || data?.detail || "Unable to load ops log.";
        setShipOperations([]);
        setShipOperationsError(message);
        if (!options?.silent) {
          showToast({ message, variant: "warning" });
        }
        return;
      }
      setShipOperations(Array.isArray(data) ? data : []);
    } catch {
      const message = "Unable to load ops log.";
      setShipOperations([]);
      setShipOperationsError(message);
      if (!options?.silent) {
        showToast({ message, variant: "warning" });
      }
    } finally {
      setShipOperationsLoading(false);
    }
  }, [shipId, showToast, token]);

  const fetchMissions = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) {
      setMissionsAvailable([]);
      setMissionsAssigned([]);
      setMissionsError(null);
      return;
    }

    setMissionsLoading(true);
    setMissionsError(null);

    try {
      const assignedResponse = await fetch(`${API_BASE}/api/missions/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const assignedData = await assignedResponse.json();
      if (!assignedResponse.ok) {
        const message =
          assignedData?.error?.message ||
          assignedData?.detail ||
          "Unable to load accepted missions.";
        setMissionsAvailable([]);
        setMissionsAssigned([]);
        setMissionsError(message);
        if (!options?.silent) {
          showToast({ message, variant: "warning" });
        }
        return;
      }

      const assignedMissions = Array.isArray(assignedData) ? assignedData : [];
      setMissionsAssigned(assignedMissions);

      const canBrowseStationMissions = (
        commanderProfile?.location_type === "station"
        && Number.isInteger(commanderProfile.location_id)
        && Number(commanderProfile.location_id) > 0
      );

      if (!canBrowseStationMissions) {
        setMissionsAvailable([]);
        setMissionsError(null);
        return;
      }

      const availableResponse = await fetch(`${API_BASE}/api/missions/available`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const availableData = await availableResponse.json();
      if (!availableResponse.ok) {
        const message =
          availableData?.error?.message ||
          availableData?.detail ||
          "Unable to load available missions.";
        setMissionsAvailable([]);
        setMissionsError(message);
        if (!options?.silent) {
          showToast({ message, variant: "warning" });
        }
        return;
      }

      setMissionsAvailable(Array.isArray(availableData) ? availableData : []);
      setMissionsError(null);
      setMissionStatus("Mission board synchronized.");
    } catch {
      const message = "Unable to load mission board.";
      setMissionsAvailable([]);
      setMissionsAssigned([]);
      setMissionsError(message);
      if (!options?.silent) {
        showToast({ message, variant: "warning" });
      }
    } finally {
      setMissionsLoading(false);
    }
  }, [commanderProfile?.location_id, commanderProfile?.location_type, showToast, token]);

  const handleAcceptMission = useCallback(async (missionId: number) => {
    if (!token) {
      return;
    }

    setAcceptingMissionId(missionId);
    try {
      const response = await fetch(`${API_BASE}/api/missions/${missionId}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        const message =
          data?.error?.message ||
          data?.detail ||
          "Unable to accept mission.";
        setMissionStatus(message);
        showToast({ message, variant: "error" });
        return;
      }

      setMissionStatus(`Mission accepted (#${missionId}).`);
      showToast({ message: "Mission accepted.", variant: "success" });
      void fetchMissions({ silent: true });
    } catch {
      setMissionStatus("Unable to accept mission.");
      showToast({ message: "Unable to accept mission.", variant: "error" });
    } finally {
      setAcceptingMissionId(null);
    }
  }, [fetchMissions, showToast, token]);

  const handleCompleteMission = useCallback(async (missionId: number) => {
    if (!token) {
      return;
    }

    setCompletingMissionId(missionId);
    try {
      const response = await fetch(`${API_BASE}/api/missions/${missionId}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        const message =
          data?.error?.message ||
          data?.detail ||
          "Unable to complete mission.";
        setMissionStatus(message);
        showToast({ message, variant: "error" });
        return;
      }

      setMissionStatus(
        `Mission completed (#${missionId}) · +${data.reward_credits} CR.`
      );
      showToast({
        message: `Mission completed. +${data.reward_credits} CR`,
        variant: "success",
      });
      void fetchMissions({ silent: true });
      void fetchCommanderProfile();
    } catch {
      setMissionStatus("Unable to complete mission.");
      showToast({ message: "Unable to complete mission.", variant: "error" });
    } finally {
      setCompletingMissionId(null);
    }
  }, [fetchCommanderProfile, fetchMissions, showToast, token]);

  const handleAbandonMission = useCallback(async (missionId: number) => {
    if (!token) {
      return;
    }

    setAbandoningMissionId(missionId);
    try {
      const response = await fetch(`${API_BASE}/api/missions/${missionId}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        const message =
          data?.error?.message ||
          data?.detail ||
          "Unable to abandon mission.";
        setMissionStatus(message);
        showToast({ message, variant: "error" });
        return;
      }

      setMissionStatus(`Mission abandoned (#${missionId}).`);
      showToast({ message: "Mission abandoned.", variant: "info" });
      void fetchMissions({ silent: true });
    } catch {
      setMissionStatus("Unable to abandon mission.");
      showToast({ message: "Unable to abandon mission.", variant: "error" });
    } finally {
      setAbandoningMissionId(null);
    }
  }, [fetchMissions, showToast, token]);

  const handleCreateDummyMission = useCallback(async () => {
    if (!token) {
      return;
    }

    setCreatingDummyMission(true);
    try {
      const selectedStationId = Number(dockStationId);
      const hasStationId = Number.isInteger(selectedStationId) && selectedStationId > 0;
      const query = hasStationId ? `?station_id=${selectedStationId}` : "";
      const response = await fetch(`${API_BASE}/api/missions/dev/dummy${query}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        const message =
          data?.error?.message ||
          data?.detail ||
          "Unable to create dummy mission.";
        setMissionStatus(message);
        showToast({ message, variant: "error" });
        return;
      }

      setMissionStatus(
        data.created
          ? `Dummy mission created (#${data.mission_id}).`
          : `Dummy mission ready (#${data.mission_id}).`
      );
      showToast({
        message: data.created
          ? "Dummy mission created."
          : "Dummy mission already available.",
        variant: "success",
      });
      void fetchMissions({ silent: true });
    } catch {
      setMissionStatus("Unable to create dummy mission.");
      showToast({ message: "Unable to create dummy mission.", variant: "error" });
    } finally {
      setCreatingDummyMission(false);
    }
  }, [dockStationId, fetchMissions, showToast, token]);

  const selectedStation = useMemo(
    () => stationOptions.find((station) => String(station.id) === stationId) ?? null,
    [stationId, stationOptions]
  );

  const flightLockedDestinationName = useMemo(() => {
    if (!flightDestinationLockedId) {
      return "No waypoint";
    }
    return (
      stationOptions.find((station) => station.id === flightDestinationLockedId)?.name
      ?? localChartData?.stations.find((station) => station.id === flightDestinationLockedId)?.name
      ?? `Station #${flightDestinationLockedId}`
    );
  }, [flightDestinationLockedId, localChartData?.stations, stationOptions]);

  const formatStationLabel = useCallback((targetStationId: number | null | undefined): string => {
    if (!targetStationId) {
      return "-";
    }

    const stationMatch = stationOptions.find((station) => station.id === targetStationId)
      ?? localChartData?.stations.find((station) => station.id === targetStationId);
    return stationMatch?.name ?? `Station #${targetStationId}`;
  }, [localChartData?.stations, stationOptions]);

  const formatStoryLocationLabel = useCallback((session: StorySessionItem): string => {
    if (session.location_type === "station") {
      return formatStationLabel(session.location_id);
    }
    if (session.location_type === "deep-space") {
      return "Deep Space";
    }
    return `${session.location_type} ${session.location_id}`;
  }, [formatStationLabel]);

  const formatShipOperationDetails = useCallback((details: string): string => (
    details.replace(/\bstation\s*#?(\d+)\b/gi, (_match, stationIdText: string) => {
      const parsedStationId = Number(stationIdText);
      if (!Number.isInteger(parsedStationId) || parsedStationId <= 0) {
        return `station ${stationIdText}`;
      }
      return formatStationLabel(parsedStationId);
    })
  ), [formatStationLabel]);

  const currentLocationLabel = useMemo(() => {
    if (commanderProfile?.location_type === "station" && commanderProfile.location_id) {
      return formatStationLabel(commanderProfile.location_id);
    }
    if (commanderProfile?.location_type === "deep-space") {
      return "Deep Space";
    }
    if (commanderProfile?.location_type) {
      return commanderProfile.location_type;
    }
    return "-";
  }, [commanderProfile?.location_id, commanderProfile?.location_type, formatStationLabel]);

  const dockedShipDisplayName = useMemo(() => {
    if (shipTelemetry?.ship_visual_key === "cobra-mk1") {
      return "Cobra Mk I";
    }

    const rawShipName = shipTelemetry?.name?.trim() ?? "";
    const normalizedName = rawShipName.toLowerCase();
    if (!rawShipName) {
      return "Cobra Mk I";
    }
    if (normalizedName.includes("cobra") || normalizedName.includes("starter")) {
      return "Cobra Mk I";
    }
    return rawShipName;
  }, [shipTelemetry?.name, shipTelemetry?.ship_visual_key]);

  const dockedStationShapeKey = useMemo(() => {
    const shape = shipTelemetry?.docked_station_archetype_shape?.trim().toLowerCase();
    if (!shape) {
      return "default";
    }
    if (shape === "coriolis") {
      return "coriolis";
    }
    if (shape === "orbis") {
      return "orbis";
    }
    return "default";
  }, [shipTelemetry?.docked_station_archetype_shape]);

  const selectedSystemId = selectedStation?.system_id ?? null;

  const systemMapOptions = useMemo<SystemMapOption[]>(() => {
    const map = new Map<number, StationOption[]>();
    stationOptions.forEach((station) => {
      const existing = map.get(station.system_id) ?? [];
      existing.push(station);
      map.set(station.system_id, existing);
    });

    return Array.from(map.entries())
      .sort(([leftId], [rightId]) => leftId - rightId)
      .map(([systemId, stations]) => ({
        id: systemId,
        label: `System #${systemId}`,
        stations: [...stations].sort((left, right) => left.id - right.id),
      }));
  }, [stationOptions]);

  const selectedJumpSystem = useMemo(
    () => systemMapOptions.find((entry) => String(entry.id) === selectedJumpSystemId) ?? null,
    [selectedJumpSystemId, systemMapOptions],
  );

  const selectedGalaxySystem = useMemo(
    () => galaxySystems.find((entry) => String(entry.system_id) === selectedGalaxySystemId) ?? null,
    [galaxySystems, selectedGalaxySystemId],
  );

  const galaxyMapPlot = useMemo(() => {
    const width = 960;
    const height = 420;
    const padding = 24;

    if (!galaxySystems.length) {
      return {
        width,
        height,
        reachabilityZone: null as {
          center_x: number;
          center_y: number;
          radius_x: number;
          radius_y: number;
        } | null,
        points: [] as Array<{
          system_id: number;
          name: string;
          plot_x: number;
          plot_y: number;
          reachable: boolean;
          selected: boolean;
          current: boolean;
        }>,
      };
    }

    const currentSystem = galaxyCurrentSystemId !== null
      ? galaxySystems.find((entry) => entry.system_id === galaxyCurrentSystemId) ?? null
      : null;

    const dataMinX = Math.min(...galaxySystems.map((entry) => entry.x));
    const dataMaxX = Math.max(...galaxySystems.map((entry) => entry.x));
    const dataMinZ = Math.min(...galaxySystems.map((entry) => entry.z));
    const dataMaxZ = Math.max(...galaxySystems.map((entry) => entry.z));

    const reachableSystems = galaxySystems.filter((entry) => entry.reachable_from_current);
    const maxReachableDistanceWorld = currentSystem !== null && reachableSystems.length > 0
      ? reachableSystems.reduce((currentMax, system) => {
        const dx = system.x - currentSystem.x;
        const dz = system.z - currentSystem.z;
        const distance = Math.sqrt((dx * dx) + (dz * dz));
        return Math.max(currentMax, distance);
      }, 0)
      : 0;

    const localReachableBoundaryMarginFactor = 1.15;
    const displayReachableDistanceWorld = Math.max(
      1,
      maxReachableDistanceWorld * localReachableBoundaryMarginFactor,
    );

    const mapMinX = galaxyChartViewMode === "local_reachable" && currentSystem !== null
      ? currentSystem.x - displayReachableDistanceWorld
      : dataMinX;
    const mapMaxX = galaxyChartViewMode === "local_reachable" && currentSystem !== null
      ? currentSystem.x + displayReachableDistanceWorld
      : dataMaxX;
    const mapMinZ = galaxyChartViewMode === "local_reachable" && currentSystem !== null
      ? currentSystem.z - displayReachableDistanceWorld
      : dataMinZ;
    const mapMaxZ = galaxyChartViewMode === "local_reachable" && currentSystem !== null
      ? currentSystem.z + displayReachableDistanceWorld
      : dataMaxZ;

    const baseXSpan = Math.max(1, mapMaxX - mapMinX);
    const baseZSpan = Math.max(1, mapMaxZ - mapMinZ);
    const zoomFactor = Math.max(1, Math.min(3, galaxyMapZoom));
    const xSpan = Math.max(1, baseXSpan / zoomFactor);
    const zSpan = Math.max(1, baseZSpan / zoomFactor);
    const mapCenterX = ((mapMinX + mapMaxX) / 2) + galaxyMapPanX;
    const mapCenterZ = ((mapMinZ + mapMaxZ) / 2) + galaxyMapPanZ;
    const visibleMinX = mapCenterX - (xSpan / 2);
    const visibleMinZ = mapCenterZ - (zSpan / 2);
    const xScale = (width - (padding * 2)) / xSpan;
    const zScale = (height - (padding * 2)) / zSpan;

    const points = [...galaxySystems]
      .sort((left, right) => left.system_id - right.system_id)
      .map((entry) => {
        const normalizedX = (entry.x - visibleMinX) / xSpan;
        const normalizedZ = (entry.z - visibleMinZ) / zSpan;

        return {
          system_id: entry.system_id,
          name: entry.name,
          plot_x: padding + (normalizedX * (width - (padding * 2))),
          plot_y: height - padding - (normalizedZ * (height - (padding * 2))),
          reachable: entry.reachable_from_current,
          selected: String(entry.system_id) === selectedGalaxySystemId,
          current: galaxyCurrentSystemId !== null && entry.system_id === galaxyCurrentSystemId,
        };
      });

    const currentPoint = currentSystem !== null
      ? points.find((point) => point.system_id === currentSystem.system_id) ?? null
      : null;

    let reachabilityZone: {
      center_x: number;
      center_y: number;
      radius_x: number;
      radius_y: number;
    } | null = null;

    if (currentPoint !== null && maxReachableDistanceWorld > 0) {
      reachabilityZone = {
        center_x: currentPoint.plot_x,
        center_y: currentPoint.plot_y,
        radius_x: Math.max(18, displayReachableDistanceWorld * xScale),
        radius_y: Math.max(18, displayReachableDistanceWorld * zScale),
      };
    }

    return {
      width,
      height,
      reachabilityZone,
      points,
    };
  }, [
    galaxyChartViewMode,
    galaxyCurrentSystemId,
    galaxyMapPanX,
    galaxyMapPanZ,
    galaxyMapZoom,
    galaxySystems,
    selectedGalaxySystemId,
  ]);

  const galaxyLocalSelectedLabel = useMemo(() => {
    if (galaxyChartViewMode !== "local_reachable") {
      return null;
    }
    if (!selectedGalaxySystemId || galaxyMapLabelSystemId !== selectedGalaxySystemId) {
      return null;
    }

    const selectedPoint = galaxyMapPlot.points.find(
      (point) => String(point.system_id) === selectedGalaxySystemId,
    );
    if (!selectedPoint) {
      return null;
    }

    const labelText = selectedPoint.name;
    const labelHeight = 18;
    const labelPaddingX = 6;
    const estimatedTextWidth = Math.max(56, Math.ceil(labelText.length * 6.4));
    const labelWidth = estimatedTextWidth + (labelPaddingX * 2);
    const minX = 8;
    const maxX = galaxyMapPlot.width - labelWidth - 8;
    const x = Math.max(minX, Math.min(maxX, selectedPoint.plot_x - (labelWidth / 2)));
    const preferredY = selectedPoint.plot_y - 28;
    const y = preferredY < 8
      ? Math.min(galaxyMapPlot.height - labelHeight - 8, selectedPoint.plot_y + 12)
      : preferredY;

    return {
      labelText,
      x,
      y,
      width: labelWidth,
      height: labelHeight,
    };
  }, [
    galaxyChartViewMode,
    galaxyMapLabelSystemId,
    galaxyMapPlot.height,
    galaxyMapPlot.points,
    galaxyMapPlot.width,
    selectedGalaxySystemId,
  ]);

  const galaxyRouteSummary = useMemo(() => {
    if (!galaxySystemOverview) {
      return "No route suggested.";
    }

    if (galaxySystemOverview.jump.reachable) {
      return "Direct jump is reachable.";
    }

    const hopNames = galaxySystemOverview.jump.route_hop_names ?? [];
    const hopCount = hopNames.length;
    if (hopCount === 0) {
      return "No multi-hop route available.";
    }

    const totalFuel = galaxySystemOverview.jump.route_total_estimated_fuel;
    return totalFuel === null || typeof totalFuel === "undefined"
      ? `${hopCount} hop route: ${hopNames.join(" → ")}`
      : `${hopCount} hop route (${totalFuel} fuel): ${hopNames.join(" → ")}`;
  }, [galaxySystemOverview]);

  const jumpTargetStations = useMemo(
    () => selectedJumpSystem?.stations ?? [],
    [selectedJumpSystem],
  );

  const jumpTargetStationId = useMemo(() => {
    const selectedDockId = Number(dockStationId);
    if (Number.isInteger(selectedDockId) && jumpTargetStations.some((station) => station.id === selectedDockId)) {
      return selectedDockId;
    }
    return jumpTargetStations[0]?.id ?? null;
  }, [dockStationId, jumpTargetStations]);

  const jumpTargetSystemLabel = useMemo(() => {
    if (selectedGalaxySystem) {
      return selectedGalaxySystem.name;
    }
    if (selectedJumpSystem && scannerSystemId === selectedJumpSystem.id && scannerSystemName) {
      return scannerSystemName;
    }
    if (selectedJumpSystem && localChartData?.system.id === selectedJumpSystem.id) {
      return localChartData.system.name;
    }
    return selectedJumpSystem?.label ?? "No system selected";
  }, [
    localChartData?.system.id,
    localChartData?.system.name,
    scannerSystemId,
    scannerSystemName,
    selectedGalaxySystem,
    selectedJumpSystem,
  ]);

  const jumpTargetStationLabel = useMemo(() => {
    if (!jumpTargetStationId) {
      return "No station selected";
    }
    return formatStationLabel(jumpTargetStationId);
  }, [formatStationLabel, jumpTargetStationId]);

  const galaxyTargetCoordinates = useMemo(() => {
    const selectedSystemId = Number(selectedJumpSystemId);
    const selectedSystem = selectedGalaxySystem
      ?? (Number.isInteger(selectedSystemId)
        ? galaxySystems.find((entry) => entry.system_id === selectedSystemId) ?? null
        : null);
    if (!selectedSystem) {
      return "Coordinates unavailable";
    }
    return `X ${selectedSystem.x.toFixed(1)} · Y ${selectedSystem.y.toFixed(1)} · Z ${selectedSystem.z.toFixed(1)}`;
  }, [galaxySystems, selectedGalaxySystem, selectedJumpSystemId]);

  const missionStatusCounts = useMemo(() => {
    const accepted = missionsAssigned.filter((mission) => mission.status === "accepted").length;
    const completed = missionsAssigned.filter((mission) => mission.status === "completed").length;
    const abandoned = missionsAssigned.filter((mission) => mission.status === "abandoned").length;

    return {
      all: missionsAssigned.length,
      accepted,
      completed,
      abandoned,
    };
  }, [missionsAssigned]);

  const filteredAssignedMissions = useMemo(() => {
    if (missionStatusFilter === "all") {
      return missionsAssigned;
    }
    return missionsAssigned.filter((mission) => mission.status === missionStatusFilter);
  }, [missionStatusFilter, missionsAssigned]);

  const sortedAssignedMissions = useMemo(() => {
    const parseMissionTime = (mission: MissionAssignedItem): number => {
      const source = mission.completed_at ?? mission.accepted_at;
      const value = Date.parse(source);
      return Number.isNaN(value) ? 0 : value;
    };

    const sorted = [...filteredAssignedMissions].sort((left, right) => (
      parseMissionTime(right) - parseMissionTime(left)
    ));

    if (missionSortOrder === "oldest") {
      sorted.reverse();
    }

    return sorted;
  }, [filteredAssignedMissions, missionSortOrder]);

  const commodityHoldMap = useMemo(() => {
    const quantities = new Map<number, number>();
    shipCargo?.items.forEach((item) => {
      quantities.set(item.commodity_id, item.quantity);
    });
    return quantities;
  }, [shipCargo]);

  const selectedCommodityItem = useMemo(
    () => inventory.find((item) => item.commodity_id === selectedCommodity) ?? null,
    [inventory, selectedCommodity]
  );

  const tradeBoardRows = useMemo<(InventoryItem | null)[]>(() => {
    const minimumRows = 10;
    if (inventory.length >= minimumRows) {
      return inventory;
    }
    return [
      ...inventory,
      ...Array.from({ length: minimumRows - inventory.length }, () => null),
    ];
  }, [inventory]);

  const localChartRows = useMemo<(LocalChartRow | null)[]>(() => {
    const minimumRows = 8;
    const isLayerVisible = (contactType: ScannerContactType): boolean => localChartLayers[contactType];
    const isRowVisible = (row: LocalChartRow): boolean => {
      if (row.body_kind === "star") {
        return localChartLayers.star;
      }
      if (row.body_kind === "planet") {
        return localChartLayers.planet;
      }
      if (row.body_kind === "moon") {
        return localChartLayers.moon;
      }
      if (row.body_kind === "station") {
        return localChartLayers.station;
      }
      return localChartLayers.ship;
    };

    if (!localChartData) {
      const fallback = [...scannerContacts]
        .filter((contact) => isLayerVisible(contact.contact_type))
        .sort((left, right) => left.distance_km - right.distance_km)
        .slice(0, minimumRows)
        .map((contact) => ({
          id: contact.id,
          contact_type: contact.contact_type,
          body_kind: contact.contact_type,
          body_type: null,
          name: contact.name,
          visual_label: contact.contact_type === "ship"
            ? (contact.ship_visual_key ?? "cobra-mk1")
            : "—",
          radius_km: null,
          distance_km: contact.distance_km,
          orbit_label: contact.orbiting_planet_name ?? "—",
          chart_x: contact.scene_x,
          chart_y: contact.scene_y,
          chart_z: contact.scene_z,
        }));

      if (fallback.length >= minimumRows) {
        return fallback;
      }

      return [
        ...fallback,
        ...Array.from({ length: minimumRows - fallback.length }, () => null),
      ];
    }

    const scannerContactById = new Map(scannerContacts.map((contact) => [contact.id, contact]));
    const planetNameById = new Map<number, string>();
    localChartData.planets.forEach((planet) => {
      planetNameById.set(planet.id, planet.name);
    });

    const rows: LocalChartRow[] = [];
    const starId = `star-${localChartData.star.id}`;
    rows.push({
      id: starId,
      contact_type: "star",
      body_kind: "star",
      body_type: localChartData.star.body_type,
      name: localChartData.star.name,
      visual_label: formatBodyVisualLabel(
        localChartData.star.body_type,
        localChartData.star.radius_km,
      ),
      radius_km: localChartData.star.radius_km,
      distance_km: scannerContactById.get(starId)?.distance_km ?? null,
      orbit_label: "System primary",
      chart_x: localChartData.star.position_x,
      chart_y: localChartData.star.position_y,
      chart_z: localChartData.star.position_z,
    });

    localChartData.planets.forEach((planet) => {
      const planetId = `planet-${planet.id}`;
      rows.push({
        id: planetId,
        contact_type: "planet",
        body_kind: "planet",
        body_type: planet.body_type,
        name: planet.name,
        visual_label: formatBodyVisualLabel(planet.body_type, planet.radius_km),
        radius_km: planet.radius_km,
        distance_km: scannerContactById.get(planetId)?.distance_km ?? null,
        orbit_label: `${planet.orbit_radius_km.toLocaleString()} km`,
        chart_x: planet.position_x,
        chart_y: planet.position_y,
        chart_z: planet.position_z,
      });
    });

    Object.values(localChartData.moons_by_parent_body_id).forEach((moons) => {
      moons.forEach((moon) => {
        const moonId = `moon-${moon.id}`;
        const parentLabel = moon.parent_body_id
          ? (planetNameById.get(moon.parent_body_id) ?? `Body #${moon.parent_body_id}`)
          : "Parent unknown";
        rows.push({
          id: moonId,
          contact_type: "moon",
          body_kind: "moon",
          body_type: moon.body_type,
          name: moon.name,
          visual_label: `moon ${formatBodyVisualLabel(moon.body_type, moon.radius_km)}`,
          radius_km: moon.radius_km,
          distance_km: scannerContactById.get(moonId)?.distance_km ?? null,
          orbit_label: `${moon.orbit_radius_km.toLocaleString()} km · ${parentLabel}`,
          chart_x: moon.position_x,
          chart_y: moon.position_y,
          chart_z: moon.position_z,
        });
      });
    });

    localChartData.stations.forEach((station) => {
      const stationId = `station-${station.id}`;
      const stationContact = scannerContactById.get(stationId);
      rows.push({
        id: stationId,
        contact_type: "station",
        body_kind: "station",
        body_type: null,
        name: station.name,
        visual_label: stationContact?.station_archetype_shape ?? "station",
        radius_km: null,
        distance_km: stationContact?.distance_km ?? null,
        orbit_label: station.host_body_id
          ? (planetNameById.get(station.host_body_id) ?? `Body #${station.host_body_id}`)
          : "—",
        chart_x: station.position_x,
        chart_y: station.position_y,
        chart_z: station.position_z,
      });
    });

    const shipRows = scannerContacts
      .filter((contact) => contact.contact_type === "ship")
      .map((contact) => ({
        id: contact.id,
        contact_type: "ship" as const,
        body_kind: "ship" as const,
        body_type: null,
        name: contact.name,
        visual_label: contact.ship_visual_key ?? "cobra-mk1",
        radius_km: null,
        distance_km: contact.distance_km,
        orbit_label: contact.orbiting_planet_name ?? "—",
        chart_x: contact.scene_x,
        chart_y: contact.scene_y,
        chart_z: contact.scene_z,
      }))
      .sort((left, right) => {
        const distanceDelta = (left.distance_km ?? Number.POSITIVE_INFINITY)
          - (right.distance_km ?? Number.POSITIVE_INFINITY);
        if (distanceDelta !== 0) {
          return distanceDelta;
        }
        return left.id.localeCompare(right.id);
      });

    const nonShipRows = rows.filter((row) => row.contact_type !== "ship");
    const visibleNonShipRows = nonShipRows.filter((row) => isRowVisible(row));

    const visibleShipRows = isLayerVisible("ship") ? shipRows : [];
    const remainingSlots = Math.max(0, minimumRows - visibleNonShipRows.length);
    const shipRowsToRender = visibleShipRows.slice(
      0,
      Math.min(LOCAL_CHART_MAX_SHIP_ROWS, remainingSlots),
    );

    const ordered = [...visibleNonShipRows, ...shipRowsToRender];

    if (ordered.length >= minimumRows) {
      return ordered;
    }

    return [
      ...ordered,
      ...Array.from({ length: minimumRows - ordered.length }, () => null),
    ];
  }, [localChartData, localChartLayers, scannerContacts]);

  const localChartDisplayResult = useMemo<{
    rows: (LocalChartRow | null)[];
    computeDurationMs: number;
  }>(() => {
    const startedAt = performance.now();
    const effectiveZoom = clampLocalChartZoom(localChartView.zoom);
    const rows = localChartRows.map((row) => {
      if (!row) {
        return null;
      }

      return {
        ...row,
        chart_x: (row.chart_x - localChartView.center_x) * effectiveZoom,
        chart_z: (row.chart_z - localChartView.center_z) * effectiveZoom,
      };
    });

    return {
      rows,
      computeDurationMs: performance.now() - startedAt,
    };
  }, [localChartRows, localChartView.center_x, localChartView.center_z, localChartView.zoom]);

  const localChartDisplayRows = localChartDisplayResult.rows;

  const fittedDefaultLocalChartView = useMemo(
    () => buildDefaultLocalChartView(localChartData),
    [localChartData],
  );

  const resetLocalChartView = useCallback((): void => {
    setLocalChartView((current) => ({
      ...fittedDefaultLocalChartView,
      scale_mode: current.scale_mode,
    }));
  }, [fittedDefaultLocalChartView]);

  const localChartSortedDisplayRows = useMemo<(LocalChartRow | null)[]>(() => {
    const visibleRows = localChartDisplayRows.filter((row): row is LocalChartRow => row !== null);
    const placeholderCount = Math.max(0, localChartDisplayRows.length - visibleRows.length);

    const sortedRows = [...visibleRows].sort((left, right) => {
      const directionMultiplier = localChartSortState.direction === "asc" ? 1 : -1;

      if (localChartSortState.key === "type") {
        const typeCompare = left.contact_type.localeCompare(right.contact_type);
        if (typeCompare !== 0) {
          return typeCompare * directionMultiplier;
        }
      }

      if (localChartSortState.key === "radius") {
        const leftRadius = left.radius_km ?? Number.POSITIVE_INFINITY;
        const rightRadius = right.radius_km ?? Number.POSITIVE_INFINITY;
        const radiusCompare = leftRadius - rightRadius;
        if (radiusCompare !== 0) {
          return radiusCompare * directionMultiplier;
        }
      }

      if (localChartSortState.key === "distance") {
        const leftDistance = left.distance_km ?? Number.POSITIVE_INFINITY;
        const rightDistance = right.distance_km ?? Number.POSITIVE_INFINITY;
        const distanceCompare = leftDistance - rightDistance;
        if (distanceCompare !== 0) {
          return distanceCompare * directionMultiplier;
        }
      }

      if (localChartSortState.key === "name") {
        const nameCompare = left.name.localeCompare(right.name);
        if (nameCompare !== 0) {
          return nameCompare * directionMultiplier;
        }
      }

      return left.name.localeCompare(right.name);
    });

    if (!placeholderCount) {
      return sortedRows;
    }

    return [
      ...sortedRows,
      ...Array.from({ length: placeholderCount }, () => null),
    ];
  }, [localChartDisplayRows, localChartSortState.direction, localChartSortState.key]);

  const visibleLocalChartContacts = useMemo(
    () => localChartSortedDisplayRows.filter((row): row is LocalChartRow => row !== null),
    [localChartSortedDisplayRows],
  );

  const selectedSystemChartStationId = useMemo(
    () => parseStationContactId(scannerSelectedContactId),
    [scannerSelectedContactId],
  );

  useEffect(() => {
    const wasSystemMode = previousActiveModeRef.current === "system"
      || (previousActiveModeRef.current === "navigation" && previousNavigationViewRef.current === "system");
    if (isSystemModeActive && !wasSystemMode) {
      systemChartOpenCountRef.current += 1;
      emitSystemChartObservability("chart-open", {
        openCount: systemChartOpenCountRef.current,
      });
    }

    previousActiveModeRef.current = activeMode;
    previousNavigationViewRef.current = navigationView;
  }, [activeMode, emitSystemChartObservability, isSystemModeActive, navigationView]);

  useEffect(() => {
    if (!isSystemModeActive) {
      return;
    }

    if (localChartDisplayResult.computeDurationMs <= LOCAL_CHART_RENDER_BUDGET_MS) {
      return;
    }

    emitSystemChartObservability("chart-render-budget", {
      budgetMs: LOCAL_CHART_RENDER_BUDGET_MS,
      computeDurationMs: Number(localChartDisplayResult.computeDurationMs.toFixed(2)),
      rowCount: visibleLocalChartContacts.length,
      zoom: localChartView.zoom,
    });
  }, [
    emitSystemChartObservability,
    isSystemModeActive,
    localChartDisplayResult.computeDurationMs,
    localChartView.zoom,
    visibleLocalChartContacts.length,
  ]);

  const selectedSystemChartStationLabel = useMemo(() => {
    if (!selectedSystemChartStationId) {
      return "No station selected";
    }
    return formatStationLabel(selectedSystemChartStationId);
  }, [formatStationLabel, selectedSystemChartStationId]);

  const selectedSystemChartContact = useMemo(
    () => visibleLocalChartContacts.find((contact) => contact.id === scannerSelectedContactId) ?? null,
    [scannerSelectedContactId, visibleLocalChartContacts],
  );

  const selectedSystemChartRawContact = useMemo(
    () => localChartRows.find((contact): contact is LocalChartRow => contact !== null && contact.id === scannerSelectedContactId) ?? null,
    [localChartRows, scannerSelectedContactId],
  );

  const visibleSystemChartStationContacts = useMemo(
    () => visibleLocalChartContacts.filter((contact) => contact.contact_type === "station"),
    [visibleLocalChartContacts],
  );

  const selectedSystemChartDistanceLabel = useMemo(() => {
    const baseDistanceKm = selectedSystemChartContact?.distance_km;
    if (baseDistanceKm === null || baseDistanceKm === undefined) {
      return "Range unavailable";
    }

    const isCelestialContact = selectedSystemChartContact?.contact_type === "planet"
      || selectedSystemChartContact?.contact_type === "moon"
      || selectedSystemChartContact?.contact_type === "star";
    const distanceKm = isCelestialContact
      ? baseDistanceKm * CELESTIAL_DISTANCE_REALISM_MULTIPLIER
      : baseDistanceKm;

    return `${distanceKm.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} km`;
  }, [selectedSystemChartContact]);

  const selectedSystemChartDistanceKm = useMemo(() => {
    const isCelestialContact = selectedSystemChartContact?.contact_type === "planet"
      || selectedSystemChartContact?.contact_type === "moon"
      || selectedSystemChartContact?.contact_type === "star";

    if (selectedSystemChartContact?.distance_km === null || selectedSystemChartContact?.distance_km === undefined) {
      return null;
    }
    const distanceKm = Math.max(0, selectedSystemChartContact.distance_km);
    return isCelestialContact
      ? distanceKm * CELESTIAL_DISTANCE_REALISM_MULTIPLIER
      : distanceKm;
  }, [selectedSystemChartContact]);

  const selectedSystemChartContactType = selectedSystemChartContact?.contact_type ?? null;
  const selectedSystemChartSupportsWaypoint =
    selectedSystemChartContactType === "station"
    || selectedSystemChartContactType === "planet"
    || selectedSystemChartContactType === "moon"
    || selectedSystemChartContactType === "star";
  const selectedSystemChartSupportsApproach = selectedSystemChartSupportsWaypoint;
  const selectedSystemChartWaypointLocked = useMemo(() => {
    if (!selectedSystemChartContact) {
      return false;
    }
    if (selectedSystemChartContact.contact_type === "station") {
      const selectedStationId = parseStationContactId(selectedSystemChartContact.id);
      return selectedStationId !== null && selectedStationId === flightDestinationLockedId;
    }
    return flightLocalWaypointContactId === selectedSystemChartContact.id;
  }, [
    flightDestinationLockedId,
    flightLocalWaypointContactId,
    selectedSystemChartContact,
  ]);

  const systemTargetBlockReason = useMemo<string | null>(() => {
    if (!selectedSystemChartContact) {
      return "no-target";
    }
    if (selectedSystemChartContact.contact_type === "ship") {
      return "ship-track-only";
    }
    if (selectedSystemChartContact.contact_type !== "station") {
      if (shipTelemetry?.status !== "in-space") {
        return "docked";
      }
      if (selectedSystemChartDistanceKm === null) {
        return "no-distance";
      }
      if (selectedSystemChartDistanceKm > LOCAL_TRANSFER_JUMP_RECOMMENDED_DISTANCE_KM) {
        return "transfer-jump-recommended";
      }
      return null;
    }
    if (!selectedSystemChartStationId) {
      return "no-station";
    }
    if (shipTelemetry?.status !== "in-space") {
      return "docked";
    }
    if (selectedSystemChartDistanceKm === null) {
      return "no-distance";
    }
    if (!Number.isFinite(shipTelemetry?.docking_computer_range_km)) {
      return "no-range";
    }
    if (selectedSystemChartDistanceKm > Number(shipTelemetry.docking_computer_range_km)) {
      return "out-of-range";
    }
    return null;
  }, [
    selectedSystemChartContact,
    selectedSystemChartDistanceKm,
    selectedSystemChartStationId,
    shipTelemetry?.docking_computer_range_km,
    shipTelemetry?.status,
  ]);

  const systemTargetPathLabel = useMemo(() => {
    const approachInProgress = flightDockingApproachTargetStationId !== null;
    const selectedLabel = selectedSystemChartContact?.name ?? "none";
    const waypointLabel = selectedSystemChartContact?.contact_type === "station"
      ? (
        selectedSystemChartStationId
          && flightDestinationLockedId === selectedSystemChartStationId
          ? "locked"
          : flightDestinationLockedId
            ? (
              selectedSystemChartStationId
                ? `locked to ${formatStationLabel(flightDestinationLockedId)} (selected ${selectedLabel})`
                : `locked to ${formatStationLabel(flightDestinationLockedId)}`
            )
            : "unlocked"
      )
      : selectedSystemChartContact
        ? (
          flightLocalWaypointContactId === selectedSystemChartContact.id
            ? "locked"
            : flightLocalWaypointContactId
              ? `locked to ${flightLocalWaypointContactId}`
              : "unlocked"
        )
        : "unlocked";

    let approachLabel = "select a station";
    const blockReasonLabel = systemTargetBlockReason;
    if (!selectedSystemChartContact) {
      approachLabel = "select a contact";
    } else if (selectedSystemChartContact.contact_type === "ship") {
      approachLabel = "track-only";
    } else if (selectedSystemChartContact.contact_type !== "station") {
      if (shipTelemetry?.status !== "in-space") {
        approachLabel = "transfer unavailable while docked";
      } else if (selectedSystemChartDistanceKm === null) {
        approachLabel = "transfer range unavailable";
      } else if (selectedSystemChartDistanceKm > LOCAL_TRANSFER_JUMP_RECOMMENDED_DISTANCE_KM) {
        approachLabel = `manual cruise impractical (${selectedSystemChartDistanceKm.toFixed(1)} km) · transfer jump recommended`;
      } else {
        approachLabel = `local transfer available (${selectedSystemChartDistanceKm.toFixed(1)} km)`;
      }
    } else if (!selectedSystemChartStationId) {
      approachLabel = "select a station";
    } else if (approachInProgress) {
      approachLabel = "docking path in progress";
    } else if (shipTelemetry?.status !== "in-space") {
      approachLabel = "docking path unavailable while docked";
    } else if (
      selectedSystemChartDistanceKm === null
    ) {
      approachLabel = "range unavailable";
    } else if (!Number.isFinite(shipTelemetry?.docking_computer_range_km)) {
      approachLabel = "range unavailable";
    } else if (selectedSystemChartDistanceKm <= Number(shipTelemetry.docking_computer_range_km)) {
      approachLabel = `in range (${selectedSystemChartDistanceKm.toFixed(1)} / ${Number(shipTelemetry.docking_computer_range_km).toFixed(1)} km)`;
    } else {
      approachLabel = `jump required (${selectedSystemChartDistanceKm.toFixed(1)} / ${Number(shipTelemetry.docking_computer_range_km).toFixed(1)} km)`;
    }

    const pathPrefix = `Path: selected ${selectedLabel} · waypoint ${waypointLabel} · transfer/dock ${approachLabel}`;
    return {
      pathPrefix,
      blockReasonLabel,
    };
  }, [
    flightDestinationLockedId,
    flightLocalWaypointContactId,
    formatStationLabel,
    selectedSystemChartContact,
    selectedSystemChartDistanceKm,
    selectedSystemChartStationId,
    systemTargetBlockReason,
    flightDockingApproachTargetStationId,
    shipTelemetry?.docking_computer_range_km,
    shipTelemetry?.status,
  ]);

  const systemTargetBlockLegendLabel = useMemo(() => {
    switch (systemTargetBlockReason) {
      case "no-target":
        return {
          token: "no-target",
          explanation: "select a contact",
          active: true,
        };
      case "ship-track-only":
        return {
          token: "track-only",
          explanation: "ship contacts are track-only",
          active: true,
        };
      case "no-station":
        return {
          token: "no-station",
          explanation: "select a station",
          active: true,
        };
      case "docked":
        return {
          token: "docked",
          explanation: "launch first",
          active: true,
        };
      case "no-distance":
        return {
          token: "no-distance",
          explanation: "contact telemetry missing",
          active: true,
        };
      case "no-range":
        return {
          token: "no-range",
          explanation: "docking range unknown",
          active: true,
        };
      case "out-of-range":
        return {
          token: "out-of-range",
          explanation: "jump closer",
          active: true,
        };
      case "transfer-jump-recommended":
        return {
          token: "transfer-jump-recommended",
          explanation: "manual cruise impractical; use transfer jump",
          active: true,
        };
      default:
        return {
          token: "clear",
          explanation: "path ready",
          active: false,
        };
    }
  }, [systemTargetBlockReason]);

  const systemTargetBlockSummary = useMemo(() => {
    if (!systemTargetBlockLegendLabel.active) {
      return "";
    }
    return `${systemTargetBlockLegendLabel.token} ${systemTargetBlockLegendLabel.explanation}`;
  }, [systemTargetBlockLegendLabel]);

  const selectedSystemChartToken = useMemo(() => {
    if (!selectedSystemChartContact) {
      return {
        glyph: "·",
        color: "var(--muted)",
      };
    }
    if (selectedSystemChartContact.contact_type === "star") {
      return {
        glyph: "✦",
        color: "#ffd56a",
      };
    }
    if (selectedSystemChartContact.contact_type === "planet") {
      return {
        glyph: "◉",
        color: "#7effa1",
      };
    }
    if (selectedSystemChartContact.contact_type === "moon") {
      return {
        glyph: "●",
        color: "#9ad3af",
      };
    }
    if (selectedSystemChartContact.contact_type === "station") {
      return {
        glyph: "◆",
        color: "#a9adb2",
      };
    }
    return {
      glyph: "▲",
      color: "#ffb347",
    };
  }, [selectedSystemChartContact]);

  const systemActionReadiness = useMemo(() => {
    if (!selectedSystemChartContact) {
      return {
        state: "blocked" as const,
        reason: "select a contact",
      };
    }

    if (selectedSystemChartContact.contact_type === "ship") {
      return {
        state: "blocked" as const,
        reason: "ship contacts are track-only",
      };
    }

    if (shipTelemetry?.status !== "in-space") {
      return {
        state: "blocked" as const,
        reason: selectedSystemChartContact.contact_type === "station"
          ? "launch before docking path"
          : "launch before transfer",
      };
    }

    if (shipOpsLoading) {
      return {
        state: "blocked" as const,
        reason: "ship operations busy",
      };
    }

    if (flightDockingApproachTargetStationId !== null) {
      return {
        state: "blocked" as const,
        reason: "docking path already in progress",
      };
    }

    if (systemTargetBlockReason === "no-distance" || systemTargetBlockReason === "no-range") {
      return {
        state: "blocked" as const,
        reason: systemTargetBlockReason,
      };
    }

    if (selectedSystemChartContact.contact_type !== "station") {
      if (systemTargetBlockReason === "transfer-jump-recommended") {
        return {
          state: "ready" as const,
          reason: "transfer jump recommended",
        };
      }

      return {
        state: "ready" as const,
        reason: "local transfer available",
      };
    }

    if (systemTargetBlockReason === "out-of-range") {
      return {
        state: "ready" as const,
        reason: "jump-to-dock available",
      };
    }

    return {
      state: "ready" as const,
      reason: "docking path available",
    };
  }, [
    flightDockingApproachTargetStationId,
    selectedSystemChartContact,
    shipOpsLoading,
    shipTelemetry?.status,
    systemTargetBlockReason,
  ]);

  const localChartMutableState = localChartData?.mutable_state;
  const localChartFlightPhaseLabel = localChartMutableState?.flight_phase || "idle";
  const localChartTargetContactId = localChartMutableState?.local_target_contact_id || null;
  const activeSystemTargetContactId = useMemo(() => {
    if (flightDockingApproachTargetContactId) {
      return flightDockingApproachTargetContactId;
    }
    if (flightDestinationLockedContactId) {
      return flightDestinationLockedContactId;
    }
    if (flightDestinationLockedId) {
      return `station-${flightDestinationLockedId}`;
    }
    if (flightLocalWaypointContactId) {
      return flightLocalWaypointContactId;
    }
    if (scannerSelectedContactId) {
      return scannerSelectedContactId;
    }
    return localChartTargetContactId;
  }, [
    flightDestinationLockedContactId,
    flightDestinationLockedId,
    flightDockingApproachTargetContactId,
    flightLocalWaypointContactId,
    localChartTargetContactId,
    scannerSelectedContactId,
  ]);
  const localChartTargetStatusLabel = localChartMutableState?.local_target_status || "none";
  const localChartAudioHintSummary =
    localChartMutableState?.audio_event_hints?.length
      ? localChartMutableState.audio_event_hints.slice(0, 2).join(", ")
      : "none";
  const localChartAudioHints = localChartMutableState?.audio_event_hints;
  const normalizedLocalChartAudioHints = useMemo(() => {
    const uniqueEvents: FlightAudioEventName[] = [];
    const seenEvents = new Set<FlightAudioEventName>();

    for (const hint of localChartAudioHints || []) {
      const eventName = parseFlightAudioEventName(hint);
      if (!eventName || seenEvents.has(eventName)) {
        continue;
      }
      seenEvents.add(eventName);
      uniqueEvents.push(eventName);
    }

    return uniqueEvents;
  }, [localChartAudioHints]);
  const localChartTargetContactLabel = useMemo(() => {
    if (!localChartTargetContactId) {
      return "none";
    }
    const scannerMatch = scannerContacts.find((contact) => contact.id === localChartTargetContactId);
    if (scannerMatch) {
      return scannerMatch.name;
    }
    const chartMatch = visibleLocalChartContacts.find((contact) => contact.id === localChartTargetContactId);
    if (chartMatch) {
      return chartMatch.name;
    }
    return localChartTargetContactId;
  }, [localChartTargetContactId, scannerContacts, visibleLocalChartContacts]);

  useEffect(() => {
    if (!isSystemModeActive || !visibleLocalChartContacts.length) {
      return;
    }

    const selectedIsVisible = visibleLocalChartContacts.some(
      (contact) => contact.id === scannerSelectedContactId,
    );
    if (selectedIsVisible) {
      return;
    }

    const preferredTargetIsVisible = localChartTargetContactId
      ? visibleLocalChartContacts.some(
        (contact) => contact.id === localChartTargetContactId,
      )
      : false;

    const fallbackContactId = preferredTargetIsVisible
      ? localChartTargetContactId
      : visibleLocalChartContacts[0]?.id;

    if (!fallbackContactId || fallbackContactId === scannerSelectedContactId) {
      return;
    }

    selectScannerContactWithSource(
      fallbackContactId,
      "scanner-refresh",
      scannerContacts,
    );
  }, [
    isSystemModeActive,
    localChartTargetContactId,
    scannerContacts,
    scannerSelectedContactId,
    selectScannerContactWithSource,
    visibleLocalChartContacts,
  ]);

  const localChartFlightStatusLabel = useMemo(() => {
    const targetLabel = localChartTargetContactLabel === "none"
      ? localChartTargetStatusLabel
      : `${localChartTargetStatusLabel} (${localChartTargetContactLabel})`;
    return `Chart ${localChartFlightPhaseLabel} · target ${targetLabel} · hints ${localChartAudioHintSummary}`;
  }, [
    localChartAudioHintSummary,
    localChartFlightPhaseLabel,
    localChartTargetContactLabel,
    localChartTargetStatusLabel,
  ]);

  useEffect(() => {
    if (!normalizedLocalChartAudioHints.length) {
      localChartHintDispatchSignatureRef.current = "";
      return;
    }

    const hintSignature = [
      localChartFlightPhaseLabel,
      localChartTargetStatusLabel,
      localChartTargetContactId || "none",
      localChartMutableState?.transition_started_at || "none",
      ...normalizedLocalChartAudioHints,
    ].join("|");

    if (localChartHintDispatchSignatureRef.current === hintSignature) {
      return;
    }

    localChartHintDispatchSignatureRef.current = hintSignature;

    for (const eventName of normalizedLocalChartAudioHints) {
      dispatchFlightAudioEvent(eventName, {
        source: "local-chart-hint",
      });
    }
  }, [
    dispatchFlightAudioEvent,
    localChartFlightPhaseLabel,
    localChartMutableState?.transition_started_at,
    localChartTargetContactId,
    localChartTargetStatusLabel,
    normalizedLocalChartAudioHints,
  ]);

  useEffect(() => {
    const previousSpeed = previousFlightSpeedUnitsRef.current;
    if (flightSpeedUnits > 0) {
      dispatchFlightAudioEvent("flight.motion_loop", {
        speed_units: flightSpeedUnits,
      });
    }
    if (flightSpeedUnits > previousSpeed) {
      dispatchFlightAudioEvent("flight.throttle_accel", {
        from_speed_units: previousSpeed,
        to_speed_units: flightSpeedUnits,
      });
    } else if (flightSpeedUnits < previousSpeed) {
      dispatchFlightAudioEvent("flight.throttle_decel", {
        from_speed_units: previousSpeed,
        to_speed_units: flightSpeedUnits,
      });
    }
    previousFlightSpeedUnitsRef.current = flightSpeedUnits;
  }, [dispatchFlightAudioEvent, flightSpeedUnits]);
  const systemChartPlot = useMemo(() => {
    const viewportWidth = 520;
    const viewportHeight = 420;
    const contacts = localChartRows.filter((row): row is LocalChartRow => row !== null);

    if (!contacts.length) {
      return {
        width: viewportWidth,
        height: viewportHeight,
        rings: [] as Array<{
          id: string;
          path: string;
          opacity: number;
        }>,
        points: [] as Array<{
          id: string;
          contact_type: ScannerContactType;
          name: string;
          plot_x: number;
          plot_y: number;
          radius: number;
          color: string;
          token: string;
          depth: number;
          opacity: number;
          selected: boolean;
          targeted: boolean;
        }>,
        renderZoom: clampLocalChartZoom(localChartView.zoom),
      };
    }

    const effectiveZoom = clampLocalChartZoom(localChartView.zoom);
    const projectTopDown = (
      worldX: number,
      worldZ: number,
    ): { x: number; y: number } => ({
      x: (viewportWidth / 2) + ((worldX - localChartView.center_x) * effectiveZoom),
      y: (viewportHeight / 2) - ((worldZ - localChartView.center_z) * effectiveZoom),
    });

    const points = contacts
      .map((contact) => {
        const style = resolveChartPointVisual(
          contact.body_kind,
          contact.body_type,
          contact.radius_km,
        );
        const projectedPoint = projectTopDown(contact.chart_x, contact.chart_z);

        return {
          id: contact.id,
          contact_type: contact.contact_type,
          name: contact.name,
          plot_x: projectedPoint.x,
          plot_y: projectedPoint.y,
          radius: style.radius,
          color: style.color,
          token: style.token,
          depth: contact.chart_y,
          opacity: 0.92,
          selected: contact.id === scannerSelectedContactId,
          targeted: contact.id === activeSystemTargetContactId,
        };
      })
      .sort((left, right) => left.depth - right.depth);

    const rings: Array<{
      id: string;
      path: string;
      opacity: number;
    }> = [];

    if (localChartData) {
      const plottedPointById = new Map(points.map((point) => [point.id, point]));
      const plottedStarPoint = plottedPointById.get(`star-${localChartData.star.id}`);

      if (plottedStarPoint) {
        contacts
          .filter((contact) => contact.contact_type === "planet")
          .forEach((contact) => {
            const plottedPlanetPoint = plottedPointById.get(contact.id);
            if (!plottedPlanetPoint) {
              return;
            }

            const orbitRadiusPx = Math.hypot(
              plottedPlanetPoint.plot_x - plottedStarPoint.plot_x,
              plottedPlanetPoint.plot_y - plottedStarPoint.plot_y,
            );
            if (orbitRadiusPx < 3) {
              return;
            }

            const leftX = plottedStarPoint.plot_x - orbitRadiusPx;
            const rightX = plottedStarPoint.plot_x + orbitRadiusPx;
            const centerY = plottedStarPoint.plot_y;

            rings.push({
              id: `orbit-${contact.id}`,
              path: `M${leftX.toFixed(2)} ${centerY.toFixed(2)} A${orbitRadiusPx.toFixed(2)} ${orbitRadiusPx.toFixed(2)} 0 1 0 ${rightX.toFixed(2)} ${centerY.toFixed(2)} A${orbitRadiusPx.toFixed(2)} ${orbitRadiusPx.toFixed(2)} 0 1 0 ${leftX.toFixed(2)} ${centerY.toFixed(2)}`,
              opacity: 0.5,
            });
          });
      }
    }

    return {
      width: viewportWidth,
      height: viewportHeight,
      rings,
      points,
      renderZoom: effectiveZoom,
    };
  }, [
    localChartData,
    localChartRows,
    activeSystemTargetContactId,
    localChartView.center_x,
    localChartView.center_z,
    localChartView.zoom,
    scannerSelectedContactId,
  ]);

  const selectedCommsChannel = useMemo(
    () => commsChannels.find((channel) => channel.id === commsSelectedChannelId) ?? null,
    [commsChannels, commsSelectedChannelId]
  );

  const contextModeLabel = useMemo(() => {
    switch (activeMode) {
      case "trade":
        return "TRADE";
      case "flight":
        return "FLIGHT";
      case "navigation":
        return navigationView === "system"
          ? "NAVIGATION · SYSTEM"
          : "NAVIGATION · GALAXY";
      case "system":
        return "SYSTEM";
      case "galaxy":
        return "GALAXY";
      case "ship":
        return "SHIP";
      case "story":
        return "STORY";
      case "comms":
        return "COMMS";
      default:
        return "FLIGHT";
    }
  }, [activeMode, navigationView]);

  const formatCommsChannelName = useCallback((channel: CommsChannel | null): string => {
    if (!channel) {
      return "-";
    }

    const stationMatch = channel.name.match(/^Station\s*#?(\d+)\b/i);
    if (stationMatch) {
      const stationIdFromName = Number(stationMatch[1]);
      const stationName = stationOptions.find(
        (station) => station.id === stationIdFromName
      )?.name;
      if (stationName) {
        return channel.name.replace(/^Station\s*#?\d+\b/i, stationName);
      }
    }

    if (
      channel.scope === "local"
      && commanderProfile?.location_type === "station"
      && currentLocationLabel !== "-"
      && !channel.name.toLowerCase().includes(currentLocationLabel.toLowerCase())
    ) {
      return `${currentLocationLabel} Local`;
    }

    return channel.name;
  }, [commanderProfile?.location_type, currentLocationLabel, stationOptions]);

  const selectedCommsChannelLabel = useMemo(
    () => formatCommsChannelName(selectedCommsChannel),
    [formatCommsChannelName, selectedCommsChannel]
  );

  const selectedCommsMessages = useMemo(
    () => (commsSelectedChannelId ? commsMessages[commsSelectedChannelId] ?? [] : []),
    [commsMessages, commsSelectedChannelId]
  );

  const selectedCommsMessage = useMemo(
    () => selectedCommsMessages.find((message) => message.id === commsSelectedMessageId) ?? null,
    [commsSelectedMessageId, selectedCommsMessages]
  );

  const shipOpsBoardRows = useMemo<(ShipOperationLogEntry | null)[]>(() => {
    const minimumRows = 8;
    if (shipOperations.length >= minimumRows) {
      return shipOperations;
    }
    return [
      ...shipOperations,
      ...Array.from({ length: minimumRows - shipOperations.length }, () => null),
    ];
  }, [shipOperations]);

  const selectedStorySession = useMemo(
    () => storySessions.find((session) => String(session.id) === selectedStorySessionId) ?? null,
    [selectedStorySessionId, storySessions]
  );

  const storyBoardRows = useMemo<(StorySessionItem | null)[]>(() => {
    const minimumRows = 8;
    if (storySessions.length >= minimumRows) {
      return storySessions;
    }
    return [
      ...storySessions,
      ...Array.from({ length: minimumRows - storySessions.length }, () => null),
    ];
  }, [storySessions]);

  const commsBoardRows = useMemo<(CommsMessage | null)[]>(() => {
    const recentMessages = selectedCommsMessages.slice(-8).reverse();
    const minimumRows = 8;
    if (recentMessages.length >= minimumRows) {
      return recentMessages;
    }
    return [
      ...recentMessages,
      ...Array.from({ length: minimumRows - recentMessages.length }, () => null),
    ];
  }, [selectedCommsMessages]);

  useEffect(() => {
    if (!selectedCommsMessages.length) {
      setCommsSelectedMessageId("");
      return;
    }

    const selectedExists = selectedCommsMessages.some(
      (message) => message.id === commsSelectedMessageId
    );
    if (selectedExists) {
      return;
    }

    const latestMessage = selectedCommsMessages[selectedCommsMessages.length - 1];
    if (latestMessage) {
      setCommsSelectedMessageId(latestMessage.id);
    }
  }, [commsSelectedMessageId, selectedCommsMessages]);

  useEffect(() => {
    if (activeMode !== "comms") {
      return;
    }

    const visibleMessageIds = commsBoardRows
      .filter((row): row is CommsMessage => row !== null)
      .map((message) => message.id);

    if (!visibleMessageIds.length) {
      return;
    }

    const handleCommsKeyNav = (event: KeyboardEvent): void => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        const isTypingElement =
          tagName === "INPUT"
          || tagName === "TEXTAREA"
          || tagName === "SELECT"
          || target.isContentEditable;
        if (isTypingElement) {
          return;
        }
      }

      const currentIndex = visibleMessageIds.indexOf(commsSelectedMessageId);
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex =
        event.key === "ArrowUp"
          ? Math.max(0, baseIndex - 1)
          : Math.min(visibleMessageIds.length - 1, baseIndex + 1);

      if (nextIndex === baseIndex) {
        return;
      }

      event.preventDefault();
      setCommsSelectedMessageId(visibleMessageIds[nextIndex] ?? "");
    };

    window.addEventListener("keydown", handleCommsKeyNav);
    return () => {
      window.removeEventListener("keydown", handleCommsKeyNav);
    };
  }, [activeMode, commsBoardRows, commsSelectedMessageId]);

  const totalCommsUnread = useMemo(
    () => commsChannels.reduce((sum, channel) => sum + Math.max(0, channel.unread), 0),
    [commsChannels]
  );

  const commsModeLabel = useMemo(
    () => (totalCommsUnread > 0 ? `Comms (${totalCommsUnread})` : "Comms"),
    [totalCommsUnread]
  );

  const dockedAtStation = useMemo(() => {
    if (shipTelemetry) {
      return shipTelemetry.status === "docked";
    }
    return commanderProfile?.location_type === "station" && Boolean(commanderProfile?.location_id);
  }, [commanderProfile?.location_id, commanderProfile?.location_type, shipTelemetry]);

  const isDockingApproachActive = flightDockingApproachTargetStationId !== null;
  const isFlightTransitActive = isTransitFlightPhase(flightJumpPhase);
  const effectiveFlightImpactFlash: "none" | "glancing" | "critical" = (
    flightJumpPhase === FLIGHT_PHASE.DOCKING_APPROACH
    || isFlightTransitActive
    || isSafetyCorridorCollisionStatus(flightCollisionStatus)
  )
    ? "none"
    : flightImpactFlash;
  const effectiveFlightJumpCompletionVfx: "none" | "flash" | "stabilize" | "reduced" = (
    isDockingApproachActive
    || isFlightTransitActive
    || flightJumpPhase === FLIGHT_PHASE.DOCKING_APPROACH
  )
    ? "none"
    : flightJumpCompletionVfx;
  const hyperspaceJumpCinematicActive = (
    flightJumpVisualMode === "hyperspace"
    && flightJumpPhase === FLIGHT_PHASE.JUMPING
  );
  const hyperspaceJumpExitFlashActive = (
    flightJumpVisualMode === "hyperspace"
    && (effectiveFlightJumpCompletionVfx === "flash" || effectiveFlightJumpCompletionVfx === "reduced")
  );

  const useFlightShell = true;

  const fuelPercent = useMemo(() => {
    if (!shipTelemetry || shipTelemetry.fuel_cap <= 0) {
      return 0;
    }
    return clampPercent((shipTelemetry.fuel_current / shipTelemetry.fuel_cap) * 100);
  }, [shipTelemetry]);

  const fuelAlertLevel = useMemo(
    () => getFuelAlertLevel(fuelPercent),
    [fuelPercent],
  );

  const fuelGaugeFillClassName = useMemo(() => {
    switch (fuelAlertLevel) {
      case "critical":
        return styles.fuelGaugeFillCritical;
      case "warning":
        return styles.fuelGaugeFillWarning;
      default:
        return styles.fuelGaugeFillNormal;
    }
  }, [fuelAlertLevel]);

  useEffect(() => {
    if (!shipTelemetry) {
      previousFuelAlertShipIdRef.current = null;
      previousFuelAlertLevelRef.current = "normal";
      return;
    }

    const currentShipId = shipTelemetry.id;
    if (currentShipId !== previousFuelAlertShipIdRef.current) {
      previousFuelAlertShipIdRef.current = currentShipId;
      previousFuelAlertLevelRef.current = fuelAlertLevel;
      return;
    }

    const previousFuelAlertLevel = previousFuelAlertLevelRef.current;
    if (fuelAlertLevel === previousFuelAlertLevel) {
      return;
    }

    if (fuelAlertLevel === "critical") {
      const criticalMessage = "Fuel critical below 10%. Refuel immediately.";
      setStatus(criticalMessage);
      showToast({ message: criticalMessage, variant: "warning" });
    } else if (
      fuelAlertLevel === "warning"
      && previousFuelAlertLevel === "normal"
    ) {
      const warningMessage = "Fuel low below 20%. Plan a refuel stop soon.";
      setStatus(warningMessage);
      showToast({ message: warningMessage, variant: "warning" });
    }

    previousFuelAlertLevelRef.current = fuelAlertLevel;
  }, [fuelAlertLevel, setStatus, shipTelemetry, showToast]);

  const flightSpeedPercent = useMemo(
    () => clampPercent((Math.abs(flightSpeedUnits) / FLIGHT_MAX_SPEED_UNITS) * 100),
    [flightSpeedUnits],
  );

  const flightRollHalfPercent = useMemo(
    () => clampPercent((Math.abs(flightRollDegrees) / 180) * 100),
    [flightRollDegrees],
  );

  const hullPercent = useMemo(
    () => percentageFromCurrentAndMax(
      shipTelemetry?.hull_current ?? 0,
      shipTelemetry?.hull_max,
    ),
    [shipTelemetry]
  );

  const shieldPercent = useMemo(
    () => percentageFromCurrentAndMax(
      shipTelemetry?.shields_current ?? 0,
      shipTelemetry?.shields_max,
    ),
    [shipTelemetry]
  );

  const energyPercent = useMemo(
    () => percentageFromCurrentAndMax(
      shipTelemetry?.energy_current ?? 0,
      shipTelemetry?.energy_cap,
    ),
    [shipTelemetry]
  );

  const filteredShipOperations = useMemo(() => {
    if (shipOpsFilter === "all") {
      return shipOperations;
    }
    const maintenanceOps = new Set(["refuel", "repair", "recharge"]);
    const travelOps = new Set(["dock", "undock", "jump"]);

    return shipOperations.filter((entry) => {
      if (shipOpsFilter === "maintenance") {
        return maintenanceOps.has(entry.operation);
      }
      return travelOps.has(entry.operation);
    });
  }, [shipOperations, shipOpsFilter]);

  const shipOpsCounts = useMemo(() => {
    const maintenanceOps = new Set(["refuel", "repair", "recharge"]);
    const travelOps = new Set(["dock", "undock", "jump"]);

    const maintenance = shipOperations.filter((entry) =>
      maintenanceOps.has(entry.operation)
    ).length;
    const travel = shipOperations.filter((entry) =>
      travelOps.has(entry.operation)
    ).length;

    return {
      all: shipOperations.length,
      maintenance,
      travel,
    };
  }, [shipOperations]);

  const globalDateLabel = useMemo(
    () =>
      clockNow.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [clockNow]
  );

  const modeContextDate = globalDateLabel;

  const flightCooldownReadyAtLabel = useMemo(() => {
    if (!flightJumpCooldownUntil || flightJumpCooldownSeconds <= 0) {
      return "-";
    }
    return new Date(flightJumpCooldownUntil).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }, [flightJumpCooldownSeconds, flightJumpCooldownUntil]);

  const jumpCooldownTooltipLabel = useMemo(() => {
    if (flightJumpCooldownSeconds <= 0 || flightCooldownReadyAtLabel === "-") {
      return "";
    }
    return `Jump ready at ${flightCooldownReadyAtLabel}`;
  }, [flightCooldownReadyAtLabel, flightJumpCooldownSeconds]);

  const localTransferJumpTargetContactId = useMemo(() => {
    if (flightLocalWaypointContactId) {
      return flightLocalWaypointContactId;
    }
    if (!flightDestinationLockedContactId) {
      return null;
    }

    const isLocalContact = scannerContacts.some(
      (contact) => contact.id === flightDestinationLockedContactId,
    );
    if (!isLocalContact) {
      return null;
    }

    const parsedContact = parseLocalTargetContactId(flightDestinationLockedContactId);
    if (!parsedContact) {
      return null;
    }
    return flightDestinationLockedContactId;
  }, [flightDestinationLockedContactId, flightLocalWaypointContactId, scannerContacts]);

  const nearestHyperspaceClearanceContact = useMemo(() => {
    const clearanceContacts = scannerContacts.filter((contact) => (
      contact.contact_type === "station"
      || contact.contact_type === "planet"
      || contact.contact_type === "moon"
      || contact.contact_type === "star"
    ));
    if (!clearanceContacts.length) {
      return null;
    }

    return clearanceContacts.reduce((nearest, contact) => (
      contact.distance_km < nearest.distance_km ? contact : nearest
    ));
  }, [scannerContacts]);

  const nearestHyperspaceClearanceDistanceKm =
    nearestHyperspaceClearanceContact?.distance_km ?? null;
  const isOutsideHyperspaceClearance = (
    nearestHyperspaceClearanceDistanceKm === null
    || nearestHyperspaceClearanceDistanceKm >= HYPERSPACE_INITIATION_MIN_CLEARANCE_KM
  );
  const hasLockedHyperspaceTarget = flightDestinationLockedId !== null;

  const galaxyJumpDisabledReason = useMemo(() => {
    if (shipOpsLoading) {
      return "Ship operation in progress.";
    }
    if (shipTelemetry?.status !== "in-space") {
      return "Undock before initiating jump.";
    }
    if (isFlightTransitActive) {
      return "Docking/undocking transit in progress.";
    }
    if (isDockingApproachActive) {
      return "Docking approach in progress.";
    }
    if (flightJumpPhase === FLIGHT_PHASE.CHARGING) {
      return "Jump charge already in progress.";
    }
    if (flightJumpPhase === FLIGHT_PHASE.JUMPING) {
      return "Jump execution already in progress.";
    }
    if (flightJumpCooldownSeconds > 0) {
      return jumpCooldownTooltipLabel || `Jump cooldown active (${flightJumpCooldownSeconds}s).`;
    }
    if ((shipTelemetry?.fuel_current ?? 0) < JUMP_FUEL_COST) {
      return `Insufficient fuel for jump (${shipTelemetry?.fuel_current ?? 0}/${JUMP_FUEL_COST}).`;
    }
    if (!hasLockedHyperspaceTarget) {
      return "Lock hyperspace target before initiating jump.";
    }
    if (!isOutsideHyperspaceClearance) {
      const nearestName = nearestHyperspaceClearanceContact?.name ?? "local body";
      const nearestType = nearestHyperspaceClearanceContact?.contact_type ?? "contact";
      const nearestDistanceKm = Math.max(0, Math.round(nearestHyperspaceClearanceDistanceKm ?? 0));
      return (
        `Increase clearance to ${HYPERSPACE_INITIATION_MIN_CLEARANCE_KM}km `
        + `(nearest ${nearestType} ${nearestName} at ${nearestDistanceKm}km).`
      );
    }
    return "";
  }, [
    flightJumpCooldownSeconds,
    flightJumpPhase,
    hasLockedHyperspaceTarget,
    isDockingApproachActive,
    isFlightTransitActive,
    isOutsideHyperspaceClearance,
    jumpCooldownTooltipLabel,
    nearestHyperspaceClearanceContact?.contact_type,
    nearestHyperspaceClearanceContact?.name,
    nearestHyperspaceClearanceDistanceKm,
    shipTelemetry?.fuel_current,
    shipTelemetry?.status,
    shipOpsLoading,
  ]);

  const isGalaxyJumpDisabled = galaxyJumpDisabledReason.length > 0;

  const jumpDisabledReason = useMemo(() => {
    const hasLocalTransferWaypoint = localTransferJumpTargetContactId !== null;

    if (shipOpsLoading) {
      return "Ship operation in progress.";
    }
    if (isFlightTransitActive) {
      return "Docking/undocking transit in progress.";
    }
    if (isDockingApproachActive) {
      return "Docking approach in progress.";
    }
    if (flightJumpPhase === FLIGHT_PHASE.CHARGING) {
      return "Jump charge already in progress.";
    }
    if (flightJumpPhase === FLIGHT_PHASE.JUMPING) {
      return "Jump execution already in progress.";
    }
    if (!hasLocalTransferWaypoint) {
      return "Lock a system waypoint before initiating jump.";
    }
    if (shipTelemetry?.status !== "in-space") {
      return "Undock before initiating jump.";
    }
    return "";
  }, [
    localTransferJumpTargetContactId,
    flightJumpPhase,
    isFlightTransitActive,
    isDockingApproachActive,
    shipOpsLoading,
    shipTelemetry?.status,
  ]);

  const isJumpDisabled = jumpDisabledReason.length > 0;

  const handleModeSelect = useCallback((mode: GameMode) => {
    const requiresDock = mode === "trade" || mode === "ship" || mode === "story";
    if (requiresDock && !dockedAtStation) {
      showToast({ message: "Dock to access this view.", variant: "warning" });
      return;
    }
    setActiveMode(mode);
  }, [dockedAtStation, showToast]);

  useEffect(() => {
    if (activeMode !== "flight") {
      setShowFlightSettings(false);
    }
  }, [activeMode]);

  const fetchCommsChannels = useCallback(async () => {
    if (!token) {
      return;
    }

    setCommsLoading(true);
    setCommsError(null);

    try {
      const response = await fetch(`${API_BASE}/api/comms/channels`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Unable to load channels.";
        setCommsError(message);
        setCommsChannels([]);
        setCommsStatus(message);
        return;
      }

      const channels = (Array.isArray(data) ? data : []).map(mapCommsChannel);
      setCommsChannels(channels);
      setCommsSelectedChannelId((existing) => {
        if (!channels.length) {
          return "";
        }
        if (existing && channels.some((channel) => channel.id === existing)) {
          return existing;
        }
        return channels[0].id;
      });
      setCommsStatus("Relay channels online.");
    } catch {
      setCommsChannels([]);
      setCommsError("Unable to load channels.");
      setCommsStatus("Unable to load channels.");
    } finally {
      setCommsLoading(false);
    }
  }, [token]);

  const fetchCommsMessages = useCallback(async (channelId: string) => {
    if (!token || !channelId) {
      return;
    }

    setCommsError(null);
    try {
      const response = await fetch(
        `${API_BASE}/api/comms/channels/${channelId}/messages`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Unable to load messages.";
        setCommsError(message);
        setCommsStatus(message);
        return;
      }
      const messages = (Array.isArray(data) ? data : []).map(mapCommsMessage);
      setCommsMessages((current) => ({
        ...current,
        [channelId]: messages,
      }));
    } catch {
      setCommsError("Unable to load messages.");
      setCommsStatus("Unable to load messages.");
    }
  }, [token]);

  const markCommsChannelRead = useCallback(async (channelId: string) => {
    if (!token || !channelId) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/comms/channels/${channelId}/read`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();
      if (!response.ok) {
        return;
      }

      const updatedChannel = mapCommsChannel(data as CommsChannelApi);
      setCommsChannels((current) => current.map((channel) => (
        channel.id === updatedChannel.id ? updatedChannel : channel
      )));
    } catch { }
  }, [token]);

  const fetchMarketSummary = useCallback(async (simulatedSteps?: number) => {
    if (!selectedSystemId) {
      setMarketSummary([]);
      return;
    }
    setMarketSummaryLoading(true);
    setMarketSummaryError(null);
    try {
      const steps = simulatedSteps ?? Number(simulateTicks);
      const simulateParam = Number.isFinite(steps) && steps > 0 ? `?simulate_ticks=${steps}` : "";
      const response = await fetch(`${API_BASE}/api/markets/${selectedSystemId}/summary${simulateParam}`);
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || "Unable to load market summary.";
        setMarketSummary([]);
        setMarketSummaryError(message);
        return;
      }
      setMarketSummary(data);
    } catch {
      setMarketSummary([]);
      setMarketSummaryError("Unable to load market summary.");
    } finally {
      setMarketSummaryLoading(false);
    }
  }, [selectedSystemId, simulateTicks]);

  const runMarketTick = useCallback(async () => {
    if (!token) return;
    const steps = Number(marketTickSteps);
    if (!Number.isInteger(steps) || steps <= 0) {
      setMarketTickStatus("Tick steps must be a positive number.");
      return;
    }

    setMarketTickLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/markets/tick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          steps,
          system_id: selectedSystemId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || "Unable to run market tick.";
        setMarketTickStatus(message);
        showToast({ message, variant: "error" });
        return;
      }
      setMarketTickStatus(`Tick applied (${data.affected_rows} rows).`);
      showToast({ message: "Market tick applied.", variant: "success" });
      void fetchMarketSummary();
      void fetchInventory({ silent: true });
    } catch {
      setMarketTickStatus("Unable to run market tick.");
      showToast({ message: "Unable to run market tick.", variant: "error" });
    } finally {
      setMarketTickLoading(false);
    }
  }, [fetchInventory, fetchMarketSummary, marketTickSteps, selectedSystemId, showToast, token]);

  const fetchAdminUsers = useCallback(async () => {
    if (!token || commanderProfile?.role !== "admin") {
      setAdminUsers([]);
      setAdminUsersError(null);
      return;
    }

    setAdminUsersLoading(true);
    setAdminUsersError(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/users?limit=50&offset=0`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || "Unable to load users.";
        setAdminUsersError(message);
        setAdminUsers([]);
        return;
      }
      const payload = data as AdminUsersResponsePayload;
      setAdminUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch {
      setAdminUsersError("Unable to load users.");
      setAdminUsers([]);
    } finally {
      setAdminUsersLoading(false);
    }
  }, [commanderProfile?.role, token]);

  const saveAdminUser = useCallback(async (user: AdminUserItem) => {
    if (!token || commanderProfile?.role !== "admin") {
      return;
    }

    const selectedRole = adminUsersRoleEdits[user.id] ?? user.role;
    const selectedStatus = adminUsersStatusEdits[user.id] ?? user.status;
    const payload: { role?: string; status?: string } = {};
    if (selectedRole !== user.role) {
      payload.role = selectedRole;
    }
    if (selectedStatus !== user.status) {
      payload.status = selectedStatus;
    }
    if (!Object.keys(payload).length) {
      return;
    }

    setAdminUserSavingId(user.id);
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Unable to update user.";
        showToast({ message, variant: "error" });
        return;
      }

      const updatedUser = data as AdminUserItem;
      setAdminUsers((current) => current.map((entry) => (
        entry.id === user.id ? updatedUser : entry
      )));
      setAdminUsersRoleEdits((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
      setAdminUsersStatusEdits((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
      showToast({ message: `Updated user ${updatedUser.username}.`, variant: "success" });
    } catch {
      showToast({ message: "Unable to update user.", variant: "error" });
    } finally {
      setAdminUserSavingId(null);
    }
  }, [adminUsersRoleEdits, adminUsersStatusEdits, commanderProfile?.role, showToast, token]);

  const fetchAdminLogs = useCallback(async (options?: { follow?: boolean }) => {
    if (!token || commanderProfile?.role !== "admin") {
      setAdminLogs([]);
      setAdminLogsError(null);
      setLogsSinceCursor(null);
      setLogsFollowEnabled(false);
      return;
    }

    const isFollowRequest = Boolean(options?.follow);
    if (!isFollowRequest) {
      setAdminLogsLoading(true);
    }
    setAdminLogsError(null);
    try {
      const tail = Number(logsTail);
      const resolvedTail = Number.isFinite(tail) && tail > 0 ? Number(tail) : 100;
      const params = new URLSearchParams();
      params.set("tail", String(resolvedTail));
      if (logsContains.trim()) {
        params.set("contains", logsContains.trim());
      }
      if (logsRegex.trim()) {
        params.set("regex", logsRegex.trim());
      }
      if (logsLevel !== "ALL") {
        params.set("level", logsLevel);
      }
      const includeSinceCursor = isFollowRequest && Boolean(logsSinceCursor);
      if (includeSinceCursor && logsSinceCursor) {
        params.set("since", logsSinceCursor);
      }

      const response = await fetch(`${API_BASE}/api/admin/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || "Unable to load logs.";
        setAdminLogsError(message);
        if (!isFollowRequest) {
          setAdminLogs([]);
        }
        return;
      }

      const payload = data as AdminLogsResponsePayload;
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      if (includeSinceCursor) {
        setAdminLogs((current) => {
          const dedupe = new Set(
            current.map((entry) => `${entry.timestamp}|${entry.level}|${entry.source}|${entry.message}`)
          );
          const merged = [...current];
          for (const entry of entries) {
            const entryKey = `${entry.timestamp}|${entry.level}|${entry.source}|${entry.message}`;
            if (!dedupe.has(entryKey)) {
              dedupe.add(entryKey);
              merged.push(entry);
            }
          }
          return merged.slice(-resolvedTail);
        });
      } else {
        setAdminLogs(entries);
      }
      setLogsSinceCursor(typeof payload.next_since === "string" ? payload.next_since : null);
    } catch {
      setAdminLogsError("Unable to load logs.");
      if (!isFollowRequest) {
        setAdminLogs([]);
      }
    } finally {
      if (!isFollowRequest) {
        setAdminLogsLoading(false);
      }
    }
  }, [commanderProfile?.role, logsContains, logsLevel, logsRegex, logsSinceCursor, logsTail, token]);

  const handleShipOperation = useCallback(async (
    operation: "dock" | "undock" | "refuel" | "jump" | "repair" | "recharge",
    options?: {
      stationIdOverride?: number;
      systemIdOverride?: number;
      localApproach?: boolean;
      refuelAmountOverride?: number;
    },
  ): Promise<boolean> => {
    if (!token) {
      return false;
    }
    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setShipOpsStatus("Ship ID must be a valid positive number.");
      return false;
    }

    setShipOpsLoading(true);
    try {
      const endpoint =
        operation === "dock"
          ? `${API_BASE}/api/ships/${parsedShipId}/dock`
          : operation === "undock"
            ? `${API_BASE}/api/ships/${parsedShipId}/undock`
            : operation === "refuel"
              ? `${API_BASE}/api/ships/${parsedShipId}/refuel`
              : operation === "jump"
                ? `${API_BASE}/api/ships/${parsedShipId}/jump`
                : operation === "repair"
                  ? `${API_BASE}/api/ships/${parsedShipId}/repair`
                  : `${API_BASE}/api/ships/${parsedShipId}/recharge`;

      const payload =
        operation === "dock"
          ? { station_id: options?.stationIdOverride ?? Number(dockStationId) }
          : operation === "refuel"
            ? { amount: options?.refuelAmountOverride ?? Number(refuelAmount) }
            : operation === "jump"
              ? {
                destination_station_id: options?.stationIdOverride ?? Number(dockStationId),
                destination_system_id: options?.systemIdOverride ?? Number(selectedJumpSystemId),
                local_approach: options?.localApproach ?? false,
              }
              : operation === "repair"
                ? { amount: Number(repairAmount) }
                : operation === "recharge"
                  ? {
                    shields_amount: Number(shieldRechargeAmount),
                    energy_amount: Number(energyRechargeAmount),
                  }
                  : undefined;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: payload ? JSON.stringify(payload) : "{}",
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || `Unable to ${operation} ship.`;
        setShipOpsStatus(message);
        showToast({ message, variant: "error" });
        return false;
      }
      setShipOpsStatus(`Ship ${operation} operation successful.`);
      showToast({ message: `Ship ${operation} operation successful.`, variant: "success" });
      void fetchShipCargo({ silent: true });
      void fetchShipTelemetry({ silent: true });
      void fetchScannerContacts({ silent: true });
      void fetchShipOperations({ silent: true });
      void fetchCommanderProfile();
      void fetchMissions({ silent: true });
      if (operation === "jump") {
        setCompletedJumps((previous) => previous + 1);
      }
      syncJumpCooldownFromShipTelemetry(data);
      return true;
    } catch {
      const message = `Unable to ${operation} ship.`;
      setShipOpsStatus(message);
      showToast({ message, variant: "error" });
      return false;
    } finally {
      setShipOpsLoading(false);
    }
  }, [
    dockStationId,
    energyRechargeAmount,
    fetchCommanderProfile,
    fetchMissions,
    fetchShipCargo,
    fetchScannerContacts,
    fetchShipOperations,
    fetchShipTelemetry,
    refuelAmount,
    repairAmount,
    shieldRechargeAmount,
    shipId,
    showToast,
    selectedJumpSystemId,
    syncJumpCooldownFromShipTelemetry,
    token,
  ]);

  const handleRefuelToFull = useCallback(async (): Promise<void> => {
    if (!shipTelemetry) {
      setShipOpsStatus("Ship telemetry is unavailable.");
      return;
    }

    const refuelToFullAmount = Math.max(
      0,
      Math.ceil(shipTelemetry.fuel_cap - shipTelemetry.fuel_current),
    );

    if (refuelToFullAmount <= 0) {
      setShipOpsStatus("Fuel is already at capacity.");
      showToast({ message: "Fuel is already at capacity.", variant: "success" });
      return;
    }

    setRefuelAmount(String(refuelToFullAmount));
    await handleShipOperation("refuel", {
      refuelAmountOverride: refuelToFullAmount,
    });
  }, [handleShipOperation, shipTelemetry, showToast]);

  const selectedScannerContact = useMemo(
    () => scannerContacts.find((contact) => contact.id === scannerSelectedContactId) ?? null,
    [scannerContacts, scannerSelectedContactId],
  );

  const selectedScannerDockStationId = useMemo(() => {
    if (!selectedScannerContact || selectedScannerContact.contact_type !== "station") {
      return null;
    }
    const match = selectedScannerContact.id.match(/^station-(\d+)$/i);
    if (!match) {
      return null;
    }
    const parsedStationId = Number(match[1]);
    return Number.isInteger(parsedStationId) && parsedStationId > 0 ? parsedStationId : null;
  }, [selectedScannerContact]);

  const activeDockTargetStationId = selectedScannerDockStationId ?? jumpTargetStationId;

  const activeDockTargetContact = useMemo(() => {
    if (!activeDockTargetStationId) {
      return null;
    }
    const targetContactId = `station-${activeDockTargetStationId}`;
    return scannerContacts.find((contact) => contact.id === targetContactId) ?? null;
  }, [activeDockTargetStationId, scannerContacts]);

  const flightWaypointContactId = useMemo(() => {
    if (flightDockingApproachTargetContactId) {
      return flightDockingApproachTargetContactId;
    }
    if (flightDestinationLockedContactId) {
      return flightDestinationLockedContactId;
    }
    if (!flightDestinationLockedId) {
      return null;
    }
    return `station-${flightDestinationLockedId}`;
  }, [flightDestinationLockedContactId, flightDockingApproachTargetContactId, flightDestinationLockedId]);

  const scannerLiveContactMap = useMemo(() => {
    const map = new Map<string, ScannerLiveContact>();
    scannerLiveContacts.forEach((contact) => {
      map.set(contact.id, contact);
    });
    return map;
  }, [scannerLiveContacts]);

  const liveStationAnchoredShipPosition = useMemo(() => {
    if (!localChartData?.stations?.length) {
      return null;
    }

    const scannerContactById = new Map(
      scannerContacts.map((contact) => [contact.id, contact]),
    );
    const stationById = new Map(
      localChartData.stations.map((station) => [station.id, station]),
    );

    for (const liveContact of scannerLiveContacts) {
      const scannerContact = scannerContactById.get(liveContact.id);
      if (!scannerContact || scannerContact.contact_type !== "station") {
        continue;
      }

      const stationId = parseStationContactId(scannerContact.id);
      if (!stationId) {
        continue;
      }

      const station = stationById.get(stationId);
      if (!station) {
        continue;
      }

      return {
        x: station.position_x - (liveContact.relative_x * STATION_SCENE_TO_WORLD_SCALE_XZ),
        y: station.position_y - (liveContact.relative_y * STATION_SCENE_TO_WORLD_SCALE_Y),
        z: station.position_z - (liveContact.relative_z * STATION_SCENE_TO_WORLD_SCALE_XZ),
      };
    }

    return null;
  }, [localChartData?.stations, scannerContacts, scannerLiveContacts]);

  const activeDockTargetLiveContact = useMemo(() => {
    if (!activeDockTargetContact) {
      return null;
    }
    return scannerLiveContactMap.get(activeDockTargetContact.id) ?? null;
  }, [activeDockTargetContact, scannerLiveContactMap]);

  const activeDockTargetDistanceKm = useMemo(() => {
    if (activeDockTargetLiveContact) {
      return Number.isFinite(activeDockTargetLiveContact.distance)
        ? Math.max(0, activeDockTargetLiveContact.distance)
        : null;
    }
    if (activeDockTargetContact && Number.isFinite(activeDockTargetContact.distance_km)) {
      return Math.max(0, activeDockTargetContact.distance_km);
    }
    return null;
  }, [activeDockTargetContact, activeDockTargetLiveContact]);

  const activeDockTargetDistanceMode = useMemo<"surface" | "port">(() => {
    const isLivePortDistance = activeDockTargetLiveContact?.distance_mode === "port";
    const isLiveDockingTarget = (
      activeDockTargetContact !== null
      && activeDockTargetContact.id === flightDockingApproachTargetContactId
    );
    if (isDockingApproachActive && isLivePortDistance && isLiveDockingTarget) {
      return "port";
    }
    return "surface";
  }, [
    activeDockTargetContact,
    activeDockTargetLiveContact?.distance_mode,
    flightDockingApproachTargetContactId,
    isDockingApproachActive,
  ]);

  const dockingComputerRangeKm = useMemo(
    () => (shipTelemetry ? shipTelemetry.docking_computer_range_km : null),
    [shipTelemetry],
  );

  const isDockTargetWithinRange = useMemo(() => {
    if (activeDockTargetDistanceKm === null || dockingComputerRangeKm === null) {
      return null;
    }
    return activeDockTargetDistanceKm <= dockingComputerRangeKm;
  }, [activeDockTargetDistanceKm, dockingComputerRangeKm]);

  const dockTargetRangeLabel = useMemo(() => {
    if (!activeDockTargetContact) {
      return "No station target selected";
    }

    const isDockedAtActiveTarget = (
      dockedAtStation
      && shipTelemetry?.docked_station_id !== null
      && shipTelemetry?.docked_station_id === activeDockTargetStationId
    );
    if (isDockedAtActiveTarget) {
      return `${activeDockTargetContact.name} · Docked`;
    }

    if (activeDockTargetDistanceKm !== null && dockingComputerRangeKm !== null) {
      const distanceModeLabel = activeDockTargetDistanceMode === "port" ? "PORT" : "SURFACE";
      return `${activeDockTargetContact.name} · ${formatScannerDistanceKm(activeDockTargetDistanceKm)} ${distanceModeLabel} / ${formatScannerDistanceKm(dockingComputerRangeKm)} · ${isDockTargetWithinRange ? "IN RANGE" : "OUT OF RANGE"}`;
    }

    return `${activeDockTargetContact.name} · range unknown`;
  }, [
    activeDockTargetContact,
    activeDockTargetDistanceKm,
    activeDockTargetDistanceMode,
    activeDockTargetStationId,
    dockedAtStation,
    dockingComputerRangeKm,
    isDockTargetWithinRange,
    shipTelemetry?.docked_station_id,
  ]);

  const dockDisabledReason = useMemo(() => {
    if (shipOpsLoading) {
      return "Ship operation in progress.";
    }
    if (isFlightTransitActive) {
      return "Docking/undocking transit in progress.";
    }
    if (isDockingApproachActive) {
      return "Docking approach already in progress.";
    }
    if (dockedAtStation) {
      return "Ship is already docked.";
    }
    if (shipTelemetry?.status !== "in-space") {
      return "Ship must be in-space to dock.";
    }
    if (!activeDockTargetStationId) {
      return "Select a station target before docking.";
    }
    if (activeDockTargetDistanceKm === null) {
      return "Target distance unavailable. Refresh scanner contacts.";
    }
    if (dockingComputerRangeKm === null) {
      return "Docking computer range unavailable.";
    }
    if (activeDockTargetDistanceKm > dockingComputerRangeKm) {
      const distanceModeLabel = activeDockTargetDistanceMode === "port" ? "port" : "surface";
      return (
        `Docking computer out of range `
        + `(${activeDockTargetDistanceKm.toFixed(1)}km ${distanceModeLabel} > ${dockingComputerRangeKm.toFixed(1)}km).`
      );
    }
    return "";
  }, [
    activeDockTargetDistanceKm,
    activeDockTargetDistanceMode,
    activeDockTargetStationId,
    dockedAtStation,
    dockingComputerRangeKm,
    isFlightTransitActive,
    isDockingApproachActive,
    shipOpsLoading,
    shipTelemetry?.status,
  ]);

  const isDockDisabled = dockDisabledReason.length > 0;

  const scannerFovHalfAngleDegrees = useMemo(() => {
    const sample = scannerLiveContacts.find((contact) => Number.isFinite(contact.horizontal_fov_degrees));
    const horizontalFovDegrees = sample?.horizontal_fov_degrees ?? 96;
    const halfAngle = horizontalFovDegrees / 2;
    return Math.max(12, Math.min(75, halfAngle));
  }, [scannerLiveContacts]);

  const scannerFovWedgeStyle = useMemo(
    () => ({ "--scanner-fov-half-angle": `${scannerFovHalfAngleDegrees.toFixed(1)}deg` }) as CSSProperties,
    [scannerFovHalfAngleDegrees],
  );

  const scannerHudContacts = useMemo<ScannerHudContact[]>(() => (
    scannerContacts.map((contact) => {
      const scannerPlaneRangeKm = Math.max(1, scannerRangeKm);
      const scannerAltitudeRangeKm = Math.max(10, scannerPlaneRangeKm * 0.44);
      const live = scannerLiveContactMap.get(contact.id);
      const isInView = live?.in_view ?? true;

      const effectiveDistanceKm = resolveScannerDisplayDistanceKm(
        contact.distance_km,
        live?.distance,
      );
      const isBeyondScannerRange = effectiveDistanceKm > scannerRangeKm;

      const fallbackPlaneX = Math.max(-1, Math.min(1, contact.scene_x / scannerPlaneRangeKm));
      const fallbackPlaneY = Math.max(-1, Math.min(1, (-contact.scene_z) / scannerPlaneRangeKm));
      const fallbackAltitude = Math.max(-1, Math.min(1, contact.scene_y / scannerAltitudeRangeKm));

      const rawPlaneX = live
        ? (isInView ? Math.max(-1, Math.min(1, live.fov_x)) : live.plane_x)
        : fallbackPlaneX;
      const rawPlaneY = live
        ? (isInView ? Math.max(-1, Math.min(1, live.fov_y)) : live.plane_y)
        : fallbackPlaneY;
      const rawAltitude = live
        ? (isInView ? 0 : live.altitude)
        : fallbackAltitude;

      const visibleOnScannerGrid = (
        !isBeyondScannerRange
        && (live
          ? (
            Math.abs(rawPlaneX) <= 1
            && Math.abs(rawPlaneY) <= 1
            && Math.abs(rawAltitude) <= 1
          )
          : true)
      );

      const planeX = Math.max(-1, Math.min(1, rawPlaneX));
      const planeY = Math.max(-1, Math.min(1, rawPlaneY));
      const projectedAltitude = Math.max(-1, Math.min(1, rawAltitude));
      const altitude = Math.abs(projectedAltitude) < 0.08 ? 0 : projectedAltitude;

      const SCANNER_CENTER_PERCENT = 58;
      const SCANNER_X_RANGE_PERCENT = 42;
      const SCANNER_Y_RANGE_PERCENT = 39;
      const SCANNER_ALTITUDE_RANGE_PERCENT = 18;
      const SCANNER_DISTANCE_NEAR_KM = 4;
      const SCANNER_DISTANCE_FAR_KM = Math.max(SCANNER_DISTANCE_NEAR_KM + 1, scannerRangeKm);
      const SCANNER_PLANE_TOP_PERCENT = 44;
      const SCANNER_PLANE_BOTTOM_PERCENT = 88;
      const SCANNER_PLANE_CENTER_Y_PERCENT =
        (SCANNER_PLANE_TOP_PERCENT + SCANNER_PLANE_BOTTOM_PERCENT) / 2;
      const SCANNER_PLANE_RADIUS_Y_PERCENT =
        (SCANNER_PLANE_BOTTOM_PERCENT - SCANNER_PLANE_TOP_PERCENT) / 2;
      const SCANNER_PLANE_VISUAL_PADDING_PERCENT = 2.2;

      const planeTop = (() => {
        if (live && isInView) {
          const normalizedDistance = Math.max(0, Math.min(
            1,
            (effectiveDistanceKm - SCANNER_DISTANCE_NEAR_KM)
            / (SCANNER_DISTANCE_FAR_KM - SCANNER_DISTANCE_NEAR_KM),
          ));
          const distanceDepthFactor = Math.sqrt(normalizedDistance);
          return clampPercent(SCANNER_CENTER_PERCENT - (distanceDepthFactor * 30));
        }

        const rawPlaneTop = clampPercent(SCANNER_CENTER_PERCENT - (planeY * SCANNER_Y_RANGE_PERCENT));
        const planeEllipseVerticalFactor = Math.sqrt(
          Math.max(0, 1 - (planeX * planeX)),
        );
        const planeTopBound = SCANNER_PLANE_CENTER_Y_PERCENT
          - (SCANNER_PLANE_RADIUS_Y_PERCENT * planeEllipseVerticalFactor);
        const planeBottomBound = SCANNER_PLANE_CENTER_Y_PERCENT
          + (SCANNER_PLANE_RADIUS_Y_PERCENT * planeEllipseVerticalFactor);
        const paddedPlaneTopBound = Math.min(
          planeBottomBound,
          planeTopBound + SCANNER_PLANE_VISUAL_PADDING_PERCENT,
        );
        const paddedPlaneBottomBound = Math.max(
          planeTopBound,
          planeBottomBound - SCANNER_PLANE_VISUAL_PADDING_PERCENT,
        );
        return Math.max(
          paddedPlaneTopBound,
          Math.min(paddedPlaneBottomBound, rawPlaneTop),
        );
      })();

      const left = (() => {
        if (live && isInView) {
          const dyFromOrigin = Math.max(0, SCANNER_CENTER_PERCENT - planeTop);
          const halfAngleRadians = (scannerFovHalfAngleDegrees * Math.PI) / 180;
          const wedgeHalfWidth = Math.max(
            2,
            dyFromOrigin * Math.tan(halfAngleRadians),
          );
          return clampPercent(50 + (planeX * wedgeHalfWidth));
        }
        return clampPercent(SCANNER_CENTER_PERCENT + planeX * SCANNER_X_RANGE_PERCENT);
      })();

      const dotTop = live && isInView
        ? planeTop
        : clampPercent(planeTop - altitude * SCANNER_ALTITUDE_RANGE_PERCENT);

      return {
        ...contact,
        left,
        planeTop,
        dotTop,
        altitude,
        inView: isInView,
        isBeyondScannerRange,
        relativeX: live?.relative_x ?? contact.scene_x,
        relativeY: live?.relative_y ?? contact.scene_y,
        relativeZ: live?.relative_z ?? contact.scene_z,
        displayDistance: effectiveDistanceKm,
        visibleOnScannerGrid,
        planeX,
        planeY,
        fovX: live?.fov_x ?? 0,
        fovY: live?.fov_y ?? 0,
        forwardDistance: live?.forward_distance ?? 0,
        scannerLeft: left,
        scannerTop: planeTop,
      };
    })
  ), [scannerContacts, scannerFovHalfAngleDegrees, scannerLiveContactMap, scannerRangeKm]);

  const scannerOutOfRangeContactCount = useMemo(
    () => scannerHudContacts.filter((contact) => contact.isBeyondScannerRange).length,
    [scannerHudContacts],
  );

  const selectedScannerHudContact = useMemo(
    () => scannerHudContacts.find((contact) => contact.id === scannerSelectedContactId) ?? null,
    [scannerHudContacts, scannerSelectedContactId],
  );

  const scannerHudContactsForList = useMemo<ScannerHudContact[]>(() => {
    if (!scannerSelectedContactId) {
      return scannerHudContacts;
    }
    const selectedContact = scannerHudContacts.find(
      (contact) => contact.id === scannerSelectedContactId,
    );
    if (!selectedContact) {
      return scannerHudContacts;
    }
    return [
      selectedContact,
      ...scannerHudContacts.filter((contact) => contact.id !== scannerSelectedContactId),
    ];
  }, [scannerHudContacts, scannerSelectedContactId]);

  const scannerCelestialAnchors = useMemo(
    () => {
      if (localChartData) {
        return buildFlightCelestialAnchors(localChartData, scannerContacts).slice(0, 24);
      }

      return scannerContacts
        .filter((contact) => (
          contact.contact_type === "star"
          || contact.contact_type === "planet"
          || contact.contact_type === "moon"
        ))
        .slice(0, 10);
    },
    [localChartData, scannerContacts],
  );

  const toggleFlightDestinationLock = useCallback(() => {
    if (isDockingApproachActive) {
      setShipOpsStatus("Docking approach in progress. Wait for docking completion.");
      return;
    }

    const selectedId = jumpTargetStationId;
    const isValid = selectedId !== null;
    if (!isValid) {
      setShipOpsStatus("Choose a valid destination system and station before locking waypoint.");
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      return;
    }

    if (flightDestinationLockedId === selectedId) {
      setFlightDestinationLockedId(null);
      setFlightDestinationLockedContactId(null);
      setFlightJumpPhase(FLIGHT_PHASE.IDLE);
      setFlightJumpProgress(0);
      setShipOpsStatus("Waypoint lock released.");
      void persistFlightState(FLIGHT_PHASE.IDLE, null);
      void updateLocalTargetIntent("clear", null);
      return;
    }

    const stationContactId = `station-${selectedId}`;
    setFlightDestinationLockedId(selectedId);
    setFlightDestinationLockedContactId(stationContactId);
    setFlightJumpPhase(FLIGHT_PHASE.DESTINATION_LOCKED);
    setFlightJumpProgress(0);
    setShipOpsStatus(`Waypoint locked to ${jumpTargetSystemLabel} · ${jumpTargetStationLabel}.`);
    void persistFlightState(FLIGHT_PHASE.DESTINATION_LOCKED, selectedId, stationContactId);
    void updateLocalTargetIntent("lock", stationContactId);
  }, [
    flightDestinationLockedId,
    isDockingApproachActive,
    jumpTargetStationId,
    jumpTargetStationLabel,
    jumpTargetSystemLabel,
    persistFlightState,
    updateLocalTargetIntent,
  ]);

  const handleFlightJumpSequence = useCallback(async (
    options?: { jumpMode?: "system" | "hyperspace" },
  ) => {
    const jumpMode = options?.jumpMode ?? "system";

    if (isDockingApproachActive) {
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setShipOpsStatus("Docking approach in progress. Wait before initiating jump.");
      return;
    }

    if (!token) {
      return;
    }

    const stationJumpTargetId = jumpMode === "hyperspace"
      ? flightDestinationLockedId
      : null;
    const localTransferTargetContactId = jumpMode === "system"
      ? localTransferJumpTargetContactId
      : null;

    if (jumpMode === "system" && !localTransferTargetContactId) {
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setShipOpsStatus("Lock a system waypoint before initiating jump.");
      return;
    }

    if (jumpMode === "hyperspace" && !stationJumpTargetId) {
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setShipOpsStatus("Lock hyperspace target before initiating jump.");
      return;
    }

    if (jumpMode === "hyperspace" && flightJumpCooldownSeconds > 0) {
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setShipOpsStatus(`Jump cooldown active (${flightJumpCooldownSeconds}s remaining).`);
      return;
    }

    if (shipTelemetry?.status !== "in-space") {
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setShipOpsStatus("Undock before initiating jump.");
      return;
    }

    if (jumpMode === "hyperspace" && (shipTelemetry?.fuel_current ?? 0) < JUMP_FUEL_COST) {
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setShipOpsStatus(`Insufficient fuel for jump (${shipTelemetry?.fuel_current ?? 0}/${JUMP_FUEL_COST}).`);
      return;
    }

    setFlightJumpVisualMode(jumpMode === "hyperspace" ? "hyperspace" : "none");
    if (jumpMode === "hyperspace") {
      flightJumpPhaseLockUntilRef.current = Date.now() + 10_000;
    }

    setFlightJumpPhase(FLIGHT_PHASE.CHARGING);
    if (jumpMode === "hyperspace") {
      dispatchFlightAudioEvent("jump.hyperspace_charge_start", {
        station_id: stationJumpTargetId,
        system_id: Number(selectedJumpSystemId),
      });
    }
    void persistFlightState(
      FLIGHT_PHASE.CHARGING,
      stationJumpTargetId,
      jumpMode === "hyperspace"
        ? flightDestinationLockedContactId
        : localTransferTargetContactId,
    );
    setFlightJumpProgress(0);
    const chargeStep = jumpMode === "hyperspace" ? 5 : 10;
    const chargeSleepMs = jumpMode === "hyperspace" ? 170 : 145;
    const chargeMax = jumpMode === "hyperspace" ? 70 : 60;
    for (let progress = 0; progress <= chargeMax; progress += chargeStep) {
      setFlightJumpProgress(progress);
      await sleep(chargeSleepMs);
    }

    setFlightJumpPhase(FLIGHT_PHASE.JUMPING);
    if (jumpMode === "hyperspace") {
      dispatchFlightAudioEvent("jump.hyperspace_transit_peak", {
        station_id: stationJumpTargetId,
        system_id: Number(selectedJumpSystemId),
      });
    }
    void persistFlightState(
      FLIGHT_PHASE.JUMPING,
      stationJumpTargetId,
      jumpMode === "hyperspace"
        ? flightDestinationLockedContactId
        : localTransferTargetContactId,
    );
    const jumpStart = jumpMode === "hyperspace" ? 72 : 65;
    const jumpMax = jumpMode === "hyperspace" ? 96 : 92;
    const jumpStep = jumpMode === "hyperspace" ? 3 : 3;
    const jumpSleepMs = jumpMode === "hyperspace" ? 170 : 125;
    for (let progress = jumpStart; progress <= jumpMax; progress += jumpStep) {
      setFlightJumpProgress(progress);
      await sleep(jumpSleepMs);
    }

    if (jumpMode === "system" && localTransferTargetContactId) {
      const localTransferTargetName = scannerContacts.find(
        (contact) => contact.id === localTransferTargetContactId,
      )?.name ?? localTransferTargetContactId;
      const transferTelemetry = await updateLocalTargetIntent(
        "transfer",
        localTransferTargetContactId,
      );

      void fetchScannerContacts({ silent: true });
      if (scannerSystemId) {
        void fetchLocalChart(scannerSystemId, { silent: true });
      }
      void fetchCommanderProfile();

      setFlightJumpPhase(FLIGHT_PHASE.ARRIVED);
      triggerFlightJumpCompletionEffects({
        contact_id: localTransferTargetContactId,
        contact_name: localTransferTargetName,
      }, { jumpMode: "system" });
      setFlightJumpProgress(100);
      setShipOpsStatus(
        transferTelemetry
          ? `Local transfer complete. Arrived near ${localTransferTargetName}.`
          : `Local transfer complete (client fallback). Arrived near ${localTransferTargetName}.`,
      );
      window.setTimeout(() => {
        setFlightJumpPhase(FLIGHT_PHASE.DESTINATION_LOCKED);
        setFlightJumpProgress(0);
        void persistFlightState(
          FLIGHT_PHASE.DESTINATION_LOCKED,
          null,
          localTransferTargetContactId,
        );
      }, 1200);
      return;
    }

    if (!stationJumpTargetId) {
      flightJumpPhaseLockUntilRef.current = 0;
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setShipOpsStatus("Lock hyperspace target before initiating jump.");
      setFlightJumpProgress(0);
      return;
    }

    const success = await handleShipOperation("jump", {
      stationIdOverride: stationJumpTargetId,
      systemIdOverride: Number(selectedJumpSystemId),
    });

    if (success) {
      setFlightJumpPhase(FLIGHT_PHASE.ARRIVED);
      triggerFlightJumpCompletionEffects({
        station_id: stationJumpTargetId,
        system_id: Number(selectedJumpSystemId),
      }, { jumpMode: "hyperspace" });
      setFlightJumpProgress(100);
      setFlightDestinationLockedId(null);
      setFlightDestinationLockedContactId(null);
      setShipOpsStatus(
        `Hyperspace exit complete in ${jumpTargetSystemLabel}. You emerged at safe range; open System map to lock a local waypoint, then jump-transfer toward your destination.`,
      );
      window.setTimeout(() => {
        flightJumpPhaseLockUntilRef.current = 0;
        setFlightJumpPhase(FLIGHT_PHASE.IDLE);
        setFlightJumpProgress(0);
        void persistFlightState(
          FLIGHT_PHASE.IDLE,
          null,
          null,
        );
      }, 1200);
      return;
    }

    setFlightJumpPhase(FLIGHT_PHASE.ERROR);
    flightJumpPhaseLockUntilRef.current = 0;
    void persistFlightState(
      FLIGHT_PHASE.ERROR,
      stationJumpTargetId,
      jumpMode === "hyperspace"
        ? flightDestinationLockedContactId
        : localTransferTargetContactId,
    );
    setFlightJumpProgress(0);
  }, [
    dispatchFlightAudioEvent,
    flightDestinationLockedId,
    flightDestinationLockedContactId,
    flightJumpCooldownSeconds,
    localTransferJumpTargetContactId,
    isDockingApproachActive,
    handleShipOperation,
    persistFlightState,
    fetchCommanderProfile,
    fetchLocalChart,
    fetchScannerContacts,
    scannerContacts,
    scannerSystemId,
    selectedJumpSystemId,
    shipTelemetry?.fuel_current,
    shipTelemetry?.status,
    token,
    triggerFlightJumpCompletionEffects,
    updateLocalTargetIntent,
    jumpTargetSystemLabel,
  ]);

  const handleGalaxyInitiateJump = useCallback(() => {
    if (isGalaxyJumpDisabled) {
      return;
    }

    if (shipTelemetry?.status !== "in-space") {
      const message = "Undock before initiating jump.";
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setShipOpsStatus(message);
      showToast({ message, variant: "warning" });
      return;
    }

    if (flightJumpCooldownSeconds > 0) {
      const message = `Jump cooldown active (${flightJumpCooldownSeconds}s remaining).`;
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setShipOpsStatus(message);
      showToast({ message, variant: "warning" });
      return;
    }

    if ((shipTelemetry?.fuel_current ?? 0) < JUMP_FUEL_COST) {
      const message = (
        `Insufficient fuel for jump (${shipTelemetry?.fuel_current ?? 0}/${JUMP_FUEL_COST}).`
      );
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setShipOpsStatus(message);
      showToast({ message, variant: "warning" });
      return;
    }

    void handleFlightJumpSequence({ jumpMode: "hyperspace" });
  }, [
    flightJumpCooldownSeconds,
    handleFlightJumpSequence,
    isGalaxyJumpDisabled,
    shipTelemetry?.fuel_current,
    shipTelemetry?.status,
    showToast,
  ]);

  const syncShipPositionDuringFlight = useCallback(async (
    nextPosition: { x: number; y: number; z: number },
  ): Promise<void> => {
    if (!token) {
      return;
    }

    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/ships/${parsedShipId}/position-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          position_x: nextPosition.x,
          position_y: nextPosition.y,
          position_z: nextPosition.z,
        }),
      });
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setShipTelemetry(data);
      flightPositionSyncLastCoordsRef.current = nextPosition;

      const now = Date.now();
      if (now - flightPositionSyncLastScannerRefreshAtRef.current >= 1500) {
        flightPositionSyncLastScannerRefreshAtRef.current = now;
        void fetchScannerContacts({ silent: true });
      }
    } catch {
      return;
    }
  }, [
    fetchScannerContacts,
    shipId,
    token,
  ]);

  const resetDockingApproachState = useCallback(() => {
    setFlightDockingApproachTargetStationId(null);
    setFlightDockingApproachTargetContactId(null);
    dockingApproachCompletionInFlightRef.current = false;
    dockingApproachLastProgressRef.current = -1;
    dockingApproachLastDistanceRef.current = Number.NaN;
    dockingContactResyncAttemptAtRef.current = 0;
    dockingContactResyncAttemptsRef.current = 0;
  }, []);

  const clearFlightTransitTimer = useCallback(() => {
    if (flightTransitTimerRef.current !== null) {
      window.clearInterval(flightTransitTimerRef.current);
      flightTransitTimerRef.current = null;
    }
  }, []);

  const runFlightTransitCinematic = useCallback((
    phase: FlightJumpPhase,
    durationMs: number,
    stationLabel: string,
    startStatus: string,
    completeStatus: string,
    completeAudioEvent: FlightAudioEventName,
    onComplete?: () => void,
  ): void => {
    clearFlightTransitTimer();

    setActiveMode("flight");
    setFlightTransitStationLabel(stationLabel);
    setFlightJumpPhase(phase);
    setFlightJumpProgress(0);
    setShipOpsStatus(startStatus);
    dispatchFlightAudioEvent("dock.transit_enter", {
      station_name: stationLabel,
      phase,
    });

    const startedAt = Date.now();
    flightTransitPhaseLockUntilRef.current = startedAt + durationMs + 300;

    flightTransitTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = clampPercent((elapsed / durationMs) * 100);
      setFlightJumpProgress(progress);
      if (elapsed < durationMs) {
        return;
      }

      clearFlightTransitTimer();
      dispatchFlightAudioEvent(completeAudioEvent, {
        station_name: stationLabel,
        phase,
      });
      setFlightJumpPhase(FLIGHT_PHASE.IDLE);
      setFlightJumpProgress(0);
      setFlightTransitStationLabel(null);
      setShipOpsStatus(completeStatus);
      onComplete?.();
    }, 40);
  }, [clearFlightTransitTimer, dispatchFlightAudioEvent]);

  const runDockInboundTransitCinematic = useCallback((stationLabel: string): void => {
    runFlightTransitCinematic(
      FLIGHT_PHASE.DOCKING_TRANSIT_IN,
      FLIGHT_DOCKING_TRANSIT_DURATION_MS,
      stationLabel,
      `Docking tunnel engaged. Inbound to ${stationLabel}...`,
      `Docking complete at ${stationLabel}.`,
      "dock.transit_exit",
    );
  }, [runFlightTransitCinematic]);

  const runUndockOutboundTransitCinematic = useCallback((
    stationLabel: string,
    stationContactId: string | null,
  ): void => {
    runFlightTransitCinematic(
      FLIGHT_PHASE.UNDOCKING_TRANSIT_OUT,
      FLIGHT_UNDOCKING_TRANSIT_DURATION_MS,
      stationLabel,
      `Undocking transit corridor active. Exiting ${stationLabel}...`,
      `Undock complete. Cleared ${stationLabel}.`,
      "nav.approach_ready",
      () => {
        if (!stationContactId) {
          return;
        }
        setFlightSpawnDirective({
          mode: "undock-exit",
          stationContactId,
          nonce: Date.now(),
        });
      },
    );
  }, [runFlightTransitCinematic]);

  const handleFlightDockingApproachProgress = useCallback(
    ({ progress, distanceKm, targetName, stage }: FlightDockingApproachProgress): void => {
      if (!isDockingApproachActive) {
        return;
      }

      const normalizedProgress = clampPercent(progress);
      if (normalizedProgress > flightJumpProgress) {
        setFlightJumpProgress(normalizedProgress);
      }

      const lastProgress = dockingApproachLastProgressRef.current;
      const lastDistance = dockingApproachLastDistanceRef.current;
      const shouldUpdateStatus = (
        Math.abs(normalizedProgress - lastProgress) >= 3
        || !Number.isFinite(lastDistance)
        || Math.abs(distanceKm - lastDistance) >= 2
      );
      if (!shouldUpdateStatus) {
        return;
      }

      dockingApproachLastProgressRef.current = normalizedProgress;
      dockingApproachLastDistanceRef.current = distanceKm;
      const stageLabel = stage === "hold-entry"
        ? "safe hold-point maneuver"
        : stage === "hold-align"
          ? "hold-point alignment"
          : "final docking approach";
      setShipOpsStatus(
        `Docking approach to ${targetName}: ${stageLabel} · ${distanceKm.toFixed(1)} km (${normalizedProgress.toFixed(0)}%).`,
      );
    },
    [flightJumpProgress, isDockingApproachActive],
  );

  const handleFlightDockingApproachComplete = useCallback(async (): Promise<void> => {
    const stationId = flightDockingApproachTargetStationId;
    if (!stationId || dockingApproachCompletionInFlightRef.current) {
      return;
    }

    const stationLabel = activeDockTargetContact?.name || `Station ${stationId}`;

    dockingApproachCompletionInFlightRef.current = true;
    setFlightJumpProgress(100);
    setShipOpsStatus("Final approach complete. Requesting docking clamps...");

    const success = await handleShipOperation("dock", {
      stationIdOverride: stationId,
    });

    resetDockingApproachState();

    if (success) {
      runDockInboundTransitCinematic(stationLabel);
      return;
    }

    setFlightJumpPhase(FLIGHT_PHASE.ERROR);
    setFlightJumpProgress(0);
    void persistFlightState(FLIGHT_PHASE.ERROR, null);
  }, [
    activeDockTargetContact?.name,
    flightDockingApproachTargetStationId,
    handleShipOperation,
    persistFlightState,
    resetDockingApproachState,
    runDockInboundTransitCinematic,
  ]);

  const handleCancelDockingApproach = useCallback((): void => {
    if (!isDockingApproachActive) {
      return;
    }
    if (shipOpsLoading) {
      setShipOpsStatus("Docking request in progress. Cancellation unavailable.");
      return;
    }

    resetDockingApproachState();
    setFlightJumpPhase(FLIGHT_PHASE.IDLE);
    setFlightJumpProgress(0);
    setShipOpsStatus("Docking approach cancelled. Manual flight control restored.");
    void persistFlightState(FLIGHT_PHASE.IDLE, null);
  }, [
    isDockingApproachActive,
    persistFlightState,
    resetDockingApproachState,
    shipOpsLoading,
  ]);

  const handleDockCommand = useCallback(
    async (stationIdOverride?: number): Promise<void> => {
      if (isDockingApproachActive) {
        setShipOpsStatus("Docking approach already in progress.");
        return;
      }

      const parsedDockStationId = stationIdOverride ?? Number(dockStationId);
      if (!Number.isInteger(parsedDockStationId) || parsedDockStationId <= 0) {
        setShipOpsStatus("Select a valid docking station before docking.");
        return;
      }

      const targetContactId = `station-${parsedDockStationId}`;
      const targetContact = scannerContacts.find((contact) => contact.id === targetContactId);

      if (!targetContact) {
        setActiveMode("flight");
        setFlightJumpPhase(FLIGHT_PHASE.DOCKING_APPROACH);
        setFlightJumpProgress(0);
        setFlightDockingApproachTargetStationId(parsedDockStationId);
        setFlightDockingApproachTargetContactId(targetContactId);
        setShipOpsStatus("Docking target syncing with scanner feed...");
        void persistFlightState(FLIGHT_PHASE.DOCKING_APPROACH, parsedDockStationId);
        return;
      }

      setActiveMode("flight");
      setFlightJumpPhase(FLIGHT_PHASE.DOCKING_APPROACH);
      setFlightJumpProgress(0);
      setFlightDockingApproachTargetStationId(parsedDockStationId);
      setFlightDockingApproachTargetContactId(targetContactId);
      setShipOpsStatus(`Docking computer engaged. Approaching ${targetContact.name}...`);
      void persistFlightState(FLIGHT_PHASE.DOCKING_APPROACH, parsedDockStationId);
    },
    [
      dockStationId,
      isDockingApproachActive,
      persistFlightState,
      scannerContacts,
    ],
  );

  const handleUndockCommand = useCallback(async (): Promise<void> => {
    if (shipOpsLoading) {
      return;
    }
    if (isDockingApproachActive) {
      setShipOpsStatus("Cancel docking approach before undocking.");
      return;
    }
    if (isTransitFlightPhase(flightJumpPhase)) {
      setShipOpsStatus("Transit cinematic already in progress.");
      return;
    }
    if (shipTelemetry?.status === "in-space") {
      setShipOpsStatus("Ship is already in-space.");
      return;
    }

    const stationLabel = formatStationLabel(shipTelemetry?.docked_station_id);
    const stationContactId = Number.isInteger(shipTelemetry?.docked_station_id)
      ? `station-${Number(shipTelemetry?.docked_station_id)}`
      : null;
    const success = await handleShipOperation("undock");
    if (!success) {
      return;
    }

    runUndockOutboundTransitCinematic(stationLabel, stationContactId);
  }, [
    flightJumpPhase,
    formatStationLabel,
    handleShipOperation,
    isDockingApproachActive,
    runUndockOutboundTransitCinematic,
    shipOpsLoading,
    shipTelemetry?.docked_station_id,
    shipTelemetry?.status,
  ]);

  useEffect(() => (
    () => {
      clearFlightTransitTimer();
    }
  ), [clearFlightTransitTimer]);

  const handleSystemChartSelectContact = useCallback((contactId: string): void => {
    selectScannerContactWithSource(contactId, "system-chart");

    const selectedStationId = parseStationContactId(contactId);
    if (!selectedStationId) {
      return;
    }

    if (scannerSystemId !== null && Number.isInteger(scannerSystemId) && scannerSystemId > 0) {
      setSelectedJumpSystemId(String(scannerSystemId));
    }
    setDockStationId(String(selectedStationId));
  }, [scannerSystemId, selectScannerContactWithSource]);

  const handleLocalChartSortToggle = useCallback((key: LocalChartSortKey): void => {
    setLocalChartSortState((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key,
        direction: "asc",
      };
    });
  }, []);

  const localChartSortIndicator = useCallback((key: LocalChartSortKey): string => {
    if (localChartSortState.key !== key) {
      return "";
    }
    return localChartSortState.direction === "asc" ? " ↑" : " ↓";
  }, [localChartSortState.direction, localChartSortState.key]);

  const handleSystemChartCycleStationTarget = useCallback((): void => {
    if (!visibleSystemChartStationContacts.length) {
      setShipOpsStatus("No station contacts available in local chart.");
      return;
    }

    const currentIndex = visibleSystemChartStationContacts.findIndex(
      (contact) => contact.id === scannerSelectedContactId,
    );
    const nextIndex = currentIndex >= 0
      ? (currentIndex + 1) % visibleSystemChartStationContacts.length
      : 0;
    const nextContact = visibleSystemChartStationContacts[nextIndex];
    if (!nextContact) {
      return;
    }

    handleSystemChartSelectContact(nextContact.id);
    setShipOpsStatus(`System target cycled to ${nextContact.name}.`);
  }, [
    handleSystemChartSelectContact,
    scannerSelectedContactId,
    setShipOpsStatus,
    visibleSystemChartStationContacts,
  ]);

  const handleSystemChartWaypointToggle = useCallback((): void => {
    if (isDockingApproachActive) {
      setShipOpsStatus("Docking approach in progress. Wait for docking completion.");
      dispatchFlightAudioEvent("nav.invalid_action", {
        reason: "approach-in-progress",
      });
      return;
    }

    const selectedContact = selectedSystemChartContact;
    if (!selectedContact || !selectedSystemChartSupportsWaypoint) {
      setShipOpsStatus("Select a station, planet, or star contact in local chart before locking waypoint.");
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      dispatchFlightAudioEvent("nav.invalid_action", {
        reason: "no-selected-waypoint-contact",
      });
      return;
    }

    if (selectedContact.contact_type === "station") {
      const selectedStationId = parseStationContactId(selectedContact.id);
      if (!selectedStationId) {
        setShipOpsStatus("Select a valid station contact in local chart before locking waypoint.");
        setFlightJumpPhase(FLIGHT_PHASE.ERROR);
        dispatchFlightAudioEvent("nav.invalid_action", {
          reason: "no-selected-station",
        });
        return;
      }

      if (flightDestinationLockedId === selectedStationId) {
        setFlightDestinationLockedId(null);
        setFlightDestinationLockedContactId(null);
        setFlightJumpPhase(FLIGHT_PHASE.IDLE);
        setFlightJumpProgress(0);
        setShipOpsStatus("Waypoint lock released.");
        void persistFlightState(FLIGHT_PHASE.IDLE, null);
        void updateLocalTargetIntent("clear", null);
        return;
      }

      if (scannerSystemId !== null && Number.isInteger(scannerSystemId) && scannerSystemId > 0) {
        setSelectedJumpSystemId(String(scannerSystemId));
      }
      setDockStationId(String(selectedStationId));
      setFlightLocalWaypointContactId(null);
      setFlightDestinationLockedId(selectedStationId);
      setFlightDestinationLockedContactId(selectedContact.id);
      setFlightJumpPhase(FLIGHT_PHASE.DESTINATION_LOCKED);
      setFlightJumpProgress(0);
      setShipOpsStatus(`Waypoint locked to ${selectedSystemChartStationLabel}.`);
      dispatchFlightAudioEvent("nav.target_locked", {
        station_id: selectedStationId,
        station_name: selectedSystemChartStationLabel,
      });
      void persistFlightState(FLIGHT_PHASE.DESTINATION_LOCKED, selectedStationId, selectedContact.id);
      void updateLocalTargetIntent("lock", selectedContact.id);
      return;
    }

    if (flightLocalWaypointContactId === selectedContact.id) {
      setFlightLocalWaypointContactId(null);
      setFlightDestinationLockedContactId(null);
      setFlightJumpPhase(FLIGHT_PHASE.IDLE);
      setFlightJumpProgress(0);
      setShipOpsStatus("Local waypoint lock released.");
      void persistFlightState(FLIGHT_PHASE.IDLE, null);
      void updateLocalTargetIntent("clear", null);
      return;
    }

    setFlightDestinationLockedId(null);
    setFlightDestinationLockedContactId(selectedContact.id);
    setFlightLocalWaypointContactId(selectedContact.id);
    setFlightJumpPhase(FLIGHT_PHASE.DESTINATION_LOCKED);
    setFlightJumpProgress(0);
    setShipOpsStatus(`Local waypoint locked to ${selectedContact.name}. Use Jump in Flight to transfer.`);
    dispatchFlightAudioEvent("nav.target_locked", {
      contact_id: selectedContact.id,
      contact_name: selectedContact.name,
    });
    void persistFlightState(FLIGHT_PHASE.DESTINATION_LOCKED, null, selectedContact.id);
    void updateLocalTargetIntent("lock", selectedContact.id);
  }, [
    dispatchFlightAudioEvent,
    flightDestinationLockedId,
    flightLocalWaypointContactId,
    isDockingApproachActive,
    persistFlightState,
    scannerSystemId,
    selectedSystemChartContact,
    selectedSystemChartStationLabel,
    selectedSystemChartSupportsWaypoint,
    updateLocalTargetIntent,
  ]);

  const handleSystemChartApproach = useCallback(async (): Promise<void> => {
    if (isDockingApproachActive) {
      setShipOpsStatus("Docking approach in progress. Wait for docking completion.");
      dispatchFlightAudioEvent("nav.invalid_action", {
        reason: "approach-in-progress",
      });
      return;
    }

    const selectedContact = selectedSystemChartContact;
    if (!selectedContact || !selectedSystemChartSupportsApproach) {
      setShipOpsStatus("Select a station, planet, or star contact before initiating approach.");
      dispatchFlightAudioEvent("nav.invalid_action", {
        reason: "no-selected-approach-contact",
      });
      return;
    }

    if (selectedContact.contact_type === "ship") {
      setShipOpsStatus("Ship contacts are track-only and cannot be approached.");
      dispatchFlightAudioEvent("nav.invalid_action", {
        reason: "ship-track-only",
      });
      return;
    }

    if (shipTelemetry?.status !== "in-space") {
      setShipOpsStatus("Launch before initiating station approach.");
      dispatchFlightAudioEvent("nav.invalid_action", {
        reason: "ship-not-in-space",
      });
      return;
    }

    if (scannerSystemId !== null && Number.isInteger(scannerSystemId) && scannerSystemId > 0) {
      setSelectedJumpSystemId(String(scannerSystemId));
    }

    if (selectedContact.contact_type !== "station") {
      const lockTelemetry = await updateLocalTargetIntent("lock", selectedContact.id);
      const localTargetAuthorityAvailable = Boolean(lockTelemetry);
      if (flightLocalWaypointContactId !== selectedContact.id) {
        setFlightLocalWaypointContactId(selectedContact.id);
      }
      setFlightDestinationLockedId(null);
      setFlightDestinationLockedContactId(selectedContact.id);

      const celestialDistanceKm = selectedSystemChartDistanceKm;
      if (
        celestialDistanceKm !== null
        && celestialDistanceKm <= LOCAL_TRANSFER_JUMP_RECOMMENDED_DISTANCE_KM
      ) {
        setActiveMode("flight");
        setFlightJumpPhase(FLIGHT_PHASE.DESTINATION_LOCKED);
        setFlightJumpProgress(0);
        dispatchFlightAudioEvent("nav.approach_ready", {
          contact_id: selectedContact.id,
          contact_name: selectedContact.name,
          distance_km: celestialDistanceKm,
        });
        void persistFlightState(FLIGHT_PHASE.DESTINATION_LOCKED, null, selectedContact.id);
        setShipOpsStatus(
          `${localTargetAuthorityAvailable ? "Local approach vector set" : "Local approach vector prepared"} for ${selectedContact.name}. Manual flight recommended (${celestialDistanceKm.toFixed(1)} km).`,
        );
        return;
      }

      setActiveMode("flight");
      setFlightJumpPhase(FLIGHT_PHASE.CHARGING);
      setFlightJumpProgress(0);
      dispatchFlightAudioEvent("jump.charge_start", {
        contact_id: selectedContact.id,
        contact_name: selectedContact.name,
      });
      setShipOpsStatus(
        `Charging local transfer jump to ${selectedContact.name}${celestialDistanceKm !== null
          ? ` (${celestialDistanceKm.toFixed(1)} km)`
          : ""
        }...`,
      );

      for (let progress = 0; progress <= 60; progress += 10) {
        setFlightJumpProgress(progress);
        await sleep(120);
      }

      setFlightJumpPhase(FLIGHT_PHASE.JUMPING);
      dispatchFlightAudioEvent("jump.transit_peak", {
        contact_id: selectedContact.id,
        contact_name: selectedContact.name,
      });
      for (let progress = 65; progress <= 95; progress += 5) {
        setFlightJumpProgress(progress);
        await sleep(115);
      }

      setFlightJumpPhase(FLIGHT_PHASE.ARRIVED);
      const transferTelemetry = await updateLocalTargetIntent("transfer", selectedContact.id);
      void fetchScannerContacts({ silent: true });
      if (scannerSystemId) {
        void fetchLocalChart(scannerSystemId, { silent: true });
      }
      void fetchCommanderProfile();
      triggerFlightJumpCompletionEffects({
        contact_id: selectedContact.id,
        contact_name: selectedContact.name,
      });
      setFlightJumpProgress(100);
      setShipOpsStatus(
        transferTelemetry
          ? `Local transfer complete. Arrived near ${selectedContact.name}.`
          : `Local transfer complete (client fallback). Arrived near ${selectedContact.name}.`,
      );
      window.setTimeout(() => {
        setFlightJumpPhase(FLIGHT_PHASE.DESTINATION_LOCKED);
        setFlightJumpProgress(0);
      }, 900);
      return;
    }

    const selectedStationId = parseStationContactId(selectedContact.id);
    if (!selectedStationId) {
      setShipOpsStatus("Select a valid station contact in local chart before docking approach.");
      dispatchFlightAudioEvent("nav.invalid_action", {
        reason: "invalid-station-contact",
      });
      return;
    }

    setDockStationId(String(selectedStationId));
    const targetContactId = `station-${selectedStationId}`;
    if (flightDestinationLockedId !== selectedStationId) {
      setFlightDestinationLockedId(selectedStationId);
      setFlightDestinationLockedContactId(targetContactId);
      setFlightJumpPhase(FLIGHT_PHASE.DESTINATION_LOCKED);
      setFlightJumpProgress(0);
      void persistFlightState(FLIGHT_PHASE.DESTINATION_LOCKED, selectedStationId, targetContactId);
      void updateLocalTargetIntent("lock", targetContactId);
    }

    const targetLiveContact = scannerLiveContactMap.get(targetContactId) ?? null;
    const targetScannerContact = scannerContacts.find((contact) => contact.id === targetContactId) ?? null;
    const targetDistanceKm = Number.isFinite(targetLiveContact?.distance)
      ? Math.max(0, targetLiveContact?.distance ?? 0)
      : Number.isFinite(targetScannerContact?.distance_km)
        ? Math.max(0, targetScannerContact?.distance_km ?? 0)
        : null;
    const dockingRangeKm = shipTelemetry?.docking_computer_range_km ?? null;

    const shouldJumpApproach = (
      shipTelemetry?.status === "in-space"
      && targetDistanceKm !== null
      && dockingRangeKm !== null
      && targetDistanceKm > dockingRangeKm
    );

    if (shouldJumpApproach) {
      dispatchFlightAudioEvent("jump.charge_start", {
        station_id: selectedStationId,
      });
      setActiveMode("flight");
      setFlightJumpPhase(FLIGHT_PHASE.CHARGING);
      setFlightJumpProgress(0);
      setShipOpsStatus(
        `Target out of docking range (${targetDistanceKm.toFixed(1)}km > ${dockingRangeKm.toFixed(1)}km). Executing jump approach...`,
      );

      for (let progress = 0; progress <= 60; progress += 10) {
        setFlightJumpProgress(progress);
        await sleep(120);
      }

      setFlightJumpPhase(FLIGHT_PHASE.JUMPING);
      dispatchFlightAudioEvent("jump.transit_peak", {
        station_id: selectedStationId,
      });
      for (let progress = 65; progress <= 95; progress += 5) {
        setFlightJumpProgress(progress);
        await sleep(115);
      }

      const jumpSuccess = await handleShipOperation("jump", {
        stationIdOverride: selectedStationId,
        localApproach: true,
      });
      if (!jumpSuccess) {
        setFlightJumpPhase(FLIGHT_PHASE.ERROR);
        setFlightJumpProgress(0);
        return;
      }

      setFlightJumpPhase(FLIGHT_PHASE.ARRIVED);
      triggerFlightJumpCompletionEffects({
        station_id: selectedStationId,
      });
      setFlightJumpProgress(100);
      setShipOpsStatus("Jump corridor exit confirmed. Engaging docking computer...");
      await sleep(240);
    } else {
      dispatchFlightAudioEvent("nav.approach_ready", {
        station_id: selectedStationId,
      });
    }

    await handleDockCommand(selectedStationId);
  }, [
    dispatchFlightAudioEvent,
    triggerFlightJumpCompletionEffects,
    handleDockCommand,
    handleShipOperation,
    flightDestinationLockedId,
    isDockingApproachActive,
    persistFlightState,
    updateLocalTargetIntent,
    fetchCommanderProfile,
    fetchLocalChart,
    fetchScannerContacts,
    scannerLiveContactMap,
    scannerContacts,
    scannerSystemId,
    selectedSystemChartContact,
    selectedSystemChartSupportsApproach,
    flightLocalWaypointContactId,
    selectedSystemChartDistanceKm,
    setActiveMode,
    setFlightJumpPhase,
    setFlightJumpProgress,
    setShipOpsStatus,
    shipTelemetry?.docking_computer_range_km,
    shipTelemetry?.status,
  ]);

  const handleSystemChartFocusInFlight = useCallback((): void => {
    if (!selectedSystemChartContact) {
      setShipOpsStatus("Select a local chart contact before focusing flight view.");
      dispatchFlightAudioEvent("nav.invalid_action", {
        reason: "no-selected-contact",
      });
      return;
    }

    setActiveMode("flight");
    setShipOpsStatus(`Flight focus synced to ${selectedSystemChartContact.name}.`);
  }, [dispatchFlightAudioEvent, selectedSystemChartContact]);

  const handleSystemChartCenterOnSelected = useCallback((): void => {
    if (!selectedSystemChartRawContact) {
      setShipOpsStatus("Select a contact before centering chart view.");
      return;
    }

    setLocalChartView((current) => ({
      ...current,
      center_x: roundLocalChartControlValue(selectedSystemChartRawContact.chart_x),
      center_z: roundLocalChartControlValue(selectedSystemChartRawContact.chart_z),
    }));
  }, [selectedSystemChartRawContact]);

  const handleSystemChartPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>): void => {
    const eventTarget = event.target;
    if (
      eventTarget instanceof Element
      && eventTarget.closest('[data-testid^="system-chart-point-"]')
    ) {
      return;
    }

    systemChartDragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startYaw: localChartView.yaw_deg,
      startPitch: localChartView.pitch_deg,
      startCenterX: localChartView.center_x,
      startCenterZ: localChartView.center_z,
      panMode: true,
    };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [localChartView.center_x, localChartView.center_z, localChartView.pitch_deg, localChartView.yaw_deg]);

  const handleSystemChartPointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>): void => {
    const dragState = systemChartDragStateRef.current;
    if (!dragState.active || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    const panScale = 1 / clampLocalChartZoom(localChartView.zoom);
    setLocalChartView((current) => ({
      ...current,
      center_x: roundLocalChartControlValue(dragState.startCenterX - (deltaX * panScale)),
      center_z: roundLocalChartControlValue(dragState.startCenterZ + (deltaY * panScale)),
    }));
  }, [localChartView.zoom]);

  const handleSystemChartPointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>): void => {
    const dragState = systemChartDragStateRef.current;
    if (dragState.active && dragState.pointerId === event.pointerId) {
      systemChartDragStateRef.current = {
        ...dragState,
        active: false,
        pointerId: -1,
      };
      if (typeof event.currentTarget.releasePointerCapture === "function") {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }, []);

  const handleSystemChartWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>): void => {
    event.preventDefault();
    localChartViewInteractedRef.current = true;
    const zoomDelta = event.deltaY < 0 ? 1.12 : 0.9;
    setLocalChartView((current) => ({
      ...current,
      zoom: roundLocalChartControlValue(clampLocalChartZoom(current.zoom * zoomDelta)),
    }));
  }, []);

  const handleSystemChartKeyboardCamera = useCallback((event: KeyboardEvent): boolean => {
    const key = event.key;
    const code = event.code;

    if (event.shiftKey && (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown")) {
      event.preventDefault();
      localChartViewInteractedRef.current = true;
      setLocalChartView((current) => {
        const panStep = LOCAL_CHART_BUTTON_PAN_PIXELS
          / clampLocalChartZoom(current.zoom);
        return {
          ...current,
          center_x: roundLocalChartControlValue(key === "ArrowLeft"
            ? current.center_x - panStep
            : key === "ArrowRight"
              ? current.center_x + panStep
              : current.center_x),
          center_z: roundLocalChartControlValue(key === "ArrowUp"
            ? current.center_z - panStep
            : key === "ArrowDown"
              ? current.center_z + panStep
              : current.center_z),
        };
      });
      return true;
    }

    if (key === "," || key === "-" || key === "_" || code === "NumpadSubtract") {
      event.preventDefault();
      localChartViewInteractedRef.current = true;
      setLocalChartView((current) => ({
        ...current,
        zoom: roundLocalChartControlValue(clampLocalChartZoom(current.zoom * 0.9)),
      }));
      return true;
    }

    if (key === "." || key === "+" || key === "=" || code === "NumpadAdd") {
      event.preventDefault();
      localChartViewInteractedRef.current = true;
      setLocalChartView((current) => ({
        ...current,
        zoom: roundLocalChartControlValue(clampLocalChartZoom(current.zoom * 1.1)),
      }));
      return true;
    }

    return false;
  }, []);

  const findDirectionalSystemChartPointId = useCallback((
    currentPointId: string,
    directionKey: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
  ): string | null => {
    const currentPoint = systemChartPlot.points.find((point) => point.id === currentPointId);
    if (!currentPoint) {
      return null;
    }

    const candidates = systemChartPlot.points
      .filter((point) => point.id !== currentPointId)
      .map((point) => {
        const deltaX = point.plot_x - currentPoint.plot_x;
        const deltaY = point.plot_y - currentPoint.plot_y;
        return {
          point,
          deltaX,
          deltaY,
        };
      })
      .filter(({ deltaX, deltaY }) => {
        if (directionKey === "ArrowLeft") {
          return deltaX < -1;
        }
        if (directionKey === "ArrowRight") {
          return deltaX > 1;
        }
        if (directionKey === "ArrowUp") {
          return deltaY < -1;
        }
        return deltaY > 1;
      })
      .map(({ point, deltaX, deltaY }) => {
        const primaryDistance = directionKey === "ArrowLeft" || directionKey === "ArrowRight"
          ? Math.abs(deltaX)
          : Math.abs(deltaY);
        const secondaryDistance = directionKey === "ArrowLeft" || directionKey === "ArrowRight"
          ? Math.abs(deltaY)
          : Math.abs(deltaX);

        return {
          point,
          score: primaryDistance + (secondaryDistance * 0.35),
        };
      })
      .sort((left, right) => left.score - right.score);

    return candidates.length ? candidates[0].point.id : null;
  }, [systemChartPlot.points]);

  useEffect(() => {
    if (!isSystemModeActive) {
      autoFittedLocalChartSystemIdRef.current = null;
    }
  }, [isSystemModeActive]);

  useEffect(() => {
    if (
      !isSystemModeActive
      || !localChartData
    ) {
      return;
    }

    const systemId = localChartData.system.id;
    if (autoFittedLocalChartSystemIdRef.current === systemId) {
      return;
    }

    autoFittedLocalChartSystemIdRef.current = systemId;
    localChartViewInteractedRef.current = false;
    setLocalChartView((current) => ({
      ...fittedDefaultLocalChartView,
      scale_mode: current.scale_mode,
    }));
  }, [
    fittedDefaultLocalChartView,
    isSystemModeActive,
    localChartData,
  ]);

  useEffect(() => {
    if (
      !isDockingApproachActive
      || !flightDockingApproachTargetContactId
    ) {
      return;
    }

    const targetInScanner = scannerContacts.some(
      (contact) => contact.id === flightDockingApproachTargetContactId,
    );
    if (targetInScanner) {
      dockingContactResyncAttemptAtRef.current = 0;
      dockingContactResyncAttemptsRef.current = 0;
      return;
    }

    const now = performance.now();
    const elapsedMs = now - dockingContactResyncAttemptAtRef.current;
    if (elapsedMs < 550) {
      return;
    }

    dockingContactResyncAttemptAtRef.current = now;
    dockingContactResyncAttemptsRef.current += 1;

    if (dockingContactResyncAttemptsRef.current > 6) {
      resetDockingApproachState();
      setFlightJumpPhase(FLIGHT_PHASE.ERROR);
      setFlightJumpProgress(0);
      setShipOpsStatus("Docking contact unavailable. Re-select station and retry docking path.");
      void persistFlightState(FLIGHT_PHASE.ERROR, null);
      return;
    }

    setShipOpsStatus(
      `Syncing docking contact (${dockingContactResyncAttemptsRef.current}/6)...`,
    );
    void fetchScannerContacts({ silent: true });
  }, [
    fetchScannerContacts,
    flightDockingApproachTargetContactId,
    isDockingApproachActive,
    persistFlightState,
    resetDockingApproachState,
    scannerContacts,
    setFlightJumpPhase,
    setFlightJumpProgress,
  ]);

  useEffect(() => {
    if (!isDockingApproachActive) {
      return;
    }
    if (shipTelemetry?.status !== "docked") {
      return;
    }

    resetDockingApproachState();
    setFlightJumpPhase(FLIGHT_PHASE.IDLE);
    setFlightJumpProgress(0);
  }, [
    isDockingApproachActive,
    resetDockingApproachState,
    shipTelemetry?.status,
  ]);

  const handleFlightSceneCollision = useCallback(async (
    collision: {
      contactId: string;
      contactType: "ship" | "station" | "planet" | "star" | "moon";
      contactName: string;
      distance: number;
      speed: number;
      severity: "glancing" | "critical";
    },
  ) => {
    if (
      isDockingApproachActive
      || isFlightTransitActive
      || isSafetyCorridorCollisionStatus(flightCollisionStatus)
    ) {
      return;
    }

    if (collisionRecoveryInFlightRef.current || !token) {
      return;
    }

    collisionRecoveryInFlightRef.current = true;
    try {
      const parsedShipId = Number(shipId);
      if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
        return;
      }

      const response = await fetch(`${API_BASE}/api/ships/${parsedShipId}/collision-check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Collision monitor unavailable.";
        showToast({ message, variant: "error" });
        return;
      }

      const payload = data as CollisionCheckResponse;
      setShipTelemetry(payload.ship);
      syncJumpCooldownFromShipTelemetry(payload.ship);
      syncFlightStateFromShipTelemetry(payload.ship);
      setFlightCollisionStatus(sanitizeCollisionStatusMessage(payload.message));

      if (payload.collision) {
        const signature = `${payload.severity}:${payload.object_id ?? "unknown"}:${payload.recovered ? "r" : "n"}`;
        const severityLabel = payload.severity.toUpperCase();
        const objectLabel = payload.object_name ?? payload.object_type ?? "unknown object";
        const distanceLabel = typeof payload.distance_km === "number"
          ? `${payload.distance_km.toFixed(1)}km`
          : "range unknown";
        setFlightRecentImpacts((current) => {
          if (current[0]?.id === signature) {
            return current;
          }
          const nextEntry: FlightImpactEntry = {
            id: signature,
            severity: payload.severity,
            label: `${severityLabel} · ${objectLabel} · ${distanceLabel}`,
          };
          return [nextEntry, ...current].slice(0, 3);
        });
        if (collisionToastSignatureRef.current !== signature) {
          triggerFlightImpactFlash(payload.severity === "critical" ? "critical" : "glancing");
          showToast({
            message: sanitizeCollisionStatusMessage(
              payload.message || `Impact with ${payload.object_name ?? collision.contactName}`,
            ),
            variant: payload.severity === "critical" ? "error" : "warning",
          });
          collisionToastSignatureRef.current = signature;
        }
      } else {
        const normalizedMessage = (payload.message || "").trim().toLowerCase();
        if (normalizedMessage.startsWith("no impact")) {
          collisionToastSignatureRef.current = "";
        }
        clearFlightImpactFlash();
      }

      if (payload.recovered) {
        setFlightSceneResetKey((current) => current + 1);
        await fetchScannerContacts({ silent: true });
      }
    } catch {
      showToast({ message: "Collision monitor unavailable.", variant: "error" });
    } finally {
      collisionRecoveryInFlightRef.current = false;
    }
  }, [
    fetchScannerContacts,
    flightCollisionStatus,
    isFlightTransitActive,
    isDockingApproachActive,
    shipId,
    showToast,
    syncFlightStateFromShipTelemetry,
    syncJumpCooldownFromShipTelemetry,
    token,
    triggerFlightImpactFlash,
    clearFlightImpactFlash,
  ]);

  useEffect(() => {
    if (!isDockingApproachActive) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        const isTypingElement = (
          tagName === "INPUT"
          || tagName === "TEXTAREA"
          || tagName === "SELECT"
          || target.isContentEditable
        );
        if (isTypingElement) {
          return;
        }
      }

      event.preventDefault();
      handleCancelDockingApproach();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleCancelDockingApproach, isDockingApproachActive]);

  useEffect(() => () => {
    if (flightImpactFlashTimeoutRef.current !== null) {
      window.clearTimeout(flightImpactFlashTimeoutRef.current);
      flightImpactFlashTimeoutRef.current = null;
    }
    if (flightJumpCompletionVfxTimeoutRef.current !== null) {
      window.clearTimeout(flightJumpCompletionVfxTimeoutRef.current);
      flightJumpCompletionVfxTimeoutRef.current = null;
    }
    if (flightJumpCompletionClearTimeoutRef.current !== null) {
      window.clearTimeout(flightJumpCompletionClearTimeoutRef.current);
      flightJumpCompletionClearTimeoutRef.current = null;
    }
    if (flightJumpStabilizeAudioTimeoutRef.current !== null) {
      window.clearTimeout(flightJumpStabilizeAudioTimeoutRef.current);
      flightJumpStabilizeAudioTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    if (!token) {
      setStationOptions([]);
      setStorySessions([]);
      setCommanderProfile(null);
      return;
    }
    void fetchStations();
    void fetchStorySessions();
    void fetchCommanderProfile();
  }, [fetchCommanderProfile, fetchStations, fetchStorySessions, token]);

  useEffect(() => {
    if (!authStateHydrated) {
      return;
    }

    if (!token) {
      setShipCargo(null);
      setCargoError(null);
      setShipTelemetry(null);
      setShipTelemetryError(null);
      setScannerContacts([]);
      setScannerSystemId(null);
      setScannerSystemName(null);
      setScannerGenerationVersion(null);
      setScannerContactsError(null);
      setScannerSelectedContactId("");
      setScannerLiveContacts([]);
      setLocalChartData(null);
      setLocalChartError(null);
      setShipOperations([]);
      setShipOperationsError(null);
      return;
    }
    void fetchShipCargo({ silent: true });
    void fetchShipTelemetry({ silent: true });
    void fetchScannerContacts({ silent: true });
    void fetchShipOperations({ silent: true });
  }, [
    authStateHydrated,
    fetchScannerContacts,
    fetchShipCargo,
    fetchShipOperations,
    fetchShipTelemetry,
    token,
  ]);

  useEffect(() => {
    window.localStorage.setItem(
      LOCAL_CHART_LAYERS_STORAGE_KEY,
      JSON.stringify(localChartLayers),
    );
  }, [localChartLayers]);

  useEffect(() => {
    window.localStorage.setItem(
      LOCAL_CHART_VIEW_STORAGE_KEY,
      JSON.stringify(localChartView),
    );
  }, [localChartView]);

  useEffect(() => {
    window.localStorage.setItem(
      LOCAL_CHART_SORT_STORAGE_KEY,
      JSON.stringify(localChartSortState),
    );
  }, [localChartSortState]);

  useEffect(() => {
    window.localStorage.setItem(
      FLIGHT_CONTACT_LABELS_STORAGE_KEY,
      String(showFlightContactLabels),
    );
  }, [showFlightContactLabels]);

  useEffect(() => {
    window.localStorage.setItem(
      FLIGHT_SCANNER_DEBUG_STORAGE_KEY,
      String(showFlightScannerDebug),
    );
  }, [showFlightScannerDebug]);

  useEffect(() => {
    window.localStorage.setItem(
      FLIGHT_AUDIO_ENABLED_STORAGE_KEY,
      String(flightAudioEnabled),
    );
  }, [flightAudioEnabled]);

  useEffect(() => {
    window.localStorage.setItem(
      FLIGHT_AUDIO_ENGINE_STORAGE_KEY,
      flightAudioEngine,
    );
  }, [flightAudioEngine]);

  useEffect(() => {
    window.localStorage.setItem(
      FLIGHT_REDUCED_AUDIO_STORAGE_KEY,
      String(reducedAudioPreferenceEnabled),
    );
  }, [reducedAudioPreferenceEnabled]);

  useEffect(() => {
    if (scannerSelectedContactId) {
      window.localStorage.setItem(
        SCANNER_SELECTED_CONTACT_STORAGE_KEY,
        scannerSelectedContactId,
      );
      return;
    }

    window.localStorage.removeItem(SCANNER_SELECTED_CONTACT_STORAGE_KEY);
  }, [scannerSelectedContactId]);

  useEffect(() => {
    window.localStorage.setItem(
      SCANNER_RANGE_STORAGE_KEY,
      String(scannerRangeKm),
    );
  }, [scannerRangeKm]);

  useEffect(() => {
    if (!token || !scannerSystemId) {
      setLocalChartData(null);
      setLocalChartError(null);
      return;
    }

    void fetchLocalChart(scannerSystemId, { silent: true });
  }, [fetchLocalChart, scannerSystemId, token]);

  useEffect(() => {
    if (!token) {
      setGalaxySystems([]);
      setGalaxySystemsError(null);
      setSelectedGalaxySystemId("");
      return;
    }

    if (!isGalaxyModeActive) {
      return;
    }

    void fetchGalaxySystems({ silent: true });
  }, [fetchGalaxySystems, isGalaxyModeActive, token]);

  useEffect(() => {
    if (!isGalaxyModeActive) {
      return;
    }

    if (!selectedGalaxySystemId) {
      setGalaxySystemOverview(null);
      setGalaxySystemOverviewError(null);
      return;
    }

    const parsedSystemId = Number(selectedGalaxySystemId);
    if (!Number.isInteger(parsedSystemId) || parsedSystemId <= 0) {
      setGalaxySystemOverview(null);
      setGalaxySystemOverviewError("System ID must be a valid positive number.");
      return;
    }

    void fetchGalaxySystemOverview(parsedSystemId, { silent: true });
  }, [fetchGalaxySystemOverview, isGalaxyModeActive, selectedGalaxySystemId]);

  useEffect(() => {
    if (!isGalaxyModeActive) {
      return;
    }

    if (!selectedGalaxySystemId) {
      return;
    }
    if (selectedJumpSystemId === selectedGalaxySystemId) {
      return;
    }
    setSelectedJumpSystemId(selectedGalaxySystemId);
  }, [isGalaxyModeActive, selectedGalaxySystemId, selectedJumpSystemId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onSystemChartObservability = (event: Event): void => {
      const customEvent = event as CustomEvent<SystemChartObservabilityDetail>;
      const detail = customEvent.detail;
      if (!detail || typeof detail !== "object") {
        return;
      }

      const eventTimestamp =
        typeof detail.timestamp === "string" && detail.timestamp
          ? detail.timestamp
          : new Date().toISOString();
      const eventSource: SystemChartObservabilityEventLogEntry["source"] =
        detail.source ?? "system";
      const eventOutcome: "success" | "failure" | "info" =
        detail.success === true ? "success" : detail.success === false ? "failure" : "info";
      const eventMessage = detail.event === "selection-sync"
        ? detail.reason ?? (detail.success === true ? "selection synced" : "selection sync failed")
        : detail.event === "chart-sync"
          ? detail.reason ?? (detail.success === true ? "chart sync ok" : "chart sync failed")
          : detail.event === "chart-render-budget"
            ? `render ${typeof detail.computeDurationMs === "number" ? detail.computeDurationMs.toFixed(2) : "-"}ms`
            : `chart opened #${detail.openCount ?? "-"}`;

      setSystemChartObservabilityEvents((current) => [
        {
          id: `${eventTimestamp}-${detail.event}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: eventTimestamp,
          event: detail.event,
          source: eventSource,
          outcome: eventOutcome,
          message: eventMessage,
        },
        ...current,
      ].slice(0, 20));

      setSystemChartObservability((current) => {
        const baseNext: SystemChartObservabilitySummary = {
          ...current,
          lastEventAt: typeof detail.timestamp === "string" ? detail.timestamp : current.lastEventAt,
        };

        if (detail.event === "chart-open") {
          return {
            ...baseNext,
            chartOpenCount: typeof detail.openCount === "number"
              ? detail.openCount
              : current.chartOpenCount + 1,
          };
        }

        if (detail.event === "selection-sync") {
          const nextSuccessCount = typeof detail.successCount === "number"
            ? detail.successCount
            : detail.success === true
              ? current.syncSuccessCount + 1
              : current.syncSuccessCount;
          const nextFailureCount = typeof detail.failureCount === "number"
            ? detail.failureCount
            : detail.success === false
              ? current.syncFailureCount + 1
              : current.syncFailureCount;

          return {
            ...baseNext,
            syncSuccessCount: nextSuccessCount,
            syncFailureCount: nextFailureCount,
            lastSyncSource: detail.source ?? current.lastSyncSource,
            lastSyncReason: detail.reason ?? null,
          };
        }

        if (detail.event === "chart-sync") {
          if (detail.success === true) {
            return {
              ...baseNext,
              chartSyncSuccessCount: current.chartSyncSuccessCount + 1,
            };
          }

          return {
            ...baseNext,
            chartSyncFailureCount: current.chartSyncFailureCount + 1,
            lastSyncReason: detail.reason ?? current.lastSyncReason,
          };
        }

        if (detail.event === "chart-render-budget") {
          return {
            ...baseNext,
            renderBudgetBreachCount: current.renderBudgetBreachCount + 1,
            lastRenderDurationMs:
              typeof detail.computeDurationMs === "number"
                ? detail.computeDurationMs
                : current.lastRenderDurationMs,
            lastRenderBudgetMs:
              typeof detail.budgetMs === "number" ? detail.budgetMs : current.lastRenderBudgetMs,
          };
        }

        return current;
      });
    };

    window.addEventListener(
      "elite:system-chart-observability",
      onSystemChartObservability as EventListener,
    );
    return () => {
      window.removeEventListener(
        "elite:system-chart-observability",
        onSystemChartObservability as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (!isSystemModeActive) {
      return;
    }

    const visibleContactIds = visibleLocalChartContacts.map((contact) => contact.id);
    if (!visibleContactIds.length) {
      return;
    }

    const handleSystemChartKeyNav = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (
        event.key !== "ArrowUp"
        && event.key !== "ArrowDown"
        && event.key !== "ArrowLeft"
        && event.key !== "ArrowRight"
        && event.key !== "Home"
        && event.key !== "End"
        && event.key !== "1"
        && event.key !== "2"
        && event.key !== "3"
        && event.key !== "4"
        && event.key !== "Enter"
        && event.key !== ","
        && event.key !== "."
        && event.key !== "-"
        && event.key !== "_"
        && event.key !== "+"
        && event.key !== "="
        && event.code !== "NumpadAdd"
        && event.code !== "NumpadSubtract"
        && key !== "f"
        && key !== "l"
        && key !== "a"
        && key !== "t"
      ) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        const isTypingElement =
          tagName === "INPUT"
          || tagName === "TEXTAREA"
          || tagName === "SELECT"
          || target.isContentEditable;
        if (isTypingElement) {
          return;
        }
      }

      if (handleSystemChartKeyboardCamera(event)) {
        return;
      }

      const currentIndex = visibleContactIds.indexOf(scannerSelectedContactId);
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;

      if (key === "f") {
        event.preventDefault();
        handleSystemChartFocusInFlight();
        return;
      }

      if (key === "a") {
        event.preventDefault();
        handleSystemChartApproach();
        return;
      }

      if (key === "t") {
        event.preventDefault();
        handleSystemChartCycleStationTarget();
        return;
      }

      if (event.key === "Enter" || key === "l") {
        event.preventDefault();
        handleSystemChartWaypointToggle();
        return;
      }

      if (event.key === "1") {
        event.preventDefault();
        handleLocalChartSortToggle("distance");
        return;
      }

      if (event.key === "2") {
        event.preventDefault();
        handleLocalChartSortToggle("type");
        return;
      }

      if (event.key === "3") {
        event.preventDefault();
        handleLocalChartSortToggle("radius");
        return;
      }

      if (event.key === "4") {
        event.preventDefault();
        handleLocalChartSortToggle("name");
        return;
      }

      let nextIndex = baseIndex;
      if (event.key === "ArrowUp") {
        nextIndex = Math.max(0, baseIndex - 1);
      } else if (event.key === "ArrowDown") {
        nextIndex = Math.min(visibleContactIds.length - 1, baseIndex + 1);
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = visibleContactIds.length - 1;
      }

      if (nextIndex === baseIndex) {
        return;
      }

      event.preventDefault();
      const nextContactId = visibleContactIds[nextIndex];
      if (nextContactId) {
        handleSystemChartSelectContact(nextContactId);
      }
    };

    window.addEventListener("keydown", handleSystemChartKeyNav);
    return () => {
      window.removeEventListener("keydown", handleSystemChartKeyNav);
    };
  }, [
    handleSystemChartSelectContact,
    handleSystemChartApproach,
    handleSystemChartCycleStationTarget,
    handleSystemChartFocusInFlight,
    handleSystemChartKeyboardCamera,
    handleSystemChartWaypointToggle,
    handleLocalChartSortToggle,
    isSystemModeActive,
    scannerSelectedContactId,
    visibleLocalChartContacts,
  ]);

  useEffect(() => {
    if (!isSystemModeActive || !scannerSelectedContactId) {
      return;
    }

    const rowElement = systemChartRowRefs.current[scannerSelectedContactId];
    if (!rowElement || typeof rowElement.scrollIntoView !== "function") {
      return;
    }

    rowElement.scrollIntoView({ block: "nearest" });
  }, [isSystemModeActive, scannerSelectedContactId, visibleLocalChartContacts]);

  useEffect(() => {
    if (!isSystemModeActive || !scannerSelectedContactId) {
      return;
    }

    const activeElement = document.activeElement as Element | null;
    if (!activeElement) {
      return;
    }

    const activeTestId = activeElement.getAttribute("data-testid") || "";
    const focusIsInChart = activeTestId.startsWith("system-chart-point-")
      || activeTestId === "system-chart-canvas";

    if (!focusIsInChart) {
      return;
    }

    const selectedPointElement = systemChartPointRefs.current[scannerSelectedContactId];
    if (!selectedPointElement || selectedPointElement === activeElement) {
      return;
    }

    selectedPointElement.focus();
  }, [isSystemModeActive, scannerSelectedContactId, systemChartPlot.points]);

  useEffect(() => {
    if (!isNavigationMode) {
      return;
    }

    const onNavigationViewShortcut = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        const isTypingElement = (
          tagName === "INPUT"
          || tagName === "TEXTAREA"
          || tagName === "SELECT"
          || target.isContentEditable
        );
        if (isTypingElement) {
          return;
        }
      }

      const key = event.key.toLowerCase();
      if (key === "g") {
        event.preventDefault();
        setNavigationView("galaxy");
        return;
      }

      if (key === "s") {
        event.preventDefault();
        setNavigationView("system");
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        setNavigationView((current) => (current === "system" ? "galaxy" : "system"));
      }
    };

    window.addEventListener("keydown", onNavigationViewShortcut);
    return () => {
      window.removeEventListener("keydown", onNavigationViewShortcut);
    };
  }, [isNavigationMode]);

  useEffect(() => {
    void fetchMarketSummary();
  }, [fetchMarketSummary]);

  useEffect(() => {
    if (!showDeveloperTools) {
      return;
    }
    void fetchAdminLogs();
    void fetchAdminUsers();
  }, [fetchAdminLogs, fetchAdminUsers, showDeveloperTools]);

  useEffect(() => {
    if (!showDeveloperTools || !logsFollowEnabled) {
      return;
    }
    if (!token || commanderProfile?.role !== "admin") {
      return;
    }

    void fetchAdminLogs({ follow: true });
    const followIntervalId = window.setInterval(() => {
      void fetchAdminLogs({ follow: true });
    }, 1000 * 5);

    return () => {
      window.clearInterval(followIntervalId);
    };
  }, [commanderProfile?.role, fetchAdminLogs, logsFollowEnabled, showDeveloperTools, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void fetchCommsChannels();

    const intervalId = window.setInterval(() => {
      void fetchCommsChannels();
    }, 1000 * 20);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchCommsChannels, token]);

  useEffect(() => {
    if (!token) {
      commsUnreadBaselineRef.current = null;
      return;
    }

    const previousUnread = commsUnreadBaselineRef.current;
    if (previousUnread === null) {
      commsUnreadBaselineRef.current = totalCommsUnread;
      return;
    }

    if (totalCommsUnread > previousUnread && activeMode !== "comms") {
      const delta = totalCommsUnread - previousUnread;
      const message =
        delta === 1
          ? "New comms message received."
          : `${delta} new comms messages received.`;
      setCommsStatus(`Unread relay traffic: ${totalCommsUnread}`);
      showToast({ message, variant: "info" });
    }

    commsUnreadBaselineRef.current = totalCommsUnread;
  }, [activeMode, showToast, token, totalCommsUnread]);

  useEffect(() => {
    if (!token || activeMode !== "comms") {
      return;
    }

    void fetchCommsChannels();
  }, [activeMode, fetchCommsChannels, token]);

  useEffect(() => {
    if (!token || activeMode !== "comms" || !commsSelectedChannelId) {
      return;
    }
    void fetchCommsMessages(commsSelectedChannelId);
  }, [activeMode, commsSelectedChannelId, fetchCommsMessages, token]);

  useEffect(() => {
    if (!token || activeMode !== "comms" || !selectedCommsChannel) {
      return;
    }
    if (selectedCommsChannel.unread <= 0) {
      return;
    }

    void markCommsChannelRead(selectedCommsChannel.id);
  }, [activeMode, markCommsChannelRead, selectedCommsChannel, token]);

  useEffect(() => {
    if (!token || activeMode !== "ship") {
      return;
    }
    void fetchMissions({ silent: true });
  }, [activeMode, fetchMissions, token]);

  useEffect(() => {
    if (!token || dockedAtStation) {
      return;
    }
    if (activeMode === "trade" || activeMode === "ship" || activeMode === "story") {
      setActiveMode("flight");
    }
  }, [activeMode, dockedAtStation, token]);

  useEffect(() => {
    if (!token || shipTelemetry?.status !== "in-space") {
      flightPositionSyncLastCoordsRef.current = null;
      return;
    }
    const jumpPhaseIsStable = (
      flightJumpPhase === FLIGHT_PHASE.IDLE
      || flightJumpPhase === FLIGHT_PHASE.DESTINATION_LOCKED
      || flightJumpPhase === FLIGHT_PHASE.ARRIVED
      || flightJumpPhase === FLIGHT_PHASE.ERROR
    );
    if (!jumpPhaseIsStable) {
      return;
    }
    if (isFlightTransitActive || isDockingApproachActive || !liveStationAnchoredShipPosition) {
      return;
    }

    const roundedPosition = {
      x: Math.round(liveStationAnchoredShipPosition.x),
      y: Math.round(liveStationAnchoredShipPosition.y),
      z: Math.round(liveStationAnchoredShipPosition.z),
    };
    const lastPosition = flightPositionSyncLastCoordsRef.current;
    const movedEnough = (
      lastPosition === null
      || Math.abs(roundedPosition.x - lastPosition.x) >= 2
      || Math.abs(roundedPosition.y - lastPosition.y) >= 2
      || Math.abs(roundedPosition.z - lastPosition.z) >= 2
    );
    if (!movedEnough) {
      return;
    }

    const now = Date.now();
    if (now - flightPositionSyncLastSentAtRef.current < 900) {
      return;
    }
    if (flightPositionSyncInFlightRef.current) {
      return;
    }

    flightPositionSyncInFlightRef.current = true;
    flightPositionSyncLastSentAtRef.current = now;
    void syncShipPositionDuringFlight(roundedPosition).finally(() => {
      flightPositionSyncInFlightRef.current = false;
    });
  }, [
    flightJumpPhase,
    isDockingApproachActive,
    isFlightTransitActive,
    liveStationAnchoredShipPosition,
    shipTelemetry?.status,
    syncShipPositionDuringFlight,
    token,
  ]);

  useEffect(() => {
    if (!dockedAtStation) {
      return;
    }
    setFlightSpeedUnits(0);
    setFlightRollDegrees(0);
    setScannerLiveContacts([]);
    setFlightCollisionStatus("Collision monitor idle.");
    setFlightRecentImpacts([]);
    collisionToastSignatureRef.current = "";
  }, [dockedAtStation]);

  useEffect(() => {
    if (!isDockingApproachActive && !isFlightTransitActive) {
      return;
    }
    setFlightImpactFlash("none");
    setFlightJumpCompletionVfx("none");
    if (flightImpactFlashTimeoutRef.current !== null) {
      window.clearTimeout(flightImpactFlashTimeoutRef.current);
      flightImpactFlashTimeoutRef.current = null;
    }
    if (flightJumpCompletionVfxTimeoutRef.current !== null) {
      window.clearTimeout(flightJumpCompletionVfxTimeoutRef.current);
      flightJumpCompletionVfxTimeoutRef.current = null;
    }
    if (flightJumpCompletionClearTimeoutRef.current !== null) {
      window.clearTimeout(flightJumpCompletionClearTimeoutRef.current);
      flightJumpCompletionClearTimeoutRef.current = null;
    }
    if (flightJumpStabilizeAudioTimeoutRef.current !== null) {
      window.clearTimeout(flightJumpStabilizeAudioTimeoutRef.current);
      flightJumpStabilizeAudioTimeoutRef.current = null;
    }
  }, [isDockingApproachActive, isFlightTransitActive]);

  useEffect(() => {
    if (!isSafetyCorridorCollisionStatus(flightCollisionStatus)) {
      return;
    }
    clearFlightImpactFlash();
  }, [clearFlightImpactFlash, flightCollisionStatus]);

  useEffect(() => {
    if (!token || activeMode !== "flight") {
      return;
    }
    if (isFlightTransitActive) {
      setFlightCollisionStatus("Transit safety corridor active.");
      return;
    }
    if (isDockingApproachActive) {
      setFlightCollisionStatus("Docking computer safety corridor active.");
      return;
    }
    if (shipTelemetry?.status !== "in-space") {
      setFlightCollisionStatus("Collision checks active only while in-space");
      return;
    }

    void fetchCollisionTelemetry({ silent: true });
    const intervalId = window.setInterval(() => {
      void fetchCollisionTelemetry({ silent: false });
    }, 1500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    activeMode,
    fetchCollisionTelemetry,
    isDockingApproachActive,
    isFlightTransitActive,
    shipTelemetry?.status,
    token,
  ]);

  useEffect(() => {
    if (
      isDockingApproachActive
      || isFlightTransitActive
      || activeMode !== "flight"
      || shipTelemetry?.status !== "in-space"
      || isSafetyCorridorCollisionStatus(flightCollisionStatus)
    ) {
      activeProximityCollisionContactIdRef.current = null;
      return;
    }

    const contactById = new Map(scannerContacts.map((contact) => [contact.id, contact]));
    const thresholdByType: Record<ScannerContactType, number> = {
      ship: 1.1,
      station: 1.6,
      planet: 1.9,
      moon: 1.7,
      star: 2.4,
    };

    let nearestImpactCandidate: {
      id: string;
      type: ScannerContactType;
      name: string;
      distance: number;
      threshold: number;
    } | null = null;

    scannerLiveContacts.forEach((liveContact) => {
      const scannerContact = contactById.get(liveContact.id);
      if (!scannerContact) {
        return;
      }
      const threshold = thresholdByType[scannerContact.contact_type];
      if (!Number.isFinite(threshold) || threshold <= 0) {
        return;
      }

      if (liveContact.distance > threshold) {
        return;
      }

      if (nearestImpactCandidate === null || liveContact.distance < nearestImpactCandidate.distance) {
        nearestImpactCandidate = {
          id: scannerContact.id,
          type: scannerContact.contact_type,
          name: scannerContact.name,
          distance: liveContact.distance,
          threshold,
        };
      }
    });

    if (nearestImpactCandidate === null) {
      activeProximityCollisionContactIdRef.current = null;
      return;
    }

    const impactCandidate = nearestImpactCandidate as {
      id: string;
      type: ScannerContactType;
      name: string;
      distance: number;
      threshold: number;
    };

    if (activeProximityCollisionContactIdRef.current === impactCandidate.id) {
      return;
    }

    activeProximityCollisionContactIdRef.current = impactCandidate.id;
    const localSpeed = Math.abs(flightSpeedUnits);
    const severity: "glancing" | "critical" = (
      impactCandidate.type === "station"
      || impactCandidate.type === "star"
      || localSpeed >= 3.5
      || impactCandidate.distance <= Math.max(0.8, impactCandidate.threshold * 0.55)
    )
      ? "critical"
      : "glancing";

    if (impactCandidate.type === "moon") {
      return;
    }

    void handleFlightSceneCollision({
      contactId: impactCandidate.id,
      contactType: impactCandidate.type,
      contactName: impactCandidate.name,
      distance: impactCandidate.distance,
      speed: localSpeed,
      severity,
    });
  }, [
    activeMode,
    flightCollisionStatus,
    flightSpeedUnits,
    handleFlightSceneCollision,
    isDockingApproachActive,
    isFlightTransitActive,
    scannerContacts,
    scannerLiveContacts,
    shipTelemetry?.status,
  ]);

  const handleCommsSend = async () => {
    if (!selectedCommsChannel || !commsDraft.trim()) {
      return;
    }

    setCommsSending(true);
    const messageBody = commsDraft.trim();

    try {
      const response = await fetch(
        `${API_BASE}/api/comms/channels/${selectedCommsChannel.id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ body: messageBody }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Unable to send message.";
        setCommsStatus(message);
        showToast({ message, variant: "error" });
        return;
      }

      const outbound = mapCommsMessage(data as CommsMessageApi);
      setCommsMessages((current) => {
        const channelMessages = current[selectedCommsChannel.id] ?? [];
        return {
          ...current,
          [selectedCommsChannel.id]: [...channelMessages, outbound],
        };
      });

      setCommsDraft("");
      setCommsStatus(
        outbound.delivery === "queued"
          ? "Message queued for relay delivery."
          : outbound.delivery === "delivered"
            ? "Message delivered."
            : "Message transmitted instantly."
      );
    } catch {
      const message = "Unable to send message.";
      setCommsStatus(message);
      showToast({ message, variant: "error" });
    } finally {
      setCommsSending(false);
    }
  };

  useEffect(() => {
    if (!selectedStation) {
      return;
    }

    const nextDockStationId = String(selectedStation.id);
    const nextJumpSystemId = String(selectedStation.system_id);

    if (dockStationId !== nextDockStationId) {
      setDockStationId(nextDockStationId);
    }

    if (!isGalaxyModeActive && selectedJumpSystemId !== nextJumpSystemId) {
      setSelectedJumpSystemId(nextJumpSystemId);
    }
  }, [dockStationId, isGalaxyModeActive, selectedJumpSystemId, selectedStation]);

  const handleTrade = async () => {
    const dockedStationIdFromTelemetry = (
      shipTelemetry?.status === "docked"
      && Number.isInteger(shipTelemetry.docked_station_id)
      && Number(shipTelemetry.docked_station_id) > 0
    )
      ? String(shipTelemetry.docked_station_id)
      : null;

    const dockedStationIdFromCommander = (
      commanderProfile?.location_type === "station"
      && Number.isInteger(commanderProfile.location_id)
      && Number(commanderProfile.location_id) > 0
    )
      ? String(commanderProfile.location_id)
      : null;

    const effectiveStationId = (
      dockedStationIdFromTelemetry
      ?? dockedStationIdFromCommander
      ?? stationId
    ).trim();

    if (!effectiveStationId) return;
    if (stationId !== effectiveStationId) {
      setStationId(effectiveStationId);
    }
    if (!selectedCommodity) {
      setTradeStatus("Select a commodity first.");
      return;
    }
    const qty = Number(tradeQty);
    const parsedShipId = Number(shipId);
    if (!Number.isFinite(qty) || qty <= 0) {
      setTradeStatus("Quantity must be positive.");
      return;
    }
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setTradeStatus("Ship ID must be a valid positive number.");
      return;
    }

    setTradeLoading(true);
    setTradeStatus("Submitting trade order...");
    try {
      const response = await fetch(
        `${API_BASE}/api/stations/${effectiveStationId}/trade`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            ship_id: parsedShipId,
            commodity_id: selectedCommodity,
            qty,
            direction,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Trade failed.";
        setTradeStatus(message);
        showToast({
          message,
          variant: "error",
          actionLabel: "Retry",
          onAction: () => {
            void handleTrade();
          },
        });
        setTradeLoading(false);
        return;
      }
      await fetchInventory({
        silent: true,
        stationIdOverride: effectiveStationId,
      });
      await fetchShipCargo({ silent: true });
      await fetchCommanderProfile();
      setCompletedTrades((previous) => previous + 1);
      setTradeStatus(`Trade cleared. Remaining: ${data.remaining}`);
      showToast({ message: "Trade cleared successfully.", variant: "success" });
    } catch {
      setTradeStatus("Trade uplink failed.");
      showToast({
        message: "Trade uplink failed.",
        variant: "error",
        actionLabel: "Retry",
        onAction: () => {
          void handleTrade();
        },
      });
    } finally {
      setTradeLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.kicker}>Elite Chronicles</p>
        </section>

        {!token ? (
          <section className={styles.panel}>
            <div className={styles.modeSwitch}>
              <button
                type="button"
                className={mode === "login" ? styles.active : ""}
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={mode === "register" ? styles.active : ""}
                onClick={() => setMode("register")}
              >
                Register
              </button>
            </div>

            <div className={styles.form}>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  placeholder="pilot@elite.local"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              {mode === "register" ? (
                <label>
                  <span>Callsign</span>
                  <input
                    type="text"
                    placeholder="Commander Nova"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
              ) : null}

              <label>
                <span>Password</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {loading ? "Syncing..." : "Request clearance"}
              </button>
            </div>
          </section>
        ) : (
          <section className={styles.authChip}>
            <p className={styles.authInline}>Commander {userId ?? "-"} · Authenticated</p>
            <div className={styles.chipMeta}>
              <span>Token</span>
              <code>{token ? `${token.slice(0, 10)}...` : "-"}</code>
            </div>
            <div className={styles.authActions}>
              <button
                type="button"
                title="Switch account / logout"
                onClick={() => setShowAuthMenu(true)}
              >
                Switch
              </button>
              <button
                type="button"
                title="Advanced / Debug"
                onClick={() => setShowDeveloperTools(true)}
              >
                Debug
              </button>
            </div>
          </section>
        )}

        {showAuthMenu ? (
          <div className={styles.authOverlay} role="dialog" aria-modal="true">
            <div className={styles.authDialog}>
              <div>
                <p className={styles.label}>Session Options</p>
                <h3>Commander {userId ?? "-"}</h3>
                <p className={styles.dialogSubhead}>
                  Choose to keep your current session or swap accounts.
                </p>
              </div>
              <div className={styles.dialogActions}>
                <button type="button" onClick={() => setShowAuthMenu(false)}>
                  Return to session
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={handleSwitchAccount}
                >
                  Switch account
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => handleLogout()}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showDeveloperTools ? (
          <div className={styles.devOverlay} role="dialog" aria-modal="true">
            <section className={styles.devDialog}>
              <div className={styles.devHeader}>
                <div>
                  <p className={styles.label}>Development</p>
                  <h3>Developer tools</h3>
                  <p className={styles.dialogSubhead}>
                    API diagnostics, economy controls, and admin logs.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => setShowDeveloperTools(false)}
                >
                  Close
                </button>
              </div>

              <div className={styles.devContent}>
                <section className={styles.statusPanel}>
                  <div className={styles.signalRow}>
                    <span>API</span>
                    <code>{API_BASE}</code>
                    <span className={styles.pulse} />
                  </div>
                  <div>
                    <p className={styles.label}>Status</p>
                    <p className={styles.status}>{status}</p>
                  </div>
                  <div className={styles.meta}>
                    <div>
                      <p className={styles.label}>User</p>
                      <p>{userId ?? "-"}</p>
                    </div>
                    <div>
                      <p className={styles.label}>Token</p>
                      <p className={styles.mono}>
                        {token ? `${token.slice(0, 8)}...` : "-"}
                      </p>
                    </div>
                  </div>
                </section>

                {token ? (
                  <section className={styles.tickPanel}>
                    <div>
                      <p className={styles.label}>Market Tick</p>
                      <h3>Economy operator</h3>
                    </div>
                    <div className={styles.tickControls}>
                      <label>
                        <span>Tick Steps</span>
                        <input
                          type="number"
                          min="1"
                          value={marketTickSteps}
                          onChange={(event) => setMarketTickSteps(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Simulated Steps</span>
                        <input
                          type="number"
                          min="0"
                          value={simulateTicks}
                          onChange={(event) => setSimulateTicks(event.target.value)}
                        />
                      </label>
                      <div className={styles.tickActions}>
                        <button
                          type="button"
                          disabled={marketTickLoading}
                          onClick={() => {
                            void runMarketTick();
                          }}
                        >
                          Run tick
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void fetchMarketSummary();
                          }}
                        >
                          Refresh summary
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void fetchMarketSummary(Number(simulateTicks));
                          }}
                        >
                          Simulate
                        </button>
                      </div>
                      <p className={styles.tickStatus}>{marketTickStatus}</p>
                    </div>
                  </section>
                ) : null}

                {token && commanderProfile?.role === "admin" ? (
                  <section className={styles.logsPanel}>
                    <div>
                      <p className={styles.label}>Admin Users</p>
                      <h3>Access control</h3>
                    </div>
                    <div className={styles.logsControls}>
                      <button
                        type="button"
                        onClick={() => {
                          void fetchAdminUsers();
                        }}
                      >
                        Refresh users
                      </button>
                    </div>

                    <div className={styles.logsList}>
                      {adminUsersLoading ? (
                        <DataState
                          variant="loading"
                          title="Loading users"
                          description="Retrieving admin user directory."
                        />
                      ) : adminUsersError ? (
                        <DataState
                          variant="error"
                          title="Users unavailable"
                          description={adminUsersError}
                          actionLabel="Retry"
                          onAction={() => {
                            void fetchAdminUsers();
                          }}
                        />
                      ) : adminUsers.length ? (
                        adminUsers.map((user) => {
                          const selectedRole = adminUsersRoleEdits[user.id] ?? user.role;
                          const selectedStatus = adminUsersStatusEdits[user.id] ?? user.status;
                          const hasPendingUpdate = selectedRole !== user.role || selectedStatus !== user.status;
                          return (
                            <div key={user.id} className={styles.logItem}>
                              <p>{user.username} · {user.email}</p>
                              <span>
                                Role: {user.role} · Status: {user.status} · Location: {user.location_label}
                              </span>
                              <div className={styles.adminUserActions}>
                                <label>
                                  <span>Role</span>
                                  <select
                                    value={selectedRole}
                                    onChange={(event) => setAdminUsersRoleEdits((current) => ({
                                      ...current,
                                      [user.id]: event.target.value,
                                    }))}
                                  >
                                    <option value="user">user</option>
                                    <option value="moderator">moderator</option>
                                    <option value="admin">admin</option>
                                  </select>
                                </label>
                                <label>
                                  <span>Status</span>
                                  <select
                                    value={selectedStatus}
                                    onChange={(event) => setAdminUsersStatusEdits((current) => ({
                                      ...current,
                                      [user.id]: event.target.value,
                                    }))}
                                  >
                                    <option value="active">active</option>
                                    <option value="inactive">inactive</option>
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  disabled={!hasPendingUpdate || adminUserSavingId === user.id}
                                  onClick={() => {
                                    void saveAdminUser(user);
                                  }}
                                >
                                  {adminUserSavingId === user.id ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <DataState
                          variant="empty"
                          title="No users found"
                          description="Refresh to retrieve latest user records."
                        />
                      )}
                    </div>
                  </section>
                ) : null}

                {token && commanderProfile?.role === "admin" ? (
                  <section className={styles.logsPanel}>
                    <div>
                      <p className={styles.label}>Admin Logs</p>
                      <h3>Operational tail</h3>
                    </div>
                    <div className={styles.logsControls}>
                      <label>
                        <span>Tail</span>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={logsTail}
                          onChange={(event) => {
                            setLogsTail(event.target.value);
                            setLogsSinceCursor(null);
                          }}
                        />
                      </label>
                      <label>
                        <span>Level</span>
                        <select
                          value={logsLevel}
                          onChange={(event) => {
                            setLogsLevel(event.target.value);
                            setLogsSinceCursor(null);
                          }}
                        >
                          <option value="ALL">All</option>
                          <option value="INFO">INFO</option>
                          <option value="WARNING">WARNING</option>
                          <option value="ERROR">ERROR</option>
                        </select>
                      </label>
                      <label>
                        <span>Contains</span>
                        <input
                          type="text"
                          value={logsContains}
                          onChange={(event) => {
                            setLogsContains(event.target.value);
                            setLogsSinceCursor(null);
                          }}
                        />
                      </label>
                      <label>
                        <span>Regex</span>
                        <input
                          type="text"
                          value={logsRegex}
                          onChange={(event) => {
                            setLogsRegex(event.target.value);
                            setLogsSinceCursor(null);
                          }}
                          placeholder="Tick\\sfail"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (logsFollowEnabled) {
                            setLogsFollowEnabled(false);
                            return;
                          }
                          setLogsSinceCursor(null);
                          setLogsFollowEnabled(true);
                        }}
                      >
                        {logsFollowEnabled ? "Stop follow" : "Start follow"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLogsSinceCursor(null);
                          void fetchAdminLogs();
                        }}
                      >
                        Refresh logs
                      </button>
                    </div>
                    {logsFollowEnabled ? (
                      <p className={styles.tickStatus}>
                        Follow active · cursor {logsSinceCursor ?? "pending"}
                      </p>
                    ) : null}

                    <div className={styles.logsList}>
                      {adminLogsLoading ? (
                        <DataState
                          variant="loading"
                          title="Loading logs"
                          description="Retrieving filtered log entries."
                        />
                      ) : adminLogsError ? (
                        <DataState
                          variant="error"
                          title="Logs unavailable"
                          description={adminLogsError}
                          actionLabel="Retry"
                          onAction={() => {
                            void fetchAdminLogs();
                          }}
                        />
                      ) : adminLogs.length ? (
                        adminLogs.map((entry, index) => (
                          <div key={`${entry.timestamp ?? "none"}-${index}`} className={styles.logItem}>
                            <p>{entry.timestamp ?? "-"} · {entry.level} · {entry.source}</p>
                            <span>{entry.message}</span>
                          </div>
                        ))
                      ) : (
                        <DataState
                          variant="empty"
                          title="No log entries"
                          description="Adjust filters or refresh to load latest records."
                        />
                      )}
                    </div>
                  </section>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {token && !useFlightShell && activeMode === "ship" ? (
          <section className={`${styles.modeMainPanel} ${styles.opsPanel}`}>
            <div>
              <p className={styles.label}>Commander State</p>
              <h3>Flight manifest</h3>
            </div>
            <div className={styles.flightCommandStrip}>
              <button type="button" onClick={() => setActiveMode("trade")}>Trade</button>
              <button type="button" onClick={() => setActiveMode("flight")}>Flight</button>
              <button type="button" onClick={() => setActiveMode("story")}>Story</button>
              <button type="button" onClick={() => setActiveMode("comms")}>{commsModeLabel}</button>
              <button type="button" onClick={() => setActiveMode("ship")}>Ship</button>
            </div>
            {commanderLoading ? (
              <DataState
                variant="loading"
                title="Loading commander state"
                description="Retrieving authenticated player profile."
              />
            ) : commanderError ? (
              <DataState
                variant="error"
                title="Commander state unavailable"
                description={commanderError}
                actionLabel="Retry"
                onAction={() => {
                  void fetchCommanderProfile();
                }}
              />
            ) : commanderProfile ? (
              <div className={styles.metaGrid}>
                <p>{commanderProfile.username}</p>
                <span>{commanderProfile.email}</span>
                <p>Role: {commanderProfile.role}</p>
                <p>Credits: {commanderProfile.credits}</p>
                <p>
                  Location: {currentLocationLabel}
                </p>
              </div>
            ) : (
              <DataState
                variant="empty"
                title="No commander state"
                description="Authenticate and retry to load player profile."
                actionLabel="Refresh"
                onAction={() => {
                  void fetchCommanderProfile();
                }}
              />
            )}

            <div className={styles.shipOpsControls}>
              <label>
                <span>Dock Station</span>
                <select
                  value={dockStationId}
                  onChange={(event) => setDockStationId(event.target.value)}
                >
                  {stationOptions.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name} (#{station.id})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Refuel Amount</span>
                <input
                  type="number"
                  min="1"
                  value={refuelAmount}
                  onChange={(event) => setRefuelAmount(event.target.value)}
                />
              </label>
              <label>
                <span>Repair Amount</span>
                <input
                  type="number"
                  min="1"
                  value={repairAmount}
                  onChange={(event) => setRepairAmount(event.target.value)}
                />
              </label>
              <label>
                <span>Shield Recharge</span>
                <input
                  type="number"
                  min="1"
                  value={shieldRechargeAmount}
                  onChange={(event) => setShieldRechargeAmount(event.target.value)}
                />
              </label>
              <label>
                <span>Energy Recharge</span>
                <input
                  type="number"
                  min="1"
                  value={energyRechargeAmount}
                  onChange={(event) => setEnergyRechargeAmount(event.target.value)}
                />
              </label>
              <div className={styles.shipOpsActions}>
                <button
                  type="button"
                  disabled={shipOpsLoading || (isDockingApproachActive && dockedAtStation)}
                  onClick={() => {
                    if (isDockingApproachActive) {
                      handleCancelDockingApproach();
                      return;
                    }
                    void handleDockCommand();
                  }}
                >
                  {isDockingApproachActive ? "Cancel Docking" : "Dock"}
                </button>
                <button
                  type="button"
                  disabled={shipOpsLoading || isFlightTransitActive}
                  onClick={() => {
                    void handleUndockCommand();
                  }}
                >
                  Undock
                </button>
                <button
                  type="button"
                  disabled={shipOpsLoading}
                  onClick={() => {
                    void handleShipOperation("jump");
                  }}
                >
                  Jump
                </button>
                <button
                  type="button"
                  disabled={shipOpsLoading}
                  onClick={() => {
                    void handleShipOperation("refuel");
                  }}
                >
                  Refuel
                </button>
                {showDeveloperTools ? (
                  <button
                    type="button"
                    disabled={shipOpsLoading}
                    onClick={() => {
                      void handleRefuelToFull();
                    }}
                  >
                    Refuel Full
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={shipOpsLoading}
                  onClick={() => {
                    void handleShipOperation("repair");
                  }}
                >
                  Repair
                </button>
                <button
                  type="button"
                  disabled={shipOpsLoading}
                  onClick={() => {
                    void handleShipOperation("recharge");
                  }}
                >
                  Recharge
                </button>
              </div>
              <p className={styles.shipOpsStatus}>{shipOpsStatus}</p>
            </div>

            <div className={styles.shipOpsLogPanel}>
              <div className={styles.shipOpsLogHeader}>
                <p className={styles.label}>Maintenance Ledger</p>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => {
                    void fetchShipOperations({ silent: false });
                  }}
                >
                  Refresh ledger
                </button>
              </div>

              <div className={styles.shipOpsFilterRow}>
                <button
                  type="button"
                  className={shipOpsFilter === "all" ? styles.shipOpsFilterActive : styles.shipOpsFilter}
                  onClick={() => setShipOpsFilter("all")}
                >
                  All ({shipOpsCounts.all})
                </button>
                <button
                  type="button"
                  className={shipOpsFilter === "maintenance" ? styles.shipOpsFilterActive : styles.shipOpsFilter}
                  onClick={() => setShipOpsFilter("maintenance")}
                >
                  Maintenance ({shipOpsCounts.maintenance})
                </button>
                <button
                  type="button"
                  className={shipOpsFilter === "travel" ? styles.shipOpsFilterActive : styles.shipOpsFilter}
                  onClick={() => setShipOpsFilter("travel")}
                >
                  Travel ({shipOpsCounts.travel})
                </button>
              </div>

              {shipOperationsLoading ? (
                <DataState
                  variant="loading"
                  title="Loading maintenance ledger"
                  description="Retrieving recent ship operations and costs."
                />
              ) : shipOperationsError ? (
                <DataState
                  variant="error"
                  title="Ledger unavailable"
                  description={shipOperationsError}
                  actionLabel="Retry"
                  onAction={() => {
                    void fetchShipOperations({ silent: false });
                  }}
                />
              ) : filteredShipOperations.length ? (
                <div className={styles.shipOpsLogList}>
                  {filteredShipOperations.map((entry, index) => (
                    <div
                      key={`${entry.timestamp}-${entry.operation}-${index}`}
                      className={styles.shipOpsLogItem}
                    >
                      <p>{entry.operation.toUpperCase()} · {entry.status}</p>
                      <span>{formatShipOperationDetails(entry.details)}</span>
                      <small>
                        Cost: {entry.cost_credits} CR · Credits: {entry.credits_after ?? "-"}
                      </small>
                      <small>{entry.timestamp}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <DataState
                  variant="empty"
                  title="No maintenance entries"
                  description={
                    shipOpsFilter === "all"
                      ? "Run a ship operation to populate this ledger."
                      : "No entries found for this filter yet."
                  }
                />
              )}
            </div>

            <div className={styles.shipOpsLogPanel}>
              <div className={styles.shipOpsLogHeader}>
                <p className={styles.label}>Mission Board</p>
                <div className={styles.missionBoardActions}>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={creatingDummyMission}
                    onClick={() => {
                      void handleCreateDummyMission();
                    }}
                  >
                    {creatingDummyMission ? "Creating..." : "Create dummy mission"}
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => {
                      void fetchMissions({ silent: false });
                    }}
                  >
                    Refresh missions
                  </button>
                </div>
              </div>

              <p className={styles.shipOpsStatus}>{missionStatus}</p>

              {missionsLoading ? (
                <DataState
                  variant="loading"
                  title="Loading mission board"
                  description="Retrieving available and accepted contracts."
                />
              ) : missionsError ? (
                <DataState
                  variant="error"
                  title="Mission board unavailable"
                  description={missionsError}
                  actionLabel="Retry"
                  onAction={() => {
                    void fetchMissions({ silent: false });
                  }}
                />
              ) : (
                <>
                  <div className={styles.missionSectionHeader}>
                    <p className={styles.label}>Available</p>
                  </div>
                  {missionsAvailable.length ? (
                    <div className={styles.missionList}>
                      {missionsAvailable.map((mission) => (
                        <div key={mission.id} className={styles.missionItem}>
                          <p>{mission.title}</p>
                          <span>{mission.description}</span>
                          <small>
                            Reward: {mission.reward_credits} CR · {mission.station_name || formatStationLabel(mission.station_id)}
                          </small>
                          <div className={styles.missionActions}>
                            <button
                              type="button"
                              disabled={mission.accepted || acceptingMissionId === mission.id}
                              onClick={() => {
                                void handleAcceptMission(mission.id);
                              }}
                            >
                              {mission.accepted ? "Accepted" : "Accept"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <DataState
                      variant="empty"
                      title="No available missions"
                      description="Dock at a mission-enabled station and refresh the board."
                    />
                  )}

                  <div className={styles.missionSectionHeader}>
                    <p className={styles.label}>Accepted</p>
                  </div>
                  <div className={styles.shipOpsFilterRow}>
                    <button
                      type="button"
                      className={missionStatusFilter === "all" ? styles.shipOpsFilterActive : styles.shipOpsFilter}
                      onClick={() => setMissionStatusFilter("all")}
                    >
                      All ({missionStatusCounts.all})
                    </button>
                    <button
                      type="button"
                      className={missionStatusFilter === "accepted" ? styles.shipOpsFilterActive : styles.shipOpsFilter}
                      onClick={() => setMissionStatusFilter("accepted")}
                    >
                      Accepted ({missionStatusCounts.accepted})
                    </button>
                    <button
                      type="button"
                      className={missionStatusFilter === "completed" ? styles.shipOpsFilterActive : styles.shipOpsFilter}
                      onClick={() => setMissionStatusFilter("completed")}
                    >
                      Completed ({missionStatusCounts.completed})
                    </button>
                    <button
                      type="button"
                      className={missionStatusFilter === "abandoned" ? styles.shipOpsFilterActive : styles.shipOpsFilter}
                      onClick={() => setMissionStatusFilter("abandoned")}
                    >
                      Abandoned ({missionStatusCounts.abandoned})
                    </button>
                  </div>
                  <div className={styles.shipOpsFilterRow}>
                    <button
                      type="button"
                      className={missionSortOrder === "newest" ? styles.shipOpsFilterActive : styles.shipOpsFilter}
                      onClick={() => setMissionSortOrder("newest")}
                    >
                      Newest
                    </button>
                    <button
                      type="button"
                      className={missionSortOrder === "oldest" ? styles.shipOpsFilterActive : styles.shipOpsFilter}
                      onClick={() => setMissionSortOrder("oldest")}
                    >
                      Oldest
                    </button>
                  </div>
                  {sortedAssignedMissions.length ? (
                    <div className={styles.missionList}>
                      {sortedAssignedMissions.map((mission) => (
                        <div
                          key={`${mission.mission_id}-${mission.accepted_at}`}
                          className={styles.missionItem}
                        >
                          <p>{mission.title}</p>
                          <small>Status: {mission.status}</small>
                          <small>
                            Reward: {mission.reward_credits} CR · {mission.station_name || formatStationLabel(mission.station_id)}
                          </small>
                          <small>Accepted: {mission.accepted_at}</small>
                          {mission.completed_at ? (
                            <small>Completed: {mission.completed_at}</small>
                          ) : null}
                          <div className={styles.missionActions}>
                            <button
                              type="button"
                              disabled={
                                mission.status !== "accepted"
                                || completingMissionId === mission.mission_id
                              }
                              onClick={() => {
                                void handleCompleteMission(mission.mission_id);
                              }}
                            >
                              {mission.status === "completed" ? "Completed" : "Complete"}
                            </button>
                            <button
                              type="button"
                              disabled={
                                mission.status !== "accepted"
                                || abandoningMissionId === mission.mission_id
                              }
                              onClick={() => {
                                void handleAbandonMission(mission.mission_id);
                              }}
                            >
                              {mission.status === "abandoned" ? "Abandoned" : "Abandon"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <DataState
                      variant="empty"
                      title="No missions for this filter"
                      description="Switch mission filters or accept a new mission from the board."
                    />
                  )}
                </>
              )}
            </div>
          </section>
        ) : null}

        {token ? (
          <section className={`${styles.modeMainPanel} ${styles.flightPanel} ${dockedAtStation ? styles.flightPanelDocked : ""}`}>
            <div className={styles.flightConsoleShell}>
              <div className={styles.flightViewport}>
                <div
                  className={`${styles.flightHyperspaceOverlay} ${hyperspaceJumpCinematicActive
                    ? styles.flightHyperspaceOverlayActive
                    : hyperspaceJumpExitFlashActive
                      ? styles.flightHyperspaceOverlayExitFlash
                      : ""
                    }`}
                  aria-hidden="true"
                />
                <div
                  className={`${styles.flightImpactFlash} ${effectiveFlightImpactFlash === "critical"
                    ? styles.flightImpactFlashCritical
                    : effectiveFlightImpactFlash === "glancing"
                      ? styles.flightImpactFlashGlancing
                      : ""
                    }`}
                  aria-hidden="true"
                />
                <div
                  className={`${styles.flightJumpCompletionVfx} ${effectiveFlightJumpCompletionVfx === "flash"
                    ? styles.flightJumpCompletionVfxFlash
                    : effectiveFlightJumpCompletionVfx === "stabilize"
                      ? styles.flightJumpCompletionVfxStabilize
                      : effectiveFlightJumpCompletionVfx === "reduced"
                        ? styles.flightJumpCompletionVfxReduced
                        : ""
                    }`}
                  aria-hidden="true"
                />
                <div
                  className={`${styles.flightContextPrimary} ${isNavigationContextMode ? styles.flightContextPrimarySystem : ""
                    } ${effectiveFlightImpactFlash === "critical"
                      ? styles.flightContextPrimaryImpactCritical
                      : effectiveFlightImpactFlash === "glancing"
                        ? styles.flightContextPrimaryImpactGlancing
                        : ""
                    }`}
                >
                  {isNavigationMode ? (
                    <div className={styles.navigationViewToggleBar} role="group" aria-label="Navigation view toggle">
                      <div className={styles.navigationViewToggle}>
                        <button
                          type="button"
                          className={navigationView === "system"
                            ? styles.systemLayerButtonActive
                            : styles.systemLayerButton}
                          onClick={() => setNavigationView("system")}
                          title="System view (S)"
                        >
                          System
                        </button>
                        <button
                          type="button"
                          className={navigationView === "galaxy"
                            ? styles.systemLayerButtonActive
                            : styles.systemLayerButton}
                          onClick={() => setNavigationView("galaxy")}
                          title="Galaxy view (G)"
                        >
                          Galaxy
                        </button>
                      </div>
                      <span>Navigation View</span>
                    </div>
                  ) : null}

                  {activeMode === "trade" ? (
                    <div className={styles.flightContextPrimaryBody}>
                      <div className={styles.contextMarketBoard}>
                        <div className={styles.contextMarketHeader}>
                          <span>Product</span>
                          <span>Unit</span>
                          <span>Sell</span>
                          <span>Buy</span>
                          <span>Qty</span>
                          <span>Hold</span>
                        </div>
                        <div className={styles.contextMarketBody}>
                          {tradeBoardRows.map((item, index) => {
                            if (item === null) {
                              return (
                                <div key={`placeholder-${index}`} className={styles.contextMarketRowPlaceholder}>
                                  <span>Empty slot</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                </div>
                              );
                            }

                            return (
                              <button
                                key={item.commodity_id}
                                type="button"
                                className={
                                  selectedCommodity === item.commodity_id
                                    ? styles.contextMarketRowActive
                                    : styles.contextMarketRow
                                }
                                onClick={() => setSelectedCommodity(item.commodity_id)}
                              >
                                <span>{item.name}</span>
                                <span>t</span>
                                <span>{item.sell_price.toFixed(1)}</span>
                                <span>{item.buy_price.toFixed(1)}</span>
                                <span>{item.quantity}t</span>
                                <span>{commodityHoldMap.get(item.commodity_id) ?? "—"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className={styles.contextFieldGrid}>
                        <label>
                          <span>Direction</span>
                          <select
                            value={direction}
                            onChange={(event) => setDirection(event.target.value as TradeDirection)}
                          >
                            <option value="buy">Buy</option>
                            <option value="sell">Sell</option>
                          </select>
                        </label>

                        <label>
                          <span>Quantity</span>
                          <input
                            type="number"
                            min="1"
                            value={tradeQty}
                            onChange={(event) => setTradeQty(event.target.value)}
                          />
                        </label>
                      </div>

                      <p className={styles.flightContextStatus}>{tradeStatus}</p>
                    </div>
                  ) : null}

                  {activeMode === "ship" ? (
                    <div className={styles.flightContextPrimaryBody}>
                      <div className={styles.contextMarketBoard}>
                        <div className={styles.contextMarketHeader}>
                          <span>Operation</span>
                          <span>Status</span>
                          <span>Cost</span>
                          <span>Credits</span>
                          <span>Time</span>
                          <span>Details</span>
                        </div>
                        <div className={styles.contextMarketBody}>
                          {shipOpsBoardRows.map((entry, index) => {
                            if (entry === null) {
                              return (
                                <div key={`ship-placeholder-${index}`} className={styles.contextMarketRowPlaceholder}>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                </div>
                              );
                            }

                            const operationTime = entry.timestamp ? entry.timestamp.slice(11, 16) : "--:--";

                            return (
                              <div key={`${entry.timestamp}-${entry.operation}-${index}`} className={styles.contextMarketRowStatic}>
                                <span>{entry.operation.toUpperCase()}</span>
                                <span>{entry.status}</span>
                                <span>{entry.cost_credits}cr</span>
                                <span>{entry.credits_after ?? "—"}</span>
                                <span>{operationTime}</span>
                                <span title={entry.details || "Ship operation logged."}>
                                  {entry.details
                                    ? formatShipOperationDetails(entry.details)
                                    : "Ship operation logged."}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className={styles.contextFieldGrid}>
                        <label>
                          <span>Dock Station</span>
                          <select
                            value={dockStationId}
                            onChange={(event) => setDockStationId(event.target.value)}
                          >
                            {stationOptions.map((station) => (
                              <option key={station.id} value={station.id}>
                                {station.name} (#{station.id})
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Refuel</span>
                          <input
                            type="number"
                            min="1"
                            value={refuelAmount}
                            onChange={(event) => setRefuelAmount(event.target.value)}
                          />
                        </label>

                        <label>
                          <span>Repair</span>
                          <input
                            type="number"
                            min="1"
                            value={repairAmount}
                            onChange={(event) => setRepairAmount(event.target.value)}
                          />
                        </label>

                        <label>
                          <span>Recharge</span>
                          <input
                            type="number"
                            min="1"
                            value={shieldRechargeAmount}
                            onChange={(event) => setShieldRechargeAmount(event.target.value)}
                          />
                        </label>
                      </div>

                      <p className={styles.flightContextStatus}>{shipOpsStatus}</p>
                    </div>
                  ) : null}

                  {activeMode === "story" ? (
                    <div className={styles.flightContextPrimaryBody}>
                      <div className={styles.contextMarketBoard}>
                        <div className={styles.contextMarketHeader}>
                          <span>Session</span>
                          <span>Status</span>
                          <span>Location</span>
                          <span>State</span>
                          <span>Input</span>
                          <span>Result</span>
                        </div>
                        <div className={styles.contextMarketBody}>
                          {storyBoardRows.map((session, index) => {
                            if (session === null) {
                              return (
                                <div key={`story-placeholder-${index}`} className={styles.contextMarketRowPlaceholder}>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                </div>
                              );
                            }

                            const isSelected = String(session.id) === selectedStorySessionId;

                            return (
                              <button
                                key={session.id}
                                type="button"
                                className={isSelected ? styles.contextMarketRowActive : styles.contextMarketRow}
                                onClick={() => setSelectedStorySessionId(String(session.id))}
                              >
                                <span>#{session.id}</span>
                                <span>{session.status}</span>
                                <span>{formatStoryLocationLabel(session)}</span>
                                <span>{isSelected ? "active" : "ready"}</span>
                                <span>{storyInput || "Awaiting action"}</span>
                                <span>{storyOutcome ?? (storyInterpretation ? "Interpretation pending" : "—")}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className={styles.contextFieldGrid}>
                        <label>
                          <span>Session</span>
                          <select
                            value={selectedStorySessionId}
                            onChange={(event) => setSelectedStorySessionId(event.target.value)}
                          >
                            {storySessions.length ? (
                              storySessions.map((session) => (
                                <option key={session.id} value={session.id}>
                                  Session #{session.id} · {session.status}
                                </option>
                              ))
                            ) : (
                              <option value="">No sessions</option>
                            )}
                          </select>
                        </label>

                        <label>
                          <span>Action</span>
                          <input
                            type="text"
                            value={storyInput}
                            placeholder="Inspect docking bay"
                            onChange={(event) => setStoryInput(event.target.value)}
                          />
                        </label>
                      </div>

                      <p className={styles.flightContextStatus}>
                        {storyInterpretation ?? storyOutcome ?? `Story terminal ready${selectedStorySession ? ` · Session #${selectedStorySession.id}` : ""}.`}
                      </p>
                    </div>
                  ) : null}

                  {activeMode === "comms" ? (
                    <div className={styles.flightContextPrimaryBody}>
                      <div className={styles.contextMarketBoard}>
                        <div className={styles.contextMarketHeader}>
                          <span>Author</span>
                          <span>Dir</span>
                          <span>Delivery</span>
                          <span>Time</span>
                          <span>Channel</span>
                          <span>Message</span>
                        </div>
                        <div className={styles.contextMarketBody}>
                          {commsBoardRows.map((message, index) => {
                            if (message === null) {
                              return (
                                <div key={`comms-placeholder-${index}`} className={styles.contextMarketRowPlaceholder}>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                  <span>—</span>
                                </div>
                              );
                            }

                            const messageTime = message.timestamp || "--:--";
                            const isSelected = message.id === commsSelectedMessageId;

                            return (
                              <button
                                key={message.id}
                                type="button"
                                className={isSelected ? styles.contextMarketRowActive : styles.contextMarketRow}
                                onClick={() => setCommsSelectedMessageId(message.id)}
                              >
                                <span>{message.author}</span>
                                <span>{message.direction}</span>
                                <span>{formatCommsDeliveryLabel(message.delivery)}</span>
                                <span>{messageTime}</span>
                                <span>{selectedCommsChannelLabel}</span>
                                <span title={message.body}>{message.body}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className={styles.contextMessagePreview}>
                        <div className={styles.contextMessagePreviewMeta}>
                          <span>Message Content</span>
                          <strong>
                            {selectedCommsMessage
                              ? `${selectedCommsMessage.author} · ${selectedCommsMessage.timestamp || "--:--"}`
                              : "No message selected"}
                          </strong>
                        </div>
                        <p>
                          {selectedCommsMessage
                            ? selectedCommsMessage.body
                            : "Select a message row to read full message content."}
                        </p>
                      </div>

                      <div className={styles.contextFieldGrid}>
                        <label>
                          <span>Channel</span>
                          <select
                            value={commsSelectedChannelId}
                            onChange={(event) => setCommsSelectedChannelId(event.target.value)}
                          >
                            {commsChannels.length ? (
                              commsChannels.map((channel) => (
                                <option key={channel.id} value={channel.id}>
                                  {channel.name} · {channel.unread} unread
                                </option>
                              ))
                            ) : (
                              <option value="">No channels</option>
                            )}
                          </select>
                        </label>

                        <label>
                          <span>Transmit</span>
                          <input
                            type="text"
                            value={commsDraft}
                            placeholder="Type relay message"
                            onChange={(event) => setCommsDraft(event.target.value)}
                          />
                        </label>
                      </div>

                    </div>
                  ) : null}

                  {isGalaxyModeActive ? (
                    <div className={styles.flightContextPrimaryBody}>
                      <div className={`${styles.contextMessagePreview} ${styles.galaxyPrimaryCard}`}>
                        <div className={styles.galaxyViewRow} role="group" aria-label="Galaxy chart view mode">
                          <div className={styles.galaxyModeStack}>
                            <div className={styles.galaxyModeButtons}>
                              <button
                                type="button"
                                className={galaxyChartViewMode === "local_reachable"
                                  ? styles.systemLayerButtonActive
                                  : styles.systemLayerButton}
                                onClick={() => {
                                  setGalaxyChartViewMode("local_reachable");
                                }}
                              >
                                Local Reachable
                              </button>
                              <button
                                type="button"
                                className={galaxyChartViewMode === "galaxy"
                                  ? styles.systemLayerButtonActive
                                  : styles.systemLayerButton}
                                onClick={() => {
                                  setGalaxyChartViewMode("galaxy");
                                }}
                              >
                                Whole Galaxy
                              </button>
                            </div>
                            <div className={styles.galaxyViewStatus}>
                              <strong>
                                {galaxySystemsLoading
                                  ? "Syncing galaxy chart…"
                                  : galaxyChartViewMode === "local_reachable"
                                    ? `${galaxySystems.length} systems are reachable.`
                                    : `${galaxySystems.length} systems in view.`}
                              </strong>
                            </div>
                          </div>

                          <div className={styles.galaxyControlCluster} role="group" aria-label="Galaxy chart controls">
                            <div className={styles.galaxyPanPad}>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Zoom out"
                                title="Zoom out"
                                onClick={() => setGalaxyMapZoom((current) => Math.max(1, current - 0.25))}
                              >
                                −
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Pan up"
                                title="Pan up"
                                onClick={() => setGalaxyMapPanZ((current) => current + 40)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Zoom in"
                                title="Zoom in"
                                onClick={() => setGalaxyMapZoom((current) => Math.min(3, current + 0.25))}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Pan left"
                                title="Pan left"
                                onClick={() => setGalaxyMapPanX((current) => current - 40)}
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton} ${styles.galaxyControlResetButton}`}
                                aria-label="Reset view"
                                title="Reset view"
                                onClick={() => {
                                  setGalaxyMapZoom(1);
                                  setGalaxyMapPanX(0);
                                  setGalaxyMapPanZ(0);
                                }}
                              >
                                ↺
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Pan right"
                                title="Pan right"
                                onClick={() => setGalaxyMapPanX((current) => current + 40)}
                              >
                                →
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Pan down"
                                title="Pan down"
                                onClick={() => setGalaxyMapPanZ((current) => current - 40)}
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                        </div>
                        {galaxySystemsError ? <p>{galaxySystemsError}</p> : null}

                        <div className={styles.systemChartPanel}>
                          <div className={styles.systemChartPanelHeader}>
                            <span>2D Star Map</span>
                          </div>
                          <div className={styles.systemChartCanvas}>
                            {galaxyMapPlot.points.length ? (
                              <svg
                                className={styles.systemChartOverlaySvg}
                                viewBox={`0 0 ${galaxyMapPlot.width} ${galaxyMapPlot.height}`}
                                data-testid="galaxy-chart-map"
                              >
                                <rect
                                  className={styles.systemChartBackdrop}
                                  x="0"
                                  y="0"
                                  width={galaxyMapPlot.width}
                                  height={galaxyMapPlot.height}
                                />
                                <line
                                  className={styles.systemChartCrosshair}
                                  x1={galaxyMapPlot.width / 2}
                                  y1="0"
                                  x2={galaxyMapPlot.width / 2}
                                  y2={galaxyMapPlot.height}
                                />
                                <line
                                  className={styles.systemChartCrosshair}
                                  x1="0"
                                  y1={galaxyMapPlot.height / 2}
                                  x2={galaxyMapPlot.width}
                                  y2={galaxyMapPlot.height / 2}
                                />

                                {galaxyMapPlot.reachabilityZone ? (
                                  <>
                                    <ellipse
                                      cx={galaxyMapPlot.reachabilityZone.center_x}
                                      cy={galaxyMapPlot.reachabilityZone.center_y}
                                      rx={galaxyMapPlot.reachabilityZone.radius_x}
                                      ry={galaxyMapPlot.reachabilityZone.radius_y}
                                      fill="var(--accent)"
                                      fillOpacity="0.18"
                                      stroke="var(--accent-strong)"
                                      strokeOpacity="0.92"
                                      strokeWidth="3"
                                    />
                                    <ellipse
                                      cx={galaxyMapPlot.reachabilityZone.center_x}
                                      cy={galaxyMapPlot.reachabilityZone.center_y}
                                      rx={Math.max(0, galaxyMapPlot.reachabilityZone.radius_x - 8)}
                                      ry={Math.max(0, galaxyMapPlot.reachabilityZone.radius_y - 8)}
                                      fill="none"
                                      stroke="var(--accent)"
                                      strokeOpacity="0.6"
                                      strokeWidth="1.4"
                                    />
                                  </>
                                ) : null}

                                {galaxyMapPlot.points.map((point) => (
                                  <g key={`galaxy-map-${point.system_id}`}>
                                    <circle
                                      className={point.selected
                                        ? `${styles.systemChartPointHalo} ${styles.systemChartPointHaloActive}`
                                        : styles.systemChartPointHalo}
                                      cx={point.plot_x}
                                      cy={point.plot_y}
                                      r={point.selected ? 7 : point.current ? 6 : 5}
                                    />
                                    <circle
                                      role="button"
                                      tabIndex={0}
                                      data-testid={`galaxy-map-point-${point.system_id}`}
                                      aria-label={`system ${point.name}`}
                                      className={styles.systemChartPoint}
                                      cx={point.plot_x}
                                      cy={point.plot_y}
                                      r={point.selected ? 3.6 : point.current ? 3.2 : 2.8}
                                      fill={point.current
                                        ? "var(--accent)"
                                        : point.reachable
                                          ? "var(--ink)"
                                          : "var(--muted)"}
                                      onClick={() => {
                                        const systemId = String(point.system_id);
                                        setSelectedGalaxySystemId(systemId);
                                        setSelectedJumpSystemId(systemId);
                                        setGalaxyMapLabelSystemId(systemId);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key !== "Enter" && event.key !== " ") {
                                          return;
                                        }
                                        event.preventDefault();
                                        const systemId = String(point.system_id);
                                        setSelectedGalaxySystemId(systemId);
                                        setSelectedJumpSystemId(systemId);
                                        setGalaxyMapLabelSystemId("");
                                      }}
                                    />
                                  </g>
                                ))}
                                {galaxyLocalSelectedLabel ? (
                                  <g className={styles.galaxyMapSelectionLabelGroup}>
                                    <rect
                                      x={galaxyLocalSelectedLabel.x}
                                      y={galaxyLocalSelectedLabel.y}
                                      width={galaxyLocalSelectedLabel.width}
                                      height={galaxyLocalSelectedLabel.height}
                                      rx="6"
                                      className={styles.galaxyMapSelectionLabelBox}
                                    />
                                    <text
                                      x={galaxyLocalSelectedLabel.x + (galaxyLocalSelectedLabel.width / 2)}
                                      y={galaxyLocalSelectedLabel.y + 12}
                                      textAnchor="middle"
                                      className={styles.galaxyMapSelectionLabelText}
                                      data-testid="galaxy-map-selected-label"
                                    >
                                      {galaxyLocalSelectedLabel.labelText}
                                    </text>
                                  </g>
                                ) : null}
                              </svg>
                            ) : (
                              <p className={styles.systemChartEmpty}>No galaxy systems available.</p>
                            )}
                          </div>
                        </div>

                        <div className={styles.galaxyFooterRow}>
                          <div className={styles.contextMessagePreviewMeta}>
                            <span>Hyperspace Target</span>
                            <strong>{jumpTargetSystemLabel}</strong>
                          </div>
                          <div className={styles.contextMessagePreviewMeta}>
                            <span>Approach Station</span>
                            <strong>{jumpTargetStationLabel}</strong>
                          </div>
                          <div className={`${styles.contextMessagePreviewMeta} ${styles.galaxyTargetAction}`}>
                            <button
                              type="button"
                              className={`${styles.flightPillButton} ${styles.galaxyTargetLockButton}`}
                              disabled={!jumpTargetStationId || isDockingApproachActive}
                              onClick={toggleFlightDestinationLock}
                            >
                              {flightDestinationLockedId === jumpTargetStationId
                                ? "Unlock Hyperspace Target"
                                : "Lock Hyperspace Target"}
                            </button>
                          </div>
                        </div>

                        {selectedGalaxySystem ? (
                          <div className={styles.galaxyFooterRow}>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Selected System</span>
                              <strong>{selectedGalaxySystem.name}</strong>
                            </div>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Economy · Government</span>
                              <strong>
                                {selectedGalaxySystem.economy}
                                {` · ${selectedGalaxySystem.government}`}
                              </strong>
                            </div>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Overview</span>
                              <strong>
                                {galaxySystemOverviewLoading
                                  ? "Loading details…"
                                  : galaxySystemOverview
                                    ? `${galaxySystemOverview.overview.planets_total} planets · ${galaxySystemOverview.overview.moons_total} moons · ${galaxySystemOverview.overview.stations_total} stations`
                                    : "No details"}
                              </strong>
                            </div>
                          </div>
                        ) : null}
                        {galaxySystemOverview ? (
                          <div className={styles.galaxyFooterRow}>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Jump Readiness</span>
                              <strong>
                                {galaxySystemOverview.jump.reachable
                                  ? "Reachable"
                                  : `Blocked · ${galaxySystemOverview.jump.reason ?? "unknown"}`}
                                {typeof galaxySystemOverview.jump.estimated_jump_fuel === "number"
                                  ? ` · ${galaxySystemOverview.jump.estimated_jump_fuel} fuel`
                                  : ""}
                              </strong>
                            </div>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Route Suggestion</span>
                              <strong>{galaxyRouteSummary}</strong>
                            </div>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Coordinates</span>
                              <strong>{galaxyTargetCoordinates}</strong>
                            </div>
                          </div>
                        ) : null}
                        {galaxySystemOverviewError ? <p>{galaxySystemOverviewError}</p> : null}
                      </div>
                    </div>
                  ) : null}

                  {isSystemModeActive ? (
                    <div className={styles.flightContextPrimaryBody}>
                      <div className={styles.systemToolbar}>
                        <div className={styles.systemLayerControls}>
                          <span className={styles.systemLayerLabel}>Chart Layers</span>
                          <div className={styles.systemLayerRow} aria-label="Local chart layers" role="group">
                            {LOCAL_CHART_LAYER_OPTIONS.map((layer) => {
                              const layerEnabled = localChartLayers[layer.key];
                              return (
                                <button
                                  key={layer.key}
                                  type="button"
                                  aria-pressed={layerEnabled}
                                  data-testid={`local-chart-layer-${layer.key}`}
                                  className={layerEnabled ? styles.systemLayerButtonActive : styles.systemLayerButton}
                                  onClick={() => {
                                    setLocalChartLayers((current) => ({
                                      ...current,
                                      [layer.key]: !current[layer.key],
                                    }));
                                  }}
                                >
                                  {layer.label}
                                </button>
                              );
                            })}
                          </div>
                          <p className={`${styles.flightContextStatus} ${styles.systemTableHint}`}>
                            Select a contact below to inspect local system objects and sync scanner focus.
                          </p>
                        </div>
                        <div className={styles.systemChartControls}>
                          <div className={`${styles.galaxyControlCluster} ${styles.systemChartControlCluster}`} role="group" aria-label="System chart controls">
                            <div className={`${styles.galaxyPanPad} ${styles.systemChartPanPad}`}>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Zoom out"
                                title="Zoom out"
                                onClick={() => {
                                  localChartViewInteractedRef.current = true;
                                  setLocalChartView((current) => ({
                                    ...current,
                                    zoom: roundLocalChartControlValue(
                                      clampLocalChartZoom(current.zoom * 0.9),
                                    ),
                                  }));
                                }}
                              >
                                −
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Pan up"
                                title="Pan up"
                                onClick={() => {
                                  localChartViewInteractedRef.current = true;
                                  setLocalChartView((current) => {
                                    const panStep = LOCAL_CHART_BUTTON_PAN_PIXELS
                                      / clampLocalChartZoom(current.zoom);
                                    return {
                                      ...current,
                                      center_z: roundLocalChartControlValue(current.center_z - panStep),
                                    };
                                  });
                                }}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Zoom in"
                                title="Zoom in"
                                onClick={() => {
                                  localChartViewInteractedRef.current = true;
                                  setLocalChartView((current) => ({
                                    ...current,
                                    zoom: roundLocalChartControlValue(
                                      clampLocalChartZoom(current.zoom * 1.1),
                                    ),
                                  }));
                                }}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Pan left"
                                title="Pan left"
                                onClick={() => {
                                  localChartViewInteractedRef.current = true;
                                  setLocalChartView((current) => {
                                    const panStep = LOCAL_CHART_BUTTON_PAN_PIXELS
                                      / clampLocalChartZoom(current.zoom);
                                    return {
                                      ...current,
                                      center_x: roundLocalChartControlValue(current.center_x - panStep),
                                    };
                                  });
                                }}
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton} ${styles.galaxyControlResetButton}`}
                                aria-label="Reset view"
                                title="Reset view"
                                onClick={resetLocalChartView}
                              >
                                ↺
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Pan right"
                                title="Pan right"
                                onClick={() => {
                                  localChartViewInteractedRef.current = true;
                                  setLocalChartView((current) => {
                                    const panStep = LOCAL_CHART_BUTTON_PAN_PIXELS
                                      / clampLocalChartZoom(current.zoom);
                                    return {
                                      ...current,
                                      center_x: roundLocalChartControlValue(current.center_x + panStep),
                                    };
                                  });
                                }}
                              >
                                →
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                aria-label="Pan down"
                                title="Pan down"
                                onClick={() => {
                                  localChartViewInteractedRef.current = true;
                                  setLocalChartView((current) => {
                                    const panStep = LOCAL_CHART_BUTTON_PAN_PIXELS
                                      / clampLocalChartZoom(current.zoom);
                                    return {
                                      ...current,
                                      center_z: roundLocalChartControlValue(current.center_z + panStep),
                                    };
                                  });
                                }}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className={`${styles.systemLayerButton} ${styles.galaxyControlButton}`}
                                data-testid="local-chart-center-selected"
                                aria-label="Center on selected"
                                title="Center on selected"
                                disabled={!selectedSystemChartRawContact}
                                onClick={handleSystemChartCenterOnSelected}
                              >
                                ⌖
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={styles.systemDataWorkspace}>
                        <div className={`${styles.contextMarketBoard} ${styles.systemTableBoard}`}>
                          <div className={`${styles.contextMarketHeader} ${styles.systemTableHeader}`}>
                            <button
                              type="button"
                              data-testid="local-chart-sort-type"
                              aria-pressed={localChartSortState.key === "type"}
                              className={localChartSortState.key === "type"
                                ? `${styles.systemTableSortButton} ${styles.systemTableSortButtonActive}`
                                : styles.systemTableSortButton}
                              onClick={() => handleLocalChartSortToggle("type")}
                            >
                              Type{localChartSortIndicator("type")}
                            </button>
                            <button
                              type="button"
                              data-testid="local-chart-sort-name"
                              aria-pressed={localChartSortState.key === "name"}
                              className={localChartSortState.key === "name"
                                ? `${styles.systemTableSortButton} ${styles.systemTableSortButtonActive}`
                                : styles.systemTableSortButton}
                              onClick={() => handleLocalChartSortToggle("name")}
                            >
                              Name{localChartSortIndicator("name")}
                            </button>
                            <button
                              type="button"
                              data-testid="local-chart-sort-radius"
                              aria-pressed={localChartSortState.key === "radius"}
                              className={localChartSortState.key === "radius"
                                ? `${styles.systemTableSortButton} ${styles.systemTableSortButtonActive}`
                                : styles.systemTableSortButton}
                              onClick={() => handleLocalChartSortToggle("radius")}
                            >
                              Radius{localChartSortIndicator("radius")}
                            </button>
                            <button
                              type="button"
                              data-testid="local-chart-sort-distance"
                              aria-pressed={localChartSortState.key === "distance"}
                              className={localChartSortState.key === "distance"
                                ? `${styles.systemTableSortButton} ${styles.systemTableSortButtonActive}`
                                : styles.systemTableSortButton}
                              onClick={() => handleLocalChartSortToggle("distance")}
                            >
                              Distance{localChartSortIndicator("distance")}
                            </button>
                          </div>
                          <div className={`${styles.contextMarketBody} ${styles.systemTableBody}`}>
                            {localChartSortedDisplayRows.map((contact, index) => {
                              if (contact === null) {
                                return (
                                  <div
                                    key={`system-placeholder-${index}`}
                                    className={`${styles.contextMarketRowPlaceholder} ${styles.systemTableRowPlaceholder}`}
                                  >
                                    <span>—</span>
                                    <span>—</span>
                                    <span>—</span>
                                    <span>—</span>
                                  </div>
                                );
                              }

                              const isSelected = scannerSelectedContactId === contact.id;

                              return (
                                <button
                                  key={`system-${contact.id}`}
                                  type="button"
                                  data-testid={`local-chart-row-${contact.id}`}
                                  ref={(element) => {
                                    systemChartRowRefs.current[contact.id] = element;
                                  }}
                                  className={isSelected
                                    ? `${styles.contextMarketRowActive} ${styles.systemTableRowActive}`
                                    : `${styles.contextMarketRow} ${styles.systemTableRow}`}
                                  onClick={() => handleSystemChartSelectContact(contact.id)}
                                >
                                  <span>
                                    <strong
                                      data-testid={`system-row-token-${contact.id}`}
                                      className={styles.systemContactToken}
                                      style={{
                                        color: contact.contact_type === "star"
                                          ? "#ffd56a"
                                          : contact.contact_type === "planet"
                                            ? "#7effa1"
                                            : contact.contact_type === "moon"
                                              ? "#9ad3af"
                                              : contact.contact_type === "station"
                                                ? "#a9adb2"
                                                : "#ffb347",
                                      }}
                                    >
                                      {contact.contact_type === "star"
                                        ? "✦"
                                        : contact.contact_type === "planet"
                                          ? "◉"
                                          : contact.contact_type === "moon"
                                            ? "●"
                                            : contact.contact_type === "station"
                                              ? "◆"
                                              : "▲"}
                                    </strong>
                                    {` ${contact.contact_type.toUpperCase()}`}
                                  </span>
                                  <span>
                                    {contact.name}
                                    {contact.id === activeSystemTargetContactId ? (
                                      <strong data-testid={`local-chart-target-badge-${contact.id}`}>
                                        {" "}· TARGET
                                      </strong>
                                    ) : null}
                                  </span>
                                  <span>{contact.visual_label}</span>
                                  <span>
                                    {(() => {
                                      return contact.distance_km !== null
                                        ? formatScannerDistanceKm(contact.distance_km)
                                        : "—";
                                    })()}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <aside className={styles.systemChartPanel}>
                          <div className={styles.systemChartPanelHeader}>
                            <span>Chart View</span>
                            <strong>{scannerSystemName ?? "Unknown system"}</strong>
                          </div>

                          <div className={styles.systemChartCanvas}>
                            {systemChartPlot.points.length ? (
                              <div className={styles.systemChartCanvasStack}>
                                <svg
                                  viewBox={`-12 -28 ${systemChartPlot.width + 24} ${systemChartPlot.height + 56}`}
                                  role="img"
                                  aria-label="System chart view"
                                  data-testid="system-chart-canvas"
                                  className={styles.systemChartOverlaySvg}
                                  onPointerDown={handleSystemChartPointerDown}
                                  onPointerMove={handleSystemChartPointerMove}
                                  onPointerUp={handleSystemChartPointerUp}
                                  onPointerCancel={handleSystemChartPointerUp}
                                  onWheel={handleSystemChartWheel}
                                >
                                  <rect
                                    x="0"
                                    y="0"
                                    width={systemChartPlot.width}
                                    height={systemChartPlot.height}
                                    className={styles.systemChartBackdrop}
                                  />
                                  <line
                                    x1={systemChartPlot.width / 2}
                                    y1="0"
                                    x2={systemChartPlot.width / 2}
                                    y2={systemChartPlot.height}
                                    className={styles.systemChartCrosshair}
                                  />
                                  <line
                                    x1="0"
                                    y1={systemChartPlot.height / 2}
                                    x2={systemChartPlot.width}
                                    y2={systemChartPlot.height / 2}
                                    className={styles.systemChartCrosshair}
                                  />
                                  {systemChartPlot.rings.map((ring) => (
                                    <g key={ring.id}>
                                      <path
                                        data-testid={`system-chart-orbit-ring-${ring.id}`}
                                        d={ring.path}
                                        strokeOpacity={ring.opacity}
                                        className={styles.systemChartOrbitRing}
                                      />
                                    </g>
                                  ))}
                                  {systemChartPlot.points.map((point) => (
                                    <g key={`chart-point-${point.id}`}>
                                      {point.targeted ? (
                                        <circle
                                          data-testid={`system-chart-target-halo-${point.id}`}
                                          cx={point.plot_x}
                                          cy={point.plot_y}
                                          r={point.radius + 6}
                                          className={styles.systemChartPointHaloActive}
                                        />
                                      ) : null}
                                      {point.selected || point.contact_type === "station" ? (
                                        <circle
                                          cx={point.plot_x}
                                          cy={point.plot_y}
                                          r={point.selected ? point.radius + 4 : point.radius + 2}
                                          className={point.selected
                                            ? styles.systemChartPointHaloActive
                                            : styles.systemChartPointHaloStation}
                                        />
                                      ) : null}
                                      <circle
                                        data-testid={`system-chart-point-${point.id}`}
                                        ref={(element) => {
                                          systemChartPointRefs.current[point.id] = element;
                                        }}
                                        cx={point.plot_x}
                                        cy={point.plot_y}
                                        r={point.selected ? point.radius + 1.5 : point.radius}
                                        fill={point.color}
                                        fillOpacity={point.opacity}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`Select ${point.contact_type} ${point.name}`}
                                        className={point.contact_type === "station"
                                          ? `${styles.systemChartPoint} ${styles.systemChartPointStation}`
                                          : styles.systemChartPoint}
                                        onClick={() => handleSystemChartSelectContact(point.id)}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            handleSystemChartSelectContact(point.id);
                                            return;
                                          }

                                          if (
                                            event.key === "ArrowUp"
                                            || event.key === "ArrowDown"
                                            || event.key === "ArrowLeft"
                                            || event.key === "ArrowRight"
                                          ) {
                                            const nextPointId = findDirectionalSystemChartPointId(
                                              point.id,
                                              event.key,
                                            );
                                            if (nextPointId) {
                                              event.preventDefault();
                                              handleSystemChartSelectContact(nextPointId);
                                              window.requestAnimationFrame(() => {
                                                const nextPoint = systemChartPointRefs.current[nextPointId];
                                                nextPoint?.focus();
                                              });
                                            }
                                          }
                                        }}
                                      >
                                        <title>{`${point.contact_type.toUpperCase()} · ${point.name}`}</title>
                                      </circle>
                                      {point.selected ? (
                                        <text
                                          data-testid={`system-chart-selected-token-${point.id}`}
                                          x={point.plot_x + point.radius + 6}
                                          y={point.plot_y - (point.radius + 6)}
                                          className={styles.systemChartSelectedToken}
                                          fill={point.color}
                                        >
                                          {point.token}
                                        </text>
                                      ) : null}
                                    </g>
                                  ))}
                                </svg>
                              </div>
                            ) : (
                              <p className={styles.systemChartEmpty}>No chart contacts available.</p>
                            )}
                          </div>

                          <div className={styles.systemChartDetailFooter}>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Orbit</span>
                              <strong>{selectedSystemChartContact?.orbit_label ?? "—"}</strong>
                            </div>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Token</span>
                              <strong
                                data-testid="system-selected-token"
                                className={styles.systemContactToken}
                                style={{ color: selectedSystemChartToken.color }}
                              >
                                {selectedSystemChartToken.glyph}
                              </strong>
                            </div>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>X</span>
                              <strong data-testid="system-chart-detail-x">
                                {selectedSystemChartContact ? selectedSystemChartContact.chart_x.toFixed(1) : "—"}
                              </strong>
                            </div>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Z</span>
                              <strong data-testid="system-chart-detail-z">
                                {selectedSystemChartContact ? selectedSystemChartContact.chart_z.toFixed(1) : "—"}
                              </strong>
                            </div>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Zoom</span>
                              <strong data-testid="system-chart-detail-zoom">
                                {systemChartPlot.renderZoom.toFixed(3)}
                              </strong>
                            </div>
                          </div>

                        </aside>
                      </div>

                      <div className={styles.contextMessagePreview}>
                        <div className={`${styles.systemOverviewGrid} ${styles.systemOverviewGridTight}`}>
                          <div className={styles.contextMessagePreviewMeta}>
                            <span>System Map</span>
                            <strong>{scannerSystemName ?? localChartData?.system.name ?? "Unknown system"}</strong>
                          </div>
                          <div className={styles.contextMessagePreviewMeta}>
                            <span>Selection</span>
                            <strong data-testid="system-selected-contact">
                              {selectedSystemChartContact
                                ? selectedSystemChartContact.name
                                : "No contact selected"}
                            </strong>
                          </div>
                          <div className={`${styles.contextMessagePreviewMeta} ${styles.galaxyTargetAction}`}>
                            <button
                              type="button"
                              className={`${styles.flightPillButton} ${styles.galaxyTargetLockButton}`}
                              data-testid="system-footer-waypoint"
                              disabled={!selectedSystemChartSupportsWaypoint || isDockingApproachActive}
                              onClick={handleSystemChartWaypointToggle}
                            >
                              {selectedSystemChartWaypointLocked
                                ? "Unlock selected waypoint"
                                : "Lock selected waypoint"}
                            </button>
                          </div>
                          <div className={styles.contextMessagePreviewMeta}>
                            <span>Range</span>
                            <strong data-testid="system-selected-range">{selectedSystemChartDistanceLabel}</strong>
                          </div>
                          <div className={styles.contextMessagePreviewMeta}>
                            <span>Status</span>
                            <strong>
                              {localChartLoading
                                ? "Syncing…"
                                : localChartError
                                  ? `Offline · ${localChartError}`
                                  : "Online"}
                            </strong>
                          </div>
                          <div className={styles.contextMessagePreviewMeta}>
                            <span>Approach Station</span>
                            <strong>{selectedSystemChartStationLabel}</strong>
                          </div>
                        </div>

                        {showDeveloperTools ? (
                          <div className={styles.systemObservabilityPanel} data-testid="system-observability-panel">
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Observability</span>
                              <strong data-testid="system-observability-last-event">
                                {systemChartObservability.lastEventAt
                                  ? `last event ${new Date(systemChartObservability.lastEventAt).toLocaleTimeString()}`
                                  : "no telemetry yet"}
                              </strong>
                            </div>
                            <div className={styles.systemObservabilityGrid}>
                              <div>
                                <span>Chart opens</span>
                                <strong data-testid="system-observability-chart-opens">
                                  {systemChartObservability.chartOpenCount}
                                </strong>
                              </div>
                              <div>
                                <span>Sync success</span>
                                <strong data-testid="system-observability-sync-success">
                                  {systemChartObservability.syncSuccessCount}
                                </strong>
                              </div>
                              <div>
                                <span>Sync failure</span>
                                <strong data-testid="system-observability-sync-failure">
                                  {systemChartObservability.syncFailureCount}
                                </strong>
                              </div>
                              <div>
                                <span>Chart fetch</span>
                                <strong>
                                  {systemChartObservability.chartSyncSuccessCount}
                                  /
                                  {systemChartObservability.chartSyncFailureCount}
                                </strong>
                              </div>
                              <div>
                                <span>Render budget alerts</span>
                                <strong>
                                  {systemChartObservability.renderBudgetBreachCount}
                                </strong>
                              </div>
                              <div>
                                <span>Last render (ms)</span>
                                <strong>
                                  {typeof systemChartObservability.lastRenderDurationMs === "number"
                                    ? systemChartObservability.lastRenderDurationMs.toFixed(2)
                                    : "-"}
                                </strong>
                              </div>
                            </div>
                            <div className={styles.contextMessagePreviewMeta}>
                              <span>Last sync source</span>
                              <strong>
                                {systemChartObservability.lastSyncSource ?? "-"}
                                {systemChartObservability.lastSyncReason
                                  ? ` · ${systemChartObservability.lastSyncReason}`
                                  : ""}
                              </strong>
                            </div>
                            <div className={styles.systemObservabilityEvents} data-testid="system-observability-events">
                              <div className={styles.systemObservabilityEventsHeader}>
                                <span>Recent events</span>
                                <strong>{systemChartObservabilityEvents.length}/20</strong>
                              </div>
                              {systemChartObservabilityEvents.length ? (
                                <div className={styles.systemObservabilityEventsBody}>
                                  {systemChartObservabilityEvents.map((entry) => (
                                    <div key={entry.id} className={styles.systemObservabilityEventRow}>
                                      <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                      <span>{entry.event}</span>
                                      <span>{entry.source}</span>
                                      <span>{entry.outcome}</span>
                                      <strong title={entry.message}>{entry.message}</strong>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className={styles.systemObservabilityEventsEmpty}>No events captured yet.</p>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className={styles.systemStatusFooter}>
                        <p
                          className={`${styles.flightContextStatus} ${styles.systemStatusFooterLine}`}
                          data-testid="system-shortcuts-hint"
                        >
                          Shortcuts: ↑/↓/Home/End navigate · Enter/L waypoint · A transfer/dock · F focus in flight · 1/2/3/4 sort (distance/type/radius/name)
                        </p>
                        <p
                          className={`${styles.flightContextStatus} ${styles.systemStatusFooterLine}`}
                          data-testid="system-target-path-status"
                        >
                          <span>{systemTargetPathLabel.pathPrefix}</span>
                          {systemTargetPathLabel.blockReasonLabel ? (
                            <span
                              className={`${styles.systemTargetPathBlockToken} ${styles.systemTargetPathBlockTokenActive}`}
                              data-testid="system-target-path-block-token"
                            >
                              {` · block ${systemTargetPathLabel.blockReasonLabel} (${systemTargetBlockSummary})`}
                            </span>
                          ) : null}
                        </p>
                        <p
                          className={`${styles.systemActionReadiness} ${styles.systemStatusFooterLine}`}
                          data-testid="system-action-readiness"
                        >
                          <span>Action readiness:</span>
                          <strong
                            className={systemActionReadiness.state === "ready"
                              ? styles.systemActionReady
                              : styles.systemActionBlocked}
                          >
                            {systemActionReadiness.state === "ready" ? "READY" : "BLOCKED"}
                          </strong>
                          <span>{` · ${systemActionReadiness.reason}`}</span>
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {activeMode === "flight" ? (
                    <div className={styles.flightContextPrimaryBody}>
                      {dockedAtStation && !isFlightTransitActive ? (
                        <div className={styles.flightDockedBay}>
                          <div className={styles.flightDockedBayHeader}>
                            <span>Docked Bay</span>
                            <strong>{formatStationLabel(shipTelemetry?.docked_station_id)}</strong>
                          </div>
                          <div
                            className={`${styles.flightDockedBayScene} ${dockedStationShapeKey === "coriolis"
                              ? styles.flightDockedBaySceneCoriolis
                              : dockedStationShapeKey === "orbis"
                                ? styles.flightDockedBaySceneOrbis
                                : styles.flightDockedBaySceneDefault
                              }`}
                            data-testid="flight-docked-bay-scene"
                            data-shape-variant={dockedStationShapeKey}
                          >
                            <div className={styles.flightDockedBayWallRibs} aria-hidden="true" />
                            <div className={styles.flightDockedBayHangarBands} aria-hidden="true" />
                            <div className={styles.flightDockedBayCeilingLattice} aria-hidden="true" />
                            <div className={styles.flightDockedBayLightStripLeft} aria-hidden="true" />
                            <div className={styles.flightDockedBayLightStripRight} aria-hidden="true" />
                            <div className={styles.flightDockedBayStationRing} aria-hidden="true" />
                            <div className={styles.flightDockedBayDoor} aria-hidden="true" />
                            <div className={styles.flightDockedBayDockGlow} aria-hidden="true" />
                            <div className={styles.flightDockedBayPadHalo} aria-hidden="true" />
                            <div className={styles.flightDockedBayFloor} aria-hidden="true" />
                            <div className={styles.flightDockedBayPadCircle} aria-hidden="true" />
                            <div className={styles.flightDockedBayPadCenterline} aria-hidden="true" />
                            <div className={styles.flightDockedBayGuideLeft} aria-hidden="true" />
                            <div className={styles.flightDockedBayGuideRight} aria-hidden="true" />
                            <div className={styles.flightDockedBayCautionLeft} aria-hidden="true" />
                            <div className={styles.flightDockedBayCautionRight} aria-hidden="true" />
                            <div className={styles.flightDockedBayShipNameplate}>
                              <span>{dockedShipDisplayName}</span>
                              <strong>
                                {shipTelemetry?.docked_station_archetype_shape
                                  ? shipTelemetry.docked_station_archetype_shape
                                  : dockedStationShapeKey}
                              </strong>
                              <strong>Pad A-01</strong>
                            </div>
                            <div className={styles.flightDockedShipMk1} aria-hidden="true">
                              <span className={styles.flightDockedShipShadow} />
                              <span className={styles.flightDockedShipReflection} />
                              <span className={styles.flightDockedShipBody} />
                              <span className={styles.flightDockedShipNose} />
                              <span className={styles.flightDockedShipWingLeft} />
                              <span className={styles.flightDockedShipWingRight} />
                              <span className={styles.flightDockedShipChineLeft} />
                              <span className={styles.flightDockedShipChineRight} />
                              <span className={styles.flightDockedShipCockpit} />
                              <span className={styles.flightDockedShipPanelCenter} />
                              <span className={styles.flightDockedShipPanelLeft} />
                              <span className={styles.flightDockedShipPanelRight} />
                              <span className={styles.flightDockedShipNoseLight} />
                              <span className={styles.flightDockedShipSternPlate} />
                              <span className={styles.flightDockedShipVentLeft} />
                              <span className={styles.flightDockedShipVentRight} />
                              <span className={styles.flightDockedShipEngineLeft} />
                              <span className={styles.flightDockedShipEngineRight} />
                            </div>
                          </div>
                          <p className={styles.flightContextStatus}>
                            Docked: flight controls are paused. Use Undock to begin active flight operations.
                          </p>
                        </div>
                      ) : flightWebglState === "supported" ? (
                        <>
                          <FlightScene
                            jumpPhase={flightJumpPhase}
                            jumpProgress={flightJumpProgress}
                            renderProfile={flightRenderProfile}
                            shipVisualKey={shipTelemetry?.ship_visual_key || null}
                            stationShapeKey={
                              shipTelemetry?.docked_station_archetype_shape
                              || activeDockTargetContact?.station_archetype_shape
                              || null
                            }
                            transitStationLabel={flightTransitStationLabel}
                            showContactLabels={showFlightContactLabels}
                            focusedContact={selectedScannerContact}
                            scannerContacts={scannerContacts}
                            celestialAnchors={scannerCelestialAnchors}
                            onSpeedChange={setFlightSpeedUnits}
                            onRollChange={setFlightRollDegrees}
                            onScannerTelemetryChange={setScannerLiveContacts}
                            onCollision={
                              isDockingApproachActive
                                || isFlightTransitActive
                                || isSafetyCorridorCollisionStatus(flightCollisionStatus)
                                ? undefined
                                : handleFlightSceneCollision
                            }
                            dockingApproachContactId={flightDockingApproachTargetContactId}
                            waypointContactId={flightWaypointContactId}
                            onDockingApproachProgress={handleFlightDockingApproachProgress}
                            onDockingApproachComplete={handleFlightDockingApproachComplete}
                            spawnDirective={flightSpawnDirective}
                            onSpawnDirectiveApplied={(nonce) => {
                              setFlightSpawnDirective((current) => (
                                current && current.nonce === nonce ? null : current
                              ));
                            }}
                            key={`flight-scene-${flightSceneResetKey}`}
                          />
                          {isDockingApproachActive ? (
                            <p className={styles.flightContextStatus}>
                              Docking computer active: autopilot approach is guiding to docking port.
                            </p>
                          ) : null}
                          {isFlightTransitActive ? (
                            <p className={styles.flightContextStatus}>
                              {flightJumpPhase === FLIGHT_PHASE.DOCKING_TRANSIT_IN
                                ? `Docking transit active${flightTransitStationLabel ? ` · ${flightTransitStationLabel}` : ""}.`
                                : `Undocking transit active${flightTransitStationLabel ? ` · ${flightTransitStationLabel}` : ""}.`}
                            </p>
                          ) : null}
                          <p className={styles.flightContextStatus} data-testid="flight-local-chart-state">
                            {localChartFlightStatusLabel}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className={styles.flightContextStatus}>
                            {flightWebglState === "checking"
                              ? "Checking 3D flight capability..."
                              : FLIGHT_3D_ENABLED
                                ? "3D flight is unavailable in this browser/device. Falling back to HUD mode."
                                : "3D flight is disabled by feature flag."}
                          </p>
                          <p className={styles.flightContextStatus}>
                            {dockedAtStation
                              ? "Docked: undock to begin active flight operations."
                              : "In-space: select destination and use Jump from command controls."}
                          </p>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={styles.flightCommandStrip}>
                <div className={styles.flightModeButtons}>
                  <Tooltip content="Dock to access" placement="top" disabled={dockedAtStation}>
                    <button
                      type="button"
                      aria-disabled={!dockedAtStation}
                      className={`${styles.flightPillButton} ${activeMode === "trade" ? styles.flightPillActive : ""} ${!dockedAtStation ? styles.flightPillDisabled : ""}`}
                      onClick={() => handleModeSelect("trade")}
                    >
                      Trade
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    className={`${styles.flightPillButton} ${activeMode === "flight" ? styles.flightPillActive : ""}`}
                    onClick={() => handleModeSelect("flight")}
                  >
                    Flight
                  </button>
                  <Tooltip content="Dock to access" placement="top" disabled={dockedAtStation}>
                    <button
                      type="button"
                      aria-disabled={!dockedAtStation}
                      className={`${styles.flightPillButton} ${activeMode === "ship" ? styles.flightPillActive : ""} ${!dockedAtStation ? styles.flightPillDisabled : ""}`}
                      onClick={() => handleModeSelect("ship")}
                    >
                      Ship
                    </button>
                  </Tooltip>
                  <Tooltip content="Dock to access" placement="top" disabled={dockedAtStation}>
                    <button
                      type="button"
                      aria-disabled={!dockedAtStation}
                      className={`${styles.flightPillButton} ${activeMode === "story" ? styles.flightPillActive : ""} ${!dockedAtStation ? styles.flightPillDisabled : ""}`}
                      onClick={() => handleModeSelect("story")}
                    >
                      Story
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    className={`${styles.flightPillButton} ${activeMode === "comms" ? styles.flightPillActive : ""}`}
                    onClick={() => handleModeSelect("comms")}
                  >
                    {commsModeLabel}
                  </button>
                  <button
                    type="button"
                    aria-label="System"
                    className={`${styles.flightPillButton} ${isNavigationContextMode ? styles.flightPillActive : ""}`}
                    onClick={() => handleModeSelect("navigation")}
                  >
                    Navigation
                  </button>
                </div>

                <div className={`${styles.flightActionButtons} ${isNavigationContextMode ? styles.flightActionButtonsSystem : ""}`}>
                  {activeMode === "trade" ? (
                    <>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        onClick={() => {
                          void fetchInventory({ silent: false });
                        }}
                      >
                        Refresh market
                      </button>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={tradeLoading || !selectedCommodity}
                        onClick={() => {
                          void handleTrade();
                        }}
                      >
                        {tradeLoading ? "Processing..." : "Execute trade"}
                      </button>
                    </>
                  ) : null}

                  {activeMode === "flight" ? (
                    !dockedAtStation ? (
                      <>
                        <div className={styles.flightSettingsMenu}>
                          <button
                            type="button"
                            className={styles.flightPillButton}
                            onClick={() => setShowFlightSettings((previous) => !previous)}
                          >
                            Settings
                          </button>
                          {showFlightSettings ? (
                            <div className={styles.flightSettingsPopover}>
                              <label>
                                <span>Render Profile</span>
                                <select
                                  value={flightRenderProfile}
                                  onChange={(event) => setFlightRenderProfile(event.target.value as FlightRenderProfile)}
                                >
                                  <option value="performance">Performance</option>
                                  <option value="balanced">Balanced</option>
                                  <option value="cinematic">Cinematic</option>
                                </select>
                              </label>
                              <label className={styles.flightSettingsToggleLabel}>
                                <span>Labels</span>
                                <input
                                  data-testid="flight-setting-contact-labels"
                                  type="checkbox"
                                  checked={showFlightContactLabels}
                                  onChange={(event) => {
                                    setShowFlightContactLabels(event.target.checked);
                                  }}
                                />
                              </label>
                              <label className={styles.flightSettingsToggleLabel}>
                                <span>Scanner Debug</span>
                                <input
                                  data-testid="flight-setting-scanner-debug"
                                  type="checkbox"
                                  checked={showFlightScannerDebug}
                                  onChange={(event) => {
                                    setShowFlightScannerDebug(event.target.checked);
                                  }}
                                />
                              </label>
                              <label className={styles.flightSettingsToggleLabel}>
                                <span>Audio Cues</span>
                                <input
                                  data-testid="flight-setting-audio-enabled"
                                  type="checkbox"
                                  checked={flightAudioEnabled}
                                  onChange={(event) => {
                                    setFlightAudioEnabled(event.target.checked);
                                  }}
                                />
                              </label>
                              <label>
                                <span>Audio Engine</span>
                                <select
                                  value={flightAudioEngine}
                                  onChange={(event) => {
                                    setFlightAudioEngine(event.target.value as FlightAudioEngine);
                                  }}
                                >
                                  <option value="media-audio">Media (compatibility)</option>
                                  <option value="web-audio">WebAudio (synth)</option>
                                </select>
                              </label>
                              <label className={styles.flightSettingsToggleLabel}>
                                <span>Reduced Audio</span>
                                <input
                                  data-testid="flight-setting-reduced-audio"
                                  type="checkbox"
                                  checked={reducedAudioPreferenceEnabled}
                                  disabled={!flightAudioEnabled}
                                  onChange={(event) => {
                                    setReducedAudioPreferenceEnabled(event.target.checked);
                                  }}
                                />
                              </label>
                              <p className={styles.flightSettingsHint}>
                                {reducedMotionPreferenceEnabled
                                  ? "Reduced motion enabled: propulsion cues are limited."
                                  : "Reduced audio limits propulsion cues during active flight."}
                              </p>
                              <button
                                type="button"
                                className={styles.flightSettingsActionButton}
                                disabled={!flightAudioEnabled}
                                onClick={() => {
                                  void handleFlightAudioTest();
                                }}
                              >
                                Test Audio
                              </button>
                              <button
                                type="button"
                                className={styles.flightSettingsActionButton}
                                onClick={() => {
                                  void handleFlightMediaAudioTest();
                                }}
                              >
                                Test Media Audio
                              </button>
                              <button
                                type="button"
                                className={styles.flightSettingsActionButton}
                                disabled={shipOpsLoading}
                                onClick={() => {
                                  void handleRefuelToFull();
                                }}
                              >
                                Refuel Full
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <Tooltip
                          content={galaxyJumpDisabledReason}
                          placement="top"
                          disabled={!galaxyJumpDisabledReason}
                        >
                          <button
                            type="button"
                            className={styles.flightPillButton}
                            disabled={isGalaxyJumpDisabled}
                            onClick={handleGalaxyInitiateJump}
                          >
                            Hyperspace Jump
                          </button>
                        </Tooltip>
                        <button
                          type="button"
                          className={styles.flightPillButton}
                          onClick={toggleFlightDestinationLock}
                        >
                          {flightDestinationLockedId === jumpTargetStationId
                            ? "Unlock waypoint"
                            : "Lock waypoint"}
                        </button>
                        {isDockingApproachActive ? (
                          <button
                            type="button"
                            className={styles.flightPillButton}
                            onClick={handleCancelDockingApproach}
                            disabled={shipOpsLoading}
                          >
                            Cancel Docking
                          </button>
                        ) : (
                          <Tooltip
                            content={dockDisabledReason}
                            placement="top"
                            disabled={!dockDisabledReason}
                          >
                            <button
                              type="button"
                              className={styles.flightPillButton}
                              onClick={() => {
                                if (activeDockTargetStationId) {
                                  void handleDockCommand(activeDockTargetStationId);
                                }
                              }}
                              disabled={isDockDisabled}
                            >
                              Dock
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip
                          content={jumpDisabledReason}
                          placement="top"
                          disabled={!jumpDisabledReason}
                        >
                          <button
                            type="button"
                            className={styles.flightPillButton}
                            onClick={() => {
                              void handleFlightJumpSequence({ jumpMode: "system" });
                            }}
                            disabled={isJumpDisabled}
                          >
                            {flightJumpPhase === FLIGHT_PHASE.CHARGING
                              ? "Charging..."
                              : flightJumpPhase === FLIGHT_PHASE.JUMPING
                                ? "Jumping..."
                                : "System Jump"}
                          </button>
                        </Tooltip>
                      </>
                    ) : null
                  ) : null}

                  {isGalaxyModeActive && !dockedAtStation ? (
                    <Tooltip
                      content={galaxyJumpDisabledReason}
                      placement="top"
                      disabled={!galaxyJumpDisabledReason}
                    >
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={isGalaxyJumpDisabled}
                        onClick={handleGalaxyInitiateJump}
                      >
                        Hyperspace Jump
                      </button>
                    </Tooltip>
                  ) : null}

                  {activeMode === "ship" ? (
                    <>
                      {isDockingApproachActive ? (
                        <button
                          type="button"
                          className={styles.flightPillButton}
                          disabled={shipOpsLoading}
                          onClick={handleCancelDockingApproach}
                        >
                          Cancel Docking
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.flightPillButton}
                          disabled={shipOpsLoading || dockedAtStation}
                          onClick={() => {
                            void handleDockCommand();
                          }}
                        >
                          Dock
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={shipOpsLoading || !dockedAtStation || isDockingApproachActive || isFlightTransitActive}
                        onClick={() => {
                          void handleUndockCommand();
                        }}
                      >
                        Undock
                      </button>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={shipOpsLoading || dockedAtStation}
                        onClick={() => {
                          void handleShipOperation("jump");
                        }}
                      >
                        System Jump
                      </button>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={shipOpsLoading || !dockedAtStation}
                        onClick={() => {
                          void handleShipOperation("refuel");
                        }}
                      >
                        Refuel
                      </button>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={shipOpsLoading || !dockedAtStation}
                        onClick={() => {
                          void handleShipOperation("repair");
                        }}
                      >
                        Repair
                      </button>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={shipOpsLoading || !dockedAtStation}
                        onClick={() => {
                          void handleShipOperation("recharge");
                        }}
                      >
                        Recharge
                      </button>
                    </>
                  ) : null}

                  {activeMode === "story" ? (
                    <>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        onClick={() => {
                          void fetchStorySessions();
                        }}
                      >
                        Sync sessions
                      </button>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={storyActionLoading}
                        onClick={() => {
                          void handleStoryInterpret();
                        }}
                      >
                        Interpret
                      </button>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={storyActionLoading || !storyInterpretation}
                        onClick={() => {
                          void handleStoryConfirm(true);
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={storyActionLoading || !storyInterpretation}
                        onClick={() => {
                          void handleStoryConfirm(false);
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : null}

                  {activeMode === "comms" ? (
                    <>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        onClick={() => {
                          void fetchCommsChannels();
                        }}
                      >
                        Sync channels
                      </button>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={!selectedCommsChannel || selectedCommsChannel.unread <= 0}
                        onClick={() => {
                          if (selectedCommsChannel) {
                            void markCommsChannelRead(selectedCommsChannel.id);
                          }
                        }}
                      >
                        Mark read
                      </button>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        disabled={commsSending || !commsDraft.trim() || !selectedCommsChannel}
                        onClick={() => {
                          void handleCommsSend();
                        }}
                      >
                        {commsSending ? "Sending..." : "Send"}
                      </button>
                    </>
                  ) : null}

                  {isSystemModeActive ? (
                    <>
                      <button
                        type="button"
                        className={styles.flightPillButton}
                        data-testid="system-quick-focus-flight"
                        disabled={!selectedSystemChartContact}
                        onClick={handleSystemChartFocusInFlight}
                      >
                        Focus target in flight
                      </button>
                    </>
                  ) : null}

                </div>
              </div>
            </div>

            {shipTelemetryLoading ? (
              <DataState
                variant="loading"
                title="Loading telemetry"
                description="Syncing ship systems and flight status."
              />
            ) : shipTelemetryError ? (
              <DataState
                variant="error"
                title="Telemetry unavailable"
                description={shipTelemetryError}
                actionLabel="Retry"
                onAction={() => {
                  void fetchShipTelemetry({ silent: false });
                }}
              />
            ) : shipTelemetry ? (
              <>
                <div className={styles.flightHudGrid}>
                  <div className={styles.gaugeCard}>
                    <p className={styles.label}>Systems</p>

                    <div className={styles.gaugeGrid}>
                      <div className={styles.gaugeRow}>
                        <span>Speed</span>
                        <strong>{flightSpeedUnits.toFixed(1)}</strong>
                        <div className={styles.gaugeTrack}>
                          <div className={styles.gaugeFill} style={{ width: `${flightSpeedPercent}%` }} />
                        </div>
                      </div>

                      <div className={styles.gaugeRow}>
                        <span>Fuel</span>
                        <strong>{shipTelemetry.fuel_current}/{shipTelemetry.fuel_cap}</strong>
                        <div className={styles.gaugeTrack}>
                          <div
                            className={`${styles.gaugeFill} ${fuelGaugeFillClassName}`}
                            data-testid="flight-fuel-gauge-fill"
                            style={{ width: `${fuelPercent}%` }}
                          />
                        </div>
                      </div>

                      <div className={styles.gaugeRow}>
                        <span>Hull</span>
                        <strong>{Math.round(hullPercent)}%</strong>
                        <div className={styles.gaugeTrack}>
                          <div className={styles.gaugeFill} style={{ width: `${hullPercent}%` }} />
                        </div>
                      </div>

                      <div className={styles.gaugeRow}>
                        <span>Shields</span>
                        <strong>{Math.round(shieldPercent)}%</strong>
                        <div className={styles.gaugeTrack}>
                          <div className={styles.gaugeFill} style={{ width: `${shieldPercent}%` }} />
                        </div>
                      </div>

                      <div className={styles.gaugeRow}>
                        <span>Energy</span>
                        <strong>{Math.round(energyPercent)}%</strong>
                        <div className={styles.gaugeTrack}>
                          <div className={styles.gaugeFill} style={{ width: `${energyPercent}%` }} />
                        </div>
                      </div>

                      <div className={styles.gaugeRow}>
                        <span>Roll</span>
                        <strong>{flightRollDegrees > 0 ? "+" : ""}{flightRollDegrees.toFixed(0)}°</strong>
                        <div className={styles.rollGaugeTrack}>
                          <div className={`${styles.rollGaugeHalf} ${styles.rollGaugeHalfLeft}`}>
                            <div
                              className={styles.rollGaugeFill}
                              style={{ width: `${flightRollDegrees < 0 ? flightRollHalfPercent : 0}%` }}
                            />
                          </div>
                          <span className={styles.rollGaugeCenter}>0</span>
                          <div className={`${styles.rollGaugeHalf} ${styles.rollGaugeHalfRight}`}>
                            <div
                              className={styles.rollGaugeFill}
                              style={{ width: `${flightRollDegrees > 0 ? flightRollHalfPercent : 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={styles.systemTelemetryBlock}>
                      <div className={styles.systemTelemetryRows}>
                        <div className={styles.systemTelemetryCell}>
                          <span>Ship</span>
                          <strong>{shipTelemetry.name}</strong>
                        </div>
                        <div className={styles.systemTelemetryCell}>
                          <span>Status</span>
                          <strong>{shipTelemetry.status}</strong>
                        </div>
                        <div className={styles.systemTelemetryCell}>
                          <span>Cargo</span>
                          <strong>{shipCargo ? `${shipCargo.cargo_used}/${shipCargo.cargo_capacity}` : "-"}</strong>
                        </div>
                      </div>

                      <div className={styles.systemTelemetryRows}>
                        <div className={styles.systemTelemetryCell}>
                          <span>Waypoint</span>
                          <strong>{flightLockedDestinationName}</strong>
                        </div>
                        <div className={styles.systemTelemetryCell}>
                          <span>Lock</span>
                          <strong>
                            {flightDestinationLockedId
                              ? (flightJumpPhase === FLIGHT_PHASE.DESTINATION_LOCKED
                                ? "locked"
                                : flightJumpPhase)
                              : "none"}
                          </strong>
                        </div>
                        <div className={styles.systemTelemetryCell}>
                          <span>Docked</span>
                          <strong>{formatStationLabel(shipTelemetry.docked_station_id)}</strong>
                        </div>
                      </div>

                      <div className={styles.systemTelemetryRows}>
                        <div className={styles.systemTelemetryCell}>
                          <span>Cooldown</span>
                          <strong>{flightJumpCooldownSeconds > 0 ? `${flightJumpCooldownSeconds}s` : "ready"}</strong>
                        </div>
                        <div className={styles.systemTelemetryCell}>
                          <span>Jumps</span>
                          <strong>{completedJumps}</strong>
                        </div>
                        <div className={styles.systemTelemetryCell}>
                          <span>Impacts</span>
                          <strong>
                            {flightRecentImpacts.length
                              ? flightRecentImpacts.map((entry) => entry.label).join(" | ")
                              : "none"}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className={styles.systemTelemetryCollisionLine}>
                      <span>Collision</span>
                      <strong>{flightCollisionStatus}</strong>
                    </div>
                  </div>

                  <div className={styles.flightScanner}>
                    <div className={styles.scannerGrid}>
                      <div className={styles.scannerPlane} />
                      <div className={styles.scannerPlaneCenterLine} />
                      <div className={styles.scannerFovWedge} style={scannerFovWedgeStyle} aria-hidden="true">
                        <span className={styles.scannerFovEdgeLeft} />
                        <span className={styles.scannerFovEdgeRight} />
                      </div>
                      <span className={styles.scannerOwnship} aria-hidden="true" />
                      <div className={styles.scannerTopRow}>
                        <div className={`${styles.scannerTopMetric} ${styles.scannerTopMetricSystem}`}>
                          <span>System</span>
                          <strong>{scannerSystemName ?? localChartData?.system.name ?? "System unknown"}</strong>
                        </div>
                        <div className={`${styles.scannerTopMetric} ${styles.scannerTopMetricDockRange} ${styles.scannerTopMetricCenter}`}>
                          <span>Dock Target Range</span>
                          <strong>
                            {dockTargetRangeLabel}
                          </strong>
                        </div>
                        <div className={`${styles.scannerTopMetric} ${styles.scannerTopMetricTarget} ${styles.scannerTopMetricRight}`}>
                          <span>Chart Target</span>
                          <strong data-testid="scanner-chart-target">
                            {localChartTargetStatusLabel}
                            {localChartTargetContactLabel !== "none"
                              ? ` (${localChartTargetContactLabel})`
                              : ""}
                          </strong>
                        </div>
                        <div className={`${styles.scannerTopMetric} ${styles.scannerTopMetricLocation} ${styles.scannerTopMetricRight}`}>
                          <span>Location</span>
                          <strong>{currentLocationLabel}</strong>
                        </div>
                      </div>
                      <div className={styles.scannerRangeDock}>
                        <span className={styles.scannerRangeLabel}>Scanner Range</span>
                        <select
                          className={styles.scannerRangeSelect}
                          aria-label="Scanner range"
                          value={String(scannerRangeKm)}
                          onChange={(event) => {
                            const nextRangeKm = Number(event.target.value);
                            if (
                              Number.isInteger(nextRangeKm)
                              && SCANNER_RANGE_PRESETS_KM.includes(nextRangeKm as (typeof SCANNER_RANGE_PRESETS_KM)[number])
                            ) {
                              setScannerRangeKm(nextRangeKm);
                            }
                          }}
                        >
                          {SCANNER_RANGE_PRESETS_KM.map((presetKm) => (
                            <option key={presetKm} value={presetKm}>
                              {presetKm} km
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedJumpSystemId ? (
                        <div className={styles.scannerClearanceChip}>
                          <span>Clearance Distance</span>
                          <strong>
                            {nearestHyperspaceClearanceDistanceKm !== null
                              ? `${Math.max(0, Math.round(nearestHyperspaceClearanceDistanceKm))} km`
                              : "—"}
                          </strong>
                        </div>
                      ) : null}
                      {scannerHudContacts.map((contact) => {
                        if (!contact.visibleOnScannerGrid) {
                          return null;
                        }
                        const leftPercent = `${contact.left}%`;
                        const topPercent = `${contact.planeTop}%`;
                        const planeTopPercent = `${contact.planeTop}%`;
                        const lineTop = Math.min(contact.dotTop, contact.planeTop);
                        const lineHeight = Math.abs(contact.dotTop - contact.planeTop);
                        const isSelected = scannerSelectedContactId === contact.id;
                        return (
                          <div key={contact.id}>
                            {lineHeight >= 1 ? (
                              <span
                                className={styles.scannerAltitudeLine}
                                style={{ left: leftPercent, top: `${lineTop}%`, height: `${lineHeight}%` }}
                              />
                            ) : null}
                            <span className={styles.scannerPlaneDot} style={{ left: leftPercent, top: planeTopPercent }} />
                            <button
                              type="button"
                              className={`${styles.scannerBlip} ${styles[`scannerBlip${contact.contact_type.charAt(0).toUpperCase()}${contact.contact_type.slice(1)}` as keyof typeof styles]} ${contact.inView ? styles.scannerBlipInView : styles.scannerBlipOutOfView} ${isSelected ? styles.scannerBlipSelected : ""}`}
                              style={{ top: topPercent, left: leftPercent }}
                              onClick={() => {
                                selectScannerContactWithSource(contact.id, "scanner-hud-blip");
                              }}
                              aria-label={`${contact.contact_type} ${contact.name}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <p>
                      {scannerContactsLoading
                        ? "Scanner · Scanning..."
                        : scannerContactsError
                          ? "Scanner · Offline"
                          : `Scanner · ${scannerContacts.length} contacts${scannerOutOfRangeContactCount > 0 ? ` · ${scannerOutOfRangeContactCount} outside range` : ""}`}
                    </p>
                    <span style={{ display: "none" }} data-testid="scanner-chart-state">
                      {`${localChartFlightPhaseLabel} · ${localChartTargetStatusLabel}${localChartTargetContactLabel !== "none" ? ` (${localChartTargetContactLabel})` : ""}`}
                    </span>
                    <span style={{ display: "none" }} data-testid="scanner-chart-audio-hints">
                      {`Chart hints: ${localChartAudioHintSummary}`}
                    </span>
                    <span style={{ display: "none" }} data-testid="flight-audio-dispatcher-state">
                      {`event ${flightAudioDispatchSummary.lastEvent} · dispatched ${flightAudioDispatchSummary.dispatchedCount} · cooldown ${flightAudioDispatchSummary.blockedCooldownCount} · category ${flightAudioDispatchSummary.blockedCategoryCapCount} · settings ${flightAudioDispatchSummary.blockedSettingsCount} · audio ${flightAudioEnabled ? "on" : "off"} · engine ${flightAudioEngine} · reduced ${reducedAudioEnabled ? "on" : "off"} · playback ${flightAudioPlaybackSummary.lastResult} · played ${flightAudioPlaybackSummary.playedCount} · unsupported ${flightAudioPlaybackSummary.unsupportedCount}`}
                    </span>
                    <div className={styles.scannerContactsList}>
                      {scannerHudContactsForList
                        .slice(0, SCANNER_LIST_MAX_ROWS)
                        .map((contact) => (
                          <button
                            key={`list-${contact.id}`}
                            data-testid={`scanner-contact-row-${contact.id}`}
                            type="button"
                            className={`${styles.scannerContactRow} ${scannerSelectedContactId === contact.id ? styles.scannerContactRowActive : ""}`}
                            onClick={() => {
                              selectScannerContactWithSource(contact.id, "scanner-hud-list");
                            }}
                          >
                            <span>{contact.contact_type.toUpperCase()}</span>
                            <strong>
                              {contact.name}
                              {contact.id === localChartTargetContactId ? (
                                <span data-testid={`scanner-contact-target-badge-${contact.id}`}>
                                  {" "}· TARGET
                                </span>
                              ) : null}
                            </strong>
                            <span>{formatScannerDistanceKm(contact.displayDistance)}</span>
                          </button>
                        ))}
                    </div>
                    {showFlightScannerDebug && selectedScannerHudContact ? (
                      <p className={styles.scannerDebugLine}>
                        DBG {selectedScannerHudContact.id} · type={selectedScannerHudContact.contact_type} · inView={selectedScannerHudContact.inView ? "yes" : "no"} · grid={selectedScannerHudContact.visibleOnScannerGrid ? "yes" : "no"} · fwd={selectedScannerHudContact.forwardDistance.toFixed(2)} · fov=({selectedScannerHudContact.fovX.toFixed(2)},{selectedScannerHudContact.fovY.toFixed(2)}) · plane=({selectedScannerHudContact.planeX.toFixed(2)},{selectedScannerHudContact.planeY.toFixed(2)}) · blip=({selectedScannerHudContact.scannerLeft.toFixed(1)}%,{selectedScannerHudContact.scannerTop.toFixed(1)}%) · xyz=({selectedScannerHudContact.relativeX.toFixed(2)},{selectedScannerHudContact.relativeY.toFixed(2)},{selectedScannerHudContact.relativeZ.toFixed(2)})
                      </p>
                    ) : null}
                  </div>

                  <div className={styles.flightActionsCard}>
                    <section className={`${styles.contextMiniPanel} ${styles.contextMiniPanelInline}`}>
                      <div className={styles.contextMiniHeader}>
                        <p className={styles.label}>Context Window</p>
                        <span>{contextModeLabel}</span>
                      </div>

                      <div className={styles.flightContextGrid}>
                        <div className={`${styles.flightContextCard} ${styles.flightContextCardWide}`}>
                          <p className={styles.label}>Comms</p>
                          <div className={styles.flightContextRows}>
                            <span>Channel</span>
                            <strong>{selectedCommsChannelLabel}</strong>
                            <span>Messages</span>
                            <strong>{selectedCommsMessages.length}</strong>
                            <span>Status</span>
                            <strong>{commsStatus}</strong>
                            <span>Mode</span>
                            <strong>{activeMode}</strong>
                          </div>
                        </div>

                        <div className={`${styles.flightContextCard} ${styles.flightContextCardWide}`}>
                          <p className={styles.label}>Economic</p>
                          <div className={styles.flightFocusLayout}>
                            <div className={styles.flightFocusBottom}>
                              <div className={styles.flightFocusMetric}>
                                <span>Credits</span>
                                <strong>{commanderProfile?.credits ?? "--"}</strong>
                              </div>
                              <div className={styles.flightFocusMetric}>
                                <span>Timestamp</span>
                                <strong>{modeContextDate}</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </>
            ) : (
              <DataState
                variant="empty"
                title="No telemetry available"
                description="Select a valid ship ID and refresh telemetry."
                actionLabel="Refresh"
                onAction={() => {
                  void fetchShipTelemetry({ silent: false });
                }}
              />
            )}
          </section>
        ) : null}

        {token && !useFlightShell && activeMode === "trade" ? (
          <section className={`${styles.modeMainPanel} ${styles.tradePanel}`}>
            <div className={styles.tradeHeader}>
              <div>
                <p className={styles.label}>Station Market</p>
                <h2>{selectedStation?.name ?? "Station Market Terminal"}</h2>
                <p className={styles.tradeSubhead}>Docked exchange board · live inventory</p>
              </div>
              <div className={styles.stationInput}>
                <label>
                  <span>Station ID</span>
                  <Tooltip
                    content="Choose a station to load its live market inventory."
                    placement="top"
                  >
                    <select
                      value={stationId}
                      onChange={(event) => setStationId(event.target.value)}
                    >
                      {stationOptions.length ? (
                        stationOptions.map((station) => (
                          <option key={station.id} value={station.id}>
                            {station.name} (#{station.id})
                          </option>
                        ))
                      ) : (
                        <option value={stationId || "1"}>Station #{stationId || "1"}</option>
                      )}
                    </select>
                  </Tooltip>
                </label>
                <Tooltip
                  content="Fetch the latest inventory and prices for the selected station."
                  placement="top"
                >
                  <button type="button" onClick={() => { void fetchInventory(); }}>
                    Refresh
                  </button>
                </Tooltip>
              </div>
            </div>
            <div className={styles.flightCommandStrip}>
              <button type="button" onClick={() => setActiveMode("trade")}>Trade</button>
              <button type="button" onClick={() => setActiveMode("flight")}>Flight</button>
              <button type="button" onClick={() => setActiveMode("ship")}>Ship</button>
              <button type="button" onClick={() => setActiveMode("story")}>Story</button>
              <button type="button" onClick={() => setActiveMode("comms")}>{commsModeLabel}</button>
            </div>

            <div className={styles.tradeGrid}>
              <div className={styles.tradeTerminal}>
                {inventoryLoading ? (
                  <DataState
                    variant="loading"
                    title="Loading market inventory"
                    description="Syncing the selected station feed."
                  />
                ) : inventoryError ? (
                  <DataState
                    variant="error"
                    title="Inventory unavailable"
                    description={inventoryError}
                    actionLabel="Retry"
                    onAction={() => {
                      void fetchInventory({ silent: false });
                    }}
                  />
                ) : inventory.length ? (
                  <div className={styles.tableScroller}>
                    <div className={styles.tradeTableHeader}>
                      <span>Product</span>
                      <span>Stock</span>
                      <span>Buy</span>
                      <span>Sell</span>
                      <span>Hold</span>
                    </div>
                    <div className={styles.tradeTableBody}>
                      {inventory.map((item) => (
                        <button
                          key={item.commodity_id}
                          type="button"
                          className={
                            selectedCommodity === item.commodity_id
                              ? styles.tradeRowActive
                              : styles.tradeRow
                          }
                          onClick={() => setSelectedCommodity(item.commodity_id)}
                        >
                          <span className={styles.productCell}>{item.name}</span>
                          <span>{item.quantity}</span>
                          <span>{item.buy_price}</span>
                          <span>{item.sell_price}</span>
                          <span>{commodityHoldMap.get(item.commodity_id) ?? 0}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <DataState
                    variant="empty"
                    title="No inventory loaded"
                    description="Select a station or refresh to pull market data."
                    actionLabel="Refresh"
                    onAction={() => {
                      void fetchInventory({ silent: false });
                    }}
                  />
                )}
              </div>

              <div className={styles.tradeControls}>
                <div className={styles.segmented}>
                  <button
                    type="button"
                    className={direction === "buy" ? styles.segmentActive : ""}
                    onClick={() => setDirection("buy")}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    className={direction === "sell" ? styles.segmentActive : ""}
                    onClick={() => setDirection("sell")}
                  >
                    Sell
                  </button>
                </div>

                <label>
                  <span>Ship ID</span>
                  <input
                    type="number"
                    min="1"
                    value={shipId}
                    onChange={(event) => setShipId(event.target.value)}
                  />
                </label>

                <label>
                  <span>Quantity</span>
                  <input
                    type="number"
                    min="1"
                    value={tradeQty}
                    onChange={(event) => setTradeQty(event.target.value)}
                  />
                </label>

                <Tooltip
                  content={
                    tradeLoading
                      ? "Trade request is in progress. Please wait."
                      : "Submit this trade using current station, ship, and quantity."
                  }
                  placement="top"
                >
                  <button
                    type="button"
                    onClick={handleTrade}
                    disabled={tradeLoading}
                  >
                    {tradeLoading ? "Submitting..." : "Execute trade"}
                  </button>
                </Tooltip>

                {selectedCommodityItem ? (
                  <div className={styles.selectedCommodityPanel}>
                    <p className={styles.label}>Selected Commodity</p>
                    <p>{selectedCommodityItem.name}</p>
                    <span>
                      Buy {selectedCommodityItem.buy_price} · Sell {selectedCommodityItem.sell_price}
                    </span>
                  </div>
                ) : null}

                <div className={styles.cargoPanel}>
                  <div className={styles.cargoHeader}>
                    <p className={styles.label}>Ship Cargo</p>
                    {shipCargo ? (
                      <Tooltip
                        content={
                          shipCargo.cargo_capacity <= 0
                            ? "This ship has no cargo hold. Install one before buying goods."
                            : "Cargo hold is available and can store traded commodities."
                        }
                        placement="top"
                      >
                        <span
                          className={`${styles.cargoChip} ${shipCargo.cargo_capacity <= 0
                            ? styles.cargoChipNoHold
                            : styles.cargoChipReady
                            }`}
                        >
                          {shipCargo.cargo_capacity <= 0 ? "No Hold" : "Ready"}
                        </span>
                      </Tooltip>
                    ) : null}
                  </div>
                  {cargoLoading ? (
                    <DataState
                      variant="loading"
                      title="Loading cargo"
                      description="Syncing current hold usage."
                    />
                  ) : cargoError ? (
                    <DataState
                      variant="error"
                      title="Cargo unavailable"
                      description={cargoError}
                      actionLabel="Retry"
                      onAction={() => {
                        void fetchShipCargo({ silent: false });
                      }}
                    />
                  ) : shipCargo ? (
                    <>
                      <p>
                        {shipCargo.cargo_used}/{shipCargo.cargo_capacity} used
                      </p>
                      <p>{shipCargo.cargo_free} free</p>
                      <div className={styles.cargoItems}>
                        {shipCargo.cargo_capacity <= 0 ? (
                          <p>No cargo hold installed.</p>
                        ) : shipCargo.items.length ? (
                          shipCargo.items.map((item) => (
                            <p key={item.commodity_id}>
                              {item.commodity_name}: {item.quantity}
                            </p>
                          ))
                        ) : (
                          <p>Hold empty.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <DataState
                      variant="empty"
                      title="No cargo data"
                      description="Refresh cargo to load hold details for this ship."
                      actionLabel="Refresh"
                      onAction={() => {
                        void fetchShipCargo({ silent: false });
                      }}
                    />
                  )}
                </div>

                <div className={styles.tradeStatus}>
                  <p className={styles.label}>Market Status</p>
                  <p>{tradeStatus}</p>
                </div>
              </div>
            </div>

            <div className={styles.tradeBottomStrip}>
              <div className={styles.stripItem}>
                <p className={styles.label}>Cash</p>
                <p>{commanderProfile ? `${commanderProfile.credits} CR` : "-"}</p>
              </div>
              <div className={styles.stripItem}>
                <p className={styles.label}>Cargo</p>
                <p>
                  {shipCargo
                    ? `${shipCargo.cargo_used}/${shipCargo.cargo_capacity}t`
                    : "-"}
                </p>
              </div>
              <div className={styles.stripItem}>
                <p className={styles.label}>Ship State</p>
                <p>{shipOpsStatus}</p>
              </div>
            </div>
          </section>
        ) : null}

        {token && !useFlightShell && activeMode !== "flight" ? (
          <section className={styles.contextMiniPanel}>
            <div className={styles.contextMiniHeader}>
              <p className={styles.label}>Context Window</p>
              <span>{contextModeLabel}</span>
            </div>

            <div className={styles.contextMiniList}>
              <p>Telemetry</p>
              <p>Ship: {shipTelemetry?.name ?? "-"}</p>
              <p>Status: {shipTelemetry?.status ?? "-"}</p>
              <p>
                Cargo: {shipCargo ? `${shipCargo.cargo_used}/${shipCargo.cargo_capacity}` : "-"}
              </p>
              <p>
                Fuel: {shipTelemetry ? `${Math.round(fuelPercent)}%` : "-"}
              </p>
            </div>

            <div className={styles.contextMiniList}>
              <p>Comms</p>
              <p>Channel: {selectedCommsChannelLabel}</p>
              <p>Messages: {selectedCommsMessages.length}</p>
              <p>Unread: {totalCommsUnread}</p>
              <p>Status: {commsStatus}</p>
            </div>

            {activeMode === "trade" ? (
              <div className={styles.contextMiniList}>
                <p>Trade Focus</p>
                <p>{token ? "✓" : "○"} Authenticate commander</p>
                <p>{completedTrades > 0 ? "✓" : "○"} Complete 1 trade</p>
                <p>{completedJumps > 0 ? "✓" : "○"} Complete 1 jump</p>
                <p>{completedStoryActions > 0 ? "✓" : "○"} Confirm 1 story action</p>
              </div>
            ) : null}

            {activeMode === "trade" && marketSummary.length ? (
              <div className={styles.contextMiniList}>
                {marketSummary.slice(0, 3).map((item) => (
                  <p key={item.station_id}>
                    {item.station_name}: {item.commodity_count} goods · {item.scarcity_count} scarcity
                  </p>
                ))}
              </div>
            ) : null}

            {activeMode === "trade" && marketSummaryLoading ? (
              <div className={styles.contextMiniList}>
                <p>Loading market summary…</p>
              </div>
            ) : null}

            {activeMode === "trade" && marketSummaryError ? (
              <div className={styles.contextMiniList}>
                <p>Summary error: {marketSummaryError}</p>
              </div>
            ) : null}

            {activeMode === "story" ? (
              <div className={styles.contextMiniList}>
                <p>Story Focus</p>
                <p>Outcome: {storyOutcome ?? "Awaiting action outcome"}</p>
                <p>Sessions: {storySessions.length}</p>
                <p>Actions confirmed: {completedStoryActions}</p>
              </div>
            ) : null}

            {activeMode === "comms" ? (
              <div className={styles.contextMiniList}>
                <p>Comms Focus</p>
                <p>Relay: {selectedCommsChannel?.delayLabel ?? "-"}</p>
                <p>Unread: {selectedCommsChannel?.unread ?? 0}</p>
                <p>Timestamp: {modeContextDate}</p>
              </div>
            ) : null}

            {activeMode === "ship" ? (
              <div className={styles.contextMiniList}>
                <p>Ship Focus</p>
                <p>Ship Ops: {shipOpsStatus}</p>
                <p>
                  Location: {currentLocationLabel}
                </p>
                <p>Credits: {commanderProfile?.credits ?? "-"}</p>
              </div>
            ) : null}

            {activeMode === "navigation" ? (
              <div className={styles.contextMiniList}>
                <p>Flight Focus</p>
                <p>Docked: {formatStationLabel(shipTelemetry?.docked_station_id)}</p>
                <p>Jump Count: {completedJumps}</p>
                <p>Timestamp: {modeContextDate}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {token && !useFlightShell && activeMode === "story" ? (
          <section className={`${styles.modeMainPanel} ${styles.storyPanel}`}>
            <div className={styles.storyHeader}>
              <div>
                <p className={styles.label}>Narrative Terminal</p>
                <h3>Session Timeline</h3>
              </div>
              <Tooltip
                content="Creates a new story session at the selected station."
                placement="top"
              >
                <button type="button" onClick={handleStoryStart}>
                  Start story at station
                </button>
              </Tooltip>
            </div>
            <div className={styles.flightCommandStrip}>
              <button type="button" onClick={() => setActiveMode("trade")}>Trade</button>
              <button type="button" onClick={() => setActiveMode("flight")}>Flight</button>
              <button type="button" onClick={() => setActiveMode("ship")}>Ship</button>
              <button type="button" onClick={() => setActiveMode("story")}>Story</button>
              <button type="button" onClick={() => setActiveMode("comms")}>{commsModeLabel}</button>
            </div>
            <div className={styles.storyGrid}>
              <div className={styles.storyControlsPanel}>
                {storySessions.length ? (
                  <div className={styles.storyControls}>
                    <label>
                      <span>Session</span>
                      <select
                        value={selectedStorySessionId}
                        onChange={(event) => setSelectedStorySessionId(event.target.value)}
                      >
                        {storySessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            Session #{session.id} · {session.status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Action</span>
                      <input
                        type="text"
                        value={storyInput}
                        placeholder="Inspect the docking bay"
                        onChange={(event) => setStoryInput(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={storyActionLoading}
                      onClick={() => {
                        void handleStoryInterpret();
                      }}
                    >
                      Interpret action
                    </button>
                    {storyInterpretation ? (
                      <div className={styles.storyInterpretation}>
                        <p>{storyInterpretation}</p>
                        <div className={styles.storyConfirmActions}>
                          <button
                            type="button"
                            disabled={storyActionLoading}
                            onClick={() => {
                              void handleStoryConfirm(true);
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            disabled={storyActionLoading}
                            onClick={() => {
                              void handleStoryConfirm(false);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {storyOutcome ? <p className={styles.storyOutcome}>{storyOutcome}</p> : null}
                  </div>
                ) : null}
              </div>

              <div className={styles.storyTimelinePanel}>
                <p className={styles.label}>Output</p>
                <div className={styles.storyList}>
                  {storyLoading ? (
                    <DataState
                      variant="loading"
                      title="Loading sessions"
                      description="Retrieving your latest story timeline."
                    />
                  ) : storyError ? (
                    <DataState
                      variant="error"
                      title="Story sessions unavailable"
                      description={storyError}
                      actionLabel="Retry"
                      onAction={() => {
                        void fetchStorySessions();
                      }}
                    />
                  ) : storySessions.length ? (
                    storySessions.map((session) => (
                      <div key={session.id} className={styles.storyItem}>
                        <p>Session #{session.id}</p>
                        <span>
                          {formatStoryLocationLabel(session)} · {session.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <DataState
                      variant="empty"
                      title="No story sessions yet"
                      description="Start a story at the selected station to begin your timeline."
                      actionLabel="Start story"
                      onAction={() => {
                        void handleStoryStart();
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {token && !useFlightShell && activeMode === "comms" ? (
          <section className={`${styles.modeMainPanel} ${styles.commsPanel}`}>
            <div className={styles.commsHeader}>
              <div>
                <p className={styles.label}>Comms Relay</p>
                <h3>Message Console</h3>
              </div>
              <div className={styles.commsHeaderActions}>
                <span className={styles.commsUnreadLabel}>Unread: {totalCommsUnread}</span>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => {
                    void fetchCommsChannels();
                  }}
                >
                  Resync relay
                </button>
              </div>
            </div>
            <div className={styles.flightCommandStrip}>
              <button type="button" onClick={() => setActiveMode("trade")}>Trade</button>
              <button type="button" onClick={() => setActiveMode("flight")}>Flight</button>
              <button type="button" onClick={() => setActiveMode("ship")}>Ship</button>
              <button type="button" onClick={() => setActiveMode("story")}>Story</button>
              <button type="button" onClick={() => setActiveMode("comms")}>{commsModeLabel}</button>
            </div>

            {commsLoading ? (
              <DataState
                variant="loading"
                title="Connecting relay channels"
                description="Syncing local and interstellar channels."
              />
            ) : commsError ? (
              <DataState
                variant="error"
                title="Comms unavailable"
                description={commsError}
                actionLabel="Retry"
                onAction={() => {
                  void fetchCommsChannels();
                }}
              />
            ) : !commsChannels.length ? (
              <DataState
                variant="empty"
                title="No channels found"
                description="No local or relay channels are currently available."
              />
            ) : (
              <div className={styles.commsGrid}>
                <div className={styles.channelList}>
                  {commsChannels.map((channel) => (
                    <button
                      key={channel.id}
                      type="button"
                      className={
                        channel.id === commsSelectedChannelId
                          ? styles.channelItemActive
                          : styles.channelItem
                      }
                      onClick={() => setCommsSelectedChannelId(channel.id)}
                    >
                      <p>{formatCommsChannelName(channel)}</p>
                      <span>
                        {channel.scope} · {channel.delayLabel} · {channel.unread} unread
                      </span>
                    </button>
                  ))}
                </div>

                <div className={styles.messagePane}>
                  <div className={styles.messageMeta}>
                    <p>
                      {selectedCommsChannel
                        ? `${selectedCommsChannelLabel} · ${selectedCommsChannel.delayLabel}`
                        : "No channel selected"}
                    </p>
                    <span>{commsStatus}</span>
                  </div>

                  {selectedCommsMessages.length ? (
                    <div className={styles.messageList}>
                      {selectedCommsMessages.map((message) => (
                        <article
                          key={message.id}
                          className={
                            message.direction === "outbound"
                              ? styles.messageOutbound
                              : styles.messageInbound
                          }
                        >
                          <p>{message.author}</p>
                          <span>{message.body}</span>
                          <small>
                            {message.timestamp} · {formatCommsDeliveryLabel(message.delivery)}
                          </small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <DataState
                      variant="empty"
                      title="No messages in channel"
                      description="Transmit a message to begin this thread."
                    />
                  )}

                  <div className={styles.composerRow}>
                    <label>
                      <span>Transmit</span>
                      <input
                        type="text"
                        value={commsDraft}
                        placeholder="Type relay message"
                        onChange={(event) => setCommsDraft(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={commsSending || !commsDraft.trim() || !selectedCommsChannel}
                      onClick={() => {
                        void handleCommsSend();
                      }}
                    >
                      {commsSending ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : null}

      </main>
    </div>
  );
}
