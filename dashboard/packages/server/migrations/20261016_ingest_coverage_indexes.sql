-- The Ingest page polls coverage (MIN/MAX point_date, MAX fetched_at per raw
-- type) every 10s. These indexes turn each aggregate into an index endpoint
-- lookup. The table is created by the Python Google Health ingest, so only
-- index it when it exists; both statements are idempotent.
DO $$
BEGIN
  IF to_regclass('universe.google_health_data_point') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS ix_ghdp_type_point_date
      ON universe.google_health_data_point (data_type, point_date);
    CREATE INDEX IF NOT EXISTS ix_ghdp_type_fetched_at
      ON universe.google_health_data_point (data_type, fetched_at);
  END IF;
END
$$;
