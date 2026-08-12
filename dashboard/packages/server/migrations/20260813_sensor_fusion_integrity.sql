-- Repair historical multi-session Eight Sleep rows, establish main-sleep
-- semantics for Google Health, and add the closer overnight-HR observation.

ALTER TABLE universe.fitbit_sleep_daily
  ADD COLUMN IF NOT EXISTS nap_minutes_asleep INTEGER;

ALTER TABLE universe.fitbit_hrv_daily
  ADD COLUMN IF NOT EXISTS non_rem_heart_rate NUMERIC(6,2);

-- Older Google sample-mean HRV rows predate explicit regime metadata.
UPDATE universe.fitbit_hrv_daily
SET raw_jsonb = COALESCE(raw_jsonb, '{}'::jsonb)
                || '{"method":"sample_mean_v1"}'::jsonb
WHERE raw_jsonb->>'_src' = 'google_health'
  AND NOT raw_jsonb ? 'method';

-- Eight Sleep's trends response is ordered chronologically, so the last
-- session is often a nap. Repair every stored row from its retained raw day.
WITH selected AS (
  SELECT e.date, e.side, chosen.session
  FROM universe.eight_sleep_session e
  CROSS JOIN LATERAL (
    SELECT candidate.session
    FROM jsonb_array_elements(e.raw_jsonb->'sessions') candidate(session)
    ORDER BY
      CASE WHEN candidate.session->>'id' = e.raw_jsonb->>'mainSessionId' THEN 0 ELSE 1 END,
      COALESCE((candidate.session->'stageSummary'->>'sleepDuration')::numeric, 0) DESC
    LIMIT 1
  ) chosen
), repaired AS (
  SELECT s.date, s.side, s.session,
    (SELECT avg((v->>1)::numeric) FROM jsonb_array_elements(s.session->'timeseries'->'heartRate') v) AS avg_hr,
    (SELECT min((v->>1)::numeric) FROM jsonb_array_elements(s.session->'timeseries'->'heartRate') v) AS min_hr,
    (SELECT max((v->>1)::numeric) FROM jsonb_array_elements(s.session->'timeseries'->'heartRate') v) AS max_hr,
    (SELECT avg((v->>1)::numeric) FROM jsonb_array_elements(s.session->'timeseries'->'rmssd') v) AS avg_hrv,
    (SELECT avg((v->>1)::numeric) FROM jsonb_array_elements(s.session->'timeseries'->'respiratoryRate') v) AS avg_breath,
    (SELECT avg((v->>1)::numeric) FROM jsonb_array_elements(s.session->'timeseries'->'tempBedC') v) AS avg_bed,
    (SELECT avg((v->>1)::numeric) FROM jsonb_array_elements(s.session->'timeseries'->'tempRoomC') v) AS avg_room
  FROM selected s
)
UPDATE universe.eight_sleep_session e
SET session_id = r.session->>'id',
    sleep_start = COALESCE((r.session->>'sleepStart')::timestamptz, e.sleep_start),
    sleep_end = COALESCE((r.session->>'sleepEnd')::timestamptz, e.sleep_end),
    presence_start = COALESCE((r.session->>'presenceStart')::timestamptz, e.presence_start),
    presence_end = COALESCE((r.session->>'presenceEnd')::timestamptz, e.presence_end),
    avg_heart_rate = r.avg_hr,
    min_heart_rate = r.min_hr,
    max_heart_rate = r.max_hr,
    avg_hrv_rmssd = r.avg_hrv,
    avg_respiratory_rate = r.avg_breath,
    avg_bed_temp_c = r.avg_bed,
    avg_room_temp_c = r.avg_room,
    fetched_at = NOW()
FROM repaired r
WHERE e.date = r.date AND e.side = r.side;

