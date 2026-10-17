-- Loop-injected corrective prompts and the rejected drafts they answer are
-- kept for model replay but are not part of the user-visible conversation.
ALTER TABLE universe.health_insight_chat
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
