import type { Pool } from "pg";
import type { FoodLogDay } from "@health-dashboard/shared";
import { toDateStr } from "./mappers.js";

/**
 * Reads daily food-log summaries through the provider-neutral health view.
 * (rolled up from Google Health's nutrition-log by the Windmill
 * `ingest_google_health` job since the cutover). One row per logged day.
 */
export class FoodRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<FoodLogDay[]> {
    const { rows } = await this.pool.query(
      `${SELECT} WHERE date >= $1 AND date <= $2 ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<FoodLogDay[]> {
    const { rows } = await this.pool.query(
      `${SELECT} ORDER BY date DESC LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

const SELECT = `
  SELECT date, calories_in, carbs, fat, fiber, protein, sugar, saturated_fat,
         sodium, cholesterol, potassium, water, calorie_goal, food_count
  FROM universe.health_food_log_daily`;

function num(v: unknown): number | null {
  return v != null ? Number(v) : null;
}

function mapRow(row: Record<string, unknown>): FoodLogDay {
  return {
    date: toDateStr(row.date),
    caloriesIn: num(row.calories_in),
    carbs: num(row.carbs),
    fat: num(row.fat),
    fiber: num(row.fiber),
    protein: num(row.protein),
    sugar: num(row.sugar),
    saturatedFat: num(row.saturated_fat),
    sodium: num(row.sodium),
    cholesterol: num(row.cholesterol),
    potassium: num(row.potassium),
    water: num(row.water),
    calorieGoal: num(row.calorie_goal),
    foodCount: num(row.food_count),
  };
}
