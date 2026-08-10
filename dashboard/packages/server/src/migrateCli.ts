import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { logger } from "./logger.js";
import { runMigrations } from "./migrations.js";

const config = loadConfig();
const pool = createPool(config.db);
const directory = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../migrations", import.meta.url));

try {
  const applied = await runMigrations(pool, directory);
  logger.info({ applied, directory }, "Database migrations complete");
} finally {
  await pool.end();
}
