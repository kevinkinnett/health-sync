import { describe, expect, it } from "vitest";
import { applyMigrations, runMigrations, type Migration } from "../migrations.js";

function migration(name: string, sql = "SELECT 1"): Migration {
  return { name, sql, checksum: `checksum-${name}` };
}

describe("database migrations", () => {
  it("applies pending files transactionally in order", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql: sql.trim(), params });
        if (sql.startsWith("SELECT name")) return { rows: [] };
        return { rows: [] };
      },
    };

    const applied = await applyMigrations(client as never, [
      migration("20260809_first.sql", "SELECT 'first'"),
      migration("20260810_second.sql", "SELECT 'second'"),
    ]);

    expect(applied).toEqual(["20260809_first.sql", "20260810_second.sql"]);
    expect(calls.filter((call) => call.sql === "BEGIN")).toHaveLength(2);
    expect(calls.filter((call) => call.sql === "COMMIT")).toHaveLength(2);
    expect(calls.map((call) => call.sql)).toContain("SELECT 'first'");
  });

  it("refuses checksum drift without running the changed migration", async () => {
    const client = {
      query: async (sql: string) => ({
        rows: sql.startsWith("SELECT name")
          ? [{ name: "20260809_first.sql", checksum: "old-checksum" }]
          : [],
      }),
    };
    await expect(applyMigrations(client as never, [migration("20260809_first.sql")]))
      .rejects.toThrow(/checksum changed/i);
  });

  it("rolls back a failed migration and does not record it", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql.trim());
        if (sql.startsWith("SELECT name")) return { rows: [] };
        if (sql === "BROKEN") throw new Error("syntax error");
        return { rows: [] };
      },
    };
    await expect(applyMigrations(client as never, [migration("20260809_broken.sql", "BROKEN")]))
      .rejects.toThrow("syntax error");
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
    expect(calls.some((sql) => sql.startsWith("INSERT INTO universe.schema_migration"))).toBe(false);
  });

  it("runs a no-transaction migration outside BEGIN/COMMIT so CONCURRENTLY works", async () => {
    // CREATE INDEX CONCURRENTLY is rejected inside a transaction block, and a
    // plain CREATE INDEX on a large ingest table holds a lock that stalls the
    // ingest for as long as the build (or a hung client) lasts.
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql.trim());
        return { rows: [] };
      },
    };
    const sql = "-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY IF NOT EXISTS ix ON t (c)";
    const applied = await applyMigrations(client as never, [migration("20261017_concurrent.sql", sql)]);

    expect(applied).toEqual(["20261017_concurrent.sql"]);
    expect(calls).not.toContain("BEGIN");
    expect(calls).not.toContain("COMMIT");
    const ran = calls.indexOf(sql.trim());
    const recorded = calls.findIndex((c) => c.startsWith("INSERT INTO universe.schema_migration"));
    expect(ran).toBeGreaterThan(-1);
    expect(recorded).toBeGreaterThan(ran);
  });

  it("only honours the no-transaction directive on the first line", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql.trim());
        return { rows: [] };
      },
    };
    await applyMigrations(client as never, [
      migration("20261017_mention.sql", "SELECT 1;\n-- migrate:no-transaction is documented elsewhere"),
    ]);
    expect(calls).toContain("BEGIN");
    expect(calls).toContain("COMMIT");
  });

  it("bounds the migration session so a dead client cannot hold locks", async () => {
    // A migration whose reply is lost leaves its backend "idle in
    // transaction" holding every lock it took. The server-side timeouts make
    // Postgres abort it and release them instead of waiting on the client.
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql.trim());
        return { rows: [] };
      },
      release: () => {},
    };
    const pool = { connect: async () => client };
    await runMigrations(pool as never, "/nonexistent", async () => []);

    const lockIndex = calls.findIndex((c) => c.startsWith("SELECT pg_advisory_lock"));
    const settings = calls.slice(0, lockIndex);
    expect(settings).toContain("SET idle_in_transaction_session_timeout = '60s'");
    expect(settings).toContain("SET lock_timeout = '30s'");
  });
});
