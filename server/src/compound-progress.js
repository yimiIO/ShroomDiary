'use strict';

const PROGRESS_MODES = Object.freeze({
  MAINTENANCE: 'MAINTENANCE',
  SITUATIONAL: 'SITUATIONAL',
  OUTCOME: 'OUTCOME'
});

const MODE_BY_ITEM = Object.freeze({
  '01': PROGRESS_MODES.MAINTENANCE,
  '02': PROGRESS_MODES.SITUATIONAL,
  '03': PROGRESS_MODES.OUTCOME,
  '04': PROGRESS_MODES.MAINTENANCE,
  '05': PROGRESS_MODES.OUTCOME,
  '06': PROGRESS_MODES.MAINTENANCE,
  '07': PROGRESS_MODES.SITUATIONAL,
  '08': PROGRESS_MODES.SITUATIONAL,
  '09': PROGRESS_MODES.SITUATIONAL,
  '10': PROGRESS_MODES.OUTCOME,
  '11': PROGRESS_MODES.OUTCOME,
  '12': PROGRESS_MODES.OUTCOME,
  '13': PROGRESS_MODES.OUTCOME,
  '14': PROGRESS_MODES.OUTCOME,
  '15': PROGRESS_MODES.MAINTENANCE,
  '16': PROGRESS_MODES.OUTCOME,
  '17': PROGRESS_MODES.MAINTENANCE,
  '18': PROGRESS_MODES.SITUATIONAL,
  '19': PROGRESS_MODES.MAINTENANCE,
  '20': PROGRESS_MODES.MAINTENANCE
});

const RESULT_STATES = Object.freeze(['PREPARING', 'DONE', 'EFFECTIVE', 'UNVERIFIED']);
const REVIEW_DECISIONS = Object.freeze(['CONTINUE', 'ADJUST', 'STOP']);

function clean(value, max = 1200) {
  return String(value || '').trim().slice(0, max);
}

function modeForItem(itemKey) {
  return MODE_BY_ITEM[String(itemKey || '')] || PROGRESS_MODES.OUTCOME;
}

function normalizeStarter(value, item) {
  const desiredOutcome = clean(value?.desiredOutcome || value?.outcome, 1000)
    || clean(item?.description || item?.name, 1000);
  const currentStep = clean(value?.currentStep || value?.smallestStep, 800)
    || clean(item?.currentNextStep || item?.minimumAction, 800);
  return {
    desiredOutcome,
    currentStep,
    contextReason: clean(value?.contextReason, 800),
    progressMode: modeForItem(item?.stableKey || item?.stable_key)
  };
}

function normalizeContinuation(value, fallbackStep) {
  const workMode = ['DO_IN_SYSTEM', 'REAL_WORLD'].includes(value?.workMode)
    ? value.workMode : 'REAL_WORLD';
  const currentStep = clean(value?.currentStep || value?.nextStep, 1000) || clean(fallbackStep, 1000);
  return {
    workMode,
    assistance: clean(value?.assistance || value?.draft || value?.guidance, 5000)
      || `现在只推进这一步：${currentStep}`,
    currentStep,
    completionCriteria: clean(value?.completionCriteria, 1000) || '完成后记录真实发生了什么。',
    neededInput: clean(value?.neededInput || value?.question, 600)
  };
}

function normalizeBlocker(value, fallbackStep) {
  const obstacleType = ['MISSING_MATERIAL', 'TOO_LARGE', 'METHOD_FAILED', 'LOW_PRIORITY', 'UNCLEAR']
    .includes(value?.obstacleType) ? value.obstacleType : 'UNCLEAR';
  return {
    obstacleType,
    analysis: clean(value?.analysis, 1800) || '先把当前障碍缩小到一个可以处理的部分。',
    adjustedStep: clean(value?.adjustedStep || value?.nextStep, 1000) || clean(fallbackStep, 1000),
    neededInput: clean(value?.neededInput || value?.question, 600),
    recommendPause: value?.recommendPause === true
  };
}

