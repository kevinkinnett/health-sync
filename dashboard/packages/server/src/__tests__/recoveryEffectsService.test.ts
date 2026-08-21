import { describe, expect, it, vi } from "vitest";
import type { RecoveryActivity, RecoverySession, SleepDay } from "@health-dashboard/shared";
import { RecoveryEffectsService } from "../services/recoveryEffectsService.js";

describe("RecoveryEffectsService", () => {
  it("loads every required signal and reports sparse evidence coverage", async () => {
    const activity: RecoveryActivity = {
      id: 1,
      code: "hot_blanket",
      name: "Hot blanket",
      category: "heat_therapy",
      defaultDurationMinutes: null,
      notes: null,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const session: RecoverySession = {
      id: 7,
      activityId: 1,
      activityCode: "hot_blanket",
      activityName: "Hot blanket",
      activityCategory: "heat_therapy",
      startedAt: "2026-08-19T03:30:00.000Z",
      durationMinutes: 30,
      intensity: 3,
      temperatureF: 140,
      massageType: null,
      notes: null,
      source: "manual",
      createdAt: "2026-08-19T03:30:00.000Z",
      updatedAt: "2026-08-19T03:30:00.000Z",
    };
    const sleep: SleepDay = {
      date: "2026-08-19",
      totalMinutesAsleep: 450,
      totalMinutesInBed: 480,
      totalSleepRecords: 1,
      napMinutesAsleep: 0,
      minutesDeep: 80,
      minutesLight: 280,
      minutesRem: 90,
      minutesWake: 30,
      efficiency: 94,
      mainSleepStartTime: "2026-08-19T05:00:00.000Z",
      mainSleepEndTime: "2026-08-19T13:00:00.000Z",
      measurementMethod: "main_sleep_v2",
      fetchedAt: "2026-08-19T14:00:00.000Z",
    };
    const recoveryRepo = {
      listActivities: vi.fn().mockResolvedValue([activity]),
      listSessions: vi.fn().mockResolvedValue([session]),
    };
    const sleepRepo = { findLatest: vi.fn().mockResolvedValue([sleep]) };
    const heartRateRepo = { findLatest: vi.fn().mockResolvedValue([{ date: "2026-08-19", restingHeartRate: 57 }]) };
    const hrvRepo = { findLatest: vi.fn().mockResolvedValue([{ date: "2026-08-19", dailyRmssd: 44, measurementMethod: "sample_mean_v1" }]) };
    const eightSleepRepo = { findLatest: vi.fn().mockResolvedValue([{ date: "2026-08-19", tnt: 12, sleepStart: "2026-08-19T05:00:00.000Z" }]) };
    const exerciseRepo = { findLatest: vi.fn().mockResolvedValue([]) };
    const healthDataService = {
      getReadiness: vi.fn().mockResolvedValue({ history: [{ date: "2026-08-19", score: 72 }] }),
    };
    const service = new RecoveryEffectsService(
      recoveryRepo as never,
      sleepRepo as never,
      heartRateRepo as never,
      hrvRepo as never,
      eightSleepRepo as never,
      exerciseRepo as never,
      healthDataService as never,
      "America/New_York",
    );

    const result = await service.get("2026-08-21");

    expect(result).toMatchObject({
      methodVersion: "recovery-effects-v1-matched-sleep-periods",
      timezone: "America/New_York",
      coverage: [{ sessions: 1, alignedSessions: 1, matchedPairs: 0, requiredPairs: 10 }],
      effects: [],
    });
    expect(healthDataService.getReadiness).toHaveBeenCalledWith(700);
    expect(exerciseRepo.findLatest).toHaveBeenCalled();
  });
});
