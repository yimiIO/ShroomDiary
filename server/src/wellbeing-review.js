'use strict';

const crypto = require('node:crypto');
const {
  hasDiaryHealthExtraction,
  legacyHealthObservation,
  normalizeDiaryHealthExtraction
} = require('./diary-health');

const WELLBEING_REVIEW_VERSION = 'wellbeing-value-review-2026-09-13-v3';
const WELLBEING_VALUE_TYPES = [
  'BASELINE',
  'STATE',
  'CHANGE',
  'TRIGGER_CONTEXT',
  'RELIEF_PROTECTIVE',
  'FUNCTIONAL_IMPACT',
  'RISK_SIGNAL',
  'MEASUREMENT_TEST'
];

const WELLBEING_CANDIDATE_PROMPT = `你是 Shroom 的“身心线索召回器”。第一阶段的任务是从日记找出可能对用户长期身心观察有价值的候选，不做医学诊断。

只记录用户本人的亲身经验，不得把他人症状、收藏文本、AI 回答、一般知识或计划当成用户的身心观察。
可以包括：心理感受、压力、认知或行为变化；身体症状；睡眠、饮食、运动、药物等生活因素；环境；测量和检查结果；也包括明确的缓解与保护因素。
每个 evidenceExcerpt 必须是对应日记中连续出现的逐字原文。“可能、也许、好像、怀疑、不确定”必须标为 UNCERTAIN。不推断疾病、人格或因果。
数量不设上限，有多少真实有价值的就返回多少；没有就返回空数组。每篇日记最多合并为一项候选。

只返回 JSON：{"records":[{"diaryId":"真实日记ID","healthExtraction":{"psychologicalObservations":[{"observation":"心理观察","aspect":"EMOTION|STRESS|COGNITION|BEHAVIOR","evidenceExcerpt":"逐字原文","certainty":"EXPLICIT|UNCERTAIN"}],"physicalObservations":[{"symptom":"身体观察","bodyAreas":[],"severity":null,"observedAt":"","duration":"","measurements":[],"testResults":[],"evidenceExcerpt":"逐字原文","certainty":"EXPLICIT|UNCERTAIN"}],"lifestyleFactors":[{"factor":"生活因素","category":"SLEEP|DIET|EXERCISE|CAFFEINE|ALCOHOL|MEDICATION|OTHER","evidenceExcerpt":"逐字原文","certainty":"EXPLICIT|UNCERTAIN"}],"environmentFactors":[{"observation":"环境因素","category":"TEMPERATURE|HUMIDITY|ALTITUDE|TRAVEL|LIVING_ENVIRONMENT|OTHER","evidenceExcerpt":"逐字原文","certainty":"EXPLICIT|UNCERTAIN"}],"missingInformation":[],"redFlags":[]}}]}`;

const WELLBEING_REVIEW_PROMPT = `你是 Shroom 的“身心观察价值审核员”。你的目标不是提高或降低提取比例，而是确保每条保留的记录真的能帮助写日记的人发现、理解或持续观察自己的身体或心理状态。

你必须独立重读完整日记，第一阶段 candidates 仅供参考：可以全部否决、改写，也可以补充第一阶段遗漏的日记。数量不设上限，不要为达到比例而硬凑或删减。
userFeedback 是该用户近期主动否决的例子和原因，用来理解他希望如何区分身心线索；不得把单个反馈扩大成对所有同类状态的禁止。

保留标准：
1. 主体是用户本人，且是真实经历。他人的情况只能作为触发背景，不能记为用户的健康事实。
2. 必须具有至少一种长期观察价值：BASELINE 个人基线；STATE 明确状态；CHANGE 变化；TRIGGER_CONTEXT 可后续核对的触发/同现背景；RELIEF_PROTECTIVE 缓解或保护因素；FUNCTIONAL_IMPACT 对日常功能的影响；RISK_SIGNAL 安全风险信号；MEASUREMENT_TEST 测量或检查。
3. 普通情绪也可以有价值，前提是它有明确强度、变化、反复、触发背景、功能影响或其他可用线索，而不只是一个无背景的情绪词。
4. evidenceExcerpt 必须是日记中连续出现的逐字原文。事实与用户假设必须分开；同时发生不证明因果；不诊断疾病或人格。
5. whyUseful 用1–2句说明“这条能帮用户看到什么，以后可以怎样核对”，不得复述原文或制造诊断。

必须拒绝：纯知识、哲学或业务思考；纯计划/待办/完成汇报；别人的症状；没有当下亲身经验的摘抄；AI 分析结果或二次总结；泛化的自我批评；仅有争吵/工作挫折而没有可观察身心变化的内容。

只返回 JSON：{"records":[{"decision":"KEEP","diaryId":"真实日记ID","confidence":0.0,"healthValueTypes":["STATE"],"whyUseful":"为什么值得留下","healthExtraction":{"psychologicalObservations":[],"physicalObservations":[],"lifestyleFactors":[],"environmentFactors":[],"missingInformation":[],"redFlags":[]}}]}。被拒绝的日记不放进 records。`;

