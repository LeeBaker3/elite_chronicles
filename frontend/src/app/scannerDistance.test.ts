import { describe, expect, it } from "vitest";

import { resolveScannerDisplayDistanceKm } from "./scannerDistance";

describe("resolveScannerDisplayDistanceKm", () => {
  it("prefers live distance when it is available", () => {
    expect(resolveScannerDisplayDistanceKm(42, 27)).toBe(27);
  });

  it("falls back to snapshot distance when live distance is missing", () => {
    expect(resolveScannerDisplayDistanceKm(42, null)).toBe(42);
    expect(resolveScannerDisplayDistanceKm(42, undefined)).toBe(42);
  });

  it("clamps negative live distance to zero when snapshot distance is unavailable", () => {
    expect(resolveScannerDisplayDistanceKm(0, -5)).toBe(0);
  });

  it("falls back to live distance when snapshot distance is unavailable", () => {
    expect(resolveScannerDisplayDistanceKm(0, 27)).toBe(27);
  });

  it("falls back to zero when neither snapshot nor live distance is usable", () => {
    expect(resolveScannerDisplayDistanceKm(Number.NaN, Number.NaN)).toBe(0);
    expect(resolveScannerDisplayDistanceKm(0, Number.NaN)).toBe(0);
  });
});
