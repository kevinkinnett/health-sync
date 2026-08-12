import type {
  ActivityBucket,
  CorrelationsData,
  ReadinessScore,
} from "@health-dashboard/shared";
import type { ActivityRepository } from "../../repositories/activityRepo.js";
import type { SleepRepository } from "../../repositories/sleepRepo.js";
import type { HeartRateRepository } from "../../repositories/heartRateRepo.js";
import type { HrvRepository } from "../../repositories/hrvRepo.js";
import type { FoodRepository } from "../../repositories/foodRepo.js";
import type { EightSleepRepository } from "../../repositories/eightSleepRepo.js";
import type { TeslaDriveRepository } from "../../repositories/teslaDriveRepo.js";
import { avg } from "../stats.js";
import { addDays } from "../userTz.js";
import {
  computeCorrelationPairs,
  fillMissingDays,
  seriesFrom,
  type MetricSeries,
  type PairSpec,
} from "../correlationEngine.js";

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
export const HEALTH_PAIR_SPECS: PairSpec[] = [
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

const STEP_BUCKETS = [
  { label: "Low (<3k steps)", test: (s: number) => s < 3000 },
  { label: "Medium (3-6k)", test: (s: number) => s >= 3000 && s < 6000 },
  { label: "High (6k+)", test: (s: number) => s >= 6000 },
];

/** Supplies the readiness history that participates as its own series. */
export type ReadinessProvider = (historyDays: number) => Promise<ReadinessScore>;

/** Cross-metric correlation pairs plus the activity→sleep buckets. */
export class CorrelationsService {
  constructor(
    private activityRepo: ActivityRepository,
    private sleepRepo: SleepRepository,
    private heartRateRepo: HeartRateRepository,
    private hrvRepo: HrvRepository,
    private foodRepo: FoodRepository,
    private eightSleepRepo: EightSleepRepository,
    private teslaDriveRepo: TeslaDriveRepository,
    private readinessProvider: ReadinessProvider,
  ) {}

  async getCorrelations(today?: string): Promise<CorrelationsData> {
    // Pull every signal that participates in cross-metric correlations.
    // Readiness (the composite score) is included as a series too —
    // pairing it with signals that are NOT among its inputs (steps,
    // driving, food) answers "does X affect my recovery?" directly,
    // without the circularity of correlating readiness with its own
    // ingredients (sleep, RHR, HRV, ...).
    const [rawActivity, rawSleep, rawHeartRate, rawHrv, rawFood, rawEightSleep, rawDriving, readiness] =
      await Promise.all([
        this.activityRepo.findLatest(201),
        this.sleepRepo.findLatest(201),
        this.heartRateRepo.findLatest(201),
        this.hrvRepo.findLatest(201),
        this.foodRepo.findLatest(201),
        this.eightSleepRepo.findLatest(201),
        this.teslaDriveRepo.findLatest(201),
        this.readinessProvider(60),
      ]);

    // A correlation should not move during the day just because today's
    // activity is half-observed while its overnight signals are complete.
    // The controller supplies `today` in the user's IANA timezone.
    const completed = <T extends { date: string }>(rows: T[]) =>
      (today == null ? rows : rows.filter((row) => row.date < today)).slice(0, 200);
    const activity = completed(rawActivity);
    const heartRate = completed(rawHeartRate);
    const food = completed(rawFood);
    const eightSleep = completed(rawEightSleep);
    const driving = completed(rawDriving);

    // Sleep and HRV algorithms changed at the Google Health cutover. Mixing
    // regimes in a single Pearson coefficient can turn the cutover itself
    // into a relationship, so comparisons use only the latest completed
    // regime for each signal.
    const latestRegime = <T extends { date: string; measurementMethod: string }>(rows: T[]) =>
      [...rows].sort((a, b) => b.date.localeCompare(a.date))[0]?.measurementMethod ?? null;
    const completedSleep = completed(rawSleep);
    const completedHrv = completed(rawHrv);
    const sleepRegime = latestRegime(completedSleep);
    const hrvRegime = latestRegime(completedHrv);
    const sleep = sleepRegime == null
      ? completedSleep
      : completedSleep.filter((row) => row.measurementMethod === sleepRegime);
    const hrv = hrvRegime == null
      ? completedHrv
      : completedHrv.filter((row) => row.measurementMethod === hrvRegime);
    const readinessHistory = completed(readiness.history);

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
      seriesFrom("readiness", "Readiness", "readiness", readinessHistory, (d) => d.score),
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
      const s = sleepByDate.get(addDays(a.date, 1));
      if (s?.totalMinutesAsleep != null && s.minutesDeep != null && s.efficiency != null) {
        withNextDaySleep.push({
          steps: a.steps,
          sleepMin: s.totalMinutesAsleep,
          deepMin: s.minutesDeep,
          efficiency: s.efficiency,
        });
      }
    }

    const activitySleepBuckets: ActivityBucket[] = STEP_BUCKETS.map(({ label, test }) => {
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

    const dates = [...allDates].sort();
    return {
      pairs,
      activitySleepBuckets,
      dataPoints: allDates.size,
      window: { start: dates[0] ?? null, end: dates.at(-1) ?? null },
      ...(today == null ? {} : { excludedCurrentDate: today }),
      measurementRegimes: { sleep: sleepRegime, hrv: hrvRegime },
    };
  }
}
