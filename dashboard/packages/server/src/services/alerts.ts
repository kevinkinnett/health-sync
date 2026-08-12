import type {
  AlertSeverity,
  HealthAlertKind,
  ReadinessScore,
} from "@health-dashboard/shared";
import type { ReadinessDayInput } from "./readiness.js";
import {
  fuseMetric,
  resolveReading,
  sourceValue,
  type FusibleMetric,
  type ReadinessSource,
  type SourceValues,
} from "./signalFusion.js";

/**
 * Deterministic anomaly detection over the recovery signals. Pure (no
 * DB, no clock) so the rules are unit-testable with synthetic series.
 *
 * Now SOURCE-AWARE: "elevated vs baseline" is judged on the FUSED signal
 * (Fitbit + Eight Sleep, per `signalFusion.ts`), so the illness triad
 * benefits from Eight Sleep's more-sensitive overnight HR rather than
 * Fitbit's smoothed resting HR.
 *
 * Anti-noise discipline:
 *   - Only THREE kinds, each chosen to mean something.
 *   - The illness triad requires multi-DAY persistence, not one noisy night.
 *   - Severity tiers + the repository cooldown stop daily re-firing.
 *
 * Thresholds + per-kind toggles come from `DetectionConfig`; defaults
 * mirror the original constants.
 */

const BASELINE_DAYS = 30;
const MIN_BASELINE_DAYS = 10;
const Z_CLAMP = 5; // generous — we compare against sigma, not for scoring

export interface DetectionConfig {
  illnessSigma: number;
  skinTempWarm: number;
  spo2AlertBelow: number;
  spo2WarnBelow: number;
  readinessDropPoints: number;
  kinds: { illnessTriad: boolean; lowSpo2: boolean; readinessDrop: boolean };
}

export const DEFAULT_DETECTION: DetectionConfig = {
  illnessSigma: 1.5,
  skinTempWarm: 0.3,
  spo2AlertBelow: 90,
  spo2WarnBelow: 92,
  readinessDropPoints: 18,
  kinds: { illnessTriad: true, lowSpo2: true, readinessDrop: true },
};

