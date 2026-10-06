'use strict';

const { callJson } = require('./ai-engine');

const AI_RESULT_CONVERSATION_VERSION = 'ai-result-conversation-v1';
const RESULT_TYPES = new Set(['DIARY_ANALYSIS', 'DAILY_REVIEW', 'INQUIRY_SYNTHESIS']);

const CONTINUATION_PROMPT = `你是 Shroom 的连续思考伙伴。用户正在围绕一份已经生成的 AI 分析继续讨论。

输入被严格分为三层：
- sources：用户原始表达、已确认记录或可核对的外部记录，是证据；
- priorAnalysis：此前 AI 生成的解释，只是待质疑、待修订的阶段性分析，不是用户事实；
- conversation：用户与 AI 此后的对话。用户消息是原始表达，AI 消息仍只是解释。

必须遵守：
1. 直接回答 currentUserMessage，不要求用户重述背景。
2. 用户质疑此前分析时，先核对来源，再承认、修正或说明仍不能确定，不能维护 AI 的面子。
3. 不把此前 AI 分析、对话摘要或用户采纳过的解释升级为事实、稳定人格、人生 OS 或医学诊断。
4. 涉及用户经历、行为、动机或变化的判断，evidence 只能引用 sources 中存在的 sourceRef；没有证据就明确说不确定。
5. 可以引用用户当前消息说明“你现在这样表达”，但不能把它外推为长期事实。
6. stageCognition 仅在用户明确表达一个关于自己的阶段性看法时输出。originalExpression 必须逐字来自 currentUserMessage；status 永远是 CANDIDATE；它不是人生 OS。
7. rollingSummary 是为了降低后续 Token 的 AI 对话摘要，必须保留时间性、质疑和不确定性，不得把推断写成事实。原始消息不会被摘要覆盖。
8. 不强行生成洞察；普通澄清可以只回答问题。

只返回 JSON：
{
  "answer":"直接、自然的回答",
  "insights":[{"headline":"可选的一句理解","text":"解释","evidence":["D1"],"boundary":"证据边界"}],
  "uncertainties":["仍不能确认的内容"],
  "followUp":["可选的继续讨论方向"],
  "stageCognition":{"originalExpression":"用户当前消息中的逐字原句","interpretation":"带时间性的候选认知描述","confidence":"tentative|emerging","status":"CANDIDATE"},
  "rollingSummary":"截至当前的对话摘要"
}`;

