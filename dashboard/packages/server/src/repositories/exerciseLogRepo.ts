import type { Pool } from "pg";
import type { ExerciseLog } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

export class ExerciseLogRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<ExerciseLog[]> {
    const { rows } = await this.pool.query(
      `SELECT log_id, date, start_time, activity_name, activity_type_id,
              log_type, calories, duration_ms, distance, distance_unit,
              steps, average_heart_rate, elevation_gain,
              has_active_zone_minutes, fetched_at
       FROM universe.fitbit_exercise_log
       WHERE date >= $1 AND date <= $2
       ORDER BY start_time DESC`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<ExerciseLog[]> {
    const { rows } = await this.pool.query(
      `SELECT log_id, date, start_time, activity_name, activity_type_id,
              log_type, calories, duration_ms, distance, distance_unit,
              steps, average_heart_rate, elevation_gain,
              has_active_zone_minutes, fetched_at
       FROM universe.fitbit_exercise_log
       ORDER BY start_time DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): ExerciseLog {
  return {
    logId: Number(row.log_id),
    date: toDateStr(row.date),
    startTime: toTimestampStr(row.start_time),
    activityName: row.activity_name as string,
    activityTypeId: row.activity_type_id as number | null,
    logType: row.log_type as string | null,
    calories: row.calories as number | null,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
    distance: row.distance != null ? Number(row.distance) : null,
    distanceUnit: row.distance_unit as string | null,
    steps: row.steps as number | null,
    averageHeartRate: row.average_heart_rate as number | null,
    elevationGain: row.elevation_gain != null ? Number(row.elevation_gain) : null,
    hasActiveZoneMinutes: (row.has_active_zone_minutes as boolean) ?? false,
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
