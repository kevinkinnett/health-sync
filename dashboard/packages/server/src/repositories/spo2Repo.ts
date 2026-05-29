import type { Pool } from "pg";
import type { Spo2Day } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

/**
 * Read access to nightly SpO2 (blood-oxygen) summaries. Fitbit reports
 * an average plus the night's min/max — a dip in the minimum is a
 * classic respiratory-disturbance / illness signal, which is why this
 * surfaces alongside the other overnight recovery metrics.
 */
export class Spo2Repository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<Spo2Day[]> {
    const { rows } = await this.pool.query(
      `SELECT date, avg_value, min_value, max_value, fetched_at
       FROM universe.fitbit_spo2_daily
       WHERE date >= $1 AND date <= $2
       ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<Spo2Day[]> {
    const { rows } = await this.pool.query(
      `SELECT date, avg_value, min_value, max_value, fetched_at
       FROM universe.fitbit_spo2_daily
       ORDER BY date DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): Spo2Day {
  return {
    date: toDateStr(row.date),
    avgValue: row.avg_value != null ? Number(row.avg_value) : null,
    minValue: row.min_value != null ? Number(row.min_value) : null,
    maxValue: row.max_value != null ? Number(row.max_value) : null,
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
