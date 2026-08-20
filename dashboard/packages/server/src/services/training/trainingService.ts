import type {
  TrainingSummary,
} from "@health-dashboard/shared";
import type { ExerciseLogRepository } from "../../repositories/exerciseLogRepo.js";
import type { HeartRateRepository } from "../../repositories/heartRateRepo.js";
import { sumByType } from "./trainingLoad.js";
import { buildTrainingDays, buildTrainingSessions } from "./trainingSessionBuilder.js";

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

    const sessions = buildTrainingSessions(logs, restingByDate, this.maxHeartRate);
    const days = buildTrainingDays(sessions);

    const spanDays = Math.max(1, dayCount(start, end));
    return {
      days,
      sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)),
      totalByType: sumByType(sessions),
      sessionsPerWeek: round1((sessions.length / spanDays) * 7),
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
