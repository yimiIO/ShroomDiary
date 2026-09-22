'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ARCHETYPES, CATALOG_VERSION, archetypeByKey, listArchetypes } = require('../src/compound-archetypes');

test('compound catalog contains only versioned growth or protection archetypes', () => {
  assert.ok(ARCHETYPES.length >= 10);
  assert.equal(new Set(ARCHETYPES.map(item => item.key)).size, ARCHETYPES.length);
  for (const item of ARCHETYPES) {
    assert.ok(['GROWTH', 'PROTECTION'].includes(item.kind));
    assert.equal(item.version, CATALOG_VERSION);
    assert.ok(item.mechanism.length > 20);
    assert.ok(item.notThis.length > 10);
    assert.ok(item.defaultPrincipalMetric);
    assert.ok(item.defaultReturnMetric);
    assert.ok(Array.isArray(item.starterPlans));
    assert.ok(item.starterPlans.length >= 2, `${item.key} should offer at least two starter templates`);
    for (const starter of item.starterPlans) {
      assert.ok(starter.title);
      assert.ok(starter.observableEvidence);
      assert.ok(starter.feltChange);
      assert.ok(starter.firstStep);
    }
  }
});

test('body capacity starts with the existing daily yoga practice as a safe compound example', () => {
  const body = archetypeByKey('body_capacity');
  const yoga = body.starterPlans.find(item => item.key === 'daily_yoga_practice');
  assert.equal(yoga.title, '每天练一遍 7 动作全身瑜伽');
  assert.match(yoga.summary, /7 动作自主练习/);
  assert.match(yoga.observableEvidence, /每周完成 5 天左右/);
  assert.match(yoga.firstStep, /疼痛、眩晕或明显不适时立即停止/);
  assert.equal(yoga.principalMetricName, '完成每日瑜伽的天数');
});

test('catalog separates direct compounding from protective capacity', () => {
  const items = listArchetypes();
  const growth = items.filter(item => item.kind === 'GROWTH');
  const protection = items.filter(item => item.kind === 'PROTECTION');
  assert.ok(growth.some(item => item.key === 'reusable_assets'));
  assert.ok(growth.some(item => item.key === 'financial_capital'));
  assert.ok(protection.some(item => item.key === 'body_capacity'));
  assert.ok(protection.some(item => item.key === 'attention_capacity'));
});

test('unknown labels cannot become a trusted compound archetype', () => {
  assert.equal(archetypeByKey('make_more_money'), null);
  assert.equal(archetypeByKey(''), null);
  assert.equal(archetypeByKey('reusable_assets').kind, 'GROWTH');
});
