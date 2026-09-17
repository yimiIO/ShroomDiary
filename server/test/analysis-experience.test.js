'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  CLASSIC_VERSION,
  COGNITION_VERSION,
  buildFeaturedInsights,
  extractInsightCandidates,
  feedbackProfile
} = require('../src/analysis-experience');

const root = path.join(__dirname, '..', '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

const observations = [
  {
    observer: { id: 'first', presetKey: 'first_principles', name: '第一性原理' },
    result: { principles: [
      { principle: '先区分忙碌和进步', reflection: '今天做了很多事，但长期目标没有变化。', unverifiedAssumption: '忙碌自然会带来进步', actionableFix: '写下一个可验证的进步指标' },
      { principle: '表达与掌握不同', reflection: '能讲清楚不等于能独立完成。', actionableFix: '用一次独立重建验证' }
    ] }
  },
  {
    observer: { id: 'os', presetKey: 'life_os', name: '人生 OS' },
    result: { violated: [{ rule: '先保护安全边界', evidence: '今天越过了自己设定的边界。', remediation: '恢复边界后再决定下一步' }] }
  }
];

test('analysis experience keeps A1 content and adds a stable feedback lifecycle', () => {
  const items = buildFeaturedInsights(observations);
  assert.equal(CLASSIC_VERSION, 'A1');
  assert.equal(COGNITION_VERSION, 'A1.1');
  assert.equal(items.length, 3);
  assert.equal(items[0].title, '先区分忙碌和进步');
  assert.equal(items[0].detail, '今天做了很多事，但长期目标没有变化。');
  assert.equal(items[0].suggestion, '写下一个可验证的进步指标');
  assert.match(items[0].key, /^[a-f0-9]{24}$/u);
  assert.equal(items[0].feedback, null);

  const rerendered = buildFeaturedInsights(observations, {
    currentFeedback: [{ insightKey: items[0].key, action: 'WATCH', note: '' }]
  });
  assert.equal(rerendered[0].key, items[0].key);
  assert.deepEqual(rerendered[0].feedback, { action: 'WATCH', note: '' });
});

test('past user feedback changes future presentation ranking without changing observer output', () => {
  const profile = feedbackProfile([
    { observerPreset: 'life_os', action: 'HELPFUL', count: 8 },
    { observerPreset: 'first_principles', action: 'WRONG', count: 8 }
  ]);
  const ranked = extractInsightCandidates(observations, { profile });
  assert.equal(ranked[0].sourcePreset, 'life_os');
  assert.equal(observations[0].result.principles[0].principle, '先区分忙碌和进步');
});

test('migration, API and UI keep the cognition experience account-scoped and reversible', () => {
  const migration = source('server/sql/045_analysis_experience.sql');
  const route = source('server/src/routes/ai.js');
  const page = source('src/pages/shroom/ai-analysis.vue');
  assert.match(migration, /analysis_experience_settings/u);
  assert.match(migration, /analysis_insight_feedback/u);
  assert.match(migration, /UNIQUE \(user_id, analysis_id, insight_key\)/u);
  assert.match(route, /analysis_experience_settings/u);
  assert.match(route, /analysis_insight_feedback/u);
  assert.match(route, /WHERE user_id = \$1 AND id = \$2/u);
  assert.match(page, /今天最值得看见/u);
  assert.match(page, /说中了/u);
  assert.match(page, /不符合/u);
  assert.match(page, /继续观察/u);
});
