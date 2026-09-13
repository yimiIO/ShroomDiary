BEGIN;

-- A compound thread used to describe only the next action.  Keep every
-- existing thread and promote it into a time-bounded plan instead of creating
-- a second, incompatible data source.
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS title varchar(240) NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS cycle_start date;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS cycle_end date;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS compound_mechanism text NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS weekly_time_budget_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS leading_metric_name varchar(240) NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS leading_metric_target numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS leading_metric_current numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS outcome_evidence text NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS current_milestone text NOT NULL DEFAULT '';
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS stop_list jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE compound_threads ADD COLUMN IF NOT EXISTS plan_version integer NOT NULL DEFAULT 1;

UPDATE compound_threads t
   SET title = COALESCE(NULLIF(t.title, ''), i.name),
       cycle_start = COALESCE(t.cycle_start, (t.started_at AT TIME ZONE 'Asia/Shanghai')::date),
       cycle_end = COALESCE(t.cycle_end, (t.started_at AT TIME ZONE 'Asia/Shanghai')::date + 83),
       weekly_time_budget_minutes = CASE
         WHEN t.weekly_time_budget_minutes > 0 THEN t.weekly_time_budget_minutes
         ELSE 180
       END,
       current_milestone = COALESCE(NULLIF(t.current_milestone, ''), t.desired_outcome)
  FROM life_os_items i
 WHERE i.id = t.item_id;

ALTER TABLE compound_threads ALTER COLUMN cycle_start SET NOT NULL;
ALTER TABLE compound_threads ALTER COLUMN cycle_end SET NOT NULL;
ALTER TABLE compound_threads DROP CONSTRAINT IF EXISTS compound_threads_cycle_dates_check;
ALTER TABLE compound_threads ADD CONSTRAINT compound_threads_cycle_dates_check
  CHECK (cycle_end >= cycle_start);
ALTER TABLE compound_threads DROP CONSTRAINT IF EXISTS compound_threads_weekly_budget_check;
ALTER TABLE compound_threads ADD CONSTRAINT compound_threads_weekly_budget_check
  CHECK (weekly_time_budget_minutes BETWEEN 0 AND 10080);
ALTER TABLE compound_threads DROP CONSTRAINT IF EXISTS compound_threads_metric_values_check;
ALTER TABLE compound_threads ADD CONSTRAINT compound_threads_metric_values_check
  CHECK (leading_metric_target >= 0 AND leading_metric_current >= 0);

CREATE TABLE IF NOT EXISTS compound_week_plans (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES compound_threads(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  planned_minutes integer NOT NULL DEFAULT 0,
  actual_minutes integer NOT NULL DEFAULT 0,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  stop_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  reflection text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compound_week_plan_minutes_check
    CHECK (planned_minutes BETWEEN 0 AND 10080 AND actual_minutes BETWEEN 0 AND 10080),
  UNIQUE (user_id, thread_id, week_start)
);
CREATE INDEX IF NOT EXISTS compound_week_plans_user_week_idx
  ON compound_week_plans(user_id, week_start DESC, updated_at DESC);

COMMIT;
