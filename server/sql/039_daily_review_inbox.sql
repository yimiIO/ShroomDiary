BEGIN;

ALTER TABLE daily_review_preferences
  ADD COLUMN IF NOT EXISTS inbox_enabled boolean NOT NULL DEFAULT true;

INSERT INTO daily_review_preferences (user_id, inbox_enabled)
SELECT id, true FROM users
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE daily_reviews
  DROP CONSTRAINT IF EXISTS daily_reviews_generated_by_check;
ALTER TABLE daily_reviews
  ADD CONSTRAINT daily_reviews_generated_by_check
  CHECK (generated_by IN ('USER', 'EMAIL', 'INBOX'));

COMMIT;
