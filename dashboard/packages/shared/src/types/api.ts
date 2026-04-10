import type { ActivityDay } from "./activity.js";
import type { SleepDay } from "./sleep.js";
import type { HeartRateDay } from "./heartRate.js";
import type { WeightEntry } from "./weight.js";

export interface DateRangeParams {
  start: string;
  end: string;
}

export interface SparklineData {
  date: string;
  value: number | null;
}

export interface HealthSummary {
  activity: {
    latest: ActivityDay | null;
    sparkline: SparklineData[];
  };
  sleep: {
    latest: SleepDay | null;
    sparkline: SparklineData[];
  };
  heartRate: {
    latest: HeartRateDay | null;
    sparkline: SparklineData[];
  };
  weight: {
    latest: WeightEntry | null;
    sparkline: SparklineData[];
  };
}
