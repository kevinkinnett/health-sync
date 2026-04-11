import type {
  HealthSummary,
  SparklineData,
  WeeklyInsights,
  MetricComparison,
  DayOfWeekAvg,
  Highlight,
  ActivityDay,
  SleepDay,
  HeartRateDay,
} from "@health-dashboard/shared";
import type { ActivityRepository } from "../repositories/activityRepo.js";
import type { SleepRepository } from "../repositories/sleepRepo.js";
import type { HeartRateRepository } from "../repositories/heartRateRepo.js";
import type { WeightRepository } from "../repositories/weightRepo.js";
import type { HrvRepository } from "../repositories/hrvRepo.js";
import type { ExerciseLogRepository } from "../repositories/exerciseLogRepo.js";

export class HealthDataService {
  constructor(
    private activityRepo: ActivityRepository,
    private sleepRepo: SleepRepository,
    private heartRateRepo: HeartRateRepository,
    private weightRepo: WeightRepository,
    private hrvRepo: HrvRepository,
    private exerciseLogRepo: ExerciseLogRepository,
  ) {}

  async getSummary(): Promise<HealthSummary> {
    const [activity, sleep, heartRate, weight] = await Promise.all([
      this.activityRepo.findLatest(8),
      this.sleepRepo.findLatest(8),
      this.heartRateRepo.findLatest(8),
      this.weightRepo.findLatest(8),
    ]);

    return {
      activity: {
        latest: activity[0] ?? null,
        sparkline: activity
          .slice(0, 7)
          .reverse()
          .map((d): SparklineData => ({ date: d.date, value: d.steps })),
      },
      sleep: {
        latest: sleep[0] ?? null,
        sparkline: sleep
          .slice(0, 7)
          .reverse()
          .map((d): SparklineData => ({
            date: d.date,
            value: d.totalMinutesAsleep != null ? Math.round(d.totalMinutesAsleep / 60 * 10) / 10 : null,
          })),
      },
      heartRate: {
        latest: heartRate[0] ?? null,
        sparkline: heartRate
          .slice(0, 7)
          .reverse()
          .map((d): SparklineData => ({ date: d.date, value: d.restingHeartRate })),
      },
      weight: {
        latest: weight[0] ?? null,
        sparkline: weight
          .slice(0, 7)
          .reverse()
          .map((d): SparklineData => ({ date: d.date, value: d.weightKg })),
      },
    };
  }

  async getActivity(start: string, end: string) {
    return this.activityRepo.findByDateRange(start, end);
  }

  async getSleep(start: string, end: string) {
    return this.sleepRepo.findByDateRange(start, end);
  }

  async getHeartRate(start: string, end: string) {
    return this.heartRateRepo.findByDateRange(start, end);
  }

  async getWeight(start: string, end: string) {
    return this.weightRepo.findByDateRange(start, end);
  }

  async getHrv(start: string, end: string) {
    return this.hrvRepo.findByDateRange(start, end);
  }

  async getExerciseLogs(start: string, end: string) {
    return this.exerciseLogRepo.findByDateRange(start, end);
  }

