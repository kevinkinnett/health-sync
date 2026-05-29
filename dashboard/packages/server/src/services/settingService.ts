import { z } from "zod";
import type {
  AlertSeverity,
  NotificationSettings,
} from "@health-dashboard/shared";
import type { SettingRepository } from "../repositories/settingRepo.js";
import { logger } from "../logger.js";

/**
 * Owns the user's persisted settings. For notifications it does three
 * jobs:
 *   - READ  — merge the stored (possibly partial/legacy) JSON forward
 *             onto current defaults, so the API always returns a complete,
 *             well-typed object.
 *   - WRITE — validate (zod) + clamp incoming settings to sane ranges
 *             before persisting, so a fat-fingered threshold can't make
 *             the detectors nonsensical.
 *   - TEST  — fire a one-off push to the configured Apprise endpoint so
 *             the user can verify delivery from the UI.
 *
 * Defaults intentionally mirror the detectors' original hardcoded
 * constants, so an unconfigured install behaves exactly as it did before
 * settings existed.
 */

const NOTIFICATION_KEY = "notifications";

const DEFAULT_APPRISE_URL = "https://apprise.tail322ce1.ts.net/notify/health";

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  pushEnabled: true,
  pushSeverities: ["alert", "warn"],
  kinds: { illnessTriad: true, lowSpo2: true, readinessDrop: true },
  thresholds: {
    illnessSigma: 1.5,
    spo2AlertBelow: 90,
    spo2WarnBelow: 92,
    readinessDropPoints: 18,
    cooldownDays: 3,
  },
  weeklyReportEnabled: true,
  appriseUrl: DEFAULT_APPRISE_URL,
};

const severityEnum = z.enum(["info", "warn", "alert"]);

/** Full-object schema — the client always submits complete settings. */
const notificationSchema = z.object({
  pushEnabled: z.boolean(),
  pushSeverities: z.array(severityEnum),
  kinds: z.object({
    illnessTriad: z.boolean(),
    lowSpo2: z.boolean(),
    readinessDrop: z.boolean(),
  }),
  thresholds: z.object({
    illnessSigma: z.number(),
    spo2AlertBelow: z.number(),
    spo2WarnBelow: z.number(),
    readinessDropPoints: z.number(),
    cooldownDays: z.number(),
  }),
  weeklyReportEnabled: z.boolean(),
  appriseUrl: z.string().url(),
});

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Merge a stored (possibly partial/legacy/garbage) value forward onto
 * defaults. Never throws — unknown shapes degrade to defaults field by
 * field, so reads are always safe.
 */
export function mergeNotificationDefaults(stored: unknown): NotificationSettings {
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  const base: NotificationSettings = {
    ...d,
    pushSeverities: [...d.pushSeverities],
    kinds: { ...d.kinds },
    thresholds: { ...d.thresholds },
  };
  if (!stored || typeof stored !== "object") return base;

  const s = stored as Record<string, unknown>;
  const kinds =
    s.kinds && typeof s.kinds === "object"
      ? (s.kinds as Record<string, unknown>)
      : {};
  const th =
    s.thresholds && typeof s.thresholds === "object"
      ? (s.thresholds as Record<string, unknown>)
      : {};

  return {
    pushEnabled:
      typeof s.pushEnabled === "boolean" ? s.pushEnabled : d.pushEnabled,
    pushSeverities: Array.isArray(s.pushSeverities)
      ? (s.pushSeverities.filter(
          (x): x is AlertSeverity =>
            x === "info" || x === "warn" || x === "alert",
        ) as AlertSeverity[])
      : [...d.pushSeverities],
    kinds: {
      illnessTriad:
        typeof kinds.illnessTriad === "boolean"
          ? kinds.illnessTriad
          : d.kinds.illnessTriad,
      lowSpo2:
        typeof kinds.lowSpo2 === "boolean" ? kinds.lowSpo2 : d.kinds.lowSpo2,
      readinessDrop:
        typeof kinds.readinessDrop === "boolean"
          ? kinds.readinessDrop
          : d.kinds.readinessDrop,
    },
    thresholds: {
      illnessSigma: num(th.illnessSigma, d.thresholds.illnessSigma),
      spo2AlertBelow: num(th.spo2AlertBelow, d.thresholds.spo2AlertBelow),
      spo2WarnBelow: num(th.spo2WarnBelow, d.thresholds.spo2WarnBelow),
      readinessDropPoints: num(
        th.readinessDropPoints,
        d.thresholds.readinessDropPoints,
      ),
      cooldownDays: num(th.cooldownDays, d.thresholds.cooldownDays),
    },
    weeklyReportEnabled:
      typeof s.weeklyReportEnabled === "boolean"
        ? s.weeklyReportEnabled
        : d.weeklyReportEnabled,
    appriseUrl:
      typeof s.appriseUrl === "string" && s.appriseUrl.trim()
        ? s.appriseUrl.trim()
        : d.appriseUrl,
  };
}

/** Clamp thresholds into sane ranges + keep warn floor ≥ alert floor. */
export function clampNotificationSettings(
  s: NotificationSettings,
): NotificationSettings {
  const spo2Alert = clamp(Math.round(s.thresholds.spo2AlertBelow), 80, 100);
  const spo2Warn = Math.max(
    spo2Alert,
    clamp(Math.round(s.thresholds.spo2WarnBelow), 80, 100),
  );
  return {
    ...s,
    thresholds: {
      illnessSigma: clamp(s.thresholds.illnessSigma, 0.5, 4),
      spo2AlertBelow: spo2Alert,
      spo2WarnBelow: spo2Warn,
      readinessDropPoints: clamp(
        Math.round(s.thresholds.readinessDropPoints),
        5,
        60,
      ),
      cooldownDays: clamp(Math.round(s.thresholds.cooldownDays), 0, 30),
    },
  };
}

export class SettingService {
  constructor(private repo: SettingRepository) {}

  /** Always returns a complete object, even on a fresh install. */
  async getNotificationSettings(): Promise<NotificationSettings> {
    const stored = await this.repo.get(NOTIFICATION_KEY);
    return mergeNotificationDefaults(stored);
  }

  /**
   * Validate + clamp + persist. Throws `ZodError` (→ 400) on a malformed
   * payload; returns the stored (clamped) settings on success.
   */
  async updateNotificationSettings(
    patch: unknown,
  ): Promise<NotificationSettings> {
    const parsed = notificationSchema.parse(patch);
    const clamped = clampNotificationSettings(parsed);
    await this.repo.set(NOTIFICATION_KEY, clamped);
    return clamped;
  }

  /**
   * Fire a one-off test push to the configured Apprise endpoint. Never
   * throws — returns the HTTP status so the UI can distinguish delivered
   * (200) from "no targets registered for this key" (204) from error.
   */
  async sendTestNotification(): Promise<{ delivered: boolean; status: number }> {
    const s = await this.getNotificationSettings();
    try {
      const resp = await fetch(s.appriseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "\u{1FA7A} Vitalis test",
          body: "Test notification from your dashboard settings. If this reached your phone, push delivery is wired up correctly.",
          type: "info",
        }),
      });
      return { delivered: resp.status === 200, status: resp.status };
    } catch (err) {
      logger.warn({ err }, "Test notification failed to send");
      return { delivered: false, status: 0 };
    }
  }
}
