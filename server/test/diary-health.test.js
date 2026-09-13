'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  emptyDiaryHealthExtraction,
  legacyHealthObservation,
  normalizeDiaryHealthExtraction
} = require('../src/diary-health');

const diary = '昨晚只睡了四小时，今天觉得胸口发紧，好像和连续喝咖啡有关。现在胸口发紧越来越明显。';
test('one diary health extraction keeps grounded observations and uncertainty', () => {
  const result = normalizeDiaryHealthExtraction({
    psychologicalObservations: [{
      observation: '担心身体状态',
      aspect: 'EMOTION',
      evidenceExcerpt: '今天觉得胸口发紧',
      certainty: 'EXPLICIT'
    }],
    physicalObservations: [{
      symptom: '胸口发紧', bodyAreas: ['胸口'], severity: 7,
      evidenceExcerpt: '现在胸口发紧越来越明显', certainty: 'EXPLICIT'
    }],
    lifestyleFactors: [{
      factor: '连续喝咖啡', category: 'CAFFEINE',
      evidenceExcerpt: '好像和连续喝咖啡有关', certainty: 'EXPLICIT'
    }],
    environmentFactors: [{ observation: '不存在的高海拔', category: 'ALTITUDE', evidenceExcerpt: '高海拔' }],
    missingInformation: ['缺少持续时间'],
    redFlags: [{ signal: '胸口不适正在加重', evidenceExcerpt: '现在胸口发紧越来越明显', urgency: 'EMERGENCY' }]
  }, { diaryContent: diary });

  assert.equal(result.psychologicalObservations.length, 1);
  assert.equal(result.physicalObservations[0].symptom, '胸口发紧');
  assert.equal(result.lifestyleFactors[0].certainty, 'UNCERTAIN');
  assert.equal(result.environmentFactors.length, 0);
  assert.equal(Object.hasOwn(result, 'healthInquiryLinks'), false);
  assert.equal(result.redFlags[0].urgency, 'EMERGENCY');
  assert.match(result.redFlags[0].action, /急救|急诊/u);
});

test('wellbeing extraction ignores inquiry links and discards ungrounded red flags', () => {
  const result = normalizeDiaryHealthExtraction({
    healthInquiryLinks: [{ inquiryId: '11111111-1111-4111-8111-111111111111', evidenceExcerpt: '今天觉得胸口发紧', confidence: 0.9 }],
    redFlags: [{ signal: '危险', evidenceExcerpt: '日记没有这句话', urgency: 'EMERGENCY' }]
  }, { diaryContent: diary });

  assert.equal(Object.hasOwn(result, 'healthInquiryLinks'), false);
  assert.deepEqual(result.redFlags, []);
});

test('diary health extraction has a stable empty shape and legacy inquiry projection', () => {
  const empty = emptyDiaryHealthExtraction();
  assert.deepEqual(Object.keys(empty), [
    'psychologicalObservations', 'physicalObservations', 'lifestyleFactors',
    'environmentFactors', 'missingInformation', 'redFlags'
  ]);

  const result = normalizeDiaryHealthExtraction({
    psychologicalObservations: [{ observation: '很焦虑', aspect: 'EMOTION', evidenceExcerpt: '很焦虑' }],
    physicalObservations: [{ symptom: '头痛', bodyAreas: ['头'], severity: 5, duration: '两小时', evidenceExcerpt: '头痛' }],
    lifestyleFactors: [{ factor: '只睡四小时', category: 'SLEEP', evidenceExcerpt: '只睡四小时' }]
  }, { diaryContent: '很焦虑，头痛，只睡四小时。' });
  const legacy = legacyHealthObservation(result);
  assert.deepEqual(legacy.psychologicalFeelings, ['很焦虑']);
  assert.deepEqual(legacy.physicalSymptoms, ['头痛']);
  assert.equal(legacy.sleep.note, '只睡四小时');
});
