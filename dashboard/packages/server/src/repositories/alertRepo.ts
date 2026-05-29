import type { Pool } from "pg";
import type { HealthAlert } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";
import type { DetectedAlert } from "../services/alerts.js";

/**
 * Persistence for proactive health alerts.
 *
 * The key anti-noise mechanism lives here: `insertIfNew` won't insert
 * an alert of a given kind if one of the same kind already exists
 * within the cooldown window. So the daily evaluation fires an alert
 * once at onset and stays quiet while the condition persists, rather
 * than re-alerting every morning.
 */
const COOLDOWN_DAYS = 3;

export class AlertRepository {
  constructor(private pool: Pool) {}

  async ensureTables(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS universe.health_alert (
        id          SERIAL PRIMARY KEY,
        kind        TEXT NOT NULL,
        severity    TEXT NOT NULL,
        title       TEXT NOT NULL,
        detail      TEXT NOT NULL,
        metric      TEXT,
        date        DATE NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_at     TIMESTAMPTZ
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_health_alert_created
        ON universe.health_alert (created_at DESC);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_health_alert_kind_date
        ON universe.health_alert (kind, date DESC);
    `);
  }

  /**
   * Insert an alert unless one of the same kind already exists with a
   * `date` within `cooldownDays` of this one. Returns the new row, or
   * null when suppressed by cooldown (idempotent across same-day runs).
   * The cooldown defaults to COOLDOWN_DAYS but is overridable from the
   * user's notification settings.
   */
  async insertIfNew(
    alert: DetectedAlert,
    cooldownDays: number = COOLDOWN_DAYS,
  ): Promise<HealthAlert | null> {
    const { rows: existing } = await this.pool.query(
      `SELECT 1 FROM universe.health_alert
       WHERE kind = $1
         AND date > ($2::date - ($3 || ' days')::interval)
       LIMIT 1`,
      [alert.kind, alert.date, String(Math.max(0, Math.floor(cooldownDays)))],
    );
    if (existing.length > 0) return null;

    const { rows } = await this.pool.query(
      `INSERT INTO universe.health_alert
         (kind, severity, title, detail, metric, date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, kind, severity, title, detail, metric, date, created_at, read_at`,
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
      `SELECT id, kind, severity, title, detail, metric, date, created_at, read_at
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

  async markAllRead(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `UPDATE universe.health_alert SET read_at = NOW() WHERE read_at IS NULL`,
    );
    return rowCount ?? 0;
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
      readAt: r.read_at != null ? toTimestampStr(r.read_at) : null,
    };
  }
}
