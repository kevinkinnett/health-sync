import type {
  FoodLogDay,
  NutritionWeightDay,
  NutritionWeightReport,
  WeightEntry,
} from "@health-dashboard/shared";

const FETCHED_AT = "2026-08-20T12:00:00Z";

function food(date: string, caloriesIn: number): FoodLogDay {
  return {
    date,
    caloriesIn,
    carbs: 180,
    fat: 72,
    fiber: 26,
    protein: 135,
    sugar: 34,
    saturatedFat: 15,
    sodium: 2100,
    cholesterol: 180,
    potassium: 3200,
    water: null,
    calorieGoal: null,
    foodCount: 7,
  };
}

function weight(logId: string, date: string, time: string | null, weightKg: number): WeightEntry {
  return {
    logId,
    date,
    time,
    weightKg,
    bmi: null,
    fatPct: null,
    source: "google_health",
    fetchedAt: FETCHED_AT,
  };
}

const days: NutritionWeightDay[] = [
  {
    date: "2026-08-13",
    provisional: false,
    food: food("2026-08-13", 1900),
    estimatedCaloriesOut: 2400,
    estimatedEnergyGap: -500,
    trainingLoad: 38,
    trainingMinutes: 42,
    weightObservations: [],
    dailyWeightMedianKg: null,
    weightTrendKg: null,
  },
  {
    date: "2026-08-14",
    provisional: false,
    food: null,
    estimatedCaloriesOut: 2260,
    estimatedEnergyGap: null,
    trainingLoad: null,
    trainingMinutes: null,
    weightObservations: [],
    dailyWeightMedianKg: null,
    weightTrendKg: null,
  },
  {
    date: "2026-08-15",
    provisional: false,
    food: food("2026-08-15", 2100),
    estimatedCaloriesOut: 2350,
    estimatedEnergyGap: -250,
    trainingLoad: null,
    trainingMinutes: null,
    weightObservations: [],
    dailyWeightMedianKg: null,
    weightTrendKg: null,
  },
  {
    date: "2026-08-18",
    provisional: false,
    food: null,
    estimatedCaloriesOut: 2320,
    estimatedEnergyGap: null,
    trainingLoad: 51,
    trainingMinutes: 50,
    weightObservations: [
      weight("w-am", "2026-08-18", "07:15:00", 90),
      weight("w-pm", "2026-08-18", "19:40:00", 89.8),
    ],
    dailyWeightMedianKg: 89.9,
    weightTrendKg: null,
  },
  {
    date: "2026-08-19",
    provisional: false,
    food: null,
    estimatedCaloriesOut: 2280,
    estimatedEnergyGap: null,
    trainingLoad: null,
    trainingMinutes: null,
    weightObservations: [weight("w-next", "2026-08-19", null, 89.9)],
    dailyWeightMedianKg: 89.9,
    weightTrendKg: null,
  },
  {
    date: "2026-08-20",
    provisional: true,
    food: food("2026-08-20", 840),
    estimatedCaloriesOut: 1200,
    estimatedEnergyGap: -360,
    trainingLoad: null,
    trainingMinutes: null,
    weightObservations: [],
    dailyWeightMedianKg: null,
    weightTrendKg: null,
  },
];

export const collectingNutritionWeightReport: NutritionWeightReport = {
  window: {
    start: "2026-08-13",
    end: "2026-08-20",
    currentLocalDate: "2026-08-20",
    completedThrough: "2026-08-19",
  },
  days,
  foodCoverage: {
    start: "2026-08-13",
    end: "2026-08-19",
    completedDays: 7,
    loggedDays: 2,
    unloggedDays: 5,
    percent: 29,
  },
  weight: {
    state: "collecting",
    latest: days[4].weightObservations[0],
    observationCount: 3,
    observedDates: 2,
    currentTrendKg: null,
    change7dKg: null,
    change30dKg: null,
    reasons: ["A rolling median needs weight on at least three distinct dates."],
  },
  readiness: {
    state: "collecting",
    observedSpanDays: 7,
    foodLoggedDays: 2,
    weightObservedDates: 2,
    thresholds: { observedSpanDays: 42, foodLoggedDays: 30, weightObservedDates: 18 },
    reasons: [
      "Collect 42 completed span days.",
      "Log food on 30 completed days.",
      "Record weight on 18 distinct dates.",
    ],
  },
};

export const emptyNutritionWeightReport: NutritionWeightReport = {
  ...collectingNutritionWeightReport,
  days: collectingNutritionWeightReport.days.map((day) => ({
    ...day,
    food: null,
    estimatedEnergyGap: null,
    weightObservations: [],
    dailyWeightMedianKg: null,
    weightTrendKg: null,
  })),
  foodCoverage: {
    start: null,
    end: "2026-08-19",
    completedDays: 0,
    loggedDays: 0,
    unloggedDays: 0,
    percent: null,
  },
  weight: {
    state: "empty",
    latest: null,
    observationCount: 0,
    observedDates: 0,
    currentTrendKg: null,
    change7dKg: null,
    change30dKg: null,
    reasons: ["No weight observations are available in this window."],
  },
};
