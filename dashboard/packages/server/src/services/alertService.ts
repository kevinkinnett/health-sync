import type {
  AlertsResponse,
  EvaluateAlertsResponse,
  HealthAlert,
} from "@health-dashboard/shared";
import type { HealthDataService } from "./healthDataService.js";
import type { AlertRepository } from "../repositories/alertRepo.js";
import type { SettingService } from "./settingService.js";
import { computeReadiness } from "./readiness.js";
import { detectAlerts, DEFAULT_DETECTION, type DetectionConfig } from "./alerts.js";
import type { IngestHealthMonitor } from "./ingestHealthMonitor.js";
import { logger } from "../logger.js";

const HEALTH_EPISODE_KINDS = [
  "illness_triad",
  "low_spo2",
  "readiness_drop",
] as const;

/**
 * Orchestrates anomaly detection + persistence. Pulls the joined
 * recovery series once (reusing HealthDataService's join), reads the
 * user's notification settings (thresholds + per-kind toggles), runs the
 * pure detectors, and persists any genuinely-new alerts (the repo's
 * cooldown handles dedup). The scheduled Windmill job calls `evaluate()`
 * daily; the returned `delivery` policy tells it whether/which/where to
 * push, so delivery is controlled entirely from the dashboard UI.
 */
export class AlertService {
  constructor(
    private healthData: HealthDataService,
    private repo: AlertRepository,
    private settings: SettingService,
    private ingestMonitor?: IngestHealthMonitor,
  ) {}

  /** Detect + persist; returns the alerts created this run + push policy. */
  async evaluate(): Promise<EvaluateAlertsResponse> {
    const s = await this.settings.getNotificationSettings();
    const created: HealthAlert[] = [];

    // Operational freshness is independent of biometric calculations. Keep
    // monitoring useful even when one health query is temporarily malformed.
    if (this.ingestMonitor) {
      const operational = await this.ingestMonitor.evaluate();
      if (operational) created.push(operational);
    }

    try {
      const days = await this.healthData.getReadinessInputs();
      const readiness = computeReadiness(days);

      const config: DetectionConfig = {
      illnessSigma: s.thresholds.illnessSigma,
      // not surfaced in the UI (yet) — keep the default.
      skinTempWarm: DEFAULT_DETECTION.skinTempWarm,
      spo2AlertBelow: s.thresholds.spo2AlertBelow,
      spo2WarnBelow: s.thresholds.spo2WarnBelow,
      readinessDropPoints: s.thresholds.readinessDropPoints,
      kinds: s.kinds,
      };
      const detected = detectAlerts(days, readiness, config);
      const observedKinds = new Set(detected.map((alert) => alert.kind));

      for (const d of detected) {
        const row = await this.repo.insertIfNew(d, s.thresholds.cooldownDays);
        if (row) created.push(row);
      }
      await this.repo.resolveOpenKinds(
        HEALTH_EPISODE_KINDS.filter((kind) => !observedKinds.has(kind)),
      );
    } catch (err) {
      logger.error({ err }, "Health alert detection failed; operational alerts were preserved");
    }
    return {
      created,
      delivery: {
        pushEnabled: s.pushEnabled,
        pushSeverities: s.pushSeverities,
        appriseUrl: s.appriseUrl,
      },
    };
  }

  async list(limit = 50): Promise<AlertsResponse> {
    const [alerts, unreadCount, openCount] = await Promise.all([
      this.repo.list(limit),
      this.repo.unreadCount(),
      this.repo.openCount(),
    ]);
    return { alerts, unreadCount, openCount };
  }

  async markAllRead(): Promise<number> {
    return this.repo.markAllRead();
  }

  async markRead(id: number): Promise<boolean> {
    return this.repo.markRead(id);
  }
}
