'use strict';

const VERSION = 'analysis-vnext-experiment-v1';

const SHARED_ANALYSIS_PROTOCOL = `你正在参与 Shroom 日记分析的只读实验。
你的职责是帮助用户理解自己的记录，不是必须发现问题、提出行动或填满功能模块。
以日记原文为主要依据，区分事件叙述、用户的直接感受、对他人的解释、计划、假设和已经完成的行为。
不要把他人的行为归到用户身上，不要把一次记录扩展为稳定人格或跨情境模式。
允许提出有根据的新解释，但必须标明它是解释而不是事实，并保留其他合理解释和会改变判断的信息缺口。
没有足够新增理解时，applicable 可以为 false，observations 可以为空数组。
本实验不会创建待办、菇卡、身心记录、未解之问、关系变化、人生 OS 或复利记录。`;

const SYNTHESIS_PROMPT = `${SHARED_ANALYSIS_PROTOCOL}
你负责比较所有观察席结果，而不是重新分析并扩写日记。
找出真正带来新增理解的区别、联系、矛盾、变化、证据缺口或有帮助的整理；合并重复表达。
primaryInsights 只用于首屏排序，最多 2 条；其余仍有价值的信息放入 additionalInsights，不得因为首屏上限删除。
只返回 JSON：{"primaryInsights":[{"statement":"理解候选","informationType":"INTERPRETATION|SOURCE_EXPRESSION|SUGGESTION","evidenceRefs":["S1"],"alternativeExplanations":[],"missingInformation":[]}],"additionalInsights":[],"caveats":[]}。
引用只能使用 sourceIndex 中存在的编号；不要输出确认或保存状态。`;

const OBSERVATION_OUTPUT_CONTRACT = `
只返回 JSON：
{"applicable":true,"reason":"为什么适用或不适用","observations":[{"kind":"DISTINCTION|CONNECTION|TENSION|CHANGE|EVIDENCE_GAP|ORGANIZATION","statement":"观察或解释","informationType":"SOURCE_EXPRESSION|INTERPRETATION|SUGGESTION","actorScope":"USER|OTHER|RELATIONSHIP|MIXED|UNKNOWN","temporalScope":"原文能够支持的时间范围","evidenceRefs":["S1"],"alternativeExplanations":[],"missingInformation":[],"confidence":0.0}]}。
evidenceRefs 只能引用输入 sourceIndex 中存在的编号。用户是否采纳不属于你的判断，不要输出确认、事实化或保存状态。`;

const VNEXT_OBSERVER_TASKS = Object.freeze({
  first_principles: `从第一性原理角度检查：用户是否把事实、假设、对他人动机的解释和未来预测混在一起。只有在能指出一个真正有帮助的区别、隐藏前提或证据缺口时才输出；不要把原文换句话复述。`,
  entropy: `仅在秩序、维护成本、能量消耗或系统走向确实能帮助理解时使用熵视角。不要把普通情绪机械地称为熵增，也不要为了本视角强行生成行动建议。`,
  compound: `仅在原文涉及能够重复、积累、复用或长期消耗存量的机制时使用复利视角。区分一次性经历、计划、已经完成的行为和可核验结果；不要把所有积极行为都称为复利。`,
  life_os: `仅对输入中当前有效且与本次具体事件相关的人生 OS 条款进行观察。没有提到执行不等于违反；同一原则在不同事件中可以同时出现支持与偏离，必须分别说明事件范围。人生 OS 也可以被新经历挑战。`,
  biological: `仅在原文明确出现重复行为、奖励循环、冲动或明知不愿仍反复发生的行为时使用生物驱动视角。不得诊断依赖、耐受、基线下降或人格特征；信息不足时返回不适用。`
});

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function buildSourceIndex(content) {
  const input = String(content || '');
  const result = [];
  const pattern = /[^\n。！？!?]+[。！？!?]?/gu;
  let match;
  while ((match = pattern.exec(input))) {
    const leading = match[0].match(/^\s*/u)?.[0]?.length || 0;
    const text = match[0].trim();
    if (!text) continue;
    const start = match.index + leading;
    result.push({
      id: `S${result.length + 1}`,
      origin: 'DIARY',
      text,
      start,
      end: start + text.length
    });
  }
  return result;
}

