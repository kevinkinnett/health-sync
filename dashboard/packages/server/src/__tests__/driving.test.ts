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
    empty, // food
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
});
