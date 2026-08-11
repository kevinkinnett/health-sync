import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allowedColumns,
  extractColumnRefs,
  extractTableRefs,
  type SchemaFixture,
} from "../db/sqlContract.js";
import fixture from "./fixtures/dbSchema.json" with { type: "json" };

/**
 * Contract test: every table and column a repository's SQL references
 * must exist in the real database.
 *
 * WHY: `/api/insights/list` once 500'd in production because the repo's
 * SQL and the schema disagreed, and nothing caught it — the controller
 * tests use fake repos, and `insightRepo.test.ts` drives the real repo
 * against a FAKE POOL, which validates the row mapper but never the SQL
 * itself. A misspelled column typechecks, passes all 458 tests, and then
 * 500s for a user.
 *
 * HOW, given CI has no database: the schema is snapshotted into
 * `fixtures/dbSchema.json` by `scripts/refreshSchemaFixture.ts`, and this
 * runs offline against that snapshot. The snapshot can drift, and that is
 * the feature — if a migration drops a column a repo still selects, this
 * goes red on the next refresh.
 *
 * The extractor is deliberately conservative (see db/sqlContract.ts): it
 * skips expressions, `SELECT *`, casts and aliases, checking only
 * unambiguous bare column references. It is designed to miss things
 * rather than to cry wolf.
 */

const schema = fixture as SchemaFixture;
const repoDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "repositories",
);

const repoFiles = readdirSync(repoDir)
  .filter((f) => f.endsWith(".ts") && f !== "mappers.ts")
  .map((f) => ({ name: f, sql: readFileSync(join(repoDir, f), "utf8") }))
  .filter((f) => extractTableRefs(f.sql).length > 0);

describe("SQL ↔ schema contract", () => {
  it("finds repositories to check (guards against the glob silently breaking)", () => {
    expect(repoFiles.length).toBeGreaterThanOrEqual(15);
  });

  it("every table in the snapshot is still referenced by some repository", () => {
    // Catches the reverse drift: a table left in the fixture after the
    // last repo that used it was deleted. Keeps the snapshot honest.
    const referenced = new Set(
      repoFiles.flatMap((f) => extractTableRefs(f.sql)),
    );
    const orphaned = Object.keys(schema).filter((t) => !referenced.has(t));
    expect(orphaned).toEqual([]);
  });

  describe.each(repoFiles.map((f) => [f.name, f.sql] as const))(
    "%s",
    (_name, sql) => {
      const tables = extractTableRefs(sql);

      it("references only tables that exist", () => {
        const unknown = tables.filter((t) => !(t in schema));
        expect(unknown).toEqual([]);
      });

      it("references only columns that exist on those tables", () => {
        const allowed = allowedColumns(tables, schema);
        const unknown = extractColumnRefs(sql).filter((c) => !allowed.has(c));
        expect(unknown).toEqual([]);
      });
    },
  );
});

describe("sqlContract extractor", () => {
  // The extractor is the thing standing between us and a false sense of
  // safety, so pin its behaviour directly.

  it("extracts tables from FROM / JOIN / INSERT INTO / UPDATE", () => {
    const sql = `
      SELECT a FROM universe.one
      JOIN universe.two ON x
      INSERT INTO universe.three (a) VALUES ($1)
      UPDATE universe.four SET a = 1`;
    expect(extractTableRefs(sql).sort()).toEqual([
      "universe.four",
      "universe.one",
      "universe.three",
      "universe.two",
    ]);
  });

  it("extracts a plain select list", () => {
    expect(
      extractColumnRefs("SELECT date, calories_in, carbs FROM universe.t").sort(),
    ).toEqual(["calories_in", "carbs", "date"]);
  });

  it("would catch a misspelled column (the bug this exists for)", () => {
    const cols = extractColumnRefs(
      "SELECT date, saturated_fatt FROM universe.health_food_log_daily",
    );
    const allowed = allowedColumns(["universe.health_food_log_daily"], schema);
    expect(cols.filter((c) => !allowed.has(c))).toEqual(["saturated_fatt"]);
  });

  it("strips a table qualifier", () => {
    expect(extractColumnRefs("SELECT i.name, s.amount FROM a.b").sort()).toEqual(
      ["amount", "name"],
    );
  });

  it("skips expressions, casts and star selects (no false positives)", () => {
    expect(
      extractColumnRefs(
        "SELECT COUNT(*) AS n, (a + b) AS total, x::text FROM a.b",
      ),
    ).toEqual([]);
    expect(extractColumnRefs("SELECT * FROM a.b")).toEqual([]);
  });

  it("does not treat an alias as a column", () => {
    expect(extractColumnRefs("SELECT foo AS bar FROM a.b")).toEqual(["foo"]);
  });

  it("checks INSERT column lists", () => {
    expect(
      extractColumnRefs(
        "INSERT INTO universe.t (date, steps) VALUES ($1, $2)",
      ).sort(),
    ).toEqual(["date", "steps"]);
  });
});
