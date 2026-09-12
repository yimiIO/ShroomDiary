'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildDiaryBatches,
  normalizeHistoricalCandidates,
  storeHistoricalCandidates
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

test('historical candidates preserve bounded health type and observations', () => {
  const result = normalizeHistoricalCandidates([
    {
      question: '我的睡眠和精力变化是否长期相关',
      context: '需要继续记录作息与白天状态。',
      confidence: 0.88,
      inquiryType: 'PHYSICAL_HEALTH',
      healthObservation: {
        physicalSymptoms: ['疲劳', '疲劳'],
        sleep: { hours: 30, quality: 9 },
        measurements: ['未记录']
      },
      sourceDiaryIds: ['diary-a']
    },
    {
      question: '这个类型不合法',
      confidence: 0.8,
      inquiryType: 'DIAGNOSIS',
      healthObservation: { physicalSymptoms: ['不应保留'] },
      sourceDiaryIds: ['diary-b']
    }
  ], ['diary-a', 'diary-b'], []);

  assert.equal(result[0].inquiryType, 'PHYSICAL_HEALTH');
  assert.deepEqual(result[0].healthObservation.physicalSymptoms, ['疲劳']);
  assert.equal(result[0].healthObservation.sleep.hours, 24);
  assert.equal(result[0].healthObservation.sleep.quality, 5);
  assert.equal(result[1].inquiryType, 'GENERAL');
  assert.deepEqual(result[1].healthObservation, {});
});

test('historical candidates only suggest an existing inquiry of the same type', () => {
  const result = normalizeHistoricalCandidates([
    {
      question: '这条心理观察是否已有问题',
      confidence: 0.82,
      inquiryType: 'PSYCHOLOGICAL',
      sourceDiaryIds: ['diary-a'],
      existingInquiryId: 'general-inquiry'
    },
    {
      question: '这条身体观察是否已有问题',
      confidence: 0.84,
      inquiryType: 'PHYSICAL_HEALTH',
      sourceDiaryIds: ['diary-b'],
      existingInquiryId: 'health-inquiry'
    }
  ], ['diary-a', 'diary-b'], [
    { id: 'general-inquiry', inquiryType: 'GENERAL' },
    { id: 'health-inquiry', inquiryType: 'PHYSICAL_HEALTH' }
  ]);

  assert.equal(result[0].suggestedInquiryId, null);
  assert.equal(result[1].suggestedInquiryId, 'health-inquiry');
});

test('historical storage persists health type and observations with each owned diary link', async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rowCount: 1, rows: [{ id: values[0] }] };
    }
  };

  const inserted = await storeHistoricalCandidates(client, {
    userId: 'user-a',
    modelVersion: 'review-v1',
    candidates: [{
      question: '我的睡眠与白天精力如何一起变化？',
      context: '需要继续观察。',
      confidence: 0.9,
      inquiryType: 'PHYSICAL_HEALTH',
      healthObservation: { physicalSymptoms: ['疲劳'] },
      sourceDiaryIds: ['diary-a', 'diary-b'],
      suggestedInquiryId: null
    }]
  });

  assert.equal(inserted, 1);
  assert.match(calls[0].sql, /inquiry_type, health_observation/u);
  assert.equal(calls[0].values[8], 'PHYSICAL_HEALTH');
  assert.deepEqual(JSON.parse(calls[0].values[9]), { physicalSymptoms: ['疲劳'] });
  assert.deepEqual(calls.slice(1).map(call => call.values[1]), ['diary-a', 'diary-b']);
});
