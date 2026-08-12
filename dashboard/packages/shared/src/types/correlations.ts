export interface CorrelationPair {
  xMetric: string;
  yMetric: string;
  xLabel: string;
  yLabel: string;
  correlation: number;
  points: { x: number; y: number; date: string }[];
  insight: string;
  /**
   * Day offset between the two series: y is sampled `lagDays` days AFTER
   * x (0/omitted = same-day pair). Lag-1 pairs answer "does today's X
   * affect tomorrow's Y?" — e.g. time in car today vs next-day readiness.
   * `points[].date` is always the X day.
   */
  lagDays?: number;
}

export interface ActivityBucket {
  label: string;
  days: number;
  avgSleepMin: number;
  avgDeepMin: number;
  avgEfficiency: number;
}

export interface CorrelationsData {
  pairs: CorrelationPair[];
  activitySleepBuckets: ActivityBucket[];
  dataPoints: number;
  /** The completed local-day window actually represented by the series. */
  window?: { start: string | null; end: string | null };
  /** Current local date deliberately omitted because it may still be partial. */
  excludedCurrentDate?: string;
  /** Latest like-for-like measurement regimes used for regime-sensitive signals. */
  measurementRegimes?: {
    sleep: string | null;
    hrv: string | null;
  };
}
