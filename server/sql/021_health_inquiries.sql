BEGIN;

ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS inquiry_type varchar(24) NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS observation_started_on date,
  ADD COLUMN IF NOT EXISTS personal_baseline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS health_consent_at timestamptz;

ALTER TABLE inquiries DROP CONSTRAINT IF EXISTS inquiries_inquiry_type_check;
ALTER TABLE inquiries ADD CONSTRAINT inquiries_inquiry_type_check
  CHECK (inquiry_type IN ('GENERAL', 'PSYCHOLOGICAL', 'PHYSICAL_HEALTH'));

ALTER TABLE inquiry_evidence
  ADD COLUMN IF NOT EXISTS health_observation jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE inquiry_candidates
  ADD COLUMN IF NOT EXISTS inquiry_type varchar(24) NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS health_observation jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE inquiry_candidates DROP CONSTRAINT IF EXISTS inquiry_candidates_inquiry_type_check;
ALTER TABLE inquiry_candidates ADD CONSTRAINT inquiry_candidates_inquiry_type_check
  CHECK (inquiry_type IN ('GENERAL', 'PSYCHOLOGICAL', 'PHYSICAL_HEALTH'));

CREATE INDEX IF NOT EXISTS inquiries_user_type_status_updated_idx
  ON inquiries(user_id, inquiry_type, status, updated_at DESC);

COMMIT;
