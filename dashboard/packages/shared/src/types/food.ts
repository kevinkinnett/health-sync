/**
 * Fitbit food-log daily summary — calorie + macronutrient intake from
 * `universe.fitbit_food_log_daily` (ingested by the Windmill
 * `ingest_fitbit_food` job). One row per day the user logged food
 * (manually or via the AI photo logging). Macros are grams; water is ml.
 */
export interface FoodLogDay {
  date: string;
  caloriesIn: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  protein: number | null;
  sodium: number | null;
  water: number | null;
  /** The user's daily calorie target, if set (often null). */
  calorieGoal: number | null;
  /** Number of individual food items logged that day. */
  foodCount: number | null;
}
