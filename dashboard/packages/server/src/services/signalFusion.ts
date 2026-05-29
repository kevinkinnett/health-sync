/**
 * Sensor fusion for the recovery signals.
 *
 * Fitbit (wrist) and Eight Sleep (mattress) both measure HRV, resting HR,
 * breathing, and sleep. This combines them into one z per signal without
 * letting either source dominate.
 *
 * Method (grounded in this user's 28-night overlap analysis):
 *   1. z-score EACH source against its OWN trailing baseline — this erases
 *      inter-device bias + scale differences automatically (no calibration).
 *   2. weighted-average the per-source z's via SOURCE_WEIGHTS, renormalized
 *      over whichever sources are actually present that day.
 *
 * Why per-signal weights (not 50/50 everywhere):
 *   - HRV agreed almost perfectly across sensors (r=0.91) → 50/50, pure
 *     noise reduction.
 *   - Fitbit's resting-HR is heavily smoothed (SD 1.8) while Eight Sleep's
 *     is ~2.6x more dynamic (SD 4.7), catching rough nights Fitbit flattens
 *     → HR leans on Eight Sleep (0.65). We weighted-AVERAGE rather than
 *     "take the worse reading" to avoid a pessimism bias that cries wolf.
 *   - SpO2 is Fitbit-only (Eight Sleep doesn't measure it).
 */

export type ReadinessSource = "fitbit" | "eightSleep";

/** A metric's raw value per source for a single day (null = missing). */
export type SourceValues = Partial<Record<ReadinessSource, number | null>>;

/** Signals measured by more than one source (fused). */
export type FusibleMetric = "hrv" | "rhr" | "sleep" | "breathing" | "spo2";

export const SOURCE_LABELS: Record<ReadinessSource, string> = {
  fitbit: "Fitbit",
  eightSleep: "Eight Sleep",
};

export const SOURCE_WEIGHTS: Record<
  FusibleMetric,
  Partial<Record<ReadinessSource, number>>
> = {
  hrv: { fitbit: 0.5, eightSleep: 0.5 },
  rhr: { fitbit: 0.35, eightSleep: 0.65 },
  sleep: { fitbit: 0.5, eightSleep: 0.5 },
  breathing: { fitbit: 0.5, eightSleep: 0.5 },
  spo2: { fitbit: 1.0 },
};

/** |z| gap between two sources we flag to the user as a disagreement. */
export const DISAGREE_THRESHOLD = 1.0;

export interface PerSourceZ {
  source: ReadinessSource;
  label: string;
  z: number;
}

export interface FusedMetric {
  /** Fused (unsigned) z; null if no source had enough baseline. */
  z: number | null;
  /** Weighted-mean raw value across present sources (for display). */
  value: number | null;
  /** Mean baseline across present sources (for display). */
  baseline: number | null;
  perSource: PerSourceZ[];
  /** ≥2 sources present and their z's diverge by > DISAGREE_THRESHOLD. */
  disagreement: boolean;
  baselineDays: number;
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
    const today = todays[src];
    const base = window[src] ?? [];
    if (today == null || base.length < opts.minBaselineDays) continue;
    const m = mean(base);
    const s = std(base, m);
    const z = s > 0 ? clamp((today - m) / s, -opts.zClamp, opts.zClamp) : 0;
    perSource.push({ source: src, label: SOURCE_LABELS[src], z: round2(z) });
    weightedZ += w * z;
    weightSum += w;
    rawValues.push(today * w);
    valueWeights.push(w);
    baselines.push(m);
    maxBaselineDays = Math.max(maxBaselineDays, base.length);
  }

  if (weightSum === 0) {
    return {
      z: null,
      value: null,
      baseline: null,
      perSource: [],
      disagreement: false,
      baselineDays: 0,
    };
  }

  const zs = perSource.map((p) => p.z);
  const disagreement =
    perSource.length >= 2 && Math.max(...zs) - Math.min(...zs) > DISAGREE_THRESHOLD;

  return {
    z: weightedZ / weightSum,
    value: rawValues.reduce((a, b) => a + b, 0) / valueWeights.reduce((a, b) => a + b, 0),
    baseline: mean(baselines),
    perSource,
    disagreement,
    baselineDays: maxBaselineDays,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
