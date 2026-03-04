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
    | "jump.hyperspace_charge_start"
    | "jump.hyperspace_transit_peak"
    | "jump.exit"
    | "jump.exit_stabilize"
    | "jump.hyperspace_exit"
    | "jump.hyperspace_exit_stabilize";

export type FlightAudioCategory = "navigation" | "propulsion" | "jump" | "docking";

export type FlightAudioPlaybackResult =
    | "played"
    | "blocked_settings"
    | "blocked_reduced"
    | "unsupported"
    | "error";

type FlightAudioCue = {
    category: FlightAudioCategory;
    frequencyStart: number;
    frequencyEnd?: number;
    durationSeconds: number;
    gain: number;
    wave: OscillatorType;
    layerGain?: number;
    layerWave?: OscillatorType;
};

type FlightAudioRuntimeSettings = {
    audioEnabled: boolean;
    reducedAudioEnabled: boolean;
};

export type FlightAudioDebugSnapshot = {
    contextAvailable: boolean;
    contextState: AudioContextState | "none";
    sampleRate: number | null;
    baseLatency: number | null;
    outputLatency: number | null;
};

const FLIGHT_AUDIO_CUE_MAP: Record<FlightAudioEventName, FlightAudioCue> = {
    "nav.target_acquired": {
        category: "navigation",
        frequencyStart: 660,
        durationSeconds: 0.06,
        gain: 0.11,
        wave: "triangle",
    },
    "nav.target_locked": {
        category: "navigation",
        frequencyStart: 740,
        durationSeconds: 0.08,
        gain: 0.12,
        wave: "triangle",
    },
    "nav.invalid_action": {
        category: "navigation",
        frequencyStart: 220,
        durationSeconds: 0.11,
        gain: 0.1,
        wave: "sawtooth",
    },
    "nav.approach_ready": {
        category: "navigation",
        frequencyStart: 520,
        durationSeconds: 0.09,
        gain: 0.1,
        wave: "triangle",
    },
    "dock.transit_enter": {
        category: "docking",
        frequencyStart: 300,
        frequencyEnd: 260,
        durationSeconds: 0.14,
        gain: 0.11,
        wave: "sawtooth",
        layerGain: 0.32,
        layerWave: "triangle",
    },
    "dock.transit_exit": {
        category: "docking",
        frequencyStart: 560,
        frequencyEnd: 620,
        durationSeconds: 0.1,
        gain: 0.11,
        wave: "triangle",
    },
    "flight.throttle_accel": {
        category: "propulsion",
        frequencyStart: 180,
        frequencyEnd: 220,
        durationSeconds: 0.09,
        gain: 0.08,
        wave: "sine",
    },
    "flight.throttle_decel": {
        category: "propulsion",
        frequencyStart: 150,
        frequencyEnd: 120,
        durationSeconds: 0.09,
        gain: 0.08,
        wave: "sine",
    },
    "flight.motion_loop": {
        category: "propulsion",
        frequencyStart: 120,
        durationSeconds: 0.12,
        gain: 0.06,
        wave: "sine",
    },
    "jump.charge_start": {
        category: "jump",
        frequencyStart: 140,
        frequencyEnd: 320,
        durationSeconds: 0.42,
        gain: 0.22,
        wave: "sawtooth",
        layerGain: 0.45,
        layerWave: "triangle",
    },
    "jump.transit_peak": {
        category: "jump",
        frequencyStart: 980,
        frequencyEnd: 640,
        durationSeconds: 0.34,
        gain: 0.24,
        wave: "square",
        layerGain: 0.38,
        layerWave: "sawtooth",
    },
    "jump.hyperspace_charge_start": {
        category: "jump",
        frequencyStart: 120,
        frequencyEnd: 420,
        durationSeconds: 0.5,
        gain: 0.28,
        wave: "sawtooth",
        layerGain: 0.5,
        layerWave: "triangle",
    },
    "jump.hyperspace_transit_peak": {
        category: "jump",
        frequencyStart: 1220,
        frequencyEnd: 540,
        durationSeconds: 0.38,
        gain: 0.26,
        wave: "square",
        layerGain: 0.42,
        layerWave: "sawtooth",
    },
    "jump.exit": {
        category: "jump",
        frequencyStart: 700,
        frequencyEnd: 500,
        durationSeconds: 0.28,
        gain: 0.2,
        wave: "triangle",
        layerGain: 0.3,
        layerWave: "sine",
    },
    "jump.exit_stabilize": {
        category: "jump",
        frequencyStart: 520,
        frequencyEnd: 340,
        durationSeconds: 0.44,
        gain: 0.17,
        wave: "sine",
        layerGain: 0.24,
        layerWave: "triangle",
    },
    "jump.hyperspace_exit": {
        category: "jump",
        frequencyStart: 880,
        frequencyEnd: 460,
        durationSeconds: 0.32,
        gain: 0.24,
        wave: "triangle",
        layerGain: 0.36,
        layerWave: "square",
    },
    "jump.hyperspace_exit_stabilize": {
        category: "jump",
        frequencyStart: 420,
        frequencyEnd: 260,
        durationSeconds: 0.5,
        gain: 0.19,
        wave: "sine",
        layerGain: 0.26,
        layerWave: "triangle",
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

        return this.playCue(cue);
    }

    playDiagnosticTone(): FlightAudioPlaybackResult {
        return this.playCue({
            category: "navigation",
            frequencyStart: 880,
            durationSeconds: 1.2,
            gain: 0.55,
            wave: "square",
        });
    }

    getDebugSnapshot(): FlightAudioDebugSnapshot {
        const context = this.context;
        if (!context) {
            return {
                contextAvailable: false,
                contextState: "none",
                sampleRate: null,
                baseLatency: null,
                outputLatency: null,
            };
        }

        const outputLatency = typeof context.outputLatency === "number"
            ? context.outputLatency
            : null;

        return {
            contextAvailable: true,
            contextState: context.state,
            sampleRate: context.sampleRate,
            baseLatency: context.baseLatency,
            outputLatency,
        };
    }

    private ensureContext(): AudioContext | null {
        if (!this.context) {
            this.context = this.contextFactory();
        }

        if (!this.context || this.context.state === "closed") {
            this.context = null;
            return null;
        }

        if (this.context.state === "suspended") {
            void this.context.resume();
        }

        return this.context;
    }

    prime(): boolean {
        const context = this.ensureContext();
        if (!context) {
            return false;
        }

        if (context.state === "running") {
            return true;
        }

        void context.resume();
        return this.context?.state === "running";
    }

    async primeAsync(): Promise<boolean> {
        const context = this.ensureContext();
        if (!context) {
            return false;
        }

        if (context.state === "running") {
            return true;
        }

        try {
            await context.resume();
        } catch {
            return false;
        }

        return this.context?.state === "running";
    }

    private playCue(cue: FlightAudioCue): FlightAudioPlaybackResult {
        const context = this.ensureContext();
        if (!context) {
            return "unsupported";
        }

        try {
            const gainNode = context.createGain();
            const startedAt = context.currentTime;
            const stopAt = startedAt + cue.durationSeconds;

            const attackSeconds = Math.min(0.045, cue.durationSeconds * 0.22);
            const releaseSeconds = Math.min(0.18, cue.durationSeconds * 0.42);
            const sustainAt = Math.max(startedAt + attackSeconds, stopAt - releaseSeconds);

            gainNode.gain.setValueAtTime(0.0001, startedAt);
            gainNode.gain.exponentialRampToValueAtTime(cue.gain, startedAt + attackSeconds);
            gainNode.gain.setValueAtTime(cue.gain, sustainAt);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

            const startOscillator = (
                wave: OscillatorType,
                frequencyMultiplier: number,
                gainMultiplier: number,
            ): void => {
                const oscillator = context.createOscillator();
                const oscillatorGain = context.createGain();
                const startFrequency = cue.frequencyStart * frequencyMultiplier;
                const endFrequency = (cue.frequencyEnd ?? cue.frequencyStart) * frequencyMultiplier;

                oscillator.type = wave;
                if (typeof oscillator.frequency.setValueAtTime === "function") {
                    oscillator.frequency.setValueAtTime(startFrequency, startedAt);
                } else {
                    oscillator.frequency.value = startFrequency;
                }

                if (typeof oscillator.frequency.exponentialRampToValueAtTime === "function") {
                    oscillator.frequency.exponentialRampToValueAtTime(
                        Math.max(1, endFrequency),
                        stopAt,
                    );
                } else {
                    oscillator.frequency.value = Math.max(1, endFrequency);
                }

                oscillatorGain.gain.setValueAtTime(gainMultiplier, startedAt);
                oscillatorGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

                oscillator.connect(oscillatorGain);
                oscillatorGain.connect(gainNode);
                oscillator.start(startedAt);
                oscillator.stop(stopAt);
            };

            startOscillator(cue.wave, 1, 1);
            if (cue.layerGain && cue.layerGain > 0) {
                startOscillator(cue.layerWave ?? "sine", 0.5, cue.layerGain);
            }

            gainNode.connect(context.destination);

            return "played";
        } catch {
            return "error";
        }
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
