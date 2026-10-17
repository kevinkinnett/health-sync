import { describe, it, expect, vi } from "vitest";
import { InsightJobConflictError, InsightJobManager } from "../services/insightJobs.js";
import type { InsightService } from "../services/insightService.js";

/**
 * Generation runs categories serially because concurrent `claude -p`
 * subprocesses through the proxy fail. That only holds if two jobs never
 * overlap, so the manager is single-flight.
 */
function deferredService() {
  const releases: Array<() => void> = [];
  const generate = vi.fn(
    () =>
      new Promise((resolve) => {
        releases.push(() =>
          resolve({ generationId: "g", dateFrom: "a", dateTo: "b", categories: [] }),
        );
      }),
  );
  return { service: { generate } as unknown as InsightService, generate, releases };
}

describe("InsightJobManager single-flight", () => {
  it("returns the in-flight job instead of starting a second one", async () => {
    const { service, generate, releases } = deferredService();
    const jobs = new InsightJobManager(service);

    const first = jobs.start({});
    const second = jobs.start({});
    expect(second).toBe(first);
    expect(generate).toHaveBeenCalledTimes(1);

    releases[0]();
    await vi.waitFor(() => expect(jobs.get(first)?.status).toBe("completed"));

    const third = jobs.start({});
    expect(third).not.toBe(first);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("refuses a different window while a job is in flight", () => {
    const { service, generate } = deferredService();
    const jobs = new InsightJobManager(service);
    const first = jobs.start({ dateFrom: "2026-01-01", dateTo: "2026-03-31" });

    expect(() => jobs.start({ dateFrom: "2026-04-01", dateTo: "2026-06-30" }))
      .toThrow(InsightJobConflictError);
    expect(jobs.start({ dateFrom: "2026-01-01", dateTo: "2026-03-31" })).toBe(first);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("allows a new job after a failure", async () => {
    const generate = vi.fn().mockRejectedValueOnce(new Error("boom")).mockReturnValue(new Promise(() => {}));
    const jobs = new InsightJobManager({ generate } as unknown as InsightService);
    const first = jobs.start({});
    await vi.waitFor(() => expect(jobs.get(first)?.status).toBe("failed"));
    expect(jobs.start({})).not.toBe(first);
  });
});
