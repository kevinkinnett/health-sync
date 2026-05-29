/**
 * Wire types for the v1 API observability surface. The `apiLogger`
 * middleware logs every external `/api/v1/*` call into
 * `universe.api_log`; these are the shapes the admin "API Console"
 * page consumes.
 */

/** One row of `universe.api_log` — a single request to /api/v1/*. */
export interface ApiLogEntry {
  id: number;
  /** Value of the `X-Caller` header, or null when not sent. */
  caller: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  /** Query params or body as JSON, depending on the route. */
  requestParams: Record<string, unknown> | null;
  /** Set when statusCode >= 500 and the controller stamped an error. */
  error: string | null;
  createdAt: string;
}

/**
 * Aggregate stats over a rolling window. Drives the four tiles
 * (total calls, unique callers, latency, error rate) and the two
 * top-N tables on the API Console.
 */
export interface ApiLogStats {
  windowHours: number;
  totalCalls: number;
  uniqueCallers: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  errorCount: number;
  /** errorCount / totalCalls, 0 when totalCalls=0. */
  errorRate: number;
  byCaller: Array<{ caller: string | null; count: number }>;
  byPath: Array<{ path: string; count: number; avgDurationMs: number }>;
}