-- Rebuild Google sleep rows using the local wake date. The per-record UTC
-- offset comes from Google and therefore handles EST/EDT transitions.
CREATE TEMP TABLE sensor_fusion_google_sleep_repair ON COMMIT DROP AS
WITH sessions AS (
  SELECT
    ((p.value_jsonb->'sleep'->'interval'->>'endTime')::timestamptz
       + trim(trailing 's' FROM COALESCE(
           p.value_jsonb->'sleep'->'interval'->>'endUtcOffset', '0s'
         ))::double precision * interval '1 second')::date AS wake_date,
    COALESCE((p.value_jsonb->'sleep'->'summary'->>'minutesAsleep')::integer, 0) AS asleep,
    COALESCE((p.value_jsonb->'sleep'->'summary'->>'minutesInSleepPeriod')::integer, 0) AS in_bed,
    p.value_jsonb->'sleep'->'summary' AS summary,
    p.value_jsonb->'sleep'->'interval' AS sleep_interval
  FROM universe.google_health_data_point p
  WHERE p.data_type = 'sleep' AND p.source_platform = 'FITBIT'
    AND p.value_jsonb->'sleep'->'interval'->>'endTime' IS NOT NULL
), ranked AS (
  SELECT s.*,
    row_number() OVER (
      PARTITION BY wake_date
      ORDER BY asleep DESC, in_bed DESC, sleep_interval->>'endTime' DESC
    ) AS rank,
    count(*) OVER (PARTITION BY wake_date) AS records,
    sum(asleep) OVER (PARTITION BY wake_date) AS all_asleep
  FROM sessions s
)
SELECT wake_date AS date,
       asleep AS total_minutes_asleep,
       in_bed AS total_minutes_in_bed,
       records::integer AS total_sleep_records,
       GREATEST(0, all_asleep - asleep)::integer AS nap_minutes_asleep,
       (SELECT (stage->>'minutes')::integer
          FROM jsonb_array_elements(summary->'stagesSummary') stage
         WHERE stage->>'type'='DEEP' LIMIT 1) AS minutes_deep,
       (SELECT (stage->>'minutes')::integer
          FROM jsonb_array_elements(summary->'stagesSummary') stage
         WHERE stage->>'type'='LIGHT' LIMIT 1) AS minutes_light,
       (SELECT (stage->>'minutes')::integer
          FROM jsonb_array_elements(summary->'stagesSummary') stage
         WHERE stage->>'type'='REM' LIMIT 1) AS minutes_rem,
       (SELECT (stage->>'minutes')::integer
          FROM jsonb_array_elements(summary->'stagesSummary') stage
         WHERE stage->>'type'='AWAKE' LIMIT 1) AS minutes_wake,
       CASE WHEN in_bed > 0 THEN round(asleep * 100.0 / in_bed)::integer END AS efficiency,
       (sleep_interval->>'startTime')::timestamptz AS main_sleep_start_time,
       (sleep_interval->>'endTime')::timestamptz AS main_sleep_end_time
FROM ranked
WHERE rank = 1;

DELETE FROM universe.fitbit_sleep_daily d
USING (
  SELECT min(date) AS first_date, max(date) AS last_date
  FROM sensor_fusion_google_sleep_repair
) bounds
WHERE d.raw_jsonb->>'_src' = 'google_health'
  AND d.date BETWEEN bounds.first_date AND bounds.last_date;

INSERT INTO universe.fitbit_sleep_daily (
  date, total_minutes_asleep, total_minutes_in_bed, total_sleep_records,
  nap_minutes_asleep, minutes_deep, minutes_light, minutes_rem, minutes_wake,
  efficiency, main_sleep_start_time, main_sleep_end_time, raw_jsonb, fetched_at
)
SELECT date, total_minutes_asleep, total_minutes_in_bed, total_sleep_records,
       nap_minutes_asleep, minutes_deep, minutes_light, minutes_rem, minutes_wake,
       efficiency, main_sleep_start_time, main_sleep_end_time,
       '{"_src":"google_health","method":"main_sleep_v2"}'::jsonb, NOW()
FROM sensor_fusion_google_sleep_repair
ON CONFLICT (date) DO UPDATE SET
  total_minutes_asleep=EXCLUDED.total_minutes_asleep,
  total_minutes_in_bed=EXCLUDED.total_minutes_in_bed,
  total_sleep_records=EXCLUDED.total_sleep_records,
  nap_minutes_asleep=EXCLUDED.nap_minutes_asleep,
  minutes_deep=EXCLUDED.minutes_deep,
  minutes_light=EXCLUDED.minutes_light,
  minutes_rem=EXCLUDED.minutes_rem,
  minutes_wake=EXCLUDED.minutes_wake,
  efficiency=EXCLUDED.efficiency,
  main_sleep_start_time=EXCLUDED.main_sleep_start_time,
  main_sleep_end_time=EXCLUDED.main_sleep_end_time,
  raw_jsonb=EXCLUDED.raw_jsonb,
  fetched_at=NOW();

-- SELECT * views expand their columns at creation time.
CREATE OR REPLACE VIEW universe.health_sleep_daily AS
  SELECT * FROM universe.fitbit_sleep_daily;
CREATE OR REPLACE VIEW universe.health_hrv_daily AS
  SELECT * FROM universe.fitbit_hrv_daily;

COMMENT ON COLUMN universe.fitbit_sleep_daily.total_minutes_asleep IS
  'Main overnight session only; naps are stored separately in nap_minutes_asleep.';
COMMENT ON COLUMN universe.fitbit_sleep_daily.nap_minutes_asleep IS
  'Sleep minutes outside the main overnight session on the same local wake date.';
COMMENT ON COLUMN universe.fitbit_hrv_daily.non_rem_heart_rate IS
  'Google Health native daily-HRV non-REM heart rate; closer to overnight HR than all-day resting HR.';
