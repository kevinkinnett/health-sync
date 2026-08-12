import { describe, expect, it } from "vitest";
import { SummaryUseCase } from "../services/health/summaryUseCase.js";
import { ReadinessUseCase } from "../services/health/readinessUseCase.js";
import { SensorAgreementService } from "../services/health/sensorAgreement.js";
import { WeeklyInsightsService } from "../services/health/weeklyInsights.js";
import { HeatmapService } from "../services/health/heatmap.js";
import { addDays } from "../services/userTz.js";

const reader = <T>(rows: T[]) => ({ findLatest: async () => rows });
const rangeReader = <T extends { date: string }>(rows: T[]) => ({
  findLatest: async (n: number) => [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n),
  findByDateRange: async (start: string, end: string) =>
    rows.filter((row) => row.date >= start && row.date <= end),
});

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

  it("pairs sensors on local wake date and keeps different heart-rate definitions separate", async () => {
    const useCase = new SensorAgreementService(
      rangeReader([
        {
          date: "2026-08-09", totalMinutesAsleep: 400, totalMinutesInBed: 430,
          napMinutesAsleep: 20, totalSleepRecords: 2, minutesDeep: 80,
          minutesLight: 240, minutesRem: 80, minutesWake: 30, efficiency: 93,
          mainSleepStartTime: "2026-08-09T03:00:00Z",
          mainSleepEndTime: "2026-08-09T10:10:00Z",
          measurementMethod: "main_sleep_v2",
        },
        { date: "2026-08-10", totalMinutesAsleep: 420, measurementMethod: "main_sleep_v2" },
      ] as never[]),
      rangeReader([] as never[]),
      rangeReader([
        { date: "2026-08-09", restingHeartRate: 58 },
        { date: "2026-08-10", restingHeartRate: 60 },
      ] as never[]),
      rangeReader([] as never[]),
      rangeReader([
        {
          date: "2026-08-09", sleepDurationMin: 410, avgHeartRate: 61,
          sleepStart: "2026-08-09T03:20:00Z", sleepEnd: "2026-08-09T10:15:00Z",
          score: 86, deepMin: 90, lightMin: 240, remMin: 80, tnt: 7,
          avgBedTempC: 27.1, avgRoomTempC: 20.3,
        },
        { date: "2026-08-10", sleepDurationMin: 450, avgHeartRate: 63 },
      ] as never[]),
    );

    const result = await useCase.get("2026-08-01", "2026-08-10", "America/New_York");
    const sleep = result.series.find((series) => series.metric === "sleep")!;
    const heartRate = result.series.find((series) => series.metric === "heartRate")!;
    expect(result.dateSemantics).toBe("local_wake_date");
    expect(sleep.meanAbsoluteDifference).toBe(20);
    expect(sleep.largestDivergences[0]?.date).toBe("2026-08-10");
    expect(heartRate.measurementComparable).toBe(false);
    expect(heartRate.points.every((point) => point.difference == null)).toBe(true);
    expect(heartRate.points.every((point) => point.fitbitZ != null && point.eightSleepZ != null)).toBe(true);
    expect(result.nights[0]).toMatchObject({
      date: "2026-08-09",
      fitbit: { napMin: 20, sleepRecords: 2, sessionStart: "2026-08-09T03:00:00Z" },
      eightSleep: { score: 86, tossAndTurnCount: 7, sessionStart: "2026-08-09T03:20:00Z" },
    });
  });

  it("labels evidence strength and sustained relative-trend divergence conservatively", async () => {
    const dates = Array.from({ length: 14 }, (_, index) => `2026-07-${String(index + 1).padStart(2, "0")}`);
    const fitbitValues = dates.map((date, index) => ({
      date, totalMinutesAsleep: 360 + index * 10, measurementMethod: "main_sleep_v2",
    }));
    const eightValues = dates.map((date, index) => ({
      date,
      sleepDurationMin: index < 3 ? 520 - index * 10 : 360 + index * 10,
    }));
    const useCase = new SensorAgreementService(
      rangeReader(fitbitValues as never[]), rangeReader([] as never[]),
      rangeReader([] as never[]), rangeReader([] as never[]),
      rangeReader(eightValues as never[]),
    );

    const result = await useCase.get(dates[0], dates.at(-1)!, "America/New_York");
    const sleep = result.series.find((series) => series.metric === "sleep")!;
    expect(sleep.evidence.level).toBe("established");
    expect(sleep.evidence.latestRollingCorrelation).not.toBeNull();
    expect(sleep.points.slice(0, 3).map((point) => point.divergencePattern)).toEqual([
      "sustained", "sustained", "sustained",
    ]);
    expect(sleep.points[13].rollingCorrelation).not.toBeNull();
  });

  it("does not bridge measurement regimes when rating sensor evidence", async () => {
    const dates = Array.from({ length: 10 }, (_, index) => `2026-06-${String(index + 1).padStart(2, "0")}`);
    const useCase = new SensorAgreementService(
      rangeReader(dates.map((date, index) => ({
        date,
        totalMinutesAsleep: 400 + index * 5,
        measurementMethod: index < 3 ? "fitbit_legacy_main_v1" : "main_sleep_v2",
      })) as never),
      rangeReader([] as never[]), rangeReader([] as never[]), rangeReader([] as never[]),
      rangeReader(dates.map((date, index) => ({ date, sleepDurationMin: 410 + index * 5 })) as never),
    );

    const result = await useCase.get(dates[0], dates.at(-1)!, "America/New_York");
    const sleep = result.series.find((series) => series.metric === "sleep")!;
    expect(sleep.joinedDays).toBe(10);
    expect(sleep.evidence).toMatchObject({ level: "limited", analysisNights: 7, regimeCount: 2 });
    expect(sleep.correlation).toBe(1);
    expect(sleep.evidence.interpretation).toContain("latest measurement regime");
    expect(sleep.points[3].rollingCorrelation).toBeNull();
    expect(sleep.points[9].rollingCorrelation).toBe(1);
  });

  it("anchors weekly comparisons to the latest completed Eastern day", async () => {
    const completed = Array.from({ length: 14 }, (_, index) => ({
      date: addDays("2026-08-11", -index),
      steps: 5_000 + index,
      minutesFairlyActive: 10,
      minutesVeryActive: 5,
      distanceKm: 4,
      caloriesOut: 2_000,
    }));
    const activity = rangeReader([
      { ...completed[0], date: "2026-08-12", steps: 25 },
      ...completed,
    ] as never[]);
    const useCase = new WeeklyInsightsService(
      activity as never,
      rangeReader([] as never[]) as never,
      rangeReader([] as never[]) as never,
    );

    const result = await useCase.getWeeklyInsights("2026-08-12");
    expect(result.currentPeriod.end).toBe("2026-08-11");
    expect(result.dayOfWeekDays).toBe(14);
    expect(result.dayOfWeek.reduce((sum, day) => sum + day.samples, 0)).toBe(14);
    expect(result.dayOfWeek.map((day) => day.dayName)).toEqual([
      "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
    ]);
  });

  it("keeps heatmap sleep averages within the latest measurement regime", async () => {
    const activity = rangeReader([
      { date: "2026-07-06", steps: 4_000 },
      { date: "2026-08-03", steps: 6_000 },
    ] as never[]);
    const sleep = rangeReader([
      { date: "2026-07-06", totalMinutesAsleep: 300, measurementMethod: "fitbit_legacy_main_v1" },
      { date: "2026-08-03", totalMinutesAsleep: 450, measurementMethod: "main_sleep_v2" },
    ] as never[]);
    const useCase = new HeatmapService(activity as never, sleep as never, rangeReader([] as never[]) as never);

    const result = await useCase.getDayOfWeekHeatmap("2026-08-04");
    const sleepRow = result.rows.find((row) => row.metric === "sleepMin")!;
    expect(result.dayNames[0]).toBe("Mon");
    expect(sleepRow.values[0]).toBe(450);
    expect(sleepRow.samples?.[0]).toBe(1);
    expect(result.measurementRegimes?.sleep).toBe("main_sleep_v2");
  });
});
