import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";
import { ToastProvider } from "../components/ui/ToastProvider";

vi.mock("next/dynamic", () => ({
  default: () => {
    function MockFlightScene(props: {
      focusedContact: { name?: string } | null;
      jumpPhase?: string;
      cameraMode?: "boresight" | "cockpit";
      scannerRangeKm?: number;
      showContactLabels?: boolean;
      waypointContactId?: string | null;
      celestialAnchors?: Array<{
        id: string;
        body_kind?: string;
        relative_x_km?: number;
        relative_y_km?: number;
        relative_z_km?: number;
      }>;
      dockingApproachContactId?: string | null;
      onDockingApproachComplete?: () => void;
      scannerContacts?: Array<{ id: string; distance_km?: number }>;
      onScannerTelemetryChange?: (contacts: Array<{
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
        distance_mode?: "surface" | "port";
      }>) => void;
    }) {
      const {
        dockingApproachContactId,
        onDockingApproachComplete,
        focusedContact,
        jumpPhase,
        cameraMode,
        scannerRangeKm,
        showContactLabels,
        waypointContactId,
        celestialAnchors,
        scannerContacts,
        onScannerTelemetryChange,
      } = props;

      const moonAnchorCount = Array.isArray(celestialAnchors)
        ? celestialAnchors.filter((anchor) => anchor.body_kind === "moon").length
        : 0;

      useEffect(() => {
        if (!onScannerTelemetryChange || !Array.isArray(scannerContacts)) {
          return;
        }

        const telemetryOverrides = ((globalThis as unknown as {
          __scannerTelemetryOverrides?: Record<string, Partial<{
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
          }>>;
        }).__scannerTelemetryOverrides) ?? {};

        const telemetry = scannerContacts.map((contact, index) => {
          const isPrimaryStation = contact.id === "station-101";
          const baseTelemetry = {
            id: contact.id,
            relative_x: isPrimaryStation ? 90 : (index + 1) * 10,
            relative_y: 0,
            relative_z: -60,
            relative_x_km: isPrimaryStation ? 90 : (index + 1) * 10,
            relative_y_km: 0,
            relative_z_km: -60,
            forward_distance: 60,
            plane_x: isPrimaryStation ? -0.9 : 0.2,
            plane_y: 0.4,
            altitude: 0,
            in_view: true,
            fov_x: isPrimaryStation ? 0.9 : 0.1,
            fov_y: 0,
            horizontal_fov_degrees: 96,
            vertical_fov_degrees: 62,
            distance: Number.isFinite(contact.distance_km) ? Number(contact.distance_km) : 10,
            distance_mode: "surface" as const,
          };

          return {
            ...baseTelemetry,
            ...(telemetryOverrides[contact.id] ?? {}),
          };
        });

        onScannerTelemetryChange(telemetry);
      }, [onScannerTelemetryChange, scannerContacts]);

      useEffect(() => {
        const disableDockingApproachAutoComplete = Boolean(
          (globalThis as unknown as {
            __disableDockingApproachAutoComplete?: boolean;
          }).__disableDockingApproachAutoComplete,
        );
        if (!dockingApproachContactId || disableDockingApproachAutoComplete) {
          return;
        }

        const timer = window.setTimeout(() => {
          onDockingApproachComplete?.();
        }, 180);

        return () => {
          window.clearTimeout(timer);
        };
      }, [dockingApproachContactId, onDockingApproachComplete]);

      return (
        <>
          <div data-testid="flight-scene-focused-contact">
            {focusedContact?.name ?? "none"}
          </div>
          <div data-testid="flight-scene-jump-phase">
            {jumpPhase ?? "idle"}
          </div>
          <div data-testid="flight-scene-camera-mode">
            {cameraMode ?? "boresight"}
          </div>
          <div data-testid="flight-scene-scanner-range">
            {String(scannerRangeKm ?? 25)}
          </div>
          <div data-testid="flight-scene-show-contact-labels">
            {showContactLabels ? "on" : "off"}
          </div>
          <div data-testid="flight-scene-waypoint-contact-id">
            {waypointContactId ?? "none"}
          </div>
          <div data-testid="flight-scene-moon-anchor-count">
            {String(moonAnchorCount)}
          </div>
          {Array.isArray(celestialAnchors)
            ? celestialAnchors.map((anchor) => (
              <div
                key={anchor.id}
                data-testid={`flight-scene-celestial-anchor-${anchor.id}`}
              >
                {[
                  anchor.relative_x_km ?? "na",
                  anchor.relative_y_km ?? "na",
                  anchor.relative_z_km ?? "na",
                ].join(",")}
              </div>
            ))
            : null}
        </>
      );
    }

    return MockFlightScene;
  },
}));

