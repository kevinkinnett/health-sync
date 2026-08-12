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
  /** Completed activity days contributing to this weekday bucket. */
  samples: number;
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
  /** Completed activity days used for the weekday-pattern averages. */
  dayOfWeekDays: number;
  highlights: Highlight[];
}
