export const resolveScannerDisplayDistanceKm = (
  snapshotDistanceKm: number,
  liveDistanceKm: number | null | undefined,
): number => {
  if (liveDistanceKm !== null && liveDistanceKm !== undefined && Number.isFinite(liveDistanceKm)) {
    return Math.max(0, liveDistanceKm);
  }

  const snapshotDistance = Number.isFinite(snapshotDistanceKm)
    ? Math.max(0, snapshotDistanceKm)
    : 0;

  if (snapshotDistance > 0) {
    return snapshotDistance;
  }

  return snapshotDistance;
};