export interface DetectedAlert {
  kind: HealthAlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  metric: string | null;
  date: string;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Per-source baseline series for a fusible field over the trailing window. */
function windowFor(
  days: ReadinessDayInput[],
  idx: number,
  field: keyof ReadinessDayInput,
  metric: FusibleMetric,
): Partial<Record<ReadinessSource, number[]>> {
  const win = days.slice(Math.max(0, idx - BASELINE_DAYS), idx);
  const out: Partial<Record<ReadinessSource, number[]>> = {};
  const targetValues = days[idx][field] as SourceValues;
  for (const src of ["fitbit", "eightSleep"] as ReadinessSource[]) {
    const target = resolveReading(metric, src, targetValues?.[src]);
    if (!target) continue;
    const vals: number[] = [];
    for (const d of win) {
      const reading = resolveReading(metric, src, (d[field] as SourceValues)?.[src]);
      if (reading && reading.regime === target.regime &&
          reading.comparisonGroup === target.comparisonGroup) {
        vals.push(reading.value as number);
      }
    }
    if (vals.length) out[src] = vals;
  }
  return out;
}

/** Fused (unsigned, + = higher value) z for a metric on day `idx`. */
function fusedZAt(
  days: ReadinessDayInput[],
  idx: number,
  metric: FusibleMetric,
  field: keyof ReadinessDayInput,
): number | null {
  const fused = fuseMetric(
    metric,
    days[idx][field] as SourceValues,
    windowFor(days, idx, field, metric),
    { minBaselineDays: MIN_BASELINE_DAYS, zClamp: Z_CLAMP },
  );
  return fused.z;
}

/** First present raw value across sources (for absolute-threshold checks). */
function rawValue(sv: SourceValues): number | null {
  for (const value of Object.values(sv)) {
    const raw = sourceValue(value);
    if (raw != null) return raw;
  }
  return null;
}

/** Triad "bad" signals on day `idx`: elevated RHR / breathing / warm skin. */
function triadHitsAt(
  days: ReadinessDayInput[],
  idx: number,
  sigma: number,
  skinTempWarm: number,
): string[] {
  const hits: string[] = [];
  const rhrZ = fusedZAt(days, idx, "rhr", "rhr");
  if (rhrZ != null && rhrZ >= sigma) hits.push("resting HR");
  const brZ = fusedZAt(days, idx, "breathing", "breathing");
  if (brZ != null && brZ >= sigma) hits.push("breathing rate");
  const skin = days[idx].skinTemp;
  if (skin != null && skin >= skinTempWarm) hits.push("skin temp");
  return hits;
}

export function detectAlerts(
  daysIn: ReadinessDayInput[],
  readiness: ReadinessScore,
  config: DetectionConfig = DEFAULT_DETECTION,
): DetectedAlert[] {
  const days = [...daysIn].sort((a, b) => a.date.localeCompare(b.date));
  if (days.length === 0) return [];

  const targetDate = readiness.date;
  const idx = targetDate
    ? days.findIndex((d) => d.date === targetDate)
    : days.length - 1;
  if (idx < 0) return [];
  const date = days[idx].date;
  const out: DetectedAlert[] = [];

  // 1) Illness / over-reaching triad — ≥2 hits today AND ≥2 yesterday.
  if (config.kinds.illnessTriad) {
    const todayHits = triadHitsAt(days, idx, config.illnessSigma, config.skinTempWarm);
    const prevHits =
      idx > 0 ? triadHitsAt(days, idx - 1, config.illnessSigma, config.skinTempWarm) : [];
    if (todayHits.length >= 2 && prevHits.length >= 2) {
      out.push({
        kind: "illness_triad",
        severity: "alert",
        title: "Possible illness or under-recovery",
        detail: `${todayHits.join(", ")} have been elevated above your baseline for 2+ days. Consider easing off and prioritising rest.`,
        metric: "recovery",
        date,
      });
    }
  }

  // 2) Low blood oxygen — absolute floor (Fitbit-sourced).
  if (config.kinds.lowSpo2) {
    const spo2 = rawValue(days[idx].spo2);
    if (spo2 != null && spo2 < config.spo2AlertBelow) {
      out.push({
        kind: "low_spo2",
        severity: "alert",
        title: "Low overnight blood oxygen",
        detail: `Average SpO2 was ${spo2.toFixed(1)}% — below ${config.spo2AlertBelow}%. If this persists it's worth a clinical look.`,
        metric: "spo2",
        date,
      });
    } else if (spo2 != null && spo2 < config.spo2WarnBelow) {
      out.push({
        kind: "low_spo2",
        severity: "warn",
        title: "Blood oxygen on the low side",
        detail: `Average SpO2 was ${spo2.toFixed(1)}% (below ${config.spo2WarnBelow}%).`,
        metric: "spo2",
        date,
      });
    }
  }

  // 3) Readiness drop — sharp fall vs the recent trend, or compromised.
  if (config.kinds.readinessDrop && readiness.score != null) {
    const prior = readiness.history
      .filter((p) => p.date < date)
      .slice(-7)
      .map((p) => p.score);
    const droppedVsTrend =
      prior.length >= 3 && readiness.score <= mean(prior) - config.readinessDropPoints;
    if (readiness.band === "compromised" || droppedVsTrend) {
      const vs = prior.length >= 3 ? ` (was averaging ${Math.round(mean(prior))})` : "";
      out.push({
        kind: "readiness_drop",
        severity: "warn",
        title: "Readiness has dropped",
        detail: `Today's readiness is ${readiness.score}${vs}. ${readiness.summary}`,
        metric: "readiness",
        date,
      });
    }
  }

  return out;
}
