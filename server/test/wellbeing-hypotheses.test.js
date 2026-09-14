'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  WELLBEING_CONCEPT_CATALOG_VERSION,
  WELLBEING_HYPOTHESIS_PROMPT,
  hydrateNamedPossibilities,
  normalizeWellbeingHypotheses,
  preservesObservingStatus,
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
    namedPossibilities: [{ conceptId: 'psych.depressive-symptom-cluster', role: 'PRIMARY_DIRECTION', why: '持续低落、兴趣减退与功能影响同时出现' }],
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
    supportingEvidence: [
      { recordId: 'r1', evidenceId: 'source:0', reason: '持续两周且影响工作' },
      { recordId: 'r2', evidenceId: 'source:0', reason: '重复出现且影响社交' }
    ],
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
  assert.equal(result[0].supportingEvidence[0].excerpt, records[0].sourceExcerpt);
  assert.equal(result[0].namedPossibilities[0].conceptId, 'psych.depressive-symptom-cluster');
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

test('hypothesis evidence must select an evidence id from the owned source record', () => {
  assert.equal(normalizeWellbeingHypotheses([valid({
    supportingEvidence: [{ recordId: 'r1', evidenceId: 'invented:99', reason: '不可验证' }]
  })], records).length, 0);
});

test('physical clinical directions require persistence or an objective finding', () => {
  const physical = valid({
    stableKey: 'hyperhidrosis', domain: 'PHYSICAL', name: '多汗症方向需要排查',
    namedPossibilities: [{ conceptId: 'physical.hyperhidrosis', role: 'PRIMARY_DIRECTION', why: '多个日期出现反复手汗' }],
    possibilityStatement: '反复手汗可能与多汗症相关，也需要排查其他原因。',
    whyPossible: '记录出现反复手汗。',
    thresholdChecks: { repeatedOrPersistent: false, functionalImpact: false, objectiveFinding: false, differentialConsidered: true, grounded: true }
  });
  assert.equal(normalizeWellbeingHypotheses([physical], records).length, 0);
  physical.thresholdChecks.repeatedOrPersistent = true;
  assert.equal(normalizeWellbeingHypotheses([physical], records).length, 1);
});

test('prompt asks for named possibilities without turning a diary into a diagnosis', () => {
  for (const phrase of ['主体归属', '不得把对方的症状', 'evidenceId', '服务器按编号回填', 'professionalConcepts', '受控专业概念库', '不能发明', 'conceptId', 'RESEARCH_CONSTRUCT', 'RULE_OUT', '体重增加与活动下降', '不为了控制比例', '最多 8 项', '覆盖和优先级', '防漏检清单', '一次性', '替代解释', '不是患病概率', '不得给药名']) {
    assert.match(WELLBEING_HYPOTHESIS_PROMPT, new RegExp(phrase, 'u'));
  }
});

test('free-form professional-sounding labels are rejected by the controlled catalog', () => {
  assert.equal(normalizeWellbeingHypotheses([valid({
    namedPossibilities: [{ name: '情绪状态依赖的判断波动', role: 'PRIMARY_DIRECTION', why: '听起来像概念' }]
  })], records).length, 0);
  assert.equal(normalizeWellbeingHypotheses([valid({
    namedPossibilities: [{ conceptId: 'psych.not-a-real-concept', role: 'PRIMARY_DIRECTION', why: '不存在的 ID' }]
  })], records).length, 0);
});

test('a hypothesis must have a supported primary professional direction', () => {
  assert.equal(normalizeWellbeingHypotheses([valid({
    namedPossibilities: [{ conceptId: 'psych.social-anxiety-disorder', role: 'RULE_OUT', why: '没有足够证据，只是列来排除' }]
  })], records).length, 0);
});

test('the primary concept provides a deterministic hypothesis key across model wording changes', () => {
  const first = normalizeWellbeingHypotheses([valid({ stableKey: 'model-a', name: '第一种事实描述' })], records)[0];
  const second = normalizeWellbeingHypotheses([valid({ stableKey: 'model-b', name: '另一种事实描述' })], records)[0];
  assert.equal(first.hypothesisKey, 'psychological:concept:psych.depressive-symptom-cluster');
  assert.equal(second.hypothesisKey, first.hypothesisKey);
});

test('observing status follows the prior primary concept, never a shared rule-out', () => {
  const observed = new Set(['psych.anger-rumination', 'psych.social-anxiety-disorder']);
  assert.equal(preservesObservingStatus({ namedPossibilities: [
    { conceptId: 'psych.emotion-regulation-difficulty', role: 'PRIMARY_DIRECTION' },
    { conceptId: 'psych.anger-rumination', role: 'ALTERNATIVE' }
  ] }, observed), true);
  assert.equal(preservesObservingStatus({ namedPossibilities: [
    { conceptId: 'psych.fear-negative-evaluation', role: 'PRIMARY_DIRECTION' },
    { conceptId: 'psych.social-anxiety-disorder', role: 'RULE_OUT' }
  ] }, observed), false);
});

test('stored concepts are hydrated with an explanation, boundary and source', () => {
  const result = hydrateNamedPossibilities([
    { conceptId: 'psych.anger-rumination', role: 'PRIMARY_DIRECTION', why: '冲突后多次反复回想' }
  ], 'PSYCHOLOGICAL');
  assert.equal(result[0].name, '愤怒反刍');
  assert.match(result[0].concept.definition, /愤怒/u);
  assert.match(result[0].concept.boundary, /不是疾病诊断/u);
  assert.match(result[0].concept.source.url, /^https:\/\//u);
  assert.match(WELLBEING_CONCEPT_CATALOG_VERSION, /^wellbeing-concepts-/u);
});

test('legacy model labels only map when they are recognized aliases', () => {
  const recognized = hydrateNamedPossibilities([
    { name: '社交评价敏感', role: 'PRIMARY_DIRECTION', why: '多次担忧他人评价' },
    { name: '情绪状态依赖的判断波动', role: 'ALTERNATIVE', why: '模型生成复合词' }
  ], 'PSYCHOLOGICAL');
  assert.equal(recognized.length, 1);
  assert.equal(recognized[0].conceptId, 'psych.fear-negative-evaluation');
});
