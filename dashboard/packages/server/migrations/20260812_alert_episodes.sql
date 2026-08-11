ALTER TABLE universe.health_alert
  ADD COLUMN IF NOT EXISTS last_observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS occurrence_count INTEGER;

UPDATE universe.health_alert
SET last_observed_at = COALESCE(last_observed_at, created_at),
    occurrence_count = COALESCE(occurrence_count, 1)
WHERE last_observed_at IS NULL OR occurrence_count IS NULL;

ALTER TABLE universe.health_alert
  ALTER COLUMN last_observed_at SET DEFAULT NOW(),
  ALTER COLUMN last_observed_at SET NOT NULL,
  ALTER COLUMN occurrence_count SET DEFAULT 1,
  ALTER COLUMN occurrence_count SET NOT NULL;

ALTER TABLE universe.health_alert
  ADD CONSTRAINT health_alert_occurrence_count_positive
  CHECK (occurrence_count > 0);

-- Convert the former cooldown event stream into episodes. Each earlier row is
-- resolved when the next row of the same kind began; only the newest episode
-- remains open. Historical rows are acknowledged during this one-time backfill
-- so they no longer inflate the notification badge after deployment.
WITH ordered AS (
  SELECT id,
         LEAD(created_at) OVER (PARTITION BY kind ORDER BY created_at, id) AS next_created_at
  FROM universe.health_alert
)
UPDATE universe.health_alert alert
SET resolved_at = ordered.next_created_at,
    read_at = COALESCE(alert.read_at, ordered.next_created_at)
FROM ordered
WHERE alert.id = ordered.id
  AND ordered.next_created_at IS NOT NULL
  AND alert.resolved_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_health_alert_open_kind
  ON universe.health_alert (kind)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_health_alert_open_created
  ON universe.health_alert (created_at DESC)
  WHERE resolved_at IS NULL;
