-- Retire the state table used by the discontinued Fitbit Web API importer.
--
-- The application no longer reads this table. Rename it instead of dropping
-- it so the 11 historical rows remain recoverable while the active schema and
-- SQL contract stop advertising Fitbit as an ingestion provider.
--
-- Idempotency:
--   * first run renames the active table;
--   * later runs are no-ops when only the retired table exists;
--   * both names existing is treated as an unsafe ambiguous state.

BEGIN;

DO $$
BEGIN
  IF to_regclass('universe.fitbit_ingest_state') IS NOT NULL
     AND to_regclass('universe.fitbit_ingest_state_retired_20260809') IS NOT NULL THEN
    RAISE EXCEPTION
      'Both active and retired Fitbit ingest-state tables exist; refusing automatic migration';
  ELSIF to_regclass('universe.fitbit_ingest_state') IS NOT NULL THEN
    ALTER TABLE universe.fitbit_ingest_state
      RENAME TO fitbit_ingest_state_retired_20260809;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('universe.fitbit_ingest_state_retired_20260809') IS NOT NULL THEN
    COMMENT ON TABLE universe.fitbit_ingest_state_retired_20260809 IS
      'Read-only archive of the retired Fitbit Web API ingest state; replaced by Google Health raw-point coverage on 2026-08-09.';
  END IF;
END
$$;

COMMIT;
