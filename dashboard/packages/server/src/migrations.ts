import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";

export interface Migration {
  name: string;
  checksum: string;
  sql: string;
}

const LOCK_KEY = 864_204_219;

/**
 * First-line directive for migrations that cannot run in a transaction —
 * chiefly `CREATE INDEX CONCURRENTLY`, which is how indexes on the large
 * ingest-owned tables should be built so the ingest is never blocked. Such a
 * file must be idempotent (`IF NOT EXISTS`): if it fails part-way nothing
 * rolls it back, and it is re-run on the next start.
 */
const NO_TRANSACTION = /^--\s*migrate:no-transaction\b/;

export async function readMigrations(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory))
    .filter((name) => /^\d{8}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(join(directory, name), "utf8");
    return {
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    };
  }));
}

export async function applyMigrations(
  client: Pick<PoolClient, "query">,
  migrations: Migration[],
): Promise<string[]> {
  await client.query("CREATE SCHEMA IF NOT EXISTS universe");
  await client.query(`
    CREATE TABLE IF NOT EXISTS universe.schema_migration (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await client.query<{ name: string; checksum: string }>(
    "SELECT name, checksum FROM universe.schema_migration ORDER BY name",
  );
  const applied = new Map(rows.map((row) => [row.name, row.checksum]));
  const completed: string[] = [];

  for (const migration of migrations) {
    const prior = applied.get(migration.name);
    if (prior && prior !== migration.checksum) {
      throw new Error(`Migration checksum changed after application: ${migration.name}`);
    }
    if (prior) continue;

    if (NO_TRANSACTION.test(migration.sql)) {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO universe.schema_migration (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      completed.push(migration.name);
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO universe.schema_migration (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      await client.query("COMMIT");
      completed.push(migration.name);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  return completed;
}

export async function runMigrations(
  pool: Pool,
  directory: string,
  read: (directory: string) => Promise<Migration[]> = readMigrations,
): Promise<string[]> {
  const client = await pool.connect();
  try {
    // Session-scoped guards. If the client goes quiet mid-transaction (its
    // connection silently died), Postgres aborts the transaction and frees
    // its locks after a minute rather than holding them indefinitely. And a
    // migration that cannot get a lock promptly fails, so startup retries,
    // instead of queueing behind a long ingest and blocking it in turn.
    await client.query("SET idle_in_transaction_session_timeout = '60s'");
    await client.query("SET lock_timeout = '30s'");
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    return await applyMigrations(client, await read(directory));
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}
