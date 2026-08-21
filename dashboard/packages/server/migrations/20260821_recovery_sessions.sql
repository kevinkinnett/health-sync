CREATE SCHEMA IF NOT EXISTS recovery;

CREATE TABLE IF NOT EXISTS recovery.activity (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('heat_therapy', 'massage', 'other')),
  default_duration_minutes INTEGER CHECK (default_duration_minutes > 0),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_recovery_activity_active
  ON recovery.activity (is_active, name);

CREATE TABLE IF NOT EXISTS recovery.session (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  activity_id BIGINT NOT NULL REFERENCES recovery.activity(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  intensity SMALLINT CHECK (intensity BETWEEN 1 AND 5),
  temperature_f NUMERIC(5,1) CHECK (temperature_f > 0),
  massage_type TEXT,
  notes TEXT,
  source TEXT NOT NULL CHECK (source IN ('manual', 'ai_chat')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_recovery_session_started_at
  ON recovery.session (started_at DESC);
CREATE INDEX IF NOT EXISTS ix_recovery_session_activity_time
  ON recovery.session (activity_id, started_at DESC);

CREATE TABLE IF NOT EXISTS recovery.pending_action (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  session_id BIGINT REFERENCES recovery.session(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_recovery_pending_conversation
  ON recovery.pending_action (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_recovery_pending_expiry
  ON recovery.pending_action (status, expires_at);

INSERT INTO recovery.activity (code, name, category)
VALUES
  ('hot_blanket', 'Hot blanket', 'heat_therapy'),
  ('massage', 'Massage', 'massage')
ON CONFLICT (code) DO NOTHING;
