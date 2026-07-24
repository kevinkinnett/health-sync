import type {
  ActivityDay,
  DayOfWeekAvg,
  Highlight,
  MetricComparison,
  SleepDay,
  WeeklyInsights,
} from "@health-dashboard/shared";
import type { ActivityRepository } from "../../repositories/activityRepo.js";
import type { SleepRepository } from "../../repositories/sleepRepo.js";
import type { HeartRateRepository } from "../../repositories/heartRateRepo.js";
import { avg } from "../stats.js";
import { addDays } from "../userTz.js";
import { DAY_NAMES, computeDayOfWeek, dowOf } from "./dayOfWeek.js";

/** Week-over-week deltas plus the narrative call-outs above the charts. */
export class WeeklyInsightsService {
  constructor(
    private activityRepo: ActivityRepository,
    private sleepRepo: SleepRepository,
    private heartRateRepo: HeartRateRepository,
  ) {}

  async getWeeklyInsights(): Promise<WeeklyInsights> {
    // Fetch last 90 days of activity for day-of-week patterns
    const allActivity = await this.activityRepo.findLatest(90);
    if (allActivity.length === 0) {
      throw new Error("No activity data available");
    }

    // allActivity is DESC — latest first
    const latestDate = allActivity[0].date;
    const currentEnd = latestDate;
    const currentStart = addDays(latestDate, -6);
    const previousEnd = addDays(latestDate, -7);
    const previousStart = addDays(latestDate, -13);

    const inRange = <T extends { date: string }>(rows: T[], from: string, to: string) =>
      rows.filter((d) => d.date >= from && d.date <= to);

    const currentActivity = inRange(allActivity, currentStart, currentEnd);
    const previousActivity = inRange(allActivity, previousStart, previousEnd);

    // Fetch sleep + HR for both weeks in one call each
    const [sleepData, hrData] = await Promise.all([
      this.sleepRepo.findByDateRange(previousStart, currentEnd),
      this.heartRateRepo.findByDateRange(previousStart, currentEnd),
    ]);

    const currentSleep = inRange(sleepData, currentStart, currentEnd);
    const previousSleep = inRange(sleepData, previousStart, previousEnd);
    const currentHr = inRange(hrData, currentStart, currentEnd);
    const previousHr = inRange(hrData, previousStart, previousEnd);

    const activeMinutesOf = (d: ActivityDay) =>
      (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0);

    // Compute metric comparisons
    const steps = compareMetric(
      currentActivity.map((d) => d.steps),
      previousActivity.map((d) => d.steps),
    );
    const activeMinutes = compareMetric(
      currentActivity.map(activeMinutesOf),
      previousActivity.map(activeMinutesOf),
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

    /** Both weeks must have data, else the delta is meaningless. */
    const compareIfBoth = <T>(
      current: T[],
      previous: T[],
      pick: (d: T) => number | null,
    ): MetricComparison | null =>
      current.length > 0 && previous.length > 0
        ? compareMetric(current.map(pick), previous.map(pick))
        : null;

    const sleep = compareIfBoth(currentSleep, previousSleep, (d) => d.totalMinutesAsleep);
    const sleepEfficiency = compareIfBoth(currentSleep, previousSleep, (d) => d.efficiency);
    const restingHr = compareIfBoth(currentHr, previousHr, (d) => d.restingHeartRate);

    // Day-of-week patterns from all available data, rotated so the bars
    // line up with the rolling current-period window (period start on the
    // left, period end on the right). Without this the chart reads in
    // fixed Sun→Sat calendar order even though the date-range pill shows a
    // rolling Tue→Mon (or whichever) window — the visual mismatch reads
    // like a bug to anyone scanning quickly.
    const dayOfWeek = computeDayOfWeek(allActivity, dowOf(currentStart));

    const highlights = generateHighlights(
      currentActivity,
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

export function compareMetric(
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

export function generateHighlights(
  currentActivity: ActivityDay[],
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
    highlights.push({
      kind: "neutral",
      text: `Best day: ${DAY_NAMES[dowOf(bestDay.date)]} with ${bestDay.steps?.toLocaleString()} steps`,
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
    const avgSleep = avg(currentSleep.map((d) => d.totalMinutesAsleep));
    const hours = Math.floor(avgSleep / 60);
    const mins = Math.round(avgSleep % 60);
    highlights.push({
      kind: avgSleep >= 420 ? "positive" : "negative",
      text: `Avg ${hours}h ${mins}m sleep this week`,
    });
  }

  return highlights;
}
