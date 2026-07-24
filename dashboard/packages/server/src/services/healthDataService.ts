import type {
  HealthSummary,
  SparklineData,
  WeeklyInsights,
  CorrelationsData,
  DayOfWeekHeatmapData,
  RecordsData,
  DrivingSummary,
  ReadinessScore,
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
import { addDays } from "./userTz.js";
import { computeReadiness, type ReadinessDayInput } from "./readiness.js";
import { RecordsService } from "./health/records.js";
import { HeatmapService } from "./health/heatmap.js";
import { WeeklyInsightsService } from "./health/weeklyInsights.js";
import { CorrelationsService } from "./health/correlations.js";

/**
 * Read-side facade over the health repositories.
 *
 * This used to be a 939-line god object: the simple per-metric
 * read-throughs sat alongside personal-records data-quality rules,
 * day-of-week bucketing, week-over-week narrative generation and the
 * correlation registry — four unrelated reasons to change, all sharing
 * one thirteen-repository constructor.
 *
 * Those four now live in `./health/*` as focused collaborators, each
 * taking only the repositories it actually reads (records/heatmap/weekly
 * need three, not thirteen) and each testable on its own. This class
 * keeps the summary + read-through surface, owns the readiness join, and
 * delegates the rest — so `index.ts`, the controllers and the v1 tool
 * endpoints are unchanged.
 */
export class HealthDataService {
  private readonly records: RecordsService;
  private readonly heatmap: HeatmapService;
  private readonly weekly: WeeklyInsightsService;
  private readonly correlations: CorrelationsService;

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
  ) {
    this.records = new RecordsService(activityRepo, sleepRepo, heartRateRepo);
    this.heatmap = new HeatmapService(activityRepo, sleepRepo, heartRateRepo);
    this.weekly = new WeeklyInsightsService(
      activityRepo,
      sleepRepo,
      heartRateRepo,
    );
    this.correlations = new CorrelationsService(
      activityRepo,
      sleepRepo,
      heartRateRepo,
      hrvRepo,
      foodRepo,
      eightSleepRepo,
      teslaDriveRepo,
      (days) => this.getReadiness(days),
    );
  }

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

  // --- Per-metric read-throughs ------------------------------------------

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

  // --- Readiness ----------------------------------------------------------

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

  // --- Driving ------------------------------------------------------------

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

  // --- Delegated analytics ------------------------------------------------

  async getWeeklyInsights(): Promise<WeeklyInsights> {
    return this.weekly.getWeeklyInsights();
  }

  async getCorrelations(): Promise<CorrelationsData> {
    return this.correlations.getCorrelations();
  }

  async getDayOfWeekHeatmap(): Promise<DayOfWeekHeatmapData> {
    return this.heatmap.getDayOfWeekHeatmap();
  }

  async getRecords(today?: string): Promise<RecordsData> {
    return this.records.getRecords(today);
  }
}
