import type { Pool } from "pg";
import type { BreathingRateDay } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

/**
 * Read access to nightly average breathing rate (breaths/min). A
 * sustained rise above personal baseline is one leg of the standard
 * "coming down with something / under-recovered" triad (with elevated
 * RHR and skin-temp deviation).
 */
export class BreathingRateRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<BreathingRateDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, breathing_rate, fetched_at
       FROM universe.health_breathing_rate_daily
       WHERE date >= $1 AND date <= $2
       ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<BreathingRateDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, breathing_rate, fetched_at
       FROM universe.health_breathing_rate_daily
       ORDER BY date DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): BreathingRateDay {
  return {
    date: toDateStr(row.date),
    breathingRate: row.breathing_rate != null ? Number(row.breathing_rate) : null,
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
