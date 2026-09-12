'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { asyncRoute, fail, ok, pageParams, requireUser, text } = require('../http');
const { healthObservationLine, isHealthInquiry, normalizeHealthObservation } = require('../inquiry-health');
const { dateOnly, mapWellbeingRecord } = require('../wellbeing-records');

const router = express.Router();
router.use(requireUser);

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

router.patch('/:id', asyncRoute(async (req, res) => {
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
  const result = await db.query(
    `UPDATE wellbeing_records SET status = $3, ai_allowed = $4,
       confirmed_at = CASE WHEN $3 = 'CONFIRMED' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
       updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, req.user.id, next.status, next.aiAllowed]
  );
  if (!result.rowCount) return fail(res, 404, '身心记录不存在');
  return ok(res, mapWellbeingRecord(result.rows[0]), action === 'confirm' ? '已确认这条观察' : '记录已更新');
}));

router.post('/:id/inquiries/:inquiryId', asyncRoute(async (req, res) => {
  const recordId = uuid(req.params.id);
  const inquiryId = uuid(req.params.inquiryId);
  if (!recordId || !inquiryId) return fail(res, 404, '记录或问题不存在');
  const linked = await db.transaction(async client => {
    const [recordResult, inquiryResult] = await Promise.all([
      client.query(
        `SELECT * FROM wellbeing_records
          WHERE id = $1 AND user_id = $2 AND status IN ('CONFIRMED', 'ARCHIVED') FOR UPDATE`,
        [recordId, req.user.id]
      ),
      client.query(
        `SELECT id, inquiry_type FROM inquiries
          WHERE id = $1 AND user_id = $2 AND status <> 'RESOLVED' FOR UPDATE`,
        [inquiryId, req.user.id]
      )
    ]);
    if (!recordResult.rowCount || !inquiryResult.rowCount) return null;
    if (!isHealthInquiry(inquiryResult.rows[0].inquiry_type)) return { error: 'type' };
    const record = recordResult.rows[0];
    const result = await client.query(
      `INSERT INTO inquiry_evidence
        (id, user_id, inquiry_id, source_type, source_label, excerpt, wellbeing_record_id)
       VALUES ($1, $2, $3, 'WELLBEING', $4, $5, $6)
       ON CONFLICT (inquiry_id, wellbeing_record_id) WHERE wellbeing_record_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [crypto.randomUUID(), req.user.id, inquiryId, record.source_label, record.source_excerpt, recordId]
    );
    if (result.rowCount) {
      await client.query(
        `UPDATE inquiries SET evidence_revision = evidence_revision + 1, updated_at = now()
          WHERE id = $1 AND user_id = $2`,
        [inquiryId, req.user.id]
      );
    }
    return { linked: Boolean(result.rowCount), evidenceId: result.rows[0]?.id || null };
  });
  if (!linked) return fail(res, 404, '可引用的身心记录或进行中问题不存在');
  if (linked.error === 'type') return fail(res, 400, '身心记录只能引用到身心相关的未解之问');
  return ok(res, linked, linked.linked ? '已作为问题证据引用' : '这条记录已经引用过');
}));

module.exports = router;
