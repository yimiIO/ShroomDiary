BEGIN;

ALTER TABLE wellbeing_records
  ADD COLUMN IF NOT EXISTS extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction_version varchar(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS model_version varchar(120) NOT NULL DEFAULT '';

COMMIT;
