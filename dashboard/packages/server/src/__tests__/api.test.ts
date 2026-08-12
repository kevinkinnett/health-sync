import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { HealthDataService } from "../services/healthDataService.js";
import { HealthController } from "../controllers/healthController.js";
import type { TrainingService } from "../services/training/trainingService.js";
import { createHealthRoutes } from "../routes/health.js";
import { errorMapper } from "../middleware/errorMapper.js";

// Minimal fake repos that return realistic data shapes
const fakeActivityRepo = {
  findByDateRange: async () => [
    {
      date: "2026-04-01",
      steps: 8500,
      caloriesOut: 2200,
      caloriesBmr: 1600,
      activeCalories: 600,
      distanceKm: 6.2,
      floors: 10,
      minutesSedentary: 700,
      minutesLightlyActive: 180,
      minutesFairlyActive: 30,
      minutesVeryActive: 15,
      fetchedAt: "2026-04-01T12:00:00Z",
    },
  ],
  findLatest: async () => [],
};

const fakeSleepRepo = {
  findByDateRange: async () => [
    {
      date: "2026-04-01",
      totalMinutesAsleep: 420,
      totalMinutesInBed: 480,
      totalSleepRecords: 1,
      minutesDeep: 90,
      minutesLight: 200,
      minutesRem: 100,
      minutesWake: 30,
      efficiency: 88,
      mainSleepStartTime: "2026-04-01T23:00:00Z",
      mainSleepEndTime: "2026-04-02T07:00:00Z",
      fetchedAt: "2026-04-02T12:00:00Z",
    },
  ],
  findLatest: async () => [],
};

const fakeHeartRateRepo = {
  findByDateRange: async () => [
    {
      date: "2026-04-01",
      restingHeartRate: 62,
      zoneOutOfRangeMin: 1200,
      zoneFatBurnMin: 45,
      zoneCardioMin: 20,
      zonePeakMin: 5,
      zoneOutOfRangeCal: 1500,
      zoneFatBurnCal: 300,
      zoneCardioCal: 200,
      zonePeakCal: 80,
      fetchedAt: "2026-04-01T12:00:00Z",
    },
  ],
  findLatest: async () => [],
};

const fakeWeightRepo = {
  findByDateRange: async () => [],
  findLatest: async () => [],
};

const fakeHrvRepo = {
  findByDateRange: async () => [
    {
      date: "2026-04-01",
      dailyRmssd: 45.5,
      deepRmssd: 52.3,
      fetchedAt: "2026-04-01T12:00:00Z",
    },
  ],
  findLatest: async () => [],
};

const fakeExerciseLogRepo = {
  findByDateRange: async () => [
    {
      logId: 12345,
      date: "2026-04-01",
      startTime: "2026-04-01T07:00:00Z",
      activityName: "Walk",
      activityTypeId: 90013,
      logType: "auto_detected",
      calories: 250,
      durationMs: 1800000,
      distance: 2.5,
      distanceUnit: "Kilometer",
      steps: 3200,
      averageHeartRate: 110,
      elevationGain: 15,
      hasActiveZoneMinutes: true,
      fetchedAt: "2026-04-01T12:00:00Z",
    },
  ],
  findLatest: async () => [],
};

let app: express.Express;

beforeAll(() => {
  // Vitals metrics (spo2/breathing/skin-temp/cardio) aren't exercised
  // by these tests; empty fakes satisfy the constructor.
  const fakeVitalsRepo = {
    findByDateRange: async () => [],
    findLatest: async () => [],
  };
  const service = new HealthDataService(
    fakeActivityRepo as any,
    fakeSleepRepo as any,
    fakeHeartRateRepo as any,
    fakeWeightRepo as any,
    fakeHrvRepo as any,
    fakeExerciseLogRepo as any,
    fakeVitalsRepo as any, // spo2
    fakeVitalsRepo as any, // breathing
    fakeVitalsRepo as any, // skinTemp
    fakeVitalsRepo as any, // cardioScore
    fakeVitalsRepo as any, // eightSleep
    fakeVitalsRepo as any, // food
    fakeVitalsRepo as any, // teslaDrive
  );
  // Training load is a separate service; this suite exercises the
  // metric endpoints, so a stub keeps the constructor honest.
  const training = {
    getSummary: async () => ({
      days: [], sessions: [], totalByType: {}, sessionsPerWeek: 0,
    }),
  } as unknown as TrainingService;
  const controller = new HealthController(service, training);
  app = express();
  app.use("/api/health", createHealthRoutes(controller));
  app.use(errorMapper);
});

