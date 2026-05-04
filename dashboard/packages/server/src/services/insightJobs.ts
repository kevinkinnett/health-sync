import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";
import type { AgenticProgressEvent } from "./agenticLoop.js";
import type {
  GenerateInsightsResult,
  InsightService,
} from "./insightService.js";
import { listCategoryDefs } from "./insightService.js";

/**
 * In-memory job manager for Insights generation.
 *
 * The Reports surface kicks off an async generation that takes 30-90s
 * (six categories in parallel, each running a 5-10 round agentic
 * loop). The HTTP request that POSTs /generate returns immediately
 * with a `jobId`; the client polls `/generate/status/:jobId` every 2s
 * until completion.
 *
 * In-memory is the right tradeoff for a personal dashboard:
 *
 * - A server restart loses any in-flight job. The client's localStorage
 *   stores `{ jobId, startedAt }`; on next mount it polls, gets a 404,
 *   and falls back to "no in-flight job" — no zombie state.
 * - We never need cross-process coordination — there's exactly one
 *   server process behind nginx.
 * - Jobs auto-evict after 1h to keep the Map from growing forever.
 */

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface JobState {
  jobId: string;
  status: JobStatus;
  /** ISO timestamp when the job was created. */
  startedAt: string;
  /** ISO timestamp when the job reached a terminal status. */
  finishedAt?: string;
  dateFrom?: string;
  dateTo?: string;
  /** 0–100 progress estimate driven by per-category round events. */
  progress: number;
  /** Human-readable status line shown in the UI's progress card. */
  statusMessage: string;
  /** Per-category state — populated incrementally. */
  categories: Array<{
    key: string;
    title: string;
    status: JobStatus;
    rounds: number;
    toolsCalled: string[];
  }>;
  result?: GenerateInsightsResult;
  error?: string;
}

const MAX_AGE_MS = 60 * 60 * 1000;

export class InsightJobManager {
  private jobs = new Map<string, JobState>();

  constructor(private service: InsightService) {}

  start(opts: { dateFrom?: string; dateTo?: string }): string {
    this.evictOld();
    const jobId = randomUUID();
    const cats = listCategoryDefs();
    const state: JobState = {
      jobId,
      status: "pending",
      startedAt: new Date().toISOString(),
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      progress: 0,
      statusMessage: "Queued",
      categories: cats.map((c) => ({
        key: c.key,
        title: c.title,
        status: "pending",
        rounds: 0,
        toolsCalled: [],
      })),
    };
    this.jobs.set(jobId, state);

    // Fire-and-forget. The promise lifecycle is owned by the manager —
    // surfacing it to the controller would just lead to ignored
    // unhandled-rejection warnings.
    void this.run(jobId, opts);
    return jobId;
  }

  get(jobId: string): JobState | undefined {
    return this.jobs.get(jobId);
  }

  private async run(
    jobId: string,
    opts: { dateFrom?: string; dateTo?: string },
  ): Promise<void> {
    const state = this.jobs.get(jobId);
    if (!state) return;
    state.status = "running";
    state.statusMessage = "Generating analyses in parallel…";

    try {
      const result = await this.service.generate({
        dateFrom: opts.dateFrom,
        dateTo: opts.dateTo,
        onCategoryProgress: (key, event) => {
          this.applyProgress(state, key, event);
        },
      });
      state.status = "completed";
      state.finishedAt = new Date().toISOString();
      state.progress = 100;
      state.statusMessage = "Done";
      state.result = result;
      // Mirror per-category final status from the result.
      for (const c of state.categories) {
        const cat = result.categories.find((x) => x.key === c.key);
        if (!cat) continue;
        c.status = cat.placeholder ? "failed" : "completed";
        c.rounds = cat.rounds;
        c.toolsCalled = cat.toolsCalled;
      }
    } catch (err) {
      logger.error({ err, jobId }, "Insight generation job failed");
      state.status = "failed";
      state.finishedAt = new Date().toISOString();
      state.error = (err as Error).message;
      state.statusMessage = `Failed: ${(err as Error).message}`;
    }
  }

  private applyProgress(
    state: JobState,
    categoryKey: string,
    event: AgenticProgressEvent,
  ): void {
    const cat = state.categories.find((c) => c.key === categoryKey);
    if (!cat) return;
    if (cat.status === "pending") cat.status = "running";

    if (event.kind === "tool-calls") {
      cat.rounds += 1;
      const fresh = event.tools.filter((t) => !cat.toolsCalled.includes(t));
      cat.toolsCalled = [...cat.toolsCalled, ...fresh];
    } else if (event.kind === "complete") {
      cat.status = "completed";
    } else if (event.kind === "stuck") {
      cat.status = "failed";
    }

    // Aggregate progress: each category is worth 100/N points; within a
    // category, each completed round is worth 10 (out of 100).
    const total = state.categories.length;
    const sum = state.categories.reduce((acc, c) => {
      if (c.status === "completed" || c.status === "failed") return acc + 100;
      return acc + Math.min(100, c.rounds * 20);
    }, 0);
    state.progress = Math.min(99, Math.round(sum / total));

    const inFlight = state.categories
      .filter((c) => c.status === "running")
      .map((c) => `${c.title} (${c.toolsCalled.join(", ") || "starting…"})`);
    const done = state.categories.filter((c) => c.status === "completed").length;
    state.statusMessage =
      `Analyzing in parallel (${done}/${total} done)` +
      (inFlight.length > 0 ? `: ${inFlight.join(" · ")}` : "");
  }

  private evictOld(): void {
    const now = Date.now();
    for (const [id, state] of this.jobs) {
      const started = Date.parse(state.startedAt);
      if (Number.isFinite(started) && now - started > MAX_AGE_MS) {
        this.jobs.delete(id);
      }
    }
  }
}
