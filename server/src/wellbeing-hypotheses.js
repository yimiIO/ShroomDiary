'use strict';

const crypto = require('node:crypto');
const { mapWellbeingRecord } = require('./wellbeing-records');
const {
  WELLBEING_CONCEPT_CATALOG_VERSION,
  conceptCatalogForModel,
  findLegacyWellbeingConcept,
  findWellbeingConcept,
  publicConcept
} = require('./wellbeing-concepts');

const WELLBEING_HYPOTHESIS_REVIEW_VERSION = 'wellbeing-hypothesis-2026-09-14-v8';
const WELLBEING_HYPOTHESIS_DOMAINS = ['PSYCHOLOGICAL', 'PHYSICAL'];
const WELLBEING_HYPOTHESIS_KINDS = [
  'PSYCHOLOGICAL_CONCEPT',
  'SYMPTOM_PATTERN',
  'CLINICAL_CONDITION',
  'RISK_SIGNAL'
];
const WELLBEING_HYPOTHESIS_STRENGTHS = ['LIMITED', 'MODERATE', 'STRONG'];
const WELLBEING_HYPOTHESIS_STATUSES = ['PENDING', 'OBSERVING', 'DISMISSED', 'ARCHIVED'];

const WELLBEING_HYPOTHESIS_PROMPT = `你是 Shroom 的“身心问题可能性整理器”。你读取的是用户多次日记中已经抽出的观察，不是完整病历。你的价值是把零散事实与输入的 professionalConcepts 受控专业概念库进行匹配；你不能发明、拼接或改写专业概念名称。

这不是诊断。你必须遵守：
1. 只使用 records 中用户本人的观察。先做“主体归属”检查：出现姓名、他/她、亲友、案件当事人或其他人称时，不得把对方的症状当成用户症状；归属不能确定就不使用。用户曾确认整条记录，也不等于其中每个症状都属于用户。
2. 每个 supportingEvidence 和 challengingEvidence 必须输出 recordId 以及该记录 evidenceItems 中的 evidenceId；证据原文由服务器按编号回填，你不要复述或改写 excerpt。说明它为何支持或不支持。不能补造病史、持续时间、症状、检查或因果。
3. name 只描述“日记里反复出现的事实模式”，使用普通用户语言，不能把它包装成疾病或学术名称。专业名称只能来自 professionalConcepts，并在 namedPossibilities 中仅输出 conceptId、role 和 why。conceptId 必须逐字等于库中的 ID；没有合适 ID 就不要生成该候选，绝不创造听起来专业的新词。
4. 严格区分概念类型。RESEARCH_CONSTRUCT 是研究构念，不是疾病；CLINICAL_SCREENING_DIRECTION 是筛查方向，不是诊断；CLINICAL_CONDITION/MEDICAL_CONDITION 只是值得专业评估或排查的方向。心理临床方向门槛较高：必须同时看到重复或持续、明显痛苦或功能影响，并考虑身体状况、物质/药物、生活事件等替代解释。证据未达到门槛时，kind 只能是 PSYCHOLOGICAL_CONCEPT 或 SYMPTOM_PATTERN。
5. 身体疾病方向需要具体症状、测量或检查依据，并有持续/反复或客观异常。优先列常见且可核对的鉴别方向；非特异症状不能直接指向罕见重病。一个症状可以有多个 namedPossibilities，不能假装只有一个答案。证据能直接支持的设为 PRIMARY_DIRECTION；仅值得排除但当前证据不足的设为 RULE_OUT，并明确缺少什么。
6. evidenceStrength 只是“现有日记证据的一致程度”，不是患病概率。LIMITED 也可以保留，只要它能告诉用户下一步记录或就医时该核对什么。
7. whyPossible 必须解释“哪些模式让这个方向值得留意”；possibilityStatement 必须使用“可能、相关、需要评估/排查”等不确定措辞。禁止“你患有、已经确诊、就是、一定是”等确定诊断。
8. missingInformation 写清楚距离判断还缺什么；nextObservations 只建议记录最有区分度的信息。不得给药名、剂量或治疗处方。
9. redFlags 只能来自原记录中已经出现的紧急信号。careGuidance 可以建议何时联系医生/心理专业人员；不得保证“无需就医”或“可以放心”。
10. 不按数量凑结果，也不为了控制比例删掉真实且有用的方向。没有达到 professionalConcepts 中某项 matchGuidance 的关键条件就返回空数组。每项必须至少有一个 PRIMARY_DIRECTION；不能只列 RULE_OUT 来满足结构。每个 domainScope 最多 8 项，重复问题合并。不能把“体重增加与活动下降”“冲突回避与告别困难”“情绪状态依赖的判断波动”等事实描述冒充专业概念；它们只能出现在 name 或证据解释中。
11. 在 FINAL/SYNTHESIS 阶段先做覆盖和优先级检查：优先保留紧急风险、跨时间重复/持续、功能影响、客观异常和能改变下一步观察或专业评估的方向。一次性、影响较小的反应不能因为“更容易命名”而挤掉长期重要模式。同一个核心问题的不同表现合并为一项。
12. 心理领域在不输出中间思考的前提下，完整核对情绪/兴趣/精力与功能、焦虑与回避、重大生活事件与应激、睡眠、物质/药物、情绪调节及社交模式；身体领域核对症状部位与时程、客观测量/检查、生活与环境因素以及常见鉴别方向。这是防漏检清单，不是输出清单；没有证据的方向不得输出。
13. dismissedFeedback 是用户以前认为不符合自己的候选，仅用于避免重复误判。
14. 输入的 domainScope 是本次唯一要处理的领域；PSYCHOLOGICAL 只输出心理候选，PHYSICAL 只输出身体候选。
15. 输出要短而具体：每项最多 4 条支持证据、3 个具名方向、4 个缺失信息和 3 个下一步观察；每段解释不超过 160 个汉字。
16. analysisStage 为 CANDIDATE 时只找当前批次的真实模式；为 SYNTHESIS 时需要合并 candidateHypotheses 中重复或互补的方向，并只引用 records 证据索引中存在的 recordId；为 FINAL 时直接给最终结果。

只返回 JSON，不要 Markdown：
{"hypotheses":[{"stableKey":"简短稳定英文key","domain":"PSYCHOLOGICAL|PHYSICAL","kind":"PSYCHOLOGICAL_CONCEPT|SYMPTOM_PATTERN|CLINICAL_CONDITION|RISK_SIGNAL","name":"日记中反复出现的事实模式，不是专业名称","namedPossibilities":[{"conceptId":"必须来自professionalConcepts的精确ID","role":"PRIMARY_DIRECTION|ALTERNATIVE|RULE_OUT","why":"为什么本人的记录与此概念匹配；若待排除要说明证据不足"}],"possibilityStatement":"为什么它可能相关且为什么尚不能确定","whyPossible":"综合哪些时间模式、症状组合或功能影响后值得留意","evidenceStrength":"LIMITED|MODERATE|STRONG","thresholdChecks":{"repeatedOrPersistent":true,"functionalImpact":false,"objectiveFinding":false,"differentialConsidered":true,"grounded":true},"supportingEvidence":[{"recordId":"真实记录ID","evidenceId":"该记录中的真实evidenceId","reason":"这条记录支持什么"}],"challengingEvidence":[{"recordId":"真实记录ID","evidenceId":"该记录中的真实evidenceId","reason":"这条记录为何不一致或构成反例"}],"alternatives":["其他合理解释"],"missingInformation":["还缺什么"],"nextObservations":["下一步最值得记录什么"],"careGuidance":"何时值得寻求哪类专业评估；没有必要可为空","redFlags":[{"recordId":"真实记录ID","signal":"原记录已有的风险信号","action":"建议采取的就医行动"}]}]}`;

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

