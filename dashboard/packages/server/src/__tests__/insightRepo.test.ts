import { describe, it, expect } from "vitest";
import { InsightRepository } from "../repositories/insightRepo.js";

/**
 * Why this exists: `/api/insights/list` 500'd in production. The repo's
 * row mappers called `(r.date_from as Date).toISOString()`, but a global
 * pg type parser (registered for the DATE oid elsewhere in the app)
 * returns DATE columns as `YYYY-MM-DD` STRINGS, not Date objects —
 * `.toISOString()` is not a function on a string. `created_at`
 * (TIMESTAMPTZ) still arrives as a Date, which is why the bug hid: the
 * mapper touched created_at first (worked) then date_from (threw).
 *
 * The controller tests use a fake repo, so they never exercised this
 * mapping. These tests drive the REAL repository against a fake `pool`
 * whose rows mimic node-postgres + the DATE parser: date columns as
 * strings, timestamp columns as Date. That's the exact shape that
 * crashed prod.
 */

function fakePool(rowsByCall: Record<string, unknown[]>) {
  return {
    query: async (sql: string) => {
      // Route by a distinctive fragment of each query.
      if (sql.includes("GROUP BY generation_id")) {
        return { rows: rowsByCall.listGenerations ?? [] };
      }
      if (sql.includes("WHERE generation_id = $1")) {
        return { rows: rowsByCall.getGeneration ?? [] };
      }
      return { rows: [] };
    },
  } as never;
}

describe("InsightRepository date mapping (pg DATE-as-string)", () => {
  it("listGenerations maps string DATE columns without throwing", async () => {
    const repo = new InsightRepository(
      fakePool({
        listGenerations: [
          {
            generation_id: "gen-1",
            // TIMESTAMPTZ → Date (as node-postgres returns it)
            created_at: new Date("2026-05-04T18:28:34.528Z"),
            // DATE → string (as the global pg parser returns it). This
            // is the value that used to crash `.toISOString()`.
            date_from: "2026-02-03",
            date_to: "2026-05-04",
            category_count: 6,
          },
        ],
      }),
    );

    const out = await repo.listGenerations();
    expect(out).toHaveLength(1);
    expect(out[0].generationId).toBe("gen-1");
    expect(out[0].dateFrom).toBe("2026-02-03");
    expect(out[0].dateTo).toBe("2026-05-04");
    expect(out[0].createdAt).toBe("2026-05-04T18:28:34.528Z");
    expect(out[0].categoryCount).toBe(6);
  });

  it("getGeneration maps string DATE columns without throwing", async () => {
    const repo = new InsightRepository(
      fakePool({
        getGeneration: [
          {
            id: 1,
            generation_id: "gen-1",
            category: "activity",
            title: "Activity & Movement",
            content: "**Steps**: 8,400/day",
            date_from: "2026-02-03",
            date_to: "2026-05-04",
            created_at: new Date("2026-05-04T18:28:34.528Z"),
          },
        ],
      }),
    );

    const rows = await repo.getGeneration("gen-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].dateFrom).toBe("2026-02-03");
    expect(rows[0].dateTo).toBe("2026-05-04");
    expect(rows[0].createdAt).toBe("2026-05-04T18:28:34.528Z");
    expect(rows[0].content).toBe("**Steps**: 8,400/day");
  });

  it("also tolerates DATE columns that arrive as Date objects", async () => {
    // Defensive: if the parser is ever removed, Date inputs must still
    // map correctly. The mapper handles both.
    const repo = new InsightRepository(
      fakePool({
        listGenerations: [
          {
            generation_id: "gen-2",
            created_at: new Date("2026-05-04T18:28:34.528Z"),
            date_from: new Date("2026-02-03T00:00:00.000Z"),
            date_to: new Date("2026-05-04T00:00:00.000Z"),
            category_count: 6,
          },
        ],
      }),
    );
    const out = await repo.listGenerations();
    expect(out[0].dateFrom).toBe("2026-02-03");
    expect(out[0].dateTo).toBe("2026-05-04");
  });
});
