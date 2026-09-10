BEGIN;

CREATE TABLE IF NOT EXISTS diary_semantic_assessments (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    source_version integer NOT NULL,
    criterion_hash char(64) NOT NULL,
    model_version varchar(160) NOT NULL,
    prompt_version varchar(80) NOT NULL,
    label varchar(24) NOT NULL,
    confidence numeric(5,4) NOT NULL DEFAULT 0,
    reason text NOT NULL DEFAULT '',
    evidence_start integer,
    evidence_end integer,
    evidence_excerpt text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, diary_id, source_version, criterion_hash, model_version, prompt_version),
    CONSTRAINT diary_semantic_assessments_label_check
      CHECK (label IN ('match', 'partial', 'no_match', 'uncertain')),
    CONSTRAINT diary_semantic_assessments_confidence_check
      CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT diary_semantic_assessments_offset_check
      CHECK ((evidence_start IS NULL AND evidence_end IS NULL)
        OR (evidence_start >= 0 AND evidence_end > evidence_start))
);

CREATE INDEX IF NOT EXISTS diary_semantic_assessments_user_diary_idx
  ON diary_semantic_assessments(user_id, diary_id, source_version);
CREATE INDEX IF NOT EXISTS diary_semantic_assessments_criterion_idx
  ON diary_semantic_assessments(user_id, criterion_hash, model_version, prompt_version);

COMMIT;
