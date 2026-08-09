import { describe, expect, it } from "vitest";
import type { IngestState } from "@health-dashboard/shared";
import {
  findLargestCoverageGap,
  isHistoryTargetMet,
  isTrackedCoverageState,
} from "../lib/ingestCoverage";

function state(
  dataType: string,
  earliestFetchedDate: string | null,
  latestFetchedDate: string | null,
  historyTargetMet = false,
): IngestState {
  return {
    dataType,
    earliestFetchedDate,
    latestFetchedDate,
    historyTargetMet,
    lastSuccessAtUtc: null,
    lastRunId: null,
    updatedAtUtc: "2026-08-09T00:00:00Z",
  };
}

describe("Google Health historical coverage", () => {
  it("ignores internal state sentinels if an older API still returns one", () => {
    const sentinel = state("__maintenance__", null, null);

    expect(isTrackedCoverageState(sentinel)).toBe(false);
    expect(findLargestCoverageGap([sentinel])).toBeNull();
  });

  it("treats a measured 365-day range as meeting the target", () => {
    const exercise = state("exercise_log", "2025-04-10", "2026-06-04");

    expect(isHistoryTargetMet(exercise)).toBe(true);
    expect(findLargestCoverageGap([exercise])).toBeNull();
  });

  it("reports the metric with the largest real coverage gap", () => {
    const result = findLargestCoverageGap([
      state("activity", "2026-01-01", "2026-07-20"),
      state("spo2", "2026-05-01", "2026-07-20"),
    ]);

    expect(result).toEqual({
      dataType: "spo2",
      daysCovered: 80,
      daysRemaining: 285,
    });
  });
});
