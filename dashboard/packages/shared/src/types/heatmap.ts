export interface DayOfWeekHeatmapRow {
  metric: string;
  label: string;
  unit: string;
  values: (number | null)[];
  min: number;
  max: number;
}

export interface DayOfWeekHeatmapData {
  dayNames: string[];
  rows: DayOfWeekHeatmapRow[];
  totalDays: number;
  dayCounts: number[];
}
