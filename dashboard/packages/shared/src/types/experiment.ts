/**
 * The "did it work?" report: a before/after comparison anchored on an
 * intervention.
 *
 * This is the shape the dashboard was missing. Every analysis it could
 * previously run was a continuous correlation, but the questions people
 * actually ask about their own health are changepoint questions — "I
 * changed X on this date; did anything move?"
 *
 * Deliberately NOT reported: a p-value. Daily health metrics are strongly
 * autocorrelated (today's resting HR is not independent of yesterday's),
 * which violates the independence assumption of the obvious tests and
 * would make any p-value look far more decisive than the evidence
 * warrants. Effect size, sample sizes, spread and an explicit confounds
 * list carry the uncertainty honestly instead. See `ExperimentConfidence`.
 */

export interface ExperimentWindow {
  start: string;
  end: string;
  /** Calendar days in the window. */
  days: number;
  /** Days that actually carried a reading, across all metrics. */
  observedDays: number;
}

export type EffectDirection = "up" | "down" | "flat";

/** Which way is an improvement for this metric — RHR down, sleep up. */
export type BetterDirection = "up" | "down";

export interface MetricEffect {
  metric: string;
  label: string;
  unit: string;
  betterDirection: BetterDirection;
  before: { n: number; mean: number; sd: number };
  after: { n: number; mean: number; sd: number };
  /** after.mean − before.mean, in the metric's unit. */
  delta: number;
  /** Percentage change vs the before mean; null when before mean is 0. */
  deltaPct: number | null;
  direction: EffectDirection;
  /**
   * Standardized mean difference (Cohen's d) against the pooled SD.
   * Null when either side has too little data to estimate spread.
   * Rules of thumb: 0.2 small, 0.5 medium, 0.8 large.
   */
  effectSize: number | null;
  /** True when the change moved in this metric's better direction. */
  improved: boolean;
  /** Whether the shift is large relative to the metric's own variability. */
  meaningful: boolean;
}

export type ConfoundKind =
  | "nearby_intervention"
  | "measurement_change"
  | "short_window"
  | "sparse_data"
  | "overlapping_window";

export type ConfoundSeverity = "high" | "medium" | "low";

export interface Confound {
  kind: ConfoundKind;
  severity: ConfoundSeverity;
  /** Plain-language explanation of what could be producing the effect. */
  detail: string;
  /** The date the confound sits on, when it has one. */
  date?: string;
}

/**
 * How much weight the report deserves.
 *  - `strong`       — long windows, dense data, no serious confound
 *  - `moderate`     — usable, but something is imperfect
 *  - `weak`         — a serious confound or a very short window
 *  - `insufficient` — not enough data to say anything
 */
export type ExperimentConfidence =
  | "strong"
  | "moderate"
  | "weak"
  | "insufficient";

export interface ExperimentReport {
  interventionId: number;
  interventionName: string;
  /** The date the comparison pivots on (the intervention's start). */
  changepoint: string;
  before: ExperimentWindow;
  after: ExperimentWindow;
  metrics: MetricEffect[];
  confounds: Confound[];
  confidence: ExperimentConfidence;
  /** One-line plain-language summary, safe to show on its own. */
  summary: string;
}
