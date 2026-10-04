'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { shouldReuseSavedResult } = require('../src/analysis-reuse-policy');

const root = path.resolve(__dirname, '../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('saved AI results are reused unless regeneration is explicit', () => {
  for (const status of ['done', 'failed', 'completed', 'partial', 'insufficient_evidence']) {
    assert.equal(shouldReuseSavedResult({ status }, false), true);
    assert.equal(shouldReuseSavedResult({ status }, true), false);
  }
  for (const status of ['pending', 'running', 'processing']) {
    assert.equal(shouldReuseSavedResult({ status }, false), true);
    assert.equal(shouldReuseSavedResult({ status }, true), true);
  }
  assert.equal(shouldReuseSavedResult(null, false), false);
});

test('five-view page opens a saved analysis and only explicit actions regenerate it', () => {
  const page = source('src/pages/shroom/ai-analysis.vue');
  const route = source('server/src/routes/ai.js');

  assert.match(page, /this\.autoStart && this\.analysisEnabled && !existing\.data/);
  assert.match(page, /regenerate: options\.regenerate === true/);
  assert.match(page, /startAnalysis\(\{ regenerate: true \}\)/);
  assert.match(route, /shouldReuseSavedResult\(saved\.rows\[0\], regenerate\)/);
  assert.match(route, /已打开保存的观察结果/);
  assert.match(route, /WHEN five_views <> '\{\}'::jsonb OR jsonb_array_length\(observations\) > 0 THEN 'done'/);
  assert.match(page, /当前仍显示已保存的结果/);
});

test('reflection entry reuses the matching saved conversation and exposes explicit re-review', () => {
  const page = source('src/pages/shroom/memory.vue');
  const route = source('server/src/routes/memory.js');

  assert.match(route, /seed_diary_id IS NOT DISTINCT FROM \$2::uuid/);
  assert.match(route, /initial_question = \$5/);
  assert.match(route, /WHEN status = 'processing' THEN 0/);
  assert.match(route, /shouldReuseSavedResult\(saved, regenerate\)/);
  assert.match(route, /已打开保存的回看/);
  assert.match(page, /基于现在的记录重新回看/);
  assert.match(page, /regenerate: true/);
  assert.match(page, /旧结果不会因此丢失/);
});
