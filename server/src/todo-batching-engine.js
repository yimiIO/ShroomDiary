'use strict';

const MIN_GROUP_SIZE = 3;
const MAX_CANDIDATES = 60;
const DEFAULT_MINUTES_PER_TASK = 15;
const MAX_BAG_DURATION = 90;
const MAX_GROUPS = 6;

const EXECUTION_CONTEXTS = [
  { key: 'communication', label: '集中回复与沟通', pattern: /(回复|微信|邮件|电话|联系|沟通|跟进|发消息|告知|邀约)/i },
  { key: 'review', label: '集中审核与判断', pattern: /(审核|审批|检查|评估|复盘|验收|确认方案)/i },
  { key: 'finance', label: '集中处理财务事务', pattern: /(付款|报销|对账|发票|预算|转账|账单|结算|缴费)/i },
  { key: 'errands', label: '集中办理线下事务', pattern: /(购买|采购|去买|去取|取快递|邮寄|寄出|预约|办理|送到|线下)/i },
  { key: 'writing', label: '集中写作与输出', pattern: /(写|撰写|文案|文章|方案|报告|总结|PRD|编辑|发布稿)/i },
  { key: 'computer', label: '集中电脑上完成', pattern: /(配置|部署|修复|开发|代码|测试|数据|表格|后台|系统|导入)/i }
];

function estimateMinutes(task) {
  const value = Number(task?.estimated_minutes);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MINUTES_PER_TASK;
}

function contextKeys(task) {
  const text = `${task?.content || ''} ${task?.description || ''}`;
  return EXECUTION_CONTEXTS.filter(item => item.pattern.test(text)).map(item => `context:${item.key}`);
}

function naturalSignals(task) {
  const signals = [];
  signals.push(...contextKeys(task).map(key => ({ key, score: 40 })));
  for (const tag of Array.isArray(task?.tags) ? task.tags : []) {
    const normalized = String(tag || '').trim().toLowerCase();
    if (normalized) signals.push({ key: `tag:${normalized}`, score: 30 });
  }
  if (task?.compound_item_id) signals.push({ key: `direction:${task.compound_item_id}`, score: 24 });
  if (task?.project_id) signals.push({ key: `project:${task.project_id}`, score: 16 });
  return [...new Map(signals.map(signal => [signal.key, signal])).values()];
}

function groupKeys(task) {
  return naturalSignals(task).map(signal => signal.key);
}

function derivePreferences(events) {
  const exact = new Map();
  const signalVotes = new Map();
  const keyCounts = new Map();
  let adjustmentCount = 0;
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.event_type !== 'drag_reclassify') continue;
    const before = event.original_state || {};
    const after = event.new_state || {};
    const targetKey = String(after.toGroupKey || '');
    if (!targetKey) continue;
    adjustmentCount += 1;
    if (after.taskId || before.taskId) exact.set(String(after.taskId || before.taskId), targetKey);
    const sample = { content: after.taskTitle || before.taskTitle || '', tags: after.taskTags || before.taskTags || [] };
    for (const signal of naturalSignals(sample)) {
      if (!signalVotes.has(signal.key)) signalVotes.set(signal.key, new Map());
      const votes = signalVotes.get(signal.key);
      votes.set(targetKey, (votes.get(targetKey) || 0) + 1);
    }
    keyCounts.set(targetKey, (keyCounts.get(targetKey) || 0) + 1);
  }
  return { exact, signalVotes, keyCounts, adjustmentCount };
}

function signalsForTask(task, preferences) {
  const signals = naturalSignals(task);
  const scores = new Map(signals.map(signal => [signal.key, signal.score]));
  if (!preferences) return signals;
  const exactTarget = preferences.exact?.get(String(task.id));
  if (exactTarget) scores.set(exactTarget, 140);
  for (const signal of signals) {
    const votes = preferences.signalVotes?.get(signal.key);
    if (!votes) continue;
    for (const [targetKey, count] of votes) {
      scores.set(targetKey, Math.max(scores.get(targetKey) || 0, 70 + Math.min(30, count * 6)));
    }
  }
  return [...scores.entries()].map(([key, score]) => ({ key, score }));
}

