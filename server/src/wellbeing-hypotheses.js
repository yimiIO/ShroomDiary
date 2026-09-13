'use strict';

const crypto = require('node:crypto');
const { mapWellbeingRecord } = require('./wellbeing-records');

const WELLBEING_HYPOTHESIS_REVIEW_VERSION = 'wellbeing-hypothesis-2026-09-13-v1';
const WELLBEING_HYPOTHESIS_DOMAINS = ['PSYCHOLOGICAL', 'PHYSICAL'];
const WELLBEING_HYPOTHESIS_KINDS = [
  'PSYCHOLOGICAL_CONCEPT',
  'SYMPTOM_PATTERN',
  'CLINICAL_CONDITION',
  'RISK_SIGNAL'
];
const WELLBEING_HYPOTHESIS_STRENGTHS = ['LIMITED', 'MODERATE', 'STRONG'];
const WELLBEING_HYPOTHESIS_STATUSES = ['PENDING', 'OBSERVING', 'DISMISSED', 'ARCHIVED'];

const WELLBEING_HYPOTHESIS_PROMPT = `你是 Shroom 的“身心问题可能性整理器”。你读取的是用户多次日记中已经抽出的观察，不是完整病历。你的价值是把零散事实整理成“可能需要留意什么问题”，明确叫出有意义的心理学概念、症状模式或医学排查方向；不能只复述“有压力、失眠、疼痛”。

这不是诊断。你必须遵守：
1. 只使用 records 中用户本人的观察。每个 supportingEvidence.recordId 和 challengingEvidence.recordId 必须来自输入；说明它为何支持或不支持，不能补造病史、持续时间、症状、检查或因果。
2. 每个候选必须有一个明确、可理解的问题名称，并在 namedPossibilities 中列出它具体可能涉及的概念或医学方向。例如在证据真的支持时，可以写“抑郁相关症状”“广泛性焦虑需要评估”“情绪调节困难”“社交评价敏感”“多汗症方向”“贫血需要排查”。不能只写“持续低落”“身体不舒服”而不说明它可能指向什么。这些只是格式示例，不得因为示例而输出。
3. 心理疾病名称门槛较高：必须同时看到重复或持续、明显痛苦或功能影响，并考虑身体状况、物质/药物、生活事件等替代解释。证据未达到门槛时，只能输出 PSYCHOLOGICAL_CONCEPT 或 SYMPTOM_PATTERN，如“持续低落倾向”“反刍思维”“情绪调节困难”，不得写成抑郁症、焦虑症等疾病。
4. 身体疾病方向需要具体症状、测量或检查依据，并有持续/反复或客观异常。优先列常见且可核对的鉴别方向；非特异症状不能直接指向罕见重病。一个症状可以有多个 namedPossibilities，不能假装只有一个答案。证据能直接支持的设为 PRIMARY_DIRECTION；仅值得排除但当前证据不足的设为 RULE_OUT，并明确缺少什么。
5. evidenceStrength 只是“现有日记证据的一致程度”，不是患病概率。LIMITED 也可以保留，只要它能告诉用户下一步记录或就医时该核对什么。
6. whyPossible 必须解释“哪些模式让这个方向值得留意”；possibilityStatement 必须使用“可能、相关、需要评估/排查”等不确定措辞。禁止“你患有、已经确诊、就是、一定是”等确定诊断。
7. missingInformation 写清楚距离判断还缺什么；nextObservations 只建议记录最有区分度的信息。不得给药名、剂量或治疗处方。
8. redFlags 只能来自原记录中已经出现的紧急信号。careGuidance 可以建议何时联系医生/心理专业人员；不得保证“无需就医”或“可以放心”。
9. 不按数量凑结果。没有达到“值得用户知道的具名可能性”就返回空数组。最多 8 项，重复问题合并。
10. dismissedFeedback 是用户以前认为不符合自己的候选，仅用于避免重复误判。

只返回 JSON，不要 Markdown：
{"hypotheses":[{"stableKey":"简短稳定英文key","domain":"PSYCHOLOGICAL|PHYSICAL","kind":"PSYCHOLOGICAL_CONCEPT|SYMPTOM_PATTERN|CLINICAL_CONDITION|RISK_SIGNAL","name":"明确的问题名称","namedPossibilities":[{"name":"明确心理概念或医学方向","role":"PRIMARY_DIRECTION|ALTERNATIVE|RULE_OUT","why":"为什么列入；若待排除要说明证据不足"}],"possibilityStatement":"为什么它可能相关且为什么尚不能确定","whyPossible":"综合哪些时间模式、症状组合或功能影响后值得留意","evidenceStrength":"LIMITED|MODERATE|STRONG","thresholdChecks":{"repeatedOrPersistent":true,"functionalImpact":false,"objectiveFinding":false,"differentialConsidered":true,"grounded":true},"supportingEvidence":[{"recordId":"真实记录ID","reason":"这条记录支持什么"}],"challengingEvidence":[{"recordId":"真实记录ID","reason":"这条记录为何不一致或构成反例"}],"alternatives":["其他合理解释"],"missingInformation":["还缺什么"],"nextObservations":["下一步最值得记录什么"],"careGuidance":"何时值得寻求哪类专业评估；没有必要可为空","redFlags":[{"recordId":"真实记录ID","signal":"原记录已有的风险信号","action":"建议采取的就医行动"}]}]}`;

