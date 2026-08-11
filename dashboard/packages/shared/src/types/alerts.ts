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
  | "readiness_drop"
  /** Google Health missed its expected ingestion window. */
  | "ingest_stale"
  /** Google Health succeeded after a stale period. */
  | "ingest_recovered";

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
  /** Most recent evaluation where this condition was still present. */
  lastObservedAt: string;
  /** Null while the episode is active; set when a later evaluation recovers. */
  resolvedAt: string | null;
  /** Number of evaluations that observed this episode. */
  occurrenceCount: number;
  /** Null until the user dismisses/acknowledges it. */
  readAt: string | null;
}

/** GET /api/alerts response. */
export interface AlertsResponse {
  alerts: HealthAlert[];
  unreadCount: number;
  openCount: number;
}

/**
 * The push-delivery policy in force, returned alongside an evaluation so
 * the scheduled Windmill job is a dumb forwarder: it pushes the `created`
 * alerts whose severity is in `pushSeverities` to `appriseUrl`, but only
 * if `pushEnabled`. All three come from the user's notification settings,
 * so delivery is controlled entirely from the dashboard UI — no Windmill
 * edits needed to mute pushes or change the target. Contains NO secret:
 * `appriseUrl` is the notify endpoint; the token lives in Apprise's config.
 */
export interface AlertDelivery {
  pushEnabled: boolean;
  pushSeverities: AlertSeverity[];
  appriseUrl: string;
}

/** POST /api/alerts/evaluate response — alerts created this run + policy. */
export interface EvaluateAlertsResponse {
  created: HealthAlert[];
  delivery: AlertDelivery;
}
