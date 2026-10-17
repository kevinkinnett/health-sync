import { describe, it, expect } from "vitest";
import { plan, queryKey, SnapshotPool, type Snapshot } from "../services/evaluation/snapshotPool.js";

const RANGE_SQL = `SELECT date, steps, fetched_at
       FROM universe.health_activity_daily
       WHERE date >= $1 AND date <= $2
       ORDER BY date`;

function snapshotWith(sql: string, params: unknown[], rows: unknown[][]): Snapshot {
  return {
    takenAt: "2026-10-16T00:00:00Z",
    results: {
      [plan(sql, params).query.key]: {
        columns: [{ name: "date", oid: 1082 }, { name: "steps", oid: 23 }, { name: "fetched_at", oid: 1184 }],
        rows,
      },
    },
  };
}

describe("SnapshotPool", () => {
  it("serves every date range from one unfiltered fetch", async () => {
    const pool = new SnapshotPool(snapshotWith(RANGE_SQL, ["x", "y"], [
      ["2026-01-01", 100, "2026-01-02T00:00:00Z"],
      ["2026-01-02", 200, null],
      ["2026-01-03", 300, null],
    ]));
    const { rows } = await pool.query(RANGE_SQL, ["2026-01-02", "2026-01-03"]);
    expect(rows.map((r) => r.steps)).toEqual([200, 300]);
    expect(pool.misses.size).toBe(0);
  });

  it("decodes timestamps to Date the way pg does, and leaves dates as strings", async () => {
    const pool = new SnapshotPool(snapshotWith(RANGE_SQL, ["x", "y"], [["2026-01-01", 1, "2026-01-02T00:00:00Z"]]));
    const [row] = (await pool.query(RANGE_SQL, ["2026-01-01", "2026-01-01"])).rows;
    expect(row.fetched_at).toBeInstanceOf(Date);
    expect(row.date).toBe("2026-01-01");
  });

  it("records a miss and answers it with no rows", async () => {
    const pool = new SnapshotPool({ takenAt: "", results: {} });
    const { rows } = await pool.query("SELECT 1 FROM x WHERE id = $1", [4]);
    expect(rows).toEqual([]);
    expect([...pool.misses.values()][0]).toMatchObject({ params: [4] });
  });

  it("keys exact queries on normalized SQL plus parameters", () => {
    expect(queryKey("SELECT  1\n FROM x", [1])).toBe(queryKey("SELECT 1 FROM x", [1]));
    expect(queryKey("SELECT 1 FROM x", [1])).not.toBe(queryKey("SELECT 1 FROM x", [2]));
    expect(plan("SELECT * FROM t WHERE id = $1", [3]).range).toBeNull();
  });

  it("refuses writes", async () => {
    const pool = new SnapshotPool({ takenAt: "", results: {} });
    await expect(pool.query("DELETE FROM universe.intervention WHERE id = $1", [1])).rejects.toThrow(/read-only/);
    await expect(pool.query("  insert into x values (1)")).rejects.toThrow(/read-only/);
  });
});
