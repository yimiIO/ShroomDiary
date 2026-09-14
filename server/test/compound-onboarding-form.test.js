'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('compound onboarding asks for user decisions and keeps validation internals optional', () => {
  const page = source('src/pages/shroom/compound.vue');
  const canSave = page.match(/canSavePlan\(\) \{[\s\S]*?\n\s*\},/);

  assert.match(page, /只需要回答 4 件事/);
  assert.match(page, /planSetup\.titleLabel/);
  assert.match(page, /planSetup\.commitmentLabel/);
  assert.match(page, /planSetup\.outcomeLabel/);
  assert.match(page, /planSetup\.nextStepLabel/);
  assert.match(page, /showAdvancedPlan/);
  assert.ok(canSave, 'canSavePlan should remain inspectable');
  assert.doesNotMatch(canSave[0], /returnDefinition|reinvestmentDefinition|MetricTarget|outcomeEvidence|currentMilestone|weeklyTimeBudgetMinutes/);
});

test('financial capital supplies a tailored, non-advisory setup instead of asking for expected returns', () => {
  const archetypes = source('server/src/compound-archetypes.js');
  const route = source('server/src/routes/compound-progress.js');
  const page = source('src/pages/shroom/compound.vue');

  assert.match(archetypes, /这项长期本金计划为了什么/);
  assert.match(archetypes, /你准备怎样稳定增加本金/);
  assert.match(archetypes, /12 周后看到什么，说明这套机制在正常运行/);
  assert.match(archetypes, /不承诺收益/);
  assert.doesNotMatch(archetypes, /预期收益率|预计年化收益/);
  assert.match(archetypes, /不提供具体产品、买卖时点、仓位比例、收益预测或自动交易/);
  assert.match(archetypes, /requiresBoundaryAcceptance: true/);
  assert.match(route, /text\(setup\.returnDefinition/);
  assert.match(route, /text\(setup\.reinvestmentDefinition/);
  assert.match(route, /Number\(setup\.principalMetricTarget/);
  assert.match(route, /Number\(setup\.returnMetricTarget/);
  assert.match(route, /financialBoundaryAccepted !== true/);
  assert.match(route, /containsFinancialSecret/);
  assert.match(route, /isFinancialCompound\(thread\) \? thread\.id : null/);
  assert.match(route, /financial-policy-blocked/);
  assert.match(page, /financialBoundaryAccepted/);
  assert.match(page, /再投入机制已验证/);
  assert.match(page, /12 周机制验证/);
  assert.doesNotMatch(page, /新增本金<\/text>/);
});
