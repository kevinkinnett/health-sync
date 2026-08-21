import type {
  EightSleepDay,
  ExerciseType,
  HeartRateDay,
  HrvDay,
  SleepDay,
  TrainingLoadDay,
} from "@health-dashboard/shared";
import { addDays } from "../userTz.js";

/** One provider-neutral local day used by within-person analyses. */
export interface DailyAnalysisRow {
  date: string;
  weekday: number;
  trainingLoad: number;
  trainingMinutes: number;
  exerciseTypes: ExerciseType[];
  recentTrainingLoad7: number;
  /** Morning covariates known before a workout on this date. */
  priorSleepMinutes: number | null;
  priorRestingHeartRate: number | null;
  priorHrv: number | null;
  /** Outcomes are wake-dated on D+1: the night after this daytime exposure. */
  outcomes: {
    sleepDuration: number | null;
    sleepEfficiency: number | null;
    restingHeartRate: number | null;
    hrv: number | null;
    restlessness: number | null;
  };
}

export function buildDailyAnalysisRows(input: {
  start: string;
  end: string;
  trainingDays: TrainingLoadDay[];
  sleep: SleepDay[];
  heartRate: HeartRateDay[];
  hrv: HrvDay[];
  eightSleep: EightSleepDay[];
}): DailyAnalysisRow[] {
  const training = new Map(input.trainingDays.map((day) => [day.date, day]));
  const sleep = new Map(input.sleep.map((day) => [day.date, day]));
  const heartRate = new Map(input.heartRate.map((day) => [day.date, day]));
  const hrv = new Map(input.hrv.map((day) => [day.date, day]));
  const eightSleep = new Map(input.eightSleep.map((day) => [day.date, day]));
  const rows: DailyAnalysisRow[] = [];

  for (let date = input.start; date <= input.end; date = addDays(date, 1)) {
    const day = training.get(date);
    let recentTrainingLoad7 = 0;
    for (let offset = 1; offset <= 7; offset++) {
      recentTrainingLoad7 += training.get(addDays(date, -offset))?.load ?? 0;
    }
    const outcomeDate = addDays(date, 1);
    const outcomeSleep = sleep.get(outcomeDate);
    rows.push({
      date,
      weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      trainingLoad: day?.load ?? 0,
      trainingMinutes: day?.minutes ?? 0,
      exerciseTypes: Object.entries(day?.byType ?? {})
        .filter(([, load]) => (load ?? 0) > 0)
        .map(([type]) => type as ExerciseType),
      recentTrainingLoad7,
      priorSleepMinutes: sleep.get(date)?.totalMinutesAsleep ?? null,
      priorRestingHeartRate: heartRate.get(date)?.restingHeartRate ?? null,
      priorHrv: hrv.get(date)?.dailyRmssd ?? null,
      outcomes: {
        sleepDuration: outcomeSleep?.totalMinutesAsleep ?? null,
        sleepEfficiency: outcomeSleep?.efficiency ?? null,
        restingHeartRate: heartRate.get(outcomeDate)?.restingHeartRate ?? null,
        hrv: hrv.get(outcomeDate)?.dailyRmssd ?? null,
        restlessness: eightSleep.get(outcomeDate)?.tnt ?? null,
      },
    });
  }
  return rows;
}
