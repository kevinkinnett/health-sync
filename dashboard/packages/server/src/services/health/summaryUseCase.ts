import type {
  ActivityDay,
  HealthSummary,
  HeartRateDay,
  SleepDay,
  SparklineData,
  WeightEntry,
} from "@health-dashboard/shared";

export interface LatestReader<T> {
  findLatest(limit: number): Promise<T[]>;
}

/** Builds the Today summary from only the four latest-series capabilities. */
export class SummaryUseCase {
  constructor(
    private activity: LatestReader<ActivityDay>,
    private sleep: LatestReader<SleepDay>,
    private heartRate: LatestReader<HeartRateDay>,
    private weight: LatestReader<WeightEntry>,
  ) {}

  async execute(): Promise<HealthSummary> {
    const [activity, sleep, heartRate, weight] = await Promise.all([
      this.activity.findLatest(8),
      this.sleep.findLatest(8),
      this.heartRate.findLatest(8),
      this.weight.findLatest(8),
    ]);
    return {
      activity: {
        latest: activity[0] ?? null,
        sparkline: activity.slice(0, 7).reverse()
          .map((d): SparklineData => ({ date: d.date, value: d.steps })),
      },
      sleep: {
        latest: sleep[0] ?? null,
        sparkline: sleep.slice(0, 7).reverse().map((d): SparklineData => ({
          date: d.date,
          value: d.totalMinutesAsleep != null
            ? Math.round((d.totalMinutesAsleep / 60) * 10) / 10
            : null,
        })),
      },
      heartRate: {
        latest: heartRate[0] ?? null,
        sparkline: heartRate.slice(0, 7).reverse()
          .map((d): SparklineData => ({ date: d.date, value: d.restingHeartRate })),
      },
      weight: {
        latest: weight[0] ?? null,
        sparkline: weight.slice(0, 7).reverse()
          .map((d): SparklineData => ({ date: d.date, value: d.weightKg })),
      },
    };
  }
}
