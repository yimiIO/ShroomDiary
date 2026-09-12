'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MEDICAL_DISCLAIMER,
  buildHealthSummary,
  isHealthInquiry,
  normalizeHealthInquiryReview,
  normalizeHealthObservation,
  normalizeInquiryType
} = require('../src/inquiry-health');

test('health inquiry type is allowlisted and distinguishes sensitive observations', () => {
  assert.equal(normalizeInquiryType('PHYSICAL_HEALTH'), 'PHYSICAL_HEALTH');
  assert.equal(normalizeInquiryType('DIAGNOSIS'), 'GENERAL');
  assert.equal(isHealthInquiry('PSYCHOLOGICAL'), true);
  assert.equal(isHealthInquiry('GENERAL'), false);
});

test('health observation is bounded and omits an empty payload', () => {
  assert.deepEqual(normalizeHealthObservation({}), {});
  const value = normalizeHealthObservation({
    physicalSymptoms: ['手心出汗', '手心出汗'], bodyAreas: ['手'], severity: 99,
    sleep: { hours: -3, quality: 8, note: '入睡晚' }, measurements: ['体温 37.2℃']
  });
  assert.deepEqual(value.physicalSymptoms, ['手心出汗']);
  assert.equal(value.severity, 10);
  assert.equal(value.sleep.hours, 0);
  assert.equal(value.sleep.quality, 5);
});

test('health review keeps only evidence-backed claims and always adds disclaimer', () => {
  const result = normalizeHealthInquiryReview({
    summary: '目前只能看到几次同时变化。',
    currentClues: [{ statement: '出汗加重', evidenceRefs: ['E1', 'E99'] }],
    correlations: [{ observation: '熬夜后更明显', factors: ['睡眠'], evidenceRefs: ['E2'], caution: '同时发生不能证明因果' }],
    hypotheses: [{ statement: '可能和压力有关', confidence: 'strong', supportingEvidenceRefs: ['E1'], challengingEvidenceRefs: ['BAD'] }],
    careSignals: [{ signal: '胸痛', evidenceRefs: ['BAD'], urgency: 'EMERGENCY', action: '联系急救服务' }]
  }, [{ key: 'E1' }, { key: 'E2' }]);
  assert.deepEqual(result.currentClues[0].evidenceRefs, ['E1']);
  assert.deepEqual(result.hypotheses[0].challengingEvidenceRefs, []);
  assert.equal(result.careSignals.length, 0);
  assert.equal(result.medicalDisclaimer, MEDICAL_DISCLAIMER);
});

test('doctor summary is deterministic and labels hypotheses as unconfirmed', () => {
  const summary = buildHealthSummary({
    inquiry: {
      question: '为什么总是手心出汗？', inquiryType: 'PHYSICAL_HEALTH',
      observationStartedOn: '2026-08-01', personalBaseline: '以前运动后才明显',
      currentSynthesis: { summary: '近两周记录增多', hypotheses: [{ statement: '可能与压力同现', supportingEvidenceRefs: ['E1'], challengingEvidenceRefs: ['E2'] }] }
    },
    evidence: [{ sourceDate: '2026-09-01', excerpt: '开会前手心出汗' }]
  });
  assert.match(summary, /原因假设（均待继续验证）/);
  assert.match(summary, /健康时间线/);
  assert.match(summary, new RegExp(MEDICAL_DISCLAIMER));
});
