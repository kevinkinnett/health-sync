import type { Pool } from "pg";
import type { HealthAlert } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";
import type { DetectedAlert } from "../services/alerts.js";

/**
 * Persistence for proactive health alerts.
 *
 * The key anti-noise mechanism lives here: one open row represents an alert
 * episode. Repeated observations update that row, recovery resolves it, and a
 * later recurrence creates (or briefly reopens) a new episode.
 */
const COOLDOWN_DAYS = 3;

export class AlertRepository {
  constructor(private pool: Pool) {}

  /**
   * Observe an alert condition. An existing open episode is refreshed without
   * producing another notification. A recently-resolved episode is reopened
   * within the user's cooldown; otherwise a new episode is inserted.
   */
  async insertIfNew(
    alert: DetectedAlert,
    cooldownDays: number = COOLDOWN_DAYS,
  ): Promise<HealthAlert | null> {
    const returnedColumns = `id, kind, severity, title, detail, metric, date,
      created_at, last_observed_at, resolved_at, occurrence_count, read_at`;
    const { rows: open } = await this.pool.query(
      `UPDATE universe.health_alert
       SET severity = $2, title = $3, detail = $4, metric = $5, date = $6,
           last_observed_at = NOW(), occurrence_count = occurrence_count + 1
       WHERE kind = $1 AND resolved_at IS NULL
       RETURNING ${returnedColumns}`,
      [alert.kind, alert.severity, alert.title, alert.detail, alert.metric, alert.date],
    );
    if (open.length > 0) return null;

    const cooldown = Math.max(0, Math.floor(cooldownDays));
    if (cooldown > 0) {
      const { rows: reopened } = await this.pool.query(
        `UPDATE universe.health_alert
         SET severity = $2, title = $3, detail = $4, metric = $5, date = $6,
             last_observed_at = NOW(), resolved_at = NULL,
             occurrence_count = occurrence_count + 1
         WHERE id = (
           SELECT id FROM universe.health_alert
           WHERE kind = $1 AND resolved_at >= NOW() - ($7 || ' days')::interval
           ORDER BY resolved_at DESC
           LIMIT 1
         )
         RETURNING ${returnedColumns}`,
        [alert.kind, alert.severity, alert.title, alert.detail, alert.metric, alert.date, String(cooldown)],
      );
      if (reopened.length > 0) return null;
    }

    const { rows } = await this.pool.query(
      `INSERT INTO universe.health_alert
         (kind, severity, title, detail, metric, date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${returnedColumns}`,
      [
        alert.kind,
        alert.severity,
        alert.title,
        alert.detail,
        alert.metric,
        alert.date,
      ],
    );
    return this.toAlert(rows[0]);
  }

  async list(limit = 50): Promise<HealthAlert[]> {
    const { rows } = await this.pool.query(
      `SELECT id, kind, severity, title, detail, metric, date, created_at,
              last_observed_at, resolved_at, occurrence_count, read_at
       FROM universe.health_alert
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 200))],
    );
    return rows.map(this.toAlert);
  }

  async unreadCount(): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM universe.health_alert WHERE read_at IS NULL`,
    );
    return (rows[0]?.n as number) ?? 0;
  }

  async openCount(): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM universe.health_alert WHERE resolved_at IS NULL`,
    );
    return (rows[0]?.n as number) ?? 0;
  }

  async resolveOpenKinds(kinds: HealthAlert["kind"][]): Promise<number> {
    if (kinds.length === 0) return 0;
    const { rowCount } = await this.pool.query(
      `UPDATE universe.health_alert
       SET resolved_at = NOW()
       WHERE resolved_at IS NULL AND kind = ANY($1::text[])`,
      [kinds],
    );
    return rowCount ?? 0;
  }

  async markAllRead(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `UPDATE universe.health_alert SET read_at = NOW() WHERE read_at IS NULL`,
    );
    return rowCount ?? 0;
  }

  async markRead(id: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE universe.health_alert
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  private toAlert(r: Record<string, unknown>): HealthAlert {
    return {
      id: r.id as number,
      kind: r.kind as HealthAlert["kind"],
      severity: r.severity as HealthAlert["severity"],
      title: r.title as string,
      detail: r.detail as string,
      metric: (r.metric as string | null) ?? null,
      date: toDateStr(r.date),
      createdAt: toTimestampStr(r.created_at) ?? "",
      lastObservedAt: toTimestampStr(r.last_observed_at) ?? "",
      resolvedAt: r.resolved_at != null ? toTimestampStr(r.resolved_at) : null,
      occurrenceCount: Number(r.occurrence_count ?? 1),
      readAt: r.read_at != null ? toTimestampStr(r.read_at) : null,
    };
  }
}
