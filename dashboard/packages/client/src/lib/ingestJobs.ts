import type { WindmillJob } from "@health-dashboard/shared";

export type WindmillJobPhase = "running" | "scheduled" | "queued";

/** Distinguish a future scheduled execution from a job waiting to start now. */
export function windmillJobPhase(
  job: WindmillJob,
  nowMs = Date.now(),
): WindmillJobPhase {
  if (job.running) return "running";
  if (job.scheduledFor) {
    const scheduledMs = new Date(job.scheduledFor).getTime();
    if (Number.isFinite(scheduledMs) && scheduledMs > nowMs) return "scheduled";
  }
  return "queued";
}
