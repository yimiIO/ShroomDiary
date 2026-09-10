BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS corpus_revision bigint NOT NULL DEFAULT 0;

ALTER TABLE diaries
  ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS index_epoch integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ai_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS diaries_user_active_occurred_idx
  ON diaries(user_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS diaries_content_trgm_idx
  ON diaries USING gin (content gin_trgm_ops) WHERE deleted_at IS NULL AND ai_allowed;

CREATE TABLE IF NOT EXISTS embedding_profiles (
    id varchar(96) PRIMARY KEY,
    provider varchar(48) NOT NULL,
    model varchar(160) NOT NULL,
    dimension integer NOT NULL,
    preprocessing_version varchar(80) NOT NULL,
    chunker_version varchar(80) NOT NULL,
    active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT embedding_profiles_dimension_check CHECK (dimension > 0 AND dimension <= 4096)
);
CREATE UNIQUE INDEX IF NOT EXISTS embedding_profiles_one_active_idx
  ON embedding_profiles(active) WHERE active;

CREATE TABLE IF NOT EXISTS diary_index_tasks (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    source_version integer NOT NULL,
    index_epoch integer NOT NULL,
    embedding_profile_id varchar(96) REFERENCES embedding_profiles(id),
    status varchar(20) NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_owner varchar(120),
    lease_expires_at timestamptz,
    error_code varchar(80),
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (diary_id, source_version, index_epoch, embedding_profile_id),
    CONSTRAINT diary_index_tasks_status_check
      CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS diary_index_tasks_claim_idx
  ON diary_index_tasks(status, available_at, lease_expires_at, created_at);
CREATE INDEX IF NOT EXISTS diary_index_tasks_user_idx
  ON diary_index_tasks(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS diary_index_tasks_unconfigured_unique
  ON diary_index_tasks(diary_id, source_version, index_epoch)
  WHERE embedding_profile_id IS NULL;

CREATE TABLE IF NOT EXISTS diary_chunks (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    source_version integer NOT NULL,
    index_epoch integer NOT NULL,
    chunk_index integer NOT NULL,
    source_start integer NOT NULL,
    source_end integer NOT NULL,
    chunk_text text NOT NULL,
    embedding vector NOT NULL,
    embedding_profile_id varchar(96) NOT NULL REFERENCES embedding_profiles(id),
    chunker_version varchar(80) NOT NULL,
    embedding_input_hash char(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (diary_id, source_version, index_epoch, chunk_index, embedding_profile_id),
    CONSTRAINT diary_chunks_offset_check
      CHECK (source_start >= 0 AND source_end > source_start)
);
CREATE INDEX IF NOT EXISTS diary_chunks_user_diary_idx
  ON diary_chunks(user_id, diary_id, source_version, index_epoch);

CREATE TABLE IF NOT EXISTS reflection_conversations (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seed_diary_id uuid REFERENCES diaries(id) ON DELETE SET NULL,
    title varchar(200) NOT NULL DEFAULT '',
    mode varchar(20) NOT NULL,
    scope jsonb NOT NULL DEFAULT '{}'::jsonb,
    initial_question text NOT NULL,
    corpus_revision bigint NOT NULL,
    status varchar(28) NOT NULL DEFAULT 'processing',
    coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message text,
    invalidated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reflection_conversations_mode_check CHECK (mode IN ('related', 'timeline', 'change')),
    CONSTRAINT reflection_conversations_status_check
      CHECK (status IN ('processing', 'completed', 'insufficient_evidence', 'partial', 'failed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS reflection_conversations_user_created_idx
  ON reflection_conversations(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reflection_messages (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES reflection_conversations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role varchar(16) NOT NULL,
    content text NOT NULL,
    structured_result jsonb NOT NULL DEFAULT '{}'::jsonb,
    citations jsonb NOT NULL DEFAULT '[]'::jsonb,
    model_version varchar(160),
    prompt_version varchar(80),
    invalidated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reflection_messages_role_check CHECK (role IN ('user', 'assistant'))
);
CREATE INDEX IF NOT EXISTS reflection_messages_conversation_idx
  ON reflection_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS reflection_message_sources (
    message_id uuid NOT NULL REFERENCES reflection_messages(id) ON DELETE CASCADE,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    source_version integer NOT NULL,
    PRIMARY KEY (message_id, diary_id)
);
CREATE INDEX IF NOT EXISTS reflection_message_sources_diary_idx
  ON reflection_message_sources(diary_id);

CREATE TABLE IF NOT EXISTS reflection_tasks (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES reflection_conversations(id) ON DELETE CASCADE,
    user_message_id uuid NOT NULL REFERENCES reflection_messages(id) ON DELETE CASCADE,
    status varchar(20) NOT NULL DEFAULT 'pending',
    progress integer NOT NULL DEFAULT 0,
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_owner varchar(120),
    lease_expires_at timestamptz,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reflection_tasks_status_check
      CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT reflection_tasks_progress_check CHECK (progress BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS reflection_tasks_message_unique
  ON reflection_tasks(user_message_id);
CREATE INDEX IF NOT EXISTS reflection_tasks_claim_idx
  ON reflection_tasks(status, available_at, lease_expires_at, created_at);

CREATE TABLE IF NOT EXISTS reflection_feedback (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES reflection_conversations(id) ON DELETE CASCADE,
    message_id uuid REFERENCES reflection_messages(id) ON DELETE CASCADE,
    kind varchar(32) NOT NULL,
    target jsonb NOT NULL DEFAULT '{}'::jsonb,
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reflection_feedback_kind_check
      CHECK (kind IN ('not_same_event', 'wrong_interpretation', 'not_now', 'helpful'))
);
CREATE INDEX IF NOT EXISTS reflection_feedback_conversation_idx
  ON reflection_feedback(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS reflection_analysis_cache (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cache_key char(64) NOT NULL,
    corpus_revision bigint NOT NULL,
    embedding_profile_id varchar(96),
    model_version varchar(160) NOT NULL,
    prompt_version varchar(80) NOT NULL,
    result jsonb NOT NULL,
    source_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
    valid boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, cache_key, corpus_revision, model_version, prompt_version)
);

CREATE TABLE IF NOT EXISTS reflection_card_sources (
    card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES reflection_conversations(id) ON DELETE SET NULL,
    message_id uuid REFERENCES reflection_messages(id) ON DELETE SET NULL,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    source_version integer NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (card_id, diary_id)
);

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS source_reflection_message_id uuid
    REFERENCES reflection_messages(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cards_source_reflection_message_unique
  ON cards(user_id, source_reflection_message_id)
  WHERE source_reflection_message_id IS NOT NULL;

COMMIT;
