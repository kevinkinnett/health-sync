import { describe, expect, it } from "vitest";
import { SummaryUseCase } from "../services/health/summaryUseCase.js";
import { ReadinessUseCase } from "../services/health/readinessUseCase.js";

const reader = <T>(rows: T[]) => ({ findLatest: async () => rows });

describe("focused health use cases", () => {
  it("builds summary sparklines oldest-to-newest and converts sleep to hours", async () => {
    const useCase = new SummaryUseCase(
      reader([{ date: "2026-08-10", steps: 10 }, { date: "2026-08-09", steps: 9 }] as never[]),
      reader([{ date: "2026-08-10", totalMinutesAsleep: 453 }] as never[]),
      reader([{ date: "2026-08-10", restingHeartRate: 58 }] as never[]),
      reader([{ date: "2026-08-10", weightKg: 80 }] as never[]),
    );
    const result = await useCase.execute();
    expect(result.activity.sparkline.map((point) => point.date)).toEqual(["2026-08-09", "2026-08-10"]);
    expect(result.sleep.sparkline[0]?.value).toBe(7.6);
  });

  it("joins Fitbit-device and Eight Sleep signals by calendar date", async () => {
    const useCase = new ReadinessUseCase(
      reader([{ date: "2026-08-10", dailyRmssd: 50 }] as never[]),
      reader([{ date: "2026-08-10", restingHeartRate: 58 }] as never[]),
      reader([{ date: "2026-08-10", totalMinutesAsleep: 430 }] as never[]),
      reader([{ date: "2026-08-10", breathingRate: 14 }] as never[]),
      reader([{ date: "2026-08-10", avgValue: 96 }] as never[]),
      reader([{ date: "2026-08-10", nightlyRelative: 0.1 }] as never[]),
      reader([{
        date: "2026-08-10", avgHrvRmssd: 47, avgHeartRate: 60,
        sleepDurationMin: 440, avgRespiratoryRate: 13.5, tnt: 8,
      }] as never[]),
    );
    await expect(useCase.inputs()).resolves.toEqual([{
      date: "2026-08-10",
      hrv: { fitbit: 50, eightSleep: 47 },
      rhr: { fitbit: 58, eightSleep: 60 },
      sleepMin: { fitbit: 430, eightSleep: 440 },
      breathing: { fitbit: 14, eightSleep: 13.5 },
      spo2: { fitbit: 96 }, skinTemp: 0.1, restlessness: 8,
    }]);
  });
});
