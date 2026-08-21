import type {
  RecoveryEffectOutcome,
  RecoveryEventStudyAggregatePoint,
  RecoveryEventStudyEvidenceState,
  RecoveryEventStudyTrajectory,
  RecoveryDurationGroup,
  RecoveryDurationResponse,
  RecoveryTimingResponse,
} from "@health-dashboard/shared";
import { addDays } from "../userTz.js";
import { pairedBootstrapInterval, round, spearman } from "./statistics.js";
import {
  getRecoveryOutcome,
  RECOVERY_MAX_MATCH_DAY_DISTANCE,
  RECOVERY_MIN_MATCHES,
  recoveryCovariateScales,
  recoveryMatchDistance,
  type AlignedRecoveryPeriod,
  type RecoveryOutcomeDefinition,
} from "./recoveryEffectEngine.js";

export const RECOVERY_EVENT_WINDOW_DAYS = 7;
export const RECOVERY_EVENT_MAX_CONTROLS = 8;
export const RECOVERY_EVENT_MIN_COMPARISONS = 3;
export const RECOVERY_EVENT_MAX_TRAJECTORIES = 20;
export const RECOVERY_DURATION_MIN_EVENTS = 10;
export const RECOVERY_DURATION_MIN_DISTINCT = 3;
export const RECOVERY_DURATION_MIN_RANGE_MINUTES = 20;
export const RECOVERY_TIMING_MIN_RANGE_MINUTES = 60;

export interface RecoveryEventStudyEngineResult {
  outcomeDefinition: RecoveryOutcomeDefinition;
  evidenceState: RecoveryEventStudyEvidenceState;
  totalEvents: number;
  eligibleEvents: number;
  matchedPairs: number;
  totalTrajectories: number;
  trajectories: RecoveryEventStudyTrajectory[];
  aggregate: RecoveryEventStudyAggregatePoint[];
  durationResponses: RecoveryDurationResponse[];
  timingResponses: RecoveryTimingResponse[];
}

/** Builds descriptive, outcome-specific timelines without making causal claims. */
export function buildRecoveryEventStudy(
  periods: AlignedRecoveryPeriod[],
  activityId: number,
  outcome: RecoveryEffectOutcome,
  matchedPairs: number,
): RecoveryEventStudyEngineResult {
  const definition = getRecoveryOutcome(outcome);
  const periodsByDate = new Map(periods.map((period) => [period.date, period]));
  const scales = recoveryCovariateScales(periods);
  const anchors = periods.filter((period) => period.sessions.some((session) => session.activityId === activityId));

  const allTrajectories = anchors.map((anchor) => {
    const activityIds = new Set(anchor.sessions.map((session) => session.activityId));
    const selectedSessions = anchor.sessions.filter((session) => session.activityId === activityId);
    const combinedExposure = activityIds.size > 1;
    const eligible = !combinedExposure && definition.value(anchor) != null;
    const totalDurationMinutes = selectedSessions.reduce((sum, session) => sum + session.durationMinutes, 0);
    const latestSessionEnd = Math.max(...selectedSessions.map((session) =>
      Date.parse(session.startedAt) + session.durationMinutes * 60_000));
    const sessionToSleepMinutes = Math.max(
      0,
      Math.round((Date.parse(anchor.sleepStartAt) - latestSessionEnd) / 60_000),
    );
    const controls = selectControls(periods, anchor, definition, scales);
    const points = offsets().map((offsetDays) => {
      const date = addDays(anchor.date, offsetDays);
      const actualPeriod = periodsByDate.get(date);
      const actual = actualPeriod == null ? null : definition.value(actualPeriod);
      const controlValues = controls.flatMap((control) => {
        const period = periodsByDate.get(addDays(control.date, offsetDays));
        const value = period == null || period.sessions.length > 0 ? null : definition.value(period);
        return value == null ? [] : [value];
      });
      const hasComparison = controlValues.length >= RECOVERY_EVENT_MIN_COMPARISONS;
      const expectedCenter = hasComparison ? round(median(controlValues), 1) : null;
      const recoveryExposures = actualPeriod == null
        ? []
        : [...new Set(actualPeriod.sessions.map((session) => session.activityName))];
      const excludedFromAggregate = combinedExposure || (offsetDays > 0 && recoveryExposures.length > 0);
      return {
        date,
        offsetDays,
        actual,
        expectedCenter,
        expectedRange: hasComparison
          ? { low: round(Math.min(...controlValues), 1), high: round(Math.max(...controlValues), 1) }
          : null,
        delta: actual != null && expectedCenter != null ? round(actual - expectedCenter, 1) : null,
        controlCount: controlValues.length,
        recoveryExposures,
        excludedFromAggregate,
      };
    });
    return {
      anchorDate: anchor.date,
      sessionIds: selectedSessions.map((session) => session.id),
      startedAts: selectedSessions.map((session) => session.startedAt),
      totalDurationMinutes,
      sessionToSleepMinutes,
      durationGroup: durationGroup(totalDurationMinutes),
      combinedExposure,
      eligible,
      points,
    } satisfies RecoveryEventStudyTrajectory;
  });

  const eligibleTrajectories = allTrajectories.filter((trajectory) => trajectory.eligible);
  const aggregate = eligibleTrajectories.length >= 3
    ? offsets().flatMap((offsetDays) => {
        const deltas = eligibleTrajectories.flatMap((trajectory) => {
          const point = trajectory.points.find((candidate) => candidate.offsetDays === offsetDays);
          return point?.delta == null || point.excludedFromAggregate ? [] : [point.delta];
        });
        if (deltas.length < 3) return [];
        return [{
          offsetDays,
          sampleCount: deltas.length,
          medianDelta: round(median(deltas), 1),
          observedRange: { low: round(Math.min(...deltas), 1), high: round(Math.max(...deltas), 1) },
        } satisfies RecoveryEventStudyAggregatePoint];
      })
    : [];

  const trajectories = [...allTrajectories]
    .sort((a, b) => b.anchorDate.localeCompare(a.anchorDate))
    .slice(0, RECOVERY_EVENT_MAX_TRAJECTORIES);
  const durationResponses = Array.from({ length: 8 }, (_, offsetDays) =>
    buildDurationResponse(eligibleTrajectories, offsetDays, activityId, outcome));
  const timingResponses = Array.from({ length: 8 }, (_, offsetDays) =>
    buildTimingResponse(eligibleTrajectories, offsetDays, activityId, outcome));
  return {
    outcomeDefinition: definition,
    evidenceState: evidenceState(eligibleTrajectories.length, matchedPairs),
    totalEvents: allTrajectories.length,
    eligibleEvents: eligibleTrajectories.length,
    matchedPairs,
    totalTrajectories: allTrajectories.length,
    trajectories,
    aggregate,
    durationResponses,
    timingResponses,
  };
}

