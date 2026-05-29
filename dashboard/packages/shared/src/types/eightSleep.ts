/**
 * Eight Sleep nightly session — the metrics surfaced from
 * `universe.eight_sleep_session`. Sleep durations are in MINUTES (the
 * ingest stores seconds; the repo converts) to match the Fitbit sleep
 * shape. One record per night (per bed side; single sleeper = "main").
 */
export interface EightSleepDay {
  date: string;
  score: number | null;
  sleepDurationMin: number | null;
  deepMin: number | null;
  lightMin: number | null;
  remMin: number | null;
  avgHeartRate: number | null;
  avgHrvRmssd: number | null;
  avgRespiratoryRate: number | null;
  avgBedTempC: number | null;
  avgRoomTempC: number | null;
  /** Toss-and-turn count (restlessness). */
  tnt: number | null;
  sleepStart: string | null;
  sleepEnd: string | null;
}
