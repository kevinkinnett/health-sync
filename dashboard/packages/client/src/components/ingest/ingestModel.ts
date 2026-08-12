import type {
  IngestOverview,
  IngestRun,
  IngestState,
  IngestStatus,
  WindmillCompletedJob,
  WindmillJob,
  WindmillSchedule,
  PipelineCategory,
} from "@health-dashboard/shared";
import { windmillJobPhase } from "../../lib/ingestJobs";

export interface NormalizedIngestOverview {
  status: IngestStatus | null;
  state: IngestState[];
  runs: IngestRun[];
  windmillConnected: boolean;
  activeJobs: WindmillJob[];
  completedJobs: WindmillCompletedJob[];
  schedules: WindmillSchedule[];
  runningJobCount: number;
  scheduledJobCount: number;
  queuedJobCount: number;
}

export function normalizeIngestOverview(
  data: IngestOverview | undefined,
): NormalizedIngestOverview {
  const activeJobs = Array.isArray(data?.activeJobs) ? data.activeJobs : [];
  const runningJobCount = activeJobs.filter(
    (job) => windmillJobPhase(job) === "running",
  ).length;
  const scheduledJobCount = activeJobs.filter(
    (job) => windmillJobPhase(job) === "scheduled",
  ).length;

  return {
    status: data?.status ?? null,
    state: Array.isArray(data?.state) ? data.state : [],
    runs: Array.isArray(data?.runs) ? data.runs : [],
    windmillConnected: data?.windmillConnected === true,
    activeJobs,
    completedJobs: Array.isArray(data?.completedJobs)
      ? data.completedJobs
      : [],
    schedules: Array.isArray(data?.schedules) ? data.schedules : [],
    runningJobCount,
    scheduledJobCount,
    queuedJobCount:
      activeJobs.length - runningJobCount - scheduledJobCount,
  };
}

export function cronToHuman(cron: string, timezone?: string): string {
  const zone = timezone ? ` · ${timezone}` : "";
  if (cron === "0 0 12 * * *") return `Daily at 12:00${zone || " UTC"}`;
  const everyHours = cron.match(/^0 (\d+) \*\/(\d+) \* \* \*$/);
  if (everyHours) {
    const offset = everyHours[1] === "0" ? "" : ` at :${everyHours[1].padStart(2, "0")}`;
    return `Every ${everyHours[2]} hours${offset}${zone}`;
  }
  return `${cron}${zone}`;
}

export function formatJobDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function scheduleLabel(
  path: string | null,
  pipelineLabel?: string,
  category: PipelineCategory = "source",
): {
  label: string;
  color: string;
} {
  if (pipelineLabel) {
    const color = category === "analysis"
      ? "bg-tertiary/10 text-tertiary"
      : category === "notification"
        ? "bg-primary/10 text-primary"
        : "bg-secondary/10 text-secondary";
    return { label: pipelineLabel, color };
  }
  if (!path) return { label: "Manual", color: "bg-primary/10 text-primary" };
  if (path.includes("backfill")) {
    return { label: "Backfill", color: "bg-tertiary/10 text-tertiary" };
  }
  if (path.includes("google_health")) {
    return { label: "Google Health", color: "bg-secondary/10 text-secondary" };
  }
  return {
    label: path.split("/").pop() ?? path,
    color: "bg-surface-container-highest text-on-surface-variant",
  };
}

export function findMatchingRun(
  jobStartedAt: string | null,
  runs: IngestRun[],
): IngestRun | undefined {
  if (!jobStartedAt) return undefined;
  const jobTimestamp = new Date(jobStartedAt).getTime();
  return runs.find((run) => {
    const runTimestamp = new Date(run.startedAtUtc).getTime();
    return Math.abs(jobTimestamp - runTimestamp) < 5_000;
  });
}