function buildDurationResponse(
  trajectories: RecoveryEventStudyTrajectory[],
  offsetDays: number,
  activityId: number,
  outcome: RecoveryEffectOutcome,
): RecoveryDurationResponse {
  const estimate = buildExposureResponse(
    trajectories,
    offsetDays,
    (trajectory) => trajectory.totalDurationMinutes,
    RECOVERY_DURATION_MIN_RANGE_MINUTES,
    10,
    `recovery-duration:${activityId}:${outcome}:${offsetDays}`,
  );
  const base = {
    offsetDays,
    eligibleEvents: estimate.eligibleEvents,
    distinctDurations: estimate.distinctValues,
    durationRangeMinutes: estimate.valueRangeMinutes,
  };
  if (estimate.state === "insufficient_events") {
    return { ...base, state: "insufficient_events", slopePer10Minutes: null, slopeConfidenceInterval: null, rankCorrelation: null };
  }
  if (estimate.state === "insufficient_variation") {
    return { ...base, state: "insufficient_variation", slopePer10Minutes: null, slopeConfidenceInterval: null, rankCorrelation: null };
  }
  return {
    ...base,
    state: "available",
    slopePer10Minutes: estimate.slope,
    slopeConfidenceInterval: estimate.confidenceInterval,
    rankCorrelation: estimate.rankCorrelation,
  };
}

function buildTimingResponse(
  trajectories: RecoveryEventStudyTrajectory[],
  offsetDays: number,
  activityId: number,
  outcome: RecoveryEffectOutcome,
): RecoveryTimingResponse {
  const estimate = buildExposureResponse(
    trajectories,
    offsetDays,
    (trajectory) => trajectory.sessionToSleepMinutes,
    RECOVERY_TIMING_MIN_RANGE_MINUTES,
    60,
    `recovery-timing:${activityId}:${outcome}:${offsetDays}`,
  );
  return {
    offsetDays,
    state: estimate.state,
    eligibleEvents: estimate.eligibleEvents,
    distinctTimings: estimate.distinctValues,
    timingRangeMinutes: estimate.valueRangeMinutes,
    slopePer60Minutes: estimate.slope,
    slopeConfidenceInterval: estimate.confidenceInterval,
    rankCorrelation: estimate.rankCorrelation,
  };
}

