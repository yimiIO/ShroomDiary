'use strict';
/* global BigInt */

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const { callJson, isAiConfigured } = require('../ai-engine');
const { usageSummary } = require('../ai-usage');
const { decryptFinancialPayload, encryptFinancialPayload } = require('../financial-data-crypto');
const {
  RECORD_TYPES,
  calculateOverview,
  currencyCode,
  dateOnly,
  minorToMoney,
  moneyPayload,
  stableFingerprint
} = require('../financial-ledger');
const {
  FINANCIAL_COMPOUND_POLICY_VERSION,
  containsFinancialSecret,
  financialPrompt,
  redactFinancialSecrets
} = require('../financial-compound-policy');
const { asyncRoute, fail, ok, requireUser, text } = require('../http');
const { shanghaiDate } = require('../compound-system');

const router = express.Router();
router.use(requireUser);
router.use((req, res, next) => req.authKind === 'session'
  ? next()
  : fail(res, 403, '私人财务台账只允许当前登录会话访问，API Token 无权读取或修改'));

const PRIVACY_NOTICE_VERSION = '2026-09-15-v1';
const AI_PRIVACY_NOTICE_VERSION = '2026-09-15-v1';
const PROFILE_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'];
const SCOPE_TYPES = ['PARTIAL', 'ALL_LONG_TERM'];
const TRACKING_MODES = ['FROM_NOW', 'HISTORY', 'PLAN_ONLY'];
const HORIZON_STATUSES = ['TARGET_DATE', 'TARGET_YEAR', 'UNDECIDED'];
const RESERVE_STATUSES = ['RESERVED', 'PENDING', 'UNSPECIFIED'];
const CONTRIBUTION_METHODS = ['FIXED', 'SURPLUS_RATIO', 'BATCHED_LUMP_SUM', 'FLEXIBLE', 'UNSET'];
const CONTRIBUTION_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'YEARLY'];
const SOURCE_KINDS = ['MANUAL', 'IMPORT', 'DIARY', 'MIGRATION'];
const CLASSIFICATION_STATUSES = ['USER_ENTERED', 'SOURCE_VERIFIED', 'UNVERIFIED'];

const IMPORT_PROMPT = `你是 Shroom 私人财务台账的记录整理器，不是投资顾问。
只从用户已经发生的事实中生成候选记录；意向、计划、预测和建议不能成为实际资金记录。
不得推断缺失金额、日期、币种、收益、产品或交易关系。金额性质不明时使用 UNCERTAIN。
账户总额与下属产品金额可能重复，必须放入 ambiguities，不能擅自相加。
输出 JSON：
{
  "candidates": [
    {"kind":"RECORD|SNAPSHOT|HOLDING","recordType":"...","date":"YYYY-MM-DD|null","amount":"正数或空","currency":"CNY","sourceCategory":"","channelLabel":"","productName":"","directionName":"","note":"","confidence":"HIGH|MEDIUM|LOW","needsConfirmation":true}
  ],
  "ambiguities":["需要用户确认的问题"],
  "ignoredIntentions":["只表达打算、尚未发生的内容"]
}
SNAPSHOT 仅表示某日整个计划的总资产价值；HOLDING 表示一项持有明细。所有候选都必须由用户确认后才入账。`;

