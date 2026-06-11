import { describe, it, expect } from "vitest";
import { HealthDataService } from "../services/healthDataService.js";
import type { DrivingDay } from "@health-dashboard/shared";

/**
 * "Time in car" — the dashboard stat (getDriving) and the cross-metric
 * correlation pairs (minutes-in-car vs steps / sleep / resting HR) added
 * to getCorrelations. Repos are faked; the Tesla repo returns synthetic
 * daily rollups.
 */

const empty: any = { findLatest: async () => [], findByDateRange: async () => [] };

function repoOf(rows: { date: string }[]): any {
  const desc = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  return {
    findLatest: async (n: number) => desc.slice(0, n),
    findByDateRange: async (s: string, e: string) =>
      desc.filter((r) => r.date >= s && r.date <= e),
  };
}

function makeService(opts: {
  activity?: any[];
  sleep?: any[];
  heartRate?: any[];
  food?: any[];
  driving?: DrivingDay[];
} = {}) {
  return new HealthDataService(
    repoOf(opts.activity ?? []), // activity
    repoOf(opts.sleep ?? []), // sleep
    repoOf(opts.heartRate ?? []), // heartRate
    empty, // weight
    empty, // hrv
    empty, // exerciseLog
    empty, // spo2
    empty, // breathing
    empty, // skinTemp
    empty, // cardioScore
    empty, // eightSleep
    repoOf(opts.food ?? []), // food
    repoOf(opts.driving ?? []), // teslaDrive
  );
}

function drivingDays(): DrivingDay[] {
  // 2026-05-20 .. 2026-05-29 (latest = 05-29).
  return Array.from({ length: 10 }, (_, i) => ({
    date: `2026-05-${String(20 + i).padStart(2, "0")}`,
    drives: 2,
    minutesInCar: 30,
    distanceKm: 20,
    maxSpeedKmh: 100,
  }));
}

describe("HealthDataService.getDriving", () => {
  it("summarizes latest day + last-7-day totals + ascending trend", async () => {
    const out = await makeService({ driving: drivingDays() }).getDriving();
    expect(out.latestDate).toBe("2026-05-29");
    expect(out.latestMinutes).toBe(30);
    // last 7 days: 05-23..05-29 = 7 days × 30 min, × 2 drives.
    expect(out.weekMinutes).toBe(210);
    expect(out.weekDrives).toBe(14);
    expect(out.trend[0].date).toBe("2026-05-20"); // ascending
    expect(out.trend[out.trend.length - 1].date).toBe("2026-05-29");
  });

  it("degrades to an empty summary when there's no driving data", async () => {
    const out = await makeService({}).getDriving();
    expect(out.latestDate).toBeNull();
    expect(out.latestMinutes).toBeNull();
    expect(out.weekMinutes).toBe(0);
    expect(out.trend).toEqual([]);
  });
});

