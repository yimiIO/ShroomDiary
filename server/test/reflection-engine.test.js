'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReflection } = require('../src/reflection-engine');

const retrieval = {
  scope: { dateFrom: null, dateTo: null, diaryIds: [], tags: [] },
  coverage: { totalAvailable: 4, processedDiaries: 2, complete: false },
  sources: [{
    sourceRef: 'S1',
    diary_id: '11111111-1111-4111-8111-111111111111',
    content_version: 2,
    sourceStart: 0,
    sourceEnd: 4,
    excerpt: '真实原文',
    occurred_at: '2026-01-01T00:00:00Z',
    tags: [],
    role: 'memory',
    retrievalReasons: ['keyword']
  }]
};

test('uncited personal claims and fabricated source references are removed', () => {
  const result = normalizeReflection({
    summary: '有一个可核对的发现。',
    observations: [
      { text: '有证据', evidence: ['S1'] },
      { text: '没有证据', evidence: [] },
      { text: '伪造引用', evidence: ['S999'] }
    ],
    timeline: [{ date: '2026', text: '节点', evidence: ['S1'] }]
  }, retrieval, 'change');
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.observations.map(item => item.text), ['有证据']);
  assert.equal(result.timeline.length, 1);
  assert.equal(result.sources[0].sourceVersion, 2);
});

test('reflection results lead with one sentence and give every observation a scannable headline', () => {
  const result = normalizeReflection({
    summary: '最重要的发现是你的处理方式已经变了。这里还有很多解释，不应该堆在第一层。',
    observations: [
      { headline: '你开始先保护结果', text: '过去你会先证明自己，这次则先处理了现实风险。', evidence: ['S1'] },
      { text: '你对同类问题的反应已经不同。第二句是详细解释。', evidence: ['S1'] }
    ]
  }, retrieval, 'change');

  assert.equal(result.summary, '最重要的发现是你的处理方式已经变了。');
  assert.equal(result.observations[0].headline, '你开始先保护结果');
  assert.equal(result.observations[0].text, '过去你会先证明自己，这次则先处理了现实风险。');
  assert.equal(result.observations[1].headline, '你对同类问题的反应已经不同。');
});

test('a reusable card draft needs both an insight and concrete usage', () => {
  const result = normalizeReflection({
    observations: [{ text: '观察', evidence: ['S1'] }],
    cardDraft: { seedSentence: '先核对事实', usageItems: [] }
  }, retrieval, 'related');
  assert.equal(result.cardDraft, null);
});

test('Codex evidence remains explicitly typed and is not presented as a diary', () => {
  const externalRetrieval = {
    scope: { dateFrom: null, dateTo: null, diaryIds: [] },
    coverage: { totalAvailable: 1, processedRecords: 1, complete: true },
    sources: [{
      sourceRef: 'S1',
      source_type: 'CODEX_TASK',
      source_name: '菇日记 · Codex 数据源',
      connection_id: '11111111-1111-4111-8111-111111111111',
      external_task_id: 'thread-1',
      source_fingerprint: 'a'.repeat(64),
      sourceStart: 0,
      sourceEnd: 8,
      excerpt: 'Codex 任务',
      occurred_at: '2026-09-13T02:00:00Z',
      role: 'memory',
      retrievalReasons: ['codex_keyword']
    }]
  };
  const result = normalizeReflection({
    observations: [{ text: '来自任务记录的观察', evidence: ['S1'] }],
    cardDraft: { seedSentence: '把任务变成规律', usageItems: ['下次照做'] }
  }, externalRetrieval, 'related');
  assert.equal(result.sources[0].sourceType, 'CODEX_TASK');
  assert.equal(result.sources[0].diaryId, undefined);
  assert.equal(result.status, 'completed');
  assert.equal(result.cardDraft, null);
});
