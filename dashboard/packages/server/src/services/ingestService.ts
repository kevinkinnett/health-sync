import type {
  IngestState,
  IngestRun,
  TriggerResponse,
  WindmillJob,
  WindmillCompletedJob,
  WindmillSchedule,
  IngestOverview,
} from "@health-dashboard/shared";
import type { IngestRepository } from "../repositories/ingestRepo.js";
import { logger } from "../logger.js";

interface WindmillConfig {
  baseUrl: string;
  token: string;
  workspace: string;
}

const SCRIPT_PATH = "u/kevin/ingest_fitbit";
const SCHEDULE_PREFIX = "u/kevin/ingest_fitbit";

export class IngestService {
  constructor(
    private ingestRepo: IngestRepository,
    private windmill: WindmillConfig,
  ) {}

  private wmUrl(path: string): string {
    return `${this.windmill.baseUrl}/api/w/${this.windmill.workspace}${path}`;
  }

  private wmHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.windmill.token}`,
      "Content-Type": "application/json",
    };
  }

  private async wmFetch(label: string, url: string, init?: RequestInit): Promise<Response> {
    const start = Date.now();
    const resp = await fetch(url, { ...init, headers: this.wmHeaders() });
    const duration = Date.now() - start;

    if (!resp.ok) {
      logger.warn({ url, status: resp.status, duration }, `Windmill API error: ${label}`);
    } else {
      logger.debug({ url, status: resp.status, duration }, `Windmill API: ${label}`);
    }

    return resp;
  }

  async getState(): Promise<IngestState[]> {
    return this.ingestRepo.getState();
  }

  async getRuns(limit: number): Promise<IngestRun[]> {
    return this.ingestRepo.getRuns(limit);
  }

  async getOverview(runLimit: number): Promise<IngestOverview> {
    const [state, runs, activeJobs, completedJobs, schedules] =
      await Promise.all([
        this.getState(),
        this.getRuns(runLimit),
        this.getActiveJobs(),
        this.getCompletedJobs(runLimit),
        this.getSchedules(),
      ]);
    return { state, runs, activeJobs, completedJobs, schedules };
  }

  async getActiveJobs(): Promise<WindmillJob[]> {
    try {
      const url = this.wmUrl(
        `/jobs/list?script_path_exact=${SCRIPT_PATH}&running=true&per_page=10`,
      );
      const resp = await this.wmFetch("list active jobs", url);
      if (!resp.ok) return [];
      const running = (await resp.json()) as Record<string, unknown>[];

      const queuedUrl = this.wmUrl(
        `/jobs/list?script_path_exact=${SCRIPT_PATH}&per_page=10`,
      );
      const queuedResp = await this.wmFetch("list queued jobs", queuedUrl);
      const allJobs = queuedResp.ok
        ? ((await queuedResp.json()) as Record<string, unknown>[])
        : [];

      const pending = allJobs.filter((j) => j.type === "QueuedJob");

      const seen = new Set<string>();
      const merged: WindmillJob[] = [];
      for (const j of [...running, ...pending]) {
        const id = String(j.id);
        if (seen.has(id)) continue;
        seen.add(id);
        merged.push({
          id,
          scriptPath: String(j.script_path ?? ""),
          createdAt: String(j.created_at ?? ""),
          startedAt: j.started_at ? String(j.started_at) : null,
          scheduledFor: j.scheduled_for ? String(j.scheduled_for) : null,
          running: Boolean(j.running),
          schedulePath: j.schedule_path ? String(j.schedule_path) : null,
        });
      }
      return merged;
    } catch (err) {
      logger.error({ err }, "Failed to fetch Windmill active jobs");
      return [];
    }
  }

  async getCompletedJobs(limit: number): Promise<WindmillCompletedJob[]> {
    try {
      const url = this.wmUrl(
        `/jobs/completed/list?script_path_exact=${SCRIPT_PATH}&per_page=${limit}&order_desc=true`,
      );
      const resp = await this.wmFetch("list completed jobs", url);
      if (!resp.ok) return [];
      const data = (await resp.json()) as Record<string, unknown>[];

      return data.map((j) => ({
        id: String(j.id),
        scriptPath: String(j.script_path ?? ""),
        schedulePath: j.schedule_path ? String(j.schedule_path) : null,
        createdAt: String(j.created_at ?? ""),
        startedAt: j.started_at ? String(j.started_at) : null,
        durationMs: j.duration_ms != null ? Number(j.duration_ms) : null,
        success: Boolean(j.success),
        isSkipped: Boolean(j.is_skipped),
      }));
    } catch (err) {
      logger.error({ err }, "Failed to fetch Windmill completed jobs");
      return [];
    }
  }

  async getSchedules(): Promise<WindmillSchedule[]> {
    try {
      const url = this.wmUrl(
        `/schedules/list?path_start=${SCHEDULE_PREFIX}`,
      );
      const resp = await this.wmFetch("list schedules", url);
      if (!resp.ok) return [];
      const data = (await resp.json()) as Record<string, unknown>[];
      return data.map((s) => ({
        path: String(s.path ?? ""),
        schedule: String(s.schedule ?? ""),
        enabled: Boolean(s.enabled),
        scriptPath: String(s.script_path ?? ""),
        nextExecution: s.next_execution ? String(s.next_execution) : null,
        summary: s.summary ? String(s.summary) : null,
        description: s.description ? String(s.description) : null,
      }));
    } catch (err) {
      logger.error({ err }, "Failed to fetch Windmill schedules");
      return [];
    }
  }

  async triggerRun(): Promise<TriggerResponse> {
    const isRunning = await this.ingestRepo.hasRunningJob();
    if (isRunning) {
      return { jobId: "", message: "An ingest job is already running." };
    }

    const url = this.wmUrl(`/jobs/run/p/${SCRIPT_PATH}`);

    const response = await this.wmFetch("trigger ingest", url, {
      method: "POST",
      body: JSON.stringify({
        db_resource_path: "u/kevin/universe_db",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Windmill API error ${response.status}: ${text}`);
    }

    const jobId = await response.text();
    return {
      jobId: jobId.replace(/"/g, ""),
      message: "Ingest job triggered successfully.",
    };
  }
}
