export interface ExerciseLog {
  logId: number;
  date: string;
  startTime: string | null;
  activityName: string;
  activityTypeId: number | null;
  logType: string | null;
  calories: number | null;
  durationMs: number | null;
  distance: number | null;
  distanceUnit: string | null;
  steps: number | null;
  averageHeartRate: number | null;
  elevationGain: number | null;
  hasActiveZoneMinutes: boolean;
  fetchedAt: string;
}