function stringList(value, maxItems = 8, maxLength = 500) {
  return (Array.isArray(value) ? value : [])
    .map(item => clean(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeContext(context) {
  const safe = context && typeof context === 'object' && !Array.isArray(context)
    ? JSON.parse(JSON.stringify(context)) : {};
  for (const key of [
    'experimentalOutputs',
    'previousModelOutputs',
    'aiInterpretations',
    'analysisOutputs',
    'analysisCandidates'
  ]) delete safe[key];
  return safe;
}

function normalizeObservation(value, observer, allowedRefs = new Set()) {
  const validInformationTypes = new Set(['SOURCE_EXPRESSION', 'INTERPRETATION', 'SUGGESTION']);
  const validActorScopes = new Set(['USER', 'OTHER', 'RELATIONSHIP', 'MIXED', 'UNKNOWN']);
  const validKinds = new Set(['DISTINCTION', 'CONNECTION', 'TENSION', 'CHANGE', 'EVIDENCE_GAP', 'ORGANIZATION']);
  const observations = (Array.isArray(value?.observations) ? value.observations : [])
    .map(item => {
      const statement = clean(item?.statement || item?.text || item?.headline, 1200);
      const evidenceRefs = [...new Set(stringList(item?.evidenceRefs, 12, 24))]
        .filter(ref => allowedRefs.has(ref));
      if (!statement || !evidenceRefs.length) return null;
      return {
        kind: validKinds.has(item?.kind) ? item.kind : 'ORGANIZATION',
        statement,
        informationType: validInformationTypes.has(item?.informationType)
          ? item.informationType : 'INTERPRETATION',
        adoptionStatus: 'UNREVIEWED',
        actorScope: validActorScopes.has(item?.actorScope) ? item.actorScope : 'UNKNOWN',
        temporalScope: clean(item?.temporalScope, 300),
        evidenceRefs,
        alternativeExplanations: stringList(item?.alternativeExplanations),
        missingInformation: stringList(item?.missingInformation),
        confidence: Number.isFinite(Number(item?.confidence))
          ? Math.max(0, Math.min(1, Number(item.confidence))) : null
      };
    })
    .filter(Boolean);
  return {
    observer: { id: clean(observer?.id, 80), name: clean(observer?.name, 80) },
    applicable: value?.applicable !== false && observations.length > 0,
    reason: clean(value?.reason, 500),
    observations
  };
}

function normalizeSynthesis(value, allowedRefs = new Set()) {
  const validInformationTypes = new Set(['SOURCE_EXPRESSION', 'INTERPRETATION', 'SUGGESTION']);
  const normalizeInsight = raw => {
    const statement = clean(raw?.statement || raw?.text || raw?.headline, 1200);
    const evidenceRefs = [...new Set(stringList(raw?.evidenceRefs, 12, 24))]
      .filter(ref => allowedRefs.has(ref));
    if (!statement || !evidenceRefs.length) return null;
    return {
      statement,
      informationType: validInformationTypes.has(raw?.informationType)
        ? raw.informationType : 'INTERPRETATION',
      adoptionStatus: 'UNREVIEWED',
      evidenceRefs,
      alternativeExplanations: stringList(raw?.alternativeExplanations),
      missingInformation: stringList(raw?.missingInformation)
    };
  };
  const primaryInsights = [];
  const additionalInsights = [];
  const seen = new Set();
  const append = (raw, preferred) => {
    const insight = normalizeInsight(raw);
    if (!insight) return;
    const key = insight.statement.replace(/[\s，。！？、,.!?]/gu, '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (preferred && primaryInsights.length < 2) primaryInsights.push(insight);
    else additionalInsights.push(insight);
  };
  for (const item of Array.isArray(value?.primaryInsights) ? value.primaryInsights : []) append(item, true);
  for (const item of Array.isArray(value?.additionalInsights) ? value.additionalInsights : []) append(item, false);
  return {
    primaryInsights,
    additionalInsights,
    caveats: stringList(value?.caveats, 12, 800)
  };
}

async function runAnalysisVNext({ diary, observers = [], sourceActivities = [], context = {}, callJson, model }) {
  if (!diary || !clean(diary.content)) throw new Error('analysis vNext requires diary content');
  if (typeof callJson !== 'function') throw new Error('analysis vNext requires a model caller');
  const usageContext = { billable: false, feature: 'analysis_vnext_experiment' };
  const sourceIndex = buildSourceIndex(diary.content);
  const allowedRefs = new Set(sourceIndex.map(item => item.id));
  const input = {
    diary: {
      id: clean(diary.id, 80),
      diaryDate: clean(diary.diaryDate || diary.diary_date, 20),
      content: clean(diary.content, 20000)
    },
    sourceIndex,
    sourceActivities,
    context: sanitizeContext(context)
  };
  const observations = [];
  for (const observer of observers) {
    const raw = await callJson(
      `${SHARED_ANALYSIS_PROTOCOL}\n\n观察席任务：\n${clean(observer.vNextPrompt || observer.prompt, 8000)}\n${OBSERVATION_OUTPUT_CONTRACT}`,
      input,
      `analysis vNext · ${clean(observer.name, 80) || clean(observer.id, 80)}`,
      { model, usageContext }
    );
    observations.push(normalizeObservation(raw, observer, allowedRefs));
  }
  const synthesisRaw = await callJson(
    SYNTHESIS_PROMPT,
    { ...input, observations },
    'analysis vNext · 综合',
    { model, usageContext }
  );
  return {
    version: VERSION,
    mode: 'READ_ONLY_EXPERIMENT',
    diary: input.diary,
    sourceIndex,
    sourceActivities,
    observations,
    synthesis: normalizeSynthesis(synthesisRaw, allowedRefs)
  };
}

module.exports = {
  SHARED_ANALYSIS_PROTOCOL,
  SYNTHESIS_PROMPT,
  VNEXT_OBSERVER_TASKS,
  VERSION,
  buildSourceIndex,
  sanitizeContext,
  normalizeObservation,
  normalizeSynthesis,
  runAnalysisVNext
};
