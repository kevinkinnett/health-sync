export interface HrvDay {
  date: string;
  dailyRmssd: number | null;
  deepRmssd: number | null;
  /** Google Health native non-REM heart rate, when available. */
  nonRemHeartRate: number | null;
  /** Identifies algorithm/source regimes so baselines never bridge a cutover. */
  measurementMethod: string;
  fetchedAt: string;
}
