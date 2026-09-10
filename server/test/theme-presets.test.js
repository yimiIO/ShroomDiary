'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveAnalysisPlan, themeCatalog, themePlan } = require('../src/theme-presets');

test('archive themes use stable body-semantic plans without invoking the question planner', async () => {
  const themes = themeCatalog();
  assert.deepEqual(themes.map(item => item.key), ['growth', 'emotion', 'relationship', 'work', 'travel', 'inspiration']);

  let plannerCalls = 0;
  const plan = await resolveAnalysisPlan({
    scope: { themeKey: 'work', dateFrom: '2026-01-01' },
    planner: async () => {
      plannerCalls += 1;
      return null;
    }
  });

  assert.equal(plannerCalls, 0);
  assert.equal(plan.strategy, 'semantic_census');
  assert.equal(plan.resultLabel, '工作');
  assert.equal(plan.scope.themeKey, undefined);
  assert.equal(plan.scope.dateFrom, '2026-01-01');
  assert.match(plan.criterion, /正文语义/);
});

test('unknown themes do not produce a preset plan', () => {
  assert.equal(themePlan('unknown'), null);
});
