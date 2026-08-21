import type { WorkoutEffectsData } from "@health-dashboard/shared";
import type { ExerciseLogRepository } from "../../repositories/exerciseLogRepo.js";
import type { SleepRepository } from "../../repositories/sleepRepo.js";
import type { HeartRateRepository } from "../../repositories/heartRateRepo.js";
import type { HrvRepository } from "../../repositories/hrvRepo.js";
import type { EightSleepRepository } from "../../repositories/eightSleepRepo.js";
import { buildTrainingDays, buildTrainingSessions } from "../training/trainingSessionBuilder.js";
import { buildDailyAnalysisRows } from "../analysis/dailyAnalysis.js";
import { estimateWorkoutEffects, MAX_MATCH_DAY_DISTANCE } from "../analysis/workoutEffectEngine.js";
import { addDays } from "../userTz.js";

export const WORKOUT_EFFECT_METHOD_VERSION = "workout-effects-v1-matched-days";
const MAX_DAYS = 700;

/** Repository orchestration for the pure matched-day effect engine. */
export class WorkoutEffectsService {
  constructor(
    private readonly exerciseRepo: ExerciseLogRepository,
    private readonly sleepRepo: SleepRepository,
    private readonly heartRateRepo: HeartRateRepository,
    private readonly hrvRepo: HrvRepository,
    private readonly eightSleepRepo: EightSleepRepository,
    private readonly timezone = "America/New_York",
  ) {}

  async get(today: string): Promise<WorkoutEffectsData> {
    const [rawLogs, rawSleep, rawHeartRate, rawHrv, rawEightSleep] = await Promise.all([
      this.exerciseRepo.findLatest(1_000),
      this.sleepRepo.findLatest(MAX_DAYS),
      this.heartRateRepo.findLatest(MAX_DAYS),
      this.hrvRepo.findLatest(MAX_DAYS),
      this.eightSleepRepo.findLatest(MAX_DAYS),
    ]);
    const completed = <T extends { date: string }>(rows: T[]) => rows.filter((row) => row.date < today);
    const logs = completed(rawLogs);
    const sleepAll = completed(rawSleep);
    const heartRate = completed(rawHeartRate);
    const hrvAll = completed(rawHrv);
    const eightSleep = completed(rawEightSleep);
    const latestRegime = <T extends { date: string; measurementMethod: string }>(rows: T[]) =>
      [...rows].sort((a, b) => b.date.localeCompare(a.date))[0]?.measurementMethod ?? null;
    const sleepRegime = latestRegime(sleepAll);
    const hrvRegime = latestRegime(hrvAll);
    const sleep = sleepRegime == null ? sleepAll : sleepAll.filter((row) => row.measurementMethod === sleepRegime);
    const hrv = hrvRegime == null ? hrvAll : hrvAll.filter((row) => row.measurementMethod === hrvRegime);
    const restingByDate = new Map(heartRate.map((day) => [day.date, day.restingHeartRate]));
    const sessions = buildTrainingSessions(logs, restingByDate);
    const trainingDays = buildTrainingDays(sessions);
    const start = trainingDays[0]?.date ?? null;
    const end = addDays(today, -1);
    const rows = start == null ? [] : buildDailyAnalysisRows({
      start,
      end,
      trainingDays,
      sleep,
      heartRate,
      hrv,
      eightSleep,
    });

    return {
      methodVersion: WORKOUT_EFFECT_METHOD_VERSION,
      timezone: this.timezone,
      window: { start, end: start == null ? null : end },
      sessions: sessions.length,
      workoutDays: trainingDays.length,
      effects: estimateWorkoutEffects(rows),
      matching: {
        weekdayMatched: true,
        maximumDayDistance: MAX_MATCH_DAY_DISTANCE,
        covariates: ["previous-night sleep", "morning resting HR", "morning HRV", "prior 7-day training load", "calendar proximity"],
      },
      caveats: [
        "These are adjusted within-person associations, not proof that a workout caused the change.",
        "Workout days are matched to unused rest days with the same weekday and similar pre-workout recovery.",
        "Sleep and HRV comparisons stay inside the latest measurement regime; sparse outcomes are omitted until at least 10 matched days exist.",
        "The current Eastern calendar day is excluded because its exercise and recovery data may still be incomplete.",
      ],
    };
  }
}
