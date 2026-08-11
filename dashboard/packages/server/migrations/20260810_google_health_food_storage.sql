-- Google Health owns this compatibility table after retirement of the Fitbit
-- food importer. Schema evolution belongs here rather than in every rollup run.
CREATE TABLE IF NOT EXISTS universe.fitbit_food_log_daily (
  date DATE PRIMARY KEY,
  calories_in INTEGER,
  carbs NUMERIC(8,2),
  fat NUMERIC(8,2),
  fiber NUMERIC(8,2),
  protein NUMERIC(8,2),
  sodium NUMERIC(10,2),
  water NUMERIC(10,2),
  calorie_goal INTEGER,
  food_count INTEGER,
  raw_jsonb JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE universe.fitbit_food_log_daily
  ADD COLUMN IF NOT EXISTS sugar NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS saturated_fat NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS cholesterol NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS potassium NUMERIC(10,2);
