import type { Pool } from "pg";
import type { SkinTempDay } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

/**
 * Read access to nightly skin-temperature *deviation* from the user's
 * personal baseline (degrees; can be + or -, hence the reference line
 * at 0 in the UI). A multi-night positive deviation is the third leg
 * of the illness/under-recovery triad.
 */
export class SkinTempRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<SkinTempDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, nightly_relative, log_type, fetched_at
       FROM universe.health_skin_temp_daily
       WHERE date >= $1 AND date <= $2
       ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<SkinTempDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, nightly_relative, log_type, fetched_at
       FROM universe.health_skin_temp_daily
       ORDER BY date DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): SkinTempDay {
  return {
    date: toDateStr(row.date),
    nightlyRelative:
      row.nightly_relative != null ? Number(row.nightly_relative) : null,
    logType: (row.log_type as string | null) ?? null,
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
