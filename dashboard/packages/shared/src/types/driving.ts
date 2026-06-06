/**
 * Tesla driving daily summary — "time in car" rolled up from a
 * self-hosted TeslaMate `drives` table (ingested by the Windmill
 * `ingest_tesla_drives` job into `universe.tesla_drive_daily`). One row
 * per local day the user drove. Distance/speed are metric (km, km/h);
 * the client converts for display.
 */
export interface DrivingDay {
  date: string;
  /** Number of trips that day. */
  drives: number;
  /** Total time actually driving, in minutes (TeslaMate can't see idle/parked time). */
  minutesInCar: number;
  distanceKm: number | null;
  maxSpeedKmh: number | null;
}

/** Compact dashboard summary for the "time in car" stat card. */
export interface DrivingSummary {
  /** Latest day present in the data (may be today or earlier). */
  latestDate: string | null;
  latestMinutes: number | null;
  /** Totals over the last 7 calendar days ending at `latestDate`. */
  weekMinutes: number;
  weekDrives: number;
  /** Recent daily minutes, ascending by date, for a sparkline. */
  trend: { date: string; minutes: number }[];
}
