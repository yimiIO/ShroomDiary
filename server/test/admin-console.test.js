'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('formal admin migration separates sessions, audit, rollouts and runtime control', () => {
  const migration = source('server/sql/044_admin_console.sql');
  for (const table of [
    'admin_members',
    'admin_sessions',
    'admin_audit_events',
    'feature_rollouts',
    'feature_access_grants',
    'agent_executions',
    'agent_commands',
    'agent_runner_credentials'
  ]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration, /account_status IN \('ACTIVE', 'SUSPENDED'\)/);
  assert.match(migration, /role IN \('OWNER', 'OPERATOR', 'SUPPORT', 'VIEWER'\)/);
  assert.match(migration, /users WHERE role = 'ADMIN'/);
  assert.match(migration, /status IN \('ACTIVE', 'BETA', 'PAUSED'\)/);
  assert.match(migration, /runtime_state IN \('DISCONNECTED', 'IDLE', 'RUNNING', 'ERROR'\)/);
});

test('formal admin API uses cookie sessions, CSRF, RBAC and append-only audit', () => {
  const auth = source('server/src/admin-auth.js');
  const route = source('server/src/routes/admin-console.js');
  const audit = source('server/src/admin-audit.js');
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SameSite=Strict/);
  assert.match(auth, /x-shroom-admin-csrf/);
  assert.match(auth, /admin_sessions/);
  assert.match(route, /requirePermission/);
  assert.match(route, /account_status/);
  assert.match(route, /feature_rollouts/);
  assert.match(route, /agent_commands/);
  assert.match(audit, /INSERT INTO admin_audit_events/);
  assert.doesNotMatch(route, /diar(?:y|ies).*content/i);
});

test('agent runner credentials are agent-scoped and executions persist verifiable states', () => {
  const runner = source('server/src/routes/agent-control.js');
  const app = source('server/src/app.js');
  assert.match(runner, /x-shroom-agent-token/);
  assert.match(runner, /c\.agent_key = a\.stable_key/);
  assert.match(runner, /FOR UPDATE SKIP LOCKED/);
  assert.match(runner, /agent_key = \$2 AND status = 'RUNNING'/);
  assert.match(runner, /RESULT_STATES/);
  assert.match(runner, /last_result_state/);
  assert.doesNotMatch(runner, /admin:\*|SELECT \* FROM users/);
  assert.match(app, /app\.use\('\/api\/agent-control\/v1', agentControlRoutes\)/);
  assert.doesNotMatch(app, /\/api\/admin\/v1/);
});

test('feature rollout enforcement stays separate from billing entitlement', () => {
  const access = source('server/src/feature-access.js');
  const billing = source('server/src/billing-store.js');
  assert.match(access, /feature_rollouts/);
  assert.match(access, /feature_access_grants/);
  assert.match(access, /FEATURE_PAUSED/);
  assert.match(access, /FEATURE_BETA/);
  assert.match(access, /FEATURE_PLATFORM_DISABLED/);
  assert.match(billing, /featureAccessForUser/);
  assert.match(billing, /billing_feature_entitlements/);
  assert.match(source('src/utils/request/index.js'), /x-shroom-platform/);
});

test('consumer app no longer exposes the temporary company console', () => {
  const pages = source('src/pages.json');
  const settings = source('src/pages/shroom/settings.vue');
  assert.doesNotMatch(pages, /pages\/admin\/ai-company/);
  assert.doesNotMatch(settings, /settings-ai-company|openAiCompany|adminStatus/);
});

test('independent admin client covers users, features, agents and audit', () => {
  const app = source('admin/src/App.vue');
  const api = source('admin/src/api.js');
  const nginx = source('server/deploy/shroom-evox-run.nginx.conf');
  for (const label of ['总览', '用户管理', '功能管理', '公司 Agent', '审计日志']) assert.match(app, new RegExp(label));
  assert.match(api, /credentials: 'same-origin'/);
  assert.match(api, /x-shroom-admin-csrf/);
  assert.match(nginx, /location (?:\^~ )?\/admin\//);
});
