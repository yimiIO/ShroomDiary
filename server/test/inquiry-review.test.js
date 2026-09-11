'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { INQUIRY_REVIEW_PROMPT, normalizeInquiryReview } = require('../src/inquiry-review');

const evidence = [
  { key: 'E1', id: 'one' },
  { key: 'E2', id: 'two' }
];

test('inquiry review keeps only evidence refs that the server supplied', () => {
  const result = normalizeInquiryReview({
    summary: '目前只能形成一个暂时判断。',
    hypotheses: [{
      statement: '重要选择前的自我否定可能与不确定性有关。',
      confidence: 'strong',
      supportingEvidenceRefs: ['E1', 'E1', 'E999'],
      challengingEvidenceRefs: ['E2', 'invented']
    }],
    unknowns: ['还不知道在低风险选择里是否也会发生。'],
    statusSuggestion: 'RESOLVED'
  }, evidence);

  assert.deepEqual(result.hypotheses[0].supportingEvidenceRefs, ['E1']);
  assert.deepEqual(result.hypotheses[0].challengingEvidenceRefs, ['E2']);
  assert.equal(result.statusSuggestion, 'RESOLVED');
});

test('inquiry review defaults invalid model fields to cautious values', () => {
  const result = normalizeInquiryReview({
    summary: '  当前理解  ',
    hypotheses: [{ statement: '候选解释', confidence: 'certain' }],
    statusSuggestion: 'DELETE'
  }, evidence);

  assert.equal(result.summary, '当前理解');
  assert.equal(result.hypotheses[0].confidence, 'emerging');
  assert.equal(result.statusSuggestion, 'OPEN');
  assert.match(INQUIRY_REVIEW_PROMPT, /不替用户宣布问题已经解决/);
});
