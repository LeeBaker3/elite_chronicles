export type FlightAudioEventName =
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
    | "jump.exit";

export type FlightAudioCategory = "navigation" | "propulsion" | "jump" | "docking";

export type FlightAudioPlaybackResult =
    | "played"
    | "blocked_settings"
    | "blocked_reduced"
    | "unsupported"
    | "error";

type FlightAudioCue = {
    category: FlightAudioCategory;
    frequency: number;
    durationSeconds: number;
    gain: number;
    wave: OscillatorType;
};

type FlightAudioRuntimeSettings = {
    audioEnabled: boolean;
    reducedAudioEnabled: boolean;
};

const FLIGHT_AUDIO_CUE_MAP: Record<FlightAudioEventName, FlightAudioCue> = {
    "nav.target_acquired": {
        category: "navigation",
        frequency: 660,
        durationSeconds: 0.06,
        gain: 0.11,
        wave: "triangle",
    },
    "nav.target_locked": {
        category: "navigation",
        frequency: 740,
        durationSeconds: 0.08,
        gain: 0.12,
        wave: "triangle",
    },
    "nav.invalid_action": {
        category: "navigation",
        frequency: 220,
        durationSeconds: 0.11,
        gain: 0.1,
        wave: "sawtooth",
    },
    "nav.approach_ready": {
        category: "navigation",
        frequency: 520,
        durationSeconds: 0.09,
        gain: 0.1,
        wave: "triangle",
    },
    "dock.transit_enter": {
        category: "docking",
        frequency: 300,
        durationSeconds: 0.14,
        gain: 0.11,
        wave: "sawtooth",
    },
    "dock.transit_exit": {
        category: "docking",
        frequency: 560,
        durationSeconds: 0.1,
        gain: 0.11,
        wave: "triangle",
    },
    "flight.throttle_accel": {
        category: "propulsion",
        frequency: 180,
        durationSeconds: 0.09,
        gain: 0.08,
        wave: "sine",
    },
    "flight.throttle_decel": {
        category: "propulsion",
        frequency: 150,
        durationSeconds: 0.09,
        gain: 0.08,
        wave: "sine",
    },
    "flight.motion_loop": {
        category: "propulsion",
        frequency: 120,
        durationSeconds: 0.12,
        gain: 0.06,
        wave: "sine",
    },
    "jump.charge_start": {
        category: "jump",
        frequency: 280,
        durationSeconds: 0.12,
        gain: 0.12,
        wave: "sawtooth",
    },
    "jump.transit_peak": {
        category: "jump",
        frequency: 380,
        durationSeconds: 0.13,
        gain: 0.12,
        wave: "square",
    },
    "jump.exit": {
        category: "jump",
        frequency: 480,
        durationSeconds: 0.1,
        gain: 0.12,
        wave: "triangle",
    },
};

const REDUCED_AUDIO_CATEGORIES: FlightAudioCategory[] = ["propulsion"];

export class FlightAudioAdapter {
    private readonly getRuntimeSettings: () => FlightAudioRuntimeSettings;

    private readonly contextFactory: () => AudioContext | null;

    private context: AudioContext | null = null;

    constructor(
        getRuntimeSettings: () => FlightAudioRuntimeSettings,
        contextFactory: () => AudioContext | null,
    ) {
        this.getRuntimeSettings = getRuntimeSettings;
        this.contextFactory = contextFactory;
    }

    play(eventName: FlightAudioEventName): FlightAudioPlaybackResult {
        const { audioEnabled, reducedAudioEnabled } = this.getRuntimeSettings();
        if (!audioEnabled) {
            return "blocked_settings";
        }

        const cue = FLIGHT_AUDIO_CUE_MAP[eventName];
        if (
            reducedAudioEnabled
            && REDUCED_AUDIO_CATEGORIES.includes(cue.category)
        ) {
            return "blocked_reduced";
        }

        const context = this.ensureContext();
        if (!context) {
            return "unsupported";
        }

        try {
            const gainNode = context.createGain();
            const oscillator = context.createOscillator();
            const startedAt = context.currentTime;
            const stopAt = startedAt + cue.durationSeconds;

            oscillator.type = cue.wave;
            oscillator.frequency.value = cue.frequency;
            gainNode.gain.setValueAtTime(cue.gain, startedAt);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

            oscillator.connect(gainNode);
            gainNode.connect(context.destination);
            oscillator.start(startedAt);
            oscillator.stop(stopAt);

            return "played";
        } catch {
            return "error";
        }
    }

    private ensureContext(): AudioContext | null {
        if (this.context) {
            return this.context;
        }

        const createdContext = this.contextFactory();
        if (!createdContext) {
            return null;
        }

        if (createdContext.state === "suspended") {
            void createdContext.resume();
        }

        this.context = createdContext;
        return this.context;
    }
}

export const createBrowserAudioContext = (): AudioContext | null => {
    if (typeof window === "undefined") {
        return null;
    }

    const ContextConstructor = window.AudioContext
        || (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;

    if (!ContextConstructor) {
        return null;
    }

    try {
        return new ContextConstructor();
    } catch {
        return null;
    }
};
