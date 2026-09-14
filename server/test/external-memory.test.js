'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  baseCodexTitle,
  codexKeywordChannel,
  codexTemporalChannel,
  logicalTaskId,
  mapCodexMemoryTask,
  validateCodexMemorySources
} = require('../src/external-memory');

function aggregateRow(overrides = {}) {
  return {
    connection_id: '11111111-1111-4111-8111-111111111111',
    external_task_id: 'thread-1',
    title: '修复复制按钮',
    project_label: 'shroom-uniapp',
    first_observed_at: '2026-09-13T01:00:00.000Z',
    last_completed_at: '2026-09-13T02:00:00.000Z',
    turn_count: 4,
    completed_turns: 3,
    interrupted_turns: 1,
    failed_turns: 0,
    latest_outcome_status: 'COMPLETED',
    source_updated_at: '2026-09-13T02:00:01.000Z',
    display_name: '菇日记 · Codex 数据源',
    ...overrides
  };
}

test('Codex turns have one stable logical task identity and base title', () => {
  assert.equal(logicalTaskId('thread-1:turn-4'), 'thread-1');
  assert.equal(logicalTaskId('thread-without-turn'), 'thread-without-turn');
  assert.equal(baseCodexTitle('修复复制按钮 · 后续 12'), '修复复制按钮');
});

test('Codex memory task keeps observed facts and never invents focus time or outcome', () => {
  const task = mapCodexMemoryTask(aggregateRow());
  assert.equal(task.source_type, 'CODEX_TASK');
  assert.equal(task.observed_facts.turnCount, 4);
  assert.match(task.content, /Codex 记录 4 个对话轮次/u);
  assert.doesNotMatch(task.content, /专注|投入|成功/u);
  assert.match(task.source_fingerprint, /^[a-f0-9]{64}$/u);
});

test('Codex retrieval is user scoped, permission scoped and date bounded', async () => {
  const calls = [];
  const queryable = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [aggregateRow()] };
    }
  };
  const scope = { dateFrom: '2026-09-01', dateTo: '2026-09-13', diaryIds: [] };
  const keyword = await codexKeywordChannel(queryable, 'user-1', ['复制'], scope);
  const temporal = await codexTemporalChannel(queryable, 'user-1', scope, 10);
  assert.equal(keyword.rows.length, 1);
  assert.equal(temporal.rows.length, 1);
  assert.match(calls[0].sql, /e\.user_id = \$1 AND c\.ai_allowed/u);
  assert.match(calls[0].sql, /last_completed_at >=/u);
  assert.deepEqual(calls[0].values, ['user-1', ['%复制%'], '2026-09-01', '2026-09-13']);
});

test('stored Codex citations validate against the current authorized aggregate', async () => {
  const row = aggregateRow();
  const task = mapCodexMemoryTask(row);
  const source = {
    sourceRef: 'S1',
    sourceType: 'CODEX_TASK',
    connectionId: task.connection_id,
    externalTaskId: task.external_task_id,
    sourceFingerprint: task.source_fingerprint,
    sourceStart: 0,
    sourceEnd: task.content.length,
    excerpt: task.content
  };
  const queryable = { async query() { return { rows: [row] }; } };
  assert.equal((await validateCodexMemorySources(queryable, 'user-1', [source])).length, 1);
  assert.equal((await validateCodexMemorySources(queryable, 'user-1', [{ ...source, excerpt: '被篡改' }])).length, 0);
});

test('external memory migration invalidates access and tracks source provenance', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../sql/034_external_source_memory.sql'), 'utf8');
  assert.match(migration, /reflection_message_external_sources/u);
  assert.match(migration, /external_activity_corpus_insert/u);
  assert.match(migration, /OLD\.ai_allowed AND NOT NEW\.ai_allowed/u);
  assert.match(migration, /原回答已失效/u);
});

test('days with only an allowed Codex source remain visible in the diary calendar', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/diaries.js'), 'utf8');
  const diaryPage = fs.readFileSync(path.join(__dirname, '../../src/pages/diary/index.vue'), 'utf8');
  assert.match(routes, /source_days AS/u);
  assert.match(routes, /c\.include_in_diary/u);
  assert.match(routes, /source_count/u);
  assert.match(diaryPage, /个 Codex 任务/u);
  assert.match(diaryPage, /最近轮次已结束/u);
  assert.doesNotMatch(diaryPage, /任务运行 \$\{record\.taskRuntimeMinutes\}/u);
});

test('memory status reports authorized Codex tasks as part of the user corpus', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/memory.js'), 'utf8');
  assert.match(routes, /codexTasks/u);
  assert.match(routes, /totalRecords/u);
  assert.match(routes, /c\.ai_allowed/u);
});