function inferResultState(input) {
  const value = clean(input, 2000);
  if (/(有效|改善|增长|减少|通过|成功|复用|对方回复|结果是)/.test(value)) return 'EFFECTIVE';
  if (/(完成|已经|做了|写完|发了|交付|整理了|跑了|练了)/.test(value)) return 'DONE';
  if (/(准备|计划|打算|将要|明天)/.test(value)) return 'PREPARING';
  return 'UNVERIFIED';
}

function normalizeResultDraft(value, rawInput, fallbackStep) {
  const state = RESULT_STATES.includes(value?.state) ? value.state : inferResultState(rawInput);
  return {
    state,
    summary: clean(value?.summary, 1800) || clean(rawInput, 1800),
    actualResult: clean(value?.actualResult || value?.evidence, 2400),
    progressSummary: clean(value?.progressSummary, 1600),
    nextStep: clean(value?.nextStep, 1000) || clean(fallbackStep, 1000),
    uncertainty: clean(value?.uncertainty, 1000)
  };
}

function normalizeDiaryReview(value, evidenceExcerpt, fallbackStep) {
  const facts = (Array.isArray(value?.facts) ? value.facts : [])
    .map(item => clean(item, 500)).filter(Boolean).slice(0, 6);
  const inferences = (Array.isArray(value?.inferences) ? value.inferences : [])
    .map(item => clean(item, 500)).filter(Boolean).slice(0, 5);
  return {
    facts: facts.length ? facts : [clean(evidenceExcerpt, 800)].filter(Boolean),
    inferences,
    previousMethodUsed: ['YES', 'NO', 'UNKNOWN'].includes(value?.previousMethodUsed)
      ? value.previousMethodUsed : 'UNKNOWN',
    methodEffect: clean(value?.methodEffect, 1000),
    nextTry: clean(value?.nextTry || value?.nextStep, 1000) || clean(fallbackStep, 1000),
    neededQuestion: clean(value?.neededQuestion || value?.question, 600)
  };
}

function normalizeStageReview(value, sources) {
  const allowed = new Set((Array.isArray(sources) ? sources : []).map(item => item.sourceKey));
  const list = (input, max = 20) => (Array.isArray(input) ? input : []).map(raw => {
    const sourceRefs = [...new Set((Array.isArray(raw?.sourceRefs) ? raw.sourceRefs : [])
      .map(item => clean(item, 40)).filter(item => allowed.has(item)))].slice(0, 12);
    const text = clean(raw?.text || raw?.summary, 1200);
    return text && sourceRefs.length ? { text, sourceRefs } : null;
  }).filter(Boolean).slice(0, max);
  return {
    summary: clean(value?.summary, 1800),
    actualActions: list(value?.actualActions),
    accumulations: list(value?.accumulations),
    effectiveMethods: list(value?.effectiveMethods),
    ineffectiveMethods: list(value?.ineffectiveMethods),
    decision: REVIEW_DECISIONS.includes(value?.decision) ? value.decision : 'CONTINUE',
    nextStep: clean(value?.nextStep, 1000)
  };
}

const STARTER_PROMPT = `你是 Shroom 「复利系统」的起步助手。根据用户刚选的一个长期方向，以及真实的相关日记、待办、菇卡、困惑和已确认原则，提出一个本次能够真实推进的结果和当下最小一步。

约束：
1. 不伪造个性化背景；只能使用输入里存在的信息。
2. 不要让用户配置指标、频率或 20 项计划。
3. 成果类方向聚焦一个具体产出；维护类聚焦最低可行安排；情境练习聚焦下次可尝试的方法。
4. AI 产出计划不等于用户已经行动。
5. 不创建待办，不修改人生 OS 原则。

只返回 JSON：{"desiredOutcome":"这次要做到什么","currentStep":"现在可以完成的最小一步","contextReason":"这样建议的真实依据"}`;

