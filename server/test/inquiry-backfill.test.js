'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildDiaryBatches,
  normalizeHistoricalCandidates
} = require('../src/inquiry-backfill');

test('historical diary batches stay bounded without losing diary ownership', () => {
  const diaries = [
    { id: 'a', diary_date: '2026-01-01', content: '甲'.repeat(80) },
    { id: 'b', diary_date: '2026-01-02', content: '乙'.repeat(80) },
    { id: 'c', diary_date: '2026-01-03', content: '丙'.repeat(80) }
  ];
  const batches = buildDiaryBatches(diaries, { maxChars: 200, maxEntries: 2, maxDiaryChars: 100 });

  assert.equal(batches.length, 2);
  assert.deepEqual(batches.flat().map(item => item.id), ['a', 'b', 'c']);
  assert.ok(batches.every(batch => batch.length <= 2));
});

test('historical candidates retain only supplied diary and inquiry ids', () => {
  const result = normalizeHistoricalCandidates([
    {
      question: '我为什么总在快完成时转向别的事情',
      context: '需要比较后续行为结果。',
      confidence: 0.84,
      sourceDiaryIds: ['diary-a', 'hallucinated', 'diary-a']
    },
    {
      question: '这个问题应关联已有问题吗',
      confidence: 0.76,
      sourceDiaryIds: ['diary-b'],
      existingInquiryId: 'owned-inquiry'
    },
    {
      question: '没有真实来源的问题',
      confidence: 0.99,
      sourceDiaryIds: ['hallucinated']
    }
  ], ['diary-a', 'diary-b'], ['owned-inquiry']);

  assert.equal(result.length, 2);
  assert.deepEqual(result[0].sourceDiaryIds, ['diary-a']);
  assert.equal(result[0].question, '我为什么总在快完成时转向别的事情？');
  assert.equal(result[1].suggestedInquiryId, 'owned-inquiry');
});

test('historical candidates reject low-confidence and duplicate questions', () => {
  const result = normalizeHistoricalCandidates([
    { question: '我真正回避的是什么', confidence: 0.9, sourceDiaryIds: ['diary-a'] },
    { question: '我真正回避的是什么？', confidence: 0.91, sourceDiaryIds: ['diary-b'] },
    { question: '证据还不够', confidence: 0.4, sourceDiaryIds: ['diary-a'] }
  ], ['diary-a', 'diary-b'], []);

  assert.equal(result.length, 1);
});
