'use strict';

const VERSION = 'analysis-b2-experiment-v4';

const { VNEXT_OBSERVER_TASKS } = require('./analysis-vnext');
const { FOLLOWUP_PROMPT: PRODUCTION_FOLLOWUP_PROMPT } = require('./ai-prompts');
const { normalizeCardSuggestion } = require('./card-suggestions');
const { normalizeDiaryHealthExtraction } = require('./diary-health');
const { normalizeInquiryCandidates } = require('./inquiry-candidates');
const { normalizeLifeOsLinks } = require('./life-os-long-term');

const SOURCE_PROTOCOL = `你正在参与 Shroom 日记分析的只读 B2 实验。
输入中的 diarySource.text 是一份完整日记，段落地址形如 D1:P01。引用依据时只使用这些地址。
输入没有提供某段历史或资料，只表示本次信息不足，不能判断它从未发生或用户过去没有这种情况。
区分事件叙述、用户的直接感受、对他人的解释、计划、假设和已经完成的行为；不要把一次记录扩展为稳定人格或跨情境模式。`;

const SHARED_PROTOCOL = `${SOURCE_PROTOCOL}
观察数量上限只是护栏。每条都必须带来重要且不同的理解；如果删掉这条不会损失新的理解，就不要保留。
最多 2 条，不适用时直接返回空数组，不要解释为什么没有洞察。`;

const OBSERVATION_OUTPUT_CONTRACT = `最低必填字段只有 statement、informationType 和 evidenceRefs。
只有当判断涉及人物归属、跨时间、原因、意图、稳定模式或证据限制时，才增加 actorScope、temporalScope、alternativeExplanations、missingInformation、kind 或 confidence；不要为简单原文表达机械填空。
如果 statement 已经准确保留不确定性，不要在可选字段里重复一遍；替代解释最多 1 条，缺失信息最多 2 条。
只返回 JSON：{"observations":[{"statement":"观察","informationType":"SOURCE_EXPRESSION|INTERPRETATION|SUGGESTION","evidenceRefs":["D1:P01"],"actorScope":"USER|OTHER|RELATIONSHIP|MIXED|UNKNOWN（按需）","temporalScope":"按需","alternativeExplanations":["按需"],"missingInformation":["按需"]}]}。
用户是否采纳不属于你的判断，不要输出确认、事实化或保存状态。`;

const B2_COMBINED_PROMPT = `${SOURCE_PROTOCOL}
你负责第六次也是最后一次调用，同时完成两类互不挤占名额的工作：
1. synthesis：真正合并同义判断、保留重要差异和冲突，不要把观察席依次复述。primaryInsights 用于首屏，0—2 条；additionalInsights 最多 2 条。补充项只有在删掉后用户会失去一个重要且不同的理解时才能保留。
2. 产品候选：待办、菇卡、身心记录、未解之问与复利关联必须继续根据完整 diarySource 原文和必要上下文独立判断。首屏洞察数量不得限制候选数量，也不能只从 synthesis 提取候选。

允许 synthesis 为空，是为了普通记录不被强行解释；用户已经分析得很完整不能成为返回空数组的理由。只要观察席中存在一个经过合并后仍能帮助用户看清区别、张力、变化或证据缺口的判断，就应保留最重要的一条；只有全部观察都是重复复述或没有理解价值时才返回空。
生成产品候选前逐段检查完整原文中的明确计划或承诺、可迁移规则、心理感受、身体变化、睡眠与生活环境、长期疑问及复利证据。某项没有进入首屏或已经出现在 missingInformation，不能成为漏掉相应原文候选的理由；仍须按照各模块自身规则决定保留或不保留。

${PRODUCTION_FOLLOWUP_PROMPT}

上文提到的 diary 在本次输入中名为 diarySource，其中 text 是带段落地址的完整原文。最终只返回一个 JSON 根对象，不要追加第二个 JSON、解释或 Markdown；保留上文全部候选字段，并额外加入：
"synthesis":{"primaryInsights":[{"statement":"理解候选","informationType":"INTERPRETATION|SOURCE_EXPRESSION|SUGGESTION","evidenceRefs":["D1:P01"]}],"additionalInsights":[],"caveats":[]}
候选中的 evidenceExcerpt 仍必须使用不带地址标记的日记逐字原文。`;

function clean(value, maximum = 20000) {
  return String(value || '').trim().slice(0, maximum);
}

function buildAddressedSource(content) {
  const input = String(content || '');
  const index = [];
  const lines = [];
  const pattern = /[^\n]+/gu;
  let match;
  while ((match = pattern.exec(input))) {
    const leading = match[0].match(/^\s*/u)?.[0]?.length || 0;
    const text = match[0].trim();
    if (!text) continue;
    const id = `D1:P${String(index.length + 1).padStart(2, '0')}`;
    const start = match.index + leading;
    index.push({ id, origin: 'DIARY', start, end: start + text.length });
    lines.push(`[${id}] ${text}`);
  }
  return { text: lines.join('\n'), index };
}

function cloneObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value)) : {};
}

function stringList(value, maximumItems = 8, maximumLength = 500) {
  return (Array.isArray(value) ? value : [])
    .map(item => clean(item, maximumLength))
    .filter(Boolean)
    .slice(0, maximumItems);
}

function normalizeObservationResult(value, observer, allowedRefs) {
  const informationTypes = new Set(['SOURCE_EXPRESSION', 'INTERPRETATION', 'SUGGESTION']);
  const actorScopes = new Set(['USER', 'OTHER', 'RELATIONSHIP', 'MIXED', 'UNKNOWN']);
  const kinds = new Set(['DISTINCTION', 'CONNECTION', 'TENSION', 'CHANGE', 'EVIDENCE_GAP', 'ORGANIZATION']);
  const observations = [];
  for (const raw of Array.isArray(value?.observations) ? value.observations : []) {
    const statement = clean(raw?.statement || raw?.text || raw?.headline, 1200);
    const evidenceRefs = [...new Set(stringList(raw?.evidenceRefs, 12, 24))]
      .filter(ref => allowedRefs.has(ref));
    if (!statement || !evidenceRefs.length) continue;
    const item = {
      statement,
      informationType: informationTypes.has(raw?.informationType)
        ? raw.informationType : 'INTERPRETATION',
      adoptionStatus: 'UNREVIEWED',
      evidenceRefs
    };
    if (kinds.has(raw?.kind)) item.kind = raw.kind;
    if (actorScopes.has(raw?.actorScope)) item.actorScope = raw.actorScope;
    const temporalScope = clean(raw?.temporalScope, 300);
    if (temporalScope) item.temporalScope = temporalScope;
    const alternativeExplanations = stringList(raw?.alternativeExplanations);
    if (alternativeExplanations.length) item.alternativeExplanations = alternativeExplanations;
    const missingInformation = stringList(raw?.missingInformation);
    if (missingInformation.length) item.missingInformation = missingInformation;
    if (Number.isFinite(Number(raw?.confidence))) {
      item.confidence = Math.max(0, Math.min(1, Number(raw.confidence)));
    }
    observations.push(item);
  }
  if (observations.length > 2) {
    throw new Error(`B2 观察席最多保留 2 条不同观察：${clean(observer?.name || observer?.id, 80)}`);
  }
  return {
    observer: { id: clean(observer?.id, 80), name: clean(observer?.name, 80) },
    applicable: observations.length > 0,
    observations
  };
}

function normalizeSynthesis(value, allowedRefs) {
  const informationTypes = new Set(['SOURCE_EXPRESSION', 'INTERPRETATION', 'SUGGESTION']);
  const normalize = raw => {
    const statement = clean(raw?.statement || raw?.text || raw?.headline, 1200);
    const evidenceRefs = [...new Set(stringList(raw?.evidenceRefs, 12, 24))]
      .filter(ref => allowedRefs.has(ref));
    if (!statement || !evidenceRefs.length) return null;
    const item = {
      statement,
      informationType: informationTypes.has(raw?.informationType)
        ? raw.informationType : 'INTERPRETATION',
      adoptionStatus: 'UNREVIEWED',
      evidenceRefs
    };
    const alternatives = stringList(raw?.alternativeExplanations);
    if (alternatives.length) item.alternativeExplanations = alternatives;
    const missing = stringList(raw?.missingInformation);
    if (missing.length) item.missingInformation = missing;
    return item;
  };
  const seen = new Set();
  const primaryInsights = [];
  const additionalInsights = [];
  const append = (raw, target) => {
    const item = normalize(raw);
    if (!item) return;
    const key = item.statement.replace(/[\s，。！？、,.!?]/gu, '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    target.push(item);
  };
  for (const raw of Array.isArray(value?.primaryInsights) ? value.primaryInsights : []) {
    append(raw, primaryInsights);
  }
  for (const raw of Array.isArray(value?.additionalInsights) ? value.additionalInsights : []) {
    append(raw, additionalInsights);
  }
  if (primaryInsights.length > 2 || additionalInsights.length > 2) {
    throw new Error('B2 综合必须真正取舍：主要理解和补充理解都最多保留 2 条');
  }
  return {
    primaryInsights,
    additionalInsights,
    caveats: stringList(value?.caveats, 2, 800)
  };
}

function normalizeFollowup(value, context, diaryContent) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    todoCandidates: Array.isArray(input.todoCandidates || input.candidates)
      ? (input.todoCandidates || input.candidates).slice(0, 30) : [],
    cardSuggestion: normalizeCardSuggestion(input.cardSuggestion, context.cards),
    healthExtraction: normalizeDiaryHealthExtraction(
      input.healthExtraction || input.health_extraction || {},
      { diaryContent }
    ),
    inquiryCandidates: normalizeInquiryCandidates(input.inquiryCandidates, context.inquiries),
    compoundLinks: normalizeLifeOsLinks(input.compoundLinks || input.lifeOsLinks, context.compoundDirections, diaryContent)
  };
}

