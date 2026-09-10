BEGIN;

ALTER TABLE cards
    ADD COLUMN IF NOT EXISTS legacy_resonance_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS legacy_favorite_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS legacy_quote_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS memory_nodes (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    legacy_id bigint,
    source_type varchar(32) NOT NULL,
    source_id uuid,
    legacy_source_id varchar(128),
    summary varchar(255) NOT NULL DEFAULT '',
    content text,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    emotion_score numeric(10, 4) NOT NULL DEFAULT 0,
    importance_score numeric(10, 4) NOT NULL DEFAULT 0,
    last_viewed_at timestamptz,
    view_count integer NOT NULL DEFAULT 0,
    like_count integer NOT NULL DEFAULT 0,
    skip_count integer NOT NULL DEFAULT 0,
    open_count integer NOT NULL DEFAULT 0,
    source_created_at timestamptz,
    source_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, legacy_id)
);
CREATE INDEX IF NOT EXISTS memory_nodes_user_source_idx
    ON memory_nodes(user_id, source_type, source_created_at DESC);

CREATE TABLE IF NOT EXISTS memory_feedback (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_id uuid NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
    legacy_id bigint,
    action varchar(16) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT memory_feedback_action_check CHECK (action IN ('skip', 'like', 'open')),
    UNIQUE (user_id, legacy_id)
);
CREATE INDEX IF NOT EXISTS memory_feedback_node_user_idx
    ON memory_feedback(node_id, user_id, created_at DESC);

COMMIT;
