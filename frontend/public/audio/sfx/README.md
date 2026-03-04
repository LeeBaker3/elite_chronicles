SFX Asset Folder

This folder contains media-audio playback files used by the frontend.

Swap workflow:
1. Each event key resolves to one unique file named `<event-key-with-dots-replaced-by-dashes>.wav`.
2. Keep the same filename to replace a sound without code changes.
3. If you add or rename an event file, update `src/components/audio/audioManifest.ts`.
4. Use WAV files for predictable browser compatibility.
