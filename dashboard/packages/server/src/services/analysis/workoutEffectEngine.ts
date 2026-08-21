import type {
  WorkoutEffectEstimate,
  WorkoutEffectExposure,
  WorkoutEffectOutcome,
} from "@health-dashboard/shared";
import type { DailyAnalysisRow } from "./dailyAnalysis.js";
import {
  blockBootstrapMeanInterval,
  mean,
  round,
  sampleSd,
} from "./statistics.js";

const MIN_MATCHES = 10;
export const MAX_MATCH_DAY_DISTANCE = 84;

interface OutcomeDefinition {
  key: WorkoutEffectOutcome;
  label: string;
  unit: string;
  betterDirection: "up" | "down";
  value: (row: DailyAnalysisRow) => number | null;
}

const OUTCOMES: OutcomeDefinition[] = [
  { key: "sleep_duration", label: "Sleep that night", unit: "min", betterDirection: "up", value: (row) => row.outcomes.sleepDuration },
  { key: "sleep_efficiency", label: "Sleep efficiency", unit: "%", betterDirection: "up", value: (row) => row.outcomes.sleepEfficiency },
  { key: "resting_heart_rate", label: "Next-morning resting HR", unit: "bpm", betterDirection: "down", value: (row) => row.outcomes.restingHeartRate },
  { key: "hrv", label: "Next-morning HRV", unit: "ms", betterDirection: "up", value: (row) => row.outcomes.hrv },
  { key: "restlessness", label: "Restlessness that night", unit: "events", betterDirection: "down", value: (row) => row.outcomes.restlessness },
];

const EXPOSURES: Array<{ key: WorkoutEffectExposure; label: string }> = [
  { key: "all", label: "Any workout" },
  { key: "strength", label: "Strength" },
  { key: "cardio", label: "Cardio" },
  { key: "walk", label: "Walking" },
  { key: "chore", label: "Chores" },
  { key: "other", label: "Other exercise" },
];

interface Match {
  workout: DailyAnalysisRow;
  rest: DailyAnalysisRow;
  workoutValue: number;
  restValue: number;
}

export function estimateWorkoutEffects(rows: DailyAnalysisRow[]): WorkoutEffectEstimate[] {
  const effects: WorkoutEffectEstimate[] = [];
  for (const exposure of EXPOSURES) {
    for (const outcome of OUTCOMES) {
      const matches = matchDays(rows, exposure.key, outcome);
      if (matches.length < MIN_MATCHES) continue;
      effects.push(summarize(matches, exposure, outcome));
    }
  }
  return effects;
}

function matchDays(
  rows: DailyAnalysisRow[],
  exposure: WorkoutEffectExposure,
  outcome: OutcomeDefinition,
): Match[] {
  const workoutRows = rows.filter((row) => isExposure(row, exposure) && outcome.value(row) != null);
  const restRows = rows.filter((row) => row.trainingLoad === 0 && outcome.value(row) != null);
  const scales = covariateScales(rows);
  const candidates = workoutRows.map((workout) => ({
    workout,
    options: restRows
      .filter((rest) => rest.weekday === workout.weekday && dayDistance(rest.date, workout.date) <= MAX_MATCH_DAY_DISTANCE)
      .map((rest) => ({ rest, score: matchDistance(workout, rest, scales) }))
      .sort((a, b) => a.score - b.score),
  })).sort((a, b) => a.options.length - b.options.length);

  // Without replacement: one unusually good rest day cannot become the
  // counterfactual for a dozen workouts and overstate effective sample size.
  const usedRestDates = new Set<string>();
  const matches: Match[] = [];
  for (const candidate of candidates) {
    const selected = candidate.options.find(({ rest }) => !usedRestDates.has(rest.date));
    if (!selected) continue;
    usedRestDates.add(selected.rest.date);
    matches.push({
      workout: candidate.workout,
      rest: selected.rest,
      workoutValue: outcome.value(candidate.workout)!,
      restValue: outcome.value(selected.rest)!,
    });
  }
  return matches.sort((a, b) => a.workout.date.localeCompare(b.workout.date));
}

