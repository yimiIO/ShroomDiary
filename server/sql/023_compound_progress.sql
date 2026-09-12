BEGIN;

-- The 20 long-horizon directions remain in life_os_items for a non-destructive
-- migration. Product language and all new workflow APIs call them compound
-- directions; life_os_* principle tables remain the user's separate Life OS.
CREATE TABLE IF NOT EXISTS compound_threads (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES life_os_items(id) ON DELETE RESTRICT,
    progress_mode varchar(24) NOT NULL CHECK (progress_mode IN ('MAINTENANCE', 'SITUATIONAL', 'OUTCOME')),
    desired_outcome text NOT NULL DEFAULT '',
    context_summary text NOT NULL DEFAULT '',
    last_completed text NOT NULL DEFAULT '',
    current_step text NOT NULL DEFAULT '',
    blocker_summary text NOT NULL DEFAULT '',
    status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ENDED')),
    is_primary boolean NOT NULL DEFAULT false,
    started_at timestamptz NOT NULL DEFAULT now(),
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    paused_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compound_threads_user_activity_idx
  ON compound_threads(user_id, status, is_primary DESC, last_activity_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS compound_threads_one_active_item_idx
  ON compound_threads(user_id, item_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS compound_threads_one_primary_idx
  ON compound_threads(user_id) WHERE status = 'ACTIVE' AND is_primary;

CREATE TABLE IF NOT EXISTS compound_events (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_id uuid NOT NULL REFERENCES compound_threads(id) ON DELETE CASCADE,
    kind varchar(24) NOT NULL CHECK (kind IN (
      'START', 'CONTINUE', 'BLOCKER', 'ADJUSTMENT', 'RESULT',
      'DIARY_REVIEW', 'PAUSE', 'RESUME', 'END'
    )),
    status varchar(16) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('DRAFT', 'CONFIRMED', 'DISMISSED')),
    actor varchar(16) NOT NULL DEFAULT 'USER' CHECK (actor IN ('USER', 'AI', 'SYSTEM')),
    input_text text NOT NULL DEFAULT '',
    summary text NOT NULL DEFAULT '',
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    media_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_diary_id uuid REFERENCES diaries(id) ON DELETE SET NULL,
    source_link_id uuid REFERENCES life_os_item_links(id) ON DELETE SET NULL,
    source_valid boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compound_events_thread_created_idx
  ON compound_events(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS compound_events_user_kind_idx
  ON compound_events(user_id, kind, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS compound_events_diary_review_once_idx
  ON compound_events(thread_id, source_diary_id, kind)
  WHERE source_diary_id IS NOT NULL AND kind = 'DIARY_REVIEW';

CREATE TABLE IF NOT EXISTS compound_reviews (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope_start date NOT NULL,
    scope_end date NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'SUPERSEDED')),
    result jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    model_version varchar(80) NOT NULL DEFAULT '',
    cost_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (scope_end >= scope_start)
);
CREATE INDEX IF NOT EXISTS compound_reviews_user_scope_idx
  ON compound_reviews(user_id, scope_end DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS compound_reviews_one_draft_idx
  ON compound_reviews(user_id) WHERE status = 'DRAFT';

COMMIT;
