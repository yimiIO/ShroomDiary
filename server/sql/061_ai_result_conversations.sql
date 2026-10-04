BEGIN;

ALTER TABLE diary_analysis
  ADD COLUMN IF NOT EXISTS ai_context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE daily_reviews
  ADD COLUMN IF NOT EXISTS ai_context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE inquiry_syntheses
  ADD COLUMN IF NOT EXISTS ai_context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE reflection_conversations
  ADD COLUMN IF NOT EXISTS origin_type varchar(48),
  ADD COLUMN IF NOT EXISTS origin_id varchar(160),
  ADD COLUMN IF NOT EXISTS origin_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS origin_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS conversation_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reflection_conversations_origin_check'
  ) THEN
    ALTER TABLE reflection_conversations
      ADD CONSTRAINT reflection_conversations_origin_check CHECK (
        (origin_type IS NULL AND origin_id IS NULL)
        OR (origin_type IN ('DIARY_ANALYSIS', 'DAILY_REVIEW', 'INQUIRY_SYNTHESIS') AND origin_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS reflection_conversations_origin_unique
  ON reflection_conversations(user_id, origin_type, origin_id, origin_version)
  WHERE origin_type IS NOT NULL;

COMMIT;
