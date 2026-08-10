import { describe, expect, it } from "vitest";
import { applyMigrations, type Migration } from "../migrations.js";

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
});
