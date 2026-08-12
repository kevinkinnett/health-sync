import type { Pool } from "pg";
import type { SleepDay } from "@health-dashboard/shared";

export class SleepRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<SleepDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, total_minutes_asleep, total_minutes_in_bed,
              total_sleep_records, nap_minutes_asleep, minutes_deep, minutes_light,
              minutes_rem, minutes_wake, efficiency,
              main_sleep_start_time, main_sleep_end_time,
              COALESCE(raw_jsonb->>'method',
                CASE WHEN raw_jsonb->>'_src'='google_health' THEN 'main_sleep_v2' ELSE 'fitbit_legacy_main_v1' END
              ) AS measurement_method, fetched_at
       FROM universe.health_sleep_daily
       WHERE date >= $1 AND date <= $2
       ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<SleepDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, total_minutes_asleep, total_minutes_in_bed,
              total_sleep_records, nap_minutes_asleep, minutes_deep, minutes_light,
              minutes_rem, minutes_wake, efficiency,
              main_sleep_start_time, main_sleep_end_time,
              COALESCE(raw_jsonb->>'method',
                CASE WHEN raw_jsonb->>'_src'='google_health' THEN 'main_sleep_v2' ELSE 'fitbit_legacy_main_v1' END
              ) AS measurement_method, fetched_at
       FROM universe.health_sleep_daily
       ORDER BY date DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

import { toDateStr, toTimestampStr } from "./mappers.js";

function mapRow(row: Record<string, unknown>): SleepDay {
  return {
    date: toDateStr(row.date),
    totalMinutesAsleep: row.total_minutes_asleep as number | null,
    totalMinutesInBed: row.total_minutes_in_bed as number | null,
    totalSleepRecords: row.total_sleep_records as number | null,
    napMinutesAsleep: row.nap_minutes_asleep as number | null,
    minutesDeep: row.minutes_deep as number | null,
    minutesLight: row.minutes_light as number | null,
    minutesRem: row.minutes_rem as number | null,
    minutesWake: row.minutes_wake as number | null,
    efficiency: row.efficiency as number | null,
    mainSleepStartTime: toTimestampStr(row.main_sleep_start_time),
    mainSleepEndTime: toTimestampStr(row.main_sleep_end_time),
    measurementMethod: String(row.measurement_method ?? "unknown"),
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
