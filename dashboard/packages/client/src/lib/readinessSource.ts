import type { ReadinessComponentSource } from "@health-dashboard/shared";

/**
 * Name a readiness source without conflating its physical sensor with the
 * API that delivered the measurement.
 */
export function readinessSourceLabel(source: ReadinessComponentSource): string {
  const { deviceLabel, provider, providerLabel } = source.provenance;
  return provider === "google_health"
    ? `${deviceLabel} via ${providerLabel}`
    : deviceLabel;
}

export function readinessSourceContribution(
  source: ReadinessComponentSource,
): string {
  return `${readinessSourceLabel(source)} ${source.z >= 0 ? "+" : ""}${source.z}`;
}
