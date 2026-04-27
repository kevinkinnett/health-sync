/**
 * Shared types for the multi-screen Analytics section: supplement and
 * medication adherence, intake rollups, and correlations against health
 * metrics. These cover the responses returned by `/api/analytics/...`.
 */

/**
 * Daily-grain adherence for one supplement or medication item.
 *
 * `daily` is a dense, sorted list of every date in the window so the
 * client can render a calendar without re-densifying. `byDayOfWeek`
 * exposes the average doses per weekday so the UI can call out
 * patterns like "you take this most often on Tuesdays".
 */
export interface SupplementAdherence {
  itemId: number;
  itemName: string;
  start: string;
  end: string;
  totalDoses: number;
  daysWithIntake: number;
  daysInWindow: number;
  currentStreak: number;
  bestStreak: number;
  byDayOfWeek: Array<{
    dow: number; // 0 = Sunday … 6 = Saturday
    dayName: string;
    avgDoses: number;
  }>;
  daily: Array<{ date: string; doses: number }>;
}

/**
 * Per-item, per-day intake totals. `count` is the number of intake
 * events; `totalAmount` is the sum of `intake.amount` for the day.
 * Same shape is reused by both supplement and medication endpoints.
 */
export interface IntakeByDay {
  date: string;
  itemId: number;
  itemName: string;
  totalAmount: number;
  unit: string;
  count: number;
}

/**
 * Per-ingredient, per-day rollup across all supplements that contain
 * that ingredient. Powers the stacked-area chart on the supplement
 * analytics screen.
 */
export interface IngredientByDay {
  date: string;
  ingredientId: number;
  ingredientName: string;
  totalAmount: number;
  unit: string;
}

/**
 * Output of the time-shifted correlation between an item's daily
 * intake (binary "took today" or sum of doses) and one of the standard
 * health metrics. `lagDays = 0` is same-day; positive values shift the
 * intake series back so that, e.g., yesterday's intake is paired with
 * today's metric.
 *
 * Pairs with too few joined days (`n < 7`) are excluded so the UI can
 * surface "Insufficient data" rather than a meaningless r value.
 */
export interface IntakeCorrelations {
  itemId: number;
  itemName: string;
  lagDays: number;
  pairs: Array<{
    metric: "steps" | "sleepMin" | "deepMin" | "restingHr" | "dailyRmssd";
    metricLabel: string;
    correlation: number; // -1 .. 1, rounded to 3 decimals
    n: number; // joined day count
    points: Array<{ x: 0 | 1; y: number; date: string }>;
    insight: string;
  }>;
}
