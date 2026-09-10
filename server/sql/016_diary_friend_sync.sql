BEGIN;

CREATE TABLE IF NOT EXISTS diary_friend_sync (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    source_version integer NOT NULL,
    engine_version varchar(80) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_owner varchar(120),
    lease_expires_at timestamptz,
    extracted_people jsonb NOT NULL DEFAULT '[]'::jsonb,
    friend_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
    applied_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (diary_id, source_version),
    CONSTRAINT diary_friend_sync_status_check
      CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS diary_friend_sync_claim_idx
  ON diary_friend_sync(status, available_at, lease_expires_at, created_at);
CREATE INDEX IF NOT EXISTS diary_friend_sync_user_diary_idx
  ON diary_friend_sync(user_id, diary_id, created_at DESC);

ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_sentiment_check;
ALTER TABLE interactions ADD CONSTRAINT interactions_sentiment_check
  CHECK (sentiment IN ('positive', 'neutral', 'negative', 'bittersweet'));

COMMIT;
