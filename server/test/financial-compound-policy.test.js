'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  FINANCIAL_AI_BOUNDARY,
  containsFinancialSecret,
  containsRestrictedFinancialGuidance,
  financialPrompt,
  isFinancialCompound,
  redactFinancialSecrets
} = require('../src/financial-compound-policy');

test('financial compound plans are identified without affecting other archetypes', () => {
  assert.equal(isFinancialCompound({ archetype_key: 'financial_capital' }), true);
  assert.equal(isFinancialCompound({ archetypeKey: 'financial_capital' }), true);
  assert.equal(isFinancialCompound({ archetype_key: 'knowledge_network' }), false);
});

test('financial AI policy allows record keeping but rejects regulated-style guidance', () => {
  assert.equal(containsRestrictedFinancialGuidance({ analysis: '本月已完成一次投入，费用还没有核对。' }), false);
  assert.equal(containsRestrictedFinancialGuidance({ analysis: '建议现在买入某只 ETF。' }), true);
  assert.equal(containsRestrictedFinancialGuidance({ analysis: '股票配置占比 70%。' }), true);
  assert.equal(containsRestrictedFinancialGuidance({ analysis: '预计明年收益率会达到 12%。' }), true);
  assert.equal(containsRestrictedFinancialGuidance({ analysis: '该产品保证收益。' }), true);
  assert.equal(containsRestrictedFinancialGuidance({ analysis: 'Buy ABC and hold it for a year.' }), true);
  assert.match(financialPrompt('基础提示', true), /不能代替用户作投资决策/);
  assert.equal(financialPrompt('基础提示', false), '基础提示');
  assert.match(FINANCIAL_AI_BOUNDARY, /不提供买入、卖出/);
});

test('account credentials are rejected from financial forms and redacted before AI use', () => {
  const input = {
    title: '长期计划',
    note: '证券账户：ABC123456，交易密码: qwer1234'
  };
  assert.equal(containsFinancialSecret(input), true);
  const redacted = redactFinancialSecrets(input);
  assert.doesNotMatch(redacted.note, /ABC123456|qwer1234/);
  assert.match(redacted.note, /已隐藏敏感账户信息/);
  assert.match(redacted.note, /已隐藏凭证/);
  assert.equal(containsFinancialSecret({ note: '卡号是 4111 1111 1111 1111' }), true);
  const occurredAt = new Date('2026-09-14T00:00:00.000Z');
  assert.equal(redactFinancialSecrets({ occurredAt }).occurredAt, occurredAt);
  assert.equal(containsFinancialSecret({ note: '每月核对一次费用和实际结果' }), false);
});
