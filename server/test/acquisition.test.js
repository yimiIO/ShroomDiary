'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('acquisition storage keeps campaign attribution without sensitive browsing data', () => {
  const migration = source('server/sql/043_acquisition_attribution.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS acquisition_campaigns/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS acquisition_touchpoints/);
  assert.match(migration, /UNIQUE \(visitor_id, content_code\)/);
  assert.match(migration, /acquisition_touchpoints_primary_user_idx/);
  assert.match(migration, /'xhs-past-self-001'/);
  assert.match(migration, /'PAUSED'/);
  assert.match(migration, /status = EXCLUDED\.status/);
  assert.doesNotMatch(migration, /ip_address|user_agent|referer|diary_content/);
});

test('public touch endpoint only accepts known ready campaigns and rate limits writes', () => {
  const route = source('server/src/routes/acquisition.js');
  const app = source('server/src/app.js');
  assert.match(route, /router\.post\('\/touch'/);
  assert.match(route, /MAX_TOUCHES_PER_WINDOW/);
  assert.match(route, /status IN \('READY', 'LIVE'\)/);
  assert.match(route, /ON CONFLICT \(visitor_id, content_code\) DO UPDATE/);
  assert.doesNotMatch(route, /req\.body\.userId/);
  assert.match(app, /app\.use\('\/api\/acquisition\/v1', acquisitionRoutes\)/);
});

test('registration claims only an opaque touch id and landing preserves it', () => {
  const auth = source('server/src/routes/auth.js');
  const page = source('src/pages/public/login.vue');
  assert.match(auth, /acquisitionTouchId/);
  assert.match(auth, /WHERE id = \$1 AND user_id IS NULL/);
  assert.doesNotMatch(auth, /req\.body\.acquisitionSource/);
  assert.match(page, /options\.cid/);
  assert.match(page, /shroomAcquisitionVisitorId/);
  assert.match(page, /acquisitionTouchId: this\.acquisitionTouchId/);
  assert.doesNotMatch(page, /campaignContentCode === 'xhs-past-self-001'/);
});

test('admin company overview exposes visits, registration and actual activation separately', () => {
  const route = source('server/src/routes/admin-company.js');
  const page = source('src/pages/admin/ai-company.vue');
  assert.match(route, /first_diaries/);
  assert.match(route, /first_reflections/);
  assert.match(route, /seven_day_returns/);
  assert.match(route, /不记录日记正文、IP、健康或人脉数据/);
  assert.match(page, /data-testid="acquisition-funnel"/);
  assert.match(page, /首次价值激活/);
  assert.match(page, /七日回访/);
});
