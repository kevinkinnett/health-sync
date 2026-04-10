import type { Pool } from "pg";
import type { WeightEntry } from "@health-dashboard/shared";

export class WeightRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<WeightEntry[]> {
    const { rows } = await this.pool.query(
      `SELECT log_id, date, time, weight_kg, bmi, fat_pct, source, fetched_at
       FROM universe.fitbit_body_weight
       WHERE date >= $1 AND date <= $2
       ORDER BY date, time`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<WeightEntry[]> {
    const { rows } = await this.pool.query(
      `SELECT log_id, date, time, weight_kg, bmi, fat_pct, source, fetched_at
       FROM universe.fitbit_body_weight
       ORDER BY date DESC, time DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

import { toDateStr, toTimestampStr } from "./mappers.js";

function mapRow(row: Record<string, unknown>): WeightEntry {
  return {
    logId: String(row.log_id),
    date: toDateStr(row.date),
    time: row.time != null ? String(row.time) : null,
    weightKg: Number(row.weight_kg),
    bmi: row.bmi != null ? Number(row.bmi) : null,
    fatPct: row.fat_pct != null ? Number(row.fat_pct) : null,
    source: row.source as string | null,
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
