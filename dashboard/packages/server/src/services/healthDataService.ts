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
  CorrelationsData,
  CorrelationPair,
  ActivityBucket,
  DayOfWeekHeatmapData,
  DayOfWeekHeatmapRow,
  RecordsData,
  PersonalRecord,
  Streak,
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

  async getCorrelations(): Promise<CorrelationsData> {
    // Fetch all available data
    const [activity, sleep, heartRate] = await Promise.all([
      this.activityRepo.findLatest(200),
      this.sleepRepo.findLatest(200),
      this.heartRateRepo.findLatest(200),
    ]);

    // Index by date for fast join
    const sleepByDate = new Map(sleep.map((d) => [d.date, d]));
    const hrByDate = new Map(heartRate.map((d) => [d.date, d]));

    // Build joined dataset
    const joined: {
      date: string;
      steps: number;
      activeMin: number;
      sleepMin: number | null;
      deepMin: number | null;
      efficiency: number | null;
      rhr: number | null;
    }[] = [];

    for (const a of activity) {
      if (a.steps == null || a.steps === 0) continue;
      const s = sleepByDate.get(a.date);
      const h = hrByDate.get(a.date);
      joined.push({
        date: a.date,
        steps: a.steps,
        activeMin: (a.minutesFairlyActive ?? 0) + (a.minutesVeryActive ?? 0),
        sleepMin: s?.totalMinutesAsleep ?? null,
        deepMin: s?.minutesDeep ?? null,
        efficiency: s?.efficiency ?? null,
        rhr: h?.restingHeartRate ?? null,
      });
    }

    // Compute correlation pairs
    const pairs: CorrelationPair[] = [];

    // Steps vs Sleep Duration
    const stepsSleep = joined.filter(
      (d) => d.sleepMin != null,
    );
    if (stepsSleep.length >= 10) {
      const r = pearson(
        stepsSleep.map((d) => d.steps),
        stepsSleep.map((d) => d.sleepMin!),
      );
      pairs.push({
        xMetric: "steps",
        yMetric: "sleepMin",
        xLabel: "Steps",
        yLabel: "Sleep (min)",
        correlation: r,
        points: stepsSleep.map((d) => ({
          x: d.steps,
          y: d.sleepMin!,
          date: d.date,
        })),
        insight: describeCorrelation(r, "steps", "sleep duration"),
      });
    }

    // Steps vs Deep Sleep
    const stepsDeep = joined.filter(
      (d) => d.deepMin != null,
    );
    if (stepsDeep.length >= 10) {
      const r = pearson(
        stepsDeep.map((d) => d.steps),
        stepsDeep.map((d) => d.deepMin!),
      );
      pairs.push({
        xMetric: "steps",
        yMetric: "deepMin",
        xLabel: "Steps",
        yLabel: "Deep Sleep (min)",
        correlation: r,
        points: stepsDeep.map((d) => ({
          x: d.steps,
          y: d.deepMin!,
          date: d.date,
        })),
        insight: describeCorrelation(r, "steps", "deep sleep"),
      });
    }

    // Active Minutes vs Sleep
    const activeSleep = joined.filter(
      (d) => d.sleepMin != null,
    );
    if (activeSleep.length >= 10) {
      const r = pearson(
        activeSleep.map((d) => d.activeMin),
        activeSleep.map((d) => d.sleepMin!),
      );
      pairs.push({
        xMetric: "activeMin",
        yMetric: "sleepMin",
        xLabel: "Active Minutes",
        yLabel: "Sleep (min)",
        correlation: r,
        points: activeSleep.map((d) => ({
          x: d.activeMin,
          y: d.sleepMin!,
          date: d.date,
        })),
        insight: describeCorrelation(r, "active minutes", "sleep duration"),
      });
    }

    // Steps vs Resting HR
    const stepsHr = joined.filter((d) => d.rhr != null);
    if (stepsHr.length >= 10) {
      const r = pearson(
        stepsHr.map((d) => d.steps),
        stepsHr.map((d) => d.rhr!),
      );
      pairs.push({
        xMetric: "steps",
        yMetric: "rhr",
        xLabel: "Steps",
        yLabel: "Resting HR (bpm)",
        correlation: r,
        points: stepsHr.map((d) => ({
          x: d.steps,
          y: d.rhr!,
          date: d.date,
        })),
        insight: describeCorrelation(r, "steps", "resting heart rate"),
      });
    }

    // Sleep vs Resting HR
    const sleepHr = joined.filter(
      (d) => d.sleepMin != null && d.rhr != null,
    );
    if (sleepHr.length >= 10) {
      const r = pearson(
        sleepHr.map((d) => d.sleepMin!),
        sleepHr.map((d) => d.rhr!),
      );
      pairs.push({
        xMetric: "sleepMin",
        yMetric: "rhr",
        xLabel: "Sleep (min)",
        yLabel: "Resting HR (bpm)",
        correlation: r,
        points: sleepHr.map((d) => ({
          x: d.sleepMin!,
          y: d.rhr!,
          date: d.date,
        })),
        insight: describeCorrelation(r, "sleep duration", "resting heart rate"),
      });
    }

    // Activity-sleep buckets
    const withNextDaySleep: { steps: number; sleepMin: number; deepMin: number; efficiency: number }[] = [];
    for (const a of activity) {
      if (a.steps == null || a.steps === 0) continue;
      const nextDate = shiftDate(a.date, 1);
      const s = sleepByDate.get(nextDate);
      if (s?.totalMinutesAsleep != null && s.minutesDeep != null && s.efficiency != null) {
        withNextDaySleep.push({
          steps: a.steps,
          sleepMin: s.totalMinutesAsleep,
          deepMin: s.minutesDeep,
          efficiency: s.efficiency,
        });
      }
    }

    const bucketDefs = [
      { label: "Low (<3k steps)", test: (s: number) => s < 3000 },
      { label: "Medium (3-6k)", test: (s: number) => s >= 3000 && s < 6000 },
      { label: "High (6k+)", test: (s: number) => s >= 6000 },
    ];
    const activitySleepBuckets: ActivityBucket[] = bucketDefs.map(({ label, test }) => {
      const bucket = withNextDaySleep.filter((d) => test(d.steps));
      return {
        label,
        days: bucket.length,
        avgSleepMin: Math.round(avg(bucket.map((d) => d.sleepMin))),
        avgDeepMin: Math.round(avg(bucket.map((d) => d.deepMin))),
        avgEfficiency: Math.round(avg(bucket.map((d) => d.efficiency))),
      };
    });

    return {
      pairs,
      activitySleepBuckets,
      dataPoints: joined.length,
    };
  }

  async getDayOfWeekHeatmap(): Promise<DayOfWeekHeatmapData> {
    const [activity, sleep, heartRate] = await Promise.all([
      this.activityRepo.findLatest(200),
      this.sleepRepo.findLatest(200),
      this.heartRateRepo.findLatest(200),
    ]);

    const sleepByDate = new Map(sleep.map((d) => [d.date, d]));
    const hrByDate = new Map(heartRate.map((d) => [d.date, d]));

    // Buckets per day-of-week (0=Sun..6=Sat)
    type Bucket = { steps: number[]; activeMin: number[]; distance: number[]; calories: number[]; sleepMin: number[]; deepMin: number[]; efficiency: number[]; rhr: number[] };
    const buckets: Bucket[] = Array.from({ length: 7 }, () => ({
      steps: [], activeMin: [], distance: [], calories: [],
      sleepMin: [], deepMin: [], efficiency: [], rhr: [],
    }));
    const dayCounts = new Array(7).fill(0);

    for (const a of activity) {
      if (a.steps == null) continue;
      const dow = new Date(a.date + "T00:00:00Z").getUTCDay();
      dayCounts[dow]++;
      buckets[dow].steps.push(a.steps);
      buckets[dow].activeMin.push((a.minutesFairlyActive ?? 0) + (a.minutesVeryActive ?? 0));
      if (a.distanceKm != null) buckets[dow].distance.push(a.distanceKm);
      if (a.caloriesOut != null) buckets[dow].calories.push(a.caloriesOut);

      const s = sleepByDate.get(a.date);
      if (s?.totalMinutesAsleep != null) buckets[dow].sleepMin.push(s.totalMinutesAsleep);
      if (s?.minutesDeep != null) buckets[dow].deepMin.push(s.minutesDeep);
      if (s?.efficiency != null) buckets[dow].efficiency.push(s.efficiency);

      const h = hrByDate.get(a.date);
      if (h?.restingHeartRate != null) buckets[dow].rhr.push(h.restingHeartRate);
    }

    const metrics: { key: keyof Bucket; label: string; unit: string; decimals: number }[] = [
      { key: "steps", label: "Steps", unit: "steps", decimals: 0 },
      { key: "activeMin", label: "Active Minutes", unit: "min", decimals: 0 },
      { key: "distance", label: "Distance", unit: "km", decimals: 1 },
      { key: "calories", label: "Calories", unit: "cal", decimals: 0 },
      { key: "sleepMin", label: "Sleep", unit: "min", decimals: 0 },
      { key: "deepMin", label: "Deep Sleep", unit: "min", decimals: 0 },
      { key: "efficiency", label: "Sleep Efficiency", unit: "%", decimals: 0 },
      { key: "rhr", label: "Resting HR", unit: "bpm", decimals: 0 },
    ];

    const rows: DayOfWeekHeatmapRow[] = [];
    for (const { key, label, unit, decimals } of metrics) {
      const factor = 10 ** decimals;
      const values = buckets.map((b) => {
        const vals = b[key];
        if (vals.length === 0) return null;
        return Math.round(avg(vals) * factor) / factor;
      });
      const valid = values.filter((v): v is number => v != null);
      if (valid.length === 0) continue;
      rows.push({
        metric: key,
        label,
        unit,
        values,
        min: Math.min(...valid),
        max: Math.max(...valid),
      });
    }

    return {
      dayNames: DAY_NAMES,
      rows,
      totalDays: activity.filter((d) => d.steps != null).length,
      dayCounts,
    };
  }

  async getRecords(): Promise<RecordsData> {
    const [activity, sleep, heartRate] = await Promise.all([
      this.activityRepo.findLatest(200),
      this.sleepRepo.findLatest(200),
      this.heartRateRepo.findLatest(200),
    ]);

    const records: PersonalRecord[] = [];

    // Best step day
    const bestSteps = activity
      .filter((d) => d.steps != null)
      .sort((a, b) => (b.steps ?? 0) - (a.steps ?? 0))[0];
    if (bestSteps?.steps) {
      records.push({ metric: "steps", label: "Most Steps", value: bestSteps.steps, unit: "steps", date: bestSteps.date });
    }

    // Best distance
    const bestDist = activity
      .filter((d) => d.distanceKm != null)
      .sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))[0];
    if (bestDist?.distanceKm) {
      records.push({ metric: "distance", label: "Longest Distance", value: Math.round(bestDist.distanceKm * 100) / 100, unit: "km", date: bestDist.date });
    }

    // Best active minutes
    const bestActive = activity
      .map((d) => ({ ...d, activeMin: (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0) }))
      .sort((a, b) => b.activeMin - a.activeMin)[0];
    if (bestActive && bestActive.activeMin > 0) {
      records.push({ metric: "activeMin", label: "Most Active Minutes", value: bestActive.activeMin, unit: "min", date: bestActive.date });
    }

    // Best calories
    const bestCal = activity
      .filter((d) => d.caloriesOut != null)
      .sort((a, b) => (b.caloriesOut ?? 0) - (a.caloriesOut ?? 0))[0];
    if (bestCal?.caloriesOut) {
      records.push({ metric: "calories", label: "Most Calories", value: bestCal.caloriesOut, unit: "cal", date: bestCal.date });
    }

    // Best sleep
    const bestSleep = sleep
      .filter((d) => d.totalMinutesAsleep != null)
      .sort((a, b) => (b.totalMinutesAsleep ?? 0) - (a.totalMinutesAsleep ?? 0))[0];
    if (bestSleep?.totalMinutesAsleep) {
      records.push({ metric: "sleep", label: "Longest Sleep", value: bestSleep.totalMinutesAsleep, unit: "min", date: bestSleep.date });
    }

    // Best efficiency
    const bestEff = sleep
      .filter((d) => d.efficiency != null)
      .sort((a, b) => (b.efficiency ?? 0) - (a.efficiency ?? 0))[0];
    if (bestEff?.efficiency) {
      records.push({ metric: "efficiency", label: "Best Sleep Efficiency", value: bestEff.efficiency, unit: "%", date: bestEff.date });
    }

    // Lowest RHR
    const bestRhr = heartRate
      .filter((d) => d.restingHeartRate != null)
      .sort((a, b) => (a.restingHeartRate ?? 999) - (b.restingHeartRate ?? 999))[0];
    if (bestRhr?.restingHeartRate) {
      records.push({ metric: "rhr", label: "Lowest Resting HR", value: bestRhr.restingHeartRate, unit: "bpm", date: bestRhr.date });
    }

    // Streaks
    const streaks: Streak[] = [];

    // Steps streak: consecutive days >= 5000 steps
    const sortedActivity = [...activity].sort((a, b) => a.date.localeCompare(b.date));
    const stepsStreak = computeStreak(sortedActivity, (d) => (d.steps ?? 0) >= 5000);
    streaks.push({ label: "5k+ Steps", ...stepsStreak, unit: "days" });

    // Active streak: consecutive days with >= 10 active minutes
    const activeStreak = computeStreak(sortedActivity, (d) =>
      ((d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0)) >= 10,
    );
    streaks.push({ label: "10+ Active Min", ...activeStreak, unit: "days" });

    // Sleep streak: consecutive days >= 7 hours sleep
    const sortedSleep = [...sleep].sort((a, b) => a.date.localeCompare(b.date));
    const sleepStreak = computeStreak(sortedSleep, (d) => (d.totalMinutesAsleep ?? 0) >= 420);
    streaks.push({ label: "7+ Hours Sleep", ...sleepStreak, unit: "days" });

    return { records, streaks };
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

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 1000;
}

function describeCorrelation(r: number, xName: string, yName: string): string {
  const abs = Math.abs(r);
  let strength: string;
  if (abs >= 0.7) strength = "strong";
  else if (abs >= 0.4) strength = "moderate";
  else if (abs >= 0.2) strength = "weak";
  else return `No meaningful correlation between ${xName} and ${yName}`;

  const direction = r > 0 ? "positive" : "negative";
  const meaning =
    r > 0
      ? `more ${xName} tends to go with more ${yName}`
      : `more ${xName} tends to go with less ${yName}`;
  return `${strength.charAt(0).toUpperCase() + strength.slice(1)} ${direction} correlation (r=${r.toFixed(2)}): ${meaning}`;
}

function computeStreak<T extends { date: string }>(
  sorted: T[],
  test: (d: T) => boolean,
): { current: number; best: number } {
  let current = 0;
  let best = 0;
  let streak = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (test(sorted[i])) {
      streak++;
      if (streak > best) best = streak;
    } else {
      streak = 0;
    }
  }
  // Current streak counts backwards from the end
  current = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (test(sorted[i])) current++;
    else break;
  }

  return { current, best };
}
