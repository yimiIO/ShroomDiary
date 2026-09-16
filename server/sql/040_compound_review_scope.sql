BEGIN;

ALTER TABLE compound_reviews
  ADD COLUMN IF NOT EXISTS thread_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'compound_reviews_thread_owner_fk'
  ) THEN
    ALTER TABLE compound_reviews
      ADD CONSTRAINT compound_reviews_thread_owner_fk
      FOREIGN KEY (thread_id, user_id)
      REFERENCES compound_threads(id, user_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS compound_reviews_thread_scope_idx
  ON compound_reviews(user_id, thread_id, scope_end DESC, created_at DESC);

DROP INDEX IF EXISTS compound_reviews_one_draft_idx;
CREATE UNIQUE INDEX IF NOT EXISTS compound_reviews_one_global_draft_idx
  ON compound_reviews(user_id)
  WHERE status = 'DRAFT' AND thread_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS compound_reviews_one_thread_draft_idx
  ON compound_reviews(user_id, thread_id)
  WHERE status = 'DRAFT' AND thread_id IS NOT NULL;

COMMIT;

