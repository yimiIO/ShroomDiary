'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('compound creation explains compounding before templates and complete customization', () => {
  const page = source('src/pages/shroom/compound.vue');

  for (const label of ['先讲清楚为什么有复利', '选择建议模板', '你会观察到', '你会感觉到', '选择这个模板', '完全自定义创建']) {
    assert.match(page, new RegExp(label));
  }
  assert.ok(page.indexOf('先讲清楚为什么有复利') < page.indexOf('选择建议模板'));
  assert.ok(page.indexOf('选择建议模板') < page.indexOf('完全自定义创建'));
  assert.match(page, /startFromArchetype\(starter\)/);
  assert.match(page, /startFromArchetype\(null\)/);
});

test('compound phone layout progressively reveals dense information', () => {
  const page = source('src/pages/shroom/compound.vue');

  assert.match(page, /visibleCatalogItems\(\).*slice\(0, 6\)/);
  assert.match(page, /showArchetypeDetails = !showArchetypeDetails/);
  assert.match(page, /expandedPlanId === plan\.id/);
  assert.match(page, /查看完整计划和进度/);
  assert.match(page, /showActivityHistory/);
  assert.match(page, /input, textarea \{ font-size: 28rpx; \}/);
  assert.match(page, /\.catalog-intro \{[^}]*font-size: 29rpx;/);
  assert.match(page, /\.loop-statement text:last-child \{[^}]*font-size: 31rpx;/);
  assert.doesNotMatch(page, /class="secondary-links"|openYogaPractice|openPrinciples/);
});

test('compound creation becomes a focused mobile flow instead of stacking over the dashboard', () => {
  const page = source('src/pages/shroom/compound.vue');

  assert.match(page, /v-if="!hasFocusedPanel" class="portfolio-hero"/);
  assert.match(page, /v-if="home\.plans\.length && !hasFocusedPanel"/);
  assert.match(page, /v-if="!hasFocusedPanel && \(home\.diarySuggestions\.length \|\| home\.recentResults\.length\)"/);
  assert.match(page, /showCatalog \|\| \(!home\.plans\.length && !hasFocusedPanel\)/);
  assert.match(page, /hasFocusedPanel\(\)/);
  assert.match(page, /if \(this\.hasFocusedPanel\) return this\.closeFocusedPanel\(\)/);
  assert.match(page, /closePlanEditor\(\).*this\.showCatalog = true/s);
  assert.match(page, /v-if="!hasFocusedPanel" class="round-button add-button"/);
});