  async getWeeklyInsights(): Promise<WeeklyInsights> {
    // Fetch last 90 days of activity for day-of-week patterns
    const allActivity = await this.activityRepo.findLatest(90);
    if (allActivity.length === 0) {
      throw new Error("No activity data available");
    }

    // allActivity is DESC — latest first
    const latestDate = allActivity[0].date;
    const currentEnd = latestDate;
    const currentStart = shiftDate(latestDate, -6);
    const previousEnd = shiftDate(latestDate, -7);
    const previousStart = shiftDate(latestDate, -13);

    const currentActivity = allActivity.filter(
      (d) => d.date >= currentStart && d.date <= currentEnd,
    );
    const previousActivity = allActivity.filter(
      (d) => d.date >= previousStart && d.date <= previousEnd,
    );

    // Fetch sleep + HR for both weeks in one call each
    const [sleepData, hrData] = await Promise.all([
      this.sleepRepo.findByDateRange(previousStart, currentEnd),
      this.heartRateRepo.findByDateRange(previousStart, currentEnd),
    ]);

    const currentSleep = sleepData.filter(
      (d) => d.date >= currentStart && d.date <= currentEnd,
    );
    const previousSleep = sleepData.filter(
      (d) => d.date >= previousStart && d.date <= previousEnd,
    );
    const currentHr = hrData.filter(
      (d) => d.date >= currentStart && d.date <= currentEnd,
    );
    const previousHr = hrData.filter(
      (d) => d.date >= previousStart && d.date <= previousEnd,
    );

    // Compute metric comparisons
    const steps = compareMetric(
      currentActivity.map((d) => d.steps),
      previousActivity.map((d) => d.steps),
    );
    const activeMinutes = compareMetric(
      currentActivity.map(
        (d) => (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0),
      ),
      previousActivity.map(
        (d) => (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0),
      ),
    );
    const distance = compareMetric(
      currentActivity.map((d) => d.distanceKm),
      previousActivity.map((d) => d.distanceKm),
      2,
    );
    const calories = compareMetric(
      currentActivity.map((d) => d.caloriesOut),
      previousActivity.map((d) => d.caloriesOut),
    );

    const sleep =
      currentSleep.length > 0 && previousSleep.length > 0
        ? compareMetric(
            currentSleep.map((d) => d.totalMinutesAsleep),
            previousSleep.map((d) => d.totalMinutesAsleep),
          )
        : null;

    const sleepEfficiency =
      currentSleep.length > 0 && previousSleep.length > 0
        ? compareMetric(
            currentSleep.map((d) => d.efficiency),
            previousSleep.map((d) => d.efficiency),
          )
        : null;

    const restingHr =
      currentHr.length > 0 && previousHr.length > 0
        ? compareMetric(
            currentHr.map((d) => d.restingHeartRate),
            previousHr.map((d) => d.restingHeartRate),
          )
        : null;

    // Day-of-week patterns from all available data
    const dayOfWeek = computeDayOfWeek(allActivity);

    // Generate highlights
    const highlights = generateHighlights(
      currentActivity,
      previousActivity,
      currentSleep,
      steps,
      activeMinutes,
      dayOfWeek,
    );

    return {
      currentPeriod: { start: currentStart, end: currentEnd },
      previousPeriod: { start: previousStart, end: previousEnd },
      steps,
      activeMinutes,
      distance,
      calories,
      sleep,
      sleepEfficiency,
      restingHr,
      dayOfWeek,
      highlights,
    };
  }
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function avg(values: (number | null)[]): number {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function compareMetric(
  current: (number | null)[],
  previous: (number | null)[],
  decimals = 0,
): MetricComparison {
  const factor = 10 ** decimals;
  const c = Math.round(avg(current) * factor) / factor;
  const p = Math.round(avg(previous) * factor) / factor;
  const changePercent = p === 0 ? 0 : Math.round(((c - p) / p) * 100);
  return { current: c, previous: p, changePercent };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function computeDayOfWeek(activity: ActivityDay[]): DayOfWeekAvg[] {
  const buckets: { steps: number[]; active: number[] }[] = Array.from(
    { length: 7 },
    () => ({ steps: [], active: [] }),
  );

  for (const d of activity) {
    if (d.steps == null) continue;
    const dow = new Date(d.date + "T00:00:00Z").getUTCDay();
    buckets[dow].steps.push(d.steps);
    buckets[dow].active.push(
      (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0),
    );
  }

  return buckets.map((b, i) => ({
    dow: i,
    dayName: DAY_NAMES[i],
    avgSteps: Math.round(avg(b.steps)),
    avgActiveMinutes: Math.round(avg(b.active)),
  }));
}

function generateHighlights(
  currentActivity: ActivityDay[],
  _previousActivity: ActivityDay[],
  currentSleep: SleepDay[],
  steps: MetricComparison,
  activeMinutes: MetricComparison,
  dayOfWeek: DayOfWeekAvg[],
): Highlight[] {
  const highlights: Highlight[] = [];

  // Steps trend
  if (steps.changePercent >= 10) {
    highlights.push({
      kind: "positive",
      text: `Steps up ${steps.changePercent}% vs last week`,
    });
  } else if (steps.changePercent <= -10) {
    highlights.push({
      kind: "negative",
      text: `Steps down ${Math.abs(steps.changePercent)}% vs last week`,
    });
  }

  // Active minutes trend
  if (activeMinutes.changePercent >= 20) {
    highlights.push({
      kind: "positive",
      text: `Active minutes up ${activeMinutes.changePercent}%`,
    });
  } else if (activeMinutes.changePercent <= -20) {
    highlights.push({
      kind: "negative",
      text: `Active minutes down ${Math.abs(activeMinutes.changePercent)}%`,
    });
  }

  // Best step day this week
  const bestDay = [...currentActivity]
    .filter((d) => d.steps != null)
    .sort((a, b) => (b.steps ?? 0) - (a.steps ?? 0))[0];
  if (bestDay) {
    const dayName =
      DAY_NAMES[new Date(bestDay.date + "T00:00:00Z").getUTCDay()];
    highlights.push({
      kind: "neutral",
      text: `Best day: ${dayName} with ${bestDay.steps?.toLocaleString()} steps`,
    });
  }

  // Strongest day-of-week pattern
  const sorted = [...dayOfWeek].sort((a, b) => b.avgSteps - a.avgSteps);
  if (sorted.length > 0 && sorted[0].avgSteps > 0) {
    highlights.push({
      kind: "neutral",
      text: `${sorted[0].dayName}s are your most active day (${sorted[0].avgSteps.toLocaleString()} avg steps)`,
    });
  }

  // Sleep insight
  if (currentSleep.length > 0) {
    const avgSleep = avg(
      currentSleep.map((d) => d.totalMinutesAsleep),
    );
    const hours = Math.floor(avgSleep / 60);
    const mins = Math.round(avgSleep % 60);
    highlights.push({
      kind: avgSleep >= 420 ? "positive" : "negative",
      text: `Avg ${hours}h ${mins}m sleep this week`,
    });
  }

  return highlights;
}
