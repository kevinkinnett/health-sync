import type { Pool } from "pg";
import type { HrvDay } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

export class HrvRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<HrvDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, daily_rmssd, deep_rmssd, non_rem_heart_rate,
              COALESCE(raw_jsonb->>'method',
                CASE WHEN raw_jsonb->>'_src'='google_health' THEN 'sample_mean_v1' ELSE 'fitbit_legacy_v1' END
              ) AS measurement_method, fetched_at
       FROM universe.health_hrv_daily
       WHERE date >= $1 AND date <= $2
       ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<HrvDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, daily_rmssd, deep_rmssd, non_rem_heart_rate,
              COALESCE(raw_jsonb->>'method',
                CASE WHEN raw_jsonb->>'_src'='google_health' THEN 'sample_mean_v1' ELSE 'fitbit_legacy_v1' END
              ) AS measurement_method, fetched_at
       FROM universe.health_hrv_daily
       ORDER BY date DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): HrvDay {
  return {
    date: toDateStr(row.date),
    dailyRmssd: row.daily_rmssd != null ? Number(row.daily_rmssd) : null,
    deepRmssd: row.deep_rmssd != null ? Number(row.deep_rmssd) : null,
    nonRemHeartRate: row.non_rem_heart_rate != null ? Number(row.non_rem_heart_rate) : null,
    measurementMethod: String(row.measurement_method ?? "unknown"),
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
