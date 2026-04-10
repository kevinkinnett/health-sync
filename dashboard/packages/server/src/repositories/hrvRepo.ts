import type { Pool } from "pg";
import type { HrvDay } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

export class HrvRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<HrvDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, daily_rmssd, deep_rmssd, fetched_at
       FROM universe.fitbit_hrv_daily
       WHERE date >= $1 AND date <= $2
       ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<HrvDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, daily_rmssd, deep_rmssd, fetched_at
       FROM universe.fitbit_hrv_daily
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
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
