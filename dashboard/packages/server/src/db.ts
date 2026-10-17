import pg from "pg";
import type { Config } from "./config.js";

const { Pool, types } = pg;

export type { Pool } from "pg";

// Override pg's default DATE handling. By default the driver parses a
// `DATE` column into a JS `Date` set to local-midnight in the Node
// process's timezone — which then `.toISOString().slice(0,10)` may shift
// by a day if the process TZ is east of UTC, or anytime the row gets
// re-serialised. We want raw `YYYY-MM-DD` strings end-to-end so the
// calendar day is preserved verbatim. OID 1082 is `date`.
//
// Done at module load (before any pool is created) so every connection
// across every pool inherits the override.
types.setTypeParser(1082, (val) => val);

export interface PoolOptions {
  /**
   * Client-side ceiling on any single query. Unset for the app pool, where
   * request handlers own their timeouts; set for the migration runner so a
   * connection that has silently died cannot hang startup forever.
   */
  queryTimeoutMillis?: number;
}

export function createPool(
  config: Config["db"],
  options: PoolOptions = {},
): InstanceType<typeof Pool> {
  return new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // The DB is reached over the tailnet, and the container's route to it can
    // change under an open socket (the Tailscale sidecar installs its routes
    // a moment after the app starts). Without keepalive a connection whose
    // packets are being dropped looks healthy forever: on 2026-10-17 a
    // migration's reply was lost this way and startup hung for 13 minutes
    // while holding a lock that stalled the Google Health ingest.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    ...(options.queryTimeoutMillis ? { query_timeout: options.queryTimeoutMillis } : {}),
  });
}
