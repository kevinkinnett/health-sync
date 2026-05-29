/**
 * User-configurable settings, persisted server-side in the generic
 * `universe.app_setting` key-value store. This is the first real
 * settings surface for the app; future preference groups (data
 * retention, units server-side, etc.) become additional keys + types
 * here rather than new tables.
 *
 * `NotificationSettings` drives two things that used to be hardcoded:
 *   - DETECTION — the thresholds + per-kind toggles the anomaly
 *     detectors read (server-side, effective the next evaluation).
 *   - DELIVERY  — whether/which alerts are pushed and where, returned to
 *     the scheduled job as the `AlertDelivery` policy.
 */
import type { AlertSeverity } from "./alerts.js";

/**
 * Tunable detector thresholds. Defaults mirror the original hardcoded
 * constants, so an unconfigured install behaves exactly as before.
 */
export interface NotificationThresholds {
  /** σ above baseline for a recovery signal to count as elevated (def 1.5). */
  illnessSigma: number;
  /** SpO2 below this (%) is an `alert` (def 90). */
  spo2AlertBelow: number;
  /** SpO2 below this (%) is a `warn` (def 92). */
  spo2WarnBelow: number;
  /** Readiness fall vs recent trend (points) that warrants a heads-up (def 18). */
  readinessDropPoints: number;
  /** Don't re-fire the same kind within this many days (def 3). */
  cooldownDays: number;
}

/** Per-kind detection toggles — turn an entire alert family off. */
export interface NotificationKindToggles {
  illnessTriad: boolean;
  lowSpo2: boolean;
  readinessDrop: boolean;
}

export interface NotificationSettings {
  /** Master switch for push delivery. In-app bell is unaffected. */
  pushEnabled: boolean;
  /** Severities forwarded to Apprise (info is never pushed by design). */
  pushSeverities: AlertSeverity[];
  kinds: NotificationKindToggles;
  thresholds: NotificationThresholds;
  /** Whether the weekly AI report job sends its heads-up notification. */
  weeklyReportEnabled: boolean;
  /**
   * Full Apprise notify endpoint the test push + scheduled job POST to,
   * e.g. `https://apprise.tail322ce1.ts.net/notify/apprise?tag=health`.
   * The `?tag=` query scopes delivery within a shared multi-target
   * Apprise config, so it must ride in the URL. NOT a secret — the
   * delivery token lives in Apprise's own config under that key.
   */
  appriseUrl: string;
}
