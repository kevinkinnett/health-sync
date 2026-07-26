/**
 * Effort accounting.
 *
 * The dashboard measured activity almost entirely in steps — the
 * dashboard sparkline, both streaks, personal records, the day-of-week
 * heatmap and every correlation pair. Resistance training produces no
 * steps, so three sessions a week at 120 bpm registered as nothing. A
 * 50-minute workout showed up as "below your step average".
 *
 * These types add a step-independent view of effort: what KIND of work a
 * session was, and how much load it carried.
 */

export type ExerciseType =
  /** Resistance work — no meaningful step count, elevated heart rate. */
  | "strength"
  /** Sustained aerobic work: run, bike, row, swim, sport. */
  | "cardio"
  /** Ambulatory: walks and hikes. */
  | "walk"
  /** Physical but incidental: yard work, chores. */
  | "chore"
  | "other";

/**
 * A training-load score for one day.
 *
 * IMPORTANT: `load` is a SELF-RELATIVE index, not a physiological
 * quantity. It is comparable across your own days; it is not comparable
 * to anyone else's, and its absolute magnitude depends on an assumed
 * maximum heart rate. Use it to see "was this week harder than last",
 * not to claim a number means something on its own.
 */
export interface TrainingLoadDay {
  date: string;
  /** Total load across every session that day. */
  load: number;
  /** Sessions logged. */
  sessions: number;
  /** Total minutes of logged exercise. */
  minutes: number;
  /** Load split by exercise type, so strength work is visible on its own. */
  byType: Partial<Record<ExerciseType, number>>;
  /** True when at least one session lacked heart rate and used a fallback. */
  estimated: boolean;
}

export interface TrainingSession {
  logId: number;
  date: string;
  activityName: string;
  type: ExerciseType;
  minutes: number;
  averageHeartRate: number | null;
  steps: number | null;
  calories: number | null;
  load: number;
  /** True when heart rate was missing and a default intensity was used. */
  estimated: boolean;
}

export interface TrainingSummary {
  days: TrainingLoadDay[];
  sessions: TrainingSession[];
  /** Total load over the window, by type. */
  totalByType: Partial<Record<ExerciseType, number>>;
  /** Sessions per week over the window, for "am I keeping it up?". */
  sessionsPerWeek: number;
}
