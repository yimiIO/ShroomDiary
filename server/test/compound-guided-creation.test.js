'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ARCHETYPES } = require('../src/compound-archetypes');

const root = path.resolve(__dirname, '../..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('every compound archetype teaches through observable and felt starter plans', () => {
  assert.ok(ARCHETYPES.length >= 10);
  for (const archetype of ARCHETYPES) {
    assert.ok(Array.isArray(archetype.starterPlans), `${archetype.key} needs starter plans`);
    assert.ok(archetype.starterPlans.length >= 2, `${archetype.key} needs at least two starter plans`);
    for (const starter of archetype.starterPlans) {
      assert.ok(starter.key);
      assert.ok(starter.title);
      assert.ok(starter.summary);
      assert.ok(starter.observableEvidence);
      assert.ok(starter.feltChange);
      assert.ok(starter.firstStep);
      assert.ok([4, 8, 12, 24].includes(starter.cycleWeeks));
    }
  }
});

test('compound creation explains the archetype before offering example or custom paths', () => {
  const page = source('src/pages/shroom/compound.vue');

  assert.match(page, /先理解，再开始/);
  assert.match(page, /能观察到/);
  assert.match(page, /能感受到/);
  assert.match(page, /用这个案例开始/);
  assert.match(page, /不套案例，自己创建/);
  assert.match(page, /startFromArchetype\(starter\)/);
  assert.match(page, /startFromArchetype\(null\)/);
  assert.doesNotMatch(page, /12 周后看到什么，说明它值得继续/);
});

test('a non-financial plan treats weeks as a first observation cycle, not its lifespan', () => {
  const page = source('src/pages/shroom/compound.vue');
  const archetypes = source('server/src/compound-archetypes.js');
  const product = source('docs/COMPOUND_SYSTEM.md');

  assert.match(page, /首个观察周期/);
  assert.match(page, /这项长期计划不会在周期结束时自动结束/);
  assert.match(page, /observationCycleWeeks/);
  assert.match(page, /\[4,8,12,24\]/);
  assert.match(archetypes, /defaultCycleWeeks/);
  assert.match(product, /12 周不是复利期限/);
  assert.doesNotMatch(page, /placeholder="12 周次数"/);
});

test('body capacity stays a protective plan and routes symptom investigation elsewhere', () => {
  const archetypes = source('server/src/compound-archetypes.js');
  const page = source('src/pages/shroom/compound.vue');

  assert.match(archetypes, /身体与恢复底盘/);
  assert.match(archetypes, /健康长期观察/);
  assert.match(page, /如果你是想理解一个持续症状的原因/);
  assert.match(page, /openHealthObservation/);
  assert.doesNotMatch(archetypes, /12 周建立稳定睡眠、训练与恢复基线/);
});
