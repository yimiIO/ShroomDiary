'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  mapWellbeingRecord,
  normalizeWellbeingCandidate,
  observationCategories,
  syncDiaryWellbeingRecord
} = require('../src/wellbeing-records');

test('wellbeing status update gives PostgreSQL parameters explicit types', () => {
  const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/wellbeing.js'), 'utf8');
  assert.match(routeSource, /status = \$3::varchar\(16\)/);
  assert.match(routeSource, /CASE WHEN \$3::varchar\(16\) = 'CONFIRMED'/);
  assert.match(routeSource, /ai_allowed = \$4::boolean/);
});

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

test('wellbeing dates keep their Shanghai calendar day', () => {
  const mapped = mapWellbeingRecord({
    id: 'record-date', status: 'PENDING', source_type: 'MIGRATED',
    recorded_on: new Date('2026-09-09T16:00:00.000Z'),
    observation: { sleep: { hours: 6 } }, ai_allowed: false
  });
  assert.equal(mapped.recordedOn, '2026-09-10');
});

test('structured diary health stays in the same wellbeing candidate with uncertainty and links', () => {
  const inquiryId = '11111111-1111-4111-8111-111111111111';
  const diary = '今天头痛，好像和只睡了四小时有关。';
  const candidate = normalizeWellbeingCandidate({
    extraction: {
      physicalObservations: [{ symptom: '头痛', evidenceExcerpt: '今天头痛', certainty: 'EXPLICIT' }],
      lifestyleFactors: [{ factor: '只睡了四小时', category: 'SLEEP', evidenceExcerpt: '好像和只睡了四小时有关', certainty: 'EXPLICIT' }],
      healthInquiryLinks: [{ inquiryId, reason: '可能相关', evidenceExcerpt: '今天头痛', confidence: 0.8 }],
      missingInformation: ['缺少持续时间']
    }
  }, diary, [{ id: inquiryId, inquiryType: 'PHYSICAL_HEALTH' }]);

  assert.deepEqual(candidate.categories, ['PHYSICAL', 'SLEEP']);
  assert.equal(candidate.extraction.lifestyleFactors[0].certainty, 'UNCERTAIN');
  assert.equal(candidate.extraction.healthInquiryLinks[0].inquiryId, inquiryId);
  assert.deepEqual(candidate.extraction.missingInformation, ['缺少持续时间']);
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
