import type {
  AlertsResponse,
  HealthAlert,
} from "@health-dashboard/shared";
import type { HealthDataService } from "./healthDataService.js";
import type { AlertRepository } from "../repositories/alertRepo.js";
import { computeReadiness } from "./readiness.js";
import { detectAlerts } from "./alerts.js";

/**
 * Orchestrates anomaly detection + persistence. Pulls the joined
 * recovery series once (reusing HealthDataService's join), runs the
 * pure detectors, and persists any genuinely-new alerts (the repo's
 * cooldown handles dedup). The scheduled Windmill job calls
 * `evaluate()` daily and forwards the returned `created` alerts to
 * Apprise.
 */
export class AlertService {
  constructor(
    private healthData: HealthDataService,
    private repo: AlertRepository,
  ) {}

  /** Detect + persist; returns only the alerts created this run. */
  async evaluate(): Promise<HealthAlert[]> {
    const days = await this.healthData.getReadinessInputs();
    const readiness = computeReadiness(days);
    const detected = detectAlerts(days, readiness);

    const created: HealthAlert[] = [];
    for (const d of detected) {
      const row = await this.repo.insertIfNew(d);
      if (row) created.push(row);
    }
    return created;
  }

  async list(limit = 50): Promise<AlertsResponse> {
    const [alerts, unreadCount] = await Promise.all([
      this.repo.list(limit),
      this.repo.unreadCount(),
    ]);
    return { alerts, unreadCount };
  }

  async markAllRead(): Promise<number> {
    return this.repo.markAllRead();
  }
}
