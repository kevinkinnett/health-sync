import type { Pool } from "pg";
import type { HeartRateDay } from "@health-dashboard/shared";

export class HeartRateRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<HeartRateDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, resting_heart_rate,
              zone_out_of_range_min, zone_fat_burn_min,
              zone_cardio_min, zone_peak_min,
              zone_out_of_range_cal, zone_fat_burn_cal,
              zone_cardio_cal, zone_peak_cal, fetched_at
       FROM universe.fitbit_heart_rate_daily
       WHERE date >= $1 AND date <= $2
       ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<HeartRateDay[]> {
    const { rows } = await this.pool.query(
      `SELECT date, resting_heart_rate,
              zone_out_of_range_min, zone_fat_burn_min,
              zone_cardio_min, zone_peak_min,
              zone_out_of_range_cal, zone_fat_burn_cal,
              zone_cardio_cal, zone_peak_cal, fetched_at
       FROM universe.fitbit_heart_rate_daily
       ORDER BY date DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

import { toDateStr, toTimestampStr } from "./mappers.js";

function mapRow(row: Record<string, unknown>): HeartRateDay {
  return {
    date: toDateStr(row.date),
    restingHeartRate: row.resting_heart_rate as number | null,
    zoneOutOfRangeMin: row.zone_out_of_range_min as number | null,
    zoneFatBurnMin: row.zone_fat_burn_min as number | null,
    zoneCardioMin: row.zone_cardio_min as number | null,
    zonePeakMin: row.zone_peak_min as number | null,
    zoneOutOfRangeCal: row.zone_out_of_range_cal != null ? Number(row.zone_out_of_range_cal) : null,
    zoneFatBurnCal: row.zone_fat_burn_cal != null ? Number(row.zone_fat_burn_cal) : null,
    zoneCardioCal: row.zone_cardio_cal != null ? Number(row.zone_cardio_cal) : null,
    zonePeakCal: row.zone_peak_cal != null ? Number(row.zone_peak_cal) : null,
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
