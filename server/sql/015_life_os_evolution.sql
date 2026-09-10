BEGIN;

CREATE TABLE IF NOT EXISTS life_os_review_proposals (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    base_version integer NOT NULL DEFAULT 0,
    trigger_type varchar(24) NOT NULL DEFAULT 'manual',
    status varchar(16) NOT NULL DEFAULT 'pending',
    summary text NOT NULL DEFAULT '',
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    result jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    CONSTRAINT life_os_review_trigger_check
      CHECK (trigger_type IN ('manual', 'new_evidence', 'periodic', 'legacy_cleanup')),
    CONSTRAINT life_os_review_status_check
      CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded'))
);
CREATE INDEX IF NOT EXISTS life_os_review_user_status_idx
    ON life_os_review_proposals(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS life_os_clauses (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_version integer NOT NULL,
    area varchar(40) NOT NULL,
    statement text NOT NULL,
    boundary text NOT NULL DEFAULT '',
    review_question text NOT NULL DEFAULT '',
    basis varchar(16) NOT NULL DEFAULT 'observed',
    confidence varchar(16) NOT NULL DEFAULT 'emerging',
    status varchar(16) NOT NULL DEFAULT 'active',
    position smallint NOT NULL DEFAULT 0,
    supersedes uuid[] NOT NULL DEFAULT '{}',
    source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    counter_source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    retired_at timestamptz,
    CONSTRAINT life_os_clause_basis_check CHECK (basis IN ('chosen', 'observed', 'mixed')),
    CONSTRAINT life_os_clause_confidence_check CHECK (confidence IN ('high', 'medium', 'emerging')),
    CONSTRAINT life_os_clause_status_check CHECK (status IN ('active', 'retired')),
    CONSTRAINT life_os_clause_snapshot_check CHECK (snapshot_version > 0)
);
CREATE INDEX IF NOT EXISTS life_os_clauses_active_idx
    ON life_os_clauses(user_id, status, position, created_at);
CREATE INDEX IF NOT EXISTS life_os_clauses_version_idx
    ON life_os_clauses(user_id, snapshot_version DESC);

CREATE TABLE IF NOT EXISTS life_os_clause_evidence (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clause_id uuid NOT NULL REFERENCES life_os_clauses(id) ON DELETE CASCADE,
    source_type varchar(16) NOT NULL,
    source_id uuid NOT NULL,
    relation varchar(16) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT life_os_evidence_source_check CHECK (source_type IN ('diary', 'card')),
    CONSTRAINT life_os_evidence_relation_check CHECK (relation IN ('support', 'challenge')),
    UNIQUE (clause_id, source_type, source_id, relation)
);
CREATE INDEX IF NOT EXISTS life_os_clause_evidence_user_idx
    ON life_os_clause_evidence(user_id, clause_id, relation);

COMMIT;
