export interface MetricComparison {
  current: number;
  previous: number;
  changePercent: number;
}

export interface DayOfWeekAvg {
  dow: number;
  dayName: string;
  avgSteps: number;
  avgActiveMinutes: number;
}

export interface Highlight {
  kind: "positive" | "negative" | "neutral";
  text: string;
}

export interface WeeklyInsights {
  currentPeriod: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  steps: MetricComparison;
  activeMinutes: MetricComparison;
  distance: MetricComparison;
  calories: MetricComparison;
  sleep: MetricComparison | null;
  sleepEfficiency: MetricComparison | null;
  restingHr: MetricComparison | null;
  dayOfWeek: DayOfWeekAvg[];
  highlights: Highlight[];
}
