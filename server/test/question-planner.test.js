'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuestionPlan } = require('../src/question-planner');

test('a model-planned natural-language count becomes a full semantic census', () => {
  const plan = normalizeQuestionPlan({
    intent: 'count',
    strategy: 'semantic_census',
    criterion: '用户在记录当天感到不被理解',
    subject: '用户本人',
    unit: 'day',
    groupBy: 'none',
    matchPolicy: 'any_evidence',
    dateFrom: '2026-01-01',
    dateTo: '2026-09-09',
    rangeLabel: '2026年截至今天',
    resultLabel: '感到不被理解的天数'
  }, {}, new Date('2026-09-09T03:00:00Z'));
  assert.equal(plan.strategy, 'semantic_census');
  assert.equal(plan.requiresFullCoverage, true);
  assert.equal(plan.unit, 'day');
  assert.equal(plan.criterion, '用户在记录当天感到不被理解');
  assert.equal(plan.resultLabel, '感到不被理解');
  assert.deepEqual(plan.scope, { dateFrom: '2026-01-01', dateTo: '2026-09-09', diaryIds: [] });
});

test('a model plan cannot count future dates as part of the current journal year', () => {
  const plan = normalizeQuestionPlan({
    intent: 'count', strategy: 'semantic_census', criterion: '用户感到不开心',
    unit: 'day', groupBy: 'none', matchPolicy: 'any_evidence',
    dateFrom: '2026-01-01', dateTo: '2026-12-31',
    rangeLabel: '2026年全年', resultLabel: '不开心的天数'
  }, {}, new Date('2026-09-09T03:00:00Z'));
  assert.equal(plan.scope.dateTo, '2026-09-09');
  assert.equal(plan.rangeLabel, '2026年截至9月9日');
});

test('user-selected dates remain a hard privacy and analysis boundary', () => {
  const plan = normalizeQuestionPlan({
    intent: 'trend', strategy: 'semantic_census', criterion: '用户感到有能量',
    unit: 'day', groupBy: 'month', matchPolicy: 'any_evidence',
    dateFrom: '2026-01-01', dateTo: '2026-12-31'
  }, { dateFrom: '2026-03-01', dateTo: '2026-04-30' }, new Date('2026-09-09T03:00:00Z'));
  assert.equal(plan.scope.dateFrom, '2026-03-01');
  assert.equal(plan.scope.dateTo, '2026-04-30');
  assert.deepEqual(plan.scope.diaryIds, []);
});

test('a qualitative relationship question stays on evidence retrieval', () => {
  const plan = normalizeQuestionPlan({
    intent: 'explain', strategy: 'hybrid_retrieval',
    criterion: '工作受挫与自我怀疑之间的关联', unit: 'entry',
    groupBy: 'none', matchPolicy: 'strict', dateFrom: null, dateTo: null
  }, {}, new Date('2026-09-09T03:00:00Z'));
  assert.equal(plan.strategy, 'hybrid_retrieval');
  assert.equal(plan.requiresFullCoverage, false);
});
