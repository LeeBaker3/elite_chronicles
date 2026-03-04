import { describe, expect, it } from "vitest";

import { resolveChartPointVisual } from "./celestialVisuals";

describe("resolveChartPointVisual", () => {
    it("returns stable typed visuals for stars and planets", () => {
        const star = resolveChartPointVisual("star", "g-class", 700000);
        const gasGiant = resolveChartPointVisual("planet", "gas-giant", 42000);

        expect(star.token).toBe("✦");
        expect(star.color).toBe("#ffd56a");
        expect(gasGiant.token).toBe("◉");
        expect(gasGiant.color).toBe("#c7ad6b");
    });

    it("uses moon-specific token and color mapping", () => {
        const moon = resolveChartPointVisual("moon", "ice", 2000);

        expect(moon.token).toBe("●");
        expect(moon.color).toBe("#c5e7ff");
    });

    it("scales larger bodies to larger plot radius", () => {
        const smallMoon = resolveChartPointVisual("moon", "rocky", 900);
        const largePlanet = resolveChartPointVisual("planet", "gas-giant", 60000);

        expect(largePlanet.radius).toBeGreaterThan(smallMoon.radius);
    });
});
