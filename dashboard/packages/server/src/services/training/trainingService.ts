import type {
  ExerciseLog,
  ExerciseType,
  TrainingLoadDay,
  TrainingSession,
  TrainingSummary,
} from "@health-dashboard/shared";
import type { ExerciseLogRepository } from "../../repositories/exerciseLogRepo.js";
import type { HeartRateRepository } from "../../repositories/heartRateRepo.js";
import { classifyExercise } from "./exerciseClassifier.js";
import { sessionLoad, sumByType } from "./trainingLoad.js";

/**
 * Step-independent view of training.
 *
 * Takes only the two repositories it reads. Classification and the load
 * formula live in their own pure modules, so this class is composition:
 * fetch, classify, score, group by day.
 */
export class TrainingService {
  constructor(
    private readonly exerciseRepo: ExerciseLogRepository,
    private readonly heartRateRepo: HeartRateRepository,
    private readonly maxHeartRate?: number,
  ) {}

  async getSummary(start: string, end: string): Promise<TrainingSummary> {
    const [logs, heartRates] = await Promise.all([
      this.exerciseRepo.findByDateRange(start, end),
      this.heartRateRepo.findByDateRange(start, end),
    ]);

    // Resting HR is the baseline the intensity of every session is judged
    // against, so it is looked up per day rather than averaged.
    const restingByDate = new Map<string, number | null>(
      heartRates.map((h) => [h.date, h.restingHeartRate]),
    );

    const sessions = logs.map((log) =>
      this.toSession(log, restingByDate.get(log.date) ?? null),
    );

    const byDate = new Map<string, TrainingSession[]>();
    for (const s of sessions) {
      const list = byDate.get(s.date);
      if (list) list.push(s);
      else byDate.set(s.date, [s]);
    }

    const days: TrainingLoadDay[] = [...byDate.entries()]
      .map(([date, daySessions]) => ({
        date,
        load: round1(daySessions.reduce((sum, s) => sum + s.load, 0)),
        sessions: daySessions.length,
        minutes: Math.round(daySessions.reduce((sum, s) => sum + s.minutes, 0)),
        byType: sumByType(daySessions),
        estimated: daySessions.some((s) => s.estimated),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const spanDays = Math.max(1, dayCount(start, end));
    return {
      days,
      sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)),
      totalByType: sumByType(sessions),
      sessionsPerWeek: round1((sessions.length / spanDays) * 7),
    };
  }

  private toSession(log: ExerciseLog, restingHr: number | null): TrainingSession {
    const minutes = log.durationMs != null ? log.durationMs / 60_000 : 0;
    const type: ExerciseType = classifyExercise({
      activityName: log.activityName,
      steps: log.steps,
      averageHeartRate: log.averageHeartRate,
    });
    const { load, estimated } = sessionLoad({
      minutes,
      averageHeartRate: log.averageHeartRate,
      restingHeartRate: restingHr,
      maxHeartRate: this.maxHeartRate,
    });

    return {
      logId: log.logId,
      date: log.date,
      activityName: log.activityName,
      type,
      minutes: Math.round(minutes),
      averageHeartRate: log.averageHeartRate,
      steps: log.steps,
      calories: log.calories,
      load,
      estimated,
    };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function dayCount(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}
