BEGIN;

CREATE TABLE IF NOT EXISTS inquiries (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question varchar(300) NOT NULL,
    context text NOT NULL DEFAULT '',
    status varchar(16) NOT NULL DEFAULT 'OPEN'
      CHECK (status IN ('OPEN', 'PAUSED', 'RESOLVED')),
    current_synthesis jsonb NOT NULL DEFAULT '{}'::jsonb,
    synthesis_version integer NOT NULL DEFAULT 0,
    evidence_revision integer NOT NULL DEFAULT 0,
    last_reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inquiries_user_status_updated_idx
  ON inquiries(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS inquiry_evidence (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    inquiry_id uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    diary_id uuid REFERENCES diaries(id) ON DELETE CASCADE,
    source_type varchar(24) NOT NULL
      CHECK (source_type IN ('DIARY', 'NOTE', 'LINK', 'ACTION', 'REFLECTION')),
    source_label varchar(240) NOT NULL DEFAULT '',
    excerpt text NOT NULL DEFAULT '',
    note text NOT NULL DEFAULT '',
    relation varchar(16) NOT NULL DEFAULT 'CONTEXT'
      CHECK (relation IN ('SUPPORT', 'CHALLENGE', 'CONTEXT', 'UNKNOWN')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((source_type = 'DIARY' AND diary_id IS NOT NULL) OR source_type <> 'DIARY')
);
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_evidence_diary_unique
  ON inquiry_evidence(inquiry_id, diary_id) WHERE diary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inquiry_evidence_inquiry_created_idx
  ON inquiry_evidence(inquiry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inquiry_evidence_user_diary_idx
  ON inquiry_evidence(user_id, diary_id) WHERE diary_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inquiry_syntheses (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    inquiry_id uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    version integer NOT NULL,
    result jsonb NOT NULL DEFAULT '{}'::jsonb,
    evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    invalidated_at timestamptz,
    invalidated_reason varchar(80),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (inquiry_id, version)
);
CREATE INDEX IF NOT EXISTS inquiry_syntheses_inquiry_version_idx
  ON inquiry_syntheses(inquiry_id, version DESC);

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS inquiry_id uuid REFERENCES inquiries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ai_usage_events_inquiry_idx
  ON ai_usage_events(user_id, inquiry_id) WHERE inquiry_id IS NOT NULL;

COMMIT;
