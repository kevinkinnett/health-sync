import pg from "pg";
import type { Config } from "./config.js";

const { Pool } = pg;

export type { Pool } from "pg";

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
