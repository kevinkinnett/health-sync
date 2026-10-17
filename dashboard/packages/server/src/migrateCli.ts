import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { logger } from "./logger.js";
import { runMigrations } from "./migrations.js";

const config = loadConfig();
// A ceiling on each migration statement, client-side. Keepalive alone takes
// ~10+ minutes to declare a dead socket; this makes a hung migration exit so
// the container restarts and retries. Raise it for a deliberately long build.
const pool = createPool(config.db, {
  queryTimeoutMillis: Number(process.env.MIGRATION_QUERY_TIMEOUT_MS ?? 300_000),
});
const directory = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../migrations", import.meta.url));

try {
  const applied = await runMigrations(pool, directory);
  logger.info({ applied, directory }, "Database migrations complete");
} finally {
  await pool.end();
}
