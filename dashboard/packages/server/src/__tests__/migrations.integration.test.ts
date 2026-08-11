import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, readMigrations, runMigrations, type Migration } from "../migrations.js";

const databaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));

describeWithPostgres("database migrations against PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    const { rows } = await pool.query<{ current_database: string }>("SELECT current_database()");
    if (!rows[0]?.current_database.endsWith("_test")) {
      throw new Error("MIGRATION_TEST_DATABASE_URL must point to a dedicated database ending in _test");
    }

    await pool.query("DROP SCHEMA IF EXISTS dossier, medication, supplement, universe CASCADE");
    await pool.query("CREATE SCHEMA universe");
    await pool.query("CREATE TABLE universe.fitbit_ingest_state (id INTEGER PRIMARY KEY)");
    await pool.query("INSERT INTO universe.fitbit_ingest_state (id) VALUES (1)");
    for (const table of [
      "fitbit_activity_daily",
      "fitbit_body_weight",
      "fitbit_breathing_rate_daily",
      "fitbit_cardio_score_daily",
      "fitbit_exercise_log",
      "fitbit_food_log_daily",
      "fitbit_heart_rate_daily",
      "fitbit_hrv_daily",
      "fitbit_skin_temp_daily",
      "fitbit_sleep_daily",
      "fitbit_spo2_daily",
    ]) {
      await pool.query(`CREATE TABLE universe.${table} (id INTEGER PRIMARY KEY)`);
    }
    await pool.query("INSERT INTO universe.fitbit_activity_daily (id) VALUES (42)");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies the production migration set and is idempotent", async () => {
    const migrations = await readMigrations(migrationsDirectory);
    const applied = await runMigrations(pool, migrationsDirectory);

    expect(applied).toEqual(migrations.map(({ name }) => name));
    await expect(pool.query("SELECT id FROM universe.fitbit_ingest_state_retired_20260809"))
      .resolves.toMatchObject({ rows: [{ id: 1 }] });
    await expect(pool.query("SELECT id FROM universe.health_activity_daily"))
      .resolves.toMatchObject({ rows: [{ id: 42 }] });
    const alertColumns = await pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'universe' AND table_name = 'health_alert'
    `);
    expect(alertColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["last_observed_at", "resolved_at", "occurrence_count"]),
    );

    await pool.query(`
      INSERT INTO universe.health_alert (kind, severity, title, detail, metric, date)
      VALUES ('readiness_drop', 'warn', 'First episode', 'detail', 'readiness', CURRENT_DATE)
    `);
    await expect(pool.query(`
      INSERT INTO universe.health_alert (kind, severity, title, detail, metric, date)
      VALUES ('readiness_drop', 'warn', 'Duplicate open episode', 'detail', 'readiness', CURRENT_DATE)
    `)).rejects.toMatchObject({ code: "23505" });

    const migrationRows = await pool.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM universe.schema_migration ORDER BY name",
    );
    expect(migrationRows.rows).toEqual(
      migrations.map(({ name, checksum }) => ({ name, checksum })),
    );

    await expect(runMigrations(pool, migrationsDirectory)).resolves.toEqual([]);
  });

  it("rolls back a failed migration without recording it", async () => {
    const failedMigration: Migration = {
      name: "20990101_intentionally_broken.sql",
      checksum: "integration-test-checksum",
      sql: "CREATE TABLE universe.should_roll_back (id INTEGER); SELECT syntax error",
    };
    const client = await pool.connect();

    try {
      await expect(applyMigrations(client, [failedMigration])).rejects.toThrow();
    } finally {
      client.release();
    }

    const { rows } = await pool.query<{ table_name: string | null; migration_name: string | null }>(`
      SELECT
        to_regclass('universe.should_roll_back')::text AS table_name,
        (SELECT name FROM universe.schema_migration WHERE name = $1) AS migration_name
    `, [failedMigration.name]);
    expect(rows[0]).toEqual({ table_name: null, migration_name: null });
  });
});