describe("Health API endpoints", () => {
  it("GET /api/health/activity returns activity data", async () => {
    const res = await request(app)
      .get("/api/health/activity?start=2026-04-01&end=2026-04-01")
      .expect(200);

    expect(res.body).toBeInstanceOf(Array);
    expect(res.body[0]).toMatchObject({
      date: "2026-04-01",
      steps: expect.any(Number),
      caloriesOut: expect.any(Number),
    });
  });

  it("GET /api/health/sleep returns sleep data", async () => {
    const res = await request(app)
      .get("/api/health/sleep?start=2026-04-01&end=2026-04-01")
      .expect(200);

    expect(res.body).toBeInstanceOf(Array);
    expect(res.body[0]).toMatchObject({
      date: "2026-04-01",
      totalMinutesAsleep: expect.any(Number),
      efficiency: expect.any(Number),
    });
  });

  it("GET /api/health/heart-rate returns heart rate data", async () => {
    const res = await request(app)
      .get("/api/health/heart-rate?start=2026-04-01&end=2026-04-01")
      .expect(200);

    expect(res.body).toBeInstanceOf(Array);
    expect(res.body[0]).toMatchObject({
      date: "2026-04-01",
      restingHeartRate: expect.any(Number),
    });
  });

  it("GET /api/health/hrv returns HRV data", async () => {
    const res = await request(app)
      .get("/api/health/hrv?start=2026-04-01&end=2026-04-01")
      .expect(200);

    expect(res.body).toBeInstanceOf(Array);
    expect(res.body[0]).toMatchObject({
      date: "2026-04-01",
      dailyRmssd: expect.any(Number),
      deepRmssd: expect.any(Number),
    });
  });

  it("GET /api/health/exercise-logs returns exercise data", async () => {
    const res = await request(app)
      .get("/api/health/exercise-logs?start=2026-04-01&end=2026-04-01")
      .expect(200);

    expect(res.body).toBeInstanceOf(Array);
    expect(res.body[0]).toMatchObject({
      logId: expect.any(Number),
      activityName: expect.any(String),
      calories: expect.any(Number),
      durationMs: expect.any(Number),
    });
  });

  it("GET /api/health/weight returns empty array when no data", async () => {
    const res = await request(app)
      .get("/api/health/weight?start=2026-04-01&end=2026-04-01")
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it("defaults to 30-day range when no dates provided", async () => {
    const res = await request(app).get("/api/health/activity").expect(200);
    expect(res.body).toBeInstanceOf(Array);
  });

  it("GET /api/health/recovery-anomalies returns an explainable report", async () => {
    const res = await request(app)
      .get("/api/health/recovery-anomalies?start=2026-04-01&end=2026-04-30")
      .expect(200);
    expect(res.body).toMatchObject({
      methodVersion: expect.any(String),
      timezone: "America/New_York",
      window: { start: "2026-04-01", end: "2026-04-30" },
      unusualDays: expect.any(Array),
      caveats: expect.any(Array),
    });
  });

  it("GET /api/health/summary returns all sections", async () => {
    const res = await request(app).get("/api/health/summary").expect(200);

    expect(res.body).toMatchObject({
      activity: { latest: expect.any(Object), sparkline: expect.any(Array) },
      sleep: { latest: expect.any(Object), sparkline: expect.any(Array) },
      heartRate: { latest: expect.any(Object), sparkline: expect.any(Array) },
      weight: { latest: null, sparkline: expect.any(Array) },
    });
  });

  // The four "vitals" endpoints surface data that was ingested for a
  // year but never had a read path. These assert the route → controller
  // → service → repo wiring resolves (the empty fake returns []).
  it.each([
    "/api/health/spo2",
    "/api/health/breathing-rate",
    "/api/health/skin-temp",
    "/api/health/cardio-score",
  ])("GET %s is wired and returns an array", async (path) => {
    const res = await request(app)
      .get(`${path}?start=2026-04-01&end=2026-04-01`)
      .expect(200);
    expect(res.body).toBeInstanceOf(Array);
  });

  it("vitals endpoints honor the shared date validation (400 on bad dates)", async () => {
    await request(app)
      .get("/api/health/spo2?start=garbage&end=nonsense")
      .expect(400);
  });
});
