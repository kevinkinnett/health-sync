import { describe, expect, it, vi } from "vitest";
import type { RecoveryActivity, RecoverySession } from "@health-dashboard/shared";
import { RecoveryEventStudyService } from "../services/recoveryEventStudyService.js";

describe("RecoveryEventStudyService", () => {
  it("orchestrates the canonical dataset and withholds matched conclusions below ten pairs", async () => {
    const activity: RecoveryActivity = {
      id: 2, code: "massage", name: "Massage", category: "massage",
      defaultDurationMinutes: null, notes: null, isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const exposure: RecoverySession = {
      id: 9, activityId: 2, activityCode: "massage", activityName: "Massage",
      activityCategory: "massage", startedAt: "2026-08-19T01:00:00.000Z",
      durationMinutes: 25, intensity: null, temperatureF: null, massageType: null,
      notes: null, source: "manual", createdAt: "2026-08-19T01:00:00.000Z",
      updatedAt: "2026-08-19T01:00:00.000Z",
    };
    const dataset = {
      build: vi.fn().mockResolvedValue({
        timezone: "America/New_York",
        window: { start: "2024-09-20", end: "2026-08-20" },
        activities: [activity],
        sessions: [exposure],
        measurementRegimes: { sleep: "main_sleep_v2", hrv: "sample_mean_v1" },
        periods: [{
          date: "2026-08-19", sleepStartAt: "2026-08-19T05:00:00.000Z", weekday: 3,
          priorSleepMinutes: 430, priorRestingHeartRate: 58, priorHrv: 42,
          recentTrainingLoad7: 12,
          outcomes: { sleepDuration: 450, sleepEfficiency: 94, restingHeartRate: 57, hrv: 44, restlessness: 10, readiness: 74 },
          sessions: [exposure],
        }],
      }),
    };
    const service = new RecoveryEventStudyService(dataset as never, "America/New_York");

    const result = await service.get("2026-08-21", 2, "hrv");

    expect(dataset.build).toHaveBeenCalledWith("2026-08-21");
    expect(result).toMatchObject({
      methodVersion: "recovery-event-study-v1-descriptive-windows",
      activityName: "Massage",
      outcome: "hrv",
      unit: "ms",
      evidenceState: "individual",
      totalEvents: 1,
      matchedPairs: 0,
      matchedEstimate: null,
    });
    expect(result.trajectories[0]).toMatchObject({
      totalDurationMinutes: 25,
      sessionToSleepMinutes: 215,
      durationGroup: "short",
    });
    expect(result.durationResponses).toHaveLength(8);
    expect(result.durationResponses[0]).toMatchObject({ state: "insufficient_events", eligibleEvents: 0 });
    expect(result.timingResponses).toHaveLength(8);
    expect(result.timingResponses[0]).toMatchObject({ state: "insufficient_events", eligibleEvents: 0 });
    expect(result.trajectories[0].points).toHaveLength(15);
  });
});
