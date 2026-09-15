'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { callJson, isAiConfigured } = require('../ai-engine');
const { usageSummary } = require('../ai-usage');
const { asyncRoute, fail, ok, pageParams, requireUser, text } = require('../http');
const { SECTIONS } = require('../life-os-long-term');
const { CATALOG_VERSION, archetypeByKey, listArchetypes } = require('../compound-archetypes');
const { normalizeYogaSelection, presentYogaPractice, shanghaiDate } = require('../compound-system');
const { signPrivateObjectUrl } = require('../media-storage');
const { requireFeature } = require('../billing-store');
const {
  FINANCIAL_COMPOUND_POLICY_VERSION,
  SAFE_FINANCIAL_ASSISTANCE,
  containsFinancialSecret,
  containsRestrictedFinancialGuidance,
  financialPrompt,
  isFinancialCompound,
  redactFinancialSecrets
} = require('../financial-compound-policy');
const {
  ACCUMULATION_TYPES,
  BLOCKER_PROMPT,
  CONTINUE_PROMPT,
  DIARY_REVIEW_PROMPT,
  RESULT_PROMPT,
  RESULT_STATES,
  STAGE_REVIEW_PROMPT,
  STARTER_PROMPT,
  modeForItem,
  normalizeBlocker,
  normalizeContinuation,
  normalizeDiaryReview,
  normalizeResultDraft,
  normalizeStageReview,
  normalizeStarter
} = require('../compound-progress');

const router = express.Router();
router.use(requireUser);
router.use(requireFeature('compound'));

