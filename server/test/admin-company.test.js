'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('AI company storage separates roles, agents, evidence runs and CEO decisions', () => {
  const migration = source('server/sql/041_ai_company.sql');
  const operations = source('server/sql/042_operations_department.sql');
  const xiaohongshu = source('server/sql/045_xiaohongshu_agent_team.sql');
  const visual = source('server/sql/046_xiaohongshu_visual_pipeline.sql');
  const benchmark = source('server/sql/047_xiaohongshu_benchmark_research.sql');
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
  assert.match(operations, /ADD COLUMN IF NOT EXISTS operating_system jsonb/);
  assert.match(operations, /'operations', '运营与获客部门'/);
  assert.match(operations, /'new-media-operator', 'operations', '新媒体运营 Agent'/);
  assert.match(operations, /'content-compliance', 'operations', '内容事实与合规 Agent', '独立门禁'/);
  assert.match(operations, /默认不得自动发布/);
  assert.match(operations, /首次价值激活/);
  assert.match(xiaohongshu, /'xiaohongshu-signal-analyst', 'operations', '小红书目标用户信号分析 Agent'/);
  assert.match(xiaohongshu, /'xiaohongshu-content-generator', 'operations', '小红书内容生成 Agent'/);
  assert.match(xiaohongshu, /"canPublish": false/);
  assert.match(xiaohongshu, /"canScoreOwnContent": false/);
  assert.match(xiaohongshu, /"requiresCompliancePass": true/);
  assert.match(xiaohongshu, /"status": "APPROVED_BY_CEO"/);
  assert.match(xiaohongshu, /"publicationState": "NOT_PUBLISHED"/);
  assert.match(visual, /'xiaohongshu-visual-director', 'operations', '小红书视觉导演 Agent'/);
  assert.match(visual, /'xiaohongshu-asset-generator', 'operations', '小红书视觉素材生成 Agent'/);
  assert.match(visual, /'xiaohongshu-carousel-renderer', 'operations', '小红书图文排版 Agent'/);
  assert.match(visual, /'xiaohongshu-visual-qa', 'operations', '小红书视觉质检 Agent', '独立门禁'/);
  assert.match(visual, /"canRenderChineseCopy": false/);
  assert.match(visual, /"textRendering": "DETERMINISTIC"/);
  assert.match(visual, /"canApproveOwnGeneration": false/);
  assert.match(benchmark, /name = '小红书标杆与目标用户信号分析 Agent'/);
  assert.match(benchmark, /"researchModes": \["ACCOUNT_BENCHMARK", "POST_EVALUATION"\]/);
  assert.match(benchmark, /"noteLevelClaimsRequireDirectNoteAudit": true/);
});

test('formal admin authorization is checked from the database on every request', () => {
  const adminAuth = source('server/src/admin-auth.js');
  const route = source('server/src/routes/admin-console.js');
  const app = source('server/src/app.js');

  assert.match(adminAuth, /UPDATE admin_sessions s/);
  assert.match(adminAuth, /s\.admin_user_id = m\.user_id/);
  assert.match(adminAuth, /u\.account_status = 'ACTIVE'/);
  assert.match(adminAuth, /requireAdminCsrf/);
  assert.match(route, /router\.use\(requireAdminSession\)/);
  assert.match(route, /router\.use\(requireAdminCsrf\)/);
  assert.match(route, /requirePermission\('agents\.write'\)/);
  assert.doesNotMatch(route, /x-shroom-admin-token|ADMIN_CONSOLE_PASSWORD/);
  assert.match(app, /app\.use\('\/api\/admin\/v2', adminConsoleRoutes\)/);
  assert.doesNotMatch(app, /\/api\/admin\/v1/);
});

test('management API records evidence and keeps high-impact decisions with the CEO', () => {
  const route = source('server/src/routes/admin-console.js');
  assert.match(route, /ON CONFLICT \(department_key, run_date\) DO UPDATE/);
  assert.match(route, /safety_status/);
  assert.match(route, /router\.post\('\/company\/decisions'/);
  assert.match(route, /router\.patch\('\/company\/decisions\/:id'/);
  assert.match(route, /requireFreshReauth\(\)/);
  assert.match(route, /WHERE id = \$1 AND status = 'PENDING'/);
  assert.match(route, /CEO_DECISION_RESOLVED/);
  assert.match(route, /DEPARTMENT_RUN_(?:UPDATED|CREATED)/);
});

test('automation writes department evidence only through its bound runner identity', () => {
  const route = source('server/src/routes/agent-control.js');
  assert.match(route, /a\.department_key/);
  assert.match(route, /router\.post\('\/department-runs'/);
  assert.match(route, /router\.get\('\/department-runs\/:runDate'/);
  assert.match(route, /router\.post\('\/decisions'/);
  assert.match(route, /req\.runner\.department_key/);
  assert.match(route, /req\.runner\.level !== 'L1'/);
  assert.match(route, /source = 'AUTOMATION'/);
  assert.match(route, /ON CONFLICT \(run_id, title\) WHERE run_id IS NOT NULL DO UPDATE/);
  assert.doesNotMatch(route, /req\.body\?\.departmentKey/);
});

test('AI company operations moved to the independent formal admin console', () => {
  const page = source('admin/src/views/AgentsView.vue');
  const app = source('admin/src/App.vue');
  const settings = source('src/pages/shroom/settings.vue');
  const pages = JSON.parse(source('src/pages.json'));
  const route = pages.pages.find(item => item.path === 'pages/admin/ai-company');

  assert.equal(route, undefined);
  assert.match(app, /request\('\/session\/login'/);
  assert.match(page, /CEO DECISIONS/);
  assert.match(page, /REAL_WORLD/);
  assert.match(page, /v-for="department in company\.departments" :key="department\.key"/);
  assert.match(page, /Runner Token/);
  assert.match(page, /EXECUTION TRACE/);
  assert.doesNotMatch(settings, /settings-ai-company|adminAllowed|openAiCompany/);
});
