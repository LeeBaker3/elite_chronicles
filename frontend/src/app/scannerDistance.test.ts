import { describe, expect, it } from "vitest";

import { resolveScannerDisplayDistanceKm } from "./scannerDistance";

describe("resolveScannerDisplayDistanceKm", () => {
  it("prefers finite live distance when available", () => {
    expect(resolveScannerDisplayDistanceKm(42, 27)).toBe(27);
  });

  it("falls back to snapshot distance when live distance is missing", () => {
    expect(resolveScannerDisplayDistanceKm(42, null)).toBe(42);
    expect(resolveScannerDisplayDistanceKm(42, undefined)).toBe(42);
  });

  it("clamps negative live distance to zero", () => {
    expect(resolveScannerDisplayDistanceKm(42, -5)).toBe(0);
  });

  it("falls back to snapshot when live distance is not finite", () => {
    expect(resolveScannerDisplayDistanceKm(42, Number.NaN)).toBe(42);
  });
});
