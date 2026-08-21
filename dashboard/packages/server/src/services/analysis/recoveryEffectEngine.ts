import type {
  RecoveryActivity,
  RecoveryEffectEstimate,
  RecoveryEffectOutcome,
  RecoverySession,
} from "@health-dashboard/shared";
import {
  blockBootstrapMeanInterval,
  mean,
  round,
  sampleSd,
} from "./statistics.js";

export const RECOVERY_MIN_MATCHES = 10;
export const RECOVERY_MAX_MATCH_DAY_DISTANCE = 84;
export const RECOVERY_MAX_SESSION_TO_SLEEP_HOURS = 24;

export interface RecoverySleepPeriod {
  date: string;
  sleepStartAt: string;
  weekday: number;
  priorSleepMinutes: number | null;
  priorRestingHeartRate: number | null;
  priorHrv: number | null;
  recentTrainingLoad7: number;
  outcomes: {
    sleepDuration: number | null;
    sleepEfficiency: number | null;
    restingHeartRate: number | null;
    hrv: number | null;
    restlessness: number | null;
    readiness: number | null;
  };
}

export interface AlignedRecoveryPeriod extends RecoverySleepPeriod {
  sessions: RecoverySession[];
}

export interface RecoveryEffectEngineResult {
  effects: RecoveryEffectEstimate[];
  matchedPairsByActivity: Map<number, number>;
  matchedPairsByActivityOutcome: Map<string, number>;
}

export interface RecoveryOutcomeDefinition {
  key: RecoveryEffectOutcome;
  label: string;
  unit: string;
  betterDirection: "up" | "down";
  value: (period: RecoverySleepPeriod) => number | null;
}

export const RECOVERY_OUTCOMES: RecoveryOutcomeDefinition[] = [
  { key: "sleep_duration", label: "Sleep duration", unit: "min", betterDirection: "up", value: (row) => row.outcomes.sleepDuration },
  { key: "sleep_efficiency", label: "Sleep efficiency", unit: "%", betterDirection: "up", value: (row) => row.outcomes.sleepEfficiency },
  { key: "resting_heart_rate", label: "Wake-day resting HR", unit: "bpm", betterDirection: "down", value: (row) => row.outcomes.restingHeartRate },
  { key: "hrv", label: "Wake-day HRV", unit: "ms", betterDirection: "up", value: (row) => row.outcomes.hrv },
  { key: "restlessness", label: "Overnight restlessness", unit: "events", betterDirection: "down", value: (row) => row.outcomes.restlessness },
  { key: "readiness", label: "Wake-day readiness", unit: "points", betterDirection: "up", value: (row) => row.outcomes.readiness },
];

/**
 * Assign each session to the first main overnight sleep beginning after the
 * session finishes. UTC instants make this independent of midnight and DST.
 */
