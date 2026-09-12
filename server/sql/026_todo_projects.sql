BEGIN;

CREATE TABLE IF NOT EXISTS todo_projects (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  goal text NOT NULL DEFAULT '',
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  position numeric(12, 4) NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT todo_projects_status_check CHECK (status IN ('ACTIVE', 'COMPLETED', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS todo_projects_user_status_idx
  ON todo_projects(user_id, status, position, created_at);

CREATE TABLE IF NOT EXISTS todo_recurrence_rules (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(500) NOT NULL,
  description text NOT NULL DEFAULT '',
  project_id uuid REFERENCES todo_projects(id) ON DELETE SET NULL,
  compound_item_id uuid REFERENCES life_os_items(id) ON DELETE SET NULL,
  frequency varchar(16) NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  week_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  month_day smallint,
  time_zone varchar(80) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  last_generated_through date,
  version integer NOT NULL DEFAULT 1,
  client_request_id varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT todo_recurrence_frequency_check CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  CONSTRAINT todo_recurrence_status_check CHECK (status IN ('ACTIVE', 'STOPPED')),
  CONSTRAINT todo_recurrence_month_day_check CHECK (month_day IS NULL OR month_day BETWEEN 1 AND 31),
  CONSTRAINT todo_recurrence_dates_check CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS todo_recurrence_request_unique
  ON todo_recurrence_rules(user_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS todo_recurrence_active_idx
  ON todo_recurrence_rules(user_id, status, starts_on);

ALTER TABLE todos ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE todos ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES todo_projects(id) ON DELETE SET NULL;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS scheduled_date date;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS recurrence_rule_id uuid REFERENCES todo_recurrence_rules(id) ON DELETE SET NULL;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS occurrence_date date;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS compound_item_id uuid REFERENCES life_os_items(id) ON DELETE SET NULL;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS source_type varchar(32) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE todos ADD COLUMN IF NOT EXISTS source_ref_id varchar(100);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS source_diary_id uuid REFERENCES diaries(id) ON DELETE SET NULL;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS source_compound_thread_id uuid REFERENCES compound_threads(id) ON DELETE SET NULL;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS result_text text NOT NULL DEFAULT '';
ALTER TABLE todos ADD COLUMN IF NOT EXISTS result_media_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS position numeric(12, 4) NOT NULL DEFAULT 0;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS client_request_id varchar(100);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE todos DROP CONSTRAINT IF EXISTS todos_status_check;
ALTER TABLE todos ADD CONSTRAINT todos_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));
CREATE UNIQUE INDEX IF NOT EXISTS todos_request_unique
  ON todos(user_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS todos_recurrence_occurrence_unique
  ON todos(user_id, recurrence_rule_id, occurrence_date)
  WHERE recurrence_rule_id IS NOT NULL AND occurrence_date IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS todos_user_schedule_idx
  ON todos(user_id, status, scheduled_date, deadline) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS todos_project_position_idx
  ON todos(user_id, project_id, status, position) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS todo_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  todo_id uuid NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  event_type varchar(32) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_date date,
  source_diary_id uuid REFERENCES diaries(id) ON DELETE SET NULL,
  source_compound_thread_id uuid REFERENCES compound_threads(id) ON DELETE SET NULL,
  visible_in_diary boolean NOT NULL DEFAULT false,
  valid boolean NOT NULL DEFAULT true,
  idempotency_key varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  CONSTRAINT todo_events_type_check CHECK (event_type IN (
    'CREATED', 'UPDATED', 'STARTED', 'COMPLETED', 'RESTORED', 'CANCELLED',
    'SKIPPED', 'DIARY_LINKED', 'RESULT_UPDATED', 'RESCHEDULED'
  ))
);
CREATE UNIQUE INDEX IF NOT EXISTS todo_events_idempotency_unique
  ON todo_events(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS todo_events_task_idx ON todo_events(user_id, todo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS todo_events_diary_day_idx
  ON todo_events(user_id, event_date, created_at DESC) WHERE visible_in_diary AND valid;

COMMIT;
