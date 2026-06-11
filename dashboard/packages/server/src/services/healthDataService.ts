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
  ActivityBucket,
  DayOfWeekHeatmapData,
  DayOfWeekHeatmapMetric,
  RecordsData,
  PersonalRecord,
  Streak,
  DrivingSummary,
} from "@health-dashboard/shared";
import type { ActivityRepository } from "../repositories/activityRepo.js";
import type { SleepRepository } from "../repositories/sleepRepo.js";
import type { HeartRateRepository } from "../repositories/heartRateRepo.js";
import type { WeightRepository } from "../repositories/weightRepo.js";
import type { HrvRepository } from "../repositories/hrvRepo.js";
import type { ExerciseLogRepository } from "../repositories/exerciseLogRepo.js";
import type { Spo2Repository } from "../repositories/spo2Repo.js";
import type { BreathingRateRepository } from "../repositories/breathingRateRepo.js";
import type { SkinTempRepository } from "../repositories/skinTempRepo.js";
import type { CardioScoreRepository } from "../repositories/cardioScoreRepo.js";
import type { EightSleepRepository } from "../repositories/eightSleepRepo.js";
import type { FoodRepository } from "../repositories/foodRepo.js";
import type { TeslaDriveRepository } from "../repositories/teslaDriveRepo.js";
import { avg } from "./stats.js";
import { addDays } from "./userTz.js";
import { computeReadiness, type ReadinessDayInput } from "./readiness.js";
import {
  computeCorrelationPairs,
  fillMissingDays,
  seriesFrom,
  type MetricSeries,
  type PairSpec,
} from "./correlationEngine.js";
import type { ReadinessScore } from "@health-dashboard/shared";

/**
 * The curated cross-metric comparisons. Each spec is one line — the
 * engine joins the two series (with optional day lag), gates on enough
 * overlap, and writes the labels/insight from the series registry.
 *
 * DAY ATTRIBUTION drives the lags. Sleep and overnight signals (sleep
 * minutes, deep sleep, restlessness, overnight HRV) are dated by WAKE
 * day, so the night that FOLLOWS daytime activity on day D is recorded
 * on D+1: "daytime X vs the sleep it precedes" is lag 1 with "that
 * night" wording — lag 0 would pair X with the night that came BEFORE
 * it. Readiness is a morning score, so lag 1 there genuinely means
 * "the next morning" and keeps the default "next-day" wording.
 *
 * Readiness is only paired with metrics that are NOT among its inputs
 * (steps, time in car, calorie intake — see readiness.ts WEIGHTS), so
 * those pairs carry no built-in circularity. The overnight pairs
 * (sleepMin, tnt) DO overlap with readiness inputs — they're raw-signal
 * views kept alongside the composite, not independent evidence.
 */
const THAT_NIGHT = { lag: 1, ySuffix: "that night" } as const;
const HEALTH_PAIR_SPECS: PairSpec[] = [
  // Daytime activity vs the night it precedes.
  { x: "steps", y: "sleepMin", ...THAT_NIGHT, yNounForm: "sleep that night" },
  { x: "steps", y: "deepMin", ...THAT_NIGHT, yNounForm: "deep sleep that night" },
  { x: "activeMin", y: "sleepMin", ...THAT_NIGHT, yNounForm: "sleep that night" },
  // Same-day physiology.
  { x: "steps", y: "rhr" },
  // Last night's sleep vs the readings from that same night/morning.
  { x: "sleepMin", y: "rhr" },
  { x: "sleepMin", y: "hrv" },
  // Driving.
  { x: "minutesInCar", y: "steps" },
  { x: "minutesInCar", y: "rhr" },
  { x: "minutesInCar", y: "sleepMin", ...THAT_NIGHT, yNounForm: "sleep that night" },
  { x: "minutesInCar", y: "tnt", ...THAT_NIGHT, yNounForm: "restlessness that night" },
  { x: "minutesInCar", y: "readiness", lag: 1 },
  // Activity & food → tonight's sleep / tomorrow's recovery.
  { x: "steps", y: "readiness", lag: 1 },
  { x: "caloriesIn", y: "sleepMin", ...THAT_NIGHT, yNounForm: "sleep that night" },
  { x: "caloriesIn", y: "readiness", lag: 1 },
];

