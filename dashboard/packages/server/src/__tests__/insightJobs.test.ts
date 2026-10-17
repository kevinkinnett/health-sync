import { describe, it, expect, vi, afterEach } from "vitest";
import { InsightJobConflictError, InsightJobManager } from "../services/insightJobs.js";
import {
  listCategoryDefs,
  type GenerateInsightsOptions,
  type GenerateInsightsResult,
  type InsightService,
} from "../services/insightService.js";

/**
 * The real job manager, driven by a fake InsightService whose `generate`
 * the test resolves or rejects by hand.
 *
 * insightController.test.ts swaps the manager out for a Map-backed fake, so
 * none of this logic — the status the Reports tab polls for — was exercised
 * anywhere: a job stuck in "running" after generate() rejects, or a
 * placeholder category reported as completed, would have shipped silently.
 */

const CATEGORIES = listCategoryDefs();

function controllableService() {
  let opts: GenerateInsightsOptions | undefined;
  let resolve!: (r: GenerateInsightsResult) => void;
  let reject!: (e: Error) => void;
  const generate = vi.fn((o: GenerateInsightsOptions) => {
    opts = o;
    return new Promise<GenerateInsightsResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  });
  return {
    service: { generate } as unknown as InsightService,
    generate,
    progress: (key: string, event: Parameters<NonNullable<GenerateInsightsOptions["onCategoryProgress"]>>[1]) =>
      opts!.onCategoryProgress!(key, event),
    resolve: (r: GenerateInsightsResult) => resolve(r),
    reject: (e: Error) => reject(e),
  };
}

function result(placeholderKeys: string[] = []): GenerateInsightsResult {
  return {
    generationId: "gen-1",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-26",
    categories: CATEGORIES.map((c, i) => ({
      key: c.key,
      title: c.title,
      content: placeholderKeys.includes(c.key) ? "" : `Analysis of ${c.title}`,
      toolsCalled: ["get_sleep"],
      rounds: i + 1,
      placeholder: placeholderKeys.includes(c.key),
    })),
  };
}

/** Let the manager's fire-and-forget run() advance past an await. */
const flush = () => new Promise<void>((r) => setImmediate(r));

afterEach(() => {
  vi.useRealTimers();
});

describe("InsightJobManager", () => {
  it("hands back a job immediately and runs it in the background", async () => {
    const fake = controllableService();
    const jobs = new InsightJobManager(fake.service);

    const jobId = jobs.start({ dateFrom: "2026-07-01", dateTo: "2026-07-26" });

    const job = jobs.get(jobId)!;
    expect(job.status).toBe("running");
    expect(job.progress).toBe(0);
    expect(job.categories.map((c) => c.key)).toEqual(CATEGORIES.map((c) => c.key));
    expect(job.categories.every((c) => c.status === "pending")).toBe(true);
    expect(fake.generate).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: "2026-07-01", dateTo: "2026-07-26" }),
    );
  });

  it("completes with the result and per-category rounds and tools", async () => {
    const fake = controllableService();
    const jobs = new InsightJobManager(fake.service);
    const jobId = jobs.start({});

    fake.resolve(result());
    await flush();

    const job = jobs.get(jobId)!;
    expect(job.status).toBe("completed");
    expect(job.progress).toBe(100);
    expect(job.finishedAt).toBeDefined();
    expect(job.result?.generationId).toBe("gen-1");
    expect(job.categories.every((c) => c.status === "completed")).toBe(true);
    expect(job.categories[1]).toMatchObject({ rounds: 2, toolsCalled: ["get_sleep"] });
  });

  it("reports a placeholder category as FAILED, not completed", async () => {
    // A placeholder is what the service substitutes when a category's
    // analysis fell over. Showing it as "completed" would tell the user a
    // report section exists when it is empty.
    const fake = controllableService();
    const jobs = new InsightJobManager(fake.service);
    const jobId = jobs.start({});
    const broken = CATEGORIES[0].key;

    fake.resolve(result([broken]));
    await flush();

    const job = jobs.get(jobId)!;
    expect(job.status).toBe("completed");
    expect(job.categories.find((c) => c.key === broken)?.status).toBe("failed");
    expect(
      job.categories.filter((c) => c.key !== broken).every((c) => c.status === "completed"),
    ).toBe(true);
  });

  it("marks the job failed with the error when generation rejects", async () => {
    // Without the catch the job would sit in "running" forever and the
    // Reports tab would poll a spinner indefinitely.
    const fake = controllableService();
    const jobs = new InsightJobManager(fake.service);
    const jobId = jobs.start({});

    fake.reject(new Error("proxy unreachable"));
    await flush();

    const job = jobs.get(jobId)!;
    expect(job.status).toBe("failed");
    expect(job.error).toBe("proxy unreachable");
    expect(job.statusMessage).toBe("Failed: proxy unreachable");
    expect(job.finishedAt).toBeDefined();
  });

  it("aggregates progress across categories and never reports 100 before it is done", async () => {
    const fake = controllableService();
    const jobs = new InsightJobManager(fake.service);
    const jobId = jobs.start({});
    const [first, second] = CATEGORIES;

    fake.progress(first.key, { kind: "tool-calls", round: 1, tools: ["get_sleep", "get_hrv"] });
    fake.progress(first.key, { kind: "tool-calls", round: 2, tools: ["get_sleep"] });
    let job = jobs.get(jobId)!;
    const cat = job.categories.find((c) => c.key === first.key)!;
    expect(cat.status).toBe("running");
    expect(cat.rounds).toBe(2);
    // Deduplicated, in first-seen order.
    expect(cat.toolsCalled).toEqual(["get_sleep", "get_hrv"]);
    // Two rounds = 40 of this category's 100 points, spread over all of them.
    expect(job.progress).toBe(Math.round(40 / CATEGORIES.length));

    fake.progress(second.key, { kind: "stuck", round: 3 });
    job = jobs.get(jobId)!;
    expect(job.categories.find((c) => c.key === second.key)?.status).toBe("failed");

    // Every category finished, but generate() has not returned: capped.
    for (const c of CATEGORIES) fake.progress(c.key, { kind: "complete", rounds: 1, sanitized: false });
    job = jobs.get(jobId)!;
    expect(job.progress).toBe(99);
    expect(job.status).toBe("running");
    expect(job.statusMessage).toMatch(new RegExp(`\\(${CATEGORIES.length}/${CATEGORIES.length} done\\)`));
  });

  it("ignores progress for a category it does not know", async () => {
    const fake = controllableService();
    const jobs = new InsightJobManager(fake.service);
    const jobId = jobs.start({});

    fake.progress("not-a-category", { kind: "tool-calls", round: 1, tools: ["x"] });

    expect(jobs.get(jobId)!.progress).toBe(0);
  });

  it("evicts jobs older than an hour when the next one starts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));
    const fake = controllableService();
    const jobs = new InsightJobManager(fake.service);
    const old = jobs.start({});
    fake.resolve(result());
    await flush();

    vi.setSystemTime(new Date("2026-07-26T12:59:00Z"));
    const recent = jobs.start({});
    fake.resolve(result());
    await flush();
    expect(jobs.get(old), "evicted before its hour was up").toBeDefined();

    vi.setSystemTime(new Date("2026-07-26T13:01:00Z"));
    jobs.start({});

    expect(jobs.get(old)).toBeUndefined();
    expect(jobs.get(recent)).toBeDefined();
  });

  it("returns undefined for an unknown job id", () => {
    const jobs = new InsightJobManager(controllableService().service);
    expect(jobs.get("nope")).toBeUndefined();
  });
});

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
