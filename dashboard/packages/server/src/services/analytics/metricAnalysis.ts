import type { IntakeCorrelations } from "@health-dashboard/shared";
import type {
  ActivitySeriesPort,
  HeartRateSeriesPort,
  HrvSeriesPort,
  SleepSeriesPort,
} from "./ports.js";
import { describeCorrelation, pearson } from "../stats.js";

export const MIN_PAIR_DAYS = 7;

export interface DailyMetricSeries {
  metric: IntakeCorrelations["pairs"][number]["metric"];
  label: string;
  humanLabel: string;
  values: Map<string, number>;
}

/** Loads and interprets the canonical daily metric series used by intake analysis. */
export class DailyMetricAnalysis {
  constructor(
    private readonly activityRepo: ActivitySeriesPort,
    private readonly sleepRepo: SleepSeriesPort,
    private readonly heartRateRepo: HeartRateSeriesPort,
    private readonly hrvRepo: HrvSeriesPort,
  ) {}

  async load(start: string, end: string): Promise<DailyMetricSeries[]> {
    const [activity, sleep, heartRate, hrv] = await Promise.all([
      this.activityRepo.findByDateRange(start, end),
      this.sleepRepo.findByDateRange(start, end),
      this.heartRateRepo.findByDateRange(start, end),
      this.hrvRepo.findByDateRange(start, end),
    ]);
    return [
      {
        metric: "steps",
        label: "Steps",
        humanLabel: "steps",
        values: numericSeries(activity, "date", "steps"),
      },
      {
        metric: "sleepMin",
        label: "Sleep (min)",
        humanLabel: "sleep duration",
        values: numericSeries(sleep, "date", "totalMinutesAsleep"),
      },
      {
        metric: "deepMin",
        label: "Deep Sleep (min)",
        humanLabel: "deep sleep",
        values: numericSeries(sleep, "date", "minutesDeep"),
      },
      {
        metric: "restingHr",
        label: "Resting HR (bpm)",
        humanLabel: "resting heart rate",
        values: numericSeries(heartRate, "date", "restingHeartRate"),
      },
      {
        metric: "dailyRmssd",
        label: "HRV (RMSSD)",
        humanLabel: "daily HRV",
        values: numericSeries(hrv, "date", "dailyRmssd"),
      },
    ];
  }

  async correlate(
    intakeDays: Map<string, number>,
    itemName: string,
    xLabel: string,
  ): Promise<IntakeCorrelations["pairs"]> {
    if (intakeDays.size === 0) return [];
    const dates = [...intakeDays.keys()].sort();
    const series = await this.load(dates[0], dates[dates.length - 1]);
    const pairs: IntakeCorrelations["pairs"] = [];

    for (const metric of series) {
      const xs: number[] = [];
      const ys: number[] = [];
      const points: Array<{ x: number; y: number; date: string }> = [];
      for (const [date, dose] of intakeDays) {
        const value = metric.values.get(date);
        if (value == null) continue;
        xs.push(dose);
        ys.push(value);
        points.push({ x: dose, y: value, date });
      }
      if (xs.length < MIN_PAIR_DAYS) continue;
      const correlation = new Set(xs).size < 2 ? null : pearson(xs, ys);
      pairs.push({
        metric: metric.metric,
        metricLabel: metric.label,
        xLabel,
        correlation,
        n: xs.length,
        points: points.sort((a, b) => a.date.localeCompare(b.date)),
        insight:
          correlation === null
            ? `${itemName} was logged every joined day at the same dose — ` +
              `there's no variation to correlate against ${metric.humanLabel}. ` +
              `A dose change or skipped days is what makes this comparison meaningful.`
            : describeCorrelation(correlation, itemName, metric.humanLabel),
      });
    }
    return pairs;
  }
}

export function joinPearson(
  doseDays: Map<string, number>,
  values: Map<string, number>,
): { r: number | null; n: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [date, dose] of doseDays) {
    const value = values.get(date);
    if (value == null) continue;
    xs.push(dose);
    ys.push(value);
  }
  const n = xs.length;
  if (n < MIN_PAIR_DAYS || new Set(xs).size < 2) return { r: null, n };
  return { r: pearson(xs, ys), n };
}

function numericSeries<T>(
  rows: T[],
  dateKey: keyof T,
  valueKey: keyof T,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const value = row[valueKey];
    if (value == null) continue;
    out.set(row[dateKey] as unknown as string, Number(value));
  }
  return out;
}
