import type { HealthSummary, SparklineData } from "@health-dashboard/shared";
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
}
