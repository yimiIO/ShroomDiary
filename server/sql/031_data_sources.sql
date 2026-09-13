BEGIN;

CREATE TABLE IF NOT EXISTS data_source_connections (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider varchar(32) NOT NULL CHECK (provider IN ('CODEX')),
    display_name varchar(120) NOT NULL DEFAULT '菇日记 · Codex 数据源',
    device_name varchar(120) NOT NULL DEFAULT '',
    connection_mode varchar(32) NOT NULL DEFAULT 'LOCAL_CONNECTOR'
      CHECK (connection_mode IN ('LOCAL_CONNECTOR')),
    status varchar(20) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'ACTIVE', 'PAUSED', 'DISCONNECTED')),
    sync_interval_hours integer NOT NULL DEFAULT 72
      CHECK (sync_interval_hours BETWEEN 1 AND 720),
    include_in_diary boolean NOT NULL DEFAULT true,
    ai_allowed boolean NOT NULL DEFAULT true,
    scopes jsonb NOT NULL DEFAULT '["task_metadata"]'::jsonb,
    pairing_code_hash char(64),
    pairing_expires_at timestamptz,
    sync_token_hash char(64) UNIQUE,
    last_cursor text NOT NULL DEFAULT '',
    last_sync_at timestamptz,
    last_error text NOT NULL DEFAULT '',
    connected_at timestamptz,
    paused_at timestamptz,
    disconnected_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_source_connections_user_idx
  ON data_source_connections(user_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS data_source_connections_one_codex_idx
  ON data_source_connections(user_id, provider);

CREATE TABLE IF NOT EXISTS external_activity_events (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES data_source_connections(id) ON DELETE CASCADE,
    provider varchar(32) NOT NULL CHECK (provider IN ('CODEX')),
    external_id varchar(200) NOT NULL,
    activity_type varchar(48) NOT NULL CHECK (activity_type IN ('CODEX_TASK')),
    title varchar(240) NOT NULL,
    project_label varchar(120) NOT NULL DEFAULT '',
    source_kind varchar(80) NOT NULL DEFAULT '',
    started_at timestamptz,
    completed_at timestamptz NOT NULL,
    task_runtime_seconds integer CHECK (task_runtime_seconds IS NULL OR task_runtime_seconds >= 0),
    active_seconds_estimate integer CHECK (active_seconds_estimate IS NULL OR active_seconds_estimate >= 0),
    outcome_status varchar(20) NOT NULL
      CHECK (outcome_status IN ('COMPLETED', 'INTERRUPTED', 'FAILED')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (connection_id, external_id)
);
CREATE INDEX IF NOT EXISTS external_activity_events_user_completed_idx
  ON external_activity_events(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS external_activity_events_connection_idx
  ON external_activity_events(connection_id, completed_at DESC);

ALTER TABLE diary_analysis
  ADD COLUMN IF NOT EXISTS source_activities jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
