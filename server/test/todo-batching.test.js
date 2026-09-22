'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  computeGroups,
  derivePreferences,
  estimateMinutes,
  MAX_BAG_DURATION,
  MAX_GROUPS
} = require('../src/todo-batching-engine');

function task(id, overrides = {}) {
  return {
    id,
    content: `待办 ${id}`,
    tags: [],
    project_id: null,
    project_name: null,
    estimated_minutes: null,
    ...overrides
  };
}

test('smart groups require at least three related todos', () => {
  assert.deepEqual(computeGroups([
    task('a', { tags: ['沟通'] }),
    task('b', { tags: ['沟通'] }),
    task('c', { tags: ['写作'] })
  ]), []);
});

test('smart groups use explicit estimates and never exceed 90 minutes', () => {
  const groups = computeGroups([
    task('a', { tags: ['沟通'], estimated_minutes: 40 }),
    task('b', { tags: ['沟通'], estimated_minutes: 20 }),
    task('c', { tags: ['沟通'], estimated_minutes: 20 }),
    task('d', { tags: ['沟通'], estimated_minutes: 20 })
  ]);
  assert.equal(estimateMinutes({ estimated_minutes: 30 }), 30);
  assert.equal(estimateMinutes({ estimated_minutes: null }), 15);
  assert.equal(groups.length, 1);
  assert.ok(groups[0].estimatedMinutes <= MAX_BAG_DURATION);
  assert.deepEqual(groups[0].tasks.map(item => item.id), ['a', 'b', 'c']);
});

test('task IDs are unique inside every suggestion', () => {
  const groups = computeGroups([
    task('a', { project_id: 'p', project_name: '项目', tags: ['集中'] }),
    task('b', { project_id: 'p', project_name: '项目', tags: ['集中'] }),
    task('c', { project_id: 'p', project_name: '项目', tags: ['集中'] })
  ]);
  assert.ok(groups.length >= 1);
  for (const group of groups) {
    assert.equal(group.tasks.length, new Set(group.tasks.map(item => item.id)).size);
  }
  const allIds = groups.flatMap(group => group.tasks.map(item => item.id));
  assert.equal(allIds.length, new Set(allIds).size);
  assert.ok(groups.length <= MAX_GROUPS);
});

test('suggestions stay bounded even when many projects are eligible', () => {
  const tasks = [];
  for (let project = 0; project < MAX_GROUPS + 2; project += 1) {
    for (let item = 0; item < 3; item += 1) {
      tasks.push(task(`${project}-${item}`, { project_id: `p${project}`, project_name: `项目 ${project}` }));
    }
  }
  assert.equal(computeGroups(tasks).length, MAX_GROUPS);
});

test('same execution context is coordinated across projects before project fallback', () => {
  const groups = computeGroups([
    task('a', { content: '回复张三微信', project_id: 'p1', project_name: '项目一' }),
    task('b', { content: '给供应商发邮件', project_id: 'p2', project_name: '项目二' }),
    task('c', { content: '给合作方打电话', project_id: 'p3', project_name: '项目三' })
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, 'context:communication');
  assert.equal(groups[0].label, '集中回复与沟通');
  assert.match(groups[0].reason, /跨 3 个项目/);
});

test('long-term compound direction is used when task wording has no shared execution context', () => {
  const groups = computeGroups([
    task('a', { content: '整理上周数据', compound_item_id: 'life-1', compound_item_name: '健康管理' }),
    task('b', { content: '预约体检', compound_item_id: 'life-1', compound_item_name: '健康管理' }),
    task('c', { content: '更新记录', compound_item_id: 'life-1', compound_item_name: '健康管理' })
  ]);
  assert.equal(groups[0].key, 'direction:life-1');
  assert.equal(groups[0].label, '推进「健康管理」');
  assert.match(groups[0].reason, /长期方向/);
});

test('manual moves become reusable preferences for similar future tasks', () => {
  const preferences = derivePreferences([{
    event_type: 'drag_reclassify',
    created_at: '2026-09-21T08:00:00Z',
    original_state: { taskId: 'old', taskTitle: '回复旧客户微信', fromGroupKey: 'project:p1' },
    new_state: { taskId: 'old', taskTitle: '回复旧客户微信', toGroupKey: 'context:communication' }
  }]);
  const groups = computeGroups([
    task('a', { content: '回复新客户微信', project_id: 'p1', project_name: '项目一' }),
    task('b', { content: '给供应商发邮件', project_id: 'p2', project_name: '项目二' }),
    task('c', { content: '给合作方打电话', project_id: 'p3', project_name: '项目三' })
  ], preferences);
  assert.equal(groups[0].key, 'context:communication');
  assert.ok(groups[0].personalization.adjustmentCount >= 1);
});

test('todo page exposes explainable coordination, manual move and adoption actions', () => {
  const sourcePath = path.join(__dirname, '../../src/pages/todo/list.vue');
  const builtDirectory = path.join(__dirname, '../../public/static/js');
  const builtPath = fs.existsSync(builtDirectory)
    ? fs.readdirSync(builtDirectory).find(name => /^pages-todo-list\..+\.js$/.test(name))
    : null;
  const hasSource = fs.existsSync(sourcePath);
  const list = hasSource
    ? fs.readFileSync(sourcePath, 'utf8')
    : fs.readFileSync(path.join(builtDirectory, builtPath), 'utf8');
  assert.match(list, hasSource ? /data-testid="coordination-suggestions"/ : /coordination-suggestions/);
  assert.match(list, /一起处理/);
  assert.match(list, /移动到其他组/);
  assert.match(list, /记住这次调整/);
  assert.match(list, /\/todos\/v1\/smart-groups/);
  assert.match(list, /\/correction-events\/v1/);
  assert.match(list, /\/bags\/v1/);
});

test('route contract preserves user ownership, adopted locking and action-record writeback', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/bags.js'), 'utf8');
  assert.match(route, /current\.status !== 'proposed'/);
  assert.match(route, /user_id = \$2/);
  assert.match(route, /visible_in_diary, idempotency_key/);
  assert.match(route, /source: 'BAG'/);
  assert.doesNotMatch(route, /MAX_BAGS_PER_DAY|SHROOM_BAG_LIMIT/);
  assert.doesNotMatch(route, /INSERT INTO diaries/);
});

test('migration has a unique sequence and database duration constraint', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../sql/058_todo_batching.sql'), 'utf8');
  assert.match(migration, /duration_minutes BETWEEN 1 AND 90/);
  assert.match(migration, /REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /bag_id uuid REFERENCES bags\(id\)/);
});
