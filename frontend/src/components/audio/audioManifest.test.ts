import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FLIGHT_MEDIA_AUDIO_EVENT_KEYS,
  FLIGHT_MEDIA_AUDIO_DIAGNOSTIC_URI,
  resolveFlightMediaAudioSfxUri,
} from "./audioManifest";

describe("audioManifest", () => {
  it("resolves every event key to a unique SFX asset path", () => {
    const resolved = FLIGHT_MEDIA_AUDIO_EVENT_KEYS.map((eventKey) => {
      const uri = resolveFlightMediaAudioSfxUri(eventKey);
      expect(uri).toBeTruthy();
      return uri as string;
    });

    expect(new Set(resolved).size).toBe(FLIGHT_MEDIA_AUDIO_EVENT_KEYS.length);
  });

  it("points every resolved asset to an existing file under public/audio/sfx", () => {
    for (const eventKey of FLIGHT_MEDIA_AUDIO_EVENT_KEYS) {
      const uri = resolveFlightMediaAudioSfxUri(eventKey);
      expect(uri).toBeTruthy();
      const relativePath = (uri as string).replace(/^\//, "");
      const absolutePath = path.join(process.cwd(), "public", relativePath.replace(/^audio\//, "audio/"));
      expect(fs.existsSync(absolutePath)).toBe(true);
    }

    const diagnosticPath = path.join(
      process.cwd(),
      "public",
      FLIGHT_MEDIA_AUDIO_DIAGNOSTIC_URI.replace(/^\//, ""),
    );
    expect(fs.existsSync(diagnosticPath)).toBe(true);
  });

  it("returns null for unknown event keys", () => {
    expect(resolveFlightMediaAudioSfxUri("unknown.event")).toBeNull();
  });
});
