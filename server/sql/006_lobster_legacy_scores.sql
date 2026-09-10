BEGIN;

ALTER TABLE friends DROP CONSTRAINT IF EXISTS friends_relation_score_check;
ALTER TABLE friends ADD CONSTRAINT friends_relation_score_check
    CHECK (relation_score BETWEEN -3 AND 10);

ALTER TABLE score_histories DROP CONSTRAINT IF EXISTS score_histories_change_check;
ALTER TABLE score_histories ADD CONSTRAINT score_histories_change_check
    CHECK (change BETWEEN -3 AND 3);

ALTER TABLE friend_milestones ALTER COLUMN milestone_date DROP NOT NULL;
ALTER TABLE friend_milestones ADD COLUMN IF NOT EXISTS raw_date varchar(32);

ALTER TABLE friends
    ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS first_contact date,
    ADD COLUMN IF NOT EXISTS source_id varchar(96),
    ADD COLUMN IF NOT EXISTS source_created_at varchar(40),
    ADD COLUMN IF NOT EXISTS source_updated_at varchar(40);

ALTER TABLE friend_todos
    ADD COLUMN IF NOT EXISTS priority varchar(16),
    ADD COLUMN IF NOT EXISTS completed_at date,
    ADD COLUMN IF NOT EXISTS completion_note text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS source_created_date date;

ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_sentiment_check;
ALTER TABLE interactions ADD CONSTRAINT interactions_sentiment_check
    CHECK (sentiment IN ('positive', 'neutral', 'negative', 'bittersweet'));

ALTER TABLE friend_todos DROP CONSTRAINT IF EXISTS friend_todos_status_check;
ALTER TABLE friend_todos ADD CONSTRAINT friend_todos_status_check
    CHECK (status IN ('pending', 'done', 'completed', 'overdue', 'cancelled', 'created'));

CREATE TABLE IF NOT EXISTS friend_asset_settings (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    source_version varchar(32),
    source_created_at varchar(40),
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
