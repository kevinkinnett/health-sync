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
 */

const BASELINE_DAYS = 30;
const MIN_BASELINE_DAYS = 10;
/**
 * σ above/below baseline to count a signal as elevated/depressed.
 * 1.5σ (not 1σ): recovery signals oscillate, and a 1σ bar flags ~16%
 * of perfectly normal days per signal — far too trigger-happy for an
 * alert. 1.5σ (~7%) keeps "elevated" meaningful.
 */
const SIGMA = 1.5;
/** Skin-temp deviation (°) that counts as "warm" regardless of σ. */
const SKIN_TEMP_WARM = 0.3;
/** Absolute SpO2 floors (percent). */
const SPO2_ALERT = 90;
const SPO2_WARN = 92;
/** Readiness drop vs recent trend that warrants a heads-up. */
const READINESS_DROP = 18;

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
): boolean | null {
  const v = valueOf(days[idx], m);
  const b = baselineAt(days, idx, m);
  if (v == null || b == null || b.std === 0) return null;
  return v >= b.mean + SIGMA * b.std;
}

/** Triad "bad" signals on day `idx`: elevated RHR / breathing / warm skin. */
function triadHitsAt(days: ReadinessDayInput[], idx: number): string[] {
  const hits: string[] = [];
  if (isElevated(days, idx, "rhr")) hits.push("resting HR");
  if (isElevated(days, idx, "breathing")) hits.push("breathing rate");
  const skin = days[idx].skinTemp;
  if (skin != null && skin >= SKIN_TEMP_WARM) hits.push("skin temp");
  return hits;
}

/**
 * Run all detectors against a date-sorted day series + the current
 * readiness score. Returns the alerts that are *active for the latest
 * scored day* — the repository decides which are new (cooldown/dedup).
 */
export function detectAlerts(
  daysIn: ReadinessDayInput[],
  readiness: ReadinessScore,
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
  const todayHits = triadHitsAt(days, idx);
  const prevHits = idx > 0 ? triadHitsAt(days, idx - 1) : [];
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

  // 2) Low blood oxygen — absolute floor.
  const spo2 = days[idx].spo2;
  if (spo2 != null && spo2 < SPO2_ALERT) {
    out.push({
      kind: "low_spo2",
      severity: "alert",
      title: "Low overnight blood oxygen",
      detail: `Average SpO2 was ${spo2.toFixed(1)}% — below ${SPO2_ALERT}%. If this persists it's worth a clinical look.`,
      metric: "spo2",
      date,
    });
  } else if (spo2 != null && spo2 < SPO2_WARN) {
    out.push({
      kind: "low_spo2",
      severity: "warn",
      title: "Blood oxygen on the low side",
      detail: `Average SpO2 was ${spo2.toFixed(1)}% (below ${SPO2_WARN}%).`,
      metric: "spo2",
      date,
    });
  }

  // 3) Readiness drop — sharp fall vs the recent trend, or compromised.
  if (readiness.score != null) {
    const prior = readiness.history
      .filter((p) => p.date < date)
      .slice(-7)
      .map((p) => p.score);
    const droppedVsTrend =
      prior.length >= 3 && readiness.score <= mean(prior) - READINESS_DROP;
    if (readiness.band === "compromised" || droppedVsTrend) {
      const vs =
        prior.length >= 3
          ? ` (was averaging ${Math.round(mean(prior))})`
          : "";
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
