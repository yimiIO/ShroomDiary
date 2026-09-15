'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('compound home keeps mobile information progressive instead of expanding everything', () => {
  const page = source('src/pages/shroom/compound.vue');

  assert.match(page, /visibleCatalogItems\(\).*slice\(0, 6\)/);
  assert.match(page, /expandedPlanId === plan\.id/);
  assert.match(page, /查看完整计划和进度/);
  assert.match(page, /showActivityHistory/);
  assert.match(page, /financialPlanStep === 1/);
  assert.match(page, /financialPlanStep === 2/);
  assert.match(page, /financialPlanStep === 3/);
  assert.match(page, /4 \/ 4/);
  assert.match(page, /input, textarea \{ font-size: 30rpx; \}/);
  assert.match(page, /\.primary-action \{ min-height: 92rpx; font-size: 30rpx; \}/);
});

test('financial plan uses plain user language for records and total value', () => {
  const page = source('src/pages/shroom/financial-ledger.vue');

  assert.match(page, /记一笔资金变动/);
  assert.match(page, /记某天的总金额/);
  assert.match(page, /扣除投入后的赚亏/);
  assert.match(page, /为什么要记两种数据/);
  assert.doesNotMatch(page, /资金实践|资金事件|市值快照|资产快照|私人台账/);
});
