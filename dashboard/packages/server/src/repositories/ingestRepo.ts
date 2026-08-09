import type { Pool } from "pg";
import type { IngestState, IngestRun } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

export class IngestRepository {
  constructor(private pool: Pool) {}

  async getState(): Promise<IngestState[]> {
    const { rows } = await this.pool.query(
      `WITH type_map(data_type, raw_type) AS (
         VALUES
           ('activity', 'steps'),
           ('activity', 'distance'),
           ('activity', 'active-zone-minutes'),
           ('sleep', 'sleep'),
           ('heart_rate', 'daily-resting-heart-rate'),
           ('body_weight', 'weight'),
           ('spo2', 'oxygen-saturation'),
           ('hrv', 'heart-rate-variability'),
           ('breathing_rate', 'daily-respiratory-rate'),
           ('skin_temp', 'daily-sleep-temperature-derivations'),
           ('exercise_log', 'exercise')
       ), coverage AS (
         SELECT tm.data_type,
                MIN(p.point_date) AS earliest_fetched_date,
                MAX(p.point_date) AS latest_fetched_date,
                MAX(p.fetched_at) AS updated_at_utc
         FROM type_map tm
         LEFT JOIN universe.google_health_data_point p
           ON p.data_type = tm.raw_type
         GROUP BY tm.data_type
       ), latest_run AS (
         SELECT ingest_run_id, finished_at_utc
         FROM universe.ingest_run
         WHERE provider = 'google_health' AND status = 'completed'
         ORDER BY started_at_utc DESC
         LIMIT 1
       )
       SELECT c.data_type, c.latest_fetched_date, c.earliest_fetched_date,
              CASE
                WHEN c.earliest_fetched_date IS NULL OR c.latest_fetched_date IS NULL
                  THEN FALSE
                ELSE c.latest_fetched_date - c.earliest_fetched_date >= 365
              END AS history_target_met,
              lr.finished_at_utc AS last_success_at_utc,
              lr.ingest_run_id AS last_run_id,
              c.updated_at_utc
       FROM coverage c
       LEFT JOIN latest_run lr ON TRUE
       ORDER BY c.data_type`,
    );
    return rows.map((row) => ({
      dataType: String(row.data_type),
      latestFetchedDate: row.latest_fetched_date != null ? toDateStr(row.latest_fetched_date) : null,
      earliestFetchedDate: row.earliest_fetched_date != null ? toDateStr(row.earliest_fetched_date) : null,
      historyTargetMet: Boolean(row.history_target_met),
      lastSuccessAtUtc: toTimestampStr(row.last_success_at_utc),
      lastRunId: row.last_run_id != null ? Number(row.last_run_id) : null,
      updatedAtUtc: toTimestampStr(row.updated_at_utc),
    }));
  }

  async getRuns(limit: number): Promise<IngestRun[]> {
    const { rows } = await this.pool.query(
      `SELECT ingest_run_id, started_at_utc, finished_at_utc, status,
              rows_written, error_count, details
       FROM universe.ingest_run
       WHERE provider = 'google_health'
       ORDER BY started_at_utc DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      ingestRunId: Number(row.ingest_run_id),
      startedAtUtc: toTimestampStr(row.started_at_utc) ?? "",
      finishedAtUtc: toTimestampStr(row.finished_at_utc),
      status: String(row.status),
      rowsWritten: row.rows_written != null ? Number(row.rows_written) : null,
      errorCount: row.error_count != null ? Number(row.error_count) : null,
      details: normalizeGoogleHealthDetails(row.details),
    }));
  }

  async hasRunningJob(): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM universe.ingest_run
       WHERE provider = 'google_health' AND status = 'running'
       LIMIT 1`,
    );
    return rows.length > 0;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Convert Google Health's capture/rollup audit payload into UI row details. */
export function normalizeGoogleHealthDetails(
  value: unknown,
): IngestRun["details"] {
  const root = asRecord(value);
  if (!root) return null;

  const normalized: NonNullable<IngestRun["details"]> = {};
  const captured = asRecord(root.captured);
  if (captured) {
    for (const [rawType, rawResult] of Object.entries(captured)) {
      const result = asRecord(rawResult);
      if (!result) continue;
      const points = Number(result.points ?? 0);
      normalized[rawType.replace(/-/g, "_")] = {
        rows: Number.isFinite(points) ? points : 0,
        errors: result.error ? 1 : 0,
        range: "",
      };
    }
  }

  const rolled = asRecord(root.rolled);
  if (rolled) {
    for (const [name, count] of Object.entries(rolled)) {
      if (typeof count !== "number" || !Number.isFinite(count)) continue;
      normalized[`rollup_${name}`] = { rows: count, errors: 0, range: "" };
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}
