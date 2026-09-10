'use strict';

const { normalizeQuestionPlan } = require('./question-planner');

const PRESETS = Object.freeze([
  {
    key: 'growth',
    title: '成长',
    question: '回看我的成长：哪些日记记录了认知更新、能力变化、行为调整，或者从经历中形成了新的理解？',
    criterion: '根据日记正文语义，判断是否明确记录了用户本人的认知更新、能力变化、行为调整、经验学习或对过去做法的修正。仅仅出现“成长”一词但没有具体变化不算。'
  },
  {
    key: 'emotion',
    title: '情绪',
    question: '回看我的情绪：哪些日记记录了明显的情绪体验、触发原因或情绪变化？',
    criterion: '根据日记正文语义，判断是否明确记录了用户本人的显著情绪体验、情绪触发、情绪调节或前后变化。事件本身不能替代用户真实表达的感受。'
  },
  {
    key: 'relationship',
    title: '关系',
    question: '回看我的关系：哪些日记记录了我与他人的连接、冲突、边界、支持或关系变化？',
    criterion: '根据日记正文语义，判断是否明确涉及用户本人和具体他人之间的连接、互动、支持、冲突、边界、承诺或关系变化。泛泛谈论社会关系不算。'
  },
  {
    key: 'work',
    title: '工作',
    question: '回看我的工作：哪些日记记录了职业、项目、协作、决策、压力或工作方式的变化？',
    criterion: '根据日记正文语义，判断是否明确涉及用户本人的职业、业务、项目推进、工作协作、工作决策、工作压力或工作方式变化；不要求正文出现“工作”二字。'
  },
  {
    key: 'travel',
    title: '旅行',
    question: '回看我的旅行：哪些日记记录了出发、在路上、异地生活或旅途中发生的体验？',
    criterion: '根据日记正文语义，判断是否明确记录了用户本人的旅行、迁移、在路上、异地停留或因地点改变而产生的具体体验。单纯提到地名不算。'
  },
  {
    key: 'inspiration',
    title: '灵感',
    question: '回看我的灵感：哪些日记出现了值得继续发展的想法、洞见、创作冲动或新方向？',
    criterion: '根据日记正文语义，判断是否明确出现了用户本人值得继续发展的想法、洞见、创作冲动、新方向或问题解法。普通事实记录和空泛感慨不算。'
  }
]);

const BY_KEY = new Map(PRESETS.map(item => [item.key, item]));

function cleanScope(value = {}) {
  return {
    dateFrom: value.dateFrom || null,
    dateTo: value.dateTo || null,
    diaryIds: Array.isArray(value.diaryIds) ? value.diaryIds : []
  };
}

function themeCatalog() {
  return PRESETS.map(({ key, title, question }) => ({ key, title, question }));
}

function themePreset(key) {
  return BY_KEY.get(String(key || '')) || null;
}

function themePlan(key, selectedScope = {}, now = new Date()) {
  const preset = themePreset(key);
  if (!preset) return null;
  return normalizeQuestionPlan({
    intent: 'search',
    strategy: 'semantic_census',
    criterion: preset.criterion,
    subject: '用户本人',
    unit: 'entry',
    groupBy: 'year',
    matchPolicy: 'any_evidence',
    dateFrom: null,
    dateTo: null,
    rangeLabel: '全部已授权日记',
    resultLabel: preset.title,
    reason: '这是用户主动打开的固定主题回看；使用稳定语义标准并复用逐篇判断结果。'
  }, cleanScope(selectedScope), now);
}

async function resolveAnalysisPlan(options) {
  const preset = themePlan(options.scope?.themeKey, options.scope, options.now);
  if (preset) return preset;
  return options.planner(options);
}

module.exports = {
  resolveAnalysisPlan,
  themeCatalog,
  themePlan,
  themePreset
};
