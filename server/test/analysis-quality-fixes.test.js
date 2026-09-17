'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { VIEW_PROMPTS } = require('../src/ai-prompts');
const { syncDiaryLifeOsLinks } = require('../src/life-os-long-term');

const root = path.join(__dirname, '..', '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('analysis candidates start unselected and health copy reports the quality review call', () => {
  const page = source('src/pages/shroom/ai-analysis.vue');
  assert.match(page, /todoCandidates \|\| \[\]\)\.map\(item => \(\{ \.\.\.item, selected: false \}\)\)/u);
  assert.match(page, /一次质量复核/u);
  assert.doesNotMatch(page, /没有增加一次模型调用/u);
});

test('current biological observer can abstain and does not require quasi-diagnostic labels', () => {
  assert.match(VIEW_PROMPTS[5], /信息不足时/u);
  assert.doesNotMatch(VIEW_PROMPTS[5], /轻度依赖|耐受上升|基线下降/u);
});

test('AI compound links remain pending until the user confirms one', async () => {
  const queries = [];
  const client = { query: async (sql, values) => { queries.push({ sql, values }); return { rows: [], rowCount: 0 }; } };
  await syncDiaryLifeOsLinks(client, {
    userId: 'user-1',
    diary: { id: 'diary-1', content_version: 1 },
    analysisId: 'analysis-1',
    items: [{ id: 'item-1', stableKey: '01' }],
    links: [{
      itemKey: '01', recordType: 'OBSERVATION', evidenceExcerpt: '今天睡得很晚',
      summary: '睡眠观察', suggestedNextStep: ''
    }]
  });

  const insert = queries.find(item => /INSERT INTO life_os_item_links/u.test(item.sql));
  assert.ok(insert);
  assert.match(insert.sql, /false, 'PENDING'/u);
  const store = source('server/src/life-os-long-term.js');
  const page = source('src/pages/shroom/ai-analysis.vue');
  assert.match(store, /status IN \('PENDING', 'ACTIVE'\)/u);
  assert.match(page, /confirmLifeOsLink/u);
  assert.match(page, /确认这条关联/u);
});
