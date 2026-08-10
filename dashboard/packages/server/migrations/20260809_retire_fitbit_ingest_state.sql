-- Preserve historical state while removing the retired Fitbit Web API table
-- from the active schema contract.
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
