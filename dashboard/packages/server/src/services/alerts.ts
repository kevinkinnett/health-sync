import type {
  AlertSeverity,
  HealthAlertKind,
  ReadinessScore,
} from "@health-dashboard/shared";
import type { ReadinessDayInput } from "./readiness.js";

/**
 * Deterministic anomaly detection over the recovery signals. Pure (no
 * DB, no clock) so the rules are unit-testable with synthetic series.
 *
 * Anti-noise discipline (the thing that makes or breaks an alert
 * system):
 *   - Only THREE kinds, each chosen to mean something.
 *   - The illness triad requires multi-DAY persistence, not one noisy
 *     night.
 *   - Severity tiers — only `alert` is meant to be pushed; `warn` is
 *     in-app. Persistence + the repository's cooldown (insert-once-per-
 *     kind-per-window) stop daily re-firing.
 *
 * Thresholds + per-kind toggles are configurable via `DetectionConfig`;
 * the defaults below mirror the original hardcoded constants, so
 * `detectAlerts(days, readiness)` behaves exactly as it did before
 * settings existed.
 */

const BASELINE_DAYS = 30;
const MIN_BASELINE_DAYS = 10;

/** Tunable detector knobs (sourced from the user's notification settings). */
export interface DetectionConfig {
  /**
   * σ above/below baseline to count a signal as elevated/depressed.
   * 1.5σ (not 1σ): recovery signals oscillate, and a 1σ bar flags ~16%
   * of perfectly normal days per signal — far too trigger-happy. 1.5σ
   * (~7%) keeps "elevated" meaningful.
   */
  illnessSigma: number;
  /** Skin-temp deviation (°) that counts as "warm" regardless of σ. */
  skinTempWarm: number;
  /** SpO2 below this (%) is an `alert`. */
  spo2AlertBelow: number;
  /** SpO2 below this (%) is a `warn`. */
  spo2WarnBelow: number;
  /** Readiness drop vs the recent trend that warrants a heads-up. */
  readinessDropPoints: number;
  /** Per-kind on/off — a disabled kind is never produced. */
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
function std(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / xs.length);
}

type RollingMetric = "rhr" | "breathing" | "hrv" | "spo2";

function valueOf(d: ReadinessDayInput, m: RollingMetric): number | null {
  if (m === "rhr") return d.rhr;
  if (m === "breathing") return d.breathing;
  if (m === "hrv") return d.hrv;
  return d.spo2;
}

interface Baseline {
  mean: number;
  std: number;
}

/** Trailing baseline for `m` over the days strictly before `idx`. */
function baselineAt(
  days: ReadinessDayInput[],
  idx: number,
  m: RollingMetric,
): Baseline | null {
  const window = days
    .slice(Math.max(0, idx - BASELINE_DAYS), idx)
    .map((d) => valueOf(d, m))
    .filter((v): v is number => v != null);
  if (window.length < MIN_BASELINE_DAYS) return null;
  const mu = mean(window);
  return { mean: mu, std: std(window, mu) };
}

/** Is `m` elevated (≥ μ+σ) on day `idx`? Null when undeterminable. */
function isElevated(
  days: ReadinessDayInput[],
  idx: number,
  m: RollingMetric,
  sigma: number,
): boolean | null {
  const v = valueOf(days[idx], m);
  const b = baselineAt(days, idx, m);
  if (v == null || b == null || b.std === 0) return null;
  return v >= b.mean + sigma * b.std;
}

/** Triad "bad" signals on day `idx`: elevated RHR / breathing / warm skin. */
function triadHitsAt(
  days: ReadinessDayInput[],
  idx: number,
  sigma: number,
  skinTempWarm: number,
): string[] {
  const hits: string[] = [];
  if (isElevated(days, idx, "rhr", sigma)) hits.push("resting HR");
  if (isElevated(days, idx, "breathing", sigma)) hits.push("breathing rate");
  const skin = days[idx].skinTemp;
  if (skin != null && skin >= skinTempWarm) hits.push("skin temp");
  return hits;
}

/**
 * Run all (enabled) detectors against a date-sorted day series + the
 * current readiness score. Returns the alerts that are *active for the
 * latest scored day* — the repository decides which are new
 * (cooldown/dedup).
 */
export function detectAlerts(
  daysIn: ReadinessDayInput[],
  readiness: ReadinessScore,
  config: DetectionConfig = DEFAULT_DETECTION,
): DetectedAlert[] {
  const days = [...daysIn].sort((a, b) => a.date.localeCompare(b.date));
  if (days.length === 0) return [];

  // Score the latest day that has core data — align with readiness.
  const targetDate = readiness.date;
  const idx = targetDate
    ? days.findIndex((d) => d.date === targetDate)
    : days.length - 1;
  if (idx < 0) return [];
  const date = days[idx].date;
  const out: DetectedAlert[] = [];

  // 1) Illness / over-reaching triad — ≥2 hits today AND ≥2 yesterday.
  if (config.kinds.illnessTriad) {
    const todayHits = triadHitsAt(
      days,
      idx,
      config.illnessSigma,
      config.skinTempWarm,
    );
    const prevHits =
      idx > 0
        ? triadHitsAt(days, idx - 1, config.illnessSigma, config.skinTempWarm)
        : [];
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

  // 2) Low blood oxygen — absolute floor.
  if (config.kinds.lowSpo2) {
    const spo2 = days[idx].spo2;
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
      prior.length >= 3 &&
      readiness.score <= mean(prior) - config.readinessDropPoints;
    if (readiness.band === "compromised" || droppedVsTrend) {
      const vs =
        prior.length >= 3 ? ` (was averaging ${Math.round(mean(prior))})` : "";
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
