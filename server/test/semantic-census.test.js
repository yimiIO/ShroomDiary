'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  aggregateSemanticUnits,
  buildSemanticResult,
  normalizeSemanticAssessments
} = require('../src/semantic-census');

const entries = [{
  diary_id: '11111111-1111-4111-8111-111111111111',
  content: '开会时几次想解释，但感觉自己的话一直没有被听见。',
  mood: '平静',
  content_version: 2,
  diary_date: '2026-01-02',
  occurred_at: '2026-01-02T04:00:00.000Z'
}, {
  diary_id: '22222222-2222-4222-8222-222222222222',
  content: '晚上和朋友认真聊完，终于感觉被理解了。',
  mood: '开心',
  content_version: 1,
  diary_date: '2026-01-02',
  occurred_at: '2026-01-02T10:00:00.000Z'
}];

test('arbitrary semantic criteria use exact body evidence rather than metadata', () => {
  const normalized = normalizeSemanticAssessments(entries, {
    assessments: [{
      sourceRef: 'D1', label: 'match', confidence: 0.94,
      reason: '正文明确记录没有被听见的体验', evidenceQuote: '感觉自己的话一直没有被听见'
    }, {
      sourceRef: 'D2', label: 'no_match', confidence: 0.9,
      reason: '正文表达被理解', evidenceQuote: ''
    }]
  });
  assert.equal(normalized[0].label, 'match');
  assert.equal(normalized[0].evidenceExcerpt, '感觉自己的话一直没有被听见');
});

test('generic day aggregation deduplicates entries and can group by month', () => {
  const assessments = [{
    ...entries[0], label: 'match', confidence: 0.94, reason: '未被听见',
    evidenceStart: 10, evidenceEnd: 25, evidenceExcerpt: '感觉自己的话一直没有被听见'
  }, {
    ...entries[1], label: 'no_match', confidence: 0.9, reason: '被理解',
    evidenceStart: null, evidenceEnd: null, evidenceExcerpt: ''
  }];
  const result = aggregateSemanticUnits(assessments, { unit: 'day', groupBy: 'month', matchPolicy: 'any_evidence' });
  assert.equal(result.totalUnits, 1);
  assert.equal(result.matchedUnits, 1);
  assert.deepEqual(result.groups, [{ key: '2026-01', totalUnits: 1, matchedUnits: 1, partialUnits: 0, uncertainUnits: 0 }]);
});

test('claims without an exact quote cannot become counted evidence', () => {
  const normalized = normalizeSemanticAssessments([entries[0]], {
    assessments: [{ sourceRef: 'D1', label: 'match', confidence: 1, reason: '声称命中', evidenceQuote: '不存在的句子' }]
  });
  assert.equal(normalized[0].label, 'uncertain');
});

test('qualitative full-coverage questions return an evidence list rather than a count-only answer', () => {
  const mishandled = {
    ...entries[0], label: 'match', confidence: 0.92,
    reason: '答应的事情被反复拖延，且日记记录了已造成的影响',
    evidenceStart: 0, evidenceEnd: 12, evidenceExcerpt: '开会时几次想解释'
  };
  const result = buildSemanticResult('过去我有哪些做得不好的地方？', {
    intent: 'search', strategy: 'semantic_census', requiresFullCoverage: true,
    criterion: '用户本人的具体处理不当且有正文证据', subject: '用户本人',
    unit: 'entry', groupBy: 'none', matchPolicy: 'strict', scope: {},
    rangeLabel: '全部已授权日记', resultLabel: '过去没处理好的事情'
  }, entries, [mishandled, {
    ...entries[1], label: 'no_match', confidence: 0.9, reason: '只是一次不愉快结果',
    evidenceStart: null, evidenceEnd: null, evidenceExcerpt: ''
  }]);
  assert.equal(result.presentation, 'evidence_list');
  assert.match(result.summary, /找到 1 篇/);
  assert.match(result.summary, /不是对你的人格评价/);
  assert.equal(result.analysisStats.items[0].reason, mishandled.reason);
  assert.deepEqual(result.analysisStats.items[0].evidenceRefs, ['S1']);
});