function bounded(value, limit = 1000) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, limit);
}

function stringList(value, maxItems = 8, maxLength = 300) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(item => bounded(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function unsafeDiagnosticWording(value) {
  const source = String(value || '');
  return /(?:你|用户)(?:已经|就是|确定|肯定)?(?:患有|得了|确诊为)|(?:已经|可以|能够)确诊|一定是/u.test(source);
}

function stableHypothesisKey(item, domain, name) {
  const supplied = String(item.stableKey || item.stable_key || '').trim().toLowerCase();
  const safe = supplied.replace(/[^a-z0-9:_-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 96);
  if (safe.length >= 3) return `${domain.toLowerCase()}:${safe}`;
  const canonical = name.normalize('NFKC').toLowerCase().replace(/[（(][^）)]*[）)]/gu, '').replace(/\s+/gu, '');
  return `${domain.toLowerCase()}:${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24)}`;
}

function normalizeEvidence(value, recordMap, maxItems = 10) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(value) ? value : []) {
    const recordId = String(item?.recordId || item?.record_id || '');
    if (!recordMap.has(recordId) || seen.has(recordId)) continue;
    const reason = bounded(item?.reason, 500);
    if (!reason) continue;
    result.push({ recordId, reason });
    seen.add(recordId);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeRedFlags(value, recordMap) {
  return (Array.isArray(value) ? value : []).slice(0, 5).map(item => {
    const recordId = String(item?.recordId || item?.record_id || '');
    if (!recordMap.has(recordId)) return null;
    const signal = bounded(item?.signal, 500);
    const action = bounded(item?.action, 500);
    return signal && action ? { recordId, signal, action } : null;
  }).filter(Boolean);
}

function normalizeNamedPossibilities(value) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(value) ? value : []) {
    const name = bounded(item?.name, 100);
    const role = ['PRIMARY_DIRECTION', 'ALTERNATIVE', 'RULE_OUT'].includes(item?.role)
      ? item.role : null;
    const why = bounded(item?.why, 500);
    const key = name.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
    if (!name || !role || !why || seen.has(key) || unsafeDiagnosticWording(`${name} ${why}`)) continue;
    result.push({ name, role, why });
    seen.add(key);
    if (result.length >= 5) break;
  }
  return result;
}

function normalizeWellbeingHypotheses(value, records = []) {
  const recordMap = new Map(records.map(record => [String(record.id), record]));
  const hypotheses = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  for (const raw of hypotheses.slice(0, 12)) {
    const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const domain = WELLBEING_HYPOTHESIS_DOMAINS.includes(item.domain) ? item.domain : null;
    const kind = WELLBEING_HYPOTHESIS_KINDS.includes(item.kind) ? item.kind : null;
    const name = bounded(item.name, 100);
    const possibilityStatement = bounded(item.possibilityStatement || item.possibility_statement, 1000);
    const whyPossible = bounded(item.whyPossible || item.why_possible, 1200);
    const evidenceStrength = WELLBEING_HYPOTHESIS_STRENGTHS.includes(item.evidenceStrength || item.evidence_strength)
      ? (item.evidenceStrength || item.evidence_strength) : 'LIMITED';
    const supportingEvidence = normalizeEvidence(item.supportingEvidence || item.supporting_evidence, recordMap);
    const namedPossibilities = normalizeNamedPossibilities(item.namedPossibilities || item.named_possibilities);
    if (!domain || !kind || !name || !possibilityStatement || !whyPossible || !supportingEvidence.length || !namedPossibilities.length) continue;
    if (unsafeDiagnosticWording(`${name} ${possibilityStatement} ${whyPossible}`)) continue;
    if (!/(?:可能|相关|倾向|风险|待评估|需评估|需要评估|待排查|需排查|需要排查|方向|症状|模式)/u.test(`${name}${possibilityStatement}`)) continue;
    const checks = item.thresholdChecks || item.threshold_checks || {};
    const thresholdChecks = {
      repeatedOrPersistent: checks.repeatedOrPersistent === true || checks.repeated_or_persistent === true,
      functionalImpact: checks.functionalImpact === true || checks.functional_impact === true,
      objectiveFinding: checks.objectiveFinding === true || checks.objective_finding === true,
      differentialConsidered: checks.differentialConsidered === true || checks.differential_considered === true,
      grounded: checks.grounded === true
    };
    if (!thresholdChecks.grounded || !thresholdChecks.differentialConsidered) continue;
    if (kind === 'CLINICAL_CONDITION' && domain === 'PSYCHOLOGICAL'
      && !(thresholdChecks.repeatedOrPersistent && thresholdChecks.functionalImpact)) continue;
    if (kind === 'CLINICAL_CONDITION' && domain === 'PHYSICAL'
      && !(thresholdChecks.repeatedOrPersistent || thresholdChecks.objectiveFinding)) continue;
    if (kind === 'PSYCHOLOGICAL_CONCEPT' && domain !== 'PSYCHOLOGICAL') continue;
    const hypothesisKey = stableHypothesisKey(item, domain, name);
    if (seen.has(hypothesisKey)) continue;
    result.push({
      hypothesisKey,
      domain,
      kind,
      name,
      namedPossibilities,
      possibilityStatement,
      whyPossible,
      evidenceStrength,
      thresholdChecks,
      supportingEvidence,
      challengingEvidence: normalizeEvidence(item.challengingEvidence || item.challenging_evidence, recordMap, 6),
      alternatives: stringList(item.alternatives, 5, 300),
      missingInformation: stringList(item.missingInformation || item.missing_information, 8, 400),
      nextObservations: stringList(item.nextObservations || item.next_observations, 6, 400),
      careGuidance: bounded(item.careGuidance || item.care_guidance, 800),
      redFlags: normalizeRedFlags(item.redFlags || item.red_flags, recordMap),
      reviewVersion: WELLBEING_HYPOTHESIS_REVIEW_VERSION
    });
    seen.add(hypothesisKey);
    if (result.length >= 8) break;
  }
  return result;
}

