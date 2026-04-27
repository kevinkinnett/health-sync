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

export function createPool(config: Config["db"]): InstanceType<typeof Pool> {
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
  });
}
