'use strict';

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const { asyncRoute, fail, ok, pageParams, requireUser, text } = require('../http');
const { healthObservationLine, normalizeHealthObservation } = require('../inquiry-health');
const { dateOnly, mapWellbeingRecord } = require('../wellbeing-records');
const {
  WELLBEING_CONCEPT_CATALOG_VERSION,
  WELLBEING_HYPOTHESIS_REVIEW_VERSION,
  mapHypothesis,
  refreshWellbeingHypotheses
} = require('../wellbeing-hypotheses');
const { requireFeature } = require('../billing-store');

const router = express.Router();
router.use(requireUser);
router.use(requireFeature('wellbeing'));

const DISMISS_REASONS = new Set([
  'OTHER_PERSON',
  'KNOWLEDGE_OR_REFLECTION',
  'NOT_WELLBEING',
  'DUPLICATE',
  'MISUNDERSTOOD'
]);
const HYPOTHESIS_DISMISS_REASONS = new Set([
  'DOES_NOT_MATCH',
  'MISREAD_EVIDENCE',
  'TOO_SPECULATIVE',
  'ALREADY_RESOLVED'
]);
const WELLBEING_MEDICAL_DISCLAIMER = '身心记录及“可能问题”由 AI 根据用户提供的线索生成，可能不完整、不准确或误解原文，仅供自我观察和就医沟通参考，不构成医学诊断、治疗建议或专业心理意见。';

function uuid(value) {
  const id = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function categoryCondition(category, alias = 'w') {
  const observation = `${alias}.observation`;
  const conditions = {
    PSYCHOLOGICAL: `jsonb_array_length(COALESCE(${observation}->'psychologicalFeelings', '[]'::jsonb)) > 0
      OR jsonb_array_length(COALESCE(${observation}->'stressors', '[]'::jsonb)) > 0
      OR jsonb_array_length(COALESCE(${observation}->'cognitiveChanges', '[]'::jsonb)) > 0`,
    PHYSICAL: `jsonb_array_length(COALESCE(${observation}->'physicalSymptoms', '[]'::jsonb)) > 0
      OR jsonb_array_length(COALESCE(${observation}->'bodyAreas', '[]'::jsonb)) > 0
      OR ${observation}->>'severity' IS NOT NULL OR COALESCE(${observation}->>'duration', '') <> ''`,
    SLEEP: `${observation}->'sleep' IS NOT NULL AND (
      ${observation}->'sleep'->>'hours' IS NOT NULL OR ${observation}->'sleep'->>'quality' IS NOT NULL
      OR COALESCE(${observation}->'sleep'->>'note', '') <> '')`,
    HABIT: `jsonb_array_length(COALESCE(${observation}->'behaviors', '[]'::jsonb)) > 0
      OR jsonb_array_length(COALESCE(${observation}->'environmentFactors', '[]'::jsonb)) > 0`,
    MEASUREMENT: `jsonb_array_length(COALESCE(${observation}->'measurements', '[]'::jsonb)) > 0`,
    TEST_RESULT: `jsonb_array_length(COALESCE(${observation}->'testResults', '[]'::jsonb)) > 0`
  };
  return conditions[category] || null;
}

router.get('/summary', asyncRoute(async (req, res) => {
  const selectedDate = dateOnly(req.query.date, new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }));
  const [counts, records] = await Promise.all([
    db.query(
      `SELECT count(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed_count,
              count(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
              count(*) FILTER (WHERE status IN ('PENDING', 'CONFIRMED') AND recorded_on >= current_date - 6)::int AS recent_count
         FROM wellbeing_records WHERE user_id = $1`,
      [req.user.id]
    ),
    db.query(
      `SELECT * FROM wellbeing_records
        WHERE user_id = $1 AND status IN ('PENDING', 'CONFIRMED')
          AND (recorded_on = $2::date OR (
            $2::date = current_date AND recorded_on BETWEEN current_date - 6 AND current_date
          ))
        ORDER BY recorded_on DESC, CASE status WHEN 'PENDING' THEN 0 ELSE 1 END, updated_at DESC LIMIT 3`,
      [req.user.id, selectedDate]
    )
  ]);
  return ok(res, {
    confirmedCount: Number(counts.rows[0].confirmed_count || 0),
    pendingCount: Number(counts.rows[0].pending_count || 0),
    recentCount: Number(counts.rows[0].recent_count || 0),
    date: selectedDate,
    records: records.rows.map(mapWellbeingRecord)
  });
}));