describe("Home scanner to flight scene wiring", () => {
  let shipTelemetryPayload: Record<string, unknown>;
  let scannerContactsPayload: Array<Record<string, unknown>>;
  let scannerContactsGenerationVersion: number;
  let localChartPayload: Record<string, unknown>;
  let localChartStatusCode: number;
  let localChartErrorMessage: string;
  let dockRequestBodies: string[];
  let undockRequestCount: number;
  let scannerSelectionBodies: string[];
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem("elite_token", "test-token");
    window.localStorage.setItem("elite_user_id", "1");
    (globalThis as unknown as { __scannerTelemetryOverrides?: Record<string, unknown> }).__scannerTelemetryOverrides = {};
    (globalThis as unknown as { __disableDockingApproachAutoComplete?: boolean }).__disableDockingApproachAutoComplete = false;

    shipTelemetryPayload = {
      id: 1,
      name: "Starter",
      ship_visual_key: "cobra-mk1",
      docking_computer_tier: "standard",
      docking_computer_range_km: 40,
      docked_station_archetype_name: null,
      docked_station_archetype_shape: null,
      hull_current: 100,
      shields_current: 100,
      energy_current: 100,
      fuel_current: 100,
      fuel_cap: 100,
      cargo_capacity: 40,
      status: "in-space",
      docked_station_id: null,
      flight_phase: "idle",
      flight_locked_destination_station_id: null,
      flight_phase_started_at: null,
      jump_cooldown_seconds: 0,
      jump_cooldown_until: null,
    };

    scannerContactsPayload = [
      {
        id: "station-101",
        contact_type: "station",
        name: "Vega Tradeport",
        distance_km: 13,
        bearing_x: 0.1,
        bearing_y: 0.2,
        orbiting_planet_name: "Vega Prime I",
        station_archetype_shape: "coriolis",
        scene_x: 10,
        scene_y: 0,
        scene_z: -20,
      },
      {
        id: "planet-201",
        contact_type: "planet",
        name: "Vega Prime I",
        distance_km: 560,
        bearing_x: -0.2,
        bearing_y: -0.1,
        orbiting_planet_name: null,
        scene_x: -14,
        scene_y: 0,
        scene_z: -48,
      },
      {
        id: "ship-99",
        contact_type: "ship",
        name: "Traffic Ghost",
        distance_km: 88,
        bearing_x: 0.14,
        bearing_y: -0.08,
        ship_visual_key: "cobra-mk1",
        orbiting_planet_name: null,
        scene_x: 15,
        scene_y: 0,
        scene_z: -32,
      },
    ];

    localChartPayload = {
      system: {
        id: 1,
        name: "Vega",
        generation_version: 1,
        seed_hash: "abcd1234ef56",
      },
      star: {
        id: 301,
        body_kind: "star",
        body_type: "g-class",
        name: "Vega Primary",
        generation_version: 1,
        parent_body_id: null,
        orbit_index: 0,
        orbit_radius_km: 0,
        radius_km: 640000,
        position_x: 0,
        position_y: 0,
        position_z: 0,
      },
      planets: [
        {
          id: 201,
          body_kind: "planet",
          body_type: "rocky",
          name: "Vega Prime I",
          generation_version: 1,
          parent_body_id: 301,
          orbit_index: 1,
          orbit_radius_km: 77000,
          radius_km: 6800,
          position_x: 77000,
          position_y: 0,
          position_z: -1800,
        },
      ],
      moons_by_parent_body_id: {},
      stations: [
        {
          id: 101,
          name: "Vega Tradeport",
          host_body_id: 201,
          orbit_radius_km: 26000,
          orbit_phase_deg: 17,
          position_x: 77120,
          position_y: 0,
          position_z: -1780,
        },
      ],
      mutable_state: {
        economy_tick_cursor: 0,
        politics_tick_cursor: 0,
        last_economy_tick_at: null,
        last_politics_tick_at: null,
        security_level: "medium",
        stability_score: 50,
      },
    };
    localChartStatusCode = 200;
    localChartErrorMessage = "Local chart unavailable.";

    dockRequestBodies = [];
    undockRequestCount = 0;
    scannerSelectionBodies = [];
    scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as WebGLRenderingContext,
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/api/ships/1/dock")) {
          const bodyText = typeof init?.body === "string" ? init.body : "{}";
          dockRequestBodies.push(bodyText);
          const parsedBody = JSON.parse(bodyText) as { station_id?: number };
          shipTelemetryPayload = {
            ...shipTelemetryPayload,
            status: "docked",
            docked_station_id: parsedBody.station_id ?? 1,
          };
          return new Response(JSON.stringify(shipTelemetryPayload), { status: 200 });
        }

        if (url.endsWith("/api/ships/1/undock")) {
          undockRequestCount += 1;
          shipTelemetryPayload = {
            ...shipTelemetryPayload,
            status: "in-space",
            docked_station_id: null,
          };
          return new Response(JSON.stringify(shipTelemetryPayload), { status: 200 });
        }

        if (url.includes("/api/stations/1/inventory")) {
          return new Response(
            JSON.stringify([
              {
                name: "Food",
                commodity_id: 1,
                quantity: 40,
                buy_price: 9,
                sell_price: 11,
              },
            ]),
            { status: 200 },
          );
        }

        if (url.endsWith("/api/stations")) {
          return new Response(
            JSON.stringify([
              { id: 1, name: "Vega Tradeport", system_id: 1 },
              { id: 2, name: "Lave Hub", system_id: 2 },
            ]),
            { status: 200 },
          );
        }

        if (url.endsWith("/api/story/sessions")) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                location_type: "station",
                location_id: 1,
                status: "active",
              },
            ]),
            { status: 200 },
          );
        }

        if (url.endsWith("/api/players/me")) {
          return new Response(
            JSON.stringify({
              id: 1,
              email: "pilot@example.com",
              username: "pilot",
              role: "user",
              credits: 1000,
              is_alive: true,
              location_type: "station",
              location_id: 1,
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/ships/1/cargo")) {
          return new Response(
            JSON.stringify({
              ship_id: 1,
              cargo_capacity: 40,
              cargo_used: 1,
              cargo_free: 39,
              items: [
                {
                  commodity_id: 1,
                  commodity_name: "Food",
                  quantity: 1,
                },
              ],
            }),
            { status: 200 },
          );
        }

        if (url.match(/\/api\/ships\/1$/)) {
          return new Response(JSON.stringify(shipTelemetryPayload), { status: 200 });
        }

        if (url.includes("/api/ships/1/local-contacts")) {
          return new Response(
            JSON.stringify({
              ship_id: 1,
              system_id: 1,
              system_name: "Vega",
              generation_version: 1,
              contacts: scannerContactsPayload,
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/systems/galaxy/systems?") && url.includes("ship_id=1")) {
          const localReachableMode = url.includes("view_mode=local_reachable");
          return new Response(
            JSON.stringify({
              current_system_id: 1,
              view_mode: localReachableMode ? "local_reachable" : "galaxy",
              systems: localReachableMode
                ? [
                  {
                    system_id: 1,
                    name: "Vega",
                    x: 0,
                    y: 0,
                    z: 0,
                    economy: "industrial",
                    government: "corporate",
                    tech_level: 8,
                    population: 1200000,
                    reachable_from_current: true,
                    estimated_jump_fuel: 0,
                    reachability_reason: "already in-system",
                  },
                ]
                : [
                  {
                    system_id: 1,
                    name: "Vega",
                    x: 0,
                    y: 0,
                    z: 0,
                    economy: "industrial",
                    government: "corporate",
                    tech_level: 8,
                    population: 1200000,
                    reachable_from_current: true,
                    estimated_jump_fuel: 0,
                    reachability_reason: "already in-system",
                  },
                  {
                    system_id: 2,
                    name: "Lave",
                    x: 6,
                    y: 0,
                    z: 4,
                    economy: "agricultural",
                    government: "democracy",
                    tech_level: 5,
                    population: 850000,
                    reachable_from_current: false,
                    estimated_jump_fuel: 4.2,
                    reachability_reason: "range-limit",
                  },
                ],
            }),
            { status: 200 },
          );
        }

        if (url.match(/\/api\/systems\/galaxy\/systems\/\d+\/overview\?ship_id=1/)) {
          return new Response(
            JSON.stringify({
              system: {
                id: 1,
                name: "Vega",
                economy: "industrial",
                government: "corporate",
                tech_level: 8,
                population: 1200000,
              },
              jump: {
                reachable: true,
                estimated_jump_fuel: 0,
                reason: "already in-system",
              },
              overview: {
                planets_total: 1,
                moons_total: 0,
                stations_total: 1,
                planets: [{
                  name: "Vega Prime I",
                  body_type: "rocky",
                  orbit_index: 1,
                }],
                stations: [{
                  name: "Vega Tradeport",
                  archetype: "coriolis",
                  host_body_name: "Vega Prime I",
                }],
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/systems/1/local-chart")) {
          if (localChartStatusCode !== 200) {
            return new Response(
              JSON.stringify({ detail: localChartErrorMessage }),
              { status: localChartStatusCode },
            );
          }

          return new Response(
            JSON.stringify(localChartPayload),
            { status: 200 },
          );
        }

        if (url.endsWith("/api/ships/1/collision-check")) {
          return new Response(
            JSON.stringify({
              ship: shipTelemetryPayload,
              collision: false,
              severity: "none",
              object_type: "station",
              object_id: "station-1",
              object_name: "Vega Tradeport",
              distance_km: 13,
              shields_damage: 0,
              hull_damage: 0,
              recovered: false,
              message: "No impact detected near Vega Tradeport (13.0km)",
            }),
            { status: 200 },
          );
        }

        if (url.endsWith("/api/ships/1/scanner-selection")) {
          const bodyText = typeof init?.body === "string" ? init.body : "{}";
          scannerSelectionBodies.push(bodyText);
          return new Response(JSON.stringify({ logged: true }), { status: 200 });
        }

        if (url.includes("/api/ships/1/operations")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }

        if (url.includes("/api/markets/1/summary")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }

        if (url.includes("/api/comms/channels")) {
          return new Response(
            JSON.stringify([
              {
                id: "local-station",
                name: "Station Local",
                scope: "local",
                delay_label: "Instant",
                unread: 0,
              },
            ]),
            { status: 200 },
          );
        }

        return new Response(JSON.stringify({ detail: "not mocked" }), {
          status: 404,
        });
      },
    );
  });

  it("propagates selected scanner contact to FlightScene focusedContact", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByTestId("flight-scene-focused-contact").textContent,
      ).toBe("Vega Tradeport");
    });

    expect(screen.getByText("Dock Target Range")).toBeInTheDocument();
    expect(screen.getByText(/Vega Tradeport · 13\.0 km SURFACE \/ 40\.0 km · IN RANGE/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("scanner-contact-row-planet-201"));

    await waitFor(() => {
      expect(
        screen.getByTestId("flight-scene-focused-contact").textContent,
      ).toBe("Vega Prime I");
    });

    expect(screen.getByText("Dock Target Range")).toBeInTheDocument();
  });

  it("labels docking approach range using PORT mode for the active approach target", async () => {
    (globalThis as unknown as {
      __scannerTelemetryOverrides?: Record<string, Partial<{
        distance: number;
        distance_mode: "surface" | "port";
      }>>;
    }).__scannerTelemetryOverrides = {
      "station-101": {
        distance: 3.4,
        distance_mode: "port",
      },
    };
    (globalThis as unknown as { __disableDockingApproachAutoComplete?: boolean }).__disableDockingApproachAutoComplete = true;

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByTestId("flight-scene-focused-contact").textContent,
      ).toBe("Vega Tradeport");
    });

    fireEvent.click(screen.getByRole("button", { name: /^Dock$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Cancel Docking$/i })).toBeInTheDocument();
      expect(
        screen.getByText(/Vega Tradeport · 3\.4 km PORT \/ 40\.0 km · IN RANGE/),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Docking computer active: autopilot approach is guiding to docking port\./)).toBeInTheDocument();
    expect(dockRequestBodies.length).toBe(0);
  });

  it("applies scanner grid range cap and allows expanding range via preset selector", async () => {
    scannerContactsPayload = [
      {
        id: "station-101",
        contact_type: "station",
        name: "Vega Tradeport",
        distance_km: 13,
        bearing_x: 0.1,
        bearing_y: 0.2,
        orbiting_planet_name: "Vega Prime I",
        station_archetype_shape: "coriolis",
        scene_x: 10,
        scene_y: 0,
        scene_z: -20,
      },
      {
        id: "ship-99",
        contact_type: "ship",
        name: "Traffic Ghost",
        distance_km: 180,
        bearing_x: 0.14,
        bearing_y: -0.08,
        ship_visual_key: "cobra-mk1",
        orbiting_planet_name: null,
        scene_x: 15,
        scene_y: 0,
        scene_z: -32,
      },
    ];

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      expect(screen.getByLabelText("Scanner range")).toHaveValue("100");
    });

    expect(screen.getByText(/Scanner · 2 contacts · 1 outside range/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^ship Traffic Ghost$/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Scanner range"), {
      target: { value: "250" },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Scanner range")).toHaveValue("250");
      expect(screen.getByRole("button", { name: /^ship Traffic Ghost$/i })).toBeInTheDocument();
    });
  });

  it("shows local chart phase and audio hints in flight status", async () => {
    localChartPayload = {
      ...localChartPayload,
      system: {
        ...(localChartPayload.system as Record<string, unknown>),
        contract_version: "local-chart.v1",
      },
      mutable_state: {
        ...(localChartPayload.mutable_state as Record<string, unknown>),
        flight_phase: "docking-approach",
        local_target_contact_id: "station-101",
        local_target_status: "in-system-locked",
        transition_started_at: "2026-02-20T10:10:10Z",
        audio_event_hints: ["chart.waypoint_lock", "ops.docking_request_accept"],
      },
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      const statusLine = screen.getByTestId("flight-local-chart-state");
      expect(statusLine.textContent).toContain("Chart docking-approach");
      expect(statusLine.textContent).toContain("target in-system-locked (Vega Tradeport)");
      expect(statusLine.textContent).toContain(
        "hints chart.waypoint_lock, ops.docking_request_accept",
      );
    });
  });

  it("formats large scanner distances with compact K/M suffixes", async () => {
    scannerContactsPayload = [
      {
        id: "station-101",
        contact_type: "station",
        name: "Vega Tradeport",
        distance_km: 1400,
        bearing_x: 0.1,
        bearing_y: 0.2,
        scene_x: 11,
        scene_y: 3,
        scene_z: 4,
        station_archetype_shape: "coriolis",
        orbiting_planet_name: "Vega Prime I",
      },
      {
        id: "planet-201",
        contact_type: "planet",
        name: "Vega Prime I",
        distance_km: 1600000,
        bearing_x: 0.2,
        bearing_y: -0.1,
        scene_x: 120,
        scene_y: 0,
        scene_z: -40,
        body_kind: "planet",
        body_type: "rocky",
        radius_km: 6800,
      },
    ];

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Vega Tradeport · 1\.40K km SURFACE \/ 40\.0 km · OUT OF RANGE/)).toBeInTheDocument();
    });

    const planetRow = screen.getByTestId("scanner-contact-row-planet-201");
    expect(planetRow.textContent).toContain("1.60M km");
  });

  it("keeps scanner contact row distance pinned to snapshot telemetry", async () => {
    scannerContactsPayload = [
      {
        id: "station-101",
        contact_type: "station",
        name: "Vega Tradeport",
        distance_km: 42,
        bearing_x: 0.1,
        bearing_y: 0.2,
        scene_x: 10,
        scene_y: 0,
        scene_z: -20,
        station_archetype_shape: "coriolis",
        orbiting_planet_name: "Vega Prime I",
      },
    ];

    (globalThis as unknown as {
      __scannerTelemetryOverrides?: Record<string, Partial<{ distance: number }>>;
    }).__scannerTelemetryOverrides = {
      "station-101": {
        distance: 27,
      },
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButton = (await screen.findAllByRole("button", {
      name: /^Flight$/,
    }))[0];
    fireEvent.click(flightModeButton);

    await waitFor(() => {
      const stationRow = screen.getByTestId("scanner-contact-row-station-101");
      expect(stationRow.textContent).toContain("42.0 km");
    });

    (globalThis as unknown as {
      __scannerTelemetryOverrides?: Record<string, Partial<{ distance: number }>>;
    }).__scannerTelemetryOverrides = {
      "station-101": {
        distance: 5,
      },
    };

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);
    fireEvent.click(flightModeButton);

    await waitFor(() => {
      const stationRow = screen.getByTestId("scanner-contact-row-station-101");
      expect(stationRow.textContent).toContain("42.0 km");
    });
  });

  it("normalizes unknown local chart flight phase to idle", async () => {
    localChartPayload = {
      ...localChartPayload,
      mutable_state: {
        ...(localChartPayload.mutable_state as Record<string, unknown>),
        flight_phase: "quantum-drift",
        local_target_contact_id: "station-101",
        local_target_status: "in-system-locked",
      },
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      const statusLine = screen.getByTestId("flight-local-chart-state");
      expect(statusLine.textContent).toContain("Chart idle");
      expect(statusLine.textContent).toContain("target in-system-locked (Vega Tradeport)");
    });
  });

  it("normalizes unknown local target status to none", async () => {
    localChartPayload = {
      ...localChartPayload,
      mutable_state: {
        ...(localChartPayload.mutable_state as Record<string, unknown>),
        flight_phase: "docking-approach",
        local_target_contact_id: "station-101",
        local_target_status: "drift-lock",
      },
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      const statusLine = screen.getByTestId("flight-local-chart-state");
      expect(statusLine.textContent).toContain("Chart docking-approach");
      expect(statusLine.textContent).toContain("target none (Vega Tradeport)");
    });

    expect(screen.getByTestId("scanner-chart-state").textContent).toContain(
      "docking-approach · none (Vega Tradeport)",
    );
  });

  it("shows chart state and target badge in scanner panel", async () => {
    localChartPayload = {
      ...localChartPayload,
      mutable_state: {
        ...(localChartPayload.mutable_state as Record<string, unknown>),
        flight_phase: "docking-approach",
        local_target_contact_id: "station-101",
        local_target_status: "in-system-locked",
        audio_event_hints: ["chart.waypoint_lock", "ops.docking_request_accept"],
      },
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("scanner-chart-state").textContent).toContain(
        "docking-approach · in-system-locked (Vega Tradeport)",
      );
    });

    expect(
      screen.getByTestId("scanner-contact-target-badge-station-101").textContent,
    ).toContain("TARGET");
    expect(screen.getByTestId("scanner-chart-audio-hints").textContent).toContain(
      "Chart hints: chart.waypoint_lock, ops.docking_request_accept",
    );
  });

  it("shows target marker in system local chart rows and plot", async () => {
    localChartPayload = {
      ...localChartPayload,
      mutable_state: {
        ...(localChartPayload.mutable_state as Record<string, unknown>),
        local_target_contact_id: "station-101",
        local_target_status: "in-system-locked",
      },
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButtons = await screen.findAllByRole("button", {
      name: /^System$/,
    });
    fireEvent.click(systemModeButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("local-chart-row-station-101")).toBeInTheDocument();
    });

    expect(screen.getByTestId("local-chart-target-badge-station-101").textContent).toContain(
      "TARGET",
    );
    expect(screen.getByTestId("system-chart-target-halo-station-101")).toBeInTheDocument();
    expect(screen.getByTestId("system-chart-orbit-ring-orbit-planet-201")).toBeInTheDocument();
  });

  it("sorts system local chart rows by distance, type, radius, and name from header clicks", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButtons = await screen.findAllByRole("button", {
      name: /^System$/,
    });
    fireEvent.click(systemModeButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("local-chart-row-station-101")).toBeInTheDocument();
    });

    const defaultRows = screen.getAllByTestId(/local-chart-row-/i);
    expect(defaultRows[0].getAttribute("data-testid")).toBe("local-chart-row-station-101");
    expect(screen.getByTestId("local-chart-sort-distance")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByTestId("local-chart-sort-type"));
    await waitFor(() => {
      const rowsByType = screen.getAllByTestId(/local-chart-row-/i);
      expect(rowsByType[0].getAttribute("data-testid")).toBe("local-chart-row-planet-201");
      expect(rowsByType[1].getAttribute("data-testid")).toBe("local-chart-row-ship-99");
    });
    expect(screen.getByTestId("local-chart-sort-type")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByTestId("local-chart-sort-radius"));
    await waitFor(() => {
      const rowsByRadius = screen.getAllByTestId(/local-chart-row-/i);
      expect(rowsByRadius[0].getAttribute("data-testid")).toBe("local-chart-row-planet-201");
      expect(rowsByRadius[1].getAttribute("data-testid")).toBe("local-chart-row-star-301");
    });

    fireEvent.click(screen.getByTestId("local-chart-sort-distance"));
    await waitFor(() => {
      const rowsByDistance = screen.getAllByTestId(/local-chart-row-/i);
      expect(rowsByDistance[0].getAttribute("data-testid")).toBe("local-chart-row-station-101");
    });

    fireEvent.click(screen.getByTestId("local-chart-sort-name"));
    await waitFor(() => {
      const rowsByName = screen.getAllByTestId(/local-chart-row-/i);
      expect(rowsByName[0].getAttribute("data-testid")).toBe("local-chart-row-ship-99");
    });
    expect(screen.getByTestId("local-chart-sort-name")).toHaveAttribute("aria-pressed", "true");
  });

  it("persists local chart sort selection across reload", async () => {
    const firstRender = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButtons = await screen.findAllByRole("button", {
      name: /^System$/,
    });
    fireEvent.click(systemModeButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("local-chart-row-station-101")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("local-chart-sort-type"));
    await waitFor(() => {
      const rowsByType = screen.getAllByTestId(/local-chart-row-/i);
      expect(rowsByType[0].getAttribute("data-testid")).toBe("local-chart-row-planet-201");
    });

    firstRender.unmount();

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButtonsReloaded = await screen.findAllByRole("button", {
      name: /^System$/,
    });
    fireEvent.click(systemModeButtonsReloaded[0]);

    await waitFor(() => {
      const rowsByTypeReloaded = screen.getAllByTestId(/local-chart-row-/i);
      expect(rowsByTypeReloaded[0].getAttribute("data-testid")).toBe("local-chart-row-planet-201");
    });
  });

  it("pins selected overflow contact to top of scanner list and logs selection", async () => {
    scannerContactsPayload = Array.from({ length: 10 }, (_, index) => ({
      id: `station-${200 + index}`,
      contact_type: "station",
      name: `Station ${index + 1}`,
      distance_km: 25 + index,
      bearing_x: 0.1,
      bearing_y: 0.1,
      orbiting_planet_name: "Vega Prime I",
      station_archetype_shape: "coriolis",
      scene_x: 10 + index,
      scene_y: 0,
      scene_z: -18 - index,
    }));

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    const targetContactButton = await screen.findByRole("button", {
      name: /^station Station 10$/i,
    });
    fireEvent.click(targetContactButton);

    await waitFor(() => {
      const contactRows = screen.getAllByTestId(/scanner-contact-row-/i);
      expect(contactRows[0].getAttribute("data-testid")).toBe(
        "scanner-contact-row-station-209",
      );
    });

    await waitFor(() => {
      expect(scannerSelectionBodies.length).toBeGreaterThan(0);
    });

    const lastPayload = JSON.parse(
      scannerSelectionBodies[scannerSelectionBodies.length - 1],
    ) as {
      selected_contact_id: string;
      visible_contact_ids: string[];
    };
    expect(lastPayload.selected_contact_id).toBe("station-209");
    expect(lastPayload.visible_contact_ids[0]).toBe("station-209");
    expect(lastPayload.visible_contact_ids).toHaveLength(8);
  });

  it("toggles contact labels in flight settings", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await screen.findByTestId("flight-scene-focused-contact");
    expect(screen.getByTestId("flight-scene-show-contact-labels").textContent).toBe("off");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const labelsToggle = await screen.findByTestId("flight-setting-contact-labels");
    fireEvent.click(labelsToggle);

    expect(screen.getByTestId("flight-scene-show-contact-labels").textContent).toBe("on");
  });

  it("persists flight camera mode selection", async () => {
    const firstRender = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    expect(screen.getByTestId("flight-scene-camera-mode").textContent).toBe("boresight");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const cameraModeSelect = await screen.findByTestId("flight-setting-camera-mode");
    fireEvent.change(cameraModeSelect, { target: { value: "cockpit" } });

    expect(window.localStorage.getItem("elite_flight_camera_mode")).toBe("cockpit");
    expect(screen.getByTestId("flight-scene-camera-mode").textContent).toBe("cockpit");

    firstRender.unmount();

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtonsReloaded = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtonsReloaded[0]);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect((await screen.findByTestId("flight-setting-camera-mode") as HTMLSelectElement).value)
      .toBe("cockpit");
    expect(screen.getByTestId("flight-scene-camera-mode").textContent).toBe("cockpit");
  });

  it("persists flight audio settings toggles", async () => {
    const firstRender = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const audioEnabledToggle = await screen.findByTestId("flight-setting-audio-enabled");
    const reducedAudioToggle = await screen.findByTestId("flight-setting-reduced-audio");

    fireEvent.click(audioEnabledToggle);
    expect(window.localStorage.getItem("elite_flight_audio_enabled")).toBe("false");
    expect((reducedAudioToggle as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(audioEnabledToggle);
    fireEvent.click(reducedAudioToggle);

    expect(window.localStorage.getItem("elite_flight_audio_enabled")).toBe("true");
    expect(window.localStorage.getItem("elite_flight_reduced_audio")).toBe("true");

    firstRender.unmount();

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtonsReloaded = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtonsReloaded[0]);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect((await screen.findByTestId("flight-setting-audio-enabled") as HTMLInputElement).checked).toBe(true);
    expect((await screen.findByTestId("flight-setting-reduced-audio") as HTMLInputElement).checked).toBe(true);
  });

  it("syncs local chart row selection into scanner and flight focus", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const chartPlanetRow = await screen.findByTestId("local-chart-row-planet-201");
    fireEvent.click(chartPlanetRow);

    const flightModeButton = (await screen.findAllByRole("button", {
      name: /^Flight$/,
    }))[0];
    fireEvent.click(flightModeButton);

    await waitFor(() => {
      expect(
        screen.getByTestId("flight-scene-focused-contact").textContent,
      ).toBe("Vega Prime I");
    });
  });

  it("separates local System mode from Galaxy navigation mode", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const navigationModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(navigationModeButton);

    const galaxyModeButton = await screen.findByRole("button", {
      name: /^Galaxy$/,
    });
    fireEvent.click(galaxyModeButton);

    expect(await screen.findByText("2D Star Map")).toBeInTheDocument();
    expect(screen.getByText("1 systems are reachable.")).toBeInTheDocument();
    expect(screen.queryByText("Local Chart")).not.toBeInTheDocument();

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    expect(await screen.findByTestId("system-chart-canvas")).toBeInTheDocument();
    expect(screen.queryByText("2D Star Map")).not.toBeInTheDocument();
  });

  it("renders 2D galaxy star map and switches between reachable and whole galaxy", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const navigationModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(navigationModeButton);

    const galaxyModeButton = await screen.findByRole("button", {
      name: /^Galaxy$/,
    });
    fireEvent.click(galaxyModeButton);

    expect(await screen.findByTestId("galaxy-chart-map")).toBeInTheDocument();
    expect(screen.getByText("1 systems are reachable.")).toBeInTheDocument();
    expect(screen.getByTestId("galaxy-map-point-1")).toBeInTheDocument();
    expect(screen.queryByTestId("galaxy-map-point-2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Whole Galaxy$/i }));

    await waitFor(() => {
      expect(screen.getByText("2 systems in view.")).toBeInTheDocument();
      expect(screen.getByTestId("galaxy-map-point-2")).toBeInTheDocument();
    });
  });

  it("persists selected scanner contact across reload and falls back when missing", async () => {
    const observabilityEvents: Array<Record<string, unknown>> = [];
    const onObservability = (event: Event): void => {
      const customEvent = event as CustomEvent<Record<string, unknown>>;
      if (customEvent.detail && typeof customEvent.detail === "object") {
        observabilityEvents.push(customEvent.detail);
      }
    };
    window.addEventListener("elite:system-chart-observability", onObservability as EventListener);

    const firstRender = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButton = (await screen.findAllByRole("button", {
      name: /^Flight$/,
    }))[0];
    fireEvent.click(flightModeButton);

    fireEvent.click(await screen.findByTestId("scanner-contact-row-planet-201"));

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-focused-contact").textContent).toBe("Vega Prime I");
    });

    firstRender.unmount();

    const persistedReload = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtonReloaded = (await screen.findAllByRole("button", {
      name: /^Flight$/,
    }))[0];
    fireEvent.click(flightModeButtonReloaded);

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-focused-contact").textContent).toBe("Vega Prime I");
    });

    persistedReload.unmount();

    scannerContactsPayload = [
      {
        id: "station-101",
        contact_type: "station",
        name: "Vega Tradeport",
        distance_km: 12,
        bearing_x: 0.08,
        bearing_y: 0.15,
        orbiting_planet_name: "Vega Prime I",
        station_archetype_shape: "coriolis",
        scene_x: 10,
        scene_y: 0,
        scene_z: -20,
      },
      {
        id: "ship-99",
        contact_type: "ship",
        name: "Traffic Ghost",
        distance_km: 96,
        bearing_x: 0.18,
        bearing_y: -0.02,
        ship_visual_key: "cobra-mk1",
        orbiting_planet_name: null,
        scene_x: 15,
        scene_y: 0,
        scene_z: -32,
      },
    ];

    const fallbackReload = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtonFallback = (await screen.findAllByRole("button", {
      name: /^Flight$/,
    }))[0];
    fireEvent.click(flightModeButtonFallback);

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-focused-contact").textContent).toBe("Vega Tradeport");
    });

    await waitFor(() => {
      const refreshFallbackEvent = observabilityEvents.find(
        (entry) => entry.event === "selection-sync"
          && entry.source === "scanner-refresh"
          && entry.success === true
          && entry.contactId === "station-101",
      );
      expect(refreshFallbackEvent).toBeTruthy();
    });

    fallbackReload.unmount();
    window.removeEventListener("elite:system-chart-observability", onObservability as EventListener);
  });

  it("emits scanner-refresh failure observability when saved selection has no contacts", async () => {
    const observabilityEvents: Array<Record<string, unknown>> = [];
    const onObservability = (event: Event): void => {
      const customEvent = event as CustomEvent<Record<string, unknown>>;
      if (customEvent.detail && typeof customEvent.detail === "object") {
        observabilityEvents.push(customEvent.detail);
      }
    };

    scannerContactsPayload = [];
    window.localStorage.setItem("elite_scanner_selected_contact", "planet-201");
    window.addEventListener("elite:system-chart-observability", onObservability as EventListener);

    const rendered = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    await waitFor(() => {
      const refreshFailureEvent = observabilityEvents.find(
        (entry) => entry.event === "selection-sync"
          && entry.source === "scanner-refresh"
          && entry.success === false
          && entry.contactId === "planet-201"
          && entry.reason === "no-contacts",
      );
      expect(refreshFailureEvent).toBeTruthy();
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("elite_scanner_selected_contact")).toBeNull();
    });

    rendered.unmount();
    window.removeEventListener("elite:system-chart-observability", onObservability as EventListener);
  });

  it("maps backend body type and radius into local chart visual labels", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const starRow = await screen.findByTestId("local-chart-row-star-301");
    expect(starRow.textContent).toContain("g-class · r640,000km");

    const planetRow = await screen.findByTestId("local-chart-row-planet-201");
    expect(planetRow.textContent).toContain("rocky · r6,800km");
  });

  it("renders moon rows with moon visual labels in local chart", async () => {
    localChartPayload = {
      ...localChartPayload,
      moons_by_parent_body_id: {
        "201": [
          {
            id: 401,
            body_kind: "moon",
            body_type: "ice",
            name: "Vega Prime I-a",
            generation_version: 1,
            parent_body_id: 201,
            orbit_index: 1,
            orbit_radius_km: 3500,
            radius_km: 1900,
            position_x: 80500,
            position_y: 0,
            position_z: -1700,
          },
        ],
      },
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const moonRow = await screen.findByTestId("local-chart-row-moon-401");
    expect(moonRow.textContent).toContain("moon ice · r1,900km");
    expect(screen.getByTestId("system-chart-point-moon-401")).toBeInTheDocument();

    fireEvent.click(moonRow);
    await waitFor(() => {
      expect(screen.getByTestId("system-selected-contact").textContent).toContain(
        "Vega Prime I-a",
      );
    });
    expect(screen.getByTestId("system-row-token-moon-401").textContent).toContain("●");
    expect(screen.getByTestId("system-selected-token").textContent).toContain("●");
    expect(screen.getByTestId("system-footer-waypoint")).not.toBeDisabled();
  });

  it("passes moon celestial anchors into flight scene", async () => {
    localChartPayload = {
      ...localChartPayload,
      moons_by_parent_body_id: {
        "201": [
          {
            id: 401,
            body_kind: "moon",
            body_type: "ice",
            name: "Vega Prime I-a",
            generation_version: 1,
            parent_body_id: 201,
            orbit_index: 1,
            orbit_radius_km: 3500,
            radius_km: 1900,
            position_x: 80500,
            position_y: 0,
            position_z: -1700,
          },
        ],
      },
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-moon-anchor-count").textContent).toBe("1");
    });
  });

  it("renders sparse star-only local chart without planet or station rows", async () => {
    const observabilityEvents: Array<Record<string, unknown>> = [];
    const onObservability = (event: Event): void => {
      const customEvent = event as CustomEvent<Record<string, unknown>>;
      if (customEvent.detail && typeof customEvent.detail === "object") {
        observabilityEvents.push(customEvent.detail);
      }
    };

    scannerContactsPayload = [
      {
        id: "star-301",
        contact_type: "star",
        name: "Vega Primary",
        distance_km: 0,
        bearing_x: 0,
        bearing_y: 0,
        orbiting_planet_name: null,
        scene_x: 0,
        scene_y: 0,
        scene_z: 0,
      },
    ];

    localChartPayload = {
      system: {
        id: 1,
        name: "Sparse Core",
        generation_version: 1,
        seed_hash: "sparse123456",
      },
      star: {
        id: 301,
        body_kind: "star",
        body_type: "g-class",
        name: "Sparse Core Primary",
        generation_version: 1,
        parent_body_id: null,
        orbit_index: 0,
        orbit_radius_km: 0,
        radius_km: 610000,
        position_x: 1200,
        position_y: 0,
        position_z: -800,
      },
      planets: [],
      moons_by_parent_body_id: {},
      stations: [],
      mutable_state: {
        economy_tick_cursor: 2,
        politics_tick_cursor: 3,
        last_economy_tick_at: null,
        last_politics_tick_at: null,
        security_level: "medium",
        stability_score: 50,
      },
    };

    window.addEventListener("elite:system-chart-observability", onObservability as EventListener);

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const starRow = await screen.findByTestId("local-chart-row-star-301");
    expect(starRow).toBeInTheDocument();
    expect(starRow.textContent).toContain("g-class · r610,000km");

    expect(screen.queryByTestId("local-chart-row-planet-201")).not.toBeInTheDocument();
    expect(screen.queryByTestId("local-chart-row-station-101")).not.toBeInTheDocument();

    await waitFor(() => {
      const chartSyncEvent = observabilityEvents.find(
        (entry) => entry.event === "chart-sync"
          && entry.success === true
          && entry.systemId === 1
          && entry.rowCount === 1,
      );
      expect(chartSyncEvent).toBeTruthy();
    });

    window.removeEventListener("elite:system-chart-observability", onObservability as EventListener);
  });

  it("caps ship rows by nearest-first policy in local chart", async () => {
    scannerContactsPayload = [
      {
        id: "station-101",
        contact_type: "station",
        name: "Vega Tradeport",
        distance_km: 13,
        bearing_x: 0.1,
        bearing_y: 0.2,
        orbiting_planet_name: "Vega Prime I",
        station_archetype_shape: "coriolis",
        scene_x: 10,
        scene_y: 0,
        scene_z: -20,
      },
      {
        id: "planet-201",
        contact_type: "planet",
        name: "Vega Prime I",
        distance_km: 560,
        bearing_x: -0.2,
        bearing_y: -0.1,
        orbiting_planet_name: null,
        scene_x: -14,
        scene_y: 0,
        scene_z: -48,
      },
      {
        id: "ship-201",
        contact_type: "ship",
        name: "Near Runner",
        distance_km: 20,
        bearing_x: 0.02,
        bearing_y: -0.01,
        ship_visual_key: "cobra-mk1",
        orbiting_planet_name: null,
        scene_x: 11,
        scene_y: 0,
        scene_z: -15,
      },
      {
        id: "ship-202",
        contact_type: "ship",
        name: "Relay Frigate",
        distance_km: 40,
        bearing_x: 0.05,
        bearing_y: 0,
        ship_visual_key: "cobra-mk1",
        orbiting_planet_name: null,
        scene_x: 12,
        scene_y: 0,
        scene_z: -22,
      },
      {
        id: "ship-203",
        contact_type: "ship",
        name: "Courier Trace",
        distance_km: 60,
        bearing_x: -0.04,
        bearing_y: 0.01,
        ship_visual_key: "cobra-mk1",
        orbiting_planet_name: null,
        scene_x: 13,
        scene_y: 0,
        scene_z: -28,
      },
      {
        id: "ship-204",
        contact_type: "ship",
        name: "Deep Freighter",
        distance_km: 120,
        bearing_x: -0.06,
        bearing_y: 0.03,
        ship_visual_key: "cobra-mk1",
        orbiting_planet_name: null,
        scene_x: 14,
        scene_y: 0,
        scene_z: -35,
      },
      {
        id: "ship-205",
        contact_type: "ship",
        name: "Far Hauler",
        distance_km: 300,
        bearing_x: -0.1,
        bearing_y: 0.04,
        ship_visual_key: "cobra-mk1",
        orbiting_planet_name: null,
        scene_x: 15,
        scene_y: 0,
        scene_z: -42,
      },
    ];

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    await screen.findByTestId("local-chart-row-ship-201");
    await screen.findByTestId("local-chart-row-ship-202");
    await screen.findByTestId("local-chart-row-ship-203");

    expect(screen.queryByTestId("local-chart-row-ship-204")).not.toBeInTheDocument();
    expect(screen.queryByTestId("local-chart-row-ship-205")).not.toBeInTheDocument();
  });

  it("emits chart-sync failure telemetry with rowCount zero", async () => {
    const observabilityEvents: Array<Record<string, unknown>> = [];
    const onObservability = (event: Event): void => {
      const customEvent = event as CustomEvent<Record<string, unknown>>;
      if (customEvent.detail && typeof customEvent.detail === "object") {
        observabilityEvents.push(customEvent.detail);
      }
    };

    localChartStatusCode = 503;
    localChartErrorMessage = "Chart service degraded.";
    window.addEventListener("elite:system-chart-observability", onObservability as EventListener);

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    await waitFor(() => {
      const chartSyncFailureEvent = observabilityEvents.find(
        (entry) => entry.event === "chart-sync"
          && entry.success === false
          && entry.systemId === 1
          && entry.reason === "Chart service degraded."
          && entry.rowCount === 0,
      );
      expect(chartSyncFailureEvent).toBeTruthy();
    });

    window.removeEventListener("elite:system-chart-observability", onObservability as EventListener);
  });

  it("shows chart-sync telemetry in system observability panel", async () => {
    window.localStorage.setItem("elite_dev_tools_open", "1");

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const observabilityPanel = await screen.findByTestId("system-observability-panel");
    expect(observabilityPanel).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("system-observability-chart-opens").textContent).toBe("1");
    });

    await waitFor(() => {
      const eventsContainer = screen.getByTestId("system-observability-events");
      expect(eventsContainer.textContent).toContain("chart-sync");
      expect(eventsContainer.textContent).toContain("success");
    });
  });

  it("filters local chart rows when layer toggles are switched", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    await screen.findByTestId("local-chart-row-station-101");
    const stationLayerToggle = screen.getByTestId("local-chart-layer-station");
    expect(stationLayerToggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(stationLayerToggle);

    await waitFor(() => {
      expect(screen.queryByTestId("local-chart-row-station-101")).not.toBeInTheDocument();
    });
    expect(stationLayerToggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(stationLayerToggle);

    await waitFor(() => {
      expect(screen.getByTestId("local-chart-row-station-101")).toBeInTheDocument();
    });
  });

  it("hides moons without hiding planets when moon layer is toggled", async () => {
    localChartPayload = {
      ...localChartPayload,
      moons_by_parent_body_id: {
        "201": [
          {
            id: 401,
            body_kind: "moon",
            body_type: "ice",
            name: "Vega Prime 1-1",
            generation_version: 1,
            parent_body_id: 201,
            orbit_index: 1,
            orbit_radius_km: 3500,
            radius_km: 1900,
            position_x: 80500,
            position_y: 0,
            position_z: -1500,
          },
        ],
      },
    };

    scannerContactsPayload = [
      ...scannerContactsPayload,
      {
        id: "moon-401",
        contact_type: "moon",
        name: "Vega Prime 1-1",
        distance_km: 610,
        bearing_x: 0.2,
        bearing_y: -0.2,
        scene_x: 82,
        scene_y: 0,
        scene_z: -2,
        body_kind: "moon",
        body_type: "ice",
        radius_km: 1900,
      },
    ];

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    await screen.findByTestId("local-chart-row-planet-201");
    await screen.findByTestId("local-chart-row-moon-401");

    const moonLayerToggle = screen.getByTestId("local-chart-layer-moon");
    fireEvent.click(moonLayerToggle);

    await waitFor(() => {
      expect(screen.queryByTestId("local-chart-row-moon-401")).not.toBeInTheDocument();
      expect(screen.getByTestId("local-chart-row-planet-201")).toBeInTheDocument();
      expect(screen.getByTestId("system-chart-point-planet-201")).toBeInTheDocument();
    });
  });

  it("keeps system selection on a visible contact when selected layer is hidden", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const stationRow = await screen.findByTestId("local-chart-row-station-101");
    fireEvent.click(stationRow);

    await waitFor(() => {
      expect(screen.getByTestId("system-selected-contact").textContent).toContain(
        "Vega Tradeport",
      );
    });

    const stationLayerToggle = screen.getByTestId("local-chart-layer-station");
    fireEvent.click(stationLayerToggle);

    await waitFor(() => {
      expect(screen.queryByTestId("local-chart-row-station-101")).not.toBeInTheDocument();
      const selectedContact = screen.getByTestId("system-selected-contact").textContent || "";
      expect(selectedContact).not.toContain("Vega Tradeport");
      expect(selectedContact.length).toBeGreaterThan(0);
    });
  });

  it("persists local chart layer toggles across reload", async () => {
    const firstRender = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const stationLayerToggle = await screen.findByTestId("local-chart-layer-station");
    fireEvent.click(stationLayerToggle);

    await waitFor(() => {
      expect(screen.queryByTestId("local-chart-row-station-101")).not.toBeInTheDocument();
    });
    expect(stationLayerToggle).toHaveAttribute("aria-pressed", "false");

    firstRender.unmount();

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButtonReloaded = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButtonReloaded);

    const stationLayerToggleReloaded = await screen.findByTestId("local-chart-layer-station");
    expect(stationLayerToggleReloaded).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => {
      expect(screen.queryByTestId("local-chart-row-station-101")).not.toBeInTheDocument();
    });
  });

  it("persists local chart zoom and center preferences across reload", async () => {
    const firstRender = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const zoomInButton = await screen.findByRole("button", { name: /zoom in/i });
    const panRightButton = screen.getByRole("button", { name: /pan right/i });
    const panDownButton = screen.getByRole("button", { name: /pan down/i });

    fireEvent.click(zoomInButton);
    fireEvent.click(panRightButton);
    fireEvent.click(panDownButton);

    let firstStoredView: {
      zoom: number;
      center_x: number;
      center_z: number;
    } | null = null;

    await waitFor(() => {
      const storedRaw = window.localStorage.getItem("elite_local_chart_view");
      expect(storedRaw).toBeTruthy();
      firstStoredView = JSON.parse(storedRaw || "{}") as {
        zoom: number;
        center_x: number;
        center_z: number;
      };
      expect(Number(firstStoredView.zoom)).toBeGreaterThan(0);
      expect(Number(firstStoredView.center_x)).toBeGreaterThan(0);
      expect(Number(firstStoredView.center_z)).toBeGreaterThan(0);
    });

    firstRender.unmount();

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButtonReloaded = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButtonReloaded);

    await waitFor(() => {
      const storedRaw = window.localStorage.getItem("elite_local_chart_view");
      expect(storedRaw).toBeTruthy();
      const reloadedStoredView = JSON.parse(storedRaw || "{}") as {
        zoom: number;
        center_x: number;
        center_z: number;
      };
      expect(reloadedStoredView.zoom).toBeCloseTo(firstStoredView?.zoom ?? 0, 6);
      expect(reloadedStoredView.center_x).toBeCloseTo(firstStoredView?.center_x ?? 0, 6);
      expect(reloadedStoredView.center_z).toBeCloseTo(firstStoredView?.center_z ?? 0, 6);
    });
  });

  it("centers chart view on selected contact with one click", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const chartPlanetRow = await screen.findByTestId("local-chart-row-planet-201");
    fireEvent.click(chartPlanetRow);

    const centerSelectedButton = screen.getByTestId("local-chart-center-selected");
    fireEvent.click(centerSelectedButton);

    await waitFor(() => {
      const storedRaw = window.localStorage.getItem("elite_local_chart_view");
      expect(storedRaw).toBeTruthy();
      const storedView = JSON.parse(storedRaw || "{}") as {
        center_x: number;
        center_z: number;
      };
      expect(storedView.center_x).toBeCloseTo(77000, 3);
      expect(storedView.center_z).toBeCloseTo(-1800, 3);
    });
  });

  it("supports keyboard camera controls for system chart", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    await screen.findByTestId("local-chart-row-planet-201");

    fireEvent.keyDown(window, { key: "]" });
    fireEvent.keyDown(window, { key: "'" });
    fireEvent.keyDown(window, { key: "." });
    fireEvent.keyDown(window, { key: "-" });
    fireEvent.keyDown(window, { key: "+" });
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });

    await waitFor(() => {
      const storedRaw = window.localStorage.getItem("elite_local_chart_view");
      expect(storedRaw).toBeTruthy();
      const storedView = JSON.parse(storedRaw || "{}") as {
        zoom: number;
        center_x: number;
        yaw_deg: number;
        pitch_deg: number;
      };
      expect(Number.isFinite(storedView.yaw_deg)).toBe(true);
      expect(Number.isFinite(storedView.pitch_deg)).toBe(true);
      expect(Number.isFinite(storedView.zoom)).toBe(true);
      expect(Number.isFinite(storedView.center_x)).toBe(true);
    });

    const canvas = screen.getByTestId("system-chart-canvas");
    fireEvent.focus(canvas);
    expect(canvas).toBeInTheDocument();
  });

  it("supports keyboard selection of chart points", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const stationPoint = await screen.findByTestId("system-chart-point-station-101");
    stationPoint.focus();
    fireEvent.keyDown(stationPoint, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByTestId("system-selected-contact").textContent).toContain(
        "Vega Tradeport",
      );
    });
  });

  it("spreads close station contacts in chart view so each station remains visible", async () => {
    scannerContactsPayload = [
      {
        id: "station-101",
        contact_type: "station",
        name: "Vega Tradeport",
        distance_km: 13,
        bearing_x: 0.1,
        bearing_y: 0.2,
        orbiting_planet_name: "Vega Prime I",
        station_archetype_shape: "coriolis",
        scene_x: 10,
        scene_y: 0,
        scene_z: -20,
      },
      {
        id: "station-102",
        contact_type: "station",
        name: "Vega Relay",
        distance_km: 13,
        bearing_x: 0.1,
        bearing_y: 0.2,
        orbiting_planet_name: "Vega Prime I",
        station_archetype_shape: "coriolis",
        scene_x: 10,
        scene_y: 0,
        scene_z: -20,
      },
      {
        id: "station-103",
        contact_type: "station",
        name: "Vega Prospect",
        distance_km: 13,
        bearing_x: 0.1,
        bearing_y: 0.2,
        orbiting_planet_name: "Vega Prime I",
        station_archetype_shape: "coriolis",
        scene_x: 10,
        scene_y: 0,
        scene_z: -20,
      },
    ];

    localChartPayload = {
      ...localChartPayload,
      stations: [
        {
          id: 101,
          name: "Vega Tradeport",
          host_body_id: 201,
          orbit_radius_km: 26000,
          orbit_phase_deg: 17,
          position_x: 77120,
          position_y: 0,
          position_z: -1780,
        },
        {
          id: 102,
          name: "Vega Relay",
          host_body_id: 201,
          orbit_radius_km: 26000,
          orbit_phase_deg: 17,
          position_x: 77120,
          position_y: 0,
          position_z: -1780,
        },
        {
          id: 103,
          name: "Vega Prospect",
          host_body_id: 201,
          orbit_radius_km: 26000,
          orbit_phase_deg: 17,
          position_x: 77120,
          position_y: 0,
          position_z: -1780,
        },
      ],
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const stationPoint101 = await screen.findByTestId("system-chart-point-station-101");
    const stationPoint102 = screen.getByTestId("system-chart-point-station-102");
    const stationPoint103 = screen.getByTestId("system-chart-point-station-103");

    const position101 = `${stationPoint101.getAttribute("cx")},${stationPoint101.getAttribute("cy")}`;
    const position102 = `${stationPoint102.getAttribute("cx")},${stationPoint102.getAttribute("cy")}`;
    const position103 = `${stationPoint103.getAttribute("cx")},${stationPoint103.getAttribute("cy")}`;

    expect([position101, position102, position103].every((entry) => entry.includes(","))).toBe(true);
  });

  it("nudges focused chart selection with arrow keys and keeps focus synced", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const stationPoint = await screen.findByTestId("system-chart-point-station-101");
    const planetPoint = screen.getByTestId("system-chart-point-planet-201");

    const stationX = Number(stationPoint.getAttribute("cx"));
    const stationY = Number(stationPoint.getAttribute("cy"));
    const planetX = Number(planetPoint.getAttribute("cx"));
    const planetY = Number(planetPoint.getAttribute("cy"));

    const deltaX = planetX - stationX;
    const deltaY = planetY - stationY;
    const directionKey = Math.abs(deltaX) >= Math.abs(deltaY)
      ? (deltaX >= 0 ? "ArrowRight" : "ArrowLeft")
      : (deltaY >= 0 ? "ArrowDown" : "ArrowUp");

    stationPoint.focus();
    fireEvent.keyDown(stationPoint, { key: directionKey });

    await waitFor(() => {
      const selectedContactText = screen.getByTestId("system-selected-contact").textContent || "";
      expect(selectedContactText).not.toContain("Vega Tradeport");

      const focusedTestId = document.activeElement?.getAttribute("data-testid") || "";
      expect(focusedTestId.startsWith("system-chart-point-")).toBe(true);
      expect(focusedTestId).not.toBe("system-chart-point-station-101");
    });
  });

  it("supports keyboard navigation and waypoint lock in system chart", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    await screen.findByTestId("local-chart-row-station-101");

    fireEvent.keyDown(window, { key: "ArrowDown" });

    const flightModeButton = (await screen.findAllByRole("button", {
      name: /^Flight$/,
    }))[0];
    fireEvent.click(flightModeButton);

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-focused-contact").textContent).toBe("Traffic Ghost");
    });

    fireEvent.click(systemModeButton);
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByTestId("system-footer-waypoint").textContent).toMatch(
        /unlock selected waypoint/i,
      );
    });
  });

  it("shows selected contact details and auto-scrolls local chart row", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const chartPlanetRow = await screen.findByTestId("local-chart-row-planet-201");
    fireEvent.click(chartPlanetRow);

    await waitFor(() => {
      expect(screen.getByTestId("system-selected-contact").textContent).toContain(
        "Vega Prime I",
      );
    });
    expect(screen.getByTestId("system-selected-range").textContent).toContain("560.0 km");
    expect(screen.getByTestId("system-row-token-planet-201").textContent).toContain("◉");
    expect(screen.getByTestId("system-selected-token").textContent).toContain("◉");
    expect(screen.getByTestId("system-chart-selected-token-planet-201")).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it("provides system quick actions for focus and waypoint", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const stationRow = await screen.findByTestId("local-chart-row-station-101");
    fireEvent.click(stationRow);

    const quickWaypointButton = screen.getByTestId("system-footer-waypoint");
    fireEvent.click(quickWaypointButton);

    await waitFor(() => {
      expect(quickWaypointButton.textContent).toMatch(/unlock selected waypoint/i);
    });

    const quickFocusButton = screen.getByTestId("system-quick-focus-flight");
    fireEvent.click(quickFocusButton);

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-focused-contact").textContent).toBe(
        "Vega Tradeport",
      );
    });
  });

  it("allows manual local approach to nearby planet targets", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const planetRow = await screen.findByTestId("local-chart-row-planet-201");
    fireEvent.click(planetRow);

    await waitFor(() => {
      expect(screen.getByTestId("system-target-path-status").textContent).toContain(
        "local transfer available",
      );
      expect(screen.getByTestId("system-action-readiness").textContent).toContain(
        "local transfer available",
      );
    });

    const quickWaypointButton = screen.getByTestId("system-footer-waypoint");
    fireEvent.click(quickWaypointButton);

    await waitFor(() => {
      expect(quickWaypointButton.textContent).toMatch(/unlock selected waypoint/i);
    });

    fireEvent.keyDown(window, { key: "a", code: "KeyA" });

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-jump-phase").textContent).toBe("destination-locked");
    });

    expect(dockRequestBodies.length).toBe(0);
  });

  it("recommends and executes transfer jump for far planet targets", async () => {
    (globalThis as unknown as {
      __scannerTelemetryOverrides?: Record<string, Partial<{ distance: number }>>;
    }).__scannerTelemetryOverrides = {
      "planet-201": {
        distance: 1_600_000,
      },
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const planetRow = await screen.findByTestId("local-chart-row-planet-201");
    fireEvent.click(planetRow);

    await waitFor(() => {
      expect(screen.getByTestId("system-action-readiness").textContent).toContain(
        "READY",
      );
    });

    fireEvent.click(screen.getByTestId("system-footer-waypoint"));
    fireEvent.keyDown(window, { key: "a", code: "KeyA" });

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-jump-phase").textContent).toBe("idle");
    });

    expect(dockRequestBodies.length).toBe(0);
  });

  it("executes jump from flight controls to a locked local planet waypoint", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const planetRow = await screen.findByTestId("local-chart-row-planet-201");
    fireEvent.click(planetRow);
    fireEvent.click(screen.getByTestId("system-footer-waypoint"));

    const flightModeButton = (await screen.findAllByRole("button", {
      name: /^Flight$/,
    }))[0];
    fireEvent.click(flightModeButton);

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-waypoint-contact-id").textContent).toBe(
        "planet-201",
      );
    });

    const jumpButton = screen.getByRole("button", { name: /^System Jump$/i });
    expect(jumpButton).toBeEnabled();
    fireEvent.click(jumpButton);

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-jump-phase").textContent).toBe("idle");
    });

    expect(dockRequestBodies.length).toBe(0);
  });

  it("shows system target path readiness and waypoint state", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const stationRow = await screen.findByTestId("local-chart-row-station-101");
    fireEvent.click(stationRow);

    await waitFor(() => {
      expect(screen.getByTestId("system-target-path-status").textContent).toContain(
        "selected Vega Tradeport",
      );
      expect(screen.getByTestId("system-target-path-status").textContent).toContain(
        "waypoint unlocked",
      );
      expect(screen.getByTestId("system-target-path-status").textContent).toContain(
        "transfer/dock in range",
      );
    });
    expect(screen.getByTestId("system-action-readiness").textContent).toContain(
      "READY",
    );
    expect(screen.queryByTestId("system-target-block-legend")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("system-footer-waypoint"));

    await waitFor(() => {
      expect(screen.getByTestId("system-target-path-status").textContent).toContain(
        "waypoint locked",
      );
    });
  });

  it("shows selected and locked station names when they differ", async () => {
    shipTelemetryPayload = {
      ...shipTelemetryPayload,
      flight_locked_destination_station_id: 101,
      flight_phase: "destination-locked",
    };

    scannerContactsPayload = [
      ...scannerContactsPayload,
      {
        id: "station-102",
        contact_type: "station",
        name: "Vega Relay",
        distance_km: 31,
        bearing_x: 0.25,
        bearing_y: 0.18,
        orbiting_planet_name: "Vega Prime I",
        station_archetype_shape: "orbis",
        scene_x: 18,
        scene_y: 0,
        scene_z: -24,
      },
    ];

    localChartPayload = {
      ...localChartPayload,
      stations: [
        ...(localChartPayload.stations as Array<Record<string, unknown>>),
        {
          id: 102,
          name: "Vega Relay",
          host_body_id: 201,
          orbit_radius_km: 28000,
          orbit_phase_deg: 44,
          position_x: 77180,
          position_y: 0,
          position_z: -1750,
        },
      ],
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    fireEvent.click(await screen.findByTestId("local-chart-row-station-102"));

    await waitFor(() => {
      const pathStatus = screen.getByTestId("system-target-path-status").textContent || "";
      expect(pathStatus).toContain("selected Vega Relay");
      expect(pathStatus).toContain("waypoint locked to Vega Tradeport");
    });
  });

  it("dispatches typed flight audio events for target acquire and lock", async () => {
    const events: string[] = [];
    const onAudioEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ event?: unknown }>).detail;
      if (typeof detail?.event === "string") {
        events.push(detail.event);
      }
    };
    window.addEventListener("elite:flight-audio-event", onAudioEvent as EventListener);

    try {
      render(
        <ToastProvider>
          <Home />
        </ToastProvider>,
      );

      const systemModeButton = (await screen.findAllByRole("button", {
        name: /^System$/,
      }))[0];
      fireEvent.click(systemModeButton);

      fireEvent.click(await screen.findByTestId("local-chart-row-station-101"));

      await waitFor(() => {
        expect(events).toContain("nav.target_acquired");
      });

      fireEvent.click(screen.getByTestId("system-footer-waypoint"));
      await waitFor(() => {
        expect(events).toContain("nav.target_locked");
      });
    } finally {
      window.removeEventListener(
        "elite:flight-audio-event",
        onAudioEvent as EventListener,
      );
    }
  });

  it("dispatches canonical chart audio events for open, layer toggle, and waypoint lock", async () => {
    const events: string[] = [];
    const onAudioEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ event?: unknown }>).detail;
      if (typeof detail?.event === "string") {
        events.push(detail.event);
      }
    };
    window.addEventListener("elite:flight-audio-event", onAudioEvent as EventListener);

    try {
      render(
        <ToastProvider>
          <Home />
        </ToastProvider>,
      );

      const systemModeButton = (await screen.findAllByRole("button", {
        name: /^System$/,
      }))[0];
      fireEvent.click(systemModeButton);

      await waitFor(() => {
        expect(events).toContain("chart.open");
      });

      const starLayerButton = await screen.findByTestId("local-chart-layer-star");
      fireEvent.click(starLayerButton);
      await waitFor(() => {
        expect(events).toContain("chart.layer_toggle_off");
      });

      fireEvent.click(starLayerButton);
      await waitFor(() => {
        expect(events).toContain("chart.layer_toggle_on");
      });

      fireEvent.click(await screen.findByTestId("local-chart-row-station-101"));
      fireEvent.click(screen.getByTestId("system-footer-waypoint"));
      await waitFor(() => {
        expect(events).toContain("chart.waypoint_lock");
      });
    } finally {
      window.removeEventListener(
        "elite:flight-audio-event",
        onAudioEvent as EventListener,
      );
    }
  });

  it("dedupes duplicate local chart audio hints before dispatch", async () => {
    localChartPayload = {
      ...localChartPayload,
      mutable_state: {
        ...(localChartPayload.mutable_state as Record<string, unknown>),
        flight_phase: "docking-approach",
        local_target_contact_id: "station-101",
        local_target_status: "in-system-locked",
        transition_started_at: "2026-02-20T10:10:10Z",
        audio_event_hints: [
          "chart.waypoint_lock",
          "chart.waypoint_lock",
          "ops.docking_request_accept",
        ],
      },
    };

    const events: string[] = [];
    const onAudioEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ event?: unknown; source?: unknown }>).detail;
      if (detail?.source === "local-chart-hint" && typeof detail?.event === "string") {
        events.push(detail.event);
      }
    };
    window.addEventListener("elite:flight-audio-event", onAudioEvent as EventListener);

    try {
      render(
        <ToastProvider>
          <Home />
        </ToastProvider>,
      );

      await waitFor(() => {
        expect(events.filter((eventName) => eventName === "chart.waypoint_lock")).toHaveLength(1);
        expect(events.filter((eventName) => eventName === "ops.docking_request_accept")).toHaveLength(1);
      });
    } finally {
      window.removeEventListener(
        "elite:flight-audio-event",
        onAudioEvent as EventListener,
      );
    }
  });

  it("blocks flight audio dispatch when audio cues are disabled", async () => {
    const events: string[] = [];
    const onAudioEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ event?: unknown }>).detail;
      if (typeof detail?.event === "string") {
        events.push(detail.event);
      }
    };
    window.addEventListener("elite:flight-audio-event", onAudioEvent as EventListener);

    try {
      render(
        <ToastProvider>
          <Home />
        </ToastProvider>,
      );

      const flightModeButton = (await screen.findAllByRole("button", {
        name: /^Flight$/,
      }))[0];
      fireEvent.click(flightModeButton);

      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      const audioEnabledToggle = await screen.findByTestId("flight-setting-audio-enabled");
      fireEvent.click(audioEnabledToggle);
      expect(window.localStorage.getItem("elite_flight_audio_enabled")).toBe("false");

      events.length = 0;
      const systemModeButton = (await screen.findAllByRole("button", {
        name: /^System$/,
      }))[0];
      fireEvent.click(systemModeButton);

      fireEvent.click(await screen.findByTestId("local-chart-row-station-101"));

      await new Promise((resolve) => {
        window.setTimeout(resolve, 220);
      });

      expect(events).not.toContain("nav.target_acquired");
      expect(screen.getByTestId("flight-audio-dispatcher-state").textContent).toContain("audio off");
    } finally {
      window.removeEventListener(
        "elite:flight-audio-event",
        onAudioEvent as EventListener,
      );
    }
  });

  it("shows compact block reason when approach is unavailable while docked", async () => {
    shipTelemetryPayload = {
      ...shipTelemetryPayload,
      status: "docked",
      docked_station_id: 101,
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const stationRow = await screen.findByTestId("local-chart-row-station-101");
    fireEvent.click(stationRow);

    await waitFor(() => {
      expect(screen.getByTestId("system-target-path-status").textContent).toContain(
        "docking path unavailable while docked",
      );
      expect(screen.getByTestId("system-target-path-status").textContent).toContain(
        "block docked (docked launch first)",
      );
    });
    expect(screen.getByTestId("system-action-readiness").textContent).toContain(
      "BLOCKED",
    );
    expect(screen.getByTestId("system-action-readiness").textContent).toContain(
      "launch before docking path",
    );
    expect(screen.getByTestId("system-target-path-block-token").textContent).toContain(
      "block docked",
    );
    expect(screen.queryByTestId("system-target-block-legend")).not.toBeInTheDocument();
  });

  it("shows compact block reason when docking range telemetry is missing", async () => {
    shipTelemetryPayload = {
      ...shipTelemetryPayload,
      docking_computer_range_km: null,
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const stationRow = await screen.findByTestId("local-chart-row-station-101");
    fireEvent.click(stationRow);

    await waitFor(() => {
      expect(screen.getByTestId("system-target-path-status").textContent).toContain(
        "transfer/dock range unavailable",
      );
      expect(screen.getByTestId("system-target-path-status").textContent).toContain(
        "block no-range (no-range docking range unknown)",
      );
    });
    expect(screen.queryByTestId("system-target-block-legend")).not.toBeInTheDocument();
  });

  it("supports keyboard shortcuts for system quick actions", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const stationRow = await screen.findByTestId("local-chart-row-station-101");
    fireEvent.click(stationRow);

    fireEvent.keyDown(window, { key: "l" });
    await waitFor(() => {
      expect(screen.getByTestId("system-footer-waypoint").textContent).toMatch(
        /unlock selected waypoint/i,
      );
    });

    fireEvent.keyDown(window, { key: "f" });
    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-focused-contact").textContent).toBe(
        "Vega Tradeport",
      );
    });

    fireEvent.click(systemModeButton);

    expect(screen.getByTestId("system-shortcuts-hint").textContent).toContain(
      "Enter/L waypoint",
    );
    expect(screen.getByTestId("system-shortcuts-hint").textContent).toContain(
      "1/2/3/4 sort",
    );

    fireEvent.keyDown(window, { key: "4" });
    await waitFor(() => {
      const rowsByName = screen.getAllByTestId(/local-chart-row-/i);
      expect(rowsByName[0].getAttribute("data-testid")).toBe("local-chart-row-ship-99");
    });

    fireEvent.keyDown(window, { key: "a" });

    await waitFor(() => {
      expect(dockRequestBodies.length).toBe(1);
    });
    expect(JSON.parse(dockRequestBodies[0])).toMatchObject({ station_id: 101 });
  });

  it("cycles station targets with T shortcut in system mode", async () => {
    scannerContactsPayload = [
      ...scannerContactsPayload,
      {
        id: "station-102",
        contact_type: "station",
        name: "Vega Annex",
        distance_km: 29,
        bearing_x: -0.11,
        bearing_y: 0.05,
        orbiting_planet_name: "Vega Prime I",
        station_archetype_shape: "orbis",
        scene_x: 22,
        scene_y: 0,
        scene_z: -34,
      },
    ];

    localChartPayload = {
      ...localChartPayload,
      stations: [
        ...(localChartPayload.stations as Array<Record<string, unknown>>),
        {
          id: 102,
          name: "Vega Annex",
          host_body_id: 201,
          orbit_radius_km: 28500,
          orbit_phase_deg: 51,
          position_x: 77180,
          position_y: 0,
          position_z: -1715,
        },
      ],
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const systemModeButton = (await screen.findAllByRole("button", {
      name: /^System$/,
    }))[0];
    fireEvent.click(systemModeButton);

    const firstStationRow = await screen.findByTestId("local-chart-row-station-101");
    fireEvent.click(firstStationRow);

    fireEvent.keyDown(window, { key: "t" });
    await waitFor(() => {
      expect(screen.getByTestId("system-selected-contact").textContent).toContain(
        "Vega Annex",
      );
    });

    fireEvent.keyDown(window, { key: "t" });
    await waitFor(() => {
      expect(screen.getByTestId("system-selected-contact").textContent).toContain(
        "Vega Tradeport",
      );
    });
  });

  it("plots scanner blips using canonical plane projection", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightButton = await screen.findByRole("button", { name: "Flight" });
    fireEvent.click(flightButton);

    const stationBlip = await screen.findByRole("button", {
      name: "station Vega Tradeport",
    });

    await waitFor(() => {
      const leftValue = Number.parseFloat(stationBlip.style.left.replace("%", ""));
      expect(Number.isFinite(leftValue)).toBe(true);
      expect(leftValue).toBeLessThan(50);
    });
  });

  it("hides out-of-range contacts from scanner grid", async () => {
    (globalThis as unknown as {
      __scannerTelemetryOverrides?: Record<string, Record<string, unknown>>;
    }).__scannerTelemetryOverrides = {
      "station-101": {
        in_view: false,
        plane_x: 1.8,
        plane_y: 0.2,
        altitude: 0.1,
        fov_x: 1.4,
        fov_y: 0.1,
      },
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightButton = await screen.findByRole("button", { name: "Flight" });
    fireEvent.click(flightButton);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "station Vega Tradeport",
        }),
      ).toBeNull();
    });
  });

  it("shows selected scanner contact debug telemetry", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightButton = await screen.findByRole("button", { name: "Flight" });
    fireEvent.click(flightButton);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const debugToggle = await screen.findByTestId("flight-setting-scanner-debug");
    fireEvent.click(debugToggle);

    await waitFor(() => {
      const debugText = screen.getByText(/DBG station-101/i);
      expect(debugText.textContent).toContain("xyz=");
      expect(debugText.textContent).toContain("grid=");
    });
  });

  it("docks at selected station from flight mode", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByTestId("flight-scene-focused-contact").textContent,
      ).toBe("Vega Tradeport");
    });

    fireEvent.click(screen.getByRole("button", { name: /^Dock$/i }));

    await waitFor(() => {
      expect(dockRequestBodies.length).toBe(1);
    });
    expect(JSON.parse(dockRequestBodies[0])).toMatchObject({ station_id: 101 });

    await waitFor(() => {
      expect(screen.getByTestId("flight-scene-jump-phase").textContent).toBe(
        "docking-transit-internal",
      );
    });
  });

  it("runs undock outbound transit cinematic from docked flight mode", async () => {
    shipTelemetryPayload = {
      ...shipTelemetryPayload,
      status: "docked",
      docked_station_id: 101,
      docked_station_archetype_shape: "coriolis",
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await screen.findByText("Docked Bay");
    const shipModeButtons = await screen.findAllByRole("button", {
      name: /^Ship$/,
    });
    fireEvent.click(shipModeButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Undock$/i }));

    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      expect(undockRequestCount).toBe(1);
    });

    await waitFor(() => {
      expect(screen.queryByText("Docked Bay")).not.toBeInTheDocument();
      expect(screen.getByTestId("flight-scene-jump-phase").textContent).toBe(
        "undocking-transit-internal",
      );
    });
  });

  it("warns on low fuel thresholds and updates fuel gauge severity colors", async () => {
    shipTelemetryPayload = {
      ...shipTelemetryPayload,
      fuel_current: 25,
      fuel_cap: 100,
    };

    let view = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    const fuelGaugeFill = await screen.findByTestId("flight-fuel-gauge-fill");
    expect(fuelGaugeFill.className).toContain("fuelGaugeFillNormal");

    shipTelemetryPayload = {
      ...shipTelemetryPayload,
      fuel_current: 15,
      fuel_cap: 100,
    };

    view.unmount();
    view = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const warningFlightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(warningFlightModeButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("flight-fuel-gauge-fill").className).toContain("fuelGaugeFillWarning");
    });

    shipTelemetryPayload = {
      ...shipTelemetryPayload,
      fuel_current: 9,
      fuel_cap: 100,
    };

    view.unmount();
    view = render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const criticalFlightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(criticalFlightModeButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("flight-fuel-gauge-fill").className).toContain("fuelGaugeFillCritical");
    });

    view.unmount();
  });

  it("disables jump when fuel is below system jump cost", async () => {
    shipTelemetryPayload = {
      ...shipTelemetryPayload,
      fuel_current: 10,
      fuel_cap: 100,
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    const lockWaypointButton = screen.getByRole("button", { name: /lock waypoint/i });
    fireEvent.click(lockWaypointButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^System Jump$/i })).toBeDisabled();
    });
  });

  it("cancels docking approach before docking request dispatch", async () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByTestId("flight-scene-focused-contact").textContent,
      ).toBe("Vega Tradeport");
    });

    fireEvent.click(screen.getByRole("button", { name: /^Dock$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Cancel Docking$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Cancel Docking$/i })).not.toBeInTheDocument();
    });

    await new Promise((resolve) => {
      window.setTimeout(resolve, 240);
    });

    expect(dockRequestBodies.length).toBe(0);
  });

  it("renders docked orbis bay variant when ship telemetry reports orbis archetype", async () => {
    shipTelemetryPayload = {
      ...shipTelemetryPayload,
      status: "docked",
      docked_station_id: 1,
      docked_station_archetype_name: "Orbis Spindle",
      docked_station_archetype_shape: "orbis",
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await screen.findByText("Docked Bay");
    expect(screen.getByText("orbis")).toBeInTheDocument();
    expect(screen.getByTestId("flight-docked-bay-scene")).toHaveAttribute(
      "data-shape-variant",
      "orbis",
    );
  });

  it("falls back to default docked bay variant for unknown archetype shapes", async () => {
    shipTelemetryPayload = {
      ...shipTelemetryPayload,
      status: "docked",
      docked_station_id: 1,
      docked_station_archetype_name: "Experimental Ring",
      docked_station_archetype_shape: "tetrahedral",
    };

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const flightModeButtons = await screen.findAllByRole("button", {
      name: /^Flight$/,
    });
    fireEvent.click(flightModeButtons[0]);

    await screen.findByText("Docked Bay");
    expect(screen.getByText("tetrahedral")).toBeInTheDocument();
    expect(screen.getByTestId("flight-docked-bay-scene")).toHaveAttribute(
      "data-shape-variant",
      "default",
    );
  });
});