function buildExposureResponse(
  trajectories: RecoveryEventStudyTrajectory[],
  offsetDays: number,
  predictor: (trajectory: RecoveryEventStudyTrajectory) => number,
  minimumRange: number,
  slopeScaleMinutes: number,
  seed: string,
): {
  state: RecoveryDurationResponse["state"];
  eligibleEvents: number;
  distinctValues: number;
  valueRangeMinutes: number;
  slope: number | null;
  confidenceInterval: RecoveryDurationResponse["slopeConfidenceInterval"];
  rankCorrelation: number | null;
} {
  const eligible = trajectories.flatMap((trajectory) => {
    const point = trajectory.points.find((candidate) => candidate.offsetDays === offsetDays);
    return point?.delta == null || point.excludedFromAggregate
      ? []
      : [{ predictor: predictor(trajectory), delta: point.delta }];
  });
  const predictors = eligible.map((point) => point.predictor);
  const deltas = eligible.map((point) => point.delta);
  const distinctValues = new Set(predictors).size;
  const valueRangeMinutes = predictors.length === 0 ? 0 : Math.max(...predictors) - Math.min(...predictors);
  const base = { eligibleEvents: eligible.length, distinctValues, valueRangeMinutes };
  if (eligible.length < RECOVERY_DURATION_MIN_EVENTS) {
    return { ...base, state: "insufficient_events", slope: null, confidenceInterval: null, rankCorrelation: null };
  }
  if (distinctValues < RECOVERY_DURATION_MIN_DISTINCT || valueRangeMinutes < minimumRange) {
    return { ...base, state: "insufficient_variation", slope: null, confidenceInterval: null, rankCorrelation: null };
  }
  const statistic = (xs: number[], ys: number[]) => theilSenSlope(xs, ys, slopeScaleMinutes);
  return {
    ...base,
    state: "available",
    slope: round(statistic(predictors, deltas)!, 2),
    confidenceInterval: pairedBootstrapInterval(predictors, deltas, seed, statistic),
    rankCorrelation: round(spearman(predictors, deltas), 3),
  };
}

function theilSenSlope(predictors: number[], deltas: number[], scaleMinutes: number): number | null {
  const slopes: number[] = [];
  for (let left = 0; left < predictors.length; left++) {
    for (let right = left + 1; right < predictors.length; right++) {
      const predictorDifference = predictors[right] - predictors[left];
      if (predictorDifference === 0) continue;
      slopes.push((deltas[right] - deltas[left]) / predictorDifference * scaleMinutes);
    }
  }
  return slopes.length === 0 ? null : median(slopes);
}

function durationGroup(minutes: number): RecoveryDurationGroup {
  if (minutes <= 30) return "short";
  if (minutes < 45) return "medium";
  return "long";
}

function selectControls(
  periods: AlignedRecoveryPeriod[],
  anchor: AlignedRecoveryPeriod,
  outcome: RecoveryOutcomeDefinition,
  scales: ReturnType<typeof recoveryCovariateScales>,
): AlignedRecoveryPeriod[] {
  return periods
    .filter((period) =>
      period.sessions.length === 0 &&
      period.weekday === anchor.weekday &&
      dayDistance(period.date, anchor.date) <= RECOVERY_MAX_MATCH_DAY_DISTANCE &&
      outcome.value(period) != null)
    .map((period) => ({ period, score: recoveryMatchDistance(anchor, period, scales) }))
    .sort((a, b) => a.score - b.score || a.period.date.localeCompare(b.period.date))
    .slice(0, RECOVERY_EVENT_MAX_CONTROLS)
    .map(({ period }) => period);
}

function evidenceState(eligibleEvents: number, matchedPairs: number): RecoveryEventStudyEvidenceState {
  if (matchedPairs >= 40) return "high";
  if (matchedPairs >= 20) return "moderate";
  if (matchedPairs >= RECOVERY_MIN_MATCHES) return "matched";
  if (eligibleEvents >= 3) return "provisional";
  if (eligibleEvents >= 1) return "individual";
  return "collecting";
}

function offsets(): number[] {
  return Array.from({ length: RECOVERY_EVENT_WINDOW_DAYS * 2 + 1 }, (_, index) => index - RECOVERY_EVENT_WINDOW_DAYS);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function dayDistance(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}
