'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  WELLBEING_HYPOTHESIS_PROMPT,
  normalizeWellbeingHypotheses,
  unsafeDiagnosticWording
} = require('../src/wellbeing-hypotheses');

const records = [
  { id: 'r1', date: '2026-08-01', sourceExcerpt: '这两周每天都提不起兴趣，工作也做不下去' },
  { id: 'r2', date: '2026-08-15', sourceExcerpt: '还是没兴趣，睡眠也很差，取消了和朋友见面' }
];

function valid(overrides = {}) {
  return {
    stableKey: 'depressive-symptoms',
    domain: 'PSYCHOLOGICAL',
    kind: 'CLINICAL_CONDITION',
    name: '抑郁相关问题需要评估',
    namedPossibilities: [{ name: '抑郁相关症状', role: 'PRIMARY_DIRECTION', why: '持续低落、兴趣减退与功能影响同时出现' }],
    possibilityStatement: '持续低落和兴趣减退可能与抑郁相关问题一致，但日记不能完成诊断。',
    whyPossible: '两个时间点都记录了兴趣下降，并出现工作和社交功能影响。',
    evidenceStrength: 'MODERATE',
    thresholdChecks: {
      repeatedOrPersistent: true,
      functionalImpact: true,
      objectiveFinding: false,
      differentialConsidered: true,
      grounded: true
    },
    supportingEvidence: [{ recordId: 'r1', reason: '持续两周且影响工作' }, { recordId: 'r2', reason: '重复出现且影响社交' }],
    challengingEvidence: [],
    alternatives: ['睡眠不足或近期生活事件'],
    missingInformation: ['低落和兴趣减退是否大部分时间持续至少两周'],
    nextObservations: ['记录情绪、兴趣、睡眠和功能影响的持续天数'],
    careGuidance: '如果持续影响生活，可考虑接受专业心理或精神科评估。',
    redFlags: [],
    ...overrides
  };
}

test('named wellbeing possibilities retain evidence and uncertainty', () => {
  const result = normalizeWellbeingHypotheses([valid()], records);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, '抑郁相关问题需要评估');
  assert.equal(result[0].supportingEvidence.length, 2);
  assert.equal(result[0].namedPossibilities[0].name, '抑郁相关症状');
  assert.deepEqual(result[0].alternatives, ['睡眠不足或近期生活事件']);
  assert.match(result[0].hypothesisKey, /^psychological:/u);
});

test('psychological disease labels require persistence and functional impact', () => {
  assert.equal(normalizeWellbeingHypotheses([valid({
    thresholdChecks: { repeatedOrPersistent: true, functionalImpact: false, differentialConsidered: true, grounded: true }
  })], records).length, 0);
  assert.equal(normalizeWellbeingHypotheses([valid({ supportingEvidence: [{ recordId: 'not-owned', reason: '伪造证据' }] })], records).length, 0);
});

test('definitive diagnoses are rejected', () => {
  assert.equal(unsafeDiagnosticWording('你已经患有抑郁症'), true);
  assert.equal(normalizeWellbeingHypotheses([valid({ possibilityStatement: '你已经确诊为抑郁症。' })], records).length, 0);
});

test('physical clinical directions require persistence or an objective finding', () => {
  const physical = valid({
    stableKey: 'hyperhidrosis', domain: 'PHYSICAL', name: '多汗症方向需要排查',
    possibilityStatement: '反复手汗可能与多汗症相关，也需要排查其他原因。',
    whyPossible: '记录出现反复手汗。',
    thresholdChecks: { repeatedOrPersistent: false, functionalImpact: false, objectiveFinding: false, differentialConsidered: true, grounded: true }
  });
  assert.equal(normalizeWellbeingHypotheses([physical], records).length, 0);
  physical.thresholdChecks.repeatedOrPersistent = true;
  assert.equal(normalizeWellbeingHypotheses([physical], records).length, 1);
});

test('prompt asks for named possibilities without turning a diary into a diagnosis', () => {
  for (const phrase of ['明确叫出', 'namedPossibilities', '抑郁相关症状', 'RULE_OUT', '不能用“持续低落”', '多汗症方向', '替代解释', '不是患病概率', '不得给药名']) {
    assert.match(WELLBEING_HYPOTHESIS_PROMPT, new RegExp(phrase, 'u'));
  }
});