function selectedContextForObserver(observer, context = {}) {
  const presetKey = clean(observer?.presetKey || observer?.preset_key, 80);
  if (presetKey === 'compound') {
    return { compoundDirections: Array.isArray(context.compoundDirections) ? context.compoundDirections : [] };
  }
  if (presetKey === 'life_os') {
    if (Array.isArray(context.lifeOsClauses) && context.lifeOsClauses.length) {
      return { lifeOsClauses: context.lifeOsClauses };
    }
    return clean(context.lifeOsMarkdown)
      ? { lifeOsMarkdown: clean(context.lifeOsMarkdown, 20000) } : {};
  }
  if (presetKey === 'biological') {
    const input = Array.isArray(context.priorSourceRecords)
      ? context.priorSourceRecords
      : (Array.isArray(context.relatedSourceRecords) ? context.relatedSourceRecords : []);
    const records = input.filter(record => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
      if (record.sourceValid === false || record.supersededBy || record.invalidatedAt) return false;
      if (['INVALID_SOURCE', 'SUPERSEDED', 'REJECTED'].includes(record.status)) return false;
      if (record.informationType && record.informationType !== 'SOURCE_EXPRESSION') return false;
      if (['AI', 'ANALYSIS', 'MODEL'].includes(record.origin)) return false;
      return true;
    }).slice(0, 20).map(record => JSON.parse(JSON.stringify(record)));
    return records.length ? { priorSourceRecords: records } : {};
  }
  if (!presetKey) {
    const custom = context.observerContexts?.[observer?.id]
      || context.observerContexts?.[observer?.name];
    return cloneObject(custom);
  }
  return {};
}

async function runAnalysisB2({ diary, observers = [], sourceActivities = [], context = {}, callJson, model }) {
  if (!diary || !clean(diary.content)) throw new Error('analysis B2 requires diary content');
  if (typeof callJson !== 'function') throw new Error('analysis B2 requires a model caller');
  const addressed = buildAddressedSource(diary.content);
  const usageContext = { billable: false, feature: 'analysis_b2_experiment' };
  const diarySource = {
    id: clean(diary.id, 80),
    diaryDate: clean(diary.diaryDate || diary.diary_date, 20),
    text: addressed.text
  };
  const observations = [];
  const allowedRefs = new Set(addressed.index.map(item => item.id));
  for (const observer of observers) {
    const observerTask = clean(
      observer?.b2Prompt
      || observer?.vNextPrompt
      || VNEXT_OBSERVER_TASKS[observer?.presetKey]
      || `从用户指定的「${observer?.name || '自定义'}」角度观察：${observer?.description || observer?.instructions || ''}`,
      4000
    );
    const result = await callJson(
      `${SHARED_PROTOCOL}\n\n观察席任务：\n${observerTask}\n\n${OBSERVATION_OUTPUT_CONTRACT}`,
      { diarySource, sourceActivities, context: selectedContextForObserver(observer, context) },
      `analysis B2 · ${clean(observer.name, 80) || clean(observer.id, 80)}`,
      { model, usageContext, temperature: 0.2 }
    );
    observations.push(normalizeObservationResult(result, observer, allowedRefs));
  }
  const combined = await callJson(
    B2_COMBINED_PROMPT,
    {
      diarySource,
      sourceActivities,
      observations,
      existingCards: Array.isArray(context.cards) ? context.cards : [],
      existingInquiries: Array.isArray(context.inquiries) ? context.inquiries : [],
      compoundDirections: Array.isArray(context.compoundDirections) ? context.compoundDirections : []
    },
    'analysis B2 · 综合与候选',
    { model, usageContext, temperature: 0.1 }
  );
  const { synthesis: rawSynthesis, ...rawFollowup } = combined && typeof combined === 'object'
    ? combined : {};
  return {
    version: VERSION,
    mode: 'READ_ONLY_EXPERIMENT',
    diary: { ...diary, content: String(diary.content) },
    sourceIndex: addressed.index,
    sourceActivities,
    observations,
    synthesis: normalizeSynthesis(rawSynthesis || {}, allowedRefs),
    followup: normalizeFollowup(rawFollowup, context, String(diary.content))
  };
}

module.exports = {
  OBSERVATION_OUTPUT_CONTRACT,
  B2_COMBINED_PROMPT,
  SHARED_PROTOCOL,
  VERSION,
  buildAddressedSource,
  normalizeObservationResult,
  normalizeFollowup,
  normalizeSynthesis,
  runAnalysisB2,
  selectedContextForObserver
};
