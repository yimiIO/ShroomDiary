BEGIN;

CREATE TABLE IF NOT EXISTS analysis_experience_settings (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    version varchar(16) NOT NULL DEFAULT 'A1',
    can_switch boolean NOT NULL DEFAULT false,
    trial_started_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT analysis_experience_settings_version_check CHECK (version IN ('A1', 'A1.1'))
);

CREATE TABLE IF NOT EXISTS analysis_insight_feedback (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_id uuid NOT NULL REFERENCES diary_analysis(id) ON DELETE CASCADE,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    insight_key varchar(64) NOT NULL,
    observer_id uuid REFERENCES ai_observers(id) ON DELETE SET NULL,
    observer_preset varchar(48) NOT NULL DEFAULT 'custom',
    action varchar(16) NOT NULL,
    note text NOT NULL DEFAULT '',
    insight_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, analysis_id, insight_key),
    CONSTRAINT analysis_insight_feedback_action_check CHECK (action IN ('HELPFUL', 'WRONG', 'WATCH'))
);

CREATE INDEX IF NOT EXISTS analysis_insight_feedback_user_updated_idx
    ON analysis_insight_feedback(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS analysis_insight_feedback_analysis_idx
    ON analysis_insight_feedback(user_id, analysis_id);

COMMIT;