function stableHypothesisKey(item, domain, name, namedPossibilities = []) {
  const primaryConcept = namedPossibilities.find(possibility => possibility.role === 'PRIMARY_DIRECTION');
  if (primaryConcept?.conceptId) return `${domain.toLowerCase()}:concept:${primaryConcept.conceptId}`;
  const supplied = String(item.stableKey || item.stable_key || '').trim().toLowerCase();
  const safe = supplied.replace(/[^a-z0-9:_-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 96);
  if (safe.length >= 3) return `${domain.toLowerCase()}:${safe}`;
  const canonical = name.normalize('NFKC').toLowerCase().replace(/[（(][^）)]*[）)]/gu, '').replace(/\s+/gu, '');
  return `${domain.toLowerCase()}:${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24)}`;
}

function recordEvidenceItems(record) {
  const items = (Array.isArray(record?.evidenceItems) ? record.evidenceItems : [])
    .map(item => ({ evidenceId: bounded(item?.evidenceId, 80), excerpt: bounded(item?.excerpt, 600) }))
    .filter(item => item.evidenceId && item.excerpt);
  if (items.length) return items;
  const excerpt = bounded(record?.sourceExcerpt, 600);
  return excerpt ? [{ evidenceId: 'source:0', excerpt }] : [];
}

