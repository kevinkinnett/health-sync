/**
 * Proactive health alerts — deterministic anomaly detection over the
 * recovery signals, surfaced in-app (the bell) and pushed via Apprise.
 *
 * Deliberately a SMALL, high-signal set of kinds. The fastest way to
 * get an alert system muted is to cry wolf, so we ship three
 * well-chosen alerts rather than ten noisy ones, gated by severity and
 * multi-day persistence.
 */

export type AlertSeverity =
  | "info" // in-app only, never pushed
  | "warn" // worth knowing
  | "alert"; // pushed — act on it

export type HealthAlertKind =
  /** ≥2 of {resting HR, breathing rate, skin temp} elevated ≥2 days. */
  | "illness_triad"
  /** Blood-oxygen average crossed an absolute low floor. */
  | "low_spo2"
  /** Readiness fell sharply vs the recent trend or hit "compromised". */
  | "readiness_drop";

/** A persisted alert row (server-assigned id + timestamps). */
export interface HealthAlert {
  id: number;
  kind: HealthAlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** The primary metric involved, if any (for an icon/badge). */
  metric: string | null;
  /** The day the alert concerns (YYYY-MM-DD). */
  date: string;
  createdAt: string;
  /** Null until the user dismisses/acknowledges it. */
  readAt: string | null;
}

/** GET /api/alerts response. */
export interface AlertsResponse {
  alerts: HealthAlert[];
  unreadCount: number;
}

/** POST /api/alerts/evaluate response — only the alerts created this run. */
export interface EvaluateAlertsResponse {
  created: HealthAlert[];
}
