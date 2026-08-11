import type { Pool } from "pg";
import type { CardioScoreDay } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

/**
 * Read access to the daily cardio-fitness (VO2 max) score. Fitbit
 * reports this as a *range string* (e.g. "43-47"), not a single
 * number — it moves slowly, so the UI shows the current value plus a
 * change history rather than a daily line chart. Kept as a string
 * end-to-end; any numeric treatment (e.g. midpoint for a trend) is a
 * presentation concern, not stored here.
 */
export class CardioScoreRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<CardioScoreDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, vo2_max, fetched_at
       FROM universe.health_cardio_score_daily
       WHERE date >= $1 AND date <= $2
       ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<CardioScoreDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, vo2_max, fetched_at
       FROM universe.health_cardio_score_daily
       ORDER BY date DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): CardioScoreDay {
  return {
    date: toDateStr(row.date),
    vo2Max: (row.vo2_max as string | null) ?? null,
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