function groupLabel(key, tasks) {
  if (key.startsWith('context:')) {
    const context = EXECUTION_CONTEXTS.find(item => item.key === key.slice(8));
    return context?.label || '集中处理';
  }
  if (key.startsWith('direction:')) {
    const name = tasks.find(item => item.compound_item_name)?.compound_item_name || '长期方向';
    return `推进「${name}」`;
  }
  if (key.startsWith('project:')) {
    const name = tasks.find(item => item.project_name)?.project_name || '同一项目';
    return `推进「${name}」`;
  }
  if (key.startsWith('tag:')) return `一起处理「${key.slice(4)}」`;
  return '一起处理';
}

function buildReason(key, tasks) {
  const projectCount = new Set(tasks.map(item => item.project_id).filter(Boolean)).size;
  if (key.startsWith('context:')) {
    return projectCount > 1
      ? `执行方式相近，可一次进入状态；跨 ${projectCount} 个项目`
      : '执行方式相近，可一次进入状态';
  }
  if (key.startsWith('direction:')) return '都服务于同一个长期方向';
  if (key.startsWith('project:')) return '都在推进同一个项目结果';
  if (key.startsWith('tag:')) return `都带有「${key.slice(4)}」分类`;
  return '具有相近的执行情境';
}

function fitWithinDuration(tasks) {
  const result = [];
  let minutes = 0;
  for (const task of tasks) {
    const estimate = estimateMinutes(task);
    if (minutes + estimate > MAX_BAG_DURATION) continue;
    result.push(task);
    minutes += estimate;
  }
  return result;
}

function computeGroups(tasks, preferences = derivePreferences([])) {
  const candidates = Array.isArray(tasks) ? tasks.slice(0, MAX_CANDIDATES) : [];
  const byKey = new Map();
  for (const task of candidates) {
    for (const signal of signalsForTask(task, preferences)) {
      if (!byKey.has(signal.key)) byKey.set(signal.key, { key: signal.key, score: signal.score, tasks: [] });
      const group = byKey.get(signal.key);
      group.score = Math.max(group.score, signal.score);
      group.tasks.push(task);
    }
  }

  const ranked = [...byKey.values()]
    .filter(group => group.tasks.length >= MIN_GROUP_SIZE)
    .sort((a, b) => b.score - a.score || b.tasks.length - a.tasks.length || a.key.localeCompare(b.key));
  const claimed = new Set();
  const result = [];
  for (const candidate of ranked) {
    const available = candidate.tasks.filter(task => !claimed.has(task.id));
    const selected = fitWithinDuration(available);
    if (selected.length < MIN_GROUP_SIZE) continue;
    selected.forEach(task => claimed.add(task.id));
    const adjustmentCount = preferences.keyCounts?.get(candidate.key) || 0;
    result.push({
      key: candidate.key,
      label: groupLabel(candidate.key, selected),
      reason: buildReason(candidate.key, selected),
      taskCount: selected.length,
      estimatedMinutes: selected.reduce((sum, task) => sum + estimateMinutes(task), 0),
      personalization: {
        adjustmentCount,
        explanation: adjustmentCount ? `已参考你过去 ${adjustmentCount} 次调整` : '根据执行方式、项目与长期方向建议'
      },
      tasks: selected.map(task => ({
        id: task.id,
        title: task.content,
        tags: task.tags || [],
        projectId: task.project_id,
        projectName: task.project_name || '',
        compoundItemId: task.compound_item_id || null,
        compoundItemName: task.compound_item_name || '',
        scheduledDate: task.scheduled_date,
        deadline: task.deadline,
        estimatedMinutes: estimateMinutes(task)
      }))
    });
  }
  return result.slice(0, MAX_GROUPS);
}

module.exports = {
  MIN_GROUP_SIZE,
  MAX_CANDIDATES,
  DEFAULT_MINUTES_PER_TASK,
  MAX_BAG_DURATION,
  MAX_GROUPS,
  EXECUTION_CONTEXTS,
  estimateMinutes,
  computeGroups,
  contextKeys,
  derivePreferences,
  groupKeys,
  buildReason
};