function uuid(value) {
  const id = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function stableKey(value) {
  const key = String(value || '');
  return /^(0[1-9]|1\d|20)$/.test(key) ? key : null;
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function boundedNumber(value, min, max, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function textList(value, maxItems = 8, maxLength = 300) {
  const source = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return source.map(item => text(typeof item === 'string' ? item : item?.title, maxLength))
    .filter(Boolean).slice(0, maxItems);
}

function weekActions(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return source.map((item, index) => {
    const sourceItem = typeof item === 'string' ? { title: item } : (item || {});
    const title = text(sourceItem.title, 300);
    if (!title) return null;
    return {
      id: text(sourceItem.id, 80) || `action-${index + 1}`,
      title,
      plannedMinutes: Math.round(boundedNumber(sourceItem.plannedMinutes, 0, 10080, 0)),
      completed: sourceItem.completed === true
    };
  }).filter(Boolean).slice(0, 5);
}

function selectedYogaSegments(note) {
  try {
    const parsed = JSON.parse(String(note || '{}'));
    return normalizeYogaSelection(parsed.segmentIds).segmentIds;
  } catch (_) {
    return [];
  }
}

function mapDirection(row) {
  return {
    id: row.id,
    stableKey: row.stable_key,
    section: row.section,
    name: row.name,
    description: row.description || '',
    minimumAction: row.minimum_action || '',
    currentNextStep: row.current_next_step || '',
    status: row.status,
    progressMode: modeForItem(row.stable_key),
    relatedRecordCount: Number(row.related_record_count || 0),
    isWeekFocus: Boolean(row.is_week_focus),
    hasActiveThread: Boolean(row.has_active_thread)
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    kind: row.kind,
    status: row.status,
    actor: row.actor,
    inputText: row.input_text || '',
    summary: row.summary || '',
    payload: row.payload || {},
    mediaIds: Array.isArray(row.media_ids) ? row.media_ids : [],
    sourceDiaryId: row.source_diary_id,
    sourceLinkId: row.source_link_id,
    sourceValid: Boolean(row.source_valid),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapThread(row, events = []) {
  const metricTarget = Number(row.leading_metric_target || 0);
  const metricCurrent = Number(row.leading_metric_current || 0);
  const principalTarget = Number(row.principal_metric_target || 0);
  const principalCurrent = Number(row.principal_metric_current || 0);
  const returnTarget = Number(row.return_metric_target || 0);
  const returnCurrent = Number(row.return_metric_current || 0);
  const plannedMinutes = Number(row.week_planned_minutes || 0);
  const actualMinutes = Number(row.week_actual_minutes || 0);
  return {
    id: row.id,
    itemId: row.item_id,
    itemKey: row.stable_key || null,
    itemName: row.item_name || row.title,
    section: row.section || '',
    archetypeKey: row.archetype_key || 'legacy_direction',
    archetypeVersion: row.archetype_version || 'legacy-v1',
    archetype: archetypeByKey(row.archetype_key),
    investmentKind: row.investment_kind || 'GROWTH',
    principalDefinition: row.principal_definition || '',
    returnDefinition: row.return_definition || '',
    reinvestmentDefinition: row.reinvestment_definition || '',
    validation: {
      status: row.validation_status || 'VALIDATING',
      startedAt: dateOnly(row.validation_started_at),
      dueAt: dateOnly(row.validation_due_at),
      note: row.validation_note || ''
    },
    principalMetric: {
      name: row.principal_metric_name || '',
      target: principalTarget,
      current: principalCurrent,
      progressPercent: principalTarget > 0 ? Math.min(100, Math.round(principalCurrent / principalTarget * 100)) : null
    },
    returnMetric: {
      name: row.return_metric_name || '',
      target: returnTarget,
      current: returnCurrent,
      progressPercent: returnTarget > 0 ? Math.min(100, Math.round(returnCurrent / returnTarget * 100)) : null
    },
    progressMode: row.progress_mode,
    title: row.title || row.item_name,
    cycleStart: dateOnly(row.cycle_start),
    cycleEnd: dateOnly(row.cycle_end),
    compoundMechanism: row.compound_mechanism || '',
    weeklyTimeBudgetMinutes: Number(row.weekly_time_budget_minutes || 0),
    leadingMetric: {
      name: row.leading_metric_name || '',
      target: metricTarget,
      current: metricCurrent,
      progressPercent: metricTarget > 0 ? Math.min(100, Math.round(metricCurrent / metricTarget * 100)) : null
    },
    outcomeEvidence: row.outcome_evidence || '',
    currentMilestone: row.current_milestone || '',
    stopList: Array.isArray(row.stop_list) ? row.stop_list : [],
    planVersion: Number(row.plan_version || 1),
    week: {
      weekStart: dateOnly(row.week_start),
      plannedMinutes,
      actualMinutes,
      utilizationPercent: plannedMinutes > 0 ? Math.round(actualMinutes / plannedMinutes * 100) : 0,
      actions: Array.isArray(row.week_actions) ? row.week_actions : [],
      stopList: Array.isArray(row.week_stop_list) ? row.week_stop_list : []
    },
    desiredOutcome: row.desired_outcome || '',
    contextSummary: row.context_summary || '',
    lastCompleted: row.last_completed || '',
    currentStep: row.current_step || '',
    blockerSummary: row.blocker_summary || '',
    status: row.status,
    isPrimary: Boolean(row.is_primary),
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    pausedAt: row.paused_at,
    endedAt: row.ended_at,
    recentEvents: events.map(mapEvent)
  };
}

function mapDiarySuggestion(row) {
  return {
    linkId: row.link_id,
    diaryId: row.diary_id,
    threadId: row.thread_id,
    itemKey: row.stable_key,
    itemName: row.item_name,
    sourceDate: row.source_date,
    recordType: row.record_type,
    evidenceExcerpt: row.evidence_excerpt || '',
    summary: row.summary || '',
    suggestedNextStep: row.suggested_next_step || ''
  };
}

function mapReview(row) {
  return {
    id: row.id,
    scopeStart: String(row.scope_start).slice(0, 10),
    scopeEnd: String(row.scope_end).slice(0, 10),
    status: row.status,
    result: row.result || {},
    sourceRefs: row.source_refs || [],
    modelVersion: row.model_version || '',
    costSummary: row.cost_summary || {},
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function directionsFor(userId) {
  const result = await db.query(
    `SELECT i.*,
            EXISTS (SELECT 1 FROM life_os_week_focus f
              WHERE f.user_id = i.user_id AND f.item_id = i.id
                AND f.week_start <= current_date AND f.week_start + 7 > current_date) AS is_week_focus,
            EXISTS (SELECT 1 FROM compound_threads t
              WHERE t.user_id = i.user_id AND t.item_id = i.id AND t.status = 'ACTIVE') AS has_active_thread,
            (SELECT count(*)::int FROM life_os_item_links l
              WHERE l.user_id = i.user_id AND l.item_id = i.id
                AND l.status = 'ACTIVE' AND l.source_valid) AS related_record_count
       FROM life_os_items i
      WHERE i.user_id = $1
      ORDER BY is_week_focus DESC, has_active_thread DESC, related_record_count DESC,
               i.priority, i.original_number`,
    [userId]
  );
  return result.rows;
}

async function eventsFor(threadId, limit = 20) {
  const result = await db.query(
    `SELECT * FROM compound_events WHERE thread_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [threadId, limit]
  );
  return result.rows;
}

async function ownedThread(userId, threadId, options = {}) {
  const id = uuid(threadId);
  if (!id) return null;
  // A new archetype-backed plan has no Life OS item. Lock only the owned
  // thread row; PostgreSQL cannot lock the nullable side of this LEFT JOIN.
  const lock = options.lock ? ' FOR UPDATE OF t' : '';
  const queryable = options.queryable || db;
  const result = await queryable.query(
    `SELECT t.*, i.stable_key, i.name AS item_name, i.section,
            i.description AS item_description, i.minimum_action
       FROM compound_threads t
       LEFT JOIN life_os_items i ON i.id = t.item_id AND i.user_id = t.user_id
      WHERE t.id = $1 AND t.user_id = $2${lock}`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function contextFor(userId, itemId, threadId = null) {
  const [links, refs, principles, events] = await Promise.all([
    itemId ? db.query(
      `SELECT l.id, l.record_type, l.evidence_excerpt, l.summary, l.suggested_next_step,
              to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
         FROM life_os_item_links l
         JOIN diaries d ON d.id = l.diary_id AND d.user_id = l.user_id AND d.deleted_at IS NULL
        WHERE l.user_id = $1 AND l.item_id = $2 AND l.status = 'ACTIVE' AND l.source_valid
        ORDER BY d.occurred_at DESC LIMIT 8`,
      [userId, itemId]
    ) : Promise.resolve({ rows: [] }),
    itemId ? db.query(
      `SELECT ref_type, label, external_url FROM life_os_item_refs
        WHERE user_id = $1 AND item_id = $2 ORDER BY created_at DESC LIMIT 10`,
      [userId, itemId]
    ) : Promise.resolve({ rows: [] }),
    db.query(
      `SELECT statement, boundary FROM life_os_clauses
        WHERE user_id = $1 AND status = 'active' ORDER BY position LIMIT 12`,
      [userId]
    ),
    threadId ? db.query(
      `SELECT kind, status, actor, input_text, summary, payload, source_valid, created_at
         FROM compound_events WHERE user_id = $1 AND thread_id = $2
        ORDER BY created_at DESC LIMIT 20`,
      [userId, threadId]
    ) : Promise.resolve({ rows: [] })
  ]);
  return {
    relatedDiaryEvidence: links.rows,
    relatedMaterials: refs.rows,
    confirmedPrinciples: principles.rows,
    recentEvents: events.rows.reverse()
  };
}

async function principalOptionsFor(userId, limit = 20, threadId = null) {
  const result = await db.query(
    `SELECT e.id, e.summary, e.payload, e.created_at,
            i.stable_key, COALESCE(i.name, t.title) AS item_name
       FROM compound_events e
       JOIN compound_threads t ON t.id = e.thread_id AND t.user_id = e.user_id
       LEFT JOIN life_os_items i ON i.id = t.item_id AND i.user_id = e.user_id
      WHERE e.user_id = $1 AND e.kind = 'RESULT' AND e.status = 'CONFIRMED'
        AND e.payload->>'accumulationType' = 'PRINCIPAL'
        AND ($3::uuid IS NULL OR e.thread_id = $3)
      ORDER BY e.created_at DESC LIMIT $2`,
    [userId, limit, threadId]
  );
  return result.rows.map(row => ({
    id: row.id,
    name: row.payload?.accumulationName || row.payload?.actualResult || row.summary,
    itemKey: row.stable_key,
    itemName: row.item_name,
    createdAt: row.created_at
  }));
}

function financialPolicyMetadata(result) {
  if (!result.financialPolicyApplied) return undefined;
  return {
    type: 'PERSONAL_PLAN_AND_FACT_RECORDING_ONLY',
    version: FINANCIAL_COMPOUND_POLICY_VERSION,
    outputBlocked: result.policyBlocked === true
  };
}

async function aiOrFallback({ prompt, input, label, normalizer, fallback, usageContext, financial = false, policyFallback }) {
  const financialPolicyApplied = financial || isFinancialCompound(input?.thread);
  const safeInput = financialPolicyApplied ? redactFinancialSecrets(input) : input;
  if (!isAiConfigured()) {
    return { value: normalizer({}, fallback), usedAi: false, calledAi: false, financialPolicyApplied };
  }
  try {
    const raw = await callJson(financialPrompt(prompt, financialPolicyApplied), safeInput, label, {
      temperature: 0.2,
      maxTokens: 2200,
      usageContext: { ...(usageContext || {}), billable: true }
    });
    const value = normalizer(raw, fallback);
    if (financialPolicyApplied && containsRestrictedFinancialGuidance(value)) {
      console.warn('financial compound AI output blocked', { label, policyVersion: FINANCIAL_COMPOUND_POLICY_VERSION });
      return {
        value: policyFallback || normalizer({}, fallback),
        usedAi: false,
        calledAi: true,
        policyBlocked: true,
        financialPolicyApplied: true
      };
    }
    return { value, usedAi: true, calledAi: true, financialPolicyApplied };
  } catch (error) {
    if (String(error.code || '').startsWith('SHROOM_BILLING_')
      || ['SHROOM_BALANCE_INSUFFICIENT', 'SHROOM_AI_PRICING_UNAVAILABLE'].includes(error.code)) throw error;
    console.error('compound progress AI fallback', { label, code: error.code, message: error.message });
    return { value: normalizer({}, fallback), usedAi: false, calledAi: false, financialPolicyApplied };
  }
}

async function pickNextPrimary(client, userId) {
  const next = await client.query(
    `SELECT id FROM compound_threads
      WHERE user_id = $1 AND status = 'ACTIVE'
      ORDER BY last_activity_at DESC LIMIT 1`,
    [userId]
  );
  if (next.rowCount) await client.query('UPDATE compound_threads SET is_primary = true WHERE id = $1', [next.rows[0].id]);
}

router.get('/body-practice', asyncRoute(async (req, res) => {
  const today = shanghaiDate();
  const result = await db.query(
    `SELECT mode, duration_minutes, note, created_at, updated_at
       FROM compound_checkins
      WHERE user_id = $1 AND ritual_key = 'body' AND period_key = $2`,
    [req.user.id, today]
  );
  const checkin = result.rows[0] || null;
  return ok(res, {
    date: today,
    completed: Boolean(checkin),
    completedSegmentIds: checkin ? selectedYogaSegments(checkin.note) : [],
    durationMinutes: checkin ? Number(checkin.duration_minutes || 0) : 0,
    completedAt: checkin ? checkin.updated_at || checkin.created_at : null,
    practice: await presentYogaPractice(signPrivateObjectUrl)
  });
}));

router.post('/body-practice/check-in', asyncRoute(async (req, res) => {
  const selection = normalizeYogaSelection(req.body.segmentIds);
  if (!selection.segmentIds.length) return fail(res, 400, '请先完成至少一个动作的自主练习');
  const today = shanghaiDate();
  const note = JSON.stringify({ type: 'YOGA_SEGMENTS', version: 1, segmentIds: selection.segmentIds });
  await db.query(
    `INSERT INTO compound_checkins
       (id, user_id, ritual_key, period_key, checkin_date, mode, duration_minutes, note)
     VALUES ($1, $2, 'body', $3, $4, 'yoga_segments', $5, $6)
     ON CONFLICT (user_id, ritual_key, period_key) DO UPDATE
       SET mode = EXCLUDED.mode, duration_minutes = EXCLUDED.duration_minutes,
           note = EXCLUDED.note, updated_at = now()`,
    [crypto.randomUUID(), req.user.id, today, today, selection.durationMinutes, note]
  );
  return ok(res, {
    date: today,
    completed: true,
    completedSegmentIds: selection.segmentIds,
    durationMinutes: selection.durationMinutes,
    practice: await presentYogaPractice(signPrivateObjectUrl)
  }, '今天的自主练习已记录');
}));

router.delete('/body-practice/check-in', asyncRoute(async (req, res) => {
  const today = shanghaiDate();
  await db.query(
    `DELETE FROM compound_checkins
      WHERE user_id = $1 AND ritual_key = 'body' AND period_key = $2`,
    [req.user.id, today]
  );
  return ok(res, {
    date: today,
    completed: false,
    completedSegmentIds: [],
    durationMinutes: 0,
    practice: await presentYogaPractice(signPrivateObjectUrl)
  }, '今天的练习记录已撤销');
}));

router.get('/home', asyncRoute(async (req, res) => {
  const threadRows = await db.query(
    `SELECT t.*, i.stable_key, i.name AS item_name, i.section,
            wp.week_start, wp.planned_minutes AS week_planned_minutes,
            wp.actual_minutes AS week_actual_minutes,
            wp.actions AS week_actions, wp.stop_list AS week_stop_list
       FROM compound_threads t
       LEFT JOIN life_os_items i ON i.id = t.item_id AND i.user_id = t.user_id
       LEFT JOIN compound_week_plans wp ON wp.thread_id = t.id AND wp.user_id = t.user_id
        AND wp.week_start = date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai')::date
      WHERE t.user_id = $1 AND t.status = 'ACTIVE'
      ORDER BY t.is_primary DESC, t.last_activity_at DESC LIMIT 3`,
    [req.user.id]
  );
  const activeRows = threadRows.rows;
  const currentRow = activeRows[0] || null;
  const currentEvents = currentRow ? await eventsFor(currentRow.id, 12) : [];
  const pending = currentRow ? await db.query(
    `SELECT DISTINCT ON (d.id) l.id AS link_id, l.diary_id, l.record_type,
            l.evidence_excerpt, l.summary, l.suggested_next_step,
            t.id AS thread_id, i.stable_key, i.name AS item_name,
            to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
       FROM compound_threads t
       JOIN life_os_items i ON i.id = t.item_id AND i.user_id = t.user_id
       JOIN life_os_item_links l ON l.user_id = t.user_id AND l.item_id = t.item_id
       JOIN diaries d ON d.id = l.diary_id AND d.user_id = l.user_id AND d.deleted_at IS NULL
      WHERE t.id = $1 AND t.user_id = $2 AND t.status = 'ACTIVE'
        AND l.status = 'ACTIVE' AND l.source_valid
        AND NOT EXISTS (
          SELECT 1 FROM compound_events e
           WHERE e.thread_id = t.id AND e.source_diary_id = d.id AND e.kind = 'DIARY_REVIEW'
        )
      ORDER BY d.id, d.occurred_at DESC, l.created_at DESC LIMIT 3`,
    [currentRow.id, req.user.id]
  ) : { rows: [] };
  const recentResults = await db.query(
    `SELECT e.*, i.stable_key, COALESCE(i.name, t.title) AS item_name
       FROM compound_events e
       JOIN compound_threads t ON t.id = e.thread_id AND t.user_id = e.user_id
       LEFT JOIN life_os_items i ON i.id = t.item_id
      WHERE e.user_id = $1 AND e.kind = 'RESULT' AND e.status = 'CONFIRMED'
      ORDER BY e.created_at DESC LIMIT 6`,
    [req.user.id]
  );
  const latestReview = await db.query(
    `SELECT * FROM compound_reviews WHERE user_id = $1
      ORDER BY scope_end DESC, created_at DESC LIMIT 1`,
    [req.user.id]
  );
  const [principalOptions, compoundEvidence, quietToday, weekWindow] = await Promise.all([
    principalOptionsFor(req.user.id, 20),
    db.query(
      `SELECT p.id, p.summary, p.payload, p.created_at,
              i.stable_key, COALESCE(i.name, t.title) AS item_name,
              count(e.id)::int AS use_count,
              (count(e.id) FILTER (WHERE e.payload->>'accumulationType' = 'RETURN'))::int AS return_count,
              max(e.created_at) AS last_used_at
         FROM compound_events p
         JOIN compound_threads t ON t.id = p.thread_id AND t.user_id = p.user_id
         LEFT JOIN life_os_items i ON i.id = t.item_id AND i.user_id = p.user_id
         JOIN compound_events e ON e.user_id = p.user_id
          AND e.kind = 'RESULT' AND e.status = 'CONFIRMED'
          AND e.payload->>'principalEventId' = p.id::text
          AND e.payload->>'accumulationType' IN ('REUSE', 'RETURN')
        WHERE p.user_id = $1 AND p.kind = 'RESULT' AND p.status = 'CONFIRMED'
          AND p.payload->>'accumulationType' = 'PRINCIPAL'
        GROUP BY p.id, i.stable_key, i.name, t.title
        ORDER BY max(e.created_at) DESC LIMIT 6`,
      [req.user.id]
    ),
    db.query(
      `SELECT 1 FROM compound_events
        WHERE user_id = $1 AND kind = 'ADJUSTMENT' AND status = 'CONFIRMED'
          AND payload->>'action' = 'QUIET_DAY'
          AND payload->>'date' = $2
        LIMIT 1`,
      [req.user.id, shanghaiDate()]
    ),
    db.query(
      `SELECT to_char(date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai')::date, 'YYYY-MM-DD') AS week_start,
              to_char((date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai')::date + 6), 'YYYY-MM-DD') AS week_end`
    )
  ]);
  const plans = activeRows.map((row, index) => mapThread(row, index === 0 ? currentEvents : []));
  const weeklyPlans = plans.filter(plan => plan.archetypeKey !== 'financial_capital');
  const plannedMinutes = weeklyPlans.reduce((sum, plan) => sum + plan.week.plannedMinutes, 0);
  const actualMinutes = weeklyPlans.reduce((sum, plan) => sum + plan.week.actualMinutes, 0);
  return ok(res, {
    needsOnboarding: !currentRow,
    current: plans[0] || null,
    otherActive: plans.slice(1),
    plans,
    portfolio: {
      activeCount: plans.length,
      capacity: 3,
      weekStart: weekWindow.rows[0].week_start,
      weekEnd: weekWindow.rows[0].week_end,
      plannedMinutes,
      actualMinutes,
      utilizationPercent: plannedMinutes > 0 ? Math.round(actualMinutes / plannedMinutes * 100) : 0,
      unplannedCount: weeklyPlans.filter(plan => !plan.week.plannedMinutes || !plan.week.actions.length).length
    },
    diarySuggestions: pending.rows.map(mapDiarySuggestion),
    recentResults: recentResults.rows.map(row => ({ ...mapEvent(row), itemKey: row.stable_key, itemName: row.item_name })),
    principalOptions,
    compoundEvidence: compoundEvidence.rows.map(row => ({
      id: row.id,
      name: row.payload?.accumulationName || row.payload?.actualResult || row.summary,
      itemKey: row.stable_key,
      itemName: row.item_name,
      useCount: Number(row.use_count || 0),
      returnCount: Number(row.return_count || 0),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at
    })),
    quietToday: quietToday.rowCount > 0,
    archetypeCount: listArchetypes().length,
    catalogVersion: CATALOG_VERSION,
    directionCandidates: [],
    directionCount: 0,
    latestReview: latestReview.rowCount ? mapReview(latestReview.rows[0]) : null,
    privacy: '复利计划、时间配置、进度与回看仅本人可见，不进入发现。'
  });
}));

router.get('/archetypes', asyncRoute(async (req, res) => {
  const items = listArchetypes();
  return ok(res, {
    version: CATALOG_VERSION,
    growth: items.filter(item => item.kind === 'GROWTH'),
    protection: items.filter(item => item.kind === 'PROTECTION'),
    count: items.length,
    note: '原型是所有用户共享的产品知识；选择后生成的计划、时间和证据仅本人可见。'
  });
}));

router.get('/directions', asyncRoute(async (req, res) => {
  const directions = (await directionsFor(req.user.id)).map(mapDirection);
  return ok(res, {
    sections: SECTIONS.map(section => ({ section, items: directions.filter(item => item.section === section) })),
    count: directions.length
  });
}));

router.post('/starter', asyncRoute(async (req, res) => {
  const key = stableKey(req.body.itemKey);
  if (!key) return fail(res, 400, '请选择一个长期方向');
  const itemResult = await db.query(
    `SELECT * FROM life_os_items WHERE user_id = $1 AND stable_key = $2 AND status = 'ACTIVE'`,
    [req.user.id, key]
  );
  const item = itemResult.rows[0];
  if (!item) return fail(res, 404, '这个长期方向不存在或已暂停');
  const context = await contextFor(req.user.id, item.id);
  const taskId = crypto.randomUUID();
  const itemInput = { ...item, stableKey: item.stable_key, currentNextStep: item.current_next_step, minimumAction: item.minimum_action };
  const generated = await aiOrFallback({
    prompt: STARTER_PROMPT,
    input: { direction: itemInput, userNote: text(req.body.userNote, 1200), context },
    label: '复利系统·确定起步动作',
    normalizer: raw => normalizeStarter(raw, itemInput),
    fallback: itemInput,
    usageContext: { userId: req.user.id, feature: 'compound_starter', taskId }
  });
  return ok(res, {
    item: mapDirection(item),
    draft: generated.value,
    usedAi: generated.usedAi,
    costSummary: generated.usedAi ? await usageSummary(req.user.id, { taskId }) : null
  });
}));

router.post('/threads', asyncRoute(async (req, res) => {
  const key = stableKey(req.body.itemKey);
  const archetype = archetypeByKey(req.body.archetypeKey);
  const desiredOutcome = text(req.body.desiredOutcome, 1200);
  const currentStep = text(req.body.currentStep, 1000);
  if ((!key && !archetype) || !desiredOutcome || !currentStep) {
    return fail(res, 400, isFinancialCompound(archetype)
      ? '请选择财务本金复利，并确认长期目的和第一项核对行动'
      : '请选择一种复利原型，并确认 12 周结果和现在的最小一步');
  }
  const title = text(req.body.title, 240);
  const setup = archetype?.setup || {};
  const principalDefinition = text(req.body.principalDefinition, 1600)
    || text(req.body.compoundMechanism, 1600);
  const returnDefinition = text(req.body.returnDefinition, 1600)
    || text(setup.returnDefinition, 1600)
    || text(req.body.outcomeEvidence, 1600);
  const reinvestmentDefinition = text(req.body.reinvestmentDefinition, 1600)
    || text(setup.reinvestmentDefinition, 1600);
  const financialPlan = isFinancialCompound(archetype);
  const effectivePrincipalDefinition = principalDefinition
    || (financialPlan ? '计划范围将在私人台账中由用户确认' : '');
  if (archetype && (!title || !effectivePrincipalDefinition || !returnDefinition || !reinvestmentDefinition)) {
    return fail(res, 400, '请填写这项积累的名称，以及你准备持续投入什么');
  }
  const compoundMechanism = [effectivePrincipalDefinition, returnDefinition, reinvestmentDefinition].filter(Boolean).join('\n');
  const weeklyTimeBudgetMinutes = Math.round(boundedNumber(
    req.body.weeklyTimeBudgetMinutes,
    0,
    10080,
    Number(setup.weeklyTimeBudgetMinutes || 180)
  ));
  const principalMetricName = text(req.body.principalMetricName, 240)
    || text(req.body.leadingMetricName, 240)
    || archetype?.defaultPrincipalMetric || '';
  const principalMetricTarget = boundedNumber(
    req.body.principalMetricTarget === undefined ? req.body.leadingMetricTarget : req.body.principalMetricTarget,
    0, 1000000000, Number(setup.principalMetricTarget || 1)
  );
  const returnMetricName = text(req.body.returnMetricName, 240) || archetype?.defaultReturnMetric || '';
  const returnMetricTarget = boundedNumber(
    req.body.returnMetricTarget,
    0,
    1000000000,
    Number(setup.returnMetricTarget || 1)
  );
  const outcomeEvidence = text(req.body.outcomeEvidence, 1600) || desiredOutcome;
  const currentMilestone = text(req.body.currentMilestone, 1200)
    || text(setup.currentMilestone, 1200)
    || desiredOutcome;
  const stopList = textList(req.body.stopList, 8, 300);
  const cycleStart = dateOnly(req.body.cycleStart);
  const cycleEnd = dateOnly(req.body.cycleEnd);
  if (cycleStart && cycleEnd && cycleEnd < cycleStart) return fail(res, 400, '周期结束日期不能早于开始日期');
  if (isFinancialCompound(archetype) && req.body.financialBoundaryAccepted !== true) {
    return fail(res, 400, '请先确认财务计划的风险与服务边界');
  }
  if (isFinancialCompound(archetype) && containsFinancialSecret({
    title,
    desiredOutcome,
    principalDefinition: effectivePrincipalDefinition,
    returnDefinition,
    reinvestmentDefinition,
    outcomeEvidence,
    currentMilestone,
    currentStep,
    stopList
  })) {
    return fail(res, 400, '请删除银行或证券账户、卡号、密码、验证码等敏感信息后再保存');
  }
  const created = await db.transaction(async client => {
    let item = null;
    if (key) {
      const itemResult = await client.query(
        `SELECT * FROM life_os_items WHERE user_id = $1 AND stable_key = $2 AND status = 'ACTIVE' FOR UPDATE`,
        [req.user.id, key]
      );
      if (!itemResult.rowCount) return { error: 'item' };
      item = itemResult.rows[0];
      const existing = await client.query(
        `SELECT id FROM compound_threads WHERE user_id = $1 AND item_id = $2 AND status = 'ACTIVE'`,
        [req.user.id, item.id]
      );
      if (existing.rowCount) return { error: 'existing', id: existing.rows[0].id };
    }
    const count = await client.query(
      `SELECT count(*)::int AS count FROM compound_threads WHERE user_id = $1 AND status = 'ACTIVE'`,
      [req.user.id]
    );
    if (Number(count.rows[0].count) >= 3) return { error: 'limit' };
    await client.query(`UPDATE compound_threads SET is_primary = false WHERE user_id = $1 AND status = 'ACTIVE'`, [req.user.id]);
    const id = crypto.randomUUID();
    const inserted = await client.query(
      `INSERT INTO compound_threads
        (id, user_id, item_id, progress_mode, title, cycle_start, cycle_end,
         compound_mechanism, weekly_time_budget_minutes, leading_metric_name,
         leading_metric_target, outcome_evidence, current_milestone, stop_list,
         desired_outcome, context_summary, current_step, is_primary,
         archetype_key, archetype_version, investment_kind,
         principal_definition, return_definition, reinvestment_definition,
         validation_status, validation_started_at, validation_due_at,
         principal_metric_name, principal_metric_target,
         return_metric_name, return_metric_target)
       VALUES ($1, $2, $3, $4, $5,
         COALESCE($6::date, (now() AT TIME ZONE 'Asia/Shanghai')::date),
         COALESCE($7::date, COALESCE($6::date, (now() AT TIME ZONE 'Asia/Shanghai')::date) + 83),
         $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, true,
         $18, $19, $20, $21, $22, $23, 'VALIDATING',
         COALESCE($6::date, (now() AT TIME ZONE 'Asia/Shanghai')::date),
         COALESCE($6::date, (now() AT TIME ZONE 'Asia/Shanghai')::date) + 27,
         $24, $25, $26, $27)
       RETURNING *`,
      [id, req.user.id, item?.id || null, archetype?.kind === 'PROTECTION' ? 'MAINTENANCE' : (key ? modeForItem(key) : 'OUTCOME'),
        title || item?.name, cycleStart, cycleEnd,
        compoundMechanism, weeklyTimeBudgetMinutes, principalMetricName, principalMetricTarget,
        outcomeEvidence, currentMilestone, JSON.stringify(stopList), desiredOutcome,
        text(req.body.contextReason, 1200), currentStep,
        archetype?.key || 'legacy_direction', archetype?.version || 'legacy-v1', archetype?.kind || 'GROWTH',
        effectivePrincipalDefinition, returnDefinition, reinvestmentDefinition,
        principalMetricName, principalMetricTarget, returnMetricName, returnMetricTarget]
    );
    await client.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, input_text, summary, payload)
       VALUES ($1, $2, $3, 'START', 'CONFIRMED', 'USER', $4, $5, $6::jsonb)`,
      [crypto.randomUUID(), req.user.id, id, desiredOutcome, '确认建立复利计划', JSON.stringify({
        title: title || item?.name, desiredOutcome, compoundMechanism, weeklyTimeBudgetMinutes,
        archetypeKey: archetype?.key || 'legacy_direction', investmentKind: archetype?.kind || 'GROWTH',
        principalDefinition: effectivePrincipalDefinition, returnDefinition, reinvestmentDefinition,
        principalMetricName, principalMetricTarget, returnMetricName, returnMetricTarget,
        outcomeEvidence, currentMilestone, stopList, currentStep, cycleStart, cycleEnd,
        financialBoundary: isFinancialCompound(archetype) ? {
          accepted: true,
          version: FINANCIAL_COMPOUND_POLICY_VERSION,
          scope: 'PERSONAL_PLAN_AND_FACT_RECORDING_ONLY'
        } : undefined
      })]
    );
    if (item) {
      await client.query(
        `UPDATE life_os_items SET current_next_step = $3, updated_at = now()
          WHERE user_id = $1 AND id = $2`,
        [req.user.id, item.id, currentStep]
      );
    }
    return { row: { ...inserted.rows[0], stable_key: item?.stable_key || null, item_name: item?.name || title, section: item?.section || '' } };
  });
  if (created.error === 'item') return fail(res, 404, '长期方向不存在');
  if (created.error === 'existing') return fail(res, 409, '这个方向已经在推进，可以直接接着做', { threadId: created.id });
  if (created.error === 'limit') return fail(res, 400, '同时推进的事不超过 3 件；请先暂缓或结束一件');
  return ok(res, mapThread(created.row), '已建立一项待验证的复利计划');
}));

router.patch('/plans/:id', asyncRoute(async (req, res) => {
  const saved = await db.transaction(async client => {
    const thread = await ownedThread(req.user.id, req.params.id, { lock: true, queryable: client });
    if (!thread || thread.status !== 'ACTIVE') return { error: 'missing' };
    if (isFinancialCompound(thread)) return { error: 'financial_ledger' };
    const title = req.body.title === undefined ? thread.title : text(req.body.title, 240);
    const desiredOutcome = req.body.desiredOutcome === undefined ? thread.desired_outcome : text(req.body.desiredOutcome, 1200);
    const cycleStart = req.body.cycleStart === undefined ? dateOnly(thread.cycle_start) : dateOnly(req.body.cycleStart);
    const cycleEnd = req.body.cycleEnd === undefined ? dateOnly(thread.cycle_end) : dateOnly(req.body.cycleEnd);
    if (!title || !desiredOutcome || !cycleStart || !cycleEnd) return { error: 'required' };
    if (cycleEnd < cycleStart) return { error: 'dates' };
    const compoundMechanism = req.body.compoundMechanism === undefined
      ? thread.compound_mechanism : text(req.body.compoundMechanism, 1600);
    const principalDefinition = req.body.principalDefinition === undefined
      ? thread.principal_definition : text(req.body.principalDefinition, 1600);
    const returnDefinition = req.body.returnDefinition === undefined
      ? thread.return_definition : text(req.body.returnDefinition, 1600);
    const reinvestmentDefinition = req.body.reinvestmentDefinition === undefined
      ? thread.reinvestment_definition : text(req.body.reinvestmentDefinition, 1600);
    const weeklyTimeBudgetMinutes = req.body.weeklyTimeBudgetMinutes === undefined
      ? Number(thread.weekly_time_budget_minutes || 0)
      : Math.round(boundedNumber(req.body.weeklyTimeBudgetMinutes, 0, 10080, 0));
    const leadingMetricName = req.body.leadingMetricName === undefined
      ? thread.leading_metric_name : text(req.body.leadingMetricName, 240);
    const leadingMetricTarget = req.body.leadingMetricTarget === undefined
      ? Number(thread.leading_metric_target || 0)
      : boundedNumber(req.body.leadingMetricTarget, 0, 1000000000, 0);
    const principalMetricName = req.body.principalMetricName === undefined
      ? thread.principal_metric_name : text(req.body.principalMetricName, 240);
    const principalMetricTarget = req.body.principalMetricTarget === undefined
      ? Number(thread.principal_metric_target || 0)
      : boundedNumber(req.body.principalMetricTarget, 0, 1000000000, 0);
    const returnMetricName = req.body.returnMetricName === undefined
      ? thread.return_metric_name : text(req.body.returnMetricName, 240);
    const returnMetricTarget = req.body.returnMetricTarget === undefined
      ? Number(thread.return_metric_target || 0)
      : boundedNumber(req.body.returnMetricTarget, 0, 1000000000, 0);
    const outcomeEvidence = req.body.outcomeEvidence === undefined
      ? thread.outcome_evidence : text(req.body.outcomeEvidence, 1600);
    const currentMilestone = req.body.currentMilestone === undefined
      ? thread.current_milestone : text(req.body.currentMilestone, 1200);
    const currentStep = req.body.currentStep === undefined
      ? thread.current_step : text(req.body.currentStep, 1000);
    const stopList = req.body.stopList === undefined
      ? (Array.isArray(thread.stop_list) ? thread.stop_list : []) : textList(req.body.stopList, 8, 300);
    if (!currentStep || !principalDefinition || !returnDefinition || !reinvestmentDefinition) return { error: 'required' };
    if (isFinancialCompound(thread) && containsFinancialSecret({
      title,
      desiredOutcome,
      compoundMechanism,
      principalDefinition,
      returnDefinition,
      reinvestmentDefinition,
      outcomeEvidence,
      currentMilestone,
      currentStep,
      stopList
    })) return { error: 'financial_secret' };
    const result = await client.query(
      `UPDATE compound_threads SET title = $3, desired_outcome = $4,
         cycle_start = $5, cycle_end = $6, compound_mechanism = $7,
         weekly_time_budget_minutes = $8, leading_metric_name = $9,
         leading_metric_target = $10, outcome_evidence = $11,
         current_milestone = $12, current_step = $13, stop_list = $14::jsonb,
         principal_definition = $15, return_definition = $16,
         reinvestment_definition = $17, principal_metric_name = $18,
         principal_metric_target = $19, return_metric_name = $20,
         return_metric_target = $21,
         plan_version = plan_version + 1, updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [thread.id, req.user.id, title, desiredOutcome, cycleStart, cycleEnd,
        compoundMechanism, weeklyTimeBudgetMinutes, leadingMetricName,
        leadingMetricTarget, outcomeEvidence, currentMilestone, currentStep,
        JSON.stringify(stopList), principalDefinition, returnDefinition,
        reinvestmentDefinition, principalMetricName, principalMetricTarget,
        returnMetricName, returnMetricTarget]
    );
    await client.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, summary, payload)
       VALUES ($1, $2, $3, 'ADJUSTMENT', 'CONFIRMED', 'USER', $4, $5::jsonb)`,
      [crypto.randomUUID(), req.user.id, thread.id, '更新复利计划', JSON.stringify({
        action: 'PLAN_UPDATED', planVersion: Number(thread.plan_version || 1) + 1
      })]
    );
    return { row: { ...result.rows[0], stable_key: thread.stable_key, item_name: thread.item_name, section: thread.section } };
  });
  if (saved.error === 'missing') return fail(res, 404, '复利计划不存在');
  if (saved.error === 'financial_ledger') return fail(res, 409, '财务计划已使用独立资金台账，请在那里调整范围、期限和投入规则');
  if (saved.error === 'required') return fail(res, 400, '计划名称、周期目标、本金、回报、再投入和当前一步不能为空');
  if (saved.error === 'dates') return fail(res, 400, '周期结束日期不能早于开始日期');
  if (saved.error === 'financial_secret') return fail(res, 400, '请删除银行或证券账户、卡号、密码、验证码等敏感信息后再保存');
  return ok(res, mapThread(saved.row), '复利计划已更新');
}));

router.patch('/plans/:id/validation', asyncRoute(async (req, res) => {
  const requested = ['VALIDATING', 'COMPOUNDING', 'LINEAR', 'PROTECTION'].includes(req.body.status)
    ? req.body.status : null;
  const note = text(req.body.note, 1600);
  if (!requested) return fail(res, 400, '请选择一个可验证的当前判断');
  if (requested !== 'VALIDATING' && !note) return fail(res, 400, '请写下支持这个判断的真实证据');
  const saved = await db.transaction(async client => {
    const thread = await ownedThread(req.user.id, req.params.id, { lock: true, queryable: client });
    if (!thread || thread.status !== 'ACTIVE') return { error: 'missing' };
    if (isFinancialCompound(thread)) return { error: 'financial_ledger' };
    if (requested === 'PROTECTION' && thread.investment_kind !== 'PROTECTION') return { error: 'kind' };
    if (requested === 'COMPOUNDING') {
      const financialPlan = isFinancialCompound(thread);
      const evidence = await client.query(
        `SELECT 1 FROM compound_events
          WHERE user_id = $1 AND thread_id = $2 AND kind = 'RESULT' AND status = 'CONFIRMED'
            AND ($3::boolean = false AND payload->>'accumulationType' IN ('REUSE', 'RETURN')
              OR $3::boolean = true AND payload->>'accumulationType' = 'RETURN'
                AND NULLIF(payload->>'principalEventId', '') IS NOT NULL
                AND NULLIF(payload->>'actualResult', '') IS NOT NULL)
          LIMIT 1`,
        [req.user.id, thread.id, financialPlan]
      );
      if (!evidence.rowCount && (!financialPlan && Number(thread.return_metric_current || 0) <= 0)) {
        return { error: 'evidence', financialPlan };
      }
    }
    const updated = await client.query(
      `UPDATE compound_threads SET validation_status = $3, validation_note = $4,
         plan_version = plan_version + 1, updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [thread.id, req.user.id, requested, note]
    );
    await client.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, summary, payload)
       VALUES ($1, $2, $3, 'ADJUSTMENT', 'CONFIRMED', 'USER', $4, $5::jsonb)`,
      [crypto.randomUUID(), req.user.id, thread.id, '更新复利验证判断', JSON.stringify({
        action: 'VALIDATION_UPDATED', previousStatus: thread.validation_status,
        validationStatus: requested, note
      })]
    );
    return { row: { ...updated.rows[0], stable_key: thread.stable_key, item_name: thread.item_name, section: thread.section } };
  });
  if (saved.error === 'missing') return fail(res, 404, '复利计划不存在');
  if (saved.error === 'financial_ledger') return fail(res, 409, '财务计划不再使用“线性／复利已出现”判断，请查看计划、记录和资金表现');
  if (saved.error === 'kind') return fail(res, 400, '只有底盘保障原型可以确认为保障项');
  if (saved.error === 'evidence') return fail(res, 400, saved.financialPlan
    ? '还没有经你确认、关联既有本金的实际结果再投入记录，现在不能确认再投入机制已验证'
    : '还没有复用或回报证据，现在不能宣布复利已成立');
  if (saved.error === 'financial_secret') return fail(res, 400, '请删除账户、卡号、密码或验证码等敏感信息后再保存');
  return ok(res, mapThread(saved.row), '复利验证判断已更新');
}));

router.put('/plans/:id/week', asyncRoute(async (req, res) => {
  const thread = await ownedThread(req.user.id, req.params.id);
  if (!thread || thread.status !== 'ACTIVE') return fail(res, 404, '复利计划不存在');
  if (isFinancialCompound(thread)) return fail(res, 409, '财务计划改为按月核对、按季度回看，不再要求每周安排投入');
  const plannedMinutes = Math.round(boundedNumber(req.body.plannedMinutes, 0, 10080, thread.weekly_time_budget_minutes || 0));
  const actions = weekActions(req.body.actions);
  const stopList = textList(req.body.stopList, 8, 300);
  if (!plannedMinutes || !actions.length) return fail(res, 400, '请分配本周时间，并保留至少一个具体行动');
  if (isFinancialCompound(thread) && containsFinancialSecret({ actions, stopList })) {
    return fail(res, 400, '本周计划不需要账户、卡号、密码或验证码，请删除后再保存');
  }
  const result = await db.query(
    `INSERT INTO compound_week_plans
      (id, user_id, thread_id, week_start, planned_minutes, actions, stop_list)
     VALUES ($1, $2, $3, date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai')::date,
       $4, $5::jsonb, $6::jsonb)
     ON CONFLICT (user_id, thread_id, week_start) DO UPDATE SET
       planned_minutes = EXCLUDED.planned_minutes,
       actions = EXCLUDED.actions,
       stop_list = EXCLUDED.stop_list,
       updated_at = now()
     RETURNING *`,
    [crypto.randomUUID(), req.user.id, thread.id, plannedMinutes, JSON.stringify(actions), JSON.stringify(stopList)]
  );
  return ok(res, {
    weekStart: dateOnly(result.rows[0].week_start),
    plannedMinutes: Number(result.rows[0].planned_minutes || 0),
    actualMinutes: Number(result.rows[0].actual_minutes || 0),
    actions: result.rows[0].actions || [],
    stopList: result.rows[0].stop_list || []
  }, '本周时间与行动已安排');
}));

router.patch('/plans/:id/week/actions/:actionId', asyncRoute(async (req, res) => {
  const thread = await ownedThread(req.user.id, req.params.id);
  if (!thread || thread.status !== 'ACTIVE') return fail(res, 404, '复利计划不存在');
  if (isFinancialCompound(thread)) return fail(res, 409, '财务计划不再使用通用每周行动，请在资金台账中核对记录');
  const actionId = text(req.params.actionId, 80);
  const result = await db.transaction(async client => {
    const week = await client.query(
      `SELECT * FROM compound_week_plans
        WHERE user_id = $1 AND thread_id = $2
          AND week_start = date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai')::date
        FOR UPDATE`,
      [req.user.id, thread.id]
    );
    if (!week.rowCount) return { error: 'week' };
    const actions = weekActions(week.rows[0].actions);
    const target = actions.find(item => item.id === actionId);
    if (!target) return { error: 'action' };
    target.completed = req.body.completed === undefined ? !target.completed : req.body.completed === true;
    await client.query(
      `UPDATE compound_week_plans SET actions = $3::jsonb, updated_at = now()
        WHERE user_id = $1 AND id = $2`,
      [req.user.id, week.rows[0].id, JSON.stringify(actions)]
    );
    return { actions, action: target };
  });
  if (result.error === 'week') return fail(res, 404, '本周还没有安排');
  if (result.error === 'action') return fail(res, 404, '本周行动不存在');
  return ok(res, result, result.action.completed ? '已记为完成' : '已恢复为未完成');
}));

router.get('/threads/:id', asyncRoute(async (req, res) => {
  const thread = await ownedThread(req.user.id, req.params.id);
  if (!thread) return fail(res, 404, '推进记录不存在');
  return ok(res, mapThread(thread, await eventsFor(thread.id, 60)));
}));

router.post('/threads/:id/primary', asyncRoute(async (req, res) => {
  const changed = await db.transaction(async client => {
    const thread = await ownedThread(req.user.id, req.params.id, { lock: true, queryable: client });
    if (!thread || thread.status !== 'ACTIVE') return null;
    await client.query(`UPDATE compound_threads SET is_primary = false WHERE user_id = $1 AND status = 'ACTIVE'`, [req.user.id]);
    await client.query(`UPDATE compound_threads SET is_primary = true, updated_at = now() WHERE id = $1`, [thread.id]);
    return thread;
  });
  if (!changed) return fail(res, 404, '只能切换到正在推进的事');
  return ok(res, { id: changed.id }, '已切换，下次会从这件事接着做');
}));

router.delete('/threads/:id', asyncRoute(async (req, res) => {
  const confirmText = text(req.body.confirmText, 40);
  const confirmTitle = text(req.body.confirmTitle, 240);
  if (confirmText !== '永久删除复利计划') {
    return fail(res, 400, '请确认你理解删除后无法恢复');
  }
  const deleted = await db.transaction(async client => {
    const thread = await ownedThread(req.user.id, req.params.id, { lock: true, queryable: client });
    if (!thread) return { error: 'thread' };
    if (!confirmTitle || confirmTitle !== thread.title) return { error: 'title' };
    const result = await client.query(
      `DELETE FROM compound_threads
        WHERE id = $1 AND user_id = $2
        RETURNING id, title, archetype_key`,
      [thread.id, req.user.id]
    );
    await client.query(
      `UPDATE compound_threads SET is_primary = true, updated_at = now()
        WHERE id = (
          SELECT id FROM compound_threads
           WHERE user_id = $1 AND status = 'ACTIVE'
           ORDER BY last_activity_at DESC, created_at DESC LIMIT 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM compound_threads
           WHERE user_id = $1 AND status = 'ACTIVE' AND is_primary
        )`,
      [req.user.id]
    );
    return result.rows[0];
  });
  if (deleted.error === 'thread') return fail(res, 404, '复利计划不存在');
  if (deleted.error === 'title') return fail(res, 400, '请输入完整计划名称后再删除');
  return ok(res, { id: deleted.id, title: deleted.title }, '复利计划及其进度和专属数据已永久删除');
}));

router.post('/threads/:id/continue', asyncRoute(async (req, res) => {
  const thread = await ownedThread(req.user.id, req.params.id);
  if (!thread || thread.status !== 'ACTIVE') return fail(res, 404, '正在推进的事不存在');
  const context = await contextFor(req.user.id, thread.item_id, thread.id);
  const eventId = crypto.randomUUID();
  const intent = req.body.intent === 'EASIER' ? 'EASIER' : 'HELP';
  const userRequest = text(req.body.request, 1600);
  if (isFinancialCompound(thread) && containsFinancialSecret(userRequest)) {
    return fail(res, 400, '这里不需要账户、卡号、密码或验证码，请删除后再继续');
  }
  const fallback = {
    workMode: 'REAL_WORLD',
    assistance: `现在只推进这一步：${thread.current_step}`,
    currentStep: thread.current_step,
    completionCriteria: '完成后记录真实发生了什么。',
    neededInput: ''
  };
  const generated = await aiOrFallback({
    prompt: CONTINUE_PROMPT,
    input: { intent, thread, userRequest, context },
    label: intent === 'EASIER' ? '复利系统·让行动更容易' : '复利系统·按需协助',
    normalizer: raw => normalizeContinuation(raw, thread.current_step),
    fallback: thread.current_step,
    policyFallback: {
      workMode: 'REAL_WORLD',
      assistance: SAFE_FINANCIAL_ASSISTANCE,
      currentStep: '只核对并记录你自己的目标、期限、费用和已经发生的结果。',
      completionCriteria: '记录来自你自己的真实决定和已发生事实。',
      neededInput: '',
      easyVersions: [],
      rationale: { evidenceBasis: '', assumptions: '', omissions: '未评价具体投资产品、交易方式或未来收益。' }
    },
    usageContext: { userId: req.user.id, feature: 'compound_continue', taskId: eventId }
  });
  const value = generated.usedAi || generated.policyBlocked ? generated.value : fallback;
  const result = await db.query(
    `INSERT INTO compound_events
      (id, user_id, thread_id, kind, status, actor, input_text, summary, payload)
     VALUES ($1, $2, $3, 'CONTINUE', 'CONFIRMED', $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [eventId, req.user.id, thread.id, generated.usedAi ? 'AI' : 'SYSTEM',
      userRequest, value.assistance, JSON.stringify({ ...value, intent, financialPolicy: financialPolicyMetadata(generated) })]
  );
  return ok(res, {
    event: mapEvent(result.rows[0]),
    usedAi: generated.usedAi,
    costSummary: generated.calledAi ? await usageSummary(req.user.id, { taskId: eventId }) : null,
    financialPolicy: financialPolicyMetadata(generated)
  });
}));

router.post('/threads/:id/suggestions/:eventId/adopt', asyncRoute(async (req, res) => {
  const eventId = uuid(req.params.eventId);
  const requestedStep = text(req.body.currentStep, 1000);
  if (!eventId || !requestedStep) return fail(res, 400, '请选择要采用的下一步');
  const saved = await db.transaction(async client => {
    const thread = await ownedThread(req.user.id, req.params.id, { lock: true, queryable: client });
    if (!thread || thread.status !== 'ACTIVE') return { error: 'thread' };
    const eventResult = await client.query(
      `SELECT * FROM compound_events
        WHERE id = $1 AND user_id = $2 AND thread_id = $3
          AND kind IN ('CONTINUE', 'BLOCKER') AND status = 'CONFIRMED'`,
      [eventId, req.user.id, thread.id]
    );
    const event = eventResult.rows[0];
    if (!event) return { error: 'event' };
    const payload = event.payload || {};
    const allowedSteps = [payload.currentStep, payload.adjustedStep]
      .concat((Array.isArray(payload.easyVersions) ? payload.easyVersions : []).map(item => item?.step))
      .map(item => text(item, 1000)).filter(Boolean);
    if (!allowedSteps.includes(requestedStep)) return { error: 'step' };
    if (thread.current_step === requestedStep) return { currentStep: requestedStep, unchanged: true };
    await client.query(
      `UPDATE compound_threads SET current_step = $3, context_summary = $4,
         last_activity_at = now(), updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [thread.id, req.user.id, requestedStep, payload.assistance || event.summary]
    );
    if (thread.item_id) {
      await client.query(
        `UPDATE life_os_items SET current_next_step = $3, updated_at = now()
          WHERE user_id = $1 AND id = $2`,
        [req.user.id, thread.item_id, requestedStep]
      );
    }
    await client.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, summary, payload)
       VALUES ($1, $2, $3, 'ADJUSTMENT', 'CONFIRMED', 'USER', $4, $5::jsonb)`,
      [crypto.randomUUID(), req.user.id, thread.id, '采用建议的下一步', JSON.stringify({ sourceEventId: event.id, currentStep: requestedStep })]
    );
    return { currentStep: requestedStep };
  });
  if (saved.error === 'thread') return fail(res, 404, '正在推进的事不存在');
  if (saved.error === 'event') return fail(res, 404, '这次建议不存在');
  if (saved.error === 'step') return fail(res, 400, '只能采用这次建议中明确给出的行动');
  return ok(res, saved, '已由你确认并更新下一步');
}));

router.post('/quiet-day', asyncRoute(async (req, res) => {
  const today = shanghaiDate();
  const saved = await db.transaction(async client => {
    const threadResult = await client.query(
      `SELECT id FROM compound_threads
        WHERE user_id = $1 AND status = 'ACTIVE'
        ORDER BY is_primary DESC, last_activity_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (!threadResult.rowCount) return null;
    await client.query(
      `UPDATE compound_events SET status = 'DISMISSED', updated_at = now()
        WHERE user_id = $1 AND kind = 'ADJUSTMENT' AND status = 'CONFIRMED'
          AND payload->>'action' = 'QUIET_DAY' AND payload->>'date' = $2`,
      [req.user.id, today]
    );
    const event = await client.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, summary, payload)
       VALUES ($1, $2, $3, 'ADJUSTMENT', 'CONFIRMED', 'USER', '今天不推进', $4::jsonb)
       RETURNING *`,
      [crypto.randomUUID(), req.user.id, threadResult.rows[0].id, JSON.stringify({ action: 'QUIET_DAY', date: today })]
    );
    return event.rows[0];
  });
  if (!saved) return fail(res, 400, '现在没有需要暂停一天的主线');
  return ok(res, { date: today, quietToday: true }, '今天不再提醒推进，明天会保留原来的位置');
}));

router.delete('/quiet-day', asyncRoute(async (req, res) => {
  const today = shanghaiDate();
  await db.query(
    `UPDATE compound_events SET status = 'DISMISSED', updated_at = now()
      WHERE user_id = $1 AND kind = 'ADJUSTMENT' AND status = 'CONFIRMED'
        AND payload->>'action' = 'QUIET_DAY' AND payload->>'date' = $2`,
    [req.user.id, today]
  );
  return ok(res, { date: today, quietToday: false }, '今天可以继续，但仍不会自动行动');
}));

router.post('/threads/:id/blocker', asyncRoute(async (req, res) => {
  const blocker = text(req.body.blocker, 1800);
  if (!blocker) return fail(res, 400, '请先用一句话说明现在具体卡在哪里');
  const thread = await ownedThread(req.user.id, req.params.id);
  if (!thread || thread.status !== 'ACTIVE') return fail(res, 404, '正在推进的事不存在');
  if (isFinancialCompound(thread) && containsFinancialSecret(blocker)) {
    return fail(res, 400, '这里不需要账户、卡号、密码或验证码，请删除后再分析');
  }
  const context = await contextFor(req.user.id, thread.item_id, thread.id);
  const eventId = crypto.randomUUID();
  const generated = await aiOrFallback({
    prompt: BLOCKER_PROMPT,
    input: { thread, blocker, context },
    label: '复利系统·处理卡点',
    normalizer: raw => normalizeBlocker(raw, thread.current_step),
    fallback: thread.current_step,
    policyFallback: {
      obstacleType: 'DIRECTION_DOUBT',
      analysis: SAFE_FINANCIAL_ASSISTANCE,
      adjustedStep: '只核对并记录你自己的目标、期限、费用和已经发生的结果。',
      neededInput: '',
      recommendPause: false
    },
    usageContext: { userId: req.user.id, feature: 'compound_blocker', taskId: eventId }
  });
  const value = generated.value;
  const result = await db.transaction(async client => {
    const inserted = await client.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, input_text, summary, payload)
       VALUES ($1, $2, $3, 'BLOCKER', 'CONFIRMED', $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [eventId, req.user.id, thread.id, generated.usedAi ? 'AI' : 'SYSTEM',
        blocker, value.analysis, JSON.stringify({ ...value, financialPolicy: financialPolicyMetadata(generated) })]
    );
    await client.query(
      `UPDATE compound_threads SET blocker_summary = $3, context_summary = $4,
         last_activity_at = now(), updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [thread.id, req.user.id, blocker, value.analysis]
    );
    return inserted.rows[0];
  });
  return ok(res, {
    event: mapEvent(result),
    usedAi: generated.usedAi,
    costSummary: generated.calledAi ? await usageSummary(req.user.id, { taskId: eventId }) : null,
    financialPolicy: financialPolicyMetadata(generated)
  });
}));

async function ownedMediaIds(userId, rawIds) {
  const ids = [...new Set((Array.isArray(rawIds) ? rawIds : []).map(uuid).filter(Boolean))].slice(0, 9);
  if (!ids.length) return [];
  const result = await db.query(
    `SELECT id FROM media_assets WHERE user_id = $1 AND id::text = ANY($2::text[])`,
    [userId, ids]
  );
  return result.rows.map(row => row.id);
}

router.post('/threads/:id/results/draft', asyncRoute(async (req, res) => {
  const rawInput = text(req.body.text, 5000);
  const mediaIds = await ownedMediaIds(req.user.id, req.body.mediaIds);
  if (!rawInput && !mediaIds.length) return fail(res, 400, '用一句话、语音或附件说明发生了什么');
  const thread = await ownedThread(req.user.id, req.params.id);
  if (!thread || thread.status !== 'ACTIVE') return fail(res, 404, '正在推进的事不存在');
  if (isFinancialCompound(thread)) return fail(res, 409, '财务金额和结果必须进入可核对的资金台账，不能继续使用通用进展次数');
  const eventId = crypto.randomUUID();
  const [context, principalOptions] = await Promise.all([
    contextFor(req.user.id, thread.item_id, thread.id),
    principalOptionsFor(req.user.id, 20, isFinancialCompound(thread) ? thread.id : null)
  ]);
  const generated = await aiOrFallback({
    prompt: RESULT_PROMPT,
    input: {
      thread,
      userStatement: rawInput,
      attachmentCount: mediaIds.length,
      attachmentBoundary: '模型未读取附件内容，只知道用户上传了附件，不得猜测其内容。',
      principalOptions,
      context
    },
    label: '复利系统·整理实际结果',
    normalizer: raw => normalizeResultDraft(raw, rawInput, thread.current_step, { progressMode: thread.progress_mode }),
    fallback: thread.current_step,
    policyFallback: {
      state: 'UNVERIFIED',
      accumulationType: 'NECESSARY',
      accumulationName: '',
      principalEventId: '',
      classificationReason: '金融服务边界阻止了 AI 对这条记录作投资判断。',
      summary: '已保留你的原始记录，AI 未生成投资建议。',
      actualResult: '',
      progressSummary: '',
      nextStep: '由你核对并补充已经发生的客观结果。',
      uncertainty: '未评价具体投资产品、交易方式或未来收益。'
    },
    usageContext: { userId: req.user.id, feature: 'compound_result', taskId: eventId }
  });
  const draft = generated.value;
  const result = await db.transaction(async client => {
    await client.query(
      `UPDATE compound_events SET status = 'DISMISSED', updated_at = now()
        WHERE user_id = $1 AND thread_id = $2 AND kind = 'RESULT' AND status = 'DRAFT'`,
      [req.user.id, thread.id]
    );
    return client.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, input_text, summary, payload, media_ids)
       VALUES ($1, $2, $3, 'RESULT', 'DRAFT', $4, $5, $6, $7::jsonb, $8::jsonb)
       RETURNING *`,
      [eventId, req.user.id, thread.id, generated.usedAi ? 'AI' : 'SYSTEM',
        rawInput, draft.summary, JSON.stringify({ ...draft, rawInput, financialPolicy: financialPolicyMetadata(generated) }), JSON.stringify(mediaIds)]
    );
  });
  return ok(res, {
    event: mapEvent(result.rows[0]),
    principalOptions,
    usedAi: generated.usedAi,
    costSummary: generated.calledAi ? await usageSummary(req.user.id, { taskId: eventId }) : null,
    financialPolicy: financialPolicyMetadata(generated)
  });
}));

router.post('/threads/:id/results/:eventId/confirm', asyncRoute(async (req, res) => {
  const eventId = uuid(req.params.eventId);
  if (!eventId) return fail(res, 404, '结果草稿不存在');
  const confirmed = await db.transaction(async client => {
    const thread = await ownedThread(req.user.id, req.params.id, { lock: true, queryable: client });
    if (!thread || thread.status !== 'ACTIVE') return { error: 'thread' };
    if (isFinancialCompound(thread)) return { error: 'financial_ledger' };
    const draftResult = await client.query(
      `SELECT * FROM compound_events
        WHERE id = $1 AND user_id = $2 AND thread_id = $3 AND kind = 'RESULT' FOR UPDATE`,
      [eventId, req.user.id, thread.id]
    );
    const draft = draftResult.rows[0];
    if (!draft || draft.status !== 'DRAFT') return { error: 'draft' };
    const original = draft.payload || {};
    const state = RESULT_STATES.includes(req.body.state) ? req.body.state : original.state;
    const accumulationType = ACCUMULATION_TYPES.includes(req.body.accumulationType)
      ? req.body.accumulationType : original.accumulationType;
    const value = normalizeResultDraft({
      state,
      accumulationType,
      accumulationName: req.body.accumulationName === undefined ? original.accumulationName : req.body.accumulationName,
      principalEventId: req.body.principalEventId === undefined ? original.principalEventId : req.body.principalEventId,
      classificationReason: req.body.classificationReason === undefined ? original.classificationReason : req.body.classificationReason,
      summary: req.body.summary === undefined ? original.summary : req.body.summary,
      actualResult: req.body.actualResult === undefined ? original.actualResult : req.body.actualResult,
      progressSummary: req.body.progressSummary === undefined ? original.progressSummary : req.body.progressSummary,
      nextStep: req.body.nextStep === undefined ? original.nextStep : req.body.nextStep,
      uncertainty: req.body.uncertainty === undefined ? original.uncertainty : req.body.uncertainty
    }, original.rawInput || draft.input_text, thread.current_step, { progressMode: thread.progress_mode });
    if (value.state === 'PREPARING') value.accumulationType = 'NECESSARY';
    if (!['REUSE', 'RETURN'].includes(value.accumulationType)) value.principalEventId = '';
    if (value.accumulationType === 'RETURN' && (value.state !== 'EFFECTIVE' || !value.actualResult)) return { error: 'return' };
    if (value.accumulationType === 'PRINCIPAL') {
      value.accumulationName = value.accumulationName || value.actualResult || value.summary;
    } else {
      value.accumulationName = '';
    }
    if (['REUSE', 'RETURN'].includes(value.accumulationType)) {
      const principalId = uuid(value.principalEventId);
      if (!principalId) return { error: 'principal' };
      const principal = await client.query(
        `SELECT id FROM compound_events
          WHERE id = $1 AND user_id = $2 AND kind = 'RESULT' AND status = 'CONFIRMED'
            AND payload->>'accumulationType' = 'PRINCIPAL'
            AND ($3::boolean = false OR thread_id = $4)`,
        [principalId, req.user.id, isFinancialCompound(thread), thread.id]
      );
      if (!principal.rowCount) return { error: 'principal' };
      value.principalEventId = principalId;
    }
    const spentMinutes = value.state === 'PREPARING'
      ? 0 : Math.round(boundedNumber(req.body.spentMinutes, 0, 1440, 0));
    const leadingMetricDelta = value.state === 'PREPARING'
      ? 0 : boundedNumber(req.body.leadingMetricDelta, 0, 1000000000, 0);
    const principalMetricDelta = value.state === 'PREPARING'
      ? 0 : boundedNumber(req.body.principalMetricDelta, 0, 1000000000, 0);
    const returnMetricDelta = value.state === 'PREPARING'
      ? 0 : boundedNumber(req.body.returnMetricDelta, 0, 1000000000, 0);
    const weekActionId = text(req.body.weekActionId, 80);
    const closeMode = ['CONTINUE', 'PAUSE', 'END'].includes(req.body.closeMode) ? req.body.closeMode : 'CONTINUE';
    const updated = await client.query(
      `UPDATE compound_events SET status = 'CONFIRMED', actor = 'USER', summary = $4,
         payload = $5::jsonb, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND thread_id = $3 RETURNING *`,
      [eventId, req.user.id, thread.id, value.summary, JSON.stringify({
        ...value, rawInput: original.rawInput || draft.input_text,
        financialPolicy: original.financialPolicy, closeMode,
        spentMinutes, leadingMetricDelta, principalMetricDelta, returnMetricDelta, weekActionId
      })]
    );
    const nextStatus = closeMode === 'PAUSE' ? 'PAUSED' : (closeMode === 'END' ? 'ENDED' : 'ACTIVE');
    const completed = value.state === 'PREPARING' ? thread.last_completed : (value.actualResult || value.summary);
    await client.query(
      `UPDATE compound_threads SET last_completed = $3, current_step = $4,
         context_summary = $5, blocker_summary = '', status = $6::varchar,
         leading_metric_current = leading_metric_current + $7,
         principal_metric_current = principal_metric_current + $8,
         return_metric_current = return_metric_current + $9,
         is_primary = CASE WHEN $6::varchar = 'ACTIVE' THEN is_primary ELSE false END,
         paused_at = CASE WHEN $6::varchar = 'PAUSED' THEN now() ELSE paused_at END,
         ended_at = CASE WHEN $6::varchar = 'ENDED' THEN now() ELSE ended_at END,
         last_activity_at = now(), updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [thread.id, req.user.id, completed, value.nextStep, value.progressSummary || value.summary,
        nextStatus, leadingMetricDelta || principalMetricDelta, principalMetricDelta, returnMetricDelta]
    );
    if (spentMinutes > 0 || weekActionId) {
      const weekResult = await client.query(
        `SELECT * FROM compound_week_plans
          WHERE user_id = $1 AND thread_id = $2
            AND week_start = date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai')::date
          FOR UPDATE`,
        [req.user.id, thread.id]
      );
      if (weekResult.rowCount) {
        const week = weekResult.rows[0];
        const actions = weekActions(week.actions);
        const action = actions.find(item => item.id === weekActionId);
        if (action) action.completed = true;
        await client.query(
          `UPDATE compound_week_plans
              SET actual_minutes = LEAST(10080, actual_minutes + $3),
                  actions = $4::jsonb, updated_at = now()
            WHERE id = $1 AND user_id = $2`,
          [week.id, req.user.id, spentMinutes, JSON.stringify(actions)]
        );
      } else if (spentMinutes > 0) {
        await client.query(
          `INSERT INTO compound_week_plans
            (id, user_id, thread_id, week_start, planned_minutes, actual_minutes, actions)
           VALUES ($1, $2, $3,
             date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai')::date,
             $4, $5, '[]'::jsonb)`,
          [crypto.randomUUID(), req.user.id, thread.id,
            Math.min(10080, Number(thread.weekly_time_budget_minutes || 0)), spentMinutes]
        );
      }
    }
    if (nextStatus === 'ACTIVE') {
      if (thread.item_id) {
        await client.query(
          `UPDATE life_os_items SET current_next_step = $3, updated_at = now()
            WHERE user_id = $1 AND id = $2`,
          [req.user.id, thread.item_id, value.nextStep]
        );
      }
    } else if (thread.is_primary) {
      await pickNextPrimary(client, req.user.id);
    }
    if (closeMode !== 'CONTINUE') {
      await client.query(
        `INSERT INTO compound_events (id, user_id, thread_id, kind, status, actor, summary, payload)
         VALUES ($1, $2, $3, $4, 'CONFIRMED', 'USER', $5, '{}'::jsonb)`,
        [crypto.randomUUID(), req.user.id, thread.id, closeMode, closeMode === 'PAUSE' ? '明确暂缓' : '明确结束']
      );
    }
    return { row: updated.rows[0], nextStatus };
  });
  if (confirmed.error === 'thread') return fail(res, 404, '正在推进的事不存在');
  if (confirmed.error === 'financial_ledger') return fail(res, 409, '财务金额和结果必须进入可核对的资金台账');
  if (confirmed.error === 'draft') return fail(res, 400, '这份结果草稿已经处理');
  if (confirmed.error === 'return') return fail(res, 400, '记录回报需要确认已有效果，并写下可观察的实际变化');
  if (confirmed.error === 'principal') return fail(res, 400, '复用或回报必须关联一项属于你的已有积累');
  if (confirmed.error === 'financial_secret') return fail(res, 400, '请删除账户、卡号、密码或验证码等敏感信息后再确认');
  return ok(res, { event: mapEvent(confirmed.row), threadStatus: confirmed.nextStatus }, '结果已确认，下次可以从新位置接着做');
}));

router.post('/threads/:id/state', asyncRoute(async (req, res) => {
  const action = ['PAUSE', 'END', 'RESUME'].includes(req.body.action) ? req.body.action : null;
  if (!action) return fail(res, 400, '请选择暂缓、结束或继续');
  const saved = await db.transaction(async client => {
    const thread = await ownedThread(req.user.id, req.params.id, { lock: true, queryable: client });
    if (!thread) return { error: 'missing' };
    if (action === 'RESUME') {
      const count = await client.query(`SELECT count(*)::int AS count FROM compound_threads WHERE user_id = $1 AND status = 'ACTIVE'`, [req.user.id]);
      if (Number(count.rows[0].count) >= 3) return { error: 'limit' };
      const sameItem = await client.query(
        `SELECT id FROM compound_threads WHERE user_id = $1 AND item_id = $2 AND status = 'ACTIVE' AND id <> $3`,
        [req.user.id, thread.item_id, thread.id]
      );
      if (sameItem.rowCount) return { error: 'duplicate' };
      await client.query(`UPDATE compound_threads SET is_primary = false WHERE user_id = $1 AND status = 'ACTIVE'`, [req.user.id]);
      await client.query(
        `UPDATE compound_threads SET status = 'ACTIVE', is_primary = true, paused_at = null,
           ended_at = null, last_activity_at = now(), updated_at = now() WHERE id = $1`,
        [thread.id]
      );
    } else {
      const status = action === 'PAUSE' ? 'PAUSED' : 'ENDED';
      await client.query(
        `UPDATE compound_threads SET status = $2::varchar, is_primary = false,
           paused_at = CASE WHEN $2::varchar = 'PAUSED' THEN now() ELSE paused_at END,
           ended_at = CASE WHEN $2::varchar = 'ENDED' THEN now() ELSE ended_at END,
           last_activity_at = now(), updated_at = now() WHERE id = $1`,
        [thread.id, status]
      );
      if (thread.is_primary) await pickNextPrimary(client, req.user.id);
    }
    await client.query(
      `INSERT INTO compound_events (id, user_id, thread_id, kind, status, actor, summary, payload)
       VALUES ($1, $2, $3, $4, 'CONFIRMED', 'USER', $5, '{}'::jsonb)`,
      [crypto.randomUUID(), req.user.id, thread.id, action,
        action === 'PAUSE' ? '明确暂缓' : (action === 'END' ? '明确结束' : '恢复推进')]
    );
    return { id: thread.id, status: action === 'RESUME' ? 'ACTIVE' : (action === 'PAUSE' ? 'PAUSED' : 'ENDED') };
  });
  if (saved.error === 'missing') return fail(res, 404, '推进记录不存在');
  if (saved.error === 'limit') return fail(res, 400, '同时推进的事不超过 3 件');
  if (saved.error === 'duplicate') return fail(res, 400, '这个方向已有正在推进的记录');
  return ok(res, saved, '推进状态已更新');
}));

router.post('/threads/:id/diary-links/:linkId/review', asyncRoute(async (req, res) => {
  const thread = await ownedThread(req.user.id, req.params.id);
  const linkId = uuid(req.params.linkId);
  if (!thread || thread.status !== 'ACTIVE' || !linkId) return fail(res, 404, '相关日记或推进记录不存在');
  const linkResult = await db.query(
    `SELECT l.*, d.content, d.occurred_at
       FROM life_os_item_links l
       JOIN diaries d ON d.id = l.diary_id AND d.user_id = l.user_id AND d.deleted_at IS NULL
      WHERE l.id = $1 AND l.user_id = $2 AND l.item_id = $3
        AND l.status = 'ACTIVE' AND l.source_valid`,
    [linkId, req.user.id, thread.item_id]
  );
  const link = linkResult.rows[0];
  if (!link) return fail(res, 404, '日记关联已失效或已取消');
  const existing = await db.query(
    `SELECT * FROM compound_events
      WHERE user_id = $1 AND thread_id = $2 AND source_diary_id = $3 AND kind = 'DIARY_REVIEW'`,
    [req.user.id, thread.id, link.diary_id]
  );
  if (existing.rowCount) return ok(res, { event: mapEvent(existing.rows[0]), reused: true });
  const context = await contextFor(req.user.id, thread.item_id, thread.id);
  const eventId = crypto.randomUUID();
  const generated = await aiOrFallback({
    prompt: DIARY_REVIEW_PROMPT,
    input: {
      thread,
      diary: { content: link.content, occurredAt: link.occurred_at },
      linkedEvidence: { recordType: link.record_type, evidenceExcerpt: link.evidence_excerpt, summary: link.summary },
      context
    },
    label: '复利系统·回看相关日记',
    normalizer: raw => normalizeDiaryReview(raw, link.evidence_excerpt, thread.current_step),
    fallback: thread.current_step,
    policyFallback: {
      facts: [link.evidence_excerpt].filter(Boolean),
      inferences: [],
      previousMethodUsed: 'UNKNOWN',
      methodEffect: '未对具体投资产品、交易方式或未来收益作判断。',
      nextTry: '继续记录来自你自己的目标、费用和已经发生的客观结果。',
      neededQuestion: ''
    },
    usageContext: { userId: req.user.id, feature: 'compound_diary_review', diaryId: link.diary_id, taskId: eventId }
  });
  const result = await db.query(
    `INSERT INTO compound_events
      (id, user_id, thread_id, kind, status, actor, summary, payload, source_diary_id, source_link_id)
     VALUES ($1, $2, $3, 'DIARY_REVIEW', 'DRAFT', $4, $5, $6::jsonb, $7, $8)
     RETURNING *`,
    [eventId, req.user.id, thread.id, generated.usedAi ? 'AI' : 'SYSTEM',
      link.summary || link.evidence_excerpt,
      JSON.stringify({ ...generated.value, financialPolicy: financialPolicyMetadata(generated) }), link.diary_id, link.id]
  );
  return ok(res, {
    event: mapEvent(result.rows[0]),
    usedAi: generated.usedAi,
    costSummary: generated.calledAi ? await usageSummary(req.user.id, { taskId: eventId }) : null,
    financialPolicy: financialPolicyMetadata(generated)
  });
}));

router.post('/threads/:id/diary-reviews/:eventId/confirm', asyncRoute(async (req, res) => {
  const eventId = uuid(req.params.eventId);
  if (!eventId) return fail(res, 404, '回看草稿不存在');
  const saved = await db.transaction(async client => {
    const thread = await ownedThread(req.user.id, req.params.id, { lock: true, queryable: client });
    if (!thread || thread.status !== 'ACTIVE') return null;
    if (isFinancialCompound(thread) && containsFinancialSecret(req.body)) return { error: 'financial_secret' };
    const eventResult = await client.query(
      `SELECT * FROM compound_events WHERE id = $1 AND user_id = $2 AND thread_id = $3
        AND kind = 'DIARY_REVIEW' FOR UPDATE`,
      [eventId, req.user.id, thread.id]
    );
    const event = eventResult.rows[0];
    if (!event || event.status !== 'DRAFT' || !event.source_valid) return null;
    const original = event.payload || {};
    const value = normalizeDiaryReview({
      facts: req.body.facts === undefined ? original.facts : req.body.facts,
      inferences: req.body.inferences === undefined ? original.inferences : req.body.inferences,
      previousMethodUsed: req.body.previousMethodUsed || original.previousMethodUsed,
      methodEffect: req.body.methodEffect === undefined ? original.methodEffect : req.body.methodEffect,
      nextTry: req.body.nextTry === undefined ? original.nextTry : req.body.nextTry,
      neededQuestion: req.body.neededQuestion === undefined ? original.neededQuestion : req.body.neededQuestion
    }, event.summary, thread.current_step);
    const updated = await client.query(
      `UPDATE compound_events SET status = 'CONFIRMED', actor = 'USER', payload = $4::jsonb,
         summary = $5, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND thread_id = $3 RETURNING *`,
      [event.id, req.user.id, thread.id,
        JSON.stringify({ ...value, financialPolicy: original.financialPolicy }), value.facts.join('；')]
    );
    await client.query(
      `UPDATE compound_threads SET current_step = $3, context_summary = $4,
         last_activity_at = now(), updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [thread.id, req.user.id, value.nextTry, value.methodEffect || value.facts.join('；')]
    );
    await client.query(
      `UPDATE life_os_item_links SET user_confirmed = true, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [event.source_link_id, req.user.id]
    );
    return updated.rows[0];
  });
  if (!saved) return fail(res, 400, '回看草稿已处理或日记来源已失效');
  if (saved.error === 'financial_secret') return fail(res, 400, '请删除账户、卡号、密码或验证码等敏感信息后再确认');
  return ok(res, mapEvent(saved), '这次回看已接入当前推进，下次会检查新方法');
}));

router.post('/threads/:id/diary-links/:linkId/dismiss', asyncRoute(async (req, res) => {
  const thread = await ownedThread(req.user.id, req.params.id);
  const linkId = uuid(req.params.linkId);
  if (!thread || !linkId) return fail(res, 404, '相关日记或推进记录不存在');
  const link = await db.query(
    `SELECT * FROM life_os_item_links WHERE id = $1 AND user_id = $2 AND item_id = $3`,
    [linkId, req.user.id, thread.item_id]
  );
  if (!link.rowCount) return fail(res, 404, '日记关联不存在');
  await db.transaction(async client => {
    await client.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, summary, source_diary_id, source_link_id)
       VALUES ($1, $2, $3, 'DIARY_REVIEW', 'DISMISSED', 'USER', '忽略这次关联', $4, $5)
       ON CONFLICT (thread_id, source_diary_id, kind)
         WHERE source_diary_id IS NOT NULL AND kind = 'DIARY_REVIEW' DO NOTHING`,
      [crypto.randomUUID(), req.user.id, thread.id, link.rows[0].diary_id, linkId]
    );
    await client.query(
      `UPDATE life_os_item_links SET status = 'REMOVED', user_confirmed = true, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [linkId, req.user.id]
    );
  });
  return ok(res, { linkId }, '已忽略，不会再把这篇日记推进到这件事');
}));

async function reviewSources(userId, scopeStart, scopeEnd) {
  const result = await db.query(
    `SELECT e.id, e.kind, e.summary, e.payload, e.source_diary_id, e.source_valid,
            e.created_at, i.stable_key, COALESCE(i.name, t.title) AS item_name,
            t.progress_mode, t.archetype_key
       FROM compound_events e
       JOIN compound_threads t ON t.id = e.thread_id AND t.user_id = e.user_id
       LEFT JOIN life_os_items i ON i.id = t.item_id
      WHERE e.user_id = $1 AND e.status = 'CONFIRMED'
        AND e.created_at >= $2::date
        AND e.created_at < ($3::date + 1)
        AND (e.source_diary_id IS NULL OR e.source_valid)
      ORDER BY e.created_at`,
    [userId, scopeStart, scopeEnd]
  );
  return result.rows.map((row, index) => ({
    sourceKey: `E${index + 1}`,
    eventId: row.id,
    itemKey: row.stable_key,
    itemName: row.item_name,
    progressMode: row.progress_mode,
    archetypeKey: row.archetype_key,
    kind: row.kind,
    summary: row.summary,
    payload: row.payload,
    createdAt: row.created_at
  }));
}

router.get('/reviews', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const [rows, count] = await Promise.all([
    db.query(`SELECT * FROM compound_reviews WHERE user_id = $1 ORDER BY scope_end DESC, created_at DESC LIMIT $2 OFFSET $3`, [req.user.id, pageSize, offset]),
    db.query(`SELECT count(*)::int AS total FROM compound_reviews WHERE user_id = $1`, [req.user.id])
  ]);
  return ok(res, { list: rows.rows.map(mapReview), page, pageSize, total: count.rows[0].total });
}));

router.post('/reviews/draft', asyncRoute(async (req, res) => {
  const scopeEnd = /^\d{4}-\d{2}-\d{2}$/.test(req.body.scopeEnd || '') ? req.body.scopeEnd : shanghaiDate();
  const scopeStart = /^\d{4}-\d{2}-\d{2}$/.test(req.body.scopeStart || '')
    ? req.body.scopeStart : new Date(Date.parse(`${scopeEnd}T12:00:00+08:00`) - 29 * 86400000).toISOString().slice(0, 10);
  if (scopeEnd < scopeStart) return fail(res, 400, '回看开始日期不能晚于结束日期');
  const sources = await reviewSources(req.user.id, scopeStart, scopeEnd);
  if (!sources.length) return fail(res, 400, '这个阶段还没有已确认的推进或结果');
  const reviewId = crypto.randomUUID();
  const includesFinancialPlan = sources.some(source => isFinancialCompound(source));
  const generated = await aiOrFallback({
    prompt: STAGE_REVIEW_PROMPT,
    input: { scopeStart, scopeEnd, sources },
    label: '复利系统·阶段回看',
    normalizer: raw => normalizeStageReview(raw, sources),
    fallback: sources,
    usageContext: { userId: req.user.id, feature: 'compound_review', taskId: reviewId },
    financial: includesFinancialPlan
  });
  let value = generated.value;
  if (!generated.usedAi) {
    value = {
      summary: '已按真实推进记录整理，等待你确认。',
      actualActions: sources.filter(item => ['START', 'RESULT'].includes(item.kind)).map(item => ({ text: item.summary, sourceRefs: [item.sourceKey] })),
      accumulations: sources.filter(item => item.kind === 'RESULT').map(item => ({ text: item.summary, sourceRefs: [item.sourceKey] })),
      effectiveMethods: [], ineffectiveMethods: [], decision: 'CONTINUE', nextStep: ''
    };
  }
  const costSummary = generated.calledAi ? await usageSummary(req.user.id, { taskId: reviewId }) : null;
  const inserted = await db.transaction(async client => {
    await client.query(`UPDATE compound_reviews SET status = 'SUPERSEDED', updated_at = now() WHERE user_id = $1 AND status = 'DRAFT'`, [req.user.id]);
    return client.query(
      `INSERT INTO compound_reviews
        (id, user_id, scope_start, scope_end, status, result, source_refs, model_version, cost_summary)
       VALUES ($1, $2, $3::date, $4::date, 'DRAFT', $5::jsonb, $6::jsonb, $7, $8::jsonb)
       RETURNING *`,
      [reviewId, req.user.id, scopeStart, scopeEnd, JSON.stringify(value), JSON.stringify(sources),
        generated.usedAi
          ? (includesFinancialPlan ? `compound-progress-financial-${FINANCIAL_COMPOUND_POLICY_VERSION}` : 'compound-progress-v1')
          : (generated.policyBlocked ? `financial-policy-blocked-${FINANCIAL_COMPOUND_POLICY_VERSION}` : 'evidence-fallback-v1'),
        JSON.stringify(costSummary || {})]
    );
  });
  return ok(res, mapReview(inserted.rows[0]), '阶段回看草稿已生成，确认前不会改变推进状态');
}));

router.post('/reviews/:id/confirm', asyncRoute(async (req, res) => {
  const reviewId = uuid(req.params.id);
  if (!reviewId) return fail(res, 404, '回看草稿不存在');
  const result = await db.transaction(async client => {
    const current = await client.query(
      `SELECT * FROM compound_reviews WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [reviewId, req.user.id]
    );
    const row = current.rows[0];
    if (!row || row.status !== 'DRAFT') return null;
    const normalized = normalizeStageReview(req.body.result || row.result, row.source_refs || []);
    const updated = await client.query(
      `UPDATE compound_reviews SET status = 'CONFIRMED', result = $3::jsonb,
         confirmed_at = now(), updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [reviewId, req.user.id, JSON.stringify(normalized)]
    );
    return updated.rows[0];
  });
  if (!result) return fail(res, 400, '回看草稿已经处理');
  return ok(res, mapReview(result), '阶段回看已确认');
}));

function compoundMarkdown(payload) {
  const lines = ['# Shroom 复利系统', '', `> 导出时间：${payload.exportedAt}`, '', '推进与结果仅来自已确认记录，不代表人生评分。'];
  for (const thread of payload.threads) {
    const archetype = thread.archetype?.name || thread.itemName || '自定义计划';
    lines.push('', `## ${thread.title || thread.itemName}`, '',
      `- 参考原型：${archetype}`,
      `- 当前判断：${thread.validation?.status || '待验证'}`,
      `- 本金：${thread.principalDefinition || '待补充'}`,
      `- 回报：${thread.returnDefinition || '待补充'}`,
      `- 再投入：${thread.reinvestmentDefinition || '待补充'}`,
      `- 12 周目标：${thread.desiredOutcome}`,
      `- 做到：${thread.lastCompleted || '尚未记录'}`,
      `- 下一步：${thread.currentStep || '待确认'}`,
      `- 计划状态：${thread.status}`);
    payload.events.filter(event => event.threadId === thread.id && event.status === 'CONFIRMED')
      .forEach(event => lines.push(`  - ${String(event.createdAt).slice(0, 10)} · ${event.kind} · ${event.summary}`));
  }
  if (payload.reviews.length) {
    lines.push('', '## 阶段回看');
    payload.reviews.forEach(review => lines.push('', `### ${review.scopeStart} — ${review.scopeEnd}`, '', review.result.summary || '无摘要'));
  }
  return lines.join('\n');
}

router.get('/export', asyncRoute(async (req, res) => {
  const [threadRows, eventRows, reviewRows, directionRows, refs, legacyCheckins] = await Promise.all([
    db.query(`SELECT t.*, i.stable_key, COALESCE(i.name, t.title) AS item_name, i.section FROM compound_threads t LEFT JOIN life_os_items i ON i.id = t.item_id WHERE t.user_id = $1 ORDER BY t.created_at`, [req.user.id]),
    db.query(`SELECT * FROM compound_events WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query(`SELECT * FROM compound_reviews WHERE user_id = $1 AND status = 'CONFIRMED' ORDER BY scope_end, created_at`, [req.user.id]),
    directionsFor(req.user.id),
    db.query(`SELECT r.*, i.stable_key FROM life_os_item_refs r JOIN life_os_items i ON i.id = r.item_id WHERE r.user_id = $1 ORDER BY r.created_at`, [req.user.id]),
    db.query(`SELECT ritual_key, period_key, checkin_date, mode, duration_minutes, note, created_at FROM compound_checkins WHERE user_id = $1 ORDER BY checkin_date`, [req.user.id])
  ]);
  const payload = {
    format: 'shroom-compound-v1',
    catalogVersion: CATALOG_VERSION,
    exportedAt: new Date().toISOString(),
    privacy: 'SELF_ONLY',
    archetypes: listArchetypes(),
    directions: directionRows.map(mapDirection),
    threads: threadRows.rows.map(row => mapThread(row)),
    events: eventRows.rows.map(mapEvent),
    reviews: reviewRows.rows.map(mapReview),
    references: refs.rows.map(row => ({ id: row.id, itemKey: row.stable_key, refType: row.ref_type, refId: row.ref_id, label: row.label, externalUrl: row.external_url, createdAt: row.created_at })),
    legacyMaintenanceRecords: legacyCheckins.rows,
    note: '不包含无关日记全文；人生 OS 原则保持在独立原则模块中。'
  };
  return ok(res, { json: payload, markdown: compoundMarkdown(payload) });
}));

module.exports = router;
