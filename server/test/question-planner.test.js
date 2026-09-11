'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuestionPlan, questionRequiresFullCoverage } = require('../src/question-planner');

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

test('an open-ended enumeration uses a full semantic census instead of top-k retrieval', () => {
  const plan = normalizeQuestionPlan({
    intent: 'search', strategy: 'hybrid_retrieval', requiresFullCoverage: true,
    criterion: '用户本人在日记中明确记录的处理不当、疏忽、逃避或失约行为',
    subject: '用户本人', unit: 'entry', groupBy: 'none', matchPolicy: 'strict',
    dateFrom: null, dateTo: null, resultLabel: '过去没处理好的事情'
  }, {}, new Date('2026-09-11T03:00:00Z'));
  assert.equal(plan.strategy, 'semantic_census');
  assert.equal(plan.requiresFullCoverage, true);
  assert.equal(plan.intent, 'search');
});

test('enumeration phrasing is only used to choose coverage, not to keyword-match diary content', () => {
  assert.equal(questionRequiresFullCoverage('过去我有哪些做得不好的地方？'), true);
  assert.equal(questionRequiresFullCoverage('找出所有我没有处理好的事情'), true);
  assert.equal(questionRequiresFullCoverage('最近一次我是怎么处理这件事的？'), false);
});