function bounded(value, limit = 1200) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, limit);
}

function firstExcerpt(extraction) {
  for (const items of [
    extraction.psychologicalObservations,
    extraction.physicalObservations,
    extraction.lifestyleFactors,
    extraction.environmentFactors,
    extraction.redFlags
  ]) {
    const excerpt = Array.isArray(items) && items.find(item => item.evidenceExcerpt)?.evidenceExcerpt;
    if (excerpt) return bounded(excerpt);
  }
  return '';
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.max(0, Math.min(1, number)) * 1000) / 1000;
}

function wellbeingSourceFingerprint(content) {
  const normalized = String(content || '').normalize('NFKC').replace(/\s+/gu, '').trim();
  return normalized ? crypto.createHash('sha256').update(normalized).digest('hex') : '';
}

function normalizeReviewedWellbeing(value, diary) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (String(input.decision || '').toUpperCase() !== 'KEEP') return null;
  if (!diary || String(input.diaryId || input.diary_id || '') !== String(diary.id || '')) return null;
  const extraction = normalizeDiaryHealthExtraction(
    input.healthExtraction || input.health_extraction || input.extraction || {},
    { diaryContent: diary.content }
  );
  if (!hasDiaryHealthExtraction(extraction)) return null;
  const whyUseful = bounded(input.whyUseful || input.why_useful, 500);
  if (!whyUseful) return null;
  const healthValueTypes = [...new Set((Array.isArray(input.healthValueTypes || input.health_value_types)
    ? (input.healthValueTypes || input.health_value_types) : [])
    .map(item => String(item || '').toUpperCase())
    .filter(item => WELLBEING_VALUE_TYPES.includes(item)))];
  if (!healthValueTypes.length) return null;
  const sourceExcerpt = firstExcerpt(extraction);
  if (!sourceExcerpt) return null;
  return {
    extraction,
    observation: legacyHealthObservation(extraction),
    sourceExcerpt,
    healthValueTypes,
    whyUseful,
    confidence: normalizeConfidence(input.confidence),
    reviewVersion: WELLBEING_REVIEW_VERSION,
    sourceFingerprint: wellbeingSourceFingerprint(diary.content)
  };
}

function normalizeReviewedWellbeingRecords(value, diaries = []) {
  const diaryMap = new Map(diaries.map(diary => [String(diary.id), diary]));
  const seen = new Set();
  const records = [];
  for (const item of Array.isArray(value) ? value : []) {
    const diaryId = String(item?.diaryId || item?.diary_id || '');
    if (seen.has(diaryId)) continue;
    const normalized = normalizeReviewedWellbeing(item, diaryMap.get(diaryId));
    if (!normalized) continue;
    records.push({
      ...normalized,
      diaryId,
      recordedOn: diaryMap.get(diaryId).diary_date || diaryMap.get(diaryId).date
    });
    seen.add(diaryId);
  }
  return records;
}

function reviewPrompt() {
  return WELLBEING_REVIEW_PROMPT;
}

async function reviewDiaryWellbeing(callJson, {
  diary, firstCandidate = null, userFeedback = [], usageContext = {}
}) {
  const response = await callJson(
    WELLBEING_REVIEW_PROMPT,
    {
      diaries: [{ id: diary.id, diary_date: diary.diary_date, content: diary.content }],
      candidates: firstCandidate ? [{ diaryId: diary.id, ...firstCandidate }] : [],
      userFeedback: Array.isArray(userFeedback) ? userFeedback.slice(0, 12) : []
    },
    '身心观察价值审核',
    { maxTokens: 3000, temperature: 0.1, usageContext }
  );
  return normalizeReviewedWellbeingRecords(response.records, [diary])[0] || null;
}

module.exports = {
  WELLBEING_CANDIDATE_PROMPT,
  WELLBEING_REVIEW_PROMPT,
  WELLBEING_REVIEW_VERSION,
  WELLBEING_VALUE_TYPES,
  normalizeReviewedWellbeing,
  normalizeReviewedWellbeingRecords,
  reviewDiaryWellbeing,
  reviewPrompt,
  wellbeingSourceFingerprint
};