describe("HealthDataService.getCorrelations — time in car", () => {
  function overlappingData() {
    const activity: any[] = [];
    const heartRate: any[] = [];
    const driving: DrivingDay[] = [];
    for (let i = 0; i < 15; i++) {
      const date = `2026-05-${String(1 + i).padStart(2, "0")}`;
      activity.push({
        date,
        steps: 5000 + i * 100,
        minutesVeryActive: 10,
        minutesFairlyActive: 5,
        distanceKm: 4,
        caloriesOut: 2000,
      });
      heartRate.push({ date, restingHeartRate: 55 + (i % 5) });
      driving.push({ date, drives: 2, minutesInCar: 20 + i * 5, distanceKm: 20, maxSpeedKmh: 100 });
    }
    return { activity, heartRate, driving };
  }

  it("adds minutes-in-car vs steps and resting-HR pairs when data overlaps", async () => {
    const corr = await makeService(overlappingData()).getCorrelations();
    const carSteps = corr.pairs.find(
      (p) => p.xMetric === "minutesInCar" && p.yMetric === "steps",
    );
    expect(carSteps).toBeDefined();
    expect(carSteps!.xLabel).toBe("Time in Car (min)");
    expect(carSteps!.points.length).toBe(15);
    expect(
      corr.pairs.find((p) => p.xMetric === "minutesInCar" && p.yMetric === "rhr"),
    ).toBeDefined();
  });

  it("adds no time-in-car pairs when there's no driving data", async () => {
    const { activity, heartRate } = overlappingData();
    const corr = await makeService({ activity, heartRate }).getCorrelations();
    expect(corr.pairs.find((p) => p.xMetric === "minutesInCar")).toBeUndefined();
  });

  it("wires lag-1 pairs through the service: calories TODAY vs sleep TONIGHT", async () => {
    // Food on days 1..14; sleep recorded (wake date) on days 2..15 with
    // sleepMin(D+1) proportional to caloriesIn(D) → lag-1 r must be high
    // while the same-day join has only 13 mismatched overlaps.
    const food: any[] = [];
    const sleep: any[] = [];
    for (let i = 0; i < 14; i++) {
      food.push({
        date: `2026-05-${String(1 + i).padStart(2, "0")}`,
        caloriesIn: 1800 + i * 50,
      });
      sleep.push({
        date: `2026-05-${String(2 + i).padStart(2, "0")}`,
        totalMinutesAsleep: 360 + i * 10,
      });
    }
    const corr = await makeService({ food, sleep }).getCorrelations();
    const lagPair = corr.pairs.find(
      (p) => p.xMetric === "caloriesIn" && p.yMetric === "sleepMin" && p.lagDays === 1,
    );
    expect(lagPair).toBeDefined();
    expect(lagPair!.points.length).toBe(14); // every food day has a that-night sleep
    expect(lagPair!.correlation).toBe(1); // constructed perfectly linear
    // Wake-dated metric: the lag-1 night is "that night", not "next-day".
    expect(lagPair!.yLabel).toBe("Sleep (min) (that night)");
    expect(lagPair!.insight).toContain("sleep that night");
    // The points are dated by the FOOD day (the cause).
    expect(lagPair!.points[0].date).toBe("2026-05-01");
  });

  it("zero-fills no-drive days inside the driving span (the control group)", async () => {
    // Drives on only 6 of 15 days, plus activity every day. The
    // minutesInCar→steps pair must include the gap days as 0-minute
    // observations — without them the pair would be conditioned on
    // "days I drove at all" (and here would fall under the n≥10 gate).
    const activity: any[] = [];
    const driving: DrivingDay[] = [];
    for (let i = 0; i < 15; i++) {
      const date = `2026-05-${String(1 + i).padStart(2, "0")}`;
      activity.push({
        date, steps: 4000 + i * 50,
        minutesVeryActive: 5, minutesFairlyActive: 5,
        distanceKm: 3, caloriesOut: 2000,
      });
      if (i % 3 === 0) {
        // drives on days 1, 4, 7, 10, 13 + day 15 boundary below
        driving.push({ date, drives: 1, minutesInCar: 60, distanceKm: 30, maxSpeedKmh: 100 });
      }
    }
    driving.push({
      date: "2026-05-15", drives: 1, minutesInCar: 30, distanceKm: 10, maxSpeedKmh: 80,
    });
    const corr = await makeService({ activity, driving }).getCorrelations();
    const pair = corr.pairs.find(
      (p) => p.xMetric === "minutesInCar" && p.yMetric === "steps",
    );
    expect(pair).toBeDefined();
    // All 15 days within [first drive, last drive] participate.
    expect(pair!.points.length).toBe(15);
    expect(pair!.points.filter((pt) => pt.x === 0).length).toBe(9);
  });

  it("pins the de-gating: sleep↔RHR joins on its own days, no activity required", async () => {
    // Intentional behavior change from the registry refactor: pairs no
    // longer require an activity wear-day on the joined date.
    const sleep: any[] = [];
    const heartRate: any[] = [];
    for (let i = 0; i < 12; i++) {
      const date = `2026-05-${String(1 + i).padStart(2, "0")}`;
      sleep.push({ date, totalMinutesAsleep: 400 + i, minutesDeep: 60, efficiency: 90 });
      heartRate.push({ date, restingHeartRate: 60 - (i % 4) });
    }
    const corr = await makeService({ sleep, heartRate }).getCorrelations();
    const pair = corr.pairs.find(
      (p) => p.xMetric === "sleepMin" && p.yMetric === "rhr",
    );
    expect(pair).toBeDefined();
    expect(pair!.points.length).toBe(12);
  });
});
