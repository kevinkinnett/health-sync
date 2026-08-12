import { describe, expect, it } from "vitest";
import type { WindmillJob } from "@health-dashboard/shared";
import { windmillJobPhase } from "../lib/ingestJobs";

function job(overrides: Partial<WindmillJob> = {}): WindmillJob {
  return {
    pipelineKey: "google-health",
    pipelineLabel: "Google Health Sync",
    pipelineCategory: "source",
    id: "job-1",
    scriptPath: "u/kevin/ingest_google_health",
    createdAt: "2026-08-09T21:11:10Z",
    startedAt: null,
    scheduledFor: null,
    running: false,
    schedulePath: "u/kevin/ingest_google_health",
    ...overrides,
  };
}

describe("Windmill job presentation", () => {
  const now = new Date("2026-08-09T22:00:00Z").getTime();

  it("labels a future execution as scheduled rather than queued", () => {
    expect(
      windmillJobPhase(job({ scheduledFor: "2026-08-10T00:30:00Z" }), now),
    ).toBe("scheduled");
  });

  it("keeps an immediately waiting job queued", () => {
    expect(
      windmillJobPhase(job({ scheduledFor: "2026-08-09T21:30:00Z" }), now),
    ).toBe("queued");
  });

  it("prioritizes the running state", () => {
    expect(
      windmillJobPhase(
        job({ running: true, scheduledFor: "2026-08-10T00:30:00Z" }),
        now,
      ),
    ).toBe("running");
  });
});
