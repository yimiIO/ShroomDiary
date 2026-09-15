'use strict';

process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/test';
process.env.TOKEN_SECRET ||= 'test-token-secret-long-enough-for-tests';
process.env.FINANCIAL_DATA_ENCRYPTION_KEY ||= 'test-financial-key-long-enough-for-tests';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { decryptFinancialPayload, encryptFinancialPayload } = require('../src/financial-data-crypto');

const root = path.resolve(__dirname, '../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('private financial payloads use authenticated encryption at rest', () => {
  const value = { amountMinor: '10500000', productName: '用户自己的持有名称' };
  const encrypted = encryptFinancialPayload(value);
  assert.ok(Buffer.isBuffer(encrypted));
  assert.doesNotMatch(encrypted.toString('utf8'), /10500000|持有名称/);
  assert.deepEqual(decryptFinancialPayload(encrypted), value);
});

test('financial schema enforces owned plan boundaries and keeps revisions', () => {
  const migration = source('server/sql/038_financial_ledger.sql');
  assert.match(migration, /REFERENCES compound_threads\(id, user_id\)/);
  assert.match(migration, /private_payload bytea NOT NULL/);
  assert.match(migration, /revision_of uuid REFERENCES financial_records/);
  assert.match(migration, /financial_rule_versions/);
  assert.match(migration, /financial_import_drafts/);
});

test('financial routes never accept a client-selected user and require separate consent', () => {
  const route = source('server/src/routes/financial-ledger.js');
  assert.doesNotMatch(route, /req\.body\.userId/);
  assert.match(route, /req\.user\.id/);
  assert.match(route, /req\.authKind === 'session'/);
  assert.match(route, /sensitiveDataConsent/);
  assert.match(route, /aiProcessingConsent/);
  assert.match(route, /financialAiImportEnabled/);
  assert.match(route, /encryptFinancialPayload/);
  assert.match(route, /用户确认后才入账/);
  assert.match(route, /不能成为实际资金记录/);
  assert.match(route, /auditTrail/);
});

test('general exports keep private financial data unavailable to API tokens', () => {
  const route = source('server/src/routes/export.js');
  assert.match(route, /req\.authKind === 'session'/);
  assert.match(route, /API Token 无权导出私人财务台账/);
});

test('financial product exposes four tabs without adding a bottom navigation item', () => {
  const page = source('src/pages/shroom/financial-ledger.vue');
  const ledger = source('server/src/financial-ledger.js');
  const pages = JSON.parse(source('src/pages.json'));
  assert.match(page, /概览/);
  assert.match(page, /记录/);
  assert.match(page, /持有/);
  assert.match(page, /计划/);
  assert.match(page, /暂不能计算/);
	assert.match(page, /这里只记录和计算，不推荐买什么/);
  assert.match(page, /计划期限/);
  assert.match(page, /每期计划投入金额/);
  assert.match(page, /计划执行周期/);
  assert.match(page, /计划标的不是持有记录/);
  assert.match(page, /targetLabelsText/);
	assert.match(page, /具体产品（可选）/);
	assert.match(page, /在哪个平台（可选）/);
	assert.match(page, /recordContext\(item\)/);
	assert.match(page, /总投入、现在余额和涨跌/);
	assert.match(page, /按渠道/);
	assert.match(page, /按标的/);
	assert.match(page, /投入本金/);
	assert.match(page, /年后测算/);
	assert.match(page, /用户填写的测算假设/);
	assert.match(page, /最近资金变化/);
	assert.match(page, /scrollToEditor/);
	assert.match(page, /createSelectorQuery/);
	assert.doesNotMatch(page, /scrollTop: 260/);
	assert.match(ledger, /holdingSummary/);
	assert.match(ledger, /financialPlanProjection/);
  assert.ok(pages.pages.some(item => item.path === 'pages/shroom/financial-ledger'));
  assert.equal(pages.tabBar.list.length, 4);
});

test('first financial setup persists a complete plan and rule instead of an empty ledger', () => {
  const route = source('server/src/routes/financial-ledger.js');
  const compoundPage = source('src/pages/shroom/compound.vue');

  assert.match(route, /targetYears/);
  assert.match(route, /initialRule/);
  assert.match(route, /targetLabels/);
  assert.match(route, /reviewFrequency/);
  assert.match(route, /INSERT INTO financial_rule_versions/);
  assert.match(route, /\['FIXED', 'SURPLUS_RATIO', 'BATCHED_LUMP_SUM'\]\.includes/);
  assert.match(compoundPage, /financialSetupPayload/);
  assert.match(compoundPage, /financialPlanSummary/);
	assert.match(compoundPage, /不会推荐买什么，也不会承诺收益/);
	assert.match(compoundPage, /financialAssumedAnnualReturnPercent/);
	assert.match(compoundPage, /收益承诺/);
});

test('legacy financial progress verdicts are blocked instead of influencing ledger results', () => {
  const route = source('server/src/routes/compound-progress.js');
  const page = source('src/pages/shroom/compound.vue');
  assert.match(route, /财务计划不再使用“线性／复利已出现”判断/);
  assert.match(route, /财务金额和结果必须进入可核对的资金台账/);
	assert.match(page, /查看我的投资计划/);
	assert.match(page, /每月检查一次/);
});