function normalizeEvidence(value, recordMap, maxItems = 10) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(value) ? value : []) {
    const recordId = String(item?.recordId || item?.record_id || '');
    if (!recordMap.has(recordId) || seen.has(recordId)) continue;
    const reason = bounded(item?.reason, 500);
    const evidenceItems = recordEvidenceItems(recordMap.get(recordId));
    const proposedEvidenceId = bounded(item?.evidenceId || item?.evidence_id, 80);
    let selected = evidenceItems.find(evidence => evidence.evidenceId === proposedEvidenceId);
    if (!selected) {
      const proposedExcerpt = bounded(item?.excerpt || item?.evidenceExcerpt || item?.evidence_excerpt, 600);
      selected = proposedExcerpt
        ? evidenceItems.find(evidence => evidence.excerpt.includes(proposedExcerpt)) : null;
    }
    if (!reason || !selected) continue;
    result.push({ recordId, evidenceId: selected.evidenceId, excerpt: selected.excerpt, reason });
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

function normalizeNamedPossibilities(value, domain) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(value) ? value : []) {
    const concept = findWellbeingConcept(item?.conceptId || item?.concept_id);
    const role = ['PRIMARY_DIRECTION', 'ALTERNATIVE', 'RULE_OUT'].includes(item?.role)
      ? item.role : null;
    const why = bounded(item?.why, 500);
    if (!concept || concept.domain !== domain || !role || !why || seen.has(concept.id)
      || unsafeDiagnosticWording(`${concept.name} ${why}`)) continue;
    result.push({ conceptId: concept.id, role, why });
    seen.add(concept.id);
    if (result.length >= 5) break;
  }
  return result;
}

function hydrateNamedPossibilities(value, domain) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(value) ? value : []) {
    const concept = findWellbeingConcept(item?.conceptId || item?.concept_id)
      || findLegacyWellbeingConcept(item?.name);
    const role = ['PRIMARY_DIRECTION', 'ALTERNATIVE', 'RULE_OUT'].includes(item?.role)
      ? item.role : null;
    const why = bounded(item?.why, 500);
    if (!concept || concept.domain !== domain || !role || !why || seen.has(concept.id)) continue;
    result.push({ conceptId: concept.id, name: concept.name, role, why, concept: publicConcept(concept) });
    seen.add(concept.id);
    if (result.length >= 5) break;
  }
  return result;
}

function preservesObservingStatus(item, observingPrimaryConceptIds = new Set()) {
  return (Array.isArray(item?.namedPossibilities) ? item.namedPossibilities : [])
    .some(possibility => possibility?.role !== 'RULE_OUT'
      && observingPrimaryConceptIds.has(possibility?.conceptId));
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
    const namedPossibilities = normalizeNamedPossibilities(item.namedPossibilities || item.named_possibilities, domain);
    if (!domain || !kind || !name || !possibilityStatement || !whyPossible || !supportingEvidence.length || !namedPossibilities.length) continue;
    if (!namedPossibilities.some(possibility => possibility.role === 'PRIMARY_DIRECTION')) continue;
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
    const hypothesisKey = stableHypothesisKey(item, domain, name, namedPossibilities);
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
    if (result.length >= 16) break;
  }
  return result;
}

function extractionEvidenceItems(extraction) {
  const result = [];
  const add = (type, items, field) => {
    for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
      const statement = bounded(item?.[field], 300);
      const excerpt = bounded(item?.evidenceExcerpt, 600);
      if (!statement || !excerpt) continue;
      result.push({
        type,
        evidenceId: `${type.toLowerCase()}:${index}`,
        statement,
        excerpt,
        certainty: item.certainty || '',
        ...(type === 'PHYSICAL' ? {
          bodyAreas: item.bodyAreas || [], duration: bounded(item.duration, 120),
          observedAt: bounded(item.observedAt, 120), severity: item.severity,
          measurements: item.measurements || [], testResults: item.testResults || []
        } : {})
      });
    }
  };
  add('PSYCHOLOGICAL', extraction?.psychologicalObservations, 'observation');
  add('PHYSICAL', extraction?.physicalObservations, 'symptom');
  add('LIFESTYLE', extraction?.lifestyleFactors, 'factor');
  add('ENVIRONMENT', extraction?.environmentFactors, 'observation');
  add('RISK', extraction?.redFlags, 'signal');
  return result.slice(0, 12);
}

