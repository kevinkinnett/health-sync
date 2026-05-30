import type { Pool } from "pg";
import type { FoodLogDay } from "@health-dashboard/shared";
import { toDateStr } from "./mappers.js";

/**
 * Reads Fitbit food-log daily summaries (ingested by the Windmill
 * `ingest_fitbit_food` job). One row per day the user logged food.
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
  SELECT date, calories_in, carbs, fat, fiber, protein, sodium, water,
         calorie_goal, food_count
  FROM universe.fitbit_food_log_daily`;

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
    sodium: num(row.sodium),
    water: num(row.water),
    calorieGoal: num(row.calorie_goal),
    foodCount: num(row.food_count),
  };
}
