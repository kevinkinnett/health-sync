import { describe, expect, it } from "vitest";
import type { IngestState } from "@health-dashboard/shared";
import {
  applyIngestPolicies,
  evaluateMetricCoverage,
  evaluateMetricFreshness,
} from "../services/ingestPolicies.js";

function state(
  dataType: string,
  earliestFetchedDate: string | null,
  latestFetchedDate: string | null,
): IngestState {
  return {
    dataType,
    earliestFetchedDate,
    latestFetchedDate,
    historyTargetMet: false,
    lastSuccessAtUtc: "2026-08-11T12:30:00Z",
    lastRunId: 15182,
    updatedAtUtc: "2026-08-11T12:30:00Z",
  };
}

describe("provider-aware ingest policies", () => {
  const now = new Date("2026-08-11T15:00:00Z").getTime();

  it("treats the available Google Health SpO2 window as provider-limited", () => {
    expect(
      evaluateMetricCoverage(state("spo2", "2026-03-02", "2026-08-11")),
    ).toMatchObject({
      status: "provider_limited",
      daysCovered: 162,
      targetDays: 90,
    });
  });

  it("still reports a genuinely short provider window as incomplete", () => {
    expect(
      evaluateMetricCoverage(state("spo2", "2026-07-20", "2026-08-11")),
    ).toMatchObject({ status: "incomplete", daysCovered: 22 });
  });

  it("does not call sparse weight or exercise data stale", () => {
    expect(
      evaluateMetricFreshness(state("body_weight", "2025-01-01", "2026-06-14"), now),
    ).toMatchObject({ status: "sparse", cadence: "sparse", ageDays: 58 });
  });

  it("flags a daily metric independently when its newest point is old", () => {
    expect(
      evaluateMetricFreshness(state("heart_rate", "2025-01-01", "2026-08-07"), now),
    ).toMatchObject({ status: "stale", cadence: "daily", ageDays: 4, staleAfterDays: 2 });
  });

  it("enriches every repository observation at the service boundary", () => {
    const [result] = applyIngestPolicies(
      [state("activity", "2025-08-01", "2026-08-11")],
      now,
    );
    expect(result.coverage).toMatchObject({ status: "target_met" });
    expect(result.metricFreshness).toMatchObject({ status: "fresh" });
  });
});
