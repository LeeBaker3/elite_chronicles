import { describe, expect, it, vi } from "vitest";

import {
    FlightAudioAdapter,
    type FlightAudioEventName,
} from "./flightAudioAdapter";

type FakeAudioContext = {
    currentTime: number;
    state: "running" | "suspended";
    destination: Record<string, unknown>;
    resume: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    createOscillator: ReturnType<typeof vi.fn>;
};

const createFakeAudioContext = (): FakeAudioContext => {
    const gainNode = {
        gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
    };
    const oscillator = {
        type: "sine" as OscillatorType,
        frequency: {
            value: 0,
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
    };

    return {
        currentTime: 100,
        state: "running",
        destination: {},
        resume: vi.fn().mockResolvedValue(undefined),
        createGain: vi.fn(() => gainNode),
        createOscillator: vi.fn(() => oscillator),
    };
};

describe("FlightAudioAdapter", () => {
    it("plays cues when audio is enabled and context is available", () => {
        const fakeContext = createFakeAudioContext();
        const adapter = new FlightAudioAdapter(
            () => ({ audioEnabled: true, reducedAudioEnabled: false }),
            () => fakeContext as unknown as AudioContext,
        );

        const result = adapter.play("nav.target_acquired");

        expect(result).toBe("played");
        expect(fakeContext.createGain).toHaveBeenCalledTimes(1);
        expect(fakeContext.createOscillator).toHaveBeenCalledTimes(1);
    });

    it("blocks playback when master audio is disabled", () => {
        const fakeContext = createFakeAudioContext();
        const adapter = new FlightAudioAdapter(
            () => ({ audioEnabled: false, reducedAudioEnabled: false }),
            () => fakeContext as unknown as AudioContext,
        );

        const result = adapter.play("jump.exit");

        expect(result).toBe("blocked_settings");
        expect(fakeContext.createGain).not.toHaveBeenCalled();
    });

    it("suppresses propulsion cues in reduced audio mode", () => {
        const fakeContext = createFakeAudioContext();
        const adapter = new FlightAudioAdapter(
            () => ({ audioEnabled: true, reducedAudioEnabled: true }),
            () => fakeContext as unknown as AudioContext,
        );

        const result = adapter.play("flight.motion_loop");

        expect(result).toBe("blocked_reduced");
        expect(fakeContext.createGain).not.toHaveBeenCalled();
    });

    it("returns unsupported when no audio context is available", () => {
        const adapter = new FlightAudioAdapter(
            () => ({ audioEnabled: true, reducedAudioEnabled: false }),
            () => null,
        );

        const result = adapter.play("jump.charge_start");

        expect(result).toBe("unsupported");
    });

    it("resumes a suspended context on first use", () => {
        const fakeContext = createFakeAudioContext();
        fakeContext.state = "suspended";
        const adapter = new FlightAudioAdapter(
            () => ({ audioEnabled: true, reducedAudioEnabled: false }),
            () => fakeContext as unknown as AudioContext,
        );

        const result = adapter.play("nav.target_locked");

        expect(result).toBe("played");
        expect(fakeContext.resume).toHaveBeenCalledTimes(1);
    });

    it("reuses the same context between events", () => {
        const fakeContext = createFakeAudioContext();
        const factory = vi.fn(() => fakeContext as unknown as AudioContext);
        const adapter = new FlightAudioAdapter(
            () => ({ audioEnabled: true, reducedAudioEnabled: false }),
            factory,
        );

        const events: FlightAudioEventName[] = ["nav.approach_ready", "jump.exit"];
        events.forEach((eventName) => {
            adapter.play(eventName);
        });

        expect(factory).toHaveBeenCalledTimes(1);
    });
});
