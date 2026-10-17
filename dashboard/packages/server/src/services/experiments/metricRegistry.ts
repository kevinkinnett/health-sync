import type { BetterDirection, MetricProvenance } from "@health-dashboard/shared";

/**
 * The metrics a before/after report compares, and which way is better for
 * each.
 *
 * `betterDirection` is domain knowledge that cannot be inferred from the
 * numbers: resting heart rate falling is good, sleep duration falling is
 * not. Without it the report can say "this moved" but never "this
 * improved", which is the thing worth knowing.
 *
 * Adding a metric is one entry here plus one extractor in the series
 * source — no change to the engine.
 */
export interface MetricSpec {
  key: string;
  label: string;
  unit: string;
  betterDirection: BetterDirection;
  /**
   * A shift smaller than this is noise for this metric regardless of what
   * the effect size says — it keeps the report from announcing a 0.4 bpm
   * "improvement" in resting heart rate.
   */
  minMeaningfulDelta: number;
  /**
   * True for totals that build up over the day (steps, active minutes).
   * Today's row for these is half-observed, so it is left out of an
   * after window that runs to today. Overnight metrics dated today are
   * already complete and keep it.
   */
  accumulatesThroughDay?: boolean;
}

export const METRIC_SPECS: MetricSpec[] = [
  // Sleep
  { key: "sleepMin", label: "Time asleep", unit: "min", betterDirection: "up", minMeaningfulDelta: 10 },
  { key: "inBedMin", label: "Time in bed", unit: "min", betterDirection: "up", minMeaningfulDelta: 10 },
  { key: "efficiency", label: "Sleep efficiency", unit: "%", betterDirection: "up", minMeaningfulDelta: 1 },
  { key: "wakeMin", label: "Awake in bed", unit: "min", betterDirection: "down", minMeaningfulDelta: 5 },
  { key: "deepMin", label: "Deep sleep", unit: "min", betterDirection: "up", minMeaningfulDelta: 5 },
  { key: "remMin", label: "REM sleep", unit: "min", betterDirection: "up", minMeaningfulDelta: 5 },
  // Recovery
  { key: "restingHr", label: "Resting heart rate", unit: "bpm", betterDirection: "down", minMeaningfulDelta: 1 },
  { key: "dailyRmssd", label: "HRV (RMSSD)", unit: "ms", betterDirection: "up", minMeaningfulDelta: 2 },
  // Activity
  { key: "steps", label: "Steps", unit: "steps", betterDirection: "up", minMeaningfulDelta: 500, accumulatesThroughDay: true },
  { key: "activeMinutes", label: "Active minutes", unit: "min", betterDirection: "up", minMeaningfulDelta: 5, accumulatesThroughDay: true },
];

export function specFor(metric: string): MetricSpec | undefined {
  return METRIC_SPECS.find((s) => s.key === metric);
}

export interface DailyPoint {
  date: string;
  value: number;
  provenance?: MetricProvenance;
}

/**
 * Supplies a daily series for one metric over a date range.
 *
 * The engine depends on this port rather than on `HealthDataService`, so
 * it can be driven from fixtures in tests and so a future source (a new
 * device, a derived metric) is a new implementation rather than an edit.
 */
export interface DailySeriesSource {
  fetch(metric: string, start: string, end: string): Promise<DailyPoint[]>;
  /**
   * Optional batch form: every listed metric over one range. A source
   * whose metrics share storage (six sleep metrics, one sleep table)
   * should implement it so a report reads each table once per window
   * rather than once per metric. Missing metrics map to `[]`.
   */
  fetchMany?(metrics: string[], start: string, end: string): Promise<Map<string, DailyPoint[]>>;
}