router.get('/', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const selectedStatus = ['PENDING', 'CONFIRMED', 'ARCHIVED'].includes(req.query.status)
    ? req.query.status : null;
  const condition = categoryCondition(req.query.category);
  const values = [req.user.id, pageSize, offset];
  const clauses = ["w.status <> 'DISMISSED'"];
  if (selectedStatus) {
    values.push(selectedStatus);
    clauses.push(`w.status = $${values.length}`);
  }
  if (condition) clauses.push(`(${condition})`);
  const where = clauses.length ? `AND ${clauses.join(' AND ')}` : '';
  const totalValues = values.slice(0, 1);
  if (selectedStatus) totalValues.push(selectedStatus);
  const [items, total] = await Promise.all([
    db.query(
      `SELECT w.* FROM wellbeing_records w WHERE w.user_id = $1 ${where}
       ORDER BY CASE w.status WHEN 'PENDING' THEN 0 ELSE 1 END, w.recorded_on DESC, w.created_at DESC
       LIMIT $2 OFFSET $3`,
      values
    ),
    db.query(
      `SELECT count(*)::int AS total FROM wellbeing_records w WHERE w.user_id = $1
       AND w.status <> 'DISMISSED'
       ${selectedStatus ? 'AND w.status = $2' : ''}
       ${condition ? `AND (${condition})` : ''}`,
      totalValues
    )
  ]);
  return ok(res, { list: items.rows.map(mapWellbeingRecord), total: total.rows[0].total, page, pageSize });
}));

router.post('/', asyncRoute(async (req, res) => {
  const observation = normalizeHealthObservation(req.body.observation);
  if (!Object.keys(observation).length) return fail(res, 400, '至少留下一个身心观察');
  const recordedOn = dateOnly(req.body.recordedOn, new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }));
  const sourceExcerpt = text(req.body.note, 5000) || healthObservationLine(observation);
  const result = await db.query(
    `INSERT INTO wellbeing_records
      (id, user_id, source_type, status, recorded_on, source_label, source_excerpt,
       observation, ai_allowed, confirmed_at)
     VALUES ($1, $2, 'MANUAL', 'CONFIRMED', $3, '手动记录', $4, $5::jsonb, true, now())
     RETURNING *`,
    [crypto.randomUUID(), req.user.id, recordedOn, sourceExcerpt, JSON.stringify(observation)]
  );
  return ok(res, mapWellbeingRecord(result.rows[0]), '身心记录已保存');
}));