function summarize(
  matches: Match[],
  exposure: { key: WorkoutEffectExposure; label: string },
  outcome: OutcomeDefinition,
): WorkoutEffectEstimate {
  const workoutValues = matches.map((match) => match.workoutValue);
  const restValues = matches.map((match) => match.restValue);
  const differences = matches.map((match) => match.workoutValue - match.restValue);
  const adjustedDifference = round(mean(differences), 1);
  const confidenceInterval = blockBootstrapMeanInterval(
    differences,
    `${exposure.key}:${outcome.key}`,
  );
  const pooledSd = Math.sqrt((sampleSd(workoutValues) ** 2 + sampleSd(restValues) ** 2) / 2);
  const standardizedDifference = pooledSd > 0 ? round(adjustedDifference / pooledSd, 2) : null;
  const beneficial = outcome.betterDirection === "up" ? adjustedDifference > 0 : adjustedDifference < 0;
  const excludesZero = confidenceInterval.low > 0 || confidenceInterval.high < 0;
  const conclusion = !excludesZero ? "unclear" : beneficial ? "helped" : "cost";
  const confidence = matches.length >= 40 ? "high" : matches.length >= 20 ? "moderate" : "limited";

  return {
    exposure: exposure.key,
    exposureLabel: exposure.label,
    outcome: outcome.key,
    outcomeLabel: outcome.label,
    unit: outcome.unit,
    betterDirection: outcome.betterDirection,
    workoutDays: matches.length,
    matchedRestDays: matches.length,
    workoutMean: round(mean(workoutValues), 1),
    matchedRestMean: round(mean(restValues), 1),
    adjustedDifference,
    confidenceInterval,
    standardizedDifference,
    conclusion,
    confidence,
    evidence: "adjusted_association",
    interpretation: interpretation(exposure.label, outcome, adjustedDifference, confidenceInterval, conclusion),
  };
}

function interpretation(
  exposureLabel: string,
  outcome: OutcomeDefinition,
  difference: number,
  interval: { low: number; high: number },
  conclusion: WorkoutEffectEstimate["conclusion"],
): string {
  if (conclusion === "unclear") {
    return `${exposureLabel} days have not shown a consistent difference in ${outcome.label.toLowerCase()} yet; the plausible range is ${signed(interval.low)} to ${signed(interval.high)} ${outcome.unit}.`;
  }
  const direction = difference >= 0 ? "higher" : "lower";
  return `${exposureLabel} days were followed by ${Math.abs(difference).toFixed(1)} ${outcome.unit} ${direction} ${outcome.label.toLowerCase()} than matched rest days.`;
}

function isExposure(row: DailyAnalysisRow, exposure: WorkoutEffectExposure): boolean {
  if (row.trainingLoad <= 0) return false;
  return exposure === "all" || row.exerciseTypes.includes(exposure);
}

function covariateScales(rows: DailyAnalysisRow[]) {
  return {
    sleep: Math.max(sampleSd(rows.flatMap((row) => row.priorSleepMinutes == null ? [] : [row.priorSleepMinutes])), 20),
    rhr: Math.max(sampleSd(rows.flatMap((row) => row.priorRestingHeartRate == null ? [] : [row.priorRestingHeartRate])), 2),
    hrv: Math.max(sampleSd(rows.flatMap((row) => row.priorHrv == null ? [] : [row.priorHrv])), 3),
    load: Math.max(sampleSd(rows.map((row) => row.recentTrainingLoad7)), 5),
  };
}

function matchDistance(
  workout: DailyAnalysisRow,
  rest: DailyAnalysisRow,
  scales: ReturnType<typeof covariateScales>,
): number {
  return (
    normalizedDistance(workout.priorSleepMinutes, rest.priorSleepMinutes, scales.sleep) +
    normalizedDistance(workout.priorRestingHeartRate, rest.priorRestingHeartRate, scales.rhr) +
    normalizedDistance(workout.priorHrv, rest.priorHrv, scales.hrv) * 0.6 +
    Math.abs(workout.recentTrainingLoad7 - rest.recentTrainingLoad7) / scales.load +
    dayDistance(workout.date, rest.date) / MAX_MATCH_DAY_DISTANCE * 0.5
  );
}

function normalizedDistance(a: number | null, b: number | null, scale: number): number {
  if (a == null && b == null) return 0;
  if (a == null || b == null) return 1.5;
  return Math.abs(a - b) / scale;
}

function dayDistance(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}
