import type { FoodLogDay } from "./food.js";
import type { WeightEntry } from "./weight.js";

export type CollectionState = "empty" | "collecting" | "ready";

export interface NutritionWeightDay {
  date: string;
  provisional: boolean;
  food: FoodLogDay | null;
  estimatedCaloriesOut: number | null;
  estimatedEnergyGap: number | null;
  trainingLoad: number | null;
  trainingMinutes: number | null;
  weightObservations: WeightEntry[];
  dailyWeightMedianKg: number | null;
  weightTrendKg: number | null;
}

export interface FoodLoggingCoverage {
  start: string | null;
  end: string | null;
  completedDays: number;
  loggedDays: number;
  unloggedDays: number;
  percent: number | null;
}

export interface WeightTrendSummary {
  state: CollectionState;
  latest: WeightEntry | null;
  observationCount: number;
  observedDates: number;
  currentTrendKg: number | null;
  change7dKg: number | null;
  change30dKg: number | null;
  reasons: string[];
}

export interface NutritionWeightReadiness {
  state: "collecting" | "ready";
  observedSpanDays: number;
  foodLoggedDays: number;
  weightObservedDates: number;
  thresholds: {
    observedSpanDays: 42;
    foodLoggedDays: 30;
    weightObservedDates: 18;
  };
  reasons: string[];
}

export interface NutritionWeightReport {
  window: {
    start: string;
    end: string;
    currentLocalDate: string;
    completedThrough: string;
  };
  days: NutritionWeightDay[];
  foodCoverage: FoodLoggingCoverage;
  weight: WeightTrendSummary;
  readiness: NutritionWeightReadiness;
}
