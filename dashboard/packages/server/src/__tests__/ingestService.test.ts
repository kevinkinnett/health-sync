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

describe("Windmill calls are bounded", () => {
  /** A Windmill that accepts the connection and never answers. */
  function hangingFetch() {
    return vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }));
  }

  it("degrades the overview instead of hanging when Windmill stalls", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const repo = {
      getState: vi.fn().mockResolvedValue([]),
      getRuns: vi.fn().mockResolvedValue([]),
    } as unknown as IngestRepository;
    const service = new IngestService(
      repo,
      { baseUrl: "https://windmill.example", token: "t", workspace: "w" },
      { windmillTimeoutMs: 20 },
    );

    const overview = await service.getOverview(10);
    expect(overview.windmillConnected).toBe(false);
    expect(overview.activeJobs).toEqual([]);
    expect(overview.schedules).toEqual([]);
  });

  it("uses a short default timeout", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);
    const service = new IngestService(
      {} as IngestRepository,
      { baseUrl: "https://windmill.example", token: "t", workspace: "w" },
    );
    void service.getSchedules();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("ingest trigger guard", () => {
  const windmill = { baseUrl: "https://windmill.example", token: "t", workspace: "w" };

  function windmillWith(queued: unknown[]) {
    const posts: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(url);
        await new Promise((r) => setTimeout(r, 10));
        return new Response('"job-1"');
      }
      if (url.includes("/jobs/list") && url.includes("google_health")) {
        return new Response(JSON.stringify(queued));
      }
      return new Response("[]");
    });
    vi.stubGlobal("fetch", fetchMock);
    return posts;
  }

  const repo = { hasRunningJob: vi.fn().mockResolvedValue(false) } as unknown as IngestRepository;

  it("enqueues only one job for two near-simultaneous triggers", async () => {
    const posts = windmillWith([]);
    const service = new IngestService(repo, windmill);
    const [a, b] = await Promise.all([service.triggerRun(), service.triggerRun()]);
    expect(posts).toHaveLength(1);
    expect([a.jobId, b.jobId].sort()).toEqual(["", "job-1"]);
  });

  it("refuses while Windmill already has a queued run that has not written its row yet", async () => {
    const posts = windmillWith([{ id: "q1", type: "QueuedJob", running: false, created_at: "2026-10-16T00:00:00Z" }]);
    const service = new IngestService(repo, windmill);
    const res = await service.triggerRun();
    expect(posts).toHaveLength(0);
    expect(res.jobId).toBe("");
    expect(res.message).toMatch(/already/i);
  });
});
