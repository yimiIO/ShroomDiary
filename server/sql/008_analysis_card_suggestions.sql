BEGIN;

ALTER TABLE diary_analysis
  ADD COLUMN IF NOT EXISTS card_suggestion jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS source_diary_id uuid REFERENCES diaries(id) ON DELETE SET NULL;

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS source_analysis_id uuid REFERENCES diary_analysis(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cards_source_diary_unique
  ON cards(user_id, source_diary_id)
  WHERE source_diary_id IS NOT NULL;

COMMIT;
