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

export async function runMigrations(pool: Pool, directory: string): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    return await applyMigrations(client, await readMigrations(directory));
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}
