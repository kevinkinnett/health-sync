import type { ExerciseType } from "@health-dashboard/shared";

/**
 * Works out what KIND of exercise a logged session was.
 *
 * This exists because Fitbit auto-names most sessions generically. In the
 * real data, resistance work is logged as "Workout" or "Activity" — the
 * only session ever labelled "Strength training" was entered by hand. So
 * even the Exercises screen could not tell lifting from a walk, and
 * nothing downstream could either.
 *
 * The load-bearing rule is the generic-name case: a session with a
 * meaningful heart rate and NO step count is non-ambulatory effort, which
 * on this dataset means resistance work. That single inference is what
 * makes three weeks of lifting visible.
 *
 * Pure and dependency-free, so the rules can be exercised directly.
 */

/** Names that state the activity outright, checked as substrings. */
const EXPLICIT: { match: string[]; type: ExerciseType }[] = [
  { match: ["strength", "weight", "resistance"], type: "strength" },
  { match: ["walk", "hike"], type: "walk" },
  {
    match: ["run", "jog", "bike", "cycl", "row", "swim", "elliptical", "sport", "treadmill"],
    type: "cardio",
  },
  { match: ["mow", "lawn", "yard", "garden", "shovel"], type: "chore" },
];

/** Generic labels Fitbit assigns when it detects effort it can't name. */
const GENERIC = ["workout", "activity", "exercise"];

/** Below this, an "elevated" heart rate isn't evidence of real effort. */
const MIN_EFFORT_BPM = 95;

/**
 * Steps at or below this are treated as incidental — a few paces between
 * sets, not locomotion.
 */
const INCIDENTAL_STEPS = 300;

export interface ClassifiableSession {
  activityName: string;
  steps: number | null;
  averageHeartRate: number | null;
}

export function classifyExercise(session: ClassifiableSession): ExerciseType {
  const name = session.activityName.toLowerCase();

  for (const { match, type } of EXPLICIT) {
    if (match.some((m) => name.includes(m))) return type;
  }

  const isGeneric = GENERIC.some((g) => name.includes(g));
  if (isGeneric) {
    const ambulatory = (session.steps ?? 0) > INCIDENTAL_STEPS;
    const working = (session.averageHeartRate ?? 0) >= MIN_EFFORT_BPM;
    // No steps but a working heart rate = effort that goes nowhere:
    // lifting, bodyweight circuits, machines.
    if (!ambulatory && working) return "strength";
    if (ambulatory) return "walk";
  }

  return "other";
}
