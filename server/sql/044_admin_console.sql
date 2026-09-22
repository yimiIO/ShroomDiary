-- Formal Shroom operations console. Keep operator control, product access,
-- billing entitlements and private user content as separate concerns.
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status varchar(24) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS status_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('ACTIVE', 'SUSPENDED'));

CREATE TABLE IF NOT EXISTS admin_members (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role varchar(24) NOT NULL DEFAULT 'VIEWER'
      CHECK (role IN ('OWNER', 'OPERATOR', 'SUPPORT', 'VIEWER')),
    status varchar(24) NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Preserve the existing administrator during the v1 -> v2 transition.
INSERT INTO admin_members (user_id, role, status, created_by)
SELECT id, 'OWNER', 'ACTIVE', id FROM users WHERE role = 'ADMIN'
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_sessions (
    id uuid PRIMARY KEY,
    admin_user_id uuid NOT NULL REFERENCES admin_members(user_id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    csrf_token_hash char(64) NOT NULL,
    expires_at timestamptz NOT NULL,
    idle_expires_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    last_reauthenticated_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_sessions_member_active_idx
  ON admin_sessions(admin_user_id, idle_expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_audit_events (
    id uuid PRIMARY KEY,
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    actor_role varchar(24) NOT NULL DEFAULT '',
    action varchar(120) NOT NULL,
    target_type varchar(80) NOT NULL,
    target_id varchar(160) NOT NULL DEFAULT '',
    reason text NOT NULL DEFAULT '',
    before_value jsonb,
    after_value jsonb,
    request_id varchar(160) NOT NULL,
    ip_hash char(64),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_events_created_idx
  ON admin_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_events_target_idx
  ON admin_audit_events(target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feature_rollouts (
    feature_key varchar(40) PRIMARY KEY,
    status varchar(24) NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE', 'BETA', 'PAUSED')),
    platforms jsonb NOT NULL DEFAULT '["H5", "APP", "MP_WEIXIN"]'::jsonb,
    maintenance_message text NOT NULL DEFAULT '',
    runtime_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO feature_rollouts (feature_key, status) VALUES
  ('compound', 'ACTIVE'),
  ('inquiries', 'ACTIVE'),
  ('wellbeing', 'ACTIVE')
ON CONFLICT (feature_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS feature_access_grants (
    id uuid PRIMARY KEY,
    feature_key varchar(40) NOT NULL REFERENCES feature_rollouts(feature_key) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access varchar(16) NOT NULL CHECK (access IN ('ALLOW', 'DENY')),
    reason text NOT NULL,
    expires_at timestamptz,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    revoked_at timestamptz,
    revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
    revoked_reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS feature_access_grants_active_idx
  ON feature_access_grants(feature_key, user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS feature_access_grants_user_idx
  ON feature_access_grants(user_id, created_at DESC);

ALTER TABLE ai_company_agents DROP CONSTRAINT IF EXISTS ai_company_agents_status_check;
ALTER TABLE ai_company_agents
  ADD CONSTRAINT ai_company_agents_status_check
  CHECK (status IN ('ACTIVE', 'PAUSED', 'BLOCKED', 'ARCHIVED'));

ALTER TABLE ai_company_agents
  ADD COLUMN IF NOT EXISTS executor_type varchar(32) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS schedule_text varchar(160) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS runtime_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS runtime_state varchar(24) NOT NULL DEFAULT 'DISCONNECTED',
  ADD COLUMN IF NOT EXISTS runtime_message text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz;

ALTER TABLE ai_company_agents DROP CONSTRAINT IF EXISTS ai_company_agents_executor_type_check;
ALTER TABLE ai_company_agents
  ADD CONSTRAINT ai_company_agents_executor_type_check
  CHECK (executor_type IN ('MANUAL', 'CODEX_AUTOMATION', 'SERVICE_WORKER'));
ALTER TABLE ai_company_agents DROP CONSTRAINT IF EXISTS ai_company_agents_runtime_state_check;
ALTER TABLE ai_company_agents
  ADD CONSTRAINT ai_company_agents_runtime_state_check
  CHECK (runtime_state IN ('DISCONNECTED', 'IDLE', 'RUNNING', 'ERROR'));

CREATE TABLE IF NOT EXISTS agent_executions (
    id uuid PRIMARY KEY,
    agent_key varchar(80) NOT NULL REFERENCES ai_company_agents(stable_key) ON DELETE CASCADE,
    command_id uuid,
    trigger_type varchar(24) NOT NULL DEFAULT 'SCHEDULED'
      CHECK (trigger_type IN ('SCHEDULED', 'MANUAL', 'RETRY', 'SYSTEM')),
    status varchar(24) NOT NULL DEFAULT 'RUNNING'
      CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED')),
    result_state varchar(24)
      CHECK (result_state IS NULL OR result_state IN ('OUTPUT', 'VERIFIED', 'REAL_WORLD', 'NONE')),
    summary text NOT NULL DEFAULT '',
    evidence text NOT NULL DEFAULT '',
    error_message text NOT NULL DEFAULT '',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_executions_agent_started_idx
  ON agent_executions(agent_key, started_at DESC);

CREATE TABLE IF NOT EXISTS agent_commands (
    id uuid PRIMARY KEY,
    agent_key varchar(80) NOT NULL REFERENCES ai_company_agents(stable_key) ON DELETE CASCADE,
    command varchar(24) NOT NULL CHECK (command IN ('RUN', 'PAUSE', 'RESUME')),
    status varchar(24) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'CLAIMED', 'COMPLETED', 'FAILED', 'CANCELLED')),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    reason text NOT NULL DEFAULT '',
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    claimed_at timestamptz,
    completed_at timestamptz,
    result_execution_id uuid REFERENCES agent_executions(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agent_executions DROP CONSTRAINT IF EXISTS agent_executions_command_fk;
ALTER TABLE agent_executions
  ADD CONSTRAINT agent_executions_command_fk
  FOREIGN KEY (command_id) REFERENCES agent_commands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS agent_commands_pending_idx
  ON agent_commands(agent_key, created_at)
  WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS agent_runner_credentials (
    id uuid PRIMARY KEY,
    agent_key varchar(80) NOT NULL REFERENCES ai_company_agents(stable_key) ON DELETE CASCADE,
    name varchar(120) NOT NULL,
    token_hash char(64) NOT NULL UNIQUE,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    last_used_at timestamptz,
    expires_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_runner_credentials_agent_idx
  ON agent_runner_credentials(agent_key, created_at DESC);

COMMIT;
