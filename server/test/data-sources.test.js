'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  listDiarySourceActivities,
  normalizeCodexActivity,
  normalizeSyncInterval,
  redactSensitiveText
} = require('../src/data-sources');

test('Codex data source accepts only a minimal activity fact', () => {
  const activity = normalizeCodexActivity({
    externalId: 'thread-1:turn-1',
    title: '修复 https://private.example/path 并联系 13800138000',
    projectLabel: '/Users/person/Documents/Shroom',
    sourceKind: 'vscode',
    startedAt: '2026-09-13T01:00:00Z',
    completedAt: '2026-09-13T01:12:34Z',
    taskRuntimeSeconds: 754,
    activeSecondsEstimate: 900,
    outcomeStatus: 'COMPLETED',
    transcript: '这个字段不应被保存',
    metadata: { category: 'coding', reusable: true, automated: false, rawFinal: '秘密' }
  });

  assert.equal(activity.title, '修复 [链接] 并联系 [手机号]');
  assert.equal(activity.projectLabel, 'Shroom');
  assert.equal(activity.activeSecondsEstimate, 754);
  assert.equal(activity.metadata.rawFinal, undefined);
  assert.equal(activity.transcript, undefined);
});

test('Codex source rejects incomplete or unsupported task facts', () => {
  assert.equal(normalizeCodexActivity({ externalId: 'x', title: '任务' }), null);
  assert.equal(normalizeCodexActivity({
    externalId: 'x', title: '任务', completedAt: '2026-09-13T01:00:00Z', outcomeStatus: 'RUNNING'
  }), null);
});

test('data source copy removes common secrets and path details', () => {
  assert.equal(redactSensitiveText('看 /Users/evan/private/file.js 和 a@example.com'), '看 [本地路径] 和 [邮箱]');
  assert.equal(normalizeSyncInterval(24), 24);
  assert.equal(normalizeSyncInterval(13), 72);
});

test('diary source activity queries stay user scoped and honor AI permission', async () => {
  let captured;
  const queryable = {
    async query(sql, values) {
      captured = { sql, values };
      return { rows: [] };
    }
  };
  await listDiarySourceActivities(queryable, 'user-1', '2026-09-13', { aiOnly: true });
  assert.match(captured.sql, /e\.user_id = \$1/);
  assert.match(captured.sql, /c\.ai_allowed/);
  assert.match(captured.sql, /regexp_replace\(e\.external_id, ':[^']+'/u);
  assert.match(captured.sql, /GROUP BY/u);
  assert.match(captured.sql, /NULL::integer AS task_runtime_seconds/u);
  assert.doesNotMatch(captured.sql, /c\.include_in_diary/);
  assert.deepEqual(captured.values, ['user-1', '2026-09-13']);

  await listDiarySourceActivities(queryable, 'user-1', '2026-09-13');
  assert.match(captured.sql, /c\.include_in_diary/);
});
