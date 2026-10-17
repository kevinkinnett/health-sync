/**
 * A read-only stand-in for a `pg` Pool, answering queries from a recorded
 * snapshot.
 *
 * The evaluation harness runs the REAL repositories and services against
 * production data, but this machine has no route to the database and the
 * analysis must never write. So the harness records the exact SQL the
 * repositories issue, fetches those result sets once (read-only, through
 * Windmill), and replays them here. Anything not in the snapshot is a
 * miss: recorded so the next fetch can fill it, and answered with no rows.
 *
 * Date-range reads (`WHERE … date >= $1 AND date <= $2`) are the one
 * rewrite: the experiment engine issues one per window, and a placebo sweep
 * asks for hundreds of windows. They are keyed on the unfiltered query and
 * filtered here, so one full-table fetch serves every window.
 *
 * Writes are refused outright — a harness that could write is not read-only.
 */

export interface SnapshotColumn {
  name: string;
  /** Postgres type OID, so values can be decoded the way `pg` would. */
  oid: number;
}

export interface SnapshotResult {
  columns: SnapshotColumn[];
  rows: unknown[][];
}

export interface Snapshot {
  takenAt: string;
  /** Normalized query key → result. */
  results: Record<string, SnapshotResult>;
}

export interface SnapshotQuery {
  key: string;
  sql: string;
  params: unknown[];
}

const DATE_RANGE = /\bdate >= \$1 AND date <= \$2\b/;
const WRITE = /^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT)\b/i;

const TIMESTAMP_OIDS = new Set([1114, 1184]);

export function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

export function queryKey(sql: string, params: unknown[]): string {
  return `${normalizeSql(sql)} -- ${JSON.stringify(params)}`;
}

/**
 * The query actually fetched for a given repository query, and the date
 * range to filter its rows to afterwards (null when it is replayed as-is).
 */
export function plan(sql: string, params: unknown[] = []): {
  query: SnapshotQuery;
  range: { start: string; end: string } | null;
} {
  const normalized = normalizeSql(sql);
  if (
    DATE_RANGE.test(normalized) &&
    params.length === 2 &&
    !/\$[3-9]/.test(normalized)
  ) {
    const unfiltered = normalized.replace(DATE_RANGE, "TRUE");
    return {
      query: { key: queryKey(unfiltered, []), sql: unfiltered, params: [] },
      range: { start: String(params[0]), end: String(params[1]) },
    };
  }
  return { query: { key: queryKey(normalized, params), sql: normalized, params }, range: null };
}

function decode(value: unknown, oid: number): unknown {
  if (value == null) return null;
  // `pg` hands timestamps back as Date; dates stay strings (db.ts overrides
  // OID 1082); numeric and int8 arrive as strings, which the fetcher keeps.
  if (TIMESTAMP_OIDS.has(oid)) return new Date(String(value));
  return value;
}

export class SnapshotPool {
  readonly misses = new Map<string, SnapshotQuery>();

  constructor(private readonly snapshot: Snapshot) {}

  async query(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    if (WRITE.test(sql)) {
      throw new Error("SnapshotPool is read-only: refusing a write query");
    }
    const { query, range } = plan(sql, params);
    const result = this.snapshot.results[query.key];
    if (!result) {
      this.misses.set(query.key, query);
      return { rows: [], rowCount: 0 };
    }
    let rows = result.rows.map((values) =>
      Object.fromEntries(result.columns.map((column, index) => [column.name, decode(values[index], column.oid)])),
    );
    if (range) {
      rows = rows.filter((row) => {
        const date = String(row.date).slice(0, 10);
        return date >= range.start && date <= range.end;
      });
    }
    return { rows, rowCount: rows.length };
  }

  async end(): Promise<void> {}
}
