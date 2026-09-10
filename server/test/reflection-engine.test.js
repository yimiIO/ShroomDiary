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

test('a reusable card draft needs both an insight and concrete usage', () => {
  const result = normalizeReflection({
    observations: [{ text: '观察', evidence: ['S1'] }],
    cardDraft: { seedSentence: '先核对事实', usageItems: [] }
  }, retrieval, 'related');
  assert.equal(result.cardDraft, null);
});
