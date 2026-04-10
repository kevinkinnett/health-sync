export interface HeartRateDay {
  date: string;
  restingHeartRate: number | null;
  zoneOutOfRangeMin: number | null;
  zoneFatBurnMin: number | null;
  zoneCardioMin: number | null;
  zonePeakMin: number | null;
  zoneOutOfRangeCal: number | null;
  zoneFatBurnCal: number | null;
  zoneCardioCal: number | null;
  zonePeakCal: number | null;
  fetchedAt: string;
}
