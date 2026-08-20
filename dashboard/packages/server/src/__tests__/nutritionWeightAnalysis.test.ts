import { describe, expect, it } from "vitest";
import type {
  ActivityDay,
  FoodLogDay,
  TrainingLoadDay,
  WeightEntry,
} from "@health-dashboard/shared";
import { buildNutritionWeightReport } from "../services/health/nutritionWeightAnalysis.js";

const food = (date: string, caloriesIn: number): FoodLogDay => ({
  date,
  caloriesIn,
  carbs: 100,
  fat: 50,
  fiber: 20,
  protein: 120,
  sugar: 20,
  saturatedFat: 10,
  sodium: 1500,
  cholesterol: 200,
  potassium: 3000,
  water: null,
  calorieGoal: null,
  foodCount: 4,
});

const activity = (date: string, caloriesOut: number | null): ActivityDay => ({
  date,
  caloriesOut,
  steps: 5000,
  caloriesBmr: null,
  activeCalories: null,
  distanceKm: null,
  floors: null,
  minutesSedentary: null,
  minutesLightlyActive: null,
  minutesFairlyActive: null,
  minutesVeryActive: null,
  fetchedAt: "2026-08-20T00:00:00Z",
});

const weight = (date: string, kg: number, time = "07:00:00"): WeightEntry => ({
  logId: `${date}-${kg}`,
  date,
  time,
  weightKg: kg,
  bmi: null,
  fatPct: null,
  source: "google_health",
  fetchedAt: "2026-08-20T00:00:00Z",
});

const training = (date: string, load: number): TrainingLoadDay => ({
  date,
  load,
  sessions: 1,
  minutes: 45,
  byType: { strength: load },
  estimated: false,
});

describe("buildNutritionWeightReport", () => {
  it("joins local days without turning missing sources into zero", () => {
    const report = buildNutritionWeightReport({
      start: "2026-08-17",
      end: "2026-08-20",
      currentLocalDate: "2026-08-20",
      food: [food("2026-08-17", 1800), food("2026-08-19", 2000)],
      activity: [activity("2026-08-17", 2400), activity("2026-08-18", 2300)],
      weights: [],
      trainingDays: [training("2026-08-18", 42)],
    });

    expect(report.days[0].estimatedEnergyGap).toBe(-600);
    expect(report.days[1]).toMatchObject({
      food: null,
      estimatedCaloriesOut: 2300,
      estimatedEnergyGap: null,
      trainingLoad: 42,
    });
    expect(report.days[3].provisional).toBe(true);
    expect(report.foodCoverage).toMatchObject({
      start: "2026-08-17",
      end: "2026-08-19",
      completedDays: 3,
      loggedDays: 2,
      unloggedDays: 1,
      percent: 67,
    });
  });

  it("uses a daily median and requires three observed dates for a rolling trend", () => {
    const report = buildNutritionWeightReport({
      start: "2026-08-10",
      end: "2026-08-20",
      currentLocalDate: "2026-08-21",
      food: [],
      activity: [],
      weights: [
        weight("2026-08-10", 90),
        weight("2026-08-10", 92, "19:00:00"),
        weight("2026-08-12", 89),
        weight("2026-08-16", 88),
        weight("2026-08-17", 87),
      ],
      trainingDays: [],
    });

    expect(report.days.find((day) => day.date === "2026-08-10")?.dailyWeightMedianKg).toBe(91);
    expect(report.days.find((day) => day.date === "2026-08-12")?.weightTrendKg).toBeNull();
    expect(report.days.find((day) => day.date === "2026-08-16")?.weightTrendKg).toBe(89);
    expect(report.weight.observationCount).toBe(5);
    expect(report.weight.observedDates).toBe(4);
    expect(report.weight.state).toBe("ready");
  });

  it("gates changes and long-window analysis when collection is sparse", () => {
    const report = buildNutritionWeightReport({
      start: "2026-08-13",
      end: "2026-08-20",
      currentLocalDate: "2026-08-20",
      food: [food("2026-08-13", 1600), food("2026-08-14", 1635)],
      activity: [],
      weights: [weight("2026-08-18", 89.86), weight("2026-08-19", 89.99)],
      trainingDays: [],
    });

    expect(report.weight).toMatchObject({
      state: "collecting",
      currentTrendKg: null,
      change7dKg: null,
      change30dKg: null,
    });
    expect(report.weight.reasons[0]).toContain("at least three distinct dates");
    expect(report.readiness.state).toBe("collecting");
    expect(report.readiness.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining("completed span days"),
      expect.stringContaining("food-logged days"),
      expect.stringContaining("weight dates"),
    ]));
  });

  it("marks long-window data ready only after every threshold is met", () => {
    const foods = Array.from({ length: 42 }, (_, index) => food(day(index + 1), 2000));
    const weights = Array.from({ length: 21 }, (_, index) => weight(day(index * 2 + 1), 90 - index * 0.05));
    const report = buildNutritionWeightReport({
      start: "2026-06-01",
      end: "2026-07-12",
      currentLocalDate: "2026-07-13",
      food: foods,
      activity: [],
      weights,
      trainingDays: [],
    });

    expect(report.readiness).toMatchObject({
      state: "ready",
      observedSpanDays: 42,
      foodLoggedDays: 42,
      weightObservedDates: 21,
      reasons: [],
    });
  });
});

function day(offset: number): string {
  return new Date(Date.UTC(2026, 5, offset)).toISOString().slice(0, 10);
}
