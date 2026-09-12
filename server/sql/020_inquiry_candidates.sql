BEGIN;

CREATE TABLE IF NOT EXISTS inquiry_candidates (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question varchar(300) NOT NULL,
    context text NOT NULL DEFAULT '',
    status varchar(16) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'ACCEPTED', 'IGNORED')),
    source varchar(32) NOT NULL DEFAULT 'HISTORICAL_BACKFILL'
      CHECK (source IN ('HISTORICAL_BACKFILL', 'DIARY_ANALYSIS')),
    confidence numeric(4,3),
    fingerprint char(64) NOT NULL,
    suggested_inquiry_id uuid REFERENCES inquiries(id) ON DELETE SET NULL,
    accepted_inquiry_id uuid REFERENCES inquiries(id) ON DELETE SET NULL,
    model_version varchar(80) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS inquiry_candidates_user_status_created_idx
  ON inquiry_candidates(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS inquiry_candidate_diaries (
    candidate_id uuid NOT NULL REFERENCES inquiry_candidates(id) ON DELETE CASCADE,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (candidate_id, diary_id)
);
CREATE INDEX IF NOT EXISTS inquiry_candidate_diaries_user_diary_idx
  ON inquiry_candidate_diaries(user_id, diary_id);

COMMIT;
