BEGIN;

-- Compound archetypes are shared product knowledge. A user's selected plan is
-- private and keeps a snapshot of the chosen archetype semantics so future
-- catalog revisions cannot silently change an existing commitment.
ALTER TABLE compound_threads ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS archetype_key varchar(64) NOT NULL DEFAULT 'legacy_direction';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS archetype_version varchar(40) NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS investment_kind varchar(16) NOT NULL DEFAULT 'GROWTH';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS principal_definition text NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS return_definition text NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS reinvestment_definition text NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS validation_status varchar(24) NOT NULL DEFAULT 'VALIDATING';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS validation_started_at date;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS validation_due_at date;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS validation_note text NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS principal_metric_name varchar(240) NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS principal_metric_target numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS principal_metric_current numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS return_metric_name varchar(240) NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS return_metric_target numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS return_metric_current numeric(14, 2) NOT NULL DEFAULT 0;

UPDATE compound_threads
   SET validation_started_at = COALESCE(validation_started_at, cycle_start),
       validation_due_at = COALESCE(validation_due_at, cycle_start + 27),
       principal_definition = COALESCE(NULLIF(principal_definition, ''), NULLIF(compound_mechanism, ''), desired_outcome),
       principal_metric_name = COALESCE(NULLIF(principal_metric_name, ''), leading_metric_name),
       principal_metric_target = CASE WHEN principal_metric_target > 0 THEN principal_metric_target ELSE leading_metric_target END,
       principal_metric_current = CASE WHEN principal_metric_current > 0 THEN principal_metric_current ELSE leading_metric_current END,
       return_definition = COALESCE(NULLIF(return_definition, ''), outcome_evidence),
       reinvestment_definition = COALESCE(NULLIF(reinvestment_definition, ''), '待下次阶段回看时确认')
 WHERE archetype_key = 'legacy_direction';

ALTER TABLE compound_threads ALTER COLUMN validation_started_at SET NOT NULL;
ALTER TABLE compound_threads ALTER COLUMN validation_due_at SET NOT NULL;
ALTER TABLE compound_threads DROP CONSTRAINT IF EXISTS compound_threads_investment_kind_check;
ALTER TABLE compound_threads ADD CONSTRAINT compound_threads_investment_kind_check
  CHECK (investment_kind IN ('GROWTH', 'PROTECTION'));
ALTER TABLE compound_threads DROP CONSTRAINT IF EXISTS compound_threads_validation_status_check;
ALTER TABLE compound_threads ADD CONSTRAINT compound_threads_validation_status_check
  CHECK (validation_status IN ('VALIDATING', 'COMPOUNDING', 'LINEAR', 'PROTECTION'));
ALTER TABLE compound_threads DROP CONSTRAINT IF EXISTS compound_threads_validation_dates_check;
ALTER TABLE compound_threads ADD CONSTRAINT compound_threads_validation_dates_check
  CHECK (validation_due_at >= validation_started_at);
ALTER TABLE compound_threads DROP CONSTRAINT IF EXISTS compound_threads_compound_metrics_check;
ALTER TABLE compound_threads ADD CONSTRAINT compound_threads_compound_metrics_check
  CHECK (
    principal_metric_target >= 0 AND principal_metric_current >= 0
    AND return_metric_target >= 0 AND return_metric_current >= 0
  );

CREATE INDEX IF NOT EXISTS compound_threads_user_archetype_idx
  ON compound_threads(user_id, archetype_key, status, last_activity_at DESC);

COMMIT;
