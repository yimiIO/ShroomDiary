'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_ITEMS,
  SECTIONS,
  WEEKLY_REVIEW_PROMPT,
  ensureDefaultLifeOsItems,
  normalizeLifeOsLinks,
  normalizeWeeklyReview,
  weekStart
} = require('../src/life-os-long-term');
const { invalidateDiaryDerivatives } = require('../src/memory-store');

test('long-term life OS starts from exactly 20 stable items in five sections', () => {
  assert.equal(DEFAULT_ITEMS.length, 20);
  assert.deepEqual(DEFAULT_ITEMS.map(item => item.stableKey), Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, '0')));
  assert.deepEqual([...new Set(DEFAULT_ITEMS.map(item => item.section))].sort(), [...SECTIONS].sort());
  assert.deepEqual(SECTIONS.map(section => DEFAULT_ITEMS.filter(item => item.section === section).length), [2, 2, 5, 7, 4]);
  assert.ok(DEFAULT_ITEMS.every(item => item.minimumAction && item.priority === item.originalNumber));
});

test('diary links require exact source evidence, known items and stop at three', () => {
  const content = '今天我跑了三公里。准备明天整理项目文档。我仍然不知道为什么总在快完成时转向别的事。';
  const links = normalizeLifeOsLinks([
    { itemId: '01', recordType: 'ACTION', evidenceExcerpt: '今天我跑了三公里', summary: '完成运动' },
    { itemId: '10', recordType: 'PLAN', evidenceExcerpt: '准备明天整理项目文档', summary: '形成计划' },
    { itemId: '08', recordType: 'INQUIRY', evidenceExcerpt: '我仍然不知道为什么总在快完成时转向别的事', summary: '需要继续观察' },
    { itemId: '03', recordType: 'OBSERVATION', evidenceExcerpt: '模型杜撰的句子' },
    { itemId: '99', recordType: 'ACTION', evidenceExcerpt: '今天我跑了三公里' },
    { itemId: '01', recordType: 'ACTION', evidenceExcerpt: '今天我跑了三公里' }
  ], DEFAULT_ITEMS, content);

  assert.equal(links.length, 3);
  assert.deepEqual(links.map(item => `${item.itemKey}:${item.recordType}`), ['01:ACTION', '10:PLAN', '08:INQUIRY']);
});

test('default initialization is idempotent and never overwrites edited items', async () => {
  const statements = [];
  const emptyStore = { query: async sql => { statements.push(sql); return statements.length === 1 ? { rows: [{ count: 0 }] } : { rows: [] }; } };
  await ensureDefaultLifeOsItems(emptyStore, 'user-a');
  assert.equal(statements.length, 21);
  assert.ok(statements.slice(1).every(sql => /ON CONFLICT \(user_id, stable_key\) DO NOTHING/.test(sql)));

  const existingStatements = [];
  await ensureDefaultLifeOsItems({ query: async sql => { existingStatements.push(sql); return { rows: [{ count: 20 }] }; } }, 'user-a');
  assert.equal(existingStatements.length, 1);
});

test('diary mutation removes ordinary AI links and invalidates user-corrected sources', async () => {
  const statements = [];
  const client = { query: async sql => { statements.push(sql); return { rows: [], rowCount: 0 }; } };
  await invalidateDiaryDerivatives(client, 'user-a', 'diary-a', 'changed');
  const sql = statements.join('\n');
  assert.match(sql, /DELETE FROM life_os_item_links[\s\S]+origin = 'AI'[\s\S]+user_confirmed = false/);
  assert.match(sql, /status = 'INVALID_SOURCE'/);
  assert.match(sql, /user_confirmed = true/);
});

test('weekly review only retains cited facts and leaves next steps user-selectable', () => {
  const sources = [{ sourceKey: 'R1' }, { sourceKey: 'R2' }];
  const result = normalizeWeeklyReview({
    summary: '本周真实推进了一项工作。',
    actualProgress: [
      { itemId: '05', recordType: 'ACTION', text: '完成一次真实交付', sourceRefs: ['R1', 'NOT_OWNED'] },
      { itemId: '06', recordType: 'ACTION', text: '没有来源', sourceRefs: [] }
    ],
    accumulations: [{ itemId: '10', kind: 'ASSET_CREATED', text: '整理出复用文档', sourceRefs: ['R2'] }],
    observations: [{ itemId: '08', text: '仍需观察切换任务的触发条件', inference: true, sourceRefs: ['R1'] }],
    nextSteps: [{ itemId: '05', mode: 'ADJUST', action: '缩小下周交付范围', sourceRefs: ['R1'] }]
  }, sources, DEFAULT_ITEMS);

  assert.equal(result.actualProgress.length, 1);
  assert.deepEqual(result.actualProgress[0].sourceRefs, ['R1']);
  assert.equal(result.accumulations[0].kind, 'ASSET_CREATED');
  assert.equal(result.observations[0].inference, true);
  assert.equal(result.nextSteps[0].action, '缩小下周交付范围');
  assert.match(WEEKLY_REVIEW_PROMPT, /可编辑草稿/);
  assert.match(WEEKLY_REVIEW_PROMPT, /不修改长期方向、优先级或正式原则/);
});

test('week starts on Monday in Asia Shanghai', () => {
  assert.equal(weekStart(new Date('2026-09-12T18:00:00Z')), '2026-09-07');
  assert.equal(weekStart(new Date('2026-09-13T16:30:00Z')), '2026-09-14');
});
