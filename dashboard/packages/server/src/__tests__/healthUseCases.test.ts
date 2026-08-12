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
      provisional: false,
      hrv: {
        fitbit: { value: 50, measurement: "Overnight HRV (RMSSD)", comparisonGroup: "overnight_hrv_rmssd", regime: "unknown" },
        eightSleep: { value: 47, measurement: "Overnight HRV (RMSSD)", comparisonGroup: "overnight_hrv_rmssd", regime: "eight_sleep_main_session_v1" },
      },
      rhr: {
        fitbit: { value: 58, measurement: "Daily resting heart rate", comparisonGroup: "daily_resting_hr", regime: "google_health_daily_rhr_v1" },
        eightSleep: { value: 60, measurement: "Average sleeping heart rate", comparisonGroup: "average_sleeping_hr", regime: "eight_sleep_main_session_v1" },
      },
      sleepMin: {
        fitbit: { value: 430, measurement: "Main-session sleep duration", comparisonGroup: "main_sleep_duration", regime: "unknown" },
        eightSleep: { value: 440, measurement: "Main-session sleep duration", comparisonGroup: "main_sleep_duration", regime: "eight_sleep_main_session_v1" },
      },
      breathing: {
        fitbit: { value: 14, measurement: "Overnight respiratory rate", comparisonGroup: "overnight_breathing", regime: "google_health_daily_respiratory_v1" },
        eightSleep: { value: 13.5, measurement: "Overnight respiratory rate", comparisonGroup: "overnight_breathing", regime: "eight_sleep_main_session_v1" },
      },
      spo2: { fitbit: { value: 96, measurement: "Overnight oxygen saturation", comparisonGroup: "overnight_spo2", regime: "google_health_overnight_spo2_v1" } },
      skinTemp: 0.1, restlessness: 8,
    }]);
  });

  it("prefers native non-REM heart rate and marks the Eastern current day provisional", async () => {
    const useCase = new ReadinessUseCase(
      reader([{
        date: "2026-08-11",
        dailyRmssd: 50,
        deepRmssd: 45,
        nonRemHeartRate: 54,
        measurementMethod: "daily_hrv_v1",
      }] as never[]),
      reader([{ date: "2026-08-11", restingHeartRate: 59 }] as never[]),
      reader([]), reader([]), reader([]), reader([]), reader([]),
      // 02:30 UTC is still the prior Eastern calendar day (EDT).
      () => new Date("2026-08-12T02:30:00Z"),
    );

    const [input] = await useCase.inputs();
    expect(input.provisional).toBe(true);
    expect(input.rhr.fitbit).toEqual({
      value: 54,
      measurement: "Non-REM sleeping heart rate",
      comparisonGroup: "non_rem_sleeping_hr",
      regime: "daily_hrv_v1",
    });
  });
});
