/**
 * Sensor fusion for the recovery signals.
 *
 * A Fitbit wrist device and an Eight Sleep mattress both measure HRV,
 * resting HR, breathing, and sleep. Fitbit measurements arrive through the
 * Google Health API; that transport detail is deliberately separate from the
 * physical sensor identity used by this model.
 *
 * Method:
 *   1. z-score EACH source against its OWN trailing baseline — this erases
 *      inter-device bias + scale differences automatically (no calibration).
 *   2. weighted-average the per-source z's via SOURCE_WEIGHTS, renormalized
 *      over whichever sources are actually present that day.
 *
 * Source weights remain deliberately conservative until outcome-based
 * calibration is rerun on repaired main-session history. Related-but-unlike
 * raw definitions are never averaged; only their source-relative z trends
 * may contribute to the same recovery domain.
 */

import type { ReadinessSourceProvenance } from "@health-dashboard/shared";

/** Physical sensor identity used by the fusion model. */
export type ReadinessSource = "fitbit" | "eightSleep";

export interface SourceReading {
  value: number | null;
  /** Human-readable definition of what the source actually measured. */
  measurement: string;
  /** Comparable readings share a group; unlike groups are never raw-averaged. */
  comparisonGroup: string;
  /** Algorithm/provider regime. Baselines only use matching regimes. */
  regime: string;
}

export type SourceValue = number | SourceReading | null;
/** A metric's raw observation per source for one local wake date. */
export type SourceValues = Partial<Record<ReadinessSource, SourceValue>>;

/** Signals measured by more than one source (fused). */
export type FusibleMetric = "hrv" | "rhr" | "sleep" | "breathing" | "spo2";

export const SOURCE_PROVENANCE: Record<
  ReadinessSource,
  ReadinessSourceProvenance
> = {
  fitbit: {
    device: "fitbit",
    deviceLabel: "Fitbit device",
    provider: "google_health",
    providerLabel: "Google Health",
  },
  eightSleep: {
    device: "eight_sleep",
    deviceLabel: "Eight Sleep",
    provider: "eight_sleep",
    providerLabel: "Eight Sleep",
  },
};

/** Additive compatibility field for clients cached before provenance existed. */
export const SOURCE_LABELS: Record<ReadinessSource, string> = {
  fitbit: "Fitbit",
  eightSleep: "Eight Sleep",
};

export const SOURCE_WEIGHTS: Record<
  FusibleMetric,
  Partial<Record<ReadinessSource, number>>
> = {
  hrv: { fitbit: 0.5, eightSleep: 0.5 },
  // Equal until outcome-based calibration is rerun on repaired main sessions.
  rhr: { fitbit: 0.5, eightSleep: 0.5 },
  sleep: { fitbit: 0.5, eightSleep: 0.5 },
  breathing: { fitbit: 0.5, eightSleep: 0.5 },
  spo2: { fitbit: 1.0 },
};

/** Metric-specific z gaps; one universal threshold hid different noise floors. */
export const DISAGREE_THRESHOLDS: Record<FusibleMetric, number> = {
  hrv: 1.25,
  rhr: 1.5,
  sleep: 1.0,
  breathing: 1.25,
  spo2: 1.0,
};

export interface PerSourceZ {
  source: ReadinessSource;
  label: string;
  provenance: ReadinessSourceProvenance;
  z: number;
  value: number;
  baseline: number;
  measurement: string;
  comparisonGroup: string;
  regime: string;
}

export interface FusedMetric {
  /** Fused (unsigned) z; null if no source had enough baseline. */
  z: number | null;
  /** Weighted-mean raw value only when present source definitions match. */
  value: number | null;
  /** Mean baseline across present sources (for display). */
  baseline: number | null;
  perSource: PerSourceZ[];
  /** At least two source trends diverge beyond this metric's noise floor. */
  disagreement: boolean;
  measurementComparable: boolean;
  disagreementThreshold: number;
  baselineDays: number;
}

const DEFAULT_READING: Record<
  FusibleMetric,
  Record<ReadinessSource, Omit<SourceReading, "value">>
