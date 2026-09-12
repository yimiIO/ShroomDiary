'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  BLOCKER_PROMPT,
  CONTINUE_PROMPT,
  DIARY_REVIEW_PROMPT,
  RESULT_PROMPT,
  STARTER_PROMPT,
  inferResultState,
  modeForItem,
  normalizeBlocker,
  normalizeDiaryReview,
  normalizeResultDraft,
  normalizeStageReview
} = require('../src/compound-progress');

test('the same workflow keeps maintenance, situational and outcome directions distinct', () => {
  assert.equal(modeForItem('01'), 'MAINTENANCE');
  assert.equal(modeForItem('18'), 'SITUATIONAL');
  assert.equal(modeForItem('10'), 'OUTCOME');
  assert.equal(modeForItem('20'), 'MAINTENANCE');
});

test('result classification does not mistake preparation for completed action', () => {
  assert.equal(inferResultState('明天准备给学员发回访消息'), 'PREPARING');
  assert.equal(inferResultState('我已经给学员发了回访消息'), 'DONE');
  assert.equal(inferResultState('发出后对方回复并确认问题改善'), 'EFFECTIVE');
  assert.equal(inferResultState('情况有一点变化，但还不确定'), 'UNVERIFIED');
  assert.equal(normalizeResultDraft({}, '计划下周整理材料', '先找一份材料').state, 'PREPARING');
});

test('blocker adjustment persists one concrete next step and never auto-pauses', () => {
  const value = normalizeBlocker({
    obstacleType: 'TOO_LARGE',
    analysis: '当前一步包含了三个产出。',
    adjustedStep: '先只列出现有证据。',
    neededInput: '现有材料放在哪里？',
    recommendPause: true
  }, '完成案例');
  assert.equal(value.adjustedStep, '先只列出现有证据。');
  assert.equal(value.neededInput, '现有材料放在哪里？');
  assert.equal(value.recommendPause, true);
  assert.match(BLOCKER_PROMPT, /不自动新增待办/);
});

test('diary review separates facts from inference and offers one next experiment', () => {
  const value = normalizeDiaryReview({
    facts: ['争论持续了很久', '原计划的工作没有完成'],
    inferences: ['可能把质疑理解成了否定'],
    previousMethodUsed: 'UNKNOWN',
    nextTry: '下次先复述对方质疑，再决定是否回应。'
  }, '今天争论了很久', '先停十秒');
  assert.equal(value.facts.length, 2);
  assert.equal(value.inferences.length, 1);
  assert.equal(value.previousMethodUsed, 'UNKNOWN');
  assert.match(DIARY_REVIEW_PROMPT, /日记没写到不等于没做/);
});

test('stage review rejects uncited claims and keeps the decision user-confirmable', () => {
  const sources = [{ sourceKey: 'E1' }, { sourceKey: 'E2' }];
  const review = normalizeStageReview({
    actualActions: [
      { text: '完成了真实访谈', sourceRefs: ['E1'] },
      { text: '没有依据的成功', sourceRefs: ['E9'] }
    ],
    accumulations: [{ text: '留下访谈记录', sourceRefs: ['E2'] }],
    decision: 'ADJUST',
    nextStep: '补齐前后证据'
  }, sources);
  assert.equal(review.actualActions.length, 1);
  assert.equal(review.accumulations.length, 1);
  assert.equal(review.decision, 'ADJUST');
});

test('AI prompts preserve ownership of action and Life OS principles', () => {
  assert.match(STARTER_PROMPT, /不创建待办/);
  assert.match(CONTINUE_PROMPT, /不把 AI 输出当成用户已完成/);
  assert.match(RESULT_PROMPT, /只整理成可纠正草稿/);
  assert.match([STARTER_PROMPT, CONTINUE_PROMPT, DIARY_REVIEW_PROMPT].join('\n'), /不修改人生 OS|不修改正式原则/);
});
