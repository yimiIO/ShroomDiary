'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { keywordTerms, normalizedScope, rrfMerge } = require('../src/memory-retrieval');

test('memory scope accepts only bounded dates and UUIDs', () => {
  const scope = normalizedScope({
    dateFrom: '2025-01-01',
    dateTo: 'not-a-date',
    diaryIds: ['11111111-1111-4111-8111-111111111111', 'forged']
  });
  assert.deepEqual(scope, {
    dateFrom: '2025-01-01',
    dateTo: null,
    diaryIds: ['11111111-1111-4111-8111-111111111111']
  });
});

test('Chinese memory questions produce useful bounded keyword terms', () => {
  const terms = keywordTerms('这几年，我对工作的看法有什么变化？');
  assert.ok(terms.includes('工作'));
  assert.ok(terms.length <= 10);
  assert.equal(terms.includes('什么'), false);
});

test('reciprocal rank fusion deduplicates diaries and excludes the seed', () => {
  const merged = rrfMerge([
    { name: 'semantic', rows: [{ diary_id: 'a' }, { diary_id: 'seed' }, { diary_id: 'b' }] },
    { name: 'keyword', rows: [{ diary_id: 'b' }, { diary_id: 'c' }] }
  ], 'seed', 10);
  assert.deepEqual(merged.map(item => item.row.diary_id), ['b', 'a', 'c']);
  assert.deepEqual(merged[0].reasons, ['semantic', 'keyword']);
});

test('reciprocal rank fusion keeps Codex tasks distinct from diaries', () => {
  const merged = rrfMerge([
    { name: 'keyword', rows: [{ diary_id: 'diary-1' }] },
    { name: 'codex_keyword', rows: [{ memory_key: 'codex:connection:task-1' }] },
    { name: 'codex_time_sample', rows: [{ memory_key: 'codex:connection:task-1' }] }
  ], null, 10);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].reasons, ['codex_keyword', 'codex_time_sample']);
});
