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
      "fitbit_heart_rate_daily",
      "fitbit_hrv_daily",
      "fitbit_skin_temp_daily",
      "fitbit_sleep_daily",
      "fitbit_spo2_daily",
    ]) {
      await pool.query(`CREATE TABLE universe.${table} (id INTEGER PRIMARY KEY)`);
    }
    // Provider rollup tables predate this repository's migration runner in
    // production. Model the columns consumed by later data-repair migrations,
    // while retaining the generic `id` used by the view smoke checks above.
    await pool.query(`
      ALTER TABLE universe.fitbit_sleep_daily
        DROP COLUMN id,
        ADD COLUMN date DATE UNIQUE,
        ADD COLUMN total_minutes_asleep INTEGER,
        ADD COLUMN total_minutes_in_bed INTEGER,
        ADD COLUMN total_sleep_records INTEGER,
        ADD COLUMN minutes_deep INTEGER,
        ADD COLUMN minutes_light INTEGER,
        ADD COLUMN minutes_rem INTEGER,
        ADD COLUMN minutes_wake INTEGER,
        ADD COLUMN efficiency INTEGER,
        ADD COLUMN main_sleep_start_time TIMESTAMPTZ,
        ADD COLUMN main_sleep_end_time TIMESTAMPTZ,
        ADD COLUMN raw_jsonb JSONB,
        ADD COLUMN fetched_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE universe.fitbit_hrv_daily
        DROP COLUMN id,
        ADD COLUMN date DATE UNIQUE,
        ADD COLUMN daily_rmssd NUMERIC,
        ADD COLUMN deep_rmssd NUMERIC,
        ADD COLUMN raw_jsonb JSONB,
        ADD COLUMN fetched_at TIMESTAMPTZ DEFAULT NOW();
      CREATE TABLE universe.google_health_data_point (
        data_type TEXT NOT NULL,
        source_platform TEXT NOT NULL,
        value_jsonb JSONB NOT NULL
      );
      CREATE TABLE universe.eight_sleep_session (
        date DATE NOT NULL,
        side TEXT NOT NULL,
        session_id TEXT,
        sleep_start TIMESTAMPTZ,
        sleep_end TIMESTAMPTZ,
        presence_start TIMESTAMPTZ,
        presence_end TIMESTAMPTZ,
        avg_heart_rate NUMERIC,
        min_heart_rate NUMERIC,
        max_heart_rate NUMERIC,
        avg_hrv_rmssd NUMERIC,
        avg_respiratory_rate NUMERIC,
        avg_bed_temp_c NUMERIC,
        avg_room_temp_c NUMERIC,
        raw_jsonb JSONB NOT NULL,
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (date, side)
      );
    `);
    await pool.query("INSERT INTO universe.fitbit_activity_daily (id) VALUES (42)");
    await pool.query(`
      INSERT INTO universe.fitbit_hrv_daily (date, daily_rmssd, raw_jsonb)
      VALUES ('2026-08-12', 42, '{"_src":"google_health"}'::jsonb)
    `);
    await pool.query(`
      INSERT INTO universe.eight_sleep_session (date, side, raw_jsonb)
      VALUES ('2026-08-12', 'main', $1::jsonb)
    `, [JSON.stringify({
      mainSessionId: "overnight",
      sessions: [
        {
          id: "overnight",
          sleepStart: "2026-08-12T03:00:00Z",
          sleepEnd: "2026-08-12T11:00:00Z",
          stageSummary: { sleepDuration: 25_200 },
          timeseries: {
            heartRate: [[1, 59], [2, 61]],
            rmssd: [[1, 45], [2, 47]],
            respiratoryRate: [[1, 14], [2, 15]],
          },
        },
        {
          id: "later-nap",
          stageSummary: { sleepDuration: 1_800 },
          timeseries: { heartRate: [[1, 82]], rmssd: [[1, 20]] },
        },
      ],
    })]);
    const sleepPoint = (
      minutesAsleep: number,
      startTime: string,
      endTime: string,
    ) => JSON.stringify({ sleep: {
      interval: { startTime, endTime, endUtcOffset: "-14400s" },
      summary: {
        minutesAsleep,
        minutesInSleepPeriod: minutesAsleep + 30,
        stagesSummary: [
          { type: "DEEP", minutes: Math.round(minutesAsleep * 0.2) },
          { type: "LIGHT", minutes: Math.round(minutesAsleep * 0.5) },
          { type: "REM", minutes: Math.round(minutesAsleep * 0.2) },
          { type: "AWAKE", minutes: 30 },
        ],
      },
    } });
    await pool.query(`
      INSERT INTO universe.google_health_data_point
        (data_type, source_platform, value_jsonb)
      VALUES ('sleep', 'FITBIT', $1::jsonb), ('sleep', 'FITBIT', $2::jsonb)
    `, [
      sleepPoint(420, "2026-08-12T03:00:00Z", "2026-08-12T11:00:00Z"),
      sleepPoint(30, "2026-08-12T18:00:00Z", "2026-08-12T18:45:00Z"),
    ]);
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
    const foodColumns = await pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'universe' AND table_name = 'fitbit_food_log_daily'
    `);
    expect(foodColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        "date",
        "protein",
        "fiber",
        "sugar",
        "saturated_fat",
        "cholesterol",
        "potassium",
      ]),
    );
    const alertColumns = await pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'universe' AND table_name = 'health_alert'
    `);
    expect(alertColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["last_observed_at", "resolved_at", "occurrence_count"]),
    );
    await expect(pool.query(`
      SELECT total_minutes_asleep, nap_minutes_asleep, total_sleep_records,
             raw_jsonb->>'method' AS method
      FROM universe.fitbit_sleep_daily WHERE date = '2026-08-12'
    `)).resolves.toMatchObject({
      rows: [{
        total_minutes_asleep: 420,
        nap_minutes_asleep: 30,
        total_sleep_records: 2,
        method: "main_sleep_v2",
      }],
    });
    await expect(pool.query(`
      SELECT session_id, avg_heart_rate::float AS avg_heart_rate,
             avg_hrv_rmssd::float AS avg_hrv_rmssd
      FROM universe.eight_sleep_session WHERE date = '2026-08-12'
    `)).resolves.toMatchObject({
      rows: [{ session_id: "overnight", avg_heart_rate: 60, avg_hrv_rmssd: 46 }],
    });
    await expect(pool.query(`
      SELECT raw_jsonb->>'method' AS method
      FROM universe.fitbit_hrv_daily WHERE date = '2026-08-12'
    `)).resolves.toMatchObject({ rows: [{ method: "sample_mean_v1" }] });

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
