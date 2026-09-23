BEGIN;

-- Financial records are a private fact ledger under an owned financial
-- compound thread. The composite keys prevent a record from ever being
-- attached to another user's plan, even if application checks regress.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'compound_threads'::regclass
       AND conname = 'compound_threads_id_user_unique'
  ) THEN
    ALTER TABLE compound_threads
      ADD CONSTRAINT compound_threads_id_user_unique UNIQUE (id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS financial_plan_profiles (
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  scope_type varchar(16) NOT NULL DEFAULT 'PARTIAL' CHECK (scope_type IN ('PARTIAL', 'ALL_LONG_TERM')),
  tracking_mode varchar(16) NOT NULL DEFAULT 'PLAN_ONLY' CHECK (tracking_mode IN ('FROM_NOW', 'HISTORY', 'PLAN_ONLY')),
  base_currency varchar(3) NOT NULL DEFAULT 'CNY',
  horizon_status varchar(16) NOT NULL DEFAULT 'UNDECIDED' CHECK (horizon_status IN ('TARGET_DATE', 'TARGET_YEAR', 'UNDECIDED')),
  expected_use_on date,
  reserve_status varchar(16) NOT NULL DEFAULT 'UNSPECIFIED' CHECK (reserve_status IN ('RESERVED', 'PENDING', 'UNSPECIFIED')),
  private_payload bytea NOT NULL,
  privacy_notice_version varchar(40) NOT NULL,
  sensitive_consent_at timestamptz NOT NULL,
  ai_processing_consent_at timestamptz,
  ai_processing_consent_version varchar(40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id),
  FOREIGN KEY (thread_id, user_id) REFERENCES compound_threads(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS financial_plan_profiles_user_idx
  ON financial_plan_profiles(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS financial_records (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  record_type varchar(40) NOT NULL CHECK (record_type IN (
    'EXTERNAL_CONTRIBUTION', 'EXTERNAL_WITHDRAWAL', 'INTERNAL_TRANSFER',
    'BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'RETURN_REINVESTMENT',
    'FEE', 'TAX', 'EXISTING_ASSET_INCLUSION', 'UNCERTAIN'
  )),
  occurred_on date NOT NULL,
  currency varchar(3) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'SUPERSEDED', 'VOID')),
  source_kind varchar(20) NOT NULL DEFAULT 'MANUAL' CHECK (source_kind IN ('MANUAL', 'IMPORT', 'DIARY', 'MIGRATION')),
  source_diary_id uuid REFERENCES diaries(id) ON DELETE SET NULL,
  source_ref varchar(160),
  transfer_group_id uuid,
  revision_of uuid REFERENCES financial_records(id) ON DELETE SET NULL,
  revision_reason text NOT NULL DEFAULT '',
  idempotency_key varchar(128),
  private_payload bytea NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (thread_id, user_id) REFERENCES financial_plan_profiles(thread_id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, thread_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS financial_records_plan_date_idx
  ON financial_records(user_id, thread_id, occurred_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS financial_snapshots (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  snapshot_kind varchar(20) NOT NULL CHECK (snapshot_kind IN ('PLAN_TOTAL', 'HOLDING')),
  valued_on date NOT NULL,
  currency varchar(3) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'SUPERSEDED', 'VOID')),
  source_kind varchar(20) NOT NULL DEFAULT 'MANUAL' CHECK (source_kind IN ('MANUAL', 'IMPORT', 'DIARY', 'MIGRATION')),
  source_ref varchar(160),
  revision_of uuid REFERENCES financial_snapshots(id) ON DELETE SET NULL,
  revision_reason text NOT NULL DEFAULT '',
  idempotency_key varchar(128),
  private_payload bytea NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (thread_id, user_id) REFERENCES financial_plan_profiles(thread_id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, thread_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS financial_snapshots_plan_date_idx
  ON financial_snapshots(user_id, thread_id, valued_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS financial_holdings (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  valued_on date NOT NULL,
  currency varchar(3) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('DRAFT', 'CONFIRMED', 'SUPERSEDED', 'VOID')),
  classification_status varchar(20) NOT NULL DEFAULT 'USER_ENTERED' CHECK (classification_status IN ('USER_ENTERED', 'SOURCE_VERIFIED', 'UNVERIFIED')),
  source_kind varchar(16) NOT NULL DEFAULT 'MANUAL' CHECK (source_kind IN ('MANUAL', 'IMPORT', 'DIARY', 'MIGRATION')),
  source_ref varchar(160),
  holding_key char(64) NOT NULL,
  revision_of uuid REFERENCES financial_holdings(id) ON DELETE SET NULL,
  revision_reason text NOT NULL DEFAULT '',
  idempotency_key varchar(128),
  private_payload bytea NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (thread_id, user_id) REFERENCES financial_plan_profiles(thread_id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, thread_id, idempotency_key)
);
ALTER TABLE financial_holdings ADD COLUMN IF NOT EXISTS source_kind varchar(16) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE financial_holdings ADD COLUMN IF NOT EXISTS source_ref varchar(160);
CREATE INDEX IF NOT EXISTS financial_holdings_plan_date_idx
  ON financial_holdings(user_id, thread_id, valued_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_holdings_current_idx
  ON financial_holdings(user_id, thread_id, holding_key, valued_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS financial_aliases (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  source_alias_hash char(64) NOT NULL,
  batch_scope varchar(80) NOT NULL DEFAULT '',
  private_payload bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (thread_id, user_id) REFERENCES financial_plan_profiles(thread_id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, thread_id, source_alias_hash, batch_scope)
);

CREATE TABLE IF NOT EXISTS financial_rule_versions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  version integer NOT NULL,
  effective_on date NOT NULL,
  decided_on date NOT NULL,
  private_payload bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (thread_id, user_id) REFERENCES financial_plan_profiles(thread_id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, thread_id, version)
);
CREATE INDEX IF NOT EXISTS financial_rules_effective_idx
  ON financial_rule_versions(user_id, thread_id, effective_on DESC, version DESC);

CREATE TABLE IF NOT EXISTS financial_decision_notes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  decided_on date NOT NULL,
  private_payload bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (thread_id, user_id) REFERENCES financial_plan_profiles(thread_id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS financial_reviews (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  review_type varchar(16) NOT NULL CHECK (review_type IN ('MONTHLY', 'QUARTERLY')),
  scope_start date NOT NULL,
  scope_end date NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('DRAFT', 'CONFIRMED', 'SUPERSEDED')),
  private_payload bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (thread_id, user_id) REFERENCES financial_plan_profiles(thread_id, user_id) ON DELETE CASCADE,
  CHECK (scope_end >= scope_start)
);
CREATE INDEX IF NOT EXISTS financial_reviews_scope_idx
  ON financial_reviews(user_id, thread_id, scope_end DESC);

CREATE TABLE IF NOT EXISTS financial_import_drafts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'DISMISSED')),
  source_hash char(64) NOT NULL,
  model_version varchar(80) NOT NULL DEFAULT '',
  cost_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  private_payload bytea NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (thread_id, user_id) REFERENCES financial_plan_profiles(thread_id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, thread_id, source_hash)
);

COMMIT;