function clean(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function uniqueStrings(value, maxItems, maxLength) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(item => clean(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function normalizeResultType(value) {
  const type = clean(value, 48).toUpperCase();
  return RESULT_TYPES.has(type) ? type : null;
}

function requiresExpandedRetrieval(question) {
  const input = clean(question, 2000);
  return /(?:结合|联系|对照|检索|查找|检查|看看|回看).{0,12}(?:以前|过去|历史|长期|这些年|其他日记|更多记录)|(?:以前|过去|历史|长期|这些年).{0,12}(?:经历|记录|日记|发生|表现)|(?:全部|所有).{0,8}(?:日记|记录)/u.test(input);
}

function publicOrigin(value) {
  const snapshot = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    title: clean(snapshot.displayTitle, 160),
    summary: clean(snapshot.displaySummary, 500),
    resultKind: clean(snapshot.resultKind, 48)
  };
}

function contextSources(snapshot) {
  return (Array.isArray(snapshot?.sources) ? snapshot.sources : []).map((item, index) => {
    const content = clean(item.content || item.excerpt || item.title || item.summary, 16000);
    return {
      sourceRef: clean(item.sourceRef || item.key || `S${index + 1}`, 24),
      sourceType: clean(item.sourceType || item.type || 'RECORD', 48),
      sourceId: clean(item.sourceId || item.id, 160) || null,
      diaryId: item.diaryId || null,
      sourceVersion: Number.isInteger(Number(item.sourceVersion)) ? Number(item.sourceVersion) : null,
      occurredAt: item.occurredAt || item.date || null,
      label: clean(item.label, 160),
      content,
      sourceStart: Number.isInteger(Number(item.sourceStart)) ? Number(item.sourceStart) : 0,
      sourceEnd: Number.isInteger(Number(item.sourceEnd)) ? Number(item.sourceEnd) : content.length
    };
  }).filter(item => item.sourceRef && item.content);
}

function normalizeContinuation(raw, input) {
  const allowed = new Set(input.sources.map(item => item.sourceRef));
  const insights = (Array.isArray(raw?.insights) ? raw.insights : []).map(item => ({
    headline: clean(item?.headline || item?.text, 100),
    text: clean(item?.text, 1600),
    boundary: clean(item?.boundary, 600),
    evidenceRefs: uniqueStrings(item?.evidence, 8, 24).filter(ref => allowed.has(ref))
  })).filter(item => item.headline && item.text && item.evidenceRefs.length).slice(0, 6);
  let stageCognition = null;
  const candidate = raw?.stageCognition;
  const originalExpression = clean(candidate?.originalExpression, 800);
  if (originalExpression && input.currentUserMessage.includes(originalExpression)) {
    stageCognition = {
      originalExpression,
      interpretation: clean(candidate?.interpretation, 1200),
      confidence: ['tentative', 'emerging'].includes(candidate?.confidence) ? candidate.confidence : 'tentative',
      status: 'CANDIDATE',
      evidenceNature: 'USER_STAGE_EXPRESSION'
    };
  }
  return {
    status: 'completed',
    mode: 'related',
    conversationMode: 'anchored_ai_result',
    title: clean(input.origin.displayTitle, 200) || '继续聊聊',
    summary: clean(raw?.answer, 5000),
    observations: insights,
    timeline: [],
    uncertainties: uniqueStrings(raw?.uncertainties, 8, 800),
    followUp: uniqueStrings(raw?.followUp, 4, 300),
    cardDraft: null,
    stageCognition,
    rollingSummary: clean(raw?.rollingSummary, 4000),
    coverage: {
      anchoredResult: true,
      complete: true,
      processedRecords: input.sources.length,
      totalAvailable: input.sources.length,
      semanticMethod: 'saved_analysis_context'
    },
    sources: input.sources.map(item => ({
      sourceRef: item.sourceRef,
      sourceType: item.sourceType === 'DIARY' ? 'DIARY' : 'CONTEXT_RECORD',
      sourceId: item.sourceId,
      diaryId: item.diaryId,
      sourceVersion: item.sourceVersion,
      sourceStart: item.sourceStart,
      sourceEnd: item.sourceEnd,
      excerpt: item.content,
      occurredAt: item.occurredAt,
      role: 'origin_context',
      label: item.label
    }))
  };
}

async function continueAiResultConversation({ userId, originSnapshot, contextSnapshot, conversationSummary,
  history, feedback, currentUserMessage, usageContext }) {
  const sources = contextSources(contextSnapshot);
  const origin = originSnapshot && typeof originSnapshot === 'object' ? originSnapshot : {};
  const input = {
    contract: AI_RESULT_CONVERSATION_VERSION,
    sources,
    priorAnalysis: {
      nature: 'AI_GENERATED_INTERPRETATION_NOT_USER_FACT',
      resultKind: clean(origin.resultKind, 48),
      generatedAt: origin.generatedAt || null,
      content: origin.content || {}
    },
    generationContext: contextSnapshot?.importantContext || {},
    priorConversationSummary: conversationSummary?.text || '',
    conversation: (Array.isArray(history) ? history : []).slice(-8).map(item => ({
      role: item.role,
      content: clean(item.content, 4000),
      nature: item.role === 'user' ? 'USER_ORIGINAL_EXPRESSION' : 'AI_INTERPRETATION'
    })),
    corrections: (Array.isArray(feedback) ? feedback : []).slice(-12),
    currentUserMessage: clean(currentUserMessage, 1000)
  };
  const raw = await callJson(CONTINUATION_PROMPT, input, '继续聊聊', {
    temperature: 0.3,
    maxTokens: 2200,
    usageContext: { ...usageContext, userId, feature: 'ai_result_conversation', billable: true },
    validateResult: value => Boolean(clean(value?.answer, 5000))
  });
  return normalizeContinuation(raw, {
    sources,
    origin,
    currentUserMessage: input.currentUserMessage
  });
}

module.exports = {
  AI_RESULT_CONVERSATION_VERSION,
  CONTINUATION_PROMPT,
  RESULT_TYPES,
  contextSources,
  continueAiResultConversation,
  normalizeContinuation,
  normalizeResultType,
  publicOrigin,
  requiresExpandedRetrieval
};
