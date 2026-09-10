BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    mobile varchar(32) NOT NULL UNIQUE,
    nickname varchar(80) NOT NULL,
    password_hash text NOT NULL,
    avatar_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS media_assets (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_name text NOT NULL UNIQUE,
    original_name text NOT NULL,
    mime_type varchar(120) NOT NULL,
    byte_size integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_user_idx ON media_assets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS diaries (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content text NOT NULL,
    mood varchar(32),
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    images jsonb NOT NULL DEFAULT '[]'::jsonb,
    voice jsonb,
    hour smallint,
    minute smallint,
    entry_type varchar(48) NOT NULL DEFAULT 'default',
    linked_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
    visibility varchar(24) NOT NULL DEFAULT 'PRIVATE',
    occurred_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT diaries_hour_check CHECK (hour IS NULL OR hour BETWEEN 0 AND 23),
    CONSTRAINT diaries_minute_check CHECK (minute IS NULL OR minute BETWEEN 0 AND 59),
    CONSTRAINT diaries_visibility_check CHECK (visibility IN ('PRIVATE', 'PUBLIC_ANON', 'PUBLIC_NAMED'))
);
CREATE INDEX IF NOT EXISTS diaries_user_occurred_idx ON diaries(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS todos (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content text NOT NULL,
    deadline date,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    status varchar(16) NOT NULL DEFAULT 'pending',
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT todos_status_check CHECK (status IN ('pending', 'completed'))
);
CREATE INDEX IF NOT EXISTS todos_user_status_idx ON todos(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS cards (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seed_sentence text NOT NULL,
    my_understanding text NOT NULL DEFAULT '',
    usage_items jsonb NOT NULL DEFAULT '[]'::jsonb,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    visibility varchar(24) NOT NULL DEFAULT 'PRIVATE',
    copied_from_id uuid REFERENCES cards(id) ON DELETE SET NULL,
    last_reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cards_visibility_check CHECK (visibility IN ('PRIVATE', 'PUBLIC_ANON', 'PUBLIC_NAMED'))
);
CREATE INDEX IF NOT EXISTS cards_user_created_idx ON cards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cards_public_created_idx ON cards(visibility, created_at DESC);

CREATE TABLE IF NOT EXISTS card_practices (
    id uuid PRIMARY KEY,
    card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    context text NOT NULL,
    action text NOT NULL,
    feeling text NOT NULL DEFAULT '',
    result text NOT NULL DEFAULT '',
    reflection text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_practices_card_idx ON card_practices(card_id, created_at DESC);

CREATE TABLE IF NOT EXISTS card_resonances (
    card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (card_id, user_id)
);

CREATE TABLE IF NOT EXISTS card_favorites (
    card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (card_id, user_id)
);

COMMIT;