const CONTINUE_PROMPT = `你是 Shroom 复利系统的执行搭档。用户点击了「继续推进」。必须使用已确认目标、过去事件、已有材料和上次停留位置，不要让用户重复背景。

能在文本中完成的，直接给可使用的初稿、清单、复核或消息，workMode=DO_IN_SYSTEM；必须现实执行的，只给一个清晰动作，workMode=REAL_WORLD。不把 AI 输出当成用户已完成。不自动新建待办、改方向或修改人生 OS。

只返回 JSON：{"workMode":"DO_IN_SYSTEM|REAL_WORLD","assistance":"直接可用的协助内容","currentStep":"完成这次协助后的明确一步","completionCriteria":"怎样才算这一步真正发生","neededInput":"只在确实缺材料时问的一个问题，否则留空"}`;

const BLOCKER_PROMPT = `你是 Shroom 复利系统的障碍诊断助手。结合正在推进的目标、当前一步、过去结果和用户刚说的卡点，识别最具体的障碍。

缺材料就说清补什么；目标太大就缩小一步；方法无效就换方法；暂时不值得就建议搁置。不机械鼓励，不自动新增待办。信息不足时只问一个当前最必要的问题。

只返回 JSON：{"obstacleType":"MISSING_MATERIAL|TOO_LARGE|METHOD_FAILED|LOW_PRIORITY|UNCLEAR","analysis":"对具体障碍的克制判断","adjustedStep":"调整后的一步","neededInput":"最多一个必要问题","recommendPause":false}`;

const RESULT_PROMPT = `你是 Shroom 复利系统的结果整理助手。用户用文字、语音转写或附件说明刚发生了什么。你只整理成可纠正草稿，不直接确认完成。

严格区分：PREPARING=准备做；DONE=真实动作已发生；EFFECTIVE=动作后有可核对效果；UNVERIFIED=发生了什么但效果还不确定。不伪造产出、回复或效果。

只返回 JSON：{"state":"PREPARING|DONE|EFFECTIVE|UNVERIFIED","summary":"实际发生的事","actualResult":"已有产出或可核对变化","progressSummary":"目前做到哪里","nextStep":"下次从哪里接着做","uncertainty":"尚未验证的部分"}`;

const DIARY_REVIEW_PROMPT = `你是 Shroom 复利系统的情境回看助手。一篇真实日记与正在推进的方向有关。请帮用户回看这次发生了什么，严格区分事实和推测，检查之前方法是否真尝试过、是否有效，再给一个下次可尝试的方法。日记没写到不等于没做，不判定失败，不修改正式原则。

只返回 JSON：{"facts":["日记可支持的事实"],"inferences":["需要验证的推测"],"previousMethodUsed":"YES|NO|UNKNOWN","methodEffect":"方法效果或暂无法判断","nextTry":"下次可尝试的具体方法","neededQuestion":"必要时只问一个问题"}`;

const STAGE_REVIEW_PROMPT = `你是 Shroom 复利系统的阶段回看助手。只能使用输入中带 sourceKey 的已确认结果、推进事件和有效日记依据。回答：实际做了什么，留下了什么，什么方法有效或无效，接下来继续、调整还是停止。

不统一计分，不根据没有日记判定没做，不把 AI 建议当用户行动，不改人生 OS 原则。所有列表项必须附 sourceRefs。

只返回 JSON：{"summary":"阶段总结","actualActions":[{"text":"实际行动","sourceRefs":["E1"]}],"accumulations":[{"text":"留下的产出或维护结果","sourceRefs":["E2"]}],"effectiveMethods":[{"text":"有效方法","sourceRefs":["E3"]}],"ineffectiveMethods":[{"text":"无效或待验证方法","sourceRefs":["E4"]}],"decision":"CONTINUE|ADJUST|STOP","nextStep":"下一步"}`;

module.exports = {
  BLOCKER_PROMPT,
  CONTINUE_PROMPT,
  DIARY_REVIEW_PROMPT,
  MODE_BY_ITEM,
  PROGRESS_MODES,
  RESULT_PROMPT,
  RESULT_STATES,
  STAGE_REVIEW_PROMPT,
  STARTER_PROMPT,
  clean,
  inferResultState,
  modeForItem,
  normalizeBlocker,
  normalizeContinuation,
  normalizeDiaryReview,
  normalizeResultDraft,
  normalizeStageReview,
  normalizeStarter
};
