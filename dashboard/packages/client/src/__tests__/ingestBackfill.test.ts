import { describe, expect, it } from "vitest";
import type { IngestState } from "@health-dashboard/shared";
import {
  computeBackfillEstimate,
  isBackfillTargetMet,
  isTrackedBackfillState,
} from "../lib/ingestBackfill";

function state(
  dataType: string,
  earliestFetchedDate: string | null,
  latestFetchedDate: string | null,
  backfillComplete = false,
): IngestState {
  return {
    dataType,
    earliestFetchedDate,
    latestFetchedDate,
    backfillComplete,
    lastSuccessAtUtc: null,
    lastRunId: null,
    updatedAtUtc: "2026-08-09T00:00:00Z",
  };
}

describe("ingest backfill status", () => {
  it("ignores internal migration sentinels", () => {
    const sentinel = state("__sleep_tz_backfill__", null, null);

    expect(isTrackedBackfillState(sentinel)).toBe(false);
    expect(computeBackfillEstimate([sentinel], [], [])).toBeNull();
  });

  it("treats a measured 365-day history as complete even before its flag updates", () => {
    const exercise = state("exercise_log", "2025-04-10", "2026-06-04");

    expect(isBackfillTargetMet(exercise)).toBe(true);
    expect(computeBackfillEstimate([exercise], [], [])).toBeNull();
  });

  it("reports the tracked type with the most history still missing", () => {
    const result = computeBackfillEstimate(
      [
        state("activity", "2026-01-01", "2026-07-20"),
        state("sleep", "2026-05-01", "2026-07-20"),
        state("__maintenance__", null, null),
      ],
      [],
      [],
    );

    expect(result).toMatchObject({
      worstType: "sleep",
      daysRemaining: 285,
      daysPerDay: 0,
      estimatedDays: null,
    });
  });
});
