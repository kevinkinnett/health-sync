/**
 * Regenerates `src/__tests__/fixtures/dbSchema.json` — the snapshot the
 * SQL contract test checks repository queries against.
 *
 * CI has no database, so the contract test runs offline against this
 * snapshot. That means the snapshot can drift from reality; refreshing it
 * is a deliberate act, and the diff is the point — if a migration removes
 * a column some repo still selects, this refresh makes the contract test
 * go red, which is exactly the signal we want.
 *
 * Usage (from packages/server, with the repo .env loaded):
 *   set -a && source ../../.env && set +a && pnpm exec tsx scripts/refreshSchemaFixture.ts
 */
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { extractTableRefs, type SchemaFixture } from "../src/db/sqlContract.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoDir = join(here, "..", "src", "repositories");
const outFile = join(here, "..", "src", "__tests__", "fixtures", "dbSchema.json");

function referencedTables(): string[] {
  const tables = new Set<string>();
  for (const f of readdirSync(repoDir).filter((f) => f.endsWith(".ts"))) {
    for (const t of extractTableRefs(readFileSync(join(repoDir, f), "utf8"))) {
      tables.add(t);
    }
  }
  return [...tables].sort();
}

async function main(): Promise<void> {
  const tables = referencedTables();
  console.log(`Repositories reference ${tables.length} tables.`);

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true",
  });

  const { rows } = await pool.query<{ tbl: string; cols: string[] }>(
    `SELECT table_schema || '.' || table_name AS tbl,
            array_agg(column_name ORDER BY column_name) AS cols
       FROM information_schema.columns
      WHERE table_schema || '.' || table_name = ANY($1::text[])
      GROUP BY 1
      ORDER BY 1`,
    [tables],
  );
  await pool.end();

  const fixture: SchemaFixture = {};
  for (const r of rows) fixture[r.tbl] = r.cols;

  const missing = tables.filter((t) => !fixture[t]);
  if (missing.length > 0) {
    console.error(
      `\nERROR: these tables are referenced by repositories but do not ` +
        `exist in the database:\n  ${missing.join("\n  ")}`,
    );
    process.exitCode = 1;
    return;
  }

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(fixture, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(fixture).length} tables to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
