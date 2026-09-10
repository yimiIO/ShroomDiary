BEGIN;

CREATE TABLE IF NOT EXISTS diary_affect_assessments (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    source_version integer NOT NULL,
    model_version varchar(160) NOT NULL,
    prompt_version varchar(80) NOT NULL,
    label varchar(24) NOT NULL,
    confidence numeric(5,4) NOT NULL DEFAULT 0,
    reason text NOT NULL DEFAULT '',
    evidence_start integer,
    evidence_end integer,
    evidence_excerpt text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, diary_id, source_version, model_version, prompt_version),
    CONSTRAINT diary_affect_assessments_label_check
      CHECK (label IN ('negative', 'mixed', 'not_negative', 'uncertain')),
    CONSTRAINT diary_affect_assessments_confidence_check
      CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT diary_affect_assessments_offset_check
      CHECK ((evidence_start IS NULL AND evidence_end IS NULL)
        OR (evidence_start >= 0 AND evidence_end > evidence_start))
);

CREATE INDEX IF NOT EXISTS diary_affect_assessments_user_diary_idx
  ON diary_affect_assessments(user_id, diary_id, source_version);

COMMIT;
