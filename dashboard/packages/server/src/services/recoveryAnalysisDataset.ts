import type { RecoveryActivity, RecoverySession } from "@health-dashboard/shared";
import type { RecoveryRepository } from "../repositories/recoveryRepo.js";
import type { SleepRepository } from "../repositories/sleepRepo.js";
import type { HeartRateRepository } from "../repositories/heartRateRepo.js";
import type { HrvRepository } from "../repositories/hrvRepo.js";
import type { EightSleepRepository } from "../repositories/eightSleepRepo.js";
import type { ExerciseLogRepository } from "../repositories/exerciseLogRepo.js";
import type { HealthDataService } from "./healthDataService.js";
import { buildTrainingDays, buildTrainingSessions } from "./training/trainingSessionBuilder.js";
import { addDays } from "./userTz.js";
import {
  alignRecoverySessions,
  type AlignedRecoveryPeriod,
  type RecoverySleepPeriod,
} from "./analysis/recoveryEffectEngine.js";

export const RECOVERY_ANALYSIS_MAX_DAYS = 700;

export interface RecoveryAnalysisDataset {
  timezone: string;
  window: { start: string; end: string };
  activities: RecoveryActivity[];
  sessions: RecoverySession[];
  periods: AlignedRecoveryPeriod[];
  measurementRegimes: { sleep: string | null; hrv: string | null };
}

/** Loads and normalizes the one canonical dataset used by all recovery analyses. */
export class RecoveryAnalysisDatasetBuilder {
  constructor(
    private readonly recoveryRepo: RecoveryRepository,
    private readonly sleepRepo: SleepRepository,
    private readonly heartRateRepo: HeartRateRepository,
    private readonly hrvRepo: HrvRepository,
    private readonly eightSleepRepo: EightSleepRepository,
    private readonly exerciseRepo: ExerciseLogRepository,
    private readonly healthDataService: HealthDataService,
    private readonly timezone = "America/New_York",
  ) {}

  async build(today: string): Promise<RecoveryAnalysisDataset> {
    const start = addDays(today, -RECOVERY_ANALYSIS_MAX_DAYS);
    const end = addDays(today, -1);
    const [activities, sessions, rawSleep, rawHeartRate, rawHrv, rawEightSleep, rawExercise, readiness] =
      await Promise.all([
        this.recoveryRepo.listActivities(true),
        this.recoveryRepo.listSessions(addDays(start, -1), end, undefined, this.timezone),
        this.sleepRepo.findLatest(RECOVERY_ANALYSIS_MAX_DAYS + 10),
        this.heartRateRepo.findLatest(RECOVERY_ANALYSIS_MAX_DAYS + 10),
        this.hrvRepo.findLatest(RECOVERY_ANALYSIS_MAX_DAYS + 10),
        this.eightSleepRepo.findLatest(RECOVERY_ANALYSIS_MAX_DAYS + 10),
        this.exerciseRepo.findLatest(2_000),
        this.healthDataService.getReadiness(RECOVERY_ANALYSIS_MAX_DAYS),
      ]);

    const completed = <T extends { date: string }>(rows: T[]) =>
      rows.filter((row) => row.date >= addDays(start, -8) && row.date <= end);
    const sleepAll = completed(rawSleep);
    const hrvAll = completed(rawHrv);
    const heartRate = completed(rawHeartRate);
    const eightSleep = completed(rawEightSleep);
    const exercise = completed(rawExercise);
    const sleepRegime = latestRegime(sleepAll);
    const hrvRegime = latestRegime(hrvAll);
    const sleep = sleepRegime == null ? sleepAll : sleepAll.filter((row) => row.measurementMethod === sleepRegime);
    const hrv = hrvRegime == null ? hrvAll : hrvAll.filter((row) => row.measurementMethod === hrvRegime);

    const sleepByDate = new Map(sleep.map((day) => [day.date, day]));
    const heartRateByDate = new Map(heartRate.map((day) => [day.date, day]));
    const hrvByDate = new Map(hrv.map((day) => [day.date, day]));
    const eightByDate = new Map(eightSleep.map((day) => [day.date, day]));
    const readinessByDate = new Map(readiness.history.map((day) => [day.date, day.score]));
    const restingByDate = new Map(heartRate.map((day) => [day.date, day.restingHeartRate]));
    const trainingByDate = new Map(
      buildTrainingDays(buildTrainingSessions(exercise, restingByDate)).map((day) => [day.date, day]),
    );

    const periods: RecoverySleepPeriod[] = sleep
      .filter((day) => day.date >= start && day.date <= end)
      .flatMap((day) => {
        const eight = eightByDate.get(day.date);
        const sleepStartAt = day.mainSleepStartTime ?? eight?.sleepStart ?? null;
        if (sleepStartAt == null) return [];
        const priorDate = addDays(day.date, -1);
        let recentTrainingLoad7 = 0;
        for (let offset = 1; offset <= 7; offset++) {
          recentTrainingLoad7 += trainingByDate.get(addDays(day.date, -offset))?.load ?? 0;
        }
        return [{
          date: day.date,
          sleepStartAt,
          weekday: new Date(`${day.date}T00:00:00Z`).getUTCDay(),
          priorSleepMinutes: sleepByDate.get(priorDate)?.totalMinutesAsleep ?? null,
          priorRestingHeartRate: heartRateByDate.get(priorDate)?.restingHeartRate ?? null,
          priorHrv: hrvByDate.get(priorDate)?.dailyRmssd ?? null,
          recentTrainingLoad7,
          outcomes: {
            sleepDuration: day.totalMinutesAsleep,
            sleepEfficiency: day.efficiency,
            restingHeartRate: heartRateByDate.get(day.date)?.restingHeartRate ?? null,
            hrv: hrvByDate.get(day.date)?.dailyRmssd ?? null,
            restlessness: eight?.tnt ?? null,
            readiness: readinessByDate.get(day.date) ?? null,
          },
        }];
      });

    return {
      timezone: this.timezone,
      window: { start, end },
      activities,
      sessions,
      periods: alignRecoverySessions(sessions, periods),
      measurementRegimes: { sleep: sleepRegime, hrv: hrvRegime },
    };
  }
}

function latestRegime<T extends { date: string; measurementMethod: string }>(rows: T[]): string | null {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date))[0]?.measurementMethod ?? null;
}
