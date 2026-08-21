import type {
  HealthSummary,
  WeeklyInsights,
  CorrelationsData,
  DayOfWeekHeatmapData,
  RecordsData,
  DrivingSummary,
  ReadinessScore,
  SensorAgreementData,
  WorkoutEffectsData,
  NutritionWeightReport,
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
import type { ReadinessDayInput } from "./readiness.js";
import { RecordsService } from "./health/records.js";
import { HeatmapService } from "./health/heatmap.js";
import { WeeklyInsightsService } from "./health/weeklyInsights.js";
import { CorrelationsService } from "./health/correlations.js";
import { SummaryUseCase } from "./health/summaryUseCase.js";
import { ReadinessUseCase } from "./health/readinessUseCase.js";
import { SensorAgreementService } from "./health/sensorAgreement.js";
import { RecoveryAnomalyService } from "./health/recoveryAnomalies.js";
import { WorkoutEffectsService } from "./health/workoutEffects.js";
import { NutritionWeightInsightsService } from "./health/nutritionWeightInsights.js";
import { TrainingService } from "./training/trainingService.js";

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
  private readonly summary: SummaryUseCase;
  private readonly readiness: ReadinessUseCase;
  private readonly sensorAgreement: SensorAgreementService;
  private readonly recoveryAnomalies: RecoveryAnomalyService;
  private readonly workoutEffects: WorkoutEffectsService;
  private readonly nutritionWeight: NutritionWeightInsightsService;

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
    opts: { userTimezone: string } = { userTimezone: "America/New_York" },
  ) {
    this.summary = new SummaryUseCase(activityRepo, sleepRepo, heartRateRepo, weightRepo);
    this.readiness = new ReadinessUseCase(
      hrvRepo, heartRateRepo, sleepRepo, breathingRateRepo,
      spo2Repo, skinTempRepo, eightSleepRepo,
    );
    this.sensorAgreement = new SensorAgreementService(
      sleepRepo, hrvRepo, heartRateRepo, breathingRateRepo, eightSleepRepo,
    );
    this.recoveryAnomalies = new RecoveryAnomalyService(
      (limit) => this.readiness.inputs(limit),
    );
    this.workoutEffects = new WorkoutEffectsService(
      exerciseLogRepo, sleepRepo, heartRateRepo, hrvRepo, eightSleepRepo,
      opts.userTimezone,
    );
    this.nutritionWeight = new NutritionWeightInsightsService(
      foodRepo,
      activityRepo,
      weightRepo,
      new TrainingService(exerciseLogRepo, heartRateRepo),
    );
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
    return this.summary.execute();
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

  async getNutritionWeight(
    start: string,
    end: string,
    currentLocalDate: string,
  ): Promise<NutritionWeightReport> {
    return this.nutritionWeight.get(start, end, currentLocalDate);
  }

  // --- Readiness ----------------------------------------------------------

  /**
   * Join ~90 days of every recovery signal into one row-per-day series.
   * 90 days comfortably covers the 30-day baseline window plus the
   * 14-day history. Shared by `getReadiness` and the alert evaluator so
   * the join lives in exactly one place.
   */
  async getReadinessInputs(): Promise<ReadinessDayInput[]> {
    return this.readiness.inputs();
  }

  /**
   * Compute the personal readiness score from the joined inputs — see
   * `services/readiness.ts` for the z-vs-baseline methodology.
   */
  async getReadiness(historyDays?: number): Promise<ReadinessScore> {
    return this.readiness.execute(historyDays);
  }

  async getSensorAgreement(
    start: string,
    end: string,
    timezone: string,
  ): Promise<SensorAgreementData> {
    return this.sensorAgreement.get(start, end, timezone);
  }

  async getRecoveryAnomalies(start: string, end: string, currentDate: string) {
    return this.recoveryAnomalies.get(start, end, currentDate);
  }

  async getWorkoutEffects(today: string): Promise<WorkoutEffectsData> {
    return this.workoutEffects.get(today);
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

  async getWeeklyInsights(today?: string): Promise<WeeklyInsights> {
    return this.weekly.getWeeklyInsights(today);
  }

  async getCorrelations(today?: string): Promise<CorrelationsData> {
    return this.correlations.getCorrelations(today);
  }

  async getDayOfWeekHeatmap(today?: string): Promise<DayOfWeekHeatmapData> {
    return this.heatmap.getDayOfWeekHeatmap(today);
  }

  async getRecords(today?: string): Promise<RecordsData> {
    return this.records.getRecords(today);
  }
}
