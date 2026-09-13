ALTER TABLE wellbeing_records
  ADD COLUMN IF NOT EXISTS health_value_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS why_useful text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS confidence numeric(4, 3),
  ADD COLUMN IF NOT EXISTS review_version varchar(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS feedback_reason varchar(48),
  ADD COLUMN IF NOT EXISTS source_fingerprint varchar(64) NOT NULL DEFAULT '';

ALTER TABLE wellbeing_records
  DROP CONSTRAINT IF EXISTS wellbeing_records_confidence_check;

ALTER TABLE wellbeing_records
  ADD CONSTRAINT wellbeing_records_confidence_check
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

CREATE INDEX IF NOT EXISTS idx_wellbeing_user_source_fingerprint
  ON wellbeing_records(user_id, source_fingerprint)
  WHERE source_fingerprint <> '';
