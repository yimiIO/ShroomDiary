'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  WELLBEING_REVIEW_VERSION,
  WELLBEING_VALUE_TYPES,
  normalizeReviewedWellbeing,
  reviewPrompt
} = require('../src/wellbeing-review');

test('reviewer only keeps grounded self-observations with an explicit user value', () => {
  const diary = { id: 'd1', content: '昨晚只睡了四小时，今天头痛。' };
  const reviewed = normalizeReviewedWellbeing({
    decision: 'KEEP',
    diaryId: 'd1',
    confidence: 0.91,
    qualityChecks: { selfExperience: true, wellbeingSignal: true, longitudinalValue: true, evidenceGrounded: true, notDerived: true },
    healthValueTypes: ['STATE', 'TRIGGER_CONTEXT', 'NOT_ALLOWED'],
    whyUseful: '同时保留了睡眠缩短和头痛，便于后续核对是否反复同现。',
    healthExtraction: {
      physicalObservations: [{ symptom: '头痛', evidenceExcerpt: '今天头痛', certainty: 'EXPLICIT' }],
      lifestyleFactors: [{ factor: '只睡了四小时', category: 'SLEEP', evidenceExcerpt: '昨晚只睡了四小时', certainty: 'EXPLICIT' }]
    }
  }, diary);

  assert.ok(reviewed);
  assert.deepEqual(reviewed.healthValueTypes, ['STATE', 'TRIGGER_CONTEXT']);
  assert.equal(reviewed.confidence, 0.91);
  assert.match(reviewed.whyUseful, /后续核对/u);
  assert.equal(reviewed.reviewVersion, WELLBEING_REVIEW_VERSION);
  assert.ok(WELLBEING_VALUE_TYPES.includes('RELIEF_PROTECTIVE'));
});

test('reviewer rejects its own rejection, wrong diary ids and invented evidence', () => {
  const diary = { id: 'd1', content: '今天我有些疲惫。' };
  assert.equal(normalizeReviewedWellbeing({ decision: 'REJECT' }, diary), null);
  assert.equal(normalizeReviewedWellbeing({
    decision: 'KEEP', diaryId: 'd2', whyUseful: '有助于看到变化',
    confidence: 0.9, qualityChecks: { selfExperience: true, wellbeingSignal: true, longitudinalValue: true, evidenceGrounded: true, notDerived: true },
    healthExtraction: { physicalObservations: [{ symptom: '疲惫', evidenceExcerpt: '今天我有些疲惫' }] }
  }, diary), null);
  assert.equal(normalizeReviewedWellbeing({
    decision: 'KEEP', diaryId: 'd1', whyUseful: '有助于看到变化',
    confidence: 0.9, qualityChecks: { selfExperience: true, wellbeingSignal: true, longitudinalValue: true, evidenceGrounded: true, notDerived: true },
    healthExtraction: { physicalObservations: [{ symptom: '头痛', evidenceExcerpt: '我今天头痛' }] }
  }, diary), null);
  assert.equal(normalizeReviewedWellbeing({
    decision: 'KEEP', diaryId: 'd1', confidence: 0.77,
    qualityChecks: { selfExperience: true, wellbeingSignal: true, longitudinalValue: true, evidenceGrounded: true, notDerived: true },
    whyUseful: '有助于看到变化',
    healthExtraction: { physicalObservations: [{ symptom: '疲惫', evidenceExcerpt: '今天我有些疲惫' }] }
  }, diary), null);
});

test('review prompt is an independent value audit, not a narrower keyword filter', () => {
  const prompt = reviewPrompt();
  for (const required of [
    '独立重读完整日记', '可以补充第一阶段遗漏', '数量不设上限',
    '用户本人', '保护因素', '纯知识', '不证明因果', 'whyUseful'
  ]) assert.match(prompt, new RegExp(required, 'u'));
  assert.match(prompt, /userFeedback/u);
});

test('wellbeing review schema and interface preserve user decisions and feedback', () => {
  const records = fs.readFileSync(path.join(__dirname, '../src/wellbeing-records.js'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/wellbeing.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../../src/pages/shroom/wellbeing.vue'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '../sql/029_wellbeing_product_review.sql'), 'utf8');

  assert.match(records, /status !== 'PENDING'/u);
  for (const column of ['health_value_types', 'why_useful', 'confidence', 'review_version', 'feedback_reason', 'source_fingerprint']) {
    assert.match(migration, new RegExp(column, 'u'));
  }
  assert.match(route, /feedback_reason/u);
  assert.match(page, /为什么值得留下/u);
  assert.match(page, /保留这条观察/u);
  assert.match(page, /这不是身心线索/u);
  assert.match(page, /showActionSheet/u);
});
