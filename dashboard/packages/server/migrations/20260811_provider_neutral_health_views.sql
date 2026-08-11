-- Provider-neutral read contract over the legacy physical tables. Google
-- Health currently writes these tables, despite their historical fitbit_*
-- names. Dashboard repositories switch to these views first so a future
-- physical rename can happen without another application-wide query change.
CREATE OR REPLACE VIEW universe.health_activity_daily AS
  SELECT * FROM universe.fitbit_activity_daily;
CREATE OR REPLACE VIEW universe.health_body_weight AS
  SELECT * FROM universe.fitbit_body_weight;
CREATE OR REPLACE VIEW universe.health_breathing_rate_daily AS
  SELECT * FROM universe.fitbit_breathing_rate_daily;
CREATE OR REPLACE VIEW universe.health_cardio_score_daily AS
  SELECT * FROM universe.fitbit_cardio_score_daily;
CREATE OR REPLACE VIEW universe.health_exercise_log AS
  SELECT * FROM universe.fitbit_exercise_log;
CREATE OR REPLACE VIEW universe.health_food_log_daily AS
  SELECT * FROM universe.fitbit_food_log_daily;
CREATE OR REPLACE VIEW universe.health_heart_rate_daily AS
  SELECT * FROM universe.fitbit_heart_rate_daily;
CREATE OR REPLACE VIEW universe.health_hrv_daily AS
  SELECT * FROM universe.fitbit_hrv_daily;
CREATE OR REPLACE VIEW universe.health_skin_temp_daily AS
  SELECT * FROM universe.fitbit_skin_temp_daily;
CREATE OR REPLACE VIEW universe.health_sleep_daily AS
  SELECT * FROM universe.fitbit_sleep_daily;
CREATE OR REPLACE VIEW universe.health_spo2_daily AS
  SELECT * FROM universe.fitbit_spo2_daily;

COMMENT ON VIEW universe.health_activity_daily IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_activity_daily during compatibility window.';
COMMENT ON VIEW universe.health_body_weight IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_body_weight during compatibility window.';
COMMENT ON VIEW universe.health_breathing_rate_daily IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_breathing_rate_daily during compatibility window.';
COMMENT ON VIEW universe.health_cardio_score_daily IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_cardio_score_daily during compatibility window.';
COMMENT ON VIEW universe.health_exercise_log IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_exercise_log during compatibility window.';
COMMENT ON VIEW universe.health_food_log_daily IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_food_log_daily during compatibility window.';
COMMENT ON VIEW universe.health_heart_rate_daily IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_heart_rate_daily during compatibility window.';
COMMENT ON VIEW universe.health_hrv_daily IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_hrv_daily during compatibility window.';
COMMENT ON VIEW universe.health_skin_temp_daily IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_skin_temp_daily during compatibility window.';
COMMENT ON VIEW universe.health_sleep_daily IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_sleep_daily during compatibility window.';
COMMENT ON VIEW universe.health_spo2_daily IS
  'Provider-neutral dashboard read contract; physical storage remains fitbit_spo2_daily during compatibility window.';