export function alignRecoverySessions(
  sessions: RecoverySession[],
  periods: RecoverySleepPeriod[],
): AlignedRecoveryPeriod[] {
  const sortedPeriods = [...periods]
    .filter((period) => Number.isFinite(Date.parse(period.sleepStartAt)))
    .sort((a, b) => Date.parse(a.sleepStartAt) - Date.parse(b.sleepStartAt));
  const sessionsByDate = new Map<string, RecoverySession[]>();

  for (const session of sessions) {
    const end = Date.parse(session.startedAt) + session.durationMinutes * 60_000;
    if (!Number.isFinite(end)) continue;
    const period = sortedPeriods.find((candidate) => {
      const sleepStart = Date.parse(candidate.sleepStartAt);
      const gap = sleepStart - end;
      return gap >= 0 && gap <= RECOVERY_MAX_SESSION_TO_SLEEP_HOURS * 3_600_000;
    });
    if (!period) continue;
    const existing = sessionsByDate.get(period.date);
    if (existing) existing.push(session);
    else sessionsByDate.set(period.date, [session]);
  }

  return sortedPeriods.map((period) => ({
    ...period,
    sessions: (sessionsByDate.get(period.date) ?? []).sort(
      (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
    ),
  }));
}

export function estimateRecoveryEffects(
  activities: RecoveryActivity[],
  periods: AlignedRecoveryPeriod[],
): RecoveryEffectEngineResult {
  const effects: RecoveryEffectEstimate[] = [];
  const matchedPairsByActivity = new Map<number, number>();
  const matchedPairsByActivityOutcome = new Map<string, number>();
  for (const activity of activities) {
    for (const outcome of RECOVERY_OUTCOMES) {
      const matches = matchPeriods(periods, activity.id, outcome);
      matchedPairsByActivityOutcome.set(`${activity.id}:${outcome.key}`, matches.length);
      matchedPairsByActivity.set(
        activity.id,
        Math.max(matchedPairsByActivity.get(activity.id) ?? 0, matches.length),
      );
      if (matches.length < RECOVERY_MIN_MATCHES) continue;
      effects.push(summarize(activity, outcome, matches));
    }
  }
  return { effects, matchedPairsByActivity, matchedPairsByActivityOutcome };
}

export function getRecoveryOutcome(outcome: RecoveryEffectOutcome): RecoveryOutcomeDefinition {
  return RECOVERY_OUTCOMES.find((definition) => definition.key === outcome)!;
}

interface Match {
  exposed: AlignedRecoveryPeriod;
  control: AlignedRecoveryPeriod;
  exposedValue: number;
  controlValue: number;
}

function matchPeriods(
  periods: AlignedRecoveryPeriod[],
  activityId: number,
  outcome: RecoveryOutcomeDefinition,
): Match[] {
  const exposed = periods.filter((period) => {
    const activityIds = new Set(period.sessions.map((session) => session.activityId));
    return activityIds.size === 1 && activityIds.has(activityId) && outcome.value(period) != null;
  });
  const controls = periods.filter(
    (period) => period.sessions.length === 0 && outcome.value(period) != null,
  );
  const scales = recoveryCovariateScales(periods);
  const candidates = exposed.map((period) => ({
    exposed: period,
    options: controls
      .filter((control) =>
        control.weekday === period.weekday &&
        dayDistance(control.date, period.date) <= RECOVERY_MAX_MATCH_DAY_DISTANCE)
      .map((control) => ({ control, score: recoveryMatchDistance(period, control, scales) }))
      .sort((a, b) => a.score - b.score),
  })).sort((a, b) => a.options.length - b.options.length);

  const usedControlDates = new Set<string>();
  const matches: Match[] = [];
  for (const candidate of candidates) {
    const selected = candidate.options.find(({ control }) => !usedControlDates.has(control.date));
    if (!selected) continue;
    usedControlDates.add(selected.control.date);
    matches.push({
      exposed: candidate.exposed,
      control: selected.control,
      exposedValue: outcome.value(candidate.exposed)!,
      controlValue: outcome.value(selected.control)!,
    });
  }
  return matches.sort((a, b) => a.exposed.date.localeCompare(b.exposed.date));
}

function summarize(
  activity: RecoveryActivity,
  outcome: RecoveryOutcomeDefinition,
  matches: Match[],
): RecoveryEffectEstimate {
  const exposedValues = matches.map((match) => match.exposedValue);
  const controlValues = matches.map((match) => match.controlValue);
  const differences = matches.map((match) => match.exposedValue - match.controlValue);
  const adjustedDifference = round(mean(differences), 1);
  const confidenceInterval = blockBootstrapMeanInterval(
    differences,
    `recovery:${activity.code}:${outcome.key}`,
  );
  const pooledSd = Math.sqrt((sampleSd(exposedValues) ** 2 + sampleSd(controlValues) ** 2) / 2);
  const standardizedDifference = pooledSd > 0 ? round(adjustedDifference / pooledSd, 2) : null;
  const beneficial = outcome.betterDirection === "up" ? adjustedDifference > 0 : adjustedDifference < 0;
  const excludesZero = confidenceInterval.low > 0 || confidenceInterval.high < 0;
  const conclusion = !excludesZero ? "unclear" : beneficial ? "helped" : "cost";
  const confidence = matches.length >= 40 ? "high" : matches.length >= 20 ? "moderate" : "limited";

  return {
    activityId: activity.id,
    activityCode: activity.code,
    activityName: activity.name,
    outcome: outcome.key,
    outcomeLabel: outcome.label,
    unit: outcome.unit,
    betterDirection: outcome.betterDirection,
    exposedPeriods: matches.length,
    matchedControlPeriods: matches.length,
    exposedMean: round(mean(exposedValues), 1),
    controlMean: round(mean(controlValues), 1),
    adjustedDifference,
    confidenceInterval,
    standardizedDifference,
    conclusion,
    confidence,
    evidence: "adjusted_association",
    interpretation: interpretation(activity.name, outcome, adjustedDifference, confidenceInterval, conclusion),
  };
}

function interpretation(
  activityName: string,
  outcome: RecoveryOutcomeDefinition,
  difference: number,
  interval: { low: number; high: number },
  conclusion: RecoveryEffectEstimate["conclusion"],
): string {
  if (conclusion === "unclear") {
    return `${activityName} sessions have not shown a consistent difference in ${outcome.label.toLowerCase()} yet; the plausible range is ${signed(interval.low)} to ${signed(interval.high)} ${outcome.unit}.`;
  }
  const direction = difference >= 0 ? "higher" : "lower";
  return `${activityName} sessions were followed by ${Math.abs(difference).toFixed(1)} ${outcome.unit} ${direction} ${outcome.label.toLowerCase()} than matched nights.`;
}

export function recoveryCovariateScales(periods: RecoverySleepPeriod[]) {
  return {
    sleep: Math.max(sampleSd(periods.flatMap((row) => row.priorSleepMinutes == null ? [] : [row.priorSleepMinutes])), 20),
    rhr: Math.max(sampleSd(periods.flatMap((row) => row.priorRestingHeartRate == null ? [] : [row.priorRestingHeartRate])), 2),
    hrv: Math.max(sampleSd(periods.flatMap((row) => row.priorHrv == null ? [] : [row.priorHrv])), 3),
    load: Math.max(sampleSd(periods.map((row) => row.recentTrainingLoad7)), 5),
  };
}

export function recoveryMatchDistance(
  exposed: RecoverySleepPeriod,
  control: RecoverySleepPeriod,
  scales: ReturnType<typeof recoveryCovariateScales>,
): number {
  return (
    normalizedDistance(exposed.priorSleepMinutes, control.priorSleepMinutes, scales.sleep) +
    normalizedDistance(exposed.priorRestingHeartRate, control.priorRestingHeartRate, scales.rhr) +
    normalizedDistance(exposed.priorHrv, control.priorHrv, scales.hrv) * 0.6 +
    Math.abs(exposed.recentTrainingLoad7 - control.recentTrainingLoad7) / scales.load +
    dayDistance(exposed.date, control.date) / RECOVERY_MAX_MATCH_DAY_DISTANCE * 0.5
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
