export interface SleepDay {
  date: string;
  totalMinutesAsleep: number | null;
  totalMinutesInBed: number | null;
  totalSleepRecords: number | null;
  minutesDeep: number | null;
  minutesLight: number | null;
  minutesRem: number | null;
  minutesWake: number | null;
  efficiency: number | null;
  mainSleepStartTime: string | null;
  mainSleepEndTime: string | null;
  fetchedAt: string;
}
