BEGIN;

CREATE TABLE IF NOT EXISTS daily_review_preferences (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_address varchar(254) NOT NULL DEFAULT '',
    email_verified_at timestamptz,
    email_enabled boolean NOT NULL DEFAULT false,
    verification_code_hash char(64),
    verification_expires_at timestamptz,
    verification_attempts smallint NOT NULL DEFAULT 0,
    last_verification_sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT daily_review_email_enabled_check
      CHECK (NOT email_enabled OR email_verified_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_review_verified_email_unique
  ON daily_review_preferences(lower(email_address))
  WHERE email_verified_at IS NOT NULL AND email_address <> '';

CREATE TABLE IF NOT EXISTS daily_reviews (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    review_date date NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'READY', 'FAILED')),
    result jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_fingerprint char(64) NOT NULL DEFAULT '',
    source_cutoff timestamptz,
    generated_by varchar(16) NOT NULL DEFAULT 'USER'
      CHECK (generated_by IN ('USER', 'EMAIL')),
    model_version varchar(120) NOT NULL DEFAULT '',
    viewed_at timestamptz,
    email_status varchar(16) NOT NULL DEFAULT 'NONE'
      CHECK (email_status IN ('NONE', 'PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED')),
    email_attempts smallint NOT NULL DEFAULT 0,
    email_claimed_at timestamptz,
    email_next_attempt_at timestamptz,
    emailed_at timestamptz,
    email_error text NOT NULL DEFAULT '',
    error_message text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, review_date)
);
CREATE INDEX IF NOT EXISTS daily_reviews_user_date_idx
  ON daily_reviews(user_id, review_date DESC);
CREATE INDEX IF NOT EXISTS daily_reviews_email_queue_idx
  ON daily_reviews(review_date, email_status, email_next_attempt_at)
  WHERE viewed_at IS NULL AND email_status IN ('PENDING', 'PROCESSING', 'FAILED');

COMMIT;
