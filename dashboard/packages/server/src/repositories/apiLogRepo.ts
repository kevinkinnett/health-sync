import type { Pool } from "pg";

export interface ApiLogEntry {
  id: number;
  caller: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestParams: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
}

export interface ApiLogStats {
  windowHours: number;
  totalCalls: number;
  uniqueCallers: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  errorCount: number;
  errorRate: number;
  byCaller: Array<{ caller: string | null; count: number }>;
  byPath: Array<{ path: string; count: number; avgDurationMs: number }>;
}

/**
 * Storage for the v1 API request log. Every call to `/api/v1/*` lands
 * here via the `apiLogger` middleware so we can answer "who's hitting
 * what, how often, and how slowly" without instrumenting each route.
 *
 * Inserts are fire-and-forget — the middleware never awaits — so a DB
 * hiccup must not slow down API consumers. Reads are admin-only and
 * power the API Console UI.
 */
export class ApiLogRepository {
  constructor(private pool: Pool) {}

  /**
   * Idempotently create the table and its single supporting index.
   * Called once at boot so the v1 surface can serve traffic from a
   * fresh database without a separate migration step.
   */
  async ensureTables(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS universe.api_log (
        id              SERIAL PRIMARY KEY,
        caller          TEXT,
        method          TEXT NOT NULL,
        path            TEXT NOT NULL,
        status_code     INTEGER NOT NULL,
        duration_ms     INTEGER NOT NULL,
        request_params  JSONB,
        error           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_api_log_created
        ON universe.api_log (created_at DESC);
    `);
  }

  async log(entry: {
    caller: string | null;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    requestParams: Record<string, unknown> | null;
    error?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO universe.api_log
        (caller, method, path, status_code, duration_ms, request_params, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.caller,
        entry.method,
        entry.path,
        entry.statusCode,
        entry.durationMs,
        entry.requestParams ? JSON.stringify(entry.requestParams) : null,
        entry.error ?? null,
      ],
    );
  }

  async getRecent(opts: {
    limit?: number;
    caller?: string;
  } = {}): Promise<ApiLogEntry[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 500));
    const params: unknown[] = [limit];
    let where = "";
    if (opts.caller) {
      params.push(opts.caller);
      where = `WHERE caller = $${params.length}`;
    }
    const { rows } = await this.pool.query(
      `SELECT id, caller, method, path, status_code, duration_ms,
              request_params, error, created_at
       FROM universe.api_log
       ${where}
       ORDER BY created_at DESC
       LIMIT $1`,
      params,
    );
    return rows.map((r) => ({
      id: r.id as number,
      caller: r.caller as string | null,
      method: r.method as string,
      path: r.path as string,
      statusCode: r.status_code as number,
      durationMs: r.duration_ms as number,
      requestParams: r.request_params as Record<string, unknown> | null,
      error: r.error as string | null,
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }

  async getStats(windowHours = 24): Promise<ApiLogStats> {
    const { rows: aggRows } = await this.pool.query(
      `SELECT
         COUNT(*)::int                                                AS total_calls,
         COUNT(DISTINCT caller)::int                                   AS unique_callers,
         AVG(duration_ms)::int                                         AS avg_duration_ms,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)     AS p95_duration_ms,
         COUNT(*) FILTER (WHERE status_code >= 500)::int               AS error_count
       FROM universe.api_log
       WHERE created_at >= NOW() - ($1 || ' hours')::interval`,
      [String(windowHours)],
    );
    const agg = aggRows[0] ?? {};
    const totalCalls = (agg.total_calls as number | null) ?? 0;
    const errorCount = (agg.error_count as number | null) ?? 0;

    const { rows: callerRows } = await this.pool.query(
      `SELECT caller, COUNT(*)::int AS count
       FROM universe.api_log
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
       GROUP BY caller
       ORDER BY count DESC
       LIMIT 20`,
      [String(windowHours)],
    );

    const { rows: pathRows } = await this.pool.query(
      `SELECT path, COUNT(*)::int AS count, AVG(duration_ms)::int AS avg_duration_ms
       FROM universe.api_log
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
       GROUP BY path
       ORDER BY count DESC
       LIMIT 20`,
      [String(windowHours)],
    );

    return {
      windowHours,
      totalCalls,
      uniqueCallers: (agg.unique_callers as number | null) ?? 0,
      avgDurationMs: (agg.avg_duration_ms as number | null) ?? null,
      p95DurationMs:
        agg.p95_duration_ms != null ? Math.round(Number(agg.p95_duration_ms)) : null,
      errorCount,
      errorRate: totalCalls > 0 ? errorCount / totalCalls : 0,
      byCaller: callerRows.map((r) => ({
        caller: r.caller as string | null,
        count: r.count as number,
      })),
      byPath: pathRows.map((r) => ({
        path: r.path as string,
        count: r.count as number,
        avgDurationMs: r.avg_duration_ms as number,
      })),
    };
  }
}
