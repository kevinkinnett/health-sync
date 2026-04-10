import type { Pool } from "pg";
import type { IngestState, IngestRun } from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

export class IngestRepository {
  constructor(private pool: Pool) {}

  async getState(): Promise<IngestState[]> {
    const { rows } = await this.pool.query(
      `SELECT data_type, latest_fetched_date, earliest_fetched_date,
              backfill_complete, last_success_at_utc, last_run_id, updated_at_utc
       FROM universe.fitbit_ingest_state
       ORDER BY data_type`,
    );
    return rows.map((row) => ({
      dataType: String(row.data_type),
      latestFetchedDate: row.latest_fetched_date != null ? toDateStr(row.latest_fetched_date) : null,
      earliestFetchedDate: row.earliest_fetched_date != null ? toDateStr(row.earliest_fetched_date) : null,
      backfillComplete: Boolean(row.backfill_complete),
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
       WHERE provider = 'fitbit'
       ORDER BY started_at_utc DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      ingestRunId: Number(row.ingest_run_id),
      startedAtUtc: toTimestampStr(row.started_at_utc) ?? "",
      finishedAtUtc: toTimestampStr(row.finished_at_utc),
      status: String(row.status),
      rowsWritten: row.rows_written as number | null,
      errorCount: row.error_count as number | null,
      details: row.details as Record<string, { rows: number; errors: number; range: string }> | null,
    }));
  }

  async hasRunningJob(): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM universe.ingest_run
       WHERE provider = 'fitbit' AND status = 'running'
       LIMIT 1`,
    );
    return rows.length > 0;
  }
}
