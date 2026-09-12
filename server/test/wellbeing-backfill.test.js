'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHistoricalWellbeingRecords } = require('../src/wellbeing-backfill');

test('historical wellbeing records require an owned diary and exact source excerpt', () => {
  const diaries = [{ id: 'd1', diary_date: '2026-09-01', content: '昨晚只睡了四小时，今天头痛。' }];
  const records = normalizeHistoricalWellbeingRecords([
    {
      diaryId: 'd1',
      healthExtraction: {
        physicalObservations: [{ symptom: '头痛', evidenceExcerpt: '今天头痛', certainty: 'EXPLICIT' }],
        lifestyleFactors: [{ factor: '睡了四小时', category: 'SLEEP', evidenceExcerpt: '昨晚只睡了四小时', certainty: 'EXPLICIT' }]
      }
    },
    {
      diaryId: 'unknown',
      healthExtraction: { physicalObservations: [{ symptom: '发烧', evidenceExcerpt: '发烧' }] }
    },
    {
      diaryId: 'd1',
      healthExtraction: { physicalObservations: [{ symptom: '胸痛', evidenceExcerpt: '正文没有这句话' }] }
    }
  ], diaries);

  assert.equal(records.length, 1);
  assert.equal(records[0].diaryId, 'd1');
  assert.equal(records[0].sourceExcerpt, '今天头痛');
  assert.deepEqual(records[0].observation.physicalSymptoms, ['头痛']);
  assert.match(records[0].observation.sleep.note, /睡了四小时/u);
});
