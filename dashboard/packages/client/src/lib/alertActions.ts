import type { HealthAlertKind } from "@health-dashboard/shared";

export type AlertCategory = "health" | "pipeline";

export interface AlertAction {
  category: AlertCategory;
  icon: string;
  label: string;
  to: string;
  guidance: string;
}

const ACTIONS: Record<HealthAlertKind, AlertAction> = {
  illness_triad: {
    category: "health",
    icon: "sick",
    label: "Review readiness",
    to: "/readiness",
    guidance: "Review the contributing recovery signals and favor a lighter day if the pattern persists.",
  },
  low_spo2: {
    category: "health",
    icon: "pulmonology",
    label: "Review vital trends",
    to: "/analytics/vitals",
    guidance: "Compare the reading with recent nights and check whether it is an isolated sensor result.",
  },
  readiness_drop: {
    category: "health",
    icon: "battery_alert",
    label: "Review readiness",
    to: "/readiness",
    guidance: "Open the readiness breakdown to see which signals moved and how strongly they contributed.",
  },
  ingest_stale: {
    category: "pipeline",
    icon: "sync_problem",
    label: "Open data pipeline",
    to: "/ingest",
    guidance: "Check the latest Google Health run, its error details, and the next scheduled attempt.",
  },
  ingest_recovered: {
    category: "pipeline",
    icon: "cloud_done",
    label: "View recovered pipeline",
    to: "/ingest",
    guidance: "The scheduled feed is healthy again; the pipeline page shows the successful recovery run.",
  },
};

export function alertAction(kind: HealthAlertKind): AlertAction {
  return ACTIONS[kind];
}
