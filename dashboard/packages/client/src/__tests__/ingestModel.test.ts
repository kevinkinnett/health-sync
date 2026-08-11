import { describe, expect, it } from "vitest";
import type { IngestOverview, WindmillJob } from "@health-dashboard/shared";
import {
  cronToHuman,
  findMatchingRun,
  formatJobDuration,
  normalizeIngestOverview,
  scheduleLabel,
} from "../components/ingest/ingestModel";

describe("ingest page model", () => {
  it("normalizes a missing or partial overview without crashing the page", () => {
    expect(normalizeIngestOverview(undefined)).toMatchObject({
      state: [],
      runs: [],
      activeJobs: [],
      completedJobs: [],
      schedules: [],
      windmillConnected: false,
    });
  });

  it("counts running, scheduled, and queued jobs independently", () => {
    const base: WindmillJob = {
      id: "job",
      scriptPath: "f/ingest",
      createdAt: "2026-08-11T16:00:00Z",
      startedAt: null,
      scheduledFor: null,
      running: false,
      schedulePath: null,
    };
    const data = {
      activeJobs: [
        { ...base, id: "running", running: true },
        {
          ...base,
          id: "scheduled",
          scheduledFor: "2099-08-11T18:00:00Z",
        },
        { ...base, id: "queued" },
      ],
    } as IngestOverview;

    expect(normalizeIngestOverview(data)).toMatchObject({
      runningJobCount: 1,
      scheduledJobCount: 1,
      queuedJobCount: 1,
    });
  });

  it("formats known schedules and precise job durations", () => {
    expect(cronToHuman("0 0 */4 * * *")).toBe("Every 4 hours");
    expect(cronToHuman("0 0 12 * * *")).toBe("Daily at 12:00 UTC");
    expect(formatJobDuration(125_000)).toBe("2m 5s");
    expect(formatJobDuration(119_999)).toBe("2m 0s");
    expect(scheduleLabel("u/kevin/google_health_backfill").label).toBe(
      "Backfill",
    );
  });

  it("matches Windmill jobs to database runs within the ingest tolerance", () => {
    const runs = [
      {
        ingestRunId: 8,
        startedAtUtc: "2026-08-11T16:00:03Z",
        finishedAtUtc: null,
        status: "completed",
        rowsWritten: 12,
        errorCount: 0,
        details: null,
      },
    ];
    expect(findMatchingRun("2026-08-11T16:00:00Z", runs)?.ingestRunId).toBe(8);
    expect(findMatchingRun("2026-08-11T17:00:00Z", runs)).toBeUndefined();
  });
});
