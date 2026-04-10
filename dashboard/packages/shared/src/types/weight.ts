export interface WeightEntry {
  logId: string;
  date: string;
  time: string | null;
  weightKg: number;
  bmi: number | null;
  fatPct: number | null;
  source: string | null;
  fetchedAt: string;
}
