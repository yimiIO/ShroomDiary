BEGIN;

CREATE TABLE IF NOT EXISTS diary_analysis (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    engine_version varchar(80) NOT NULL,
    five_views jsonb NOT NULL DEFAULT '{}'::jsonb,
    todo_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
    friend_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
    status varchar(16) NOT NULL DEFAULT 'pending',
    error_message text,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, diary_id),
    CONSTRAINT diary_analysis_status_check CHECK (status IN ('pending', 'running', 'done', 'failed'))
);
CREATE INDEX IF NOT EXISTS diary_analysis_user_created_idx
    ON diary_analysis(user_id, created_at DESC);

COMMIT;