> = {
  hrv: {
    fitbit: { measurement: "Overnight HRV (RMSSD)", comparisonGroup: "overnight_hrv_rmssd", regime: "default" },
    eightSleep: { measurement: "Overnight HRV (RMSSD)", comparisonGroup: "overnight_hrv_rmssd", regime: "default" },
  },
  rhr: {
    fitbit: { measurement: "Daily resting heart rate", comparisonGroup: "daily_resting_hr", regime: "default" },
    eightSleep: { measurement: "Average sleeping heart rate", comparisonGroup: "sleeping_hr", regime: "default" },
  },
  sleep: {
    fitbit: { measurement: "Main-session sleep duration", comparisonGroup: "main_sleep_duration", regime: "default" },
    eightSleep: { measurement: "Main-session sleep duration", comparisonGroup: "main_sleep_duration", regime: "default" },
  },
  breathing: {
    fitbit: { measurement: "Overnight respiratory rate", comparisonGroup: "overnight_breathing", regime: "default" },
    eightSleep: { measurement: "Overnight respiratory rate", comparisonGroup: "overnight_breathing", regime: "default" },
  },
  spo2: {
    fitbit: { measurement: "Overnight oxygen saturation", comparisonGroup: "overnight_spo2", regime: "default" },
    eightSleep: { measurement: "Overnight oxygen saturation", comparisonGroup: "overnight_spo2", regime: "default" },
  },
};

export function resolveReading(
  metric: FusibleMetric,
  source: ReadinessSource,
  input: SourceValue | undefined,
): SourceReading | null {
  if (input == null) return null;
  if (typeof input === "number") return { value: input, ...DEFAULT_READING[metric][source] };
  return input.value == null ? null : input;
}

export function sourceValue(input: SourceValue | undefined): number | null {
  if (input == null) return null;
  return typeof input === "number" ? input : input.value;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function std(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / xs.length);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Fuse one metric for one scored day.
 *
 * @param todays  the metric's per-source values on the scored day
 * @param window  per-source baseline series (raw values; nulls pre-filtered)
 */
export function fuseMetric(
  metric: FusibleMetric,
  todays: SourceValues,
  window: Partial<Record<ReadinessSource, number[]>>,
  opts: { minBaselineDays: number; zClamp: number },
): FusedMetric {
  const weights = SOURCE_WEIGHTS[metric];
  const perSource: PerSourceZ[] = [];
  const rawValues: number[] = [];
  const valueWeights: number[] = [];
  const baselines: number[] = [];
  let weightedZ = 0;
  let weightSum = 0;
  let maxBaselineDays = 0;

  for (const src of Object.keys(weights) as ReadinessSource[]) {
    const w = weights[src];
    if (!w) continue;
    const reading = resolveReading(metric, src, todays[src]);
    const today = reading?.value;
    const base = window[src] ?? [];
    if (today == null || !reading || base.length < opts.minBaselineDays) continue;
    const m = mean(base);
    const s = std(base, m);
    const z = s > 0 ? clamp((today - m) / s, -opts.zClamp, opts.zClamp) : 0;
    perSource.push({
      source: src,
      label: SOURCE_LABELS[src],
      provenance: SOURCE_PROVENANCE[src],
      z: round2(z),
      value: today,
      baseline: m,
      measurement: reading.measurement,
      comparisonGroup: reading.comparisonGroup,
      regime: reading.regime,
    });
    weightedZ += w * z;
    weightSum += w;
    rawValues.push(today * w);
    valueWeights.push(w);
    baselines.push(m * w);
    maxBaselineDays = Math.max(maxBaselineDays, base.length);
  }

  if (weightSum === 0) {
    return {
      z: null,
      value: null,
      baseline: null,
      perSource: [],
      disagreement: false,
      measurementComparable: true,
      disagreementThreshold: DISAGREE_THRESHOLDS[metric],
      baselineDays: 0,
    };
  }

  const zs = perSource.map((p) => p.z);
  const disagreementThreshold = DISAGREE_THRESHOLDS[metric];
  const disagreement = perSource.length >= 2 &&
    Math.max(...zs) - Math.min(...zs) > disagreementThreshold;
  const measurementComparable = new Set(perSource.map((p) => p.comparisonGroup)).size <= 1;

  return {
    z: weightedZ / weightSum,
    value: measurementComparable
      ? rawValues.reduce((a, b) => a + b, 0) / valueWeights.reduce((a, b) => a + b, 0)
      : null,
    baseline: measurementComparable
      ? baselines.reduce((a, b) => a + b, 0) / valueWeights.reduce((a, b) => a + b, 0)
      : null,
    perSource,
    disagreement,
    measurementComparable,
    disagreementThreshold,
    baselineDays: maxBaselineDays,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
