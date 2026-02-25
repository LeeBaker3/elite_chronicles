export type CelestialChartBodyKind = "star" | "planet" | "moon" | "station" | "ship";

type CelestialVisual = {
    color: string;
    token: string;
    baseRadius: number;
};

const STAR_VISUAL_BY_TYPE: Record<string, CelestialVisual> = {
    "g-class": { color: "#ffd56a", token: "✦", baseRadius: 7.4 },
    "k-class": { color: "#ffbf6b", token: "✦", baseRadius: 7.2 },
    "m-class": { color: "#ff8f6a", token: "✦", baseRadius: 7.1 },
};

const PLANET_VISUAL_BY_TYPE: Record<string, CelestialVisual> = {
    "gas-giant": { color: "#c7ad6b", token: "◉", baseRadius: 5.9 },
    oceanic: { color: "#69b5ff", token: "◉", baseRadius: 5.3 },
    rocky: { color: "#7effa1", token: "◉", baseRadius: 5.1 },
    desert: { color: "#d8b378", token: "◉", baseRadius: 5.2 },
    volcanic: { color: "#ff8f6b", token: "◉", baseRadius: 5.0 },
    ice: { color: "#b9dfff", token: "◉", baseRadius: 5.0 },
};

const MOON_VISUAL_BY_TYPE: Record<string, CelestialVisual> = {
    ice: { color: "#c5e7ff", token: "●", baseRadius: 4.2 },
    rocky: { color: "#9ad3af", token: "●", baseRadius: 4.1 },
    barren: { color: "#b4bdc7", token: "●", baseRadius: 4.0 },
};

const DEFAULT_VISUAL_BY_KIND: Record<CelestialChartBodyKind, CelestialVisual> = {
    star: { color: "#ffd56a", token: "✦", baseRadius: 7.0 },
    planet: { color: "#7effa1", token: "◉", baseRadius: 5.0 },
    moon: { color: "#9ad3af", token: "●", baseRadius: 4.0 },
    station: { color: "#a9adb2", token: "◆", baseRadius: 4.5 },
    ship: { color: "#ffb347", token: "▲", baseRadius: 4.0 },
};

const normalizeBodyType = (value: string | null | undefined): string => (
    (value || "").trim().toLowerCase()
);

const getVisualByKind = (
    bodyKind: CelestialChartBodyKind,
    bodyType: string | null,
): CelestialVisual => {
    const normalizedType = normalizeBodyType(bodyType);
    if (bodyKind === "star") {
        return STAR_VISUAL_BY_TYPE[normalizedType] || DEFAULT_VISUAL_BY_KIND.star;
    }
    if (bodyKind === "planet") {
        return PLANET_VISUAL_BY_TYPE[normalizedType] || DEFAULT_VISUAL_BY_KIND.planet;
    }
    if (bodyKind === "moon") {
        return MOON_VISUAL_BY_TYPE[normalizedType] || DEFAULT_VISUAL_BY_KIND.moon;
    }
    return DEFAULT_VISUAL_BY_KIND[bodyKind];
};

const computeRadiusScaleFromKm = (radiusKm: number | null): number => {
    if (!Number.isFinite(radiusKm) || (radiusKm ?? 0) <= 0) {
        return 1;
    }
    const normalized = Math.log10(Math.max(1, Number(radiusKm))) / 6;
    return 0.8 + (Math.max(0, Math.min(1, normalized)) * 0.9);
};

export const resolveChartPointVisual = (
    bodyKind: CelestialChartBodyKind,
    bodyType: string | null,
    radiusKm: number | null,
): { color: string; token: string; radius: number } => {
    const visual = getVisualByKind(bodyKind, bodyType);
    const radiusScale = computeRadiusScaleFromKm(radiusKm);
    return {
        color: visual.color,
        token: visual.token,
        radius: visual.baseRadius * radiusScale,
    };
};
