import type {
  IngestRun,
  IngestState,
  WindmillCompletedJob,
} from "@health-dashboard/shared";

export const BACKFILL_TARGET_DAYS = 365;

export interface BackfillEstimate {
  worstType: string;
  daysRemaining: number;
  daysPerDay: number;
  estimatedDays: number | null;
}

/** Internal migration sentinels share the state table but are not data types. */
export function isTrackedBackfillState(state: IngestState): boolean {
  return !state.dataType.startsWith("__");
}

export function fetchedHistoryDays(state: IngestState): number {
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

export function backfillDaysRemaining(state: IngestState): number {
  if (state.backfillComplete) return 0;
  return Math.max(0, BACKFILL_TARGET_DAYS - fetchedHistoryDays(state));
}

export function isBackfillTargetMet(state: IngestState): boolean {
  return isTrackedBackfillState(state) && backfillDaysRemaining(state) === 0;
}

export function computeBackfillEstimate(
  state: IngestState[],
  runs: IngestRun[],
  completedJobs: WindmillCompletedJob[],
): BackfillEstimate | null {
  const pending = state
    .filter(isTrackedBackfillState)
    .map((item) => ({ item, remaining: backfillDaysRemaining(item) }))
    .filter(({ remaining }) => remaining > 0);

  if (pending.length === 0) return null;

  const bottleneck = pending.reduce((worst, current) =>
    current.remaining > worst.remaining ? current : worst,
  );
  const worstType = bottleneck.item.dataType;
  const maxRemaining = bottleneck.remaining;
  const successfulRuns = runs.filter(
    (run) => (run.rowsWritten ?? 0) > 5 && run.finishedAtUtc,
  );

  if (successfulRuns.length < 2) {
    return {
      worstType,
      daysRemaining: maxRemaining,
      daysPerDay: 0,
      estimatedDays: null,
    };
  }

  let totalDaysFetched = 0;
  for (const run of successfulRuns) {
    const typeDetail = run.details?.[worstType];
    if (!typeDetail || typeDetail.rows <= 0) continue;
    const parts = typeDetail.range.split(" to ");
    if (parts.length !== 2) continue;
    const days = Math.round(
      (new Date(parts[1]).getTime() - new Date(parts[0]).getTime()) /
        86_400_000,
    );
    if (days > 0) totalDaysFetched += days;
  }

  const oldest = new Date(
    successfulRuns[successfulRuns.length - 1].startedAtUtc,
  );
  const newest = new Date(successfulRuns[0].startedAtUtc);
  const calendarDaysSpanned = Math.max(
    1,
    (newest.getTime() - oldest.getTime()) / 86_400_000,
  );
  const backfillJobs = completedJobs.filter(
    (job) =>
      job.success &&
      !job.isSkipped &&
      job.schedulePath?.includes("backfill"),
  );
  const successfulBackfillsPerDay =
    calendarDaysSpanned > 0.1
      ? backfillJobs.length / calendarDaysSpanned
      : 12;
  const daysPerDay =
    totalDaysFetched > 0
      ? totalDaysFetched / calendarDaysSpanned
      : successfulBackfillsPerDay * 20;

  return {
    worstType,
    daysRemaining: maxRemaining,
    daysPerDay,
    estimatedDays: daysPerDay > 0 ? maxRemaining / daysPerDay : null,
  };
}
