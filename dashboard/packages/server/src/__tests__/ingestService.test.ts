import { describe, expect, it } from "vitest";
import {
  evaluateGoogleHealthFreshness,
  GOOGLE_HEALTH_EXPECTED_INTERVAL_MINUTES,
  GOOGLE_HEALTH_STALE_AFTER_MINUTES,
} from "../services/ingestService.js";
import type { IngestState } from "@health-dashboard/shared";

function state(lastSuccessAtUtc: string | null): IngestState[] {
  return [{
    dataType: "activity",
    latestFetchedDate: "2026-08-09",
    earliestFetchedDate: "2025-08-09",
    historyTargetMet: true,
    lastSuccessAtUtc,
    lastRunId: lastSuccessAtUtc ? 5001 : null,
    updatedAtUtc: lastSuccessAtUtc,
  }];
}

describe("Google Health ingest freshness", () => {
  const now = new Date("2026-08-09T22:30:00.000Z").getTime();

  it("allows one hour of grace beyond the four-hour schedule", () => {
    expect(GOOGLE_HEALTH_EXPECTED_INTERVAL_MINUTES).toBe(240);
    expect(GOOGLE_HEALTH_STALE_AFTER_MINUTES).toBe(300);
    expect(
      evaluateGoogleHealthFreshness(
        state("2026-08-09T17:30:00.000Z"),
        now,
      ).status,
    ).toBe("healthy");
  });

  it("marks the provider stale after the grace window is missed", () => {
    expect(
      evaluateGoogleHealthFreshness(
        state("2026-08-09T17:29:59.999Z"),
        now,
      ),
    ).toMatchObject({
      status: "stale",
      lastSuccessAtUtc: "2026-08-09T17:29:59.999Z",
    });
  });

  it("reports unknown until a successful Google Health run exists", () => {
    expect(evaluateGoogleHealthFreshness(state(null), now)).toMatchObject({
      status: "unknown",
      lastSuccessAtUtc: null,
    });
  });
});
