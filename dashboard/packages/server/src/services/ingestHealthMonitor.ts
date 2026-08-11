import type { IngestFreshnessStatus, IngestStatus } from "@health-dashboard/shared";
import type { AlertRepository } from "../repositories/alertRepo.js";
import type { SettingRepository } from "../repositories/settingRepo.js";
import type { DetectedAlert } from "./alerts.js";

const STATE_KEY = "monitor.google_health_ingest";

interface StatusSource {
  getStatus(): Promise<IngestStatus>;
}

interface StoredMonitorState {
  status: IngestFreshnessStatus;
  observedAtUtc: string;
}

/** Pure transition policy: notify once at stale onset and once on recovery. */
export function ingestTransitionAlert(
  previous: IngestFreshnessStatus | null,
  current: IngestStatus,
  now: Date,
): DetectedAlert | null {
  const status = current.freshness.status;
  const date = now.toISOString().slice(0, 10);
  if (status === "stale" && previous !== "stale") {
    const last = current.freshness.lastSuccessAtUtc
      ? ` Last successful run: ${current.freshness.lastSuccessAtUtc}.`
      : " No successful run has been recorded.";
    return {
      kind: "ingest_stale",
      severity: "warn",
      title: "Google Health ingestion is stale",
      detail: `No successful import arrived within ${current.freshness.staleAfterMinutes} minutes.${last}`,
      metric: "ingestion",
      date,
    };
  }
  if (status === "healthy" && previous === "stale") {
    return {
      kind: "ingest_recovered",
      // Recovery is a notification-worthy operational transition; `warn`
      // keeps it in the default Apprise delivery policy.
      severity: "warn",
      title: "Google Health ingestion recovered",
      detail: `Imports are current again. Latest success: ${current.freshness.lastSuccessAtUtc ?? "just now"}.`,
      metric: "ingestion",
      date,
    };
  }
  return null;
}

export class IngestHealthMonitor {
  constructor(
    private statusSource: StatusSource,
    private state: Pick<SettingRepository, "get" | "set">,
    private alerts: Pick<AlertRepository, "insertIfNew" | "resolveOpenKinds">,
    private clock: () => Date = () => new Date(),
  ) {}

  async evaluate() {
    const [current, prior] = await Promise.all([
      this.statusSource.getStatus(),
      this.state.get<StoredMonitorState>(STATE_KEY),
    ]);
    const now = this.clock();
    const detected = ingestTransitionAlert(prior?.status ?? null, current, now);
    if (detected?.kind === "ingest_stale") {
      await this.alerts.resolveOpenKinds(["ingest_recovered"]);
    } else if (detected?.kind === "ingest_recovered") {
      await this.alerts.resolveOpenKinds(["ingest_stale"]);
    }
    const created = detected ? await this.alerts.insertIfNew(detected, 1) : null;
    // Recovery is a durable event, not an active incident. It remains unread
    // until acknowledged but belongs in resolved history immediately.
    if (detected?.kind === "ingest_recovered") {
      await this.alerts.resolveOpenKinds(["ingest_recovered"]);
    }
    await this.state.set(STATE_KEY, {
      status: current.freshness.status,
      observedAtUtc: now.toISOString(),
    } satisfies StoredMonitorState);
    return created;
  }
}
