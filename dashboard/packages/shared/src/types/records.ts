export interface PersonalRecord {
  metric: string;
  label: string;
  value: number;
  unit: string;
  date: string;
}

export interface Streak {
  label: string;
  current: number;
  best: number;
  unit: string;
}

export interface RecordsData {
  records: PersonalRecord[];
  streaks: Streak[];
}
