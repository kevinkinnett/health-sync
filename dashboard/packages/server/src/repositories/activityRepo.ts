import type { Pool } from "pg";
import type { ActivityDay } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

export class ActivityRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<ActivityDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, steps, calories_out, calories_bmr, active_calories,
              distance_km, floors, minutes_sedentary, minutes_lightly_active,
              minutes_fairly_active, minutes_very_active, fetched_at
       FROM universe.fitbit_activity_daily
       WHERE date >= $1 AND date <= $2
       ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<ActivityDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, steps, calories_out, calories_bmr, active_calories,
              distance_km, floors, minutes_sedentary, minutes_lightly_active,
              minutes_fairly_active, minutes_very_active, fetched_at
       FROM universe.fitbit_activity_daily
       ORDER BY date DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): ActivityDay {
  return {
    date: toDateStr(row.date),
    steps: row.steps as number | null,
    caloriesOut: row.calories_out as number | null,
    caloriesBmr: row.calories_bmr as number | null,
    activeCalories: row.active_calories as number | null,
    distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
    floors: row.floors as number | null,
    minutesSedentary: row.minutes_sedentary as number | null,
    minutesLightlyActive: row.minutes_lightly_active as number | null,
    minutesFairlyActive: row.minutes_fairly_active as number | null,
    minutesVeryActive: row.minutes_very_active as number | null,
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
