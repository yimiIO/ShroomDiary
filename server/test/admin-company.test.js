'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('AI company storage separates roles, agents, evidence runs and CEO decisions', () => {
  const migration = source('server/sql/041_ai_company.sql');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS role/);
  assert.match(migration, /role IN \('USER', 'ADMIN'\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_company_departments/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_company_agents/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_company_runs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_company_decisions/);
  assert.match(migration, /UNIQUE \(department_key, run_date\)/);
  assert.match(migration, /ai_company_decisions_run_title_idx/);
  for (const state of ['OUTPUT', 'VERIFIED', 'REAL_WORLD', 'NONE']) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  assert.match(migration, /独立门禁/);
  assert.match(migration, /隐私与安全 Agent/);
});

test('admin authorization is checked from the database on every request', () => {
  const http = source('server/src/http.js');
  const auth = source('server/src/routes/auth.js');
  const route = source('server/src/routes/admin-company.js');
  const app = source('server/src/app.js');

  assert.match(http, /SELECT id, mobile, nickname, avatar_url, role FROM users/);
  assert.match(http, /req\.user\.role !== 'ADMIN'/);
  assert.match(http, /仅管理员可访问/);
  assert.match(http, /x-shroom-admin-token/);
  assert.match(http, /ADMIN_UNLOCK_REQUIRED/);
  assert.match(http, /req\.authKind === 'api-token'/);
  assert.match(auth, /role: user\.role \|\| 'USER'/);
  assert.ok(route.indexOf("router.get('/status'") < route.indexOf('router.use(requireAdmin)'));
  assert.ok(route.indexOf("router.post('/unlock'") < route.indexOf('router.use(requireAdmin)'));
  assert.ok(route.indexOf('router.use(requireAdmin)') < route.indexOf("router.get('/company'"));
  assert.match(route, /config\.adminConsoleUsername/);
  assert.match(route, /verifyPassword\(password, config\.adminConsolePasswordHash\)/);
  assert.doesNotMatch(route, /SELECT password_hash FROM users/);
  assert.match(route, /ADMIN_UNLOCK_MAX_ATTEMPTS/);
  assert.doesNotMatch(route, /req\.body\.userId/);
  assert.match(app, /app\.use\('\/api\/admin\/v1', adminCompanyRoutes\)/);
});

test('management API records evidence and keeps high-impact decisions with the CEO', () => {
  const route = source('server/src/routes/admin-company.js');
  assert.match(route, /ON CONFLICT \(department_key, run_date\) DO UPDATE/);
  assert.match(route, /req\.authKind === 'api-token' \? 'AUTOMATION' : 'MANUAL'/);
  assert.match(route, /runDate: dateOnly\(row\.run_date\)/);
  assert.match(route, /safety_status/);
  assert.match(route, /router\.post\('\/decisions'/);
  assert.match(route, /ON CONFLICT \(run_id, title\) WHERE run_id IS NOT NULL DO UPDATE/);
  assert.match(route, /router\.patch\('\/decisions\/:id'/);
  assert.match(route, /WHERE id = \$1 AND status = 'PENDING'/);
});

test('AI company page is admin-only, responsive and reachable from settings', () => {
  const page = source('src/pages/admin/ai-company.vue');
  const settings = source('src/pages/shroom/settings.vue');
  const pages = JSON.parse(source('src/pages.json'));
  const route = pages.pages.find(item => item.path === 'pages/admin/ai-company');

  assert.ok(route);
  assert.match(page, /adminStatus/);
  assert.match(page, /v-else-if="!allowed"/);
  assert.match(page, /v-else-if="!unlocked"/);
  assert.match(page, /data-testid="admin-unlock"/);
  assert.match(page, /v-model\.trim="adminUsername"/);
  assert.match(page, /username: this\.adminUsername/);
  assert.match(page, /password: this\.adminPassword/);
  assert.match(page, /x-shroom-admin-token/);
  assert.match(page, /onUnload\(\)/);
  assert.match(page, /CEO DECISIONS/);
  assert.match(page, /REAL_WORLD/);
  assert.match(page, /隐私与安全/);
  assert.match(page, /v-for="agent in teamAgents" :key="agent\.key"/);
  assert.match(page, /v-for="department in company\.departments" :key="department\.key"/);
  assert.match(page, /item\.departmentKey === this\.primaryDepartment\.key/);
  assert.match(page, /@media \(min-width: 920px\)/);
  assert.match(settings, /v-if="adminAllowed"/);
  assert.match(settings, /data-testid="settings-ai-company"/);
  assert.match(settings, /\/pages\/admin\/ai-company/);
});