export class HealthDataService {
  constructor(
    private activityRepo: ActivityRepository,
    private sleepRepo: SleepRepository,
    private heartRateRepo: HeartRateRepository,
    private weightRepo: WeightRepository,
    private hrvRepo: HrvRepository,
    private exerciseLogRepo: ExerciseLogRepository,
    private spo2Repo: Spo2Repository,
    private breathingRateRepo: BreathingRateRepository,
    private skinTempRepo: SkinTempRepository,
    private cardioScoreRepo: CardioScoreRepository,
    private eightSleepRepo: EightSleepRepository,
    private foodRepo: FoodRepository,
    private teslaDriveRepo: TeslaDriveRepository,
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

  async getSpo2(start: string, end: string) {
    return this.spo2Repo.findByDateRange(start, end);
  }

  async getBreathingRate(start: string, end: string) {
    return this.breathingRateRepo.findByDateRange(start, end);
  }

  async getSkinTemp(start: string, end: string) {
    return this.skinTempRepo.findByDateRange(start, end);
  }

  async getCardioScore(start: string, end: string) {
    return this.cardioScoreRepo.findByDateRange(start, end);
  }

  async getEightSleep(start: string, end: string) {
    return this.eightSleepRepo.findByDateRange(start, end);
  }

  async getFood(start: string, end: string) {
    return this.foodRepo.findByDateRange(start, end);
  }

  /**
   * Join ~90 days of every recovery signal into one row-per-day series.
   * 90 days comfortably covers the 30-day baseline window plus the
   * 14-day history. Shared by `getReadiness` and the alert evaluator so
   * the join lives in exactly one place.
   */
  async getReadinessInputs(): Promise<ReadinessDayInput[]> {
    const N = 90;
    const [hrv, heartRate, sleep, breathing, spo2, skinTemp, eight] =
      await Promise.all([
        this.hrvRepo.findLatest(N),
        this.heartRateRepo.findLatest(N),
        this.sleepRepo.findLatest(N),
        this.breathingRateRepo.findLatest(N),
        this.spo2Repo.findLatest(N),
        this.skinTempRepo.findLatest(N),
        this.eightSleepRepo.findLatest(N),
      ]);

    const byDate = new Map<string, ReadinessDayInput>();
    const ensure = (date: string): ReadinessDayInput => {
      let d = byDate.get(date);
      if (!d) {
        d = {
          date,
          hrv: {},
          rhr: {},
          sleepMin: {},
          breathing: {},
          spo2: {},
          skinTemp: null,
          restlessness: null,
        };
        byDate.set(date, d);
      }
      return d;
    };

    // Fitbit sources
    for (const h of hrv) ensure(h.date).hrv.fitbit = h.dailyRmssd;
    for (const h of heartRate) ensure(h.date).rhr.fitbit = h.restingHeartRate;
    for (const s of sleep) ensure(s.date).sleepMin.fitbit = s.totalMinutesAsleep;
    for (const b of breathing) ensure(b.date).breathing.fitbit = b.breathingRate;
    for (const s of spo2) ensure(s.date).spo2.fitbit = s.avgValue;
    for (const s of skinTemp) ensure(s.date).skinTemp = s.nightlyRelative;

    // Eight Sleep sources (mattress sensor)
    for (const e of eight) {
      const d = ensure(e.date);
      d.hrv.eightSleep = e.avgHrvRmssd;
      d.rhr.eightSleep = e.avgHeartRate;
      d.sleepMin.eightSleep = e.sleepDurationMin;
      d.breathing.eightSleep = e.avgRespiratoryRate;
      d.restlessness = e.tnt;
    }

    return [...byDate.values()];
  }

  /**
   * Compute the personal readiness score from the joined inputs — see
   * `services/readiness.ts` for the z-vs-baseline methodology.
   */
  async getReadiness(historyDays?: number): Promise<ReadinessScore> {
    return computeReadiness(await this.getReadinessInputs(), historyDays);
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
    const currentStart = addDays(latestDate, -6);
    const previousEnd = addDays(latestDate, -7);
    const previousStart = addDays(latestDate, -13);

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

    // Day-of-week patterns from all available data, rotated so the bars
    // line up with the rolling current-period window (period start on the
    // left, period end on the right). Without this the chart reads in
    // fixed Sun→Sat calendar order even though the date-range pill shows a
    // rolling Tue→Mon (or whichever) window — the visual mismatch reads
    // like a bug to anyone scanning quickly.
    const startDow = new Date(currentStart + "T00:00:00Z").getUTCDay();
    const dayOfWeek = computeDayOfWeek(allActivity, startDow);

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
    // Pull every signal that participates in cross-metric correlations.
    // Readiness (the composite score) is included as a series too —
    // pairing it with signals that are NOT among its inputs (steps,
    // driving, food) answers "does X affect my recovery?" directly,
    // without the circularity of correlating readiness with its own
    // ingredients (sleep, RHR, HRV, ...).
    const [activity, sleep, heartRate, hrv, food, eightSleep, driving, readiness] =
      await Promise.all([
        this.activityRepo.findLatest(200),
        this.sleepRepo.findLatest(200),
        this.heartRateRepo.findLatest(200),
        this.hrvRepo.findLatest(200),
        this.foodRepo.findLatest(200),
        this.eightSleepRepo.findLatest(200),
        this.teslaDriveRepo.findLatest(200),
        this.getReadiness(60),
      ]);

    // Register each signal once (date → value); the comparisons live in
    // HEALTH_PAIR_SPECS. Activity-derived series only count "wear days"
    // (steps > 0) so charger days don't read as zero-step days.
    const wearDays = activity.filter((a) => a.steps != null && a.steps > 0);
    const series = new Map<string, MetricSeries>();
    for (const def of [
      seriesFrom("steps", "Steps", "steps", wearDays, (a) => a.steps),
      seriesFrom(
        "activeMin", "Active Minutes", "active minutes", wearDays,
        (a) => (a.minutesFairlyActive ?? 0) + (a.minutesVeryActive ?? 0),
      ),
      seriesFrom("sleepMin", "Sleep (min)", "sleep duration", sleep, (d) => d.totalMinutesAsleep),
      seriesFrom("deepMin", "Deep Sleep (min)", "deep sleep", sleep, (d) => d.minutesDeep),
      seriesFrom("rhr", "Resting HR (bpm)", "resting heart rate", heartRate, (d) => d.restingHeartRate),
      seriesFrom("hrv", "HRV (ms)", "HRV", hrv, (d) => d.dailyRmssd),
      // SELECTION BIAS, documented: food rows exist only on days intake
      // was logged, and a partially-logged day passes as a fake low-cal
      // day. Food pairs therefore read "among days I logged, ..." — we
      // can't distinguish "didn't eat" from "didn't log", so no zero-fill.
      seriesFrom(
        "caloriesIn", "Calories In", "calorie intake",
        food.filter((f) => (f.caloriesIn ?? 0) > 0), (d) => d.caloriesIn,
      ),
      seriesFrom("tnt", "Restlessness (toss & turns)", "restlessness", eightSleep, (d) => d.tnt),
      // Driving IS zero-fillable (unlike food): TeslaMate logs every
      // drive, so a gap between the first and last drive day is a true
      // 0-minute day. Without the fill, every driving pair would be
      // conditioned on "days I drove at all" and lose its control group.
      fillMissingDays(
        seriesFrom("minutesInCar", "Time in Car (min)", "time in car", driving, (d) => d.minutesInCar),
        0,
      ),
      // Note: readiness history spans ~60 days vs ~200 for the rest, so
      // readiness pairs are computed over a shorter, recent-only window.
      seriesFrom("readiness", "Readiness", "readiness", readiness.history, (d) => d.score),
    ]) {
      series.set(def.key, def);
    }

    const pairs = computeCorrelationPairs(series, HEALTH_PAIR_SPECS);

    // Index sleep by date for the activity → next-night buckets below.
    const sleepByDate = new Map(sleep.map((d) => [d.date, d]));

    // Activity-sleep buckets
    const withNextDaySleep: { steps: number; sleepMin: number; deepMin: number; efficiency: number }[] = [];
    for (const a of activity) {
      if (a.steps == null || a.steps === 0) continue;
      const nextDate = addDays(a.date, 1);
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

    // "Days of data" = the union of dates across every registered
    // series. Individual pairs join on their own overlap (shown as "n"
    // per panel), so a single series' count would describe none of them.
    const allDates = new Set<string>();
    for (const def of series.values()) {
      for (const d of def.values.keys()) allDates.add(d);
    }

    return {
      pairs,
      activitySleepBuckets,
      dataPoints: allDates.size,
    };
  }

  /**
   * Compact "time in car" summary for the dashboard stat card — latest
   * day, last-7-day totals, and a short daily trend. Reads from the
   * TeslaMate-derived `universe.tesla_drive_daily` (empty until the
   * `ingest_tesla_drives` job has run).
   */
  async getDriving(): Promise<DrivingSummary> {
    const days = await this.teslaDriveRepo.findLatest(30); // DESC by date
    if (days.length === 0) {
      return { latestDate: null, latestMinutes: null, weekMinutes: 0, weekDrives: 0, trend: [] };
    }
    const latest = days[0];
    const weekStart = addDays(latest.date, -6);
    const week = days.filter((d) => d.date >= weekStart);
    return {
      latestDate: latest.date,
      latestMinutes: latest.minutesInCar,
      weekMinutes: week.reduce((sum, d) => sum + d.minutesInCar, 0),
      weekDrives: week.reduce((sum, d) => sum + d.drives, 0),
      trend: [...days].reverse().map((d) => ({ date: d.date, minutes: d.minutesInCar })),
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

    const rows: DayOfWeekHeatmapMetric[] = [];
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

    // Rotate the columns so today's day-of-week sits in the RIGHTMOST cell.
    // Without this the table renders in fixed Sun→Sat calendar order, but
    // the rest of the dashboard treats "today" as the most recent point in
    // a rolling 7-day window — so the heatmap header and the WeeklyInsights
    // bars would tell different stories about the same week. Aligning to
    // the rolling window keeps the right edge as "now" everywhere.
    const latestDow =
      activity.length > 0
        ? new Date(activity[0].date + "T00:00:00Z").getUTCDay()
        : 0;
    const startDow = (latestDow + 1) % 7;

    // The actual date behind each (rotated) column: the rightmost column is
    // the latest day, so column i maps to latestDate − (6 − i).
    const latestDate = activity.length > 0 ? activity[0].date : null;
    const dayDates = latestDate
      ? Array.from({ length: 7 }, (_, i) => addDays(latestDate, i - 6))
      : [];

    return {
      dayNames: rotateDow(DAY_NAMES, startDow),
      dayDates,
      rows: rows.map((r) => ({ ...r, values: rotateDow(r.values, startDow) })),
      totalDays: activity.filter((d) => d.steps != null).length,
      dayCounts: rotateDow(dayCounts, startDow),
    };
  }

  async getRecords(today?: string): Promise<RecordsData> {
    const [activity, sleep, heartRate] = await Promise.all([
      this.activityRepo.findLatest(200),
      this.sleepRepo.findLatest(200),
      this.heartRateRepo.findLatest(200),
    ]);

    const records: PersonalRecord[] = [];

    // Steps & distance & sleep duration & efficiency: Fitbit's data here is
    // reliable, and a real personal best is by definition a tail value.
    // Don't filter — just pick the max.
    const bestSteps = pickMaxBy(activity, (d) => d.steps);
    if (bestSteps?.value != null) {
      records.push({ metric: "steps", label: "Most Steps", value: bestSteps.value, unit: "steps", date: bestSteps.date });
    }

    const bestDist = pickMaxBy(activity, (d) => d.distanceKm);
    if (bestDist?.value != null) {
      records.push({ metric: "distance", label: "Longest Distance", value: Math.round(bestDist.value * 100) / 100, unit: "km", date: bestDist.date });
    }

    // Active minutes: Fitbit's HR-zone classifier can fail in clusters
    // (e.g. the March 2026 anomaly inflated this 30-50x baseline). Real
    // workout days produce active minutes in proportion to step count
    // (~80-150 steps per active minute). Filter out days where the ratio
    // is physiologically impossible — guards against future glitches too.
    const cleanActivity = activity.filter(isPhysicallyPlausibleActivity);
    const bestActive = pickMaxBy(cleanActivity, (d) =>
      (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0),
    );
    if (bestActive && bestActive.value > 0) {
      records.push({ metric: "activeMin", label: "Most Active Minutes", value: bestActive.value, unit: "min", date: bestActive.date });
    }

    // "Most Calories" intentionally omitted: Fitbit's HR-driven caloriesOut
    // is the most polluted metric, and "biggest activity day" is already
    // captured by Most Active Minutes anyway.

    const bestSleep = pickMaxBy(sleep, (d) => d.totalMinutesAsleep);
    if (bestSleep?.value != null) {
      records.push({ metric: "sleep", label: "Longest Sleep", value: bestSleep.value, unit: "min", date: bestSleep.date });
    }

    const bestEff = pickMaxBy(sleep, (d) => d.efficiency);
    if (bestEff?.value != null) {
      records.push({ metric: "efficiency", label: "Best Sleep Efficiency", value: bestEff.value, unit: "%", date: bestEff.date });
    }

    // Lowest RHR — apply a hard floor at 35 bpm. Sub-35 readings are sensor
    // artefacts (device fell off, torn strap, etc.); even elite endurance
    // athletes typically don't sustain a true RHR below ~35.
    const cleanHr = heartRate.filter(
      (d) => d.restingHeartRate == null || d.restingHeartRate >= MIN_PLAUSIBLE_RHR_BPM,
    );
    const bestRhr = pickMinBy(cleanHr, (d) => d.restingHeartRate);
    if (bestRhr?.value != null) {
      records.push({ metric: "rhr", label: "Lowest Resting HR", value: bestRhr.value, unit: "bpm", date: bestRhr.date });
    }

    // Streaks
    const streaks: Streak[] = [];

    // Steps streak: consecutive days >= 5000 steps
    const sortedActivity = [...activity].sort((a, b) => a.date.localeCompare(b.date));
    const stepsStreak = computeStreak(
      sortedActivity,
      (d) => (d.steps ?? 0) >= 5000,
      today,
    );
    streaks.push({ label: "5k+ Steps", ...stepsStreak, unit: "days" });

    // Active streak: consecutive days with >= 10 active minutes
    const activeStreak = computeStreak(
      sortedActivity,
      (d) =>
        ((d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0)) >= 10,
      today,
    );
    streaks.push({ label: "10+ Active Min", ...activeStreak, unit: "days" });

    // Sleep streak: consecutive days >= 7 hours sleep. (Sleep is logged
    // against the wake-up date, so today's entry only appears after the
    // morning sync — the today-skip still applies if it lands at 0.)
    const sortedSleep = [...sleep].sort((a, b) => a.date.localeCompare(b.date));
    const sleepStreak = computeStreak(
      sortedSleep,
      (d) => (d.totalMinutesAsleep ?? 0) >= 420,
      today,
    );
    streaks.push({ label: "7+ Hours Sleep", ...sleepStreak, unit: "days" });

    return { records, streaks };
  }
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

/**
 * Rotate a length-7 array so index 0 becomes `startDow` and indices wrap
 * around mod 7. Used to align day-of-week visualisations with the rolling
 * window the rest of the dashboard uses (today on the right, oldest on
 * the left) instead of fixed Sun→Sat calendar order.
 */
function rotateDow<T>(arr: readonly T[], startDow: number): T[] {
  const out: T[] = [];
  for (let offset = 0; offset < 7; offset++) {
    out.push(arr[(startDow + offset) % 7]);
  }
  return out;
}

function computeDayOfWeek(
  activity: ActivityDay[],
  startDow = 0,
): DayOfWeekAvg[] {
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

  // Rotate the seven buckets so the result reads chronologically:
  // index 0 = `startDow`, index 6 = the day-of-week six days later.
  // The numeric `dow` field is preserved as the canonical 0..6 (Sun..Sat)
  // identifier — only the array ORDER changes.
  const result: DayOfWeekAvg[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const i = (startDow + offset) % 7;
    result.push({
      dow: i,
      dayName: DAY_NAMES[i],
      avgSteps: Math.round(avg(buckets[i].steps)),
      avgActiveMinutes: Math.round(avg(buckets[i].active)),
    });
  }
  return result;
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

/**
 * Compute current and best streak of consecutive days satisfying `test`.
 *
 * `today` (YYYY-MM-DD in the user's calendar) lets the current-streak
 * walk skip an in-progress final day: Fitbit reports the running total
 * for "today" as soon as the date rolls over, so a 5 AM check would
 * see steps=0 and break a real streak. When the most recent row is
 * today AND fails the test, treat it as "data not yet in" rather than
 * a streak failure. A failing yesterday still breaks the streak — only
 * today gets the benefit of the doubt.
 *
 * `best` is unaffected: a passing today contributes to it, and a
 * failing today resets the running counter without rewriting history.
 */
function computeStreak<T extends { date: string }>(
  sorted: T[],
  test: (d: T) => boolean,
  today?: string,
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

  // Current streak counts backwards from the end. If the very last
  // entry is today and fails the test, treat it as in-progress.
  let i = sorted.length - 1;
  if (today && i >= 0 && sorted[i].date === today && !test(sorted[i])) {
    i--;
  }
  current = 0;
  for (; i >= 0; i--) {
    if (test(sorted[i])) current++;
    else break;
  }

  return { current, best };
}

// --- Record-picking helpers -----------------------------------------------

function pickMaxBy<T extends { date: string }>(
  rows: T[],
  getValue: (d: T) => number | null | undefined,
): { date: string; value: number } | null {
  let best: { date: string; value: number } | null = null;
  for (const row of rows) {
    const v = getValue(row);
    if (v == null) continue;
    if (best === null || v > best.value) best = { date: row.date, value: v };
  }
  return best;
}

function pickMinBy<T extends { date: string }>(
  rows: T[],
  getValue: (d: T) => number | null | undefined,
): { date: string; value: number } | null {
  let best: { date: string; value: number } | null = null;
  for (const row of rows) {
    const v = getValue(row);
    if (v == null) continue;
    if (best === null || v < best.value) best = { date: row.date, value: v };
  }
  return best;
}

/**
 * Sustained moderate-vigorous activity costs steps. ~100 steps/min is a
 * brisk walk and ~150-180 a run, but Fitbit also counts post-exercise HR
 * recovery as "active" — so the boundary needs slack. Empirically, on this
 * dataset's bad-data cluster (March 2026 HR-zone glitch) every garbage day
 * has steps/active-min ≤ 25, while every real workout day has ≥ 28. A
 * threshold of 30 cleanly separates them and survives normal interval and
 * long-hike days where the ratio dips into the 30s.
 */
const MIN_STEPS_PER_ACTIVE_MIN = 30;

/** Hard floor for resting HR — anything lower is sensor error. */
const MIN_PLAUSIBLE_RHR_BPM = 35;

function isPhysicallyPlausibleActivity(d: ActivityDay): boolean {
  const activeMin = (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0);
  if (activeMin === 0) return true; // nothing to scrutinise
  // No step count means we can't sanity-check — let it through.
  if (d.steps == null) return true;
  return d.steps >= activeMin * MIN_STEPS_PER_ACTIVE_MIN;
}
