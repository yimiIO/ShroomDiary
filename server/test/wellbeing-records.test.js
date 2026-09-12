'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mapWellbeingRecord,
  normalizeWellbeingCandidate,
  observationCategories,
  syncDiaryWellbeingRecord
} = require('../src/wellbeing-records');

test('wellbeing extraction is grounded in an exact diary excerpt', () => {
  const diary = '昨晚只睡了五小时，今天下午很疲惫。';
  const valid = normalizeWellbeingCandidate({
    sourceExcerpt: '昨晚只睡了五小时',
    observation: { sleep: { hours: 5 }, physicalSymptoms: ['疲惫'] }
  }, diary);
  assert.equal(valid.sourceExcerpt, '昨晚只睡了五小时');
  assert.deepEqual(valid.categories, ['PHYSICAL', 'SLEEP']);
  assert.equal(normalizeWellbeingCandidate({
    sourceExcerpt: '日记里没有这句话',
    observation: { physicalSymptoms: ['头痛'] }
  }, diary), null);
});

test('wellbeing categories keep facts separate from questions and diagnoses', () => {
  assert.deepEqual(observationCategories({
    psychologicalFeelings: ['焦虑'],
    stressors: ['工作'],
    sleep: { quality: 2 },
    behaviors: ['晚睡'],
    measurements: ['心率 90'],
    testResults: ['血常规正常']
  }), ['PSYCHOLOGICAL', 'SLEEP', 'HABIT', 'MEASUREMENT', 'TEST_RESULT']);
  const mapped = mapWellbeingRecord({
    id: 'record-a', status: 'CONFIRMED', source_type: 'MANUAL', recorded_on: '2026-09-13',
    observation: { physicalSymptoms: ['头痛'] }, ai_allowed: true
  });
  assert.equal(mapped.status, 'CONFIRMED');
  assert.deepEqual(mapped.categories, ['PHYSICAL']);
  assert.equal(Object.hasOwn(mapped, 'question'), false);
});

test('confirmed wellbeing records are never overwritten by a later diary analysis', async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (/SELECT id, status FROM wellbeing_records/u.test(sql)) {
        return { rowCount: 1, rows: [{ id: 'record-a', status: 'CONFIRMED' }] };
      }
      throw new Error('confirmed record should not be updated');
    }
  };
  const id = await syncDiaryWellbeingRecord(client, {
    userId: 'user-a', diary: { id: 'diary-a', content: '今天头痛', diary_date: '2026-09-13' },
    candidate: { sourceExcerpt: '今天头痛', observation: { physicalSymptoms: ['头痛'] } }
  });
  assert.equal(id, 'record-a');
  assert.equal(calls.length, 1);
});
