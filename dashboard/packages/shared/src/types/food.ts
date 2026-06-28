/**
 * Daily food-log summary — calorie + nutrient intake from
 * `universe.fitbit_food_log_daily`. Since the Google Health cutover
 * (2026-06-11) this is rolled up from Google's nutrition-log capture by the
 * Windmill `ingest_google_health` job. One row per day the user logged food
 * (manually or via the AI photo logging).
 *
 * Units: calories are kcal; protein/carbs/fat/fiber/sugar/saturatedFat are
 * grams; sodium/cholesterol/potassium are milligrams; water is ml.
 */
export interface FoodLogDay {
  date: string;
  caloriesIn: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  protein: number | null;
  /** Grams of sugar (subset of carbs). */
  sugar: number | null;
  /** Grams of saturated fat (subset of total fat). */
  saturatedFat: number | null;
  /** Milligrams of sodium. */
  sodium: number | null;
  /** Milligrams of cholesterol. */
  cholesterol: number | null;
  /** Milligrams of potassium. */
  potassium: number | null;
  /** Not provided by Google Health's nutrition-log — null since the cutover. */
  water: number | null;
  /** The user's daily calorie target — not in Google Health; usually null. */
  calorieGoal: number | null;
  /** Number of individual food items logged that day. */
  foodCount: number | null;
}
