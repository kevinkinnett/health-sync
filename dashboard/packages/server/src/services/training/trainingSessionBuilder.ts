import type {
  ExerciseLog,
  TrainingLoadDay,
  TrainingSession,
} from "@health-dashboard/shared";
import { classifyExercise } from "./exerciseClassifier.js";
import { sessionLoad, sumByType } from "./trainingLoad.js";

/**
 * Provider-neutral conversion from raw exercise logs to the training model.
 * Kept pure so the training screen and downstream effect analysis use the
 * exact same classification and load rules.
 */
export function buildTrainingSessions(
  logs: ExerciseLog[],
  restingByDate: ReadonlyMap<string, number | null>,
  maxHeartRate?: number,
): TrainingSession[] {
  return logs.map((log) => {
    const minutes = log.durationMs != null ? log.durationMs / 60_000 : 0;
    const type = classifyExercise({
      activityName: log.activityName,
      steps: log.steps,
      averageHeartRate: log.averageHeartRate,
    });
    const { load, estimated } = sessionLoad({
      minutes,
      averageHeartRate: log.averageHeartRate,
      restingHeartRate: restingByDate.get(log.date) ?? null,
      maxHeartRate,
    });
    return {
      logId: log.logId,
      date: log.date,
      activityName: log.activityName,
      type,
      minutes: Math.round(minutes),
      averageHeartRate: log.averageHeartRate,
      steps: log.steps,
      calories: log.calories,
      load,
      estimated,
    };
  });
}

/** Aggregate classified sessions onto the local calendar-day grain. */
export function buildTrainingDays(sessions: TrainingSession[]): TrainingLoadDay[] {
  const byDate = new Map<string, TrainingSession[]>();
  for (const session of sessions) {
    const list = byDate.get(session.date);
    if (list) list.push(session);
    else byDate.set(session.date, [session]);
  }
  return [...byDate.entries()]
    .map(([date, daySessions]) => ({
      date,
      load: round1(daySessions.reduce((sum, session) => sum + session.load, 0)),
      sessions: daySessions.length,
      minutes: Math.round(daySessions.reduce((sum, session) => sum + session.minutes, 0)),
      byType: sumByType(daySessions),
      estimated: daySessions.some((session) => session.estimated),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
