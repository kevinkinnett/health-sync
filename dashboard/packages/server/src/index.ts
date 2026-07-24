import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { createPool } from "./db.js";
import { createApp } from "./createApp.js";

/**
 * Process entry point. Owns only the things a test must not do: read the
 * environment, open a real connection pool, and bind a port.
 *
 * All wiring lives in `createApp` so it can be constructed against a fake
 * pool and asserted (see `__tests__/appBoot.test.ts`).
 */
const config = loadConfig();
const pool = createPool(config.db);

pool.on("error", (err) => {
  logger.error({ err }, "Database pool error");
});

const app = await createApp(pool, config);

app.listen(config.port, () => {
  logger.info({ port: config.port }, "Server started");
});

export { app };
