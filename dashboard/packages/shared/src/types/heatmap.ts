/**
 * One metric's day-of-week series for the heatmap — seven values
 * (Mon..Sun) sharing a single colour scale derived from `min`/`max`.
 * `unit` drives the formatter (km vs minutes vs bpm…).
 *
 * Renamed from the old `DayOfWeekHeatmapRow`: it's the per-metric
 * data behind a row, not a DB row.
 */
export interface DayOfWeekHeatmapMetric {
  metric: string;
  label: string;
  unit: string;
  values: (number | null)[];
  min: number;
  max: number;
}

export interface DayOfWeekHeatmapData {
  dayNames: string[];
  /** One entry per metric — rendered as one table row each. */
  rows: DayOfWeekHeatmapMetric[];
  totalDays: number;
  dayCounts: number[];
}
