'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('stage reviews are isolated to an owned compound plan', () => {
  const route = source('server/src/routes/compound-progress.js');
  const page = source('src/pages/shroom/life-os-weekly.vue');
  const migration = source('server/sql/040_compound_review_scope.sql');

  assert.match(route, /ownedThread\(req\.user\.id, threadId\)/);
  assert.match(route, /reviewSources\(req\.user\.id, scopeStart, scopeEnd, threadId\)/);
  assert.match(route, /thread_id IS NOT DISTINCT FROM \$2::uuid/);
  assert.match(route, /\(id, user_id, thread_id, scope_start/);
  assert.match(page, /params\.threadId = this\.threadId/);
  assert.match(page, /threadId: this\.threadId \|\| undefined/);
  assert.match(page, /只回看这项计划真实做过和留下的结果/);
  assert.match(migration, /compound_reviews_thread_owner_fk/);
  assert.match(migration, /compound_reviews_one_thread_draft_idx/);
});
