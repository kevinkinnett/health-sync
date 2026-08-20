import type {
  ActivityDay,
  FoodLogDay,
  NutritionWeightDay,
  NutritionWeightReport,
  TrainingLoadDay,
  WeightEntry,
} from "@health-dashboard/shared";
import { addDays } from "../userTz.js";

const LONG_TERM_DAYS = 42 as const;
const LONG_TERM_FOOD_DAYS = 30 as const;
const LONG_TERM_WEIGHT_DATES = 18 as const;
const TREND_MIN_DATES = 3;

export interface NutritionWeightAnalysisInput {
  start: string;
  end: string;
  currentLocalDate: string;
  food: FoodLogDay[];
  activity: ActivityDay[];
  weights: WeightEntry[];
  trainingDays: TrainingLoadDay[];
}

export function buildNutritionWeightReport(
  input: NutritionWeightAnalysisInput,
): NutritionWeightReport {
  const completedThrough = minDate(input.end, addDays(input.currentLocalDate, -1));
  const foodByDate = new Map(input.food.map((day) => [day.date, day]));
  const activityByDate = new Map(input.activity.map((day) => [day.date, day]));
  const trainingByDate = new Map(input.trainingDays.map((day) => [day.date, day]));
  const weightsByDate = groupWeights(input.weights);
  const dailyMedians = new Map<string, number>();
  for (const [date, values] of weightsByDate) {
    dailyMedians.set(date, median(values.map((entry) => entry.weightKg)));
  }

  const days: NutritionWeightDay[] = [];
  for (let date = input.start; date <= input.end; date = addDays(date, 1)) {
    const food = foodByDate.get(date) ?? null;
    const caloriesOut = activityByDate.get(date)?.caloriesOut ?? null;
    const training = trainingByDate.get(date);
    days.push({
      date,
      provisional: date >= input.currentLocalDate,
      food,
      estimatedCaloriesOut: caloriesOut,
      estimatedEnergyGap:
        food?.caloriesIn != null && caloriesOut != null
          ? food.caloriesIn - caloriesOut
          : null,
      trainingLoad: training?.load ?? null,
      trainingMinutes: training?.minutes ?? null,
      weightObservations: weightsByDate.get(date) ?? [],
      dailyWeightMedianKg: dailyMedians.get(date) ?? null,
      weightTrendKg: rollingMedian(date, dailyMedians),
    });
  }

  const completedDays = days.filter((day) => day.date <= completedThrough);
  const completedFoodDates = uniqueDates(
    input.food.filter((day) => day.date >= input.start && day.date <= completedThrough),
  );
  const firstFoodDate = completedFoodDates[0] ?? null;
  const coverageDays = firstFoodDate == null
    ? []
    : completedDays.filter((day) => day.date >= firstFoodDate);
  const loggedDates = new Set(completedFoodDates);
  const loggedDays = coverageDays.filter((day) => loggedDates.has(day.date)).length;

  const completedWeights = input.weights
    .filter((entry) => entry.date >= input.start && entry.date <= completedThrough)
    .sort(compareWeight);
  const weightDates = uniqueDates(completedWeights);
  const latest = completedWeights.at(-1) ?? null;
  const latestTrendDay = [...completedDays]
    .reverse()
    .find((day) => day.weightTrendKg != null) ?? null;
  const currentTrendKg = latestTrendDay?.weightTrendKg ?? null;
  const change7dKg = trendChange(days, latestTrendDay?.date, 7);
  const change30dKg = trendChange(days, latestTrendDay?.date, 30);
  const weightReasons: string[] = [];
  if (completedWeights.length === 0) {
    weightReasons.push("No completed weight observations in this range.");
  } else if (currentTrendKg == null) {
    weightReasons.push("A seven-day trend needs weight on at least three distinct dates.");
  }
  if (currentTrendKg != null && change7dKg == null) {
    weightReasons.push("Seven-day change needs valid trend windows one week apart.");
  }
  if (currentTrendKg != null && change30dKg == null) {
    weightReasons.push("Thirty-day change needs valid trend windows one month apart.");
  }

  const observedDates = [...completedFoodDates, ...weightDates].sort();
  const observedSpanDays = observedDates.length === 0
    ? 0
    : dayCount(observedDates[0], completedThrough);
  const readinessReasons: string[] = [];
  if (observedSpanDays < LONG_TERM_DAYS) {
    readinessReasons.push(`${LONG_TERM_DAYS - observedSpanDays} more completed span days needed.`);
  }
  if (completedFoodDates.length < LONG_TERM_FOOD_DAYS) {
    readinessReasons.push(`${LONG_TERM_FOOD_DAYS - completedFoodDates.length} more food-logged days needed.`);
  }
  if (weightDates.length < LONG_TERM_WEIGHT_DATES) {
    readinessReasons.push(`${LONG_TERM_WEIGHT_DATES - weightDates.length} more weight dates needed.`);
  }

  return {
    window: {
      start: input.start,
      end: input.end,
      currentLocalDate: input.currentLocalDate,
      completedThrough,
    },
    days,
    foodCoverage: {
      start: firstFoodDate,
      end: coverageDays.at(-1)?.date ?? null,
      completedDays: coverageDays.length,
      loggedDays,
      unloggedDays: coverageDays.length - loggedDays,
      percent: coverageDays.length === 0
        ? null
        : Math.round((loggedDays / coverageDays.length) * 100),
    },
    weight: {
      state: completedWeights.length === 0
        ? "empty"
        : currentTrendKg == null
          ? "collecting"
          : "ready",
      latest,
      observationCount: completedWeights.length,
      observedDates: weightDates.length,
      currentTrendKg,
      change7dKg,
      change30dKg,
      reasons: weightReasons,
    },
    readiness: {
      state: readinessReasons.length === 0 ? "ready" : "collecting",
      observedSpanDays,
      foodLoggedDays: completedFoodDates.length,
      weightObservedDates: weightDates.length,
      thresholds: {
        observedSpanDays: LONG_TERM_DAYS,
        foodLoggedDays: LONG_TERM_FOOD_DAYS,
        weightObservedDates: LONG_TERM_WEIGHT_DATES,
      },
      reasons: readinessReasons,
    },
  };
}

function groupWeights(weights: WeightEntry[]): Map<string, WeightEntry[]> {
  const result = new Map<string, WeightEntry[]>();
  for (const entry of [...weights].sort(compareWeight)) {
    const rows = result.get(entry.date) ?? [];
    rows.push(entry);
    result.set(entry.date, rows);
  }
  return result;
}

function rollingMedian(date: string, daily: Map<string, number>): number | null {
  const start = addDays(date, -6);
  const values = [...daily]
    .filter(([observed]) => observed >= start && observed <= date)
    .map(([, value]) => value);
  return values.length >= TREND_MIN_DATES ? round(median(values), 3) : null;
}

function trendChange(
  days: NutritionWeightDay[],
  latestDate: string | undefined,
  offset: number,
): number | null {
  if (latestDate == null) return null;
  const latest = days.find((day) => day.date === latestDate)?.weightTrendKg ?? null;
  const previous = days.find((day) => day.date === addDays(latestDate, -offset))?.weightTrendKg ?? null;
  return latest == null || previous == null ? null : round(latest - previous, 3);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function uniqueDates(rows: Array<{ date: string }>): string[] {
  return [...new Set(rows.map((row) => row.date))].sort();
}

function dayCount(start: string, end: string): number {
  if (end < start) return 0;
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  ) + 1;
}

function compareWeight(a: WeightEntry, b: WeightEntry): number {
  return a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "");
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
