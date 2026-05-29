import type { Pool } from "pg";
import type { EightSleepDay } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

/**
 * Reads Eight Sleep nightly sessions (ingested by the Windmill
 * `ingest_eight_sleep` job). Single sleeper → `side = 'main'`. Sleep
 * durations are converted seconds → minutes to match the Fitbit shape.
 */
export class EightSleepRepository {
  constructor(private pool: Pool) {}

  async findByDateRange(start: string, end: string): Promise<EightSleepDay[]> {
    const { rows } = await this.pool.query(
      `${SELECT} WHERE side = 'main' AND date >= $1 AND date <= $2 ORDER BY date`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findLatest(limit: number): Promise<EightSleepDay[]> {
    const { rows } = await this.pool.query(
      `${SELECT} WHERE side = 'main' ORDER BY date DESC LIMIT $1`,
      [limit],
    );
    return rows.map(mapRow);
  }
}

const SELECT = `
  SELECT date, score, sleep_duration_sec, deep_duration_sec, light_duration_sec,
         rem_duration_sec, avg_heart_rate, avg_hrv_rmssd, avg_respiratory_rate,
         avg_bed_temp_c, avg_room_temp_c, tnt, sleep_start, sleep_end
  FROM universe.eight_sleep_session`;

function num(v: unknown): number | null {
  return v != null ? Number(v) : null;
}
function secToMin(v: unknown): number | null {
  return v != null ? Math.round(Number(v) / 60) : null;
}

function mapRow(row: Record<string, unknown>): EightSleepDay {
  return {
    date: toDateStr(row.date),
    score: num(row.score),
    sleepDurationMin: secToMin(row.sleep_duration_sec),
    deepMin: secToMin(row.deep_duration_sec),
    lightMin: secToMin(row.light_duration_sec),
    remMin: secToMin(row.rem_duration_sec),
    avgHeartRate: num(row.avg_heart_rate),
    avgHrvRmssd: num(row.avg_hrv_rmssd),
    avgRespiratoryRate: num(row.avg_respiratory_rate),
    avgBedTempC: num(row.avg_bed_temp_c),
    avgRoomTempC: num(row.avg_room_temp_c),
    tnt: num(row.tnt),
    sleepStart: toTimestampStr(row.sleep_start) ?? null,
    sleepEnd: toTimestampStr(row.sleep_end) ?? null,
  };
}
