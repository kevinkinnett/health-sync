import type { RecoveryEffectsData } from "@health-dashboard/shared";
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
  estimateRecoveryEffects,
  RECOVERY_MAX_MATCH_DAY_DISTANCE,
  RECOVERY_MAX_SESSION_TO_SLEEP_HOURS,
  RECOVERY_MIN_MATCHES,
  type RecoverySleepPeriod,
} from "./analysis/recoveryEffectEngine.js";

export const RECOVERY_EFFECT_METHOD_VERSION = "recovery-effects-v1-matched-sleep-periods";
const MAX_DAYS = 700;

/** Repository orchestration for recovery-session matched-period analysis. */
export class RecoveryEffectsService {
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

  async get(today: string): Promise<RecoveryEffectsData> {
    const start = addDays(today, -MAX_DAYS);
    const end = addDays(today, -1);
    const [activities, sessions, rawSleep, rawHeartRate, rawHrv, rawEightSleep, rawExercise, readiness] =
      await Promise.all([
        this.recoveryRepo.listActivities(true),
        this.recoveryRepo.listSessions(addDays(start, -1), end, undefined, this.timezone),
        this.sleepRepo.findLatest(MAX_DAYS + 10),
        this.heartRateRepo.findLatest(MAX_DAYS + 10),
        this.hrvRepo.findLatest(MAX_DAYS + 10),
        this.eightSleepRepo.findLatest(MAX_DAYS + 10),
        this.exerciseRepo.findLatest(2_000),
        this.healthDataService.getReadiness(MAX_DAYS),
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
    const sleep = sleepRegime == null
      ? sleepAll
      : sleepAll.filter((row) => row.measurementMethod === sleepRegime);
    const hrv = hrvRegime == null
      ? hrvAll
      : hrvAll.filter((row) => row.measurementMethod === hrvRegime);

    const sleepByDate = new Map(sleep.map((day) => [day.date, day]));
    const heartRateByDate = new Map(heartRate.map((day) => [day.date, day]));
    const hrvByDate = new Map(hrv.map((day) => [day.date, day]));
    const eightByDate = new Map(eightSleep.map((day) => [day.date, day]));
    const readinessByDate = new Map(readiness.history.map((day) => [day.date, day.score]));
    const restingByDate = new Map(heartRate.map((day) => [day.date, day.restingHeartRate]));
    const trainingDays = buildTrainingDays(buildTrainingSessions(exercise, restingByDate));
    const trainingByDate = new Map(trainingDays.map((day) => [day.date, day]));

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

    const aligned = alignRecoverySessions(sessions, periods);
    const engine = estimateRecoveryEffects(activities, aligned);
    const alignedSessionIds = new Set(aligned.flatMap((period) => period.sessions.map((session) => session.id)));
    const coverage = activities.map((activity) => {
      const activitySessions = sessions.filter((session) => session.activityId === activity.id);
      const combinedExposures = aligned.filter((period) => {
        const ids = new Set(period.sessions.map((session) => session.activityId));
        return ids.size > 1 && ids.has(activity.id);
      }).length;
      return {
        activityId: activity.id,
        activityCode: activity.code,
        activityName: activity.name,
        sessions: activitySessions.length,
        alignedSessions: activitySessions.filter((session) => alignedSessionIds.has(session.id)).length,
        combinedExposures,
        matchedPairs: engine.matchedPairsByActivity.get(activity.id) ?? 0,
        requiredPairs: RECOVERY_MIN_MATCHES,
      };
    });

    return {
      methodVersion: RECOVERY_EFFECT_METHOD_VERSION,
      timezone: this.timezone,
      window: { start, end },
      coverage,
      effects: engine.effects,
      matching: {
        weekdayMatched: true,
        maximumDayDistance: RECOVERY_MAX_MATCH_DAY_DISTANCE,
        maximumSessionToSleepHours: RECOVERY_MAX_SESSION_TO_SLEEP_HOURS,
        minimumMatchedPairs: RECOVERY_MIN_MATCHES,
        covariates: [
          "prior main-sleep duration",
          "prior resting heart rate",
          "prior HRV",
          "prior 7-day training load",
          "calendar proximity",
        ],
      },
      caveats: [
        "These are adjusted within-person associations, not proof that a recovery activity caused the change.",
        "A session is assigned to the first main overnight sleep that starts after it ends, up to 24 hours later.",
        "Nights containing more than one recovery activity type are counted as combined exposures but excluded from single-activity estimates.",
        "Each outcome is matched separately, so missing sensor data can produce different sample counts.",
        "The current Eastern calendar day is excluded because its sleep and recovery data may still be incomplete.",
      ],
    };
  }
}

function latestRegime<T extends { date: string; measurementMethod: string }>(rows: T[]): string | null {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date))[0]?.measurementMethod ?? null;
}