async function hypothesisList(userId) {
  const [hypotheses, meta] = await Promise.all([
    db.query(
      `SELECT * FROM wellbeing_hypotheses
        WHERE user_id = $1 AND status IN ('PENDING', 'OBSERVING')
        ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,
          CASE evidence_strength WHEN 'STRONG' THEN 0 WHEN 'MODERATE' THEN 1 ELSE 2 END,
          updated_at DESC`,
      [userId]
    ),
    db.query(
      `SELECT
         (SELECT count(*)::int FROM wellbeing_records
           WHERE user_id = $1 AND status IN ('PENDING', 'CONFIRMED')) AS source_count,
         (SELECT max(updated_at) FROM wellbeing_records
           WHERE user_id = $1 AND status IN ('PENDING', 'CONFIRMED')) AS latest_source_at,
         (SELECT max(source_updated_at) FROM wellbeing_hypotheses
           WHERE user_id = $1) AS last_reviewed_source_at,
         (SELECT count(*)::int FROM wellbeing_hypotheses
           WHERE user_id = $1 AND status IN ('PENDING', 'OBSERVING')
             AND review_version <> $2) AS stale_review_count`,
      [userId, WELLBEING_HYPOTHESIS_REVIEW_VERSION]
    )
  ]);
  const recordIds = [...new Set(hypotheses.rows.flatMap(row => [
    ...(Array.isArray(row.supporting_evidence) ? row.supporting_evidence : []),
    ...(Array.isArray(row.challenging_evidence) ? row.challenging_evidence : []),
    ...(Array.isArray(row.red_flags) ? row.red_flags : [])
  ]).map(item => String(item.recordId || item.record_id || '')).filter(Boolean))];
  const recordResult = recordIds.length ? await db.query(
    `SELECT * FROM wellbeing_records WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, recordIds]
  ) : { rows: [] };
  const recordMap = new Map(recordResult.rows.map(row => {
    const mapped = mapWellbeingRecord(row);
    return [String(mapped.id), mapped];
  }));
  const state = meta.rows[0] || {};
  const latestSourceAt = state.latest_source_at ? new Date(state.latest_source_at) : null;
  const lastReviewedSourceAt = state.last_reviewed_source_at ? new Date(state.last_reviewed_source_at) : null;
  return {
    list: hypotheses.rows.map(row => mapHypothesis(row, recordMap))
      .filter(item => item.namedPossibilities.length),
    conceptCatalogVersion: WELLBEING_CONCEPT_CATALOG_VERSION,
    medicalDisclaimer: WELLBEING_MEDICAL_DISCLAIMER,
    aiGenerated: true,
    sourceCount: Number(state.source_count || 0),
    reviewDue: Boolean(Number(state.stale_review_count || 0)
      || (latestSourceAt && (!lastReviewedSourceAt || latestSourceAt > lastReviewedSourceAt))),
    latestSourceAt: state.latest_source_at || null,
    lastReviewedSourceAt: state.last_reviewed_source_at || null
  };
}

router.get('/hypotheses', asyncRoute(async (req, res) => {
  return ok(res, await hypothesisList(req.user.id));
}));

router.post('/hypotheses/refresh', asyncRoute(async (req, res) => {
  if (req.body.healthConsent !== true) {
    return fail(res, 400, '请确认允许 AI 基于你的私密身心记录整理可能问题');
  }
  const refreshed = await refreshWellbeingHypotheses(req.user.id, config.aiModel, { aiOptions: { billable: true } });
  return ok(res, {
    ...(await hypothesisList(req.user.id)),
    reviewedSourceCount: refreshed.sourceCount,
    storedCount: refreshed.stored
  }, refreshed.stored ? '已形成新的身心问题候选' : '目前没有足够证据形成具名问题候选');
}));

router.post('/hypotheses/:hypothesisId/status', asyncRoute(async (req, res) => {
  const id = uuid(req.params.hypothesisId);
  if (!id) return fail(res, 404, '身心问题候选不存在');
  const action = String(req.body.action || '');
  const transitions = {
    observe: 'OBSERVING',
    dismiss: 'DISMISSED',
    archive: 'ARCHIVED',
    restore: 'OBSERVING'
  };
  const nextStatus = transitions[action];
  if (!nextStatus) return fail(res, 400, '操作不正确');
  const feedbackReason = action === 'dismiss' && HYPOTHESIS_DISMISS_REASONS.has(String(req.body.reason || ''))
    ? String(req.body.reason) : null;
  const result = await db.query(
    `UPDATE wellbeing_hypotheses SET status = $3::varchar(16),
       feedback_reason = CASE WHEN $3::varchar(16) = 'DISMISSED' THEN $4::varchar(48) ELSE NULL END,
       confirmed_at = CASE WHEN $3::varchar(16) = 'OBSERVING' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
       updated_at = now()
      WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, req.user.id, nextStatus, feedbackReason]
  );
  if (!result.rowCount) return fail(res, 404, '身心问题候选不存在');
  return ok(res, mapHypothesis(result.rows[0]), action === 'observe' ? '已加入持续观察' : '候选已更新');
}));

async function updateWellbeingStatus(req, res) {
  const id = uuid(req.params.id);
  if (!id) return fail(res, 404, '身心记录不存在');
  const action = String(req.body.action || '');
  const transitions = {
    confirm: { status: 'CONFIRMED', aiAllowed: true },
    dismiss: { status: 'DISMISSED', aiAllowed: false },
    archive: { status: 'ARCHIVED', aiAllowed: true },
    restore: { status: 'CONFIRMED', aiAllowed: true }
  };
  const next = transitions[action];
  if (!next) return fail(res, 400, '操作不正确');
  const feedbackReason = action === 'dismiss' && DISMISS_REASONS.has(String(req.body.reason || ''))
    ? String(req.body.reason) : null;
  const result = await db.query(
    `UPDATE wellbeing_records SET status = $3::varchar(16), ai_allowed = $4::boolean,
       confirmed_at = CASE WHEN $3::varchar(16) = 'CONFIRMED' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
       feedback_reason = CASE WHEN $3::varchar(16) = 'DISMISSED' THEN $5::varchar(48) ELSE NULL END,
       updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, req.user.id, next.status, next.aiAllowed, feedbackReason]
  );
  if (!result.rowCount) return fail(res, 404, '身心记录不存在');
  return ok(res, mapWellbeingRecord(result.rows[0]), action === 'confirm' ? '已确认这条观察' : '记录已更新');
}

// POST is the canonical cross-platform status action. Keep PATCH for older
// H5 builds that may still be cached on users' devices.
router.post('/:id/status', asyncRoute(updateWellbeingStatus));
router.patch('/:id', asyncRoute(updateWellbeingStatus));

module.exports = router;
