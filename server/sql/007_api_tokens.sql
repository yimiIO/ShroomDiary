BEGIN;

CREATE TABLE IF NOT EXISTS api_tokens (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(80) NOT NULL,
    token_hash char(64) NOT NULL UNIQUE,
    scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
    expires_at timestamptz,
    revoked_at timestamptz,
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, name),
    CONSTRAINT api_tokens_scopes_array_check CHECK (jsonb_typeof(scopes) = 'array')
);

CREATE INDEX IF NOT EXISTS api_tokens_user_active_idx
    ON api_tokens(user_id, created_at DESC)
    WHERE revoked_at IS NULL;

COMMIT;
