export interface Spo2Day {
  date: string;
  avgValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  fetchedAt: string;
}
