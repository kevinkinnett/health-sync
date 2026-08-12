import type { PipelineCategory, PipelineIdentity } from "@health-dashboard/shared";

export interface ManagedPipeline {
  key: string;
  label: string;
  category: PipelineCategory;
  scriptPath: string;
  schedulePrefix: string;
  triggerable: boolean;
}

/**
 * Explicit allowlist of health workflows owned by Vitalis. It keeps Windmill
 * workspace discovery out of the UI and prevents unrelated jobs from leaking
 * into the health-data operations view.
 */
export const MANAGED_PIPELINES: readonly ManagedPipeline[] = [
  {
    key: "google-health",
    label: "Google Health Sync",
    category: "source",
    scriptPath: "u/kevin/ingest_google_health",
    schedulePrefix: "u/kevin/ingest_google_health",
    triggerable: true,
  },
  {
    key: "eight-sleep",
    label: "Eight Sleep Sync",
    category: "source",
    scriptPath: "u/kevin/ingest_eight_sleep",
    schedulePrefix: "u/kevin/ingest_eight_sleep",
    triggerable: false,
  },
  {
    key: "tesla-driving",
    label: "Tesla Driving Sync",
    category: "source",
    scriptPath: "u/kevin/ingest_tesla_drives",
    schedulePrefix: "u/kevin/ingest_tesla_drives",
    triggerable: false,
  },
  {
    key: "weekly-health-report",
    label: "Weekly AI Health Report",
    category: "analysis",
    scriptPath: "u/kevin/weekly_health_report",
    schedulePrefix: "u/kevin/weekly_health_report",
    triggerable: false,
  },
  {
    key: "health-alerts",
    label: "Health Alert Evaluation",
    category: "notification",
    scriptPath: "u/kevin/evaluate_health_alerts",
    schedulePrefix: "u/kevin/evaluate_health_alerts",
    triggerable: false,
  },
] as const;

export const GOOGLE_HEALTH_PIPELINE = MANAGED_PIPELINES[0];

export function pipelineIdentity(pipeline: ManagedPipeline): PipelineIdentity {
  return {
    pipelineKey: pipeline.key,
    pipelineLabel: pipeline.label,
    pipelineCategory: pipeline.category,
  };
}
