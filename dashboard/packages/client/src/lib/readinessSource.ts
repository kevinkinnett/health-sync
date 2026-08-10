import type { ReadinessComponentSource } from "@health-dashboard/shared";

/**
 * Name a readiness source without conflating its physical sensor with the
 * API that delivered the measurement.
 */
export function readinessSourceLabel(source: ReadinessComponentSource): string {
  // A newly activated client can briefly overlap the previous API during a
  // rolling deploy. Conversely, a cached client can hit the new API. The
  // server therefore keeps `label`, and this reader accepts either shape.
  const provenance = source.provenance;
  if (!provenance) return source.label || "Unknown source";
  const { deviceLabel, provider, providerLabel } = provenance;
  return provider === "google_health"
    ? `${deviceLabel} via ${providerLabel}`
    : deviceLabel;
}

export function readinessSourceContribution(
  source: ReadinessComponentSource,
): string {
  return `${readinessSourceLabel(source)} ${source.z >= 0 ? "+" : ""}${source.z}`;
}
