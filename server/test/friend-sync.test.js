'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeExtraction } = require('../src/friend-sync');

test('friend extraction keeps grounded people and deterministic score rules', () => {
  const content = '今天和小王开会，他主动帮我解决了发布问题。我答应周五把复盘发给小王。';
  const result = normalizeExtraction({
    people: [{
      name: '小王', aliases: ['王总'], likelyNew: false,
      interaction: { type: '合作', sentiment: 'positive' },
      topic: '处理发布问题', notes: '主动帮我解决了发布问题',
      scoreSignals: [{ ruleCode: 'R_PLUS_HELP', evidence: '主动帮我解决了发布问题', suggestedChange: -3 }],
      promise: { task: '把复盘发给小王', dueDate: '2026-09-11', evidence: '我答应周五把复盘发给小王' }
    }, {
      name: '某个不存在的人', aliases: [], likelyNew: true,
      interaction: { type: '见面', sentiment: 'positive' }, scoreSignals: []
    }]
  }, content);

  assert.equal(result.people.length, 1);
  assert.equal(result.people[0].name, '小王');
  assert.equal(result.people[0].scoreSignals[0].change, 2);
  assert.equal(result.people[0].promise.task, '把复盘发给小王');
});

test('a promise without verbatim diary evidence is ignored', () => {
  const result = normalizeExtraction({
    people: [{
      name: '阿明', aliases: [], likelyNew: true,
      interaction: { type: '微信', sentiment: 'neutral' },
      promise: { task: '下周帮阿明搬家', evidence: '正文并没有这句话' }
    }]
  }, '今天阿明发微信问候。');

  assert.equal(result.people[0].promise, null);
});

test('ungrounded score evidence and unknown rules never change a relationship score', () => {
  const result = normalizeExtraction({
    people: [{
      name: '阿明', aliases: [], likelyNew: true,
      interaction: { type: '微信', sentiment: 'neutral' },
      scoreSignals: [
        { ruleCode: 'R_PLUS_HELP', evidence: '正文中没有的帮助' },
        { ruleCode: 'R_MAGIC', evidence: '阿明' }
      ]
    }]
  }, '今天阿明发微信问候。');

  assert.deepEqual(result.people[0].scoreSignals, []);
});
