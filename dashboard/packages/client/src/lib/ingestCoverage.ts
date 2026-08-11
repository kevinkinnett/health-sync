import type { IngestState } from "@health-dashboard/shared";

export const HISTORY_TARGET_DAYS = 365;

export interface CoverageGap {
  dataType: string;
  daysCovered: number;
  daysRemaining: number;
}

export function isTrackedCoverageState(state: IngestState): boolean {
  return !state.dataType.startsWith("__");
}

export function historyDaysCovered(state: IngestState): number {
  if (state.coverage) return state.coverage.daysCovered;
  if (!state.earliestFetchedDate || !state.latestFetchedDate) return 0;
  return Math.max(
    0,
    Math.round(
      (new Date(state.latestFetchedDate).getTime() -
        new Date(state.earliestFetchedDate).getTime()) /
        86_400_000,
    ),
  );
}

export function historyDaysRemaining(state: IngestState): number {
  if (state.coverage) {
    if (["target_met", "provider_limited"].includes(state.coverage.status)) return 0;
    return Math.max(0, state.coverage.targetDays - state.coverage.daysCovered);
  }
  if (state.historyTargetMet) return 0;
  return Math.max(0, HISTORY_TARGET_DAYS - historyDaysCovered(state));
}

export function isHistoryTargetMet(state: IngestState): boolean {
  if (state.coverage) {
    return state.coverage.status === "target_met" || state.coverage.status === "provider_limited";
  }
  return isTrackedCoverageState(state) && historyDaysRemaining(state) === 0;
}

export function findLargestCoverageGap(
  state: IngestState[],
): CoverageGap | null {
  const gaps = state
    .filter(isTrackedCoverageState)
    .map((item) => ({
      dataType: item.dataType,
      daysCovered: historyDaysCovered(item),
      daysRemaining: historyDaysRemaining(item),
    }))
    .filter((item) => item.daysRemaining > 0);

  if (gaps.length === 0) return null;
  return gaps.reduce((largest, current) =>
    current.daysRemaining > largest.daysRemaining ? current : largest,
  );
}