function recordForModel(row) {
  const mapped = mapWellbeingRecord(row);
  const observation = Object.fromEntries(Object.entries(mapped.observation || {}).filter(([, value]) => {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.values(value).some(item => item !== null && item !== '' && (!Array.isArray(item) || item.length));
    return value !== null && value !== '';
  }));
  const evidenceItems = extractionEvidenceItems(mapped.extraction);
  if (!evidenceItems.length && mapped.sourceExcerpt) {
    evidenceItems.push({
      type: 'RECORD', evidenceId: 'source:0', statement: bounded(mapped.sourceExcerpt, 300),
      excerpt: bounded(mapped.sourceExcerpt, 600), certainty: ''
    });
  }
  return {
    id: mapped.id,
    date: mapped.recordedOn,
    confirmationStatus: mapped.status,
    categories: mapped.categories,
    evidenceItems,
    ...(mapped.extractionVersion ? {} : { observation }),
    whyUseful: bounded(mapped.whyUseful, 300),
  };
}

function mapHypothesis(row, recordMap = new Map()) {
  const evidence = value => (Array.isArray(value) ? value : []).map(item => {
    const record = recordMap.get(String(item.recordId || item.record_id || ''));
    return {
      recordId: item.recordId || item.record_id,
      evidenceId: item.evidenceId || item.evidence_id || '',
      reason: item.reason || '',
      ...(record ? {
        recordedOn: record.recordedOn,
        sourceExcerpt: item.excerpt || record.sourceExcerpt,
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
    namedPossibilities: hydrateNamedPossibilities(row.named_possibilities, row.domain),
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

async function storeHypotheses(userId, hypotheses, sourceUpdatedAt, modelVersion = '', reviewedDomains = WELLBEING_HYPOTHESIS_DOMAINS) {
  const db = require('./db');
  return db.transaction(async client => {
    const previous = await client.query(
      `SELECT hypothesis_key, status, domain, named_possibilities FROM wellbeing_hypotheses
        WHERE user_id = $1 AND status IN ('DISMISSED', 'OBSERVING')`,
      [userId]
    );
    const dismissedKeys = new Set(previous.rows
      .filter(row => row.status === 'DISMISSED').map(row => row.hypothesis_key));
    const observingPrimaryConceptIds = new Set(previous.rows.filter(row => row.status === 'OBSERVING')
      .flatMap(row => hydrateNamedPossibilities(row.named_possibilities, row.domain)
        .filter(item => item.role === 'PRIMARY_DIRECTION').map(item => item.conceptId)));
    await client.query(
      `UPDATE wellbeing_hypotheses SET status = 'ARCHIVED', updated_at = now()
        WHERE user_id = $1 AND status IN ('PENDING', 'OBSERVING') AND domain = ANY($2::text[])`,
      [userId, reviewedDomains]
    );
    let stored = 0;
    for (const item of hypotheses) {
      if (dismissedKeys.has(item.hypothesisKey)) continue;
      const status = preservesObservingStatus(item, observingPrimaryConceptIds) ? 'OBSERVING' : 'PENDING';
      const result = await client.query(
        `INSERT INTO wellbeing_hypotheses
          (id, user_id, hypothesis_key, domain, kind, name, named_possibilities, possibility_statement, why_possible,
           evidence_strength, threshold_checks, supporting_evidence, challenging_evidence,
           alternatives, missing_information, next_observations, care_guidance, red_flags,
           status, review_version, model_version, source_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb,
           $14::jsonb, $15::jsonb, $16::jsonb, $17, $18::jsonb, $19, $20, $21, $22)
         ON CONFLICT (user_id, hypothesis_key) DO UPDATE SET
           domain = EXCLUDED.domain, kind = EXCLUDED.kind, name = EXCLUDED.name,
           named_possibilities = EXCLUDED.named_possibilities,
           possibility_statement = EXCLUDED.possibility_statement, why_possible = EXCLUDED.why_possible,
           evidence_strength = EXCLUDED.evidence_strength, threshold_checks = EXCLUDED.threshold_checks,
           supporting_evidence = EXCLUDED.supporting_evidence, challenging_evidence = EXCLUDED.challenging_evidence,
           alternatives = EXCLUDED.alternatives, missing_information = EXCLUDED.missing_information,
           next_observations = EXCLUDED.next_observations, care_guidance = EXCLUDED.care_guidance,
           red_flags = EXCLUDED.red_flags,
           status = EXCLUDED.status,
           review_version = EXCLUDED.review_version, model_version = EXCLUDED.model_version,
           source_updated_at = EXCLUDED.source_updated_at, updated_at = now()
         WHERE wellbeing_hypotheses.status <> 'DISMISSED'
         RETURNING id`,
        [crypto.randomUUID(), userId, item.hypothesisKey, item.domain, item.kind, item.name,
          JSON.stringify(item.namedPossibilities), item.possibilityStatement, item.whyPossible, item.evidenceStrength,
          JSON.stringify(item.thresholdChecks), JSON.stringify(item.supportingEvidence),
          JSON.stringify(item.challengingEvidence), JSON.stringify(item.alternatives),
          JSON.stringify(item.missingInformation), JSON.stringify(item.nextObservations),
          item.careGuidance, JSON.stringify(item.redFlags), status, item.reviewVersion,
          bounded(modelVersion, 120), sourceUpdatedAt]
      );
      if (result.rowCount) stored += 1;
    }
    return stored;
  });
}

function compactHypothesisDraft(item) {
  const evidenceRefs = value => (Array.isArray(value) ? value : []).map(evidence => ({
    recordId: evidence?.recordId || evidence?.record_id,
    evidenceId: evidence?.evidenceId || evidence?.evidence_id
  })).filter(evidence => evidence.recordId && evidence.evidenceId).slice(0, 5);
  return {
    stableKey: bounded(item?.stableKey || item?.stable_key, 96),
    domain: item?.domain,
    kind: item?.kind,
    name: bounded(item?.name, 100),
    namedPossibilities: (Array.isArray(item?.namedPossibilities) ? item.namedPossibilities : []).slice(0, 3),
    possibilityStatement: bounded(item?.possibilityStatement, 350),
    whyPossible: bounded(item?.whyPossible, 350),
    evidenceStrength: item?.evidenceStrength,
    thresholdChecks: item?.thresholdChecks,
    supportingEvidence: evidenceRefs(item?.supportingEvidence),
    challengingEvidence: evidenceRefs(item?.challengingEvidence),
    alternatives: stringList(item?.alternatives, 3, 180),
    missingInformation: stringList(item?.missingInformation, 4, 180),
    nextObservations: stringList(item?.nextObservations, 3, 180),
    careGuidance: bounded(item?.careGuidance, 300)
  };
}

async function reviewDomainScope(callJson, scope, userId, dismissedFeedback, aiOptions = {}) {
  const professionalConcepts = conceptCatalogForModel(scope.domain);
  const featurePrefix = bounded(aiOptions.usageFeaturePrefix || 'wellbeing_hypothesis', 40);
  const request = (input, label, maxTokens) => callJson(
    WELLBEING_HYPOTHESIS_PROMPT,
    input,
    label,
    {
      maxTokens,
      temperature: 0.1,
      model: aiOptions.model,
      usageContext: { userId, feature: `${featurePrefix}_${scope.domain.toLowerCase()}` }
    }
  );
  if (scope.records.length <= 14) {
    return request(
      { analysisStage: 'FINAL', domainScope: scope.domain, professionalConcepts, records: scope.records, dismissedFeedback },
      scope.domain === 'PSYCHOLOGICAL' ? '心理问题可能性识别' : '身体问题可能性识别',
      4200
    );
  }
  const batches = [];
  for (let index = 0; index < scope.records.length; index += 12) batches.push(scope.records.slice(index, index + 12));
  const batchResults = await Promise.allSettled(batches.map((records, index) => request(
    { analysisStage: 'CANDIDATE', domainScope: scope.domain, professionalConcepts, records, dismissedFeedback },
    `${scope.domain === 'PSYCHOLOGICAL' ? '心理' : '身体'}问题候选 ${index + 1}/${batches.length}`,
    3200
  )));
  const drafts = batchResults.flatMap(result => result.status === 'fulfilled' && Array.isArray(result.value.hypotheses)
    ? result.value.hypotheses : []);
  if (!drafts.length) throw Object.assign(new Error('分段识别没有形成可靠候选'), { code: 'SHROOM_AI_FAILED' });
  const referencedIds = new Set(drafts.flatMap(item => [
    ...(Array.isArray(item?.supportingEvidence) ? item.supportingEvidence : []),
    ...(Array.isArray(item?.challengingEvidence) ? item.challengingEvidence : [])
  ]).map(item => String(item?.recordId || item?.record_id || '')).filter(Boolean));
  const evidenceIndex = scope.records.filter(record => referencedIds.has(String(record.id))).map(record => ({
    id: record.id,
    date: record.date,
    categories: record.categories,
    evidenceItems: record.evidenceItems
  }));
  try {
    return await request({
      analysisStage: 'SYNTHESIS',
      domainScope: scope.domain,
      professionalConcepts,
      candidateHypotheses: drafts.map(compactHypothesisDraft),
      records: evidenceIndex,
      dismissedFeedback
    }, `${scope.domain === 'PSYCHOLOGICAL' ? '心理' : '身体'}问题全局合并`, 6500);
  } catch (error) {
    return { hypotheses: drafts };
  }
}

async function refreshWellbeingHypotheses(userId, modelVersion = '', options = {}) {
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
  const scopes = [
    {
      domain: 'PSYCHOLOGICAL',
      records: records.filter(record => record.categories.some(category => ['PSYCHOLOGICAL', 'SLEEP'].includes(category)))
    },
    {
      domain: 'PHYSICAL',
      records: records.filter(record => record.categories.some(category => ['PHYSICAL', 'SLEEP', 'MEASUREMENT', 'TEST_RESULT'].includes(category)))
    }
  ].filter(scope => scope.records.length);
  const settled = await Promise.allSettled(scopes.map(scope => reviewDomainScope(
    callJson, scope, userId, feedbackResult.rows, options.aiOptions
  )));
  const reviewedDomains = [];
  const rawHypotheses = [];
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    reviewedDomains.push(scopes[index].domain);
    rawHypotheses.push(...(Array.isArray(result.value.hypotheses) ? result.value.hypotheses : []));
  });
  if (!reviewedDomains.length) {
    throw Object.assign(new Error('身心问题可能性识别暂时没有完成，请稍后重试'), { code: 'SHROOM_AI_FAILED' });
  }
  const normalizedHypotheses = normalizeWellbeingHypotheses(rawHypotheses, records);
  const strengthRank = { STRONG: 3, MODERATE: 2, LIMITED: 1 };
  const hypotheses = reviewedDomains.flatMap(domain => normalizedHypotheses
    .filter(item => item.domain === domain)
    .sort((left, right) => (strengthRank[right.evidenceStrength] - strengthRank[left.evidenceStrength])
      || (right.supportingEvidence.length - left.supportingEvidence.length))
    .slice(0, 8));
  const sourceUpdatedAt = rows.reduce((latest, row) => {
    const value = new Date(row.updated_at || 0);
    return value > latest ? value : latest;
  }, new Date(0));
  const stored = options.persist === false
    ? 0
    : await storeHypotheses(userId, hypotheses, sourceUpdatedAt, modelVersion, reviewedDomains);
  return { hypotheses, stored, sourceCount: records.length, reviewedDomains };
}

module.exports = {
  WELLBEING_CONCEPT_CATALOG_VERSION,
  WELLBEING_HYPOTHESIS_DOMAINS,
  WELLBEING_HYPOTHESIS_KINDS,
  WELLBEING_HYPOTHESIS_PROMPT,
  WELLBEING_HYPOTHESIS_REVIEW_VERSION,
  WELLBEING_HYPOTHESIS_STATUSES,
  WELLBEING_HYPOTHESIS_STRENGTHS,
  mapHypothesis,
  hydrateNamedPossibilities,
  normalizeWellbeingHypotheses,
  preservesObservingStatus,
  recordForModel,
  refreshWellbeingHypotheses,
  stableHypothesisKey,
  storeHypotheses,
  unsafeDiagnosticWording
};
