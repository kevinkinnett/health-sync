import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateGoogleHealthFreshness,
  GOOGLE_HEALTH_EXPECTED_INTERVAL_MINUTES,
  GOOGLE_HEALTH_STALE_AFTER_MINUTES,
  IngestService,
  MANAGED_PIPELINES,
} from "../services/ingestService.js";
import type { IngestState } from "@health-dashboard/shared";
import type { IngestRepository } from "../repositories/ingestRepo.js";

afterEach(() => vi.unstubAllGlobals());

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

describe("managed health pipelines", () => {
  it("discovers each registered schedule and carries its operational identity", async () => {
    const fetchMock = vi.fn((url: string) => {
      const pipeline = MANAGED_PIPELINES.find((candidate) =>
        url.includes(candidate.schedulePrefix),
      );
      return Promise.resolve(new Response(JSON.stringify(pipeline ? [{
        path: `${pipeline.schedulePrefix}_schedule`,
        schedule: "0 0 12 * * *",
        timezone: "America/New_York",
        enabled: true,
        script_path: pipeline.scriptPath,
        summary: pipeline.label,
      }] : []), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new IngestService(
      {} as IngestRepository,
      { baseUrl: "https://windmill.example", token: "token", workspace: "claw" },
    );

    const schedules = await service.getSchedules();

    expect(fetchMock).toHaveBeenCalledTimes(MANAGED_PIPELINES.length);
    expect(schedules).toHaveLength(MANAGED_PIPELINES.length);
    expect(schedules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pipelineKey: "google-health",
        pipelineCategory: "source",
        triggerable: true,
      }),
      expect.objectContaining({
        pipelineKey: "weekly-health-report",
        pipelineCategory: "analysis",
        triggerable: false,
      }),
      expect.objectContaining({
        pipelineKey: "health-alerts",
        pipelineCategory: "notification",
        triggerable: false,
      }),
    ]));
  });
});
