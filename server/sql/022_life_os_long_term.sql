BEGIN;

CREATE TABLE IF NOT EXISTS life_os_items (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stable_key char(2) NOT NULL,
    original_number smallint NOT NULL CHECK (original_number BETWEEN 1 AND 20),
    section varchar(32) NOT NULL CHECK (section IN ('健康与生活', '安全与财务', '认知与执行', '事业与资产', '关系与信誉')),
    name varchar(120) NOT NULL,
    description text NOT NULL DEFAULT '',
    minimum_action text NOT NULL DEFAULT '',
    current_next_step text NOT NULL DEFAULT '',
    priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 99),
    status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED')),
    template_version varchar(40) NOT NULL DEFAULT '2026-09-12-v1',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, stable_key)
);
CREATE INDEX IF NOT EXISTS life_os_items_user_section_priority_idx
  ON life_os_items(user_id, section, priority, original_number);

CREATE TABLE IF NOT EXISTS life_os_week_focus (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start date NOT NULL,
    item_id uuid NOT NULL REFERENCES life_os_items(id) ON DELETE CASCADE,
    position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, week_start, item_id),
    UNIQUE (user_id, week_start, position)
);

CREATE TABLE IF NOT EXISTS life_os_item_links (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES life_os_items(id) ON DELETE CASCADE,
    diary_id uuid REFERENCES diaries(id) ON DELETE SET NULL,
    analysis_id uuid REFERENCES diary_analysis(id) ON DELETE SET NULL,
    record_type varchar(20) NOT NULL CHECK (record_type IN ('PLAN', 'ACTION', 'RESULT', 'OBSERVATION', 'INQUIRY')),
    evidence_excerpt text NOT NULL DEFAULT '',
    summary text NOT NULL DEFAULT '',
    suggested_next_step text NOT NULL DEFAULT '',
    origin varchar(20) NOT NULL DEFAULT 'AI' CHECK (origin IN ('AI', 'MANUAL')),
    user_confirmed boolean NOT NULL DEFAULT false,
    status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED', 'INVALID_SOURCE')),
    source_version integer NOT NULL DEFAULT 1,
    source_valid boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS life_os_item_links_user_created_idx
  ON life_os_item_links(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS life_os_item_links_item_created_idx
  ON life_os_item_links(item_id, status, created_at DESC);
ALTER TABLE life_os_item_links
  DROP CONSTRAINT IF EXISTS life_os_item_links_user_id_item_id_diary_id_record_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS life_os_item_links_active_source_idx
  ON life_os_item_links(user_id, item_id, diary_id, record_type)
  WHERE status = 'ACTIVE' AND source_valid;

CREATE TABLE IF NOT EXISTS life_os_item_refs (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES life_os_items(id) ON DELETE CASCADE,
    ref_type varchar(24) NOT NULL CHECK (ref_type IN ('TODO', 'CARD', 'INQUIRY', 'EXTERNAL_ASSET')),
    ref_id uuid,
    label varchar(240) NOT NULL DEFAULT '',
    external_url text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS life_os_item_refs_item_created_idx
  ON life_os_item_refs(item_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS life_os_item_refs_owned_object_idx
  ON life_os_item_refs(user_id, item_id, ref_type, ref_id) WHERE ref_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS life_os_item_history (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES life_os_items(id) ON DELETE CASCADE,
    change_type varchar(32) NOT NULL,
    snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS life_os_item_history_item_created_idx
  ON life_os_item_history(item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS life_os_weekly_reviews (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start date NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'SUPERSEDED')),
    result jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    model_version varchar(80) NOT NULL DEFAULT '',
    cost_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE life_os_weekly_reviews ADD COLUMN IF NOT EXISTS cost_summary jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS life_os_weekly_reviews_user_week_idx
  ON life_os_weekly_reviews(user_id, week_start DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS life_os_weekly_reviews_one_draft_idx
  ON life_os_weekly_reviews(user_id, week_start) WHERE status = 'DRAFT';

COMMIT;
