import type { Pool } from "pg";
import type { DrivingDay } from "@health-dashboard/shared";
import { toDateStr } from "./mappers.js";

/**
 * Reads daily driving rollups from `universe.tesla_drive_daily`
 * (ingested by the Windmill `ingest_tesla_drives` job from a TeslaMate
 * database). "Time in car" = `minutes_in_car`, the summed drive duration
 * for the local day.
 *
 * The table is created by that ingest job on its first run. Until then,
 * queries are degraded to "no data" rather than 500ing the dashboard —
 * so this can ship before the pipeline is connected.
 */
export class TeslaDriveRepository {
  constructor(private pool: Pool) {}

  async findLatest(limit: number): Promise<DrivingDay[]> {
    return this.run(`${SELECT} ORDER BY drive_date DESC LIMIT $1`, [limit]);
  }

  async findByDateRange(start: string, end: string): Promise<DrivingDay[]> {
    return this.run(
      `${SELECT} WHERE drive_date >= $1 AND drive_date <= $2 ORDER BY drive_date`,
      [start, end],
    );
  }

  private async run(sql: string, params: unknown[]): Promise<DrivingDay[]> {
    try {
      const { rows } = await this.pool.query(sql, params);
      return rows.map(mapRow);
    } catch (err) {
      // 42P01 = undefined_table: the ingest hasn't created it yet.
      if ((err as { code?: string }).code === "42P01") return [];
      throw err;
    }
  }
}

const SELECT = `
  SELECT drive_date, drives, minutes_in_car, distance_km, max_speed_kmh
  FROM universe.tesla_drive_daily`;

function num(v: unknown): number | null {
  return v != null ? Number(v) : null;
}

function mapRow(row: Record<string, unknown>): DrivingDay {
  return {
    date: toDateStr(row.drive_date),
    drives: Number(row.drives ?? 0),
    minutesInCar: Number(row.minutes_in_car ?? 0),
    distanceKm: num(row.distance_km),
    maxSpeedKmh: num(row.max_speed_kmh),
  };
}