function uuid(value) {
  const id = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function enumValue(value, allowed, fallback = null) {
  const normalized = String(value || '').trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function boolean(value) {
  return value === true;
}

function decrypt(row) {
  return decryptFinancialPayload(row.private_payload);
}

function mapProfile(row) {
  if (!row) return null;
  return {
    status: row.status,
    scopeType: row.scope_type,
    trackingMode: row.tracking_mode,
    baseCurrency: row.base_currency,
    horizonStatus: row.horizon_status,
    expectedUseOn: dateOnly(row.expected_use_on),
    reserveStatus: row.reserve_status,
    sensitiveConsentAt: row.sensitive_consent_at,
    aiProcessingConsentAt: row.ai_processing_consent_at,
    aiProcessingConsentVersion: row.ai_processing_consent_version || null,
    privacyNoticeVersion: row.privacy_notice_version,
    ...decrypt(row),
    updatedAt: row.updated_at
  };
}

function mapRecord(row) {
  const payload = decrypt(row);
  return {
    id: row.id,
    recordType: row.record_type,
    occurredOn: dateOnly(row.occurred_on),
    currency: row.currency,
    status: row.status,
    sourceKind: row.source_kind,
    sourceDiaryId: row.source_diary_id,
    sourceRef: row.source_ref || '',
    transferGroupId: row.transfer_group_id,
    revisionOf: row.revision_of,
    revisionReason: row.revision_reason || '',
    amount: minorToMoney(payload.amountMinor),
    payload,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSnapshot(row) {
  const payload = decrypt(row);
  return {
    id: row.id,
    snapshotKind: row.snapshot_kind,
    valuedOn: dateOnly(row.valued_on),
    currency: row.currency,
    status: row.status,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref || '',
    revisionOf: row.revision_of,
    revisionReason: row.revision_reason || '',
    amount: minorToMoney(payload.amountMinor),
    payload,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapHolding(row) {
  const payload = decrypt(row);
  return {
    id: row.id,
    valuedOn: dateOnly(row.valued_on),
    currency: row.currency,
    status: row.status,
    classificationStatus: row.classification_status,
    sourceKind: row.source_kind || 'MANUAL',
    sourceRef: row.source_ref || '',
    holdingKey: row.holding_key,
    revisionOf: row.revision_of,
    revisionReason: row.revision_reason || '',
    amount: minorToMoney(payload.amountMinor),
    payload,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPrivateRow(row) {
  return { id: row.id, ...decrypt(row), createdAt: row.created_at, updatedAt: row.updated_at };
}

async function ownedFinancialThread(userId, threadId, options = {}) {
  const id = uuid(threadId);
  if (!id) return null;
  const queryable = options.queryable || db;
  const lock = options.lock ? ' FOR UPDATE OF t' : '';
  const result = await queryable.query(
    `SELECT t.*, p.status AS financial_status
       FROM compound_threads t
       LEFT JOIN financial_plan_profiles p ON p.thread_id = t.id AND p.user_id = t.user_id
      WHERE t.id = $1 AND t.user_id = $2 AND t.archetype_key = 'financial_capital'${lock}`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function profileFor(queryable, userId, threadId, lock = false) {
  const result = await queryable.query(
    `SELECT * FROM financial_plan_profiles WHERE user_id = $1 AND thread_id = $2${lock ? ' FOR UPDATE' : ''}`,
    [userId, threadId]
  );
  return result.rows[0] || null;
}

async function requireProfile(userId, threadId, options = {}) {
  const thread = await ownedFinancialThread(userId, threadId, options);
  if (!thread) return { error: 'thread' };
  const profile = await profileFor(options.queryable || db, userId, thread.id, options.lock);
  if (!profile) return { error: 'profile', thread };
  return { thread, profile };
}

function sensitiveInput(value) {
  return containsFinancialSecret(value);
}

function safeSourceKind(value) {
  return enumValue(value, SOURCE_KINDS, 'MANUAL');
}

function recordInput(input, options = {}) {
  const recordType = enumValue(input.recordType, RECORD_TYPES);
  const occurredOn = dateOnly(input.occurredOn);
  const payload = moneyPayload(input);
  if (!recordType || !occurredOn || !payload || (!options.allowMissingSource && !payload.sourceCategory)) return null;
  return { recordType, occurredOn, currency: payload.currency, payload };
}

function snapshotInput(input) {
  const snapshotKind = enumValue(input.snapshotKind, ['PLAN_TOTAL', 'HOLDING'], 'PLAN_TOTAL');
  const valuedOn = dateOnly(input.valuedOn);
  const payload = moneyPayload(input, { allowZero: true });
  if (!snapshotKind || !valuedOn || !payload) return null;
  return { snapshotKind, valuedOn, currency: payload.currency, payload: { ...payload, coverage: text(input.coverage, 240) } };
}

function holdingInput(input) {
  const valuedOn = dateOnly(input.valuedOn);
  const payload = moneyPayload(input, { allowZero: true });
  if (!valuedOn || !payload || (!payload.productName && !payload.channelLabel && !payload.directionName)) return null;
  const percent = input.userMaxPercent === '' || input.userMaxPercent === undefined || input.userMaxPercent === null
    ? null : Number(input.userMaxPercent);
  if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) return null;
  return {
    valuedOn,
    currency: payload.currency,
    classificationStatus: enumValue(input.classificationStatus, CLASSIFICATION_STATUSES, 'USER_ENTERED'),
    holdingKey: stableFingerprint([
      payload.channelLabel.toLowerCase(),
      payload.productName.toLowerCase(),
      text(input.shareClass, 80).toLowerCase(),
      payload.directionName.toLowerCase()
    ]),
    payload: {
      ...payload,
      shareClass: text(input.shareClass, 80),
      category: text(input.category, 120),
      userMaxPercent: percent,
      sourceLabel: text(input.sourceLabel, 160)
    }
  };
}

function normalizedImport(raw, fallbackCurrency, sourceHash) {
  const source = Array.isArray(raw?.candidates) ? raw.candidates : [];
  const candidates = source.slice(0, 80).map((item, index) => {
    const kind = enumValue(item?.kind, ['RECORD', 'SNAPSHOT', 'HOLDING']);
    const base = {
      ...item,
      amount: String(item?.amount || '').replace(/,/g, ''),
      currency: currencyCode(item?.currency, fallbackCurrency),
      note: text(item?.note, 600),
      channelLabel: text(item?.channelLabel, 120),
      productName: text(item?.productName, 160),
      directionName: text(item?.directionName, 160),
      sourceCategory: text(item?.sourceCategory, 80)
    };
    let normalized = null;
    if (kind === 'RECORD') {
      normalized = recordInput({ ...base, recordType: item.recordType, occurredOn: item.date }, { allowMissingSource: true });
      if (normalized && !normalized.payload.sourceCategory) {
        normalized.recordType = 'UNCERTAIN';
        normalized.payload.sourceCategory = '来源待确认';
      }
    }
    if (kind === 'SNAPSHOT') normalized = snapshotInput({ ...base, snapshotKind: 'PLAN_TOTAL', valuedOn: item.date });
    if (kind === 'HOLDING') normalized = holdingInput({ ...base, valuedOn: item.date, classificationStatus: 'UNVERIFIED' });
    if (!normalized) return null;
    const id = stableFingerprint({ sourceHash, index, kind, normalized }).slice(0, 24);
    return {
      id,
      kind,
      confidence: enumValue(item.confidence, ['HIGH', 'MEDIUM', 'LOW'], 'LOW'),
      needsConfirmation: true,
      ...normalized,
      ...normalized.payload,
      amount: minorToMoney(normalized.payload.amountMinor),
      payload: undefined
    };
  }).filter(Boolean);
  return {
    candidates,
    ambiguities: (Array.isArray(raw?.ambiguities) ? raw.ambiguities : []).map(item => text(item, 400)).filter(Boolean).slice(0, 20),
    ignoredIntentions: (Array.isArray(raw?.ignoredIntentions) ? raw.ignoredIntentions : []).map(item => text(item, 400)).filter(Boolean).slice(0, 20)
  };
}

function holdingSummary(holdings, aliases = []) {
  const latestByKey = new Map();
  for (const item of holdings.filter(row => row.status === 'CONFIRMED')) {
    const key = item.holdingKey || item.id;
    const existing = latestByKey.get(key);
    if (!existing || item.valuedOn > existing.valuedOn || (item.valuedOn === existing.valuedOn && item.createdAt > existing.createdAt)) {
      latestByKey.set(key, item);
    }
  }
  const current = [...latestByKey.values()].filter(item => BigInt(item.payload.amountMinor) > 0n).map(item => {
    const labels = [item.payload.channelLabel, item.payload.productName].filter(Boolean).map(value => value.trim().toLowerCase());
    const alias = aliases.find(mapping => {
      const appliesToRecord = !mapping.batchScope || mapping.batchScope === item.sourceRef;
      return appliesToRecord && labels.includes(String(mapping.sourceAlias || '').trim().toLowerCase());
    });
    if (!alias) return item;
    return {
      ...item,
      payload: {
        ...item.payload,
        productName: alias.productName || item.payload.productName,
        directionName: alias.directionName || item.payload.directionName,
        aliasApplied: alias.sourceAlias
      }
    };
  });
  const totals = {};
  for (const item of current) {
    totals[item.payload.currency] = (totals[item.payload.currency] || 0n) + BigInt(item.payload.amountMinor);
  }
  const items = current.map(item => ({
    ...item,
    amount: minorToMoney(item.payload.amountMinor),
    percent: totals[item.payload.currency]
      ? Number((Number(item.payload.amountMinor) / Number(totals[item.payload.currency]) * 100).toFixed(1)) : null
  }));
  const dates = [...new Set(items.map(item => item.valuedOn))];
  const directionMap = new Map();
  const productMap = new Map();
  for (const item of items) {
    const label = item.payload.directionName || '待分类';
    const key = `${item.currency}:${label}`;
    const group = directionMap.get(key) || { currency: item.currency, label, amountMinor: 0n, channels: new Set(), itemCount: 0 };
    group.amountMinor += BigInt(item.payload.amountMinor);
    if (item.payload.channelLabel) group.channels.add(item.payload.channelLabel);
    group.itemCount += 1;
    directionMap.set(key, group);

    const productLabel = item.payload.productName || '未识别产品';
    const productKey = `${item.currency}:${productLabel}`;
    const product = productMap.get(productKey) || {
      currency: item.currency,
      label: productLabel,
      directionName: item.payload.directionName || '',
      amountMinor: 0n,
      channels: new Set(),
      shareClasses: new Set(),
      itemCount: 0
    };
    product.amountMinor += BigInt(item.payload.amountMinor);
    if (item.payload.channelLabel) product.channels.add(item.payload.channelLabel);
    if (item.payload.shareClass) product.shareClasses.add(item.payload.shareClass);
    product.itemCount += 1;
    productMap.set(productKey, product);
  }
  const directions = [...directionMap.values()].map(group => ({
    key: `${group.currency}:${group.label}`,
    currency: group.currency,
    label: group.label,
    amount: minorToMoney(group.amountMinor.toString()),
    percent: totals[group.currency] ? Number((Number(group.amountMinor) / Number(totals[group.currency]) * 100).toFixed(1)) : null,
    channelCount: group.channels.size,
    itemCount: group.itemCount
  })).sort((a, b) => Number(b.amount) - Number(a.amount));
  const products = [...productMap.values()].map(product => ({
    key: `${product.currency}:${product.label}`,
    currency: product.currency,
    label: product.label,
    directionName: product.directionName,
    amount: minorToMoney(product.amountMinor.toString()),
    percent: totals[product.currency] ? Number((Number(product.amountMinor) / Number(totals[product.currency]) * 100).toFixed(1)) : null,
    channels: [...product.channels],
    shareClasses: [...product.shareClasses],
    shareClassLabel: [...product.shareClasses].length ? ` · ${[...product.shareClasses].join(' / ')} 份额` : '',
    itemCount: product.itemCount
  })).sort((a, b) => Number(b.amount) - Number(a.amount));
  const itemsWithLimits = items.map(item => ({
    ...item,
    limitDeviation: item.payload.userMaxPercent !== null && item.payload.userMaxPercent !== undefined &&
      item.percent !== null && item.percent > item.payload.userMaxPercent
      ? Number((item.percent - item.payload.userMaxPercent).toFixed(1))
      : null
  }));
  return { items: itemsWithLimits, products, directions, mixedDates: dates.length > 1, dates, totals: Object.entries(totals).map(([currency, amount]) => ({ currency, amount: minorToMoney(amount.toString()) })) };
}

function executionSummary(records, rules, asOfDate = shanghaiDate(), periodStart = null) {
  const currentRule = rules.find(rule => rule.effectiveOn <= asOfDate) || null;
  if (!currentRule) return { status: 'NO_RULE', message: '还没有生效的投入规则，暂不能核对偏离。' };
  if (currentRule.contributionMethod !== 'FIXED' || !currentRule.fixedAmount) {
    return {
      status: 'EXPLANATION_REQUIRED',
      ruleVersion: currentRule.version,
      message: currentRule.contributionMethod === 'SURPLUS_RATIO'
        ? '本期需先确认可投资结余，才能按你设定的比例核对预算。'
        : '这不是固定金额计划，系统保留每次决定和原因，不把金额变化自动判为违规。'
    };
  }
  const frequency = enumValue(currentRule.frequency, CONTRIBUTION_FREQUENCIES, 'MONTHLY');
  const year = Number(asOfDate.slice(0, 4));
  const month = Number(asOfDate.slice(5, 7));
  const defaultStart = frequency === 'YEARLY'
    ? `${year}-01-01`
    : (frequency === 'QUARTERLY'
      ? `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
      : `${asOfDate.slice(0, 7)}-01`);
  const rangeStart = periodStart || defaultStart;
  const rulesInRange = rules.filter(rule => rule.effectiveOn > rangeStart && rule.effectiveOn <= asOfDate);
  const ruleBeforeRange = rules.find(rule => rule.effectiveOn <= rangeStart);
  const applicableRuleVersions = new Set([
    ...rulesInRange.map(rule => rule.id),
    ...(ruleBeforeRange ? [ruleBeforeRange.id] : [])
  ]);
  if (applicableRuleVersions.size > 1) {
    return {
      status: 'MULTIPLE_RULES',
      ruleVersion: currentRule.version,
      message: '本期跨越多个规则版本，系统不会用最新规则改写之前的执行口径；请分别核对各段。'
    };
  }
  const comparisonStart = ruleBeforeRange ? rangeStart : currentRule.effectiveOn;
  const startYear = Number(comparisonStart.slice(0, 4));
  const startMonth = Number(comparisonStart.slice(5, 7));
  const periodCount = frequency === 'YEARLY'
    ? year - startYear + 1
    : (frequency === 'QUARTERLY'
      ? (year * 4 + Math.floor((month - 1) / 3)) - (startYear * 4 + Math.floor((startMonth - 1) / 3)) + 1
      : (year * 12 + month) - (startYear * 12 + startMonth) + 1);
  const currency = currentRule.fixedAmount.currency;
  const actualMinor = records
    .filter(row => row.status === 'CONFIRMED' && row.recordType === 'EXTERNAL_CONTRIBUTION' &&
      row.occurredOn >= comparisonStart && row.occurredOn <= asOfDate && row.payload.currency === currency)
    .reduce((sum, row) => sum + BigInt(row.payload.amountMinor), 0n);
  const plannedMinor = BigInt(currentRule.fixedAmount.amountMinor) * BigInt(Math.max(1, periodCount));
  return {
    status: actualMinor === plannedMinor ? 'ON_PLAN' : 'DEVIATED',
    ruleVersion: currentRule.version,
    period: periodStart ? `${rangeStart}—${asOfDate}` : asOfDate.slice(0, 7),
    currency,
    planned: minorToMoney(plannedMinor.toString()),
    actual: minorToMoney(actualMinor.toString()),
    deviation: minorToMoney((actualMinor - plannedMinor).toString()),
    message: actualMinor === plannedMinor ? '本期已确认投入与当前规则一致。' : '只呈现偏离事实；是否调整计划由你决定。'
  };
}

async function planData(userId, threadId) {
  const thread = await ownedFinancialThread(userId, threadId);
  if (!thread) return null;
  const [profileResult, recordsResult, snapshotsResult, holdingsResult, aliasesResult, rulesResult, notesResult, reviewsResult, legacyResult] = await Promise.all([
    db.query('SELECT * FROM financial_plan_profiles WHERE user_id = $1 AND thread_id = $2', [userId, thread.id]),
    db.query('SELECT * FROM financial_records WHERE user_id = $1 AND thread_id = $2 ORDER BY occurred_on DESC, created_at DESC LIMIT 300', [userId, thread.id]),
    db.query('SELECT * FROM financial_snapshots WHERE user_id = $1 AND thread_id = $2 ORDER BY valued_on DESC, created_at DESC LIMIT 200', [userId, thread.id]),
    db.query(`SELECT * FROM financial_holdings WHERE user_id = $1 AND thread_id = $2
      AND status NOT IN ('SUPERSEDED', 'VOID') ORDER BY valued_on DESC, created_at DESC LIMIT 300`, [userId, thread.id]),
    db.query('SELECT * FROM financial_aliases WHERE user_id = $1 AND thread_id = $2 ORDER BY updated_at DESC', [userId, thread.id]),
    db.query('SELECT * FROM financial_rule_versions WHERE user_id = $1 AND thread_id = $2 ORDER BY version DESC', [userId, thread.id]),
    db.query('SELECT * FROM financial_decision_notes WHERE user_id = $1 AND thread_id = $2 ORDER BY decided_on DESC, created_at DESC LIMIT 100', [userId, thread.id]),
    db.query('SELECT * FROM financial_reviews WHERE user_id = $1 AND thread_id = $2 ORDER BY scope_end DESC, created_at DESC LIMIT 24', [userId, thread.id]),
    db.query(`SELECT count(*)::int AS count FROM compound_events
      WHERE user_id = $1 AND thread_id = $2 AND kind = 'RESULT' AND status IN ('DRAFT', 'CONFIRMED')`, [userId, thread.id])
  ]);
  const records = recordsResult.rows.map(mapRecord);
  const snapshots = snapshotsResult.rows.map(mapSnapshot);
  const holdings = holdingsResult.rows.map(mapHolding);
  const aliases = aliasesResult.rows.map(mapPrivateRow);
  const rules = rulesResult.rows.map(row => ({ id: row.id, version: row.version, effectiveOn: dateOnly(row.effective_on), decidedOn: dateOnly(row.decided_on), ...decrypt(row), createdAt: row.created_at }));
  return {
    thread: {
      id: thread.id,
      title: thread.title,
      status: thread.status,
      desiredOutcome: thread.desired_outcome || '',
      currentStep: thread.current_step || '',
      startedAt: thread.started_at
    },
    profile: mapProfile(profileResult.rows[0]),
    overview: calculateOverview({ records, snapshots, holdings }),
    records,
    snapshots,
    holdings: holdingSummary(holdings, aliases),
    aliases,
    rules,
    execution: executionSummary(records, rules),
    notes: notesResult.rows.map(mapPrivateRow),
    reviews: reviewsResult.rows.map(row => ({ id: row.id, reviewType: row.review_type, scopeStart: dateOnly(row.scope_start), scopeEnd: dateOnly(row.scope_end), status: row.status, ...decrypt(row), createdAt: row.created_at })),
    legacy: {
      recordCount: Number(legacyResult.rows[0]?.count || 0),
      note: '旧版次数与进展记录继续保留，但不会被折算为本金、收益或新台账记录。'
    },
    privacy: {
      visibility: 'PRIVATE',
      encryptedAtRest: true,
      noticeVersion: PRIVACY_NOTICE_VERSION,
      notice: '精确金额和持有明细使用加密字段保存，仅当前账号可访问，不进入发现或用户比较。'
    },
    features: {
      aiImportEnabled: config.financialAiImportEnabled,
      aiProcessorName: config.financialAiImportEnabled ? config.financialAiProcessorName : '',
      aiConsentCurrent: Boolean(
        profileResult.rows[0]?.ai_processing_consent_at &&
        profileResult.rows[0]?.ai_processing_consent_version === AI_PRIVACY_NOTICE_VERSION
      )
    },
    policyVersion: FINANCIAL_COMPOUND_POLICY_VERSION,
    boundary: '只做私人台账、事实核算和用户自设规则核对；不提供产品、组合、买卖时点或收益预测建议。'
  };
}

router.get('/plans/:threadId', asyncRoute(async (req, res) => {
  const data = await planData(req.user.id, req.params.threadId);
  if (!data) return fail(res, 404, '财务计划不存在');
  return ok(res, data);
}));

router.put('/plans/:threadId/profile', asyncRoute(async (req, res) => {
  const thread = await ownedFinancialThread(req.user.id, req.params.threadId);
  if (!thread) return fail(res, 404, '财务计划不存在');
  const existing = await profileFor(db, req.user.id, thread.id);
  if (!existing && req.body.sensitiveDataConsent !== true) {
    return fail(res, 400, '保存精确金额和持有信息前，需要单独确认敏感财务数据处理说明');
  }
  const profile = {
    status: enumValue(req.body.status, PROFILE_STATUSES, existing?.status || 'ACTIVE'),
    scopeType: enumValue(req.body.scopeType, SCOPE_TYPES, existing?.scope_type || 'PARTIAL'),
    trackingMode: enumValue(req.body.trackingMode, TRACKING_MODES, existing?.tracking_mode || 'PLAN_ONLY'),
    baseCurrency: currencyCode(req.body.baseCurrency, existing?.base_currency || 'CNY'),
    horizonStatus: enumValue(req.body.horizonStatus, HORIZON_STATUSES, existing?.horizon_status || 'UNDECIDED'),
    expectedUseOn: req.body.expectedUseOn ? dateOnly(req.body.expectedUseOn) : null,
    reserveStatus: enumValue(req.body.reserveStatus, RESERVE_STATUSES, existing?.reserve_status || 'UNSPECIFIED'),
    purpose: text(req.body.purpose, 600),
    contributionMethod: enumValue(req.body.contributionMethod, CONTRIBUTION_METHODS, 'UNSET'),
    firstAction: text(req.body.firstAction, 500)
  };
  if (!profile.baseCurrency || (profile.horizonStatus === 'TARGET_DATE' && !profile.expectedUseOn)) {
    return fail(res, 400, '请检查币种和预计使用日期');
  }
  if (!profile.purpose || !profile.firstAction) return fail(res, 400, '请填写计划目的和第一项核对行动');
  if (sensitiveInput(profile)) return fail(res, 400, '请删除账户号、密码、验证码等敏感凭证后再保存');
  const payload = encryptFinancialPayload({
    purpose: profile.purpose,
    contributionMethod: profile.contributionMethod,
    firstAction: profile.firstAction
  });
  await db.transaction(async client => {
    await client.query(
      `INSERT INTO financial_plan_profiles
        (thread_id, user_id, status, scope_type, tracking_mode, base_currency,
         horizon_status, expected_use_on, reserve_status, private_payload,
         privacy_notice_version, sensitive_consent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
       ON CONFLICT (thread_id, user_id) DO UPDATE SET
         status=EXCLUDED.status, scope_type=EXCLUDED.scope_type,
         tracking_mode=EXCLUDED.tracking_mode, base_currency=EXCLUDED.base_currency,
         horizon_status=EXCLUDED.horizon_status, expected_use_on=EXCLUDED.expected_use_on,
         reserve_status=EXCLUDED.reserve_status, private_payload=EXCLUDED.private_payload,
         privacy_notice_version=EXCLUDED.privacy_notice_version, updated_at=now()`,
      [thread.id, req.user.id, profile.status, profile.scopeType, profile.trackingMode,
        profile.baseCurrency, profile.horizonStatus, profile.expectedUseOn, profile.reserveStatus,
        payload, PRIVACY_NOTICE_VERSION]
    );
    await client.query(
      `UPDATE compound_threads
          SET desired_outcome=$3,current_step=$4,principal_definition=$5,updated_at=now()
        WHERE id=$1 AND user_id=$2`,
      [thread.id, req.user.id, profile.purpose, profile.firstAction,
        profile.scopeType === 'ALL_LONG_TERM' ? '全部长期投资' : '一部分长期资金']
    );
    if (!existing) {
 await client.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, summary, payload)
       VALUES ($1,$2,$3,'ADJUSTMENT','CONFIRMED','USER','启用财务事实账本',$4::jsonb)`,
      [crypto.randomUUID(), req.user.id, thread.id, JSON.stringify({
        financialLedgerVersion: 2,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        legacyAmountsMigrated: false
      })]
    );
}
  });
  return ok(res, { profile: mapProfile(await profileFor(db, req.user.id, thread.id)) }, '资金计划设置已保存');
}));

router.post('/plans/:threadId/records', asyncRoute(async (req, res) => {
  const owned = await requireProfile(req.user.id, req.params.threadId);
  if (owned.error === 'thread') return fail(res, 404, '财务计划不存在');
  if (owned.error === 'profile') return fail(res, 409, '请先完成资金计划设置');
  const input = recordInput(req.body);
  if (!input) return fail(res, 400, '请填写有效的日期、正金额、币种、记录类型和来源');
  if (sensitiveInput(req.body)) return fail(res, 400, '请删除账户号、密码、验证码等敏感凭证后再保存');
  const clientRequestId = text(req.body.clientRequestId, 128);
  if (!clientRequestId) return fail(res, 400, '缺少防重复请求标识');
  const sourceKind = safeSourceKind(req.body.sourceKind);
  const id = crypto.randomUUID();
  const status = input.recordType === 'UNCERTAIN' ? 'DRAFT' : (boolean(req.body.confirmed) ? 'CONFIRMED' : 'DRAFT');
  const result = await db.query(
    `INSERT INTO financial_records
      (id,user_id,thread_id,record_type,occurred_on,currency,status,source_kind,
       source_ref,transfer_group_id,idempotency_key,private_payload,confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $7='CONFIRMED' THEN now() ELSE NULL END)
     ON CONFLICT (user_id,thread_id,idempotency_key) DO UPDATE SET updated_at=financial_records.updated_at
     RETURNING *`,
    [id, req.user.id, owned.thread.id, input.recordType, input.occurredOn, input.currency,
      status, sourceKind,
      text(req.body.sourceRef, 160) || null, uuid(req.body.transferGroupId), clientRequestId,
      encryptFinancialPayload(input.payload)]
  );
  return ok(res, { record: mapRecord(result.rows[0]) }, status === 'CONFIRMED' ? '资金记录已确认' : '已保存为待核对记录');
}));

router.patch('/plans/:threadId/records/:recordId', asyncRoute(async (req, res) => {
  const recordId = uuid(req.params.recordId);
  const revisionReason = text(req.body.revisionReason, 600);
  if (!recordId || !revisionReason) return fail(res, 400, '更正记录时需要填写修改依据');
  const saved = await db.transaction(async client => {
    const owned = await requireProfile(req.user.id, req.params.threadId, { queryable: client, lock: true });
    if (owned.error) return owned;
    const existingResult = await client.query(
      'SELECT * FROM financial_records WHERE id=$1 AND user_id=$2 AND thread_id=$3 FOR UPDATE',
      [recordId, req.user.id, owned.thread.id]
    );
    const existing = existingResult.rows[0];
    if (!existing || ['SUPERSEDED', 'VOID'].includes(existing.status)) return { error: 'record' };
    const previous = decrypt(existing);
    const input = recordInput({
      ...previous,
      ...req.body,
      recordType: req.body.recordType || existing.record_type,
      occurredOn: req.body.occurredOn || dateOnly(existing.occurred_on),
      amount: req.body.amount || minorToMoney(previous.amountMinor),
      currency: req.body.currency || existing.currency
    });
    if (!input || sensitiveInput(req.body)) return { error: 'input' };
    const clientRequestId = text(req.body.clientRequestId, 128);
    if (!clientRequestId) return { error: 'request' };
    await client.query('UPDATE financial_records SET status=\'SUPERSEDED\',updated_at=now() WHERE id=$1', [existing.id]);
    const status = input.recordType === 'UNCERTAIN' ? 'DRAFT' : 'CONFIRMED';
    const result = await client.query(
      `INSERT INTO financial_records
        (id,user_id,thread_id,record_type,occurred_on,currency,status,source_kind,source_ref,
         transfer_group_id,revision_of,revision_reason,idempotency_key,private_payload,confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$14,$7,$8,$9,$10,$11,$12,$13,CASE WHEN $14='CONFIRMED' THEN now() ELSE NULL END) RETURNING *`,
      [crypto.randomUUID(), req.user.id, owned.thread.id, input.recordType, input.occurredOn, input.currency,
        existing.source_kind, existing.source_ref, existing.transfer_group_id, existing.id, revisionReason,
        clientRequestId, encryptFinancialPayload(input.payload), status]
    );
    return { row: result.rows[0] };
  });
  if (saved.error === 'thread') return fail(res, 404, '财务计划不存在');
  if (saved.error === 'profile') return fail(res, 409, '请先完成资金计划设置');
  if (saved.error === 'record') return fail(res, 409, '原记录已经被修订或作废');
  if (saved.error) return fail(res, 400, '请检查更正后的日期、金额和修改依据');
  return ok(res, { record: mapRecord(saved.row) }, '记录已更正，原版本继续保留');
}));

router.delete('/plans/:threadId/records/:recordId', asyncRoute(async (req, res) => {
  const owned = await requireProfile(req.user.id, req.params.threadId);
  const recordId = uuid(req.params.recordId);
  const reason = text(req.body.reason, 600);
  if (owned.error) return fail(res, owned.error === 'thread' ? 404 : 409, owned.error === 'thread' ? '财务计划不存在' : '请先完成资金计划设置');
  if (!recordId || !reason) return fail(res, 400, '作废记录时需要保留原因');
  const result = await db.query(
    `UPDATE financial_records SET status='VOID',revision_reason=$4,updated_at=now()
      WHERE id=$1 AND user_id=$2 AND thread_id=$3 AND status NOT IN ('SUPERSEDED','VOID') RETURNING *`,
    [recordId, req.user.id, owned.thread.id, reason]
  );
  if (!result.rowCount) return fail(res, 409, '记录已经被修订、作废或不存在');
  return ok(res, { record: mapRecord(result.rows[0]) }, '记录已作废，历史依据仍保留');
}));

router.post('/plans/:threadId/snapshots', asyncRoute(async (req, res) => {
  const owned = await requireProfile(req.user.id, req.params.threadId);
  if (owned.error) return fail(res, owned.error === 'thread' ? 404 : 409, owned.error === 'thread' ? '财务计划不存在' : '请先完成资金计划设置');
  const input = snapshotInput(req.body);
  if (!input) return fail(res, 400, '请填写有效的估值日期、正金额和币种');
  if (sensitiveInput(req.body)) return fail(res, 400, '请删除账户号、密码、验证码等敏感凭证后再保存');
  const clientRequestId = text(req.body.clientRequestId, 128);
  if (!clientRequestId) return fail(res, 400, '缺少防重复请求标识');
  const id = crypto.randomUUID();
  const result = await db.query(
    `INSERT INTO financial_snapshots
      (id,user_id,thread_id,snapshot_kind,valued_on,currency,status,source_kind,
       source_ref,idempotency_key,private_payload,confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CASE WHEN $7='CONFIRMED' THEN now() ELSE NULL END)
     ON CONFLICT (user_id,thread_id,idempotency_key) DO UPDATE SET updated_at=financial_snapshots.updated_at
     RETURNING *`,
    [id, req.user.id, owned.thread.id, input.snapshotKind, input.valuedOn, input.currency,
      boolean(req.body.confirmed) ? 'CONFIRMED' : 'DRAFT', safeSourceKind(req.body.sourceKind),
      text(req.body.sourceRef, 160) || null, clientRequestId, encryptFinancialPayload(input.payload)]
  );
  return ok(res, { snapshot: mapSnapshot(result.rows[0]) }, boolean(req.body.confirmed) ? '资产快照已确认' : '资产快照待核对');
}));

router.patch('/plans/:threadId/snapshots/:snapshotId', asyncRoute(async (req, res) => {
  const snapshotId = uuid(req.params.snapshotId);
  const revisionReason = text(req.body.revisionReason, 600);
  if (!snapshotId || !revisionReason) return fail(res, 400, '更正快照时需要填写修改依据');
  const saved = await db.transaction(async client => {
    const owned = await requireProfile(req.user.id, req.params.threadId, { queryable: client, lock: true });
    if (owned.error) return owned;
    const existingResult = await client.query(
      'SELECT * FROM financial_snapshots WHERE id=$1 AND user_id=$2 AND thread_id=$3 FOR UPDATE',
      [snapshotId, req.user.id, owned.thread.id]
    );
    const existing = existingResult.rows[0];
    if (!existing || ['SUPERSEDED', 'VOID'].includes(existing.status)) return { error: 'snapshot' };
    const previous = decrypt(existing);
    const input = snapshotInput({
      ...previous,
...req.body,
      snapshotKind: req.body.snapshotKind || existing.snapshot_kind,
      valuedOn: req.body.valuedOn || dateOnly(existing.valued_on),
      amount: req.body.amount || minorToMoney(previous.amountMinor),
      currency: req.body.currency || existing.currency
    });
    if (!input || sensitiveInput(req.body)) return { error: 'input' };
    const clientRequestId = text(req.body.clientRequestId, 128);
    if (!clientRequestId) return { error: 'request' };
    await client.query('UPDATE financial_snapshots SET status=\'SUPERSEDED\',updated_at=now() WHERE id=$1', [existing.id]);
    const result = await client.query(
      `INSERT INTO financial_snapshots
        (id,user_id,thread_id,snapshot_kind,valued_on,currency,status,source_kind,source_ref,
         revision_of,revision_reason,idempotency_key,private_payload,confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,'CONFIRMED',$7,$8,$9,$10,$11,$12,now()) RETURNING *`,
      [crypto.randomUUID(), req.user.id, owned.thread.id, input.snapshotKind, input.valuedOn, input.currency,
        existing.source_kind, existing.source_ref, existing.id, revisionReason, clientRequestId,
        encryptFinancialPayload(input.payload)]
    );
    return { row: result.rows[0] };
  });
  if (saved.error === 'thread') return fail(res, 404, '财务计划不存在');
  if (saved.error === 'profile') return fail(res, 409, '请先完成资金计划设置');
  if (saved.error === 'snapshot') return fail(res, 409, '原快照已经被修订或作废');
  if (saved.error) return fail(res, 400, '请检查更正后的日期、金额和修改依据');
  return ok(res, { snapshot: mapSnapshot(saved.row) }, '快照已更正，原版本继续保留');
}));

router.delete('/plans/:threadId/snapshots/:snapshotId', asyncRoute(async (req, res) => {
  const owned = await requireProfile(req.user.id, req.params.threadId);
  const snapshotId = uuid(req.params.snapshotId);
  const reason = text(req.body.reason, 600);
  if (owned.error) return fail(res, owned.error === 'thread' ? 404 : 409, owned.error === 'thread' ? '财务计划不存在' : '请先完成资金计划设置');
  if (!snapshotId || !reason) return fail(res, 400, '作废快照时需要保留原因');
  const result = await db.query(
    `UPDATE financial_snapshots SET status='VOID',revision_reason=$4,updated_at=now()
      WHERE id=$1 AND user_id=$2 AND thread_id=$3 AND status NOT IN ('SUPERSEDED','VOID') RETURNING *`,
    [snapshotId, req.user.id, owned.thread.id, reason]
  );
  if (!result.rowCount) return fail(res, 409, '快照已经被修订、作废或不存在');
  return ok(res, { snapshot: mapSnapshot(result.rows[0]) }, '快照已作废，历史依据仍保留');
}));

router.post('/plans/:threadId/holdings', asyncRoute(async (req, res) => {
  const owned = await requireProfile(req.user.id, req.params.threadId);
  if (owned.error) return fail(res, owned.error === 'thread' ? 404 : 409, owned.error === 'thread' ? '财务计划不存在' : '请先完成资金计划设置');
  const input = holdingInput(req.body);
  if (!input) return fail(res, 400, '请填写持有日期、金额、币种，并至少提供渠道、产品或投资方向之一');
  if (sensitiveInput(req.body)) return fail(res, 400, '渠道只能使用简称；请删除账号、密码、验证码等敏感凭证');
  const clientRequestId = text(req.body.clientRequestId, 128);
  if (!clientRequestId) return fail(res, 400, '缺少防重复请求标识');
  const id = crypto.randomUUID();
  const result = await db.query(
    `INSERT INTO financial_holdings
      (id,user_id,thread_id,valued_on,currency,status,classification_status,source_kind,source_ref,holding_key,
       idempotency_key,private_payload,confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $6='CONFIRMED' THEN now() ELSE NULL END)
     ON CONFLICT (user_id,thread_id,idempotency_key) DO UPDATE SET updated_at=financial_holdings.updated_at
     RETURNING *`,
    [id, req.user.id, owned.thread.id, input.valuedOn, input.currency,
      boolean(req.body.confirmed) ? 'CONFIRMED' : 'DRAFT', input.classificationStatus, safeSourceKind(req.body.sourceKind),
      text(req.body.sourceRef, 160) || null, input.holdingKey, clientRequestId, encryptFinancialPayload(input.payload)]
  );
  return ok(res, { holding: mapHolding(result.rows[0]) }, boolean(req.body.confirmed) ? '持有明细已确认' : '持有明细待核对');
}));

router.patch('/plans/:threadId/holdings/:holdingId', asyncRoute(async (req, res) => {
  const holdingId = uuid(req.params.holdingId);
  const revisionReason = text(req.body.revisionReason, 600);
  if (!holdingId || !revisionReason) return fail(res, 400, '更正持有明细时需要填写修改依据');
  const saved = await db.transaction(async client => {
    const owned = await requireProfile(req.user.id, req.params.threadId, { queryable: client, lock: true });
    if (owned.error) return owned;
    const existingResult = await client.query(
      'SELECT * FROM financial_holdings WHERE id=$1 AND user_id=$2 AND thread_id=$3 FOR UPDATE',
      [holdingId, req.user.id, owned.thread.id]
    );
    const existing = existingResult.rows[0];
    if (!existing || ['SUPERSEDED', 'VOID'].includes(existing.status)) return { error: 'holding' };
    const previous = decrypt(existing);
    const input = holdingInput({
      ...previous,
...req.body,
      valuedOn: req.body.valuedOn || dateOnly(existing.valued_on),
      amount: req.body.amount || minorToMoney(previous.amountMinor),
      currency: req.body.currency || existing.currency,
      classificationStatus: req.body.classificationStatus || existing.classification_status
    });
    if (!input || sensitiveInput(req.body)) return { error: 'input' };
    const clientRequestId = text(req.body.clientRequestId, 128);
    if (!clientRequestId) return { error: 'request' };
    await client.query('UPDATE financial_holdings SET status=\'SUPERSEDED\',updated_at=now() WHERE id=$1', [existing.id]);
    const result = await client.query(
      `INSERT INTO financial_holdings
        (id,user_id,thread_id,valued_on,currency,status,classification_status,source_kind,source_ref,holding_key,
         revision_of,revision_reason,idempotency_key,private_payload,confirmed_at)
       VALUES ($1,$2,$3,$4,$5,'CONFIRMED',$6,$7,$8,$9,$10,$11,$12,$13,now()) RETURNING *`,
      [crypto.randomUUID(), req.user.id, owned.thread.id, input.valuedOn, input.currency,
        input.classificationStatus, existing.source_kind || 'MANUAL', existing.source_ref, input.holdingKey,
        existing.id, revisionReason, clientRequestId, encryptFinancialPayload(input.payload)]
    );
    return { row: result.rows[0] };
  });
  if (saved.error === 'thread') return fail(res, 404, '财务计划不存在');
  if (saved.error === 'profile') return fail(res, 409, '请先完成资金计划设置');
  if (saved.error === 'holding') return fail(res, 409, '原持有明细已经被修订或作废');
  if (saved.error) return fail(res, 400, '请检查更正后的日期、金额和修改依据');
  return ok(res, { holding: mapHolding(saved.row) }, '持有明细已更正，原版本继续保留');
}));

router.delete('/plans/:threadId/holdings/:holdingId', asyncRoute(async (req, res) => {
  const owned = await requireProfile(req.user.id, req.params.threadId);
  const holdingId = uuid(req.params.holdingId);
  const reason = text(req.body.reason, 600);
  if (owned.error) return fail(res, owned.error === 'thread' ? 404 : 409, owned.error === 'thread' ? '财务计划不存在' : '请先完成资金计划设置');
  if (!holdingId || !reason) return fail(res, 400, '作废持有明细时需要保留原因');
  const result = await db.query(
    `UPDATE financial_holdings SET status='VOID',revision_reason=$4,updated_at=now()
      WHERE id=$1 AND user_id=$2 AND thread_id=$3 AND status NOT IN ('SUPERSEDED','VOID') RETURNING *`,
    [holdingId, req.user.id, owned.thread.id, reason]
  );
  if (!result.rowCount) return fail(res, 409, '持有明细已经被修订、作废或不存在');
  return ok(res, { holding: mapHolding(result.rows[0]) }, '持有明细已作废，历史依据仍保留');
}));

router.post('/plans/:threadId/aliases', asyncRoute(async (req, res) => {
  const owned = await requireProfile(req.user.id, req.params.threadId);
  if (owned.error) return fail(res, owned.error === 'thread' ? 404 : 409, owned.error === 'thread' ? '财务计划不存在' : '请先完成资金计划设置');
  const sourceAlias = text(req.body.sourceAlias, 120);
  const productName = text(req.body.productName, 160);
  const directionName = text(req.body.directionName, 160);
  const batchScope = text(req.body.batchScope, 80);
  if (!sourceAlias || (!productName && !directionName)) return fail(res, 400, '请填写别名及它对应的产品或投资方向');
  if (sensitiveInput(req.body)) return fail(res, 400, '别名不能包含账户号、密码或验证码');
  const sourceAliasHash = stableFingerprint(sourceAlias.trim().toLowerCase());
  const result = await db.query(
    `INSERT INTO financial_aliases
      (id,user_id,thread_id,source_alias_hash,batch_scope,private_payload)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id,thread_id,source_alias_hash,batch_scope) DO UPDATE
       SET private_payload=EXCLUDED.private_payload,updated_at=now()
     RETURNING *`,
    [crypto.randomUUID(), req.user.id, owned.thread.id, sourceAliasHash, batchScope,
      encryptFinancialPayload({ sourceAlias, productName, directionName, batchScope })]
  );
  return ok(res, { alias: mapPrivateRow(result.rows[0]) }, '别名归类已保存');
}));

router.post('/plans/:threadId/rules', asyncRoute(async (req, res) => {
  const saved = await db.transaction(async client => {
    const owned = await requireProfile(req.user.id, req.params.threadId, { queryable: client, lock: true });
    if (owned.error) return owned;
    if (sensitiveInput(req.body)) return { error: 'secret' };
    const contributionMethod = enumValue(req.body.contributionMethod, CONTRIBUTION_METHODS);
    const effectiveOn = dateOnly(req.body.effectiveOn);
    const decidedOn = dateOnly(req.body.decidedOn) || shanghaiDate();
    if (!contributionMethod || !effectiveOn) return { error: 'input' };
    const previous = await client.query(
      `SELECT version,effective_on,decided_on FROM financial_rule_versions
        WHERE user_id=$1 AND thread_id=$2 ORDER BY version DESC LIMIT 1`,
      [req.user.id, owned.thread.id]
    );
    const priorRule = previous.rows[0] || null;
    const version = Number(priorRule?.version || 0) + 1;
    const today = shanghaiDate();
    if (decidedOn > today) return { error: 'future_decision' };
    if (priorRule && (effectiveOn < today || effectiveOn < dateOnly(priorRule.effective_on))) {
      return { error: 'retroactive' };
    }
    const payload = {
      contributionMethod,
      frequency: enumValue(req.body.frequency, CONTRIBUTION_FREQUENCIES, contributionMethod === 'FIXED' ? 'MONTHLY' : null),
      fixedAmount: req.body.fixedAmount ? moneyPayload({ amount: req.body.fixedAmount, currency: req.body.currency || owned.profile.base_currency }) : null,
      surplusRatio: req.body.surplusRatio === '' || req.body.surplusRatio === undefined ? null : Number(req.body.surplusRatio),
      totalBudget: req.body.totalBudget ? moneyPayload({ amount: req.body.totalBudget, currency: req.body.currency || owned.profile.base_currency }) : null,
      returnDisposition: text(req.body.returnDisposition, 120),
      userLimits: text(req.body.userLimits, 800),
      changeReason: text(req.body.changeReason, 600)
    };
    if ((payload.surplusRatio !== null && (!Number.isFinite(payload.surplusRatio) || payload.surplusRatio < 0 || payload.surplusRatio > 100)) ||
      (contributionMethod === 'FIXED' && !payload.fixedAmount) ||
      (contributionMethod === 'SURPLUS_RATIO' && payload.surplusRatio === null) ||
      (contributionMethod === 'BATCHED_LUMP_SUM' && !payload.totalBudget)) return { error: 'input' };
    if (version > 1 && !payload.changeReason) return { error: 'reason' };
    const result = await client.query(
      `INSERT INTO financial_rule_versions
        (id,user_id,thread_id,version,effective_on,decided_on,private_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [crypto.randomUUID(), req.user.id, owned.thread.id, version, effectiveOn, decidedOn, encryptFinancialPayload(payload)]
    );
    return { row: result.rows[0] };
  });
  if (saved.error === 'thread') return fail(res, 404, '财务计划不存在');
  if (saved.error === 'profile') return fail(res, 409, '请先完成资金计划设置');
  if (saved.error === 'secret') return fail(res, 400, '请删除账户号、密码、验证码等敏感凭证');
  if (saved.error === 'reason') return fail(res, 400, '调整规则时需要记录修改原因');
  if (saved.error === 'future_decision') return fail(res, 400, '决定日期不能晚于今天');
  if (saved.error === 'retroactive') return fail(res, 400, '新规则不能追溯改写已经发生的期间，请从今天或未来日期生效');
  if (saved.error) return fail(res, 400, '请检查投入方式、日期、金额或比例');
  return ok(res, { rule: { id: saved.row.id, version: saved.row.version, effectiveOn: dateOnly(saved.row.effective_on), decidedOn: dateOnly(saved.row.decided_on), ...decrypt(saved.row) } }, '新规则版本已生效');
}));

router.post('/plans/:threadId/notes', asyncRoute(async (req, res) => {
  const owned = await requireProfile(req.user.id, req.params.threadId);
  if (owned.error) return fail(res, owned.error === 'thread' ? 404 : 409, owned.error === 'thread' ? '财务计划不存在' : '请先完成资金计划设置');
  const decidedOn = dateOnly(req.body.decidedOn) || shanghaiDate();
  const body = text(req.body.body, 2400);
  if (!body) return fail(res, 400, '请写下当时的判断或决定');
  if (sensitiveInput(req.body)) return fail(res, 400, '请删除账户号、密码、验证码等敏感凭证');
  const payload = {
    decidedOn,
    noteType: enumValue(req.body.noteType, ['JUDGMENT', 'DECISION'], 'JUDGMENT'),
    body,
    evidence: text(req.body.evidence, 1200),
    isUserStatement: true
  };
  const result = await db.query(
    `INSERT INTO financial_decision_notes (id,user_id,thread_id,decided_on,private_payload)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [crypto.randomUUID(), req.user.id, owned.thread.id, decidedOn, encryptFinancialPayload(payload)]
  );
  return ok(res, { note: mapPrivateRow(result.rows[0]) }, '判断笔记已保存；它不会被系统当作已验证事实');
}));

router.post('/plans/:threadId/reviews', asyncRoute(async (req, res) => {
  const data = await planData(req.user.id, req.params.threadId);
  if (!data) return fail(res, 404, '财务计划不存在');
  if (!data.profile) return fail(res, 409, '请先完成资金计划设置');
  const reviewType = enumValue(req.body.reviewType, ['MONTHLY', 'QUARTERLY'], 'MONTHLY');
  const scopeStart = dateOnly(req.body.scopeStart);
  const scopeEnd = dateOnly(req.body.scopeEnd);
  if (!scopeStart || !scopeEnd || scopeEnd < scopeStart) return fail(res, 400, '请检查核对期间');
  const payload = {
    facts: data.overview,
    execution: executionSummary(data.records, data.rules, scopeEnd, scopeStart),
    userExplanation: text(req.body.userExplanation, 1800),
    pendingQuestions: String(req.body.pendingQuestions || '').split(/\r?\n/).map(item => text(item, 300)).filter(Boolean).slice(0, 10),
    nextActions: String(req.body.nextActions || '').split(/\r?\n/).map(item => text(item, 300)).filter(Boolean).slice(0, 3),
    generatedWithoutAi: true
  };
  if (sensitiveInput(payload)) return fail(res, 400, '请删除账户号、密码、验证码等敏感凭证');
  const result = await db.query(
    `INSERT INTO financial_reviews
      (id,user_id,thread_id,review_type,scope_start,scope_end,status,private_payload)
     VALUES ($1,$2,$3,$4,$5,$6,'CONFIRMED',$7) RETURNING *`,
    [crypto.randomUUID(), req.user.id, data.thread.id, reviewType, scopeStart, scopeEnd, encryptFinancialPayload(payload)]
  );
  return ok(res, { review: { id: result.rows[0].id, reviewType, scopeStart, scopeEnd, status: 'CONFIRMED', ...payload } }, '核对结果已保存');
}));

router.post('/plans/:threadId/import-drafts', asyncRoute(async (req, res) => {
  if (!config.financialAiImportEnabled) {
    return fail(res, 503, '财务 AI 整理尚未开放；你仍可使用手动记录和确定性核算');
  }
  const owned = await requireProfile(req.user.id, req.params.threadId);
  if (owned.error) return fail(res, owned.error === 'thread' ? 404 : 409, owned.error === 'thread' ? '财务计划不存在' : '请先完成资金计划设置');
  const hasCurrentConsent = Boolean(owned.profile.ai_processing_consent_at) &&
    owned.profile.ai_processing_consent_version === AI_PRIVACY_NOTICE_VERSION;
  if (req.body.aiProcessingConsent !== true && !hasCurrentConsent) {
    return fail(res, 400, '将财务文字交给 AI 整理前，需要单独确认本次 AI 处理');
  }
  const sourceText = text(req.body.text, 20000);
  if (!sourceText) return fail(res, 400, '请先粘贴需要整理的记录');
  if (sensitiveInput(sourceText)) return fail(res, 400, '内容包含账户号、密码、验证码等敏感凭证，请删除后再提交给 AI');
  if (!isAiConfigured()) return fail(res, 503, 'AI 整理当前不可用，你仍可手动记录');
  const sourceHash = stableFingerprint(sourceText);
  const existing = await db.query(
    `SELECT * FROM financial_import_drafts
      WHERE user_id=$1 AND thread_id=$2 AND source_hash=$3`,
    [req.user.id, owned.thread.id, sourceHash]
  );
  if (existing.rowCount) {
    const payload = decrypt(existing.rows[0]);
    return ok(res, { draft: { id: existing.rows[0].id, status: existing.rows[0].status, ...payload }, duplicate: true, costSummary: existing.rows[0].cost_summary });
  }
  await db.query(
    `UPDATE financial_plan_profiles SET ai_processing_consent_at=now(),ai_processing_consent_version=$3,updated_at=now()
      WHERE user_id=$1 AND thread_id=$2`,
    [req.user.id, owned.thread.id, AI_PRIVACY_NOTICE_VERSION]
  );
  const taskId = crypto.randomUUID();
  const raw = await callJson(
    financialPrompt(IMPORT_PROMPT, true),
    { text: redactFinancialSecrets(sourceText), defaultCurrency: owned.profile.base_currency },
    '财务台账·导入草稿',
    { temperature: 0, maxTokens: 2400, usageContext: { userId: req.user.id, feature: 'financial_ledger_import', taskId } }
  );
  const normalized = normalizedImport(raw, owned.profile.base_currency, sourceHash);
  const draftId = crypto.randomUUID();
  const costSummary = await usageSummary(req.user.id, { taskId });
  const payload = { sourceText, ...normalized };
  const inserted = await db.query(
    `INSERT INTO financial_import_drafts
      (id,user_id,thread_id,status,source_hash,model_version,cost_summary,private_payload)
     VALUES ($1,$2,$3,'DRAFT',$4,$5,$6::jsonb,$7) RETURNING *`,
    [draftId, req.user.id, owned.thread.id, sourceHash, config.aiModel, JSON.stringify(costSummary || {}), encryptFinancialPayload(payload)]
  );
  return ok(res, { draft: { id: inserted.rows[0].id, status: 'DRAFT', ...payload }, duplicate: false, costSummary }, 'AI 只生成了待确认草稿，尚未计入台账');
}));

router.put('/plans/:threadId/ai-consent', asyncRoute(async (req, res) => {
  const owned = await requireProfile(req.user.id, req.params.threadId);
  if (owned.error) return fail(res, owned.error === 'thread' ? 404 : 409, owned.error === 'thread' ? '财务计划不存在' : '请先完成资金计划设置');
  const enabled = req.body.enabled === true;
  if (enabled && !config.financialAiImportEnabled) return fail(res, 503, '财务 AI 整理尚未开放');
  await db.query(
    `UPDATE financial_plan_profiles
        SET ai_processing_consent_at=CASE WHEN $3 THEN now() ELSE NULL END,
            ai_processing_consent_version=CASE WHEN $3 THEN $4 ELSE NULL END,
            updated_at=now()
      WHERE user_id=$1 AND thread_id=$2`,
    [req.user.id, owned.thread.id, enabled, AI_PRIVACY_NOTICE_VERSION]
  );
  return ok(res, { enabled, noticeVersion: enabled ? AI_PRIVACY_NOTICE_VERSION : null }, enabled ? '已授权财务 AI 文本整理' : '已撤回财务 AI 文本处理授权');
}));

router.post('/plans/:threadId/import-drafts/:draftId/confirm', asyncRoute(async (req, res) => {
  const draftId = uuid(req.params.draftId);
  const accepted = Array.isArray(req.body.candidateIds) ? req.body.candidateIds.map(String) : [];
  if (!draftId || !accepted.length) return fail(res, 400, '请至少选择一条确认记录');
  const result = await db.transaction(async client => {
    const owned = await requireProfile(req.user.id, req.params.threadId, { queryable: client, lock: true });
    if (owned.error) return owned;
    const draftResult = await client.query(
      `SELECT * FROM financial_import_drafts
        WHERE id=$1 AND user_id=$2 AND thread_id=$3 FOR UPDATE`,
      [draftId, req.user.id, owned.thread.id]
    );
    const draft = draftResult.rows[0];
    if (!draft || draft.status !== 'DRAFT') return { error: 'draft' };
    const payload = decrypt(draft);
    const candidates = (payload.candidates || []).filter(item => accepted.includes(item.id));
    let inserted = 0;
    for (const item of candidates) {
      const idempotency = `import:${draft.id}:${item.id}`;
      if (item.kind === 'RECORD') {
        const normalized = recordInput({ ...item, occurredOn: item.occurredOn, amount: item.amount });
        if (!normalized) continue;
        const recordStatus = normalized.recordType === 'UNCERTAIN' ? 'DRAFT' : 'CONFIRMED';
        const saved = await client.query(
          `INSERT INTO financial_records
            (id,user_id,thread_id,record_type,occurred_on,currency,status,source_kind,source_ref,idempotency_key,private_payload,confirmed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$10,'IMPORT',$7,$8,$9,CASE WHEN $10='CONFIRMED' THEN now() ELSE NULL END)
           ON CONFLICT (user_id,thread_id,idempotency_key) DO NOTHING`,
          [crypto.randomUUID(), req.user.id, owned.thread.id, normalized.recordType, normalized.occurredOn,
            normalized.currency, `AI导入草稿 ${draft.id}`, idempotency, encryptFinancialPayload(normalized.payload), recordStatus]
        );
        inserted += saved.rowCount;
      }
      if (item.kind === 'SNAPSHOT') {
        const normalized = snapshotInput({ ...item, valuedOn: item.valuedOn, amount: item.amount, snapshotKind: 'PLAN_TOTAL' });
        if (!normalized) continue;
        const saved = await client.query(
          `INSERT INTO financial_snapshots
            (id,user_id,thread_id,snapshot_kind,valued_on,currency,status,source_kind,source_ref,idempotency_key,private_payload,confirmed_at)
           VALUES ($1,$2,$3,$4,$5,$6,'CONFIRMED','IMPORT',$7,$8,$9,now())
           ON CONFLICT (user_id,thread_id,idempotency_key) DO NOTHING`,
          [crypto.randomUUID(), req.user.id, owned.thread.id, normalized.snapshotKind, normalized.valuedOn,
            normalized.currency, `AI导入草稿 ${draft.id}`, idempotency, encryptFinancialPayload(normalized.payload)]
        );
        inserted += saved.rowCount;
      }
      if (item.kind === 'HOLDING') {
        const normalized = holdingInput({ ...item, valuedOn: item.valuedOn, amount: item.amount, classificationStatus: 'UNVERIFIED' });
        if (!normalized) continue;
        const saved = await client.query(
          `INSERT INTO financial_holdings
            (id,user_id,thread_id,valued_on,currency,status,classification_status,source_kind,source_ref,holding_key,idempotency_key,private_payload,confirmed_at)
           VALUES ($1,$2,$3,$4,$5,'CONFIRMED',$6,'IMPORT',$7,$8,$9,$10,now())
           ON CONFLICT (user_id,thread_id,idempotency_key) DO NOTHING`,
          [crypto.randomUUID(), req.user.id, owned.thread.id, normalized.valuedOn, normalized.currency,
            normalized.classificationStatus, draft.id, normalized.holdingKey, idempotency, encryptFinancialPayload(normalized.payload)]
        );
        inserted += saved.rowCount;
      }
    }
    await client.query(
      `UPDATE financial_import_drafts SET status='CONFIRMED',confirmed_at=now(),updated_at=now()
        WHERE id=$1`,
      [draft.id]
    );
    return { inserted };
  });
  if (result.error === 'thread') return fail(res, 404, '财务计划不存在');
  if (result.error === 'profile') return fail(res, 409, '请先完成资金计划设置');
  if (result.error) return fail(res, 409, '这份导入草稿已经处理或不存在');
  return ok(res, { inserted: result.inserted }, `已确认 ${result.inserted} 条记录`);
}));

router.get('/plans/:threadId/export', asyncRoute(async (req, res) => {
  const data = await planData(req.user.id, req.params.threadId);
  if (!data) return fail(res, 404, '财务计划不存在');
  const [recordHistory, snapshotHistory, holdingHistory, importDraftHistory] = await Promise.all([
    db.query('SELECT * FROM financial_records WHERE user_id=$1 AND thread_id=$2 ORDER BY occurred_on,created_at', [req.user.id, data.thread.id]),
    db.query('SELECT * FROM financial_snapshots WHERE user_id=$1 AND thread_id=$2 ORDER BY valued_on,created_at', [req.user.id, data.thread.id]),
    db.query('SELECT * FROM financial_holdings WHERE user_id=$1 AND thread_id=$2 ORDER BY valued_on,created_at', [req.user.id, data.thread.id]),
    db.query('SELECT * FROM financial_import_drafts WHERE user_id=$1 AND thread_id=$2 ORDER BY created_at', [req.user.id, data.thread.id])
  ]);
  return ok(res, {
    format: 'shroom-financial-ledger-v2',
    exportedAt: new Date().toISOString(),
    ...data,
    auditTrail: {
      records: recordHistory.rows.map(mapRecord),
      snapshots: snapshotHistory.rows.map(mapSnapshot),
      holdings: holdingHistory.rows.map(mapHolding),
      importDrafts: importDraftHistory.rows.map(row => ({
        id: row.id,
        status: row.status,
        sourceHash: row.source_hash,
        modelVersion: row.model_version,
        costSummary: row.cost_summary,
        ...decrypt(row),
        confirmedAt: row.confirmed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    }
  });
}));

router.delete('/plans/:threadId/data', asyncRoute(async (req, res) => {
  const owned = await ownedFinancialThread(req.user.id, req.params.threadId);
  if (!owned) return fail(res, 404, '财务计划不存在');
  if (req.body.confirmText !== '删除财务台账') return fail(res, 400, '请输入“删除财务台账”确认');
  const result = await db.query(
    'DELETE FROM financial_plan_profiles WHERE user_id=$1 AND thread_id=$2',
    [req.user.id, owned.id]
  );
  return ok(res, { deleted: result.rowCount > 0 }, result.rowCount ? '财务台账及其草稿、摘要和历史已删除' : '没有需要删除的财务台账');
}));

module.exports = router;
