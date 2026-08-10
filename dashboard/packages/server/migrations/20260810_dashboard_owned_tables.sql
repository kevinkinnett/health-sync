CREATE SCHEMA IF NOT EXISTS supplement;
CREATE SCHEMA IF NOT EXISTS medication;
CREATE SCHEMA IF NOT EXISTS dossier;

CREATE TABLE IF NOT EXISTS supplement.item (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL, brand TEXT, form TEXT, default_amount NUMERIC(10,3),
  default_unit TEXT NOT NULL, notes TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_supplement_item_active ON supplement.item (is_active, name);
CREATE TABLE IF NOT EXISTS supplement.intake (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES supplement.item(id) ON DELETE RESTRICT,
  taken_at TIMESTAMPTZ NOT NULL, amount NUMERIC(10,3) NOT NULL, unit TEXT NOT NULL,
  notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_supplement_intake_taken_at ON supplement.intake (taken_at DESC);
CREATE INDEX IF NOT EXISTS ix_supplement_intake_item_time ON supplement.intake (item_id, taken_at DESC);
CREATE TABLE IF NOT EXISTS supplement.ingredient (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplement_ingredient_lower_name ON supplement.ingredient (LOWER(name));
CREATE TABLE IF NOT EXISTS supplement.item_ingredient (
  item_id BIGINT NOT NULL REFERENCES supplement.item(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES supplement.ingredient(id) ON DELETE RESTRICT,
  amount NUMERIC(10,3) NOT NULL, unit TEXT NOT NULL, sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS ix_supplement_item_ingredient_ingredient ON supplement.item_ingredient (ingredient_id);
CREATE TABLE IF NOT EXISTS supplement.intake_ingredient (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intake_id BIGINT NOT NULL REFERENCES supplement.intake(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES supplement.ingredient(id) ON DELETE RESTRICT,
  ingredient_name TEXT NOT NULL, amount NUMERIC(10,3) NOT NULL, unit TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_supplement_intake_ingredient_intake ON supplement.intake_ingredient (intake_id);
CREATE INDEX IF NOT EXISTS ix_supplement_intake_ingredient_ingredient ON supplement.intake_ingredient (ingredient_id);

CREATE TABLE IF NOT EXISTS medication.item (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL, brand TEXT, form TEXT, default_amount NUMERIC(10,3),
  default_unit TEXT NOT NULL, notes TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_medication_item_active ON medication.item (is_active, name);
CREATE TABLE IF NOT EXISTS medication.intake (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES medication.item(id) ON DELETE RESTRICT,
  taken_at TIMESTAMPTZ NOT NULL, amount NUMERIC(10,3) NOT NULL, unit TEXT NOT NULL,
  notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_medication_intake_taken_at ON medication.intake (taken_at DESC);
CREATE INDEX IF NOT EXISTS ix_medication_intake_item_time ON medication.intake (item_id, taken_at DESC);

CREATE TABLE IF NOT EXISTS dossier.entry (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_type TEXT NOT NULL CHECK (item_type IN ('supplement', 'medication')),
  item_id BIGINT NOT NULL, item_name TEXT NOT NULL, item_brand TEXT, item_form TEXT,
  content JSONB NOT NULL, model TEXT NOT NULL, input_tokens INT, output_tokens INT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (item_type, item_id)
);
CREATE INDEX IF NOT EXISTS ix_dossier_entry_type_id ON dossier.entry (item_type, item_id);
CREATE TABLE IF NOT EXISTS dossier.llm_usage (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, task TEXT NOT NULL,
  item_type TEXT, item_id BIGINT, requested_model TEXT NOT NULL, actual_model TEXT,
  prompt_tokens INT, completion_tokens INT, reasoning_tokens INT,
  duration_ms INT NOT NULL, status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_dossier_llm_usage_created ON dossier.llm_usage (created_at DESC);

CREATE TABLE IF NOT EXISTS universe.api_log (
  id SERIAL PRIMARY KEY, caller TEXT, method TEXT NOT NULL, path TEXT NOT NULL,
  status_code INTEGER NOT NULL, duration_ms INTEGER NOT NULL, request_params JSONB,
  error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_log_created ON universe.api_log (created_at DESC);
CREATE TABLE IF NOT EXISTS universe.health_insight (
  id SERIAL PRIMARY KEY, generation_id UUID NOT NULL, category TEXT NOT NULL,
  title TEXT NOT NULL, content TEXT NOT NULL, date_from DATE NOT NULL, date_to DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_health_insight_generation ON universe.health_insight (generation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_health_insight_created ON universe.health_insight (created_at DESC);
CREATE TABLE IF NOT EXISTS universe.health_insight_chat (
  id SERIAL PRIMARY KEY, conversation_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')), content TEXT,
  tool_calls JSONB, tool_call_id TEXT, tool_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_health_insight_chat_conv ON universe.health_insight_chat (conversation_id, id);
CREATE TABLE IF NOT EXISTS universe.health_alert (
  id SERIAL PRIMARY KEY, kind TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL,
  detail TEXT NOT NULL, metric TEXT, date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_health_alert_created ON universe.health_alert (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_alert_kind_date ON universe.health_alert (kind, date DESC);
CREATE TABLE IF NOT EXISTS universe.app_setting (
  key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS universe.intervention (
  id SERIAL PRIMARY KEY, kind TEXT NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL,
  started_on DATE NOT NULL, ended_on DATE, source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT, detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_intervention_source_ref ON universe.intervention (source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_intervention_started ON universe.intervention (started_on DESC);
