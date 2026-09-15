'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('an owned compound plan can only be permanently deleted after exact confirmation', () => {
  const route = source('server/src/routes/compound-progress.js');
  const block = route.match(/router\.delete\('\/threads\/:id'[\s\S]*?\n\}\)\);/);

  assert.ok(block, 'compound delete route should exist');
  assert.match(block[0], /ownedThread\(req\.user\.id/);
  assert.match(block[0], /confirmText !== '永久删除复利计划'/);
  assert.match(block[0], /confirmTitle !== thread\.title/);
  assert.match(block[0], /DELETE FROM compound_threads/);
  assert.match(block[0], /WHERE id = \$1 AND user_id = \$2/);
  assert.match(block[0], /NOT EXISTS[\s\S]*is_primary/);
  assert.doesNotMatch(block[0], /DELETE FROM (users|diaries|life_os_items|todos)/);
});

test('compound UI uses a cross-platform caution panel and distinguishes ledger reset', () => {
  const page = source('src/pages/shroom/compound.vue');
  const ledger = source('src/pages/shroom/financial-ledger.vue');

  assert.match(page, /慎重删除这项复利计划/);
  assert.match(page, /请输入完整计划名称确认/);
  assert.match(page, /删除后无法恢复/);
  assert.match(page, /原始日记、人生 OS 和已有待办不会被删除/);
  assert.match(page, /confirmText: '永久删除复利计划'/);
  assert.doesNotMatch(page, /uni\.showModal/);
  assert.match(ledger, /清空财务数据（保留计划）/);
  assert.match(ledger, /如需删除整个计划/);
});