function recordForModel(row) {
  const mapped = mapWellbeingRecord(row);
  return {
    id: mapped.id,
    date: mapped.recordedOn,
    confirmationStatus: mapped.status,
    categories: mapped.categories,
    observation: mapped.observation,
    whyUseful: mapped.whyUseful,
    sourceExcerpt: bounded(mapped.sourceExcerpt, 900)
  };
}

function mapHypothesis(row, recordMap = new Map()) {
  const evidence = value => (Array.isArray(value) ? value : []).map(item => {
    const record = recordMap.get(String(item.recordId || item.record_id || ''));
    return {
      recordId: item.recordId || item.record_id,
      reason: item.reason || '',
      ...(record ? {
        recordedOn: record.recordedOn,
        sourceExcerpt: record.sourceExcerpt,
        observation: record.observation,
        confirmationStatus: record.status
      } : {})
    };
  });
  return {
    id: row.id,
    domain: row.domain,
    kind: row.kind,
    name: row.name,
    namedPossibilities: Array.isArray(row.named_possibilities) ? row.named_possibilities : [],
    possibilityStatement: row.possibility_statement,
    whyPossible: row.why_possible,
    evidenceStrength: row.evidence_strength,
    thresholdChecks: row.threshold_checks || {},
    supportingEvidence: evidence(row.supporting_evidence),
    challengingEvidence: evidence(row.challenging_evidence),
    alternatives: Array.isArray(row.alternatives) ? row.alternatives : [],
    missingInformation: Array.isArray(row.missing_information) ? row.missing_information : [],
    nextObservations: Array.isArray(row.next_observations) ? row.next_observations : [],
    careGuidance: row.care_guidance || '',
    redFlags: Array.isArray(row.red_flags) ? row.red_flags : [],
    status: WELLBEING_HYPOTHESIS_STATUSES.includes(row.status) ? row.status : 'PENDING',
    reviewVersion: row.review_version || '',
    modelVersion: row.model_version || '',
    sourceUpdatedAt: row.source_updated_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function sourceRecords(userId) {
  const db = require('./db');
  const result = await db.query(
    `SELECT * FROM wellbeing_records
      WHERE user_id = $1 AND status IN ('PENDING', 'CONFIRMED')
      ORDER BY recorded_on DESC, updated_at DESC LIMIT 160`,
    [userId]
  );
  return result.rows.reverse();
}

async function storeHypotheses(userId, hypotheses, sourceUpdatedAt, modelVersion = '') {
  const db = require('./db');
  return db.transaction(async client => {
    const dismissed = await client.query(
      `SELECT hypothesis_key FROM wellbeing_hypotheses
        WHERE user_id = $1 AND status = 'DISMISSED'`,
      [userId]
    );
    const dismissedKeys = new Set(dismissed.rows.map(row => row.hypothesis_key));
    await client.query(
      `UPDATE wellbeing_hypotheses SET status = 'ARCHIVED', updated_at = now()
        WHERE user_id = $1 AND status = 'PENDING'`,
      [userId]
    );
    let stored = 0;
    for (const item of hypotheses) {
      if (dismissedKeys.has(item.hypothesisKey)) continue;
      const result = await client.query(
        `INSERT INTO wellbeing_hypotheses
          (id, user_id, hypothesis_key, domain, kind, name, named_possibilities, possibility_statement, why_possible,
           evidence_strength, threshold_checks, supporting_evidence, challenging_evidence,
           alternatives, missing_information, next_observations, care_guidance, red_flags,
           status, review_version, model_version, source_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb,
           $14::jsonb, $15::jsonb, $16::jsonb, $17, $18::jsonb, 'PENDING', $19, $20, $21)
         ON CONFLICT (user_id, hypothesis_key) DO UPDATE SET
           domain = EXCLUDED.domain, kind = EXCLUDED.kind, name = EXCLUDED.name,
           named_possibilities = EXCLUDED.named_possibilities,
           possibility_statement = EXCLUDED.possibility_statement, why_possible = EXCLUDED.why_possible,
           evidence_strength = EXCLUDED.evidence_strength, threshold_checks = EXCLUDED.threshold_checks,
           supporting_evidence = EXCLUDED.supporting_evidence, challenging_evidence = EXCLUDED.challenging_evidence,
           alternatives = EXCLUDED.alternatives, missing_information = EXCLUDED.missing_information,
           next_observations = EXCLUDED.next_observations, care_guidance = EXCLUDED.care_guidance,
           red_flags = EXCLUDED.red_flags,
           status = CASE WHEN wellbeing_hypotheses.status = 'OBSERVING' THEN 'OBSERVING' ELSE 'PENDING' END,
           review_version = EXCLUDED.review_version, model_version = EXCLUDED.model_version,
           source_updated_at = EXCLUDED.source_updated_at, updated_at = now()
         WHERE wellbeing_hypotheses.status <> 'DISMISSED'
         RETURNING id`,
        [crypto.randomUUID(), userId, item.hypothesisKey, item.domain, item.kind, item.name,
          JSON.stringify(item.namedPossibilities), item.possibilityStatement, item.whyPossible, item.evidenceStrength,
          JSON.stringify(item.thresholdChecks), JSON.stringify(item.supportingEvidence),
          JSON.stringify(item.challengingEvidence), JSON.stringify(item.alternatives),
          JSON.stringify(item.missingInformation), JSON.stringify(item.nextObservations),
          item.careGuidance, JSON.stringify(item.redFlags), item.reviewVersion,
          bounded(modelVersion, 120), sourceUpdatedAt]
      );
      if (result.rowCount) stored += 1;
    }
    return stored;
  });
}

async function refreshWellbeingHypotheses(userId, modelVersion = '') {
  const db = require('./db');
  const { callJson, isAiConfigured } = require('./ai-engine');
  if (!isAiConfigured()) throw Object.assign(new Error('身心问题识别 AI 尚未配置'), { code: 'SHROOM_AI_UNAVAILABLE' });
  const rows = await sourceRecords(userId);
  if (!rows.length) return { hypotheses: [], stored: 0, sourceCount: 0 };
  const feedbackResult = await db.query(
    `SELECT name, feedback_reason AS reason FROM wellbeing_hypotheses
      WHERE user_id = $1 AND status = 'DISMISSED' ORDER BY updated_at DESC LIMIT 12`,
    [userId]
  );
  const records = rows.map(recordForModel);
  const raw = await callJson(
    WELLBEING_HYPOTHESIS_PROMPT,
    { records, dismissedFeedback: feedbackResult.rows },
    '身心问题可能性识别',
    { maxTokens: 6500, temperature: 0.1, usageContext: { userId, feature: 'wellbeing_hypothesis_review' } }
  );
  const hypotheses = normalizeWellbeingHypotheses(raw.hypotheses, records);
  const sourceUpdatedAt = rows.reduce((latest, row) => {
    const value = new Date(row.updated_at || 0);
    return value > latest ? value : latest;
  }, new Date(0));
  const stored = await storeHypotheses(userId, hypotheses, sourceUpdatedAt, modelVersion);
  return { hypotheses, stored, sourceCount: records.length };
}

module.exports = {
  WELLBEING_HYPOTHESIS_DOMAINS,
  WELLBEING_HYPOTHESIS_KINDS,
  WELLBEING_HYPOTHESIS_PROMPT,
  WELLBEING_HYPOTHESIS_REVIEW_VERSION,
  WELLBEING_HYPOTHESIS_STATUSES,
  WELLBEING_HYPOTHESIS_STRENGTHS,
  mapHypothesis,
  normalizeWellbeingHypotheses,
  refreshWellbeingHypotheses,
  stableHypothesisKey,
  storeHypotheses,
  unsafeDiagnosticWording
};
