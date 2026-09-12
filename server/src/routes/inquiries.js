'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { callJson, isAiConfigured } = require('../ai-engine');
const { usageSummary } = require('../ai-usage');
const { asyncRoute, fail, ok, pageParams, requireUser, text } = require('../http');
const { INQUIRY_REVIEW_PROMPT, normalizeInquiryReview } = require('../inquiry-review');
const { resetInquirySyntheses } = require('../inquiry-store');
const { mapCandidate } = require('../inquiry-candidates');

const router = express.Router();
router.use(requireUser);

function uuid(value) {
  const id = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function status(value, fallback = 'OPEN') {
  return ['OPEN', 'PAUSED', 'RESOLVED'].includes(value) ? value : fallback;
}

function mapInquiry(row, costSummary = undefined) {
  const evidenceCount = Number(row.evidence_count || 0);
  const usableEvidenceCount = Number(row.usable_evidence_count || 0);
  const newEvidenceCount = Number(row.new_evidence_count || 0);
  const ageDays = row.last_reviewed_at
    ? Math.max(0, Math.floor((Date.now() - new Date(row.last_reviewed_at).getTime()) / 86400000))
    : null;
  const hasCurrentSynthesis = Boolean(row.current_synthesis && row.current_synthesis.summary);
  const reviewDue = usableEvidenceCount >= 2 && (
    !hasCurrentSynthesis || newEvidenceCount >= 3 || (newEvidenceCount > 0 && ageDays >= 14)
  );
  const item = {
    id: row.id,
    question: row.question,
    context: row.context || '',
    status: row.status,
    currentSynthesis: row.current_synthesis || {},
    synthesisVersion: hasCurrentSynthesis ? Number(row.synthesis_version || 0) : 0,
    latestSynthesisVersion: Number(row.synthesis_version || 0),
    evidenceCount,
    usableEvidenceCount,
    newEvidenceCount,
    reviewDue,
    lastReviewedAt: row.last_reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (costSummary !== undefined) item.costSummary = costSummary;
  return item;
}

function mapEvidence(row) {
  return {
    id: row.id,
    diaryId: row.diary_id || null,
    sourceType: row.source_type,
    sourceLabel: row.source_label || '',
    excerpt: row.excerpt || '',
    note: row.note || '',
    relation: row.relation,
    sourceDate: row.source_date || null,
    aiAllowed: row.diary_id ? Boolean(row.ai_allowed) : true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const inquirySelect = `i.*,
  COALESCE(es.evidence_count, 0)::int AS evidence_count,
  COALESCE(es.usable_evidence_count, 0)::int AS usable_evidence_count,
  COALESCE(es.new_evidence_count, 0)::int AS new_evidence_count`;
const inquiryEvidenceStatsJoin = `LEFT JOIN LATERAL (
  SELECT count(e.id)::int AS evidence_count,
         count(e.id) FILTER (
           WHERE e.diary_id IS NULL OR (d.id IS NOT NULL AND d.ai_allowed)
         )::int AS usable_evidence_count,
         count(e.id) FILTER (
           WHERE (e.diary_id IS NULL OR (d.id IS NOT NULL AND d.ai_allowed))
             AND (i.last_reviewed_at IS NULL OR e.updated_at > i.last_reviewed_at)
         )::int AS new_evidence_count
    FROM inquiry_evidence e
    LEFT JOIN diaries d ON d.id = e.diary_id AND d.user_id = i.user_id AND d.deleted_at IS NULL
   WHERE e.inquiry_id = i.id
) es ON true`;

async function findInquiry(userId, id) {
  const result = await db.query(
    `SELECT ${inquirySelect}
       FROM inquiries i ${inquiryEvidenceStatsJoin}
      WHERE i.id = $1 AND i.user_id = $2`,
    [id, userId]
  );
  return result.rows[0] || null;
}

router.get('/summary', asyncRoute(async (req, res) => {
  const [counts, active] = await Promise.all([
    db.query(
      `WITH inquiry_stats AS (
         SELECT i.id, i.status, i.synthesis_version, i.current_synthesis, i.last_reviewed_at,
                count(e.id)::int AS evidence_count,
                count(e.id) FILTER (
                  WHERE (e.diary_id IS NULL OR (d.id IS NOT NULL AND d.ai_allowed))
                    AND (i.last_reviewed_at IS NULL OR e.updated_at > i.last_reviewed_at)
                )::int AS new_evidence_count
              , count(e.id) FILTER (
                  WHERE e.diary_id IS NULL OR (d.id IS NOT NULL AND d.ai_allowed)
                )::int AS usable_evidence_count
           FROM inquiries i LEFT JOIN inquiry_evidence e ON e.inquiry_id = i.id
           LEFT JOIN diaries d ON d.id = e.diary_id AND d.user_id = i.user_id AND d.deleted_at IS NULL
          WHERE i.user_id = $1 GROUP BY i.id
       )
       SELECT count(*) FILTER (WHERE status = 'OPEN')::int AS open_count,
              count(*) FILTER (WHERE status = 'PAUSED')::int AS paused_count,
              count(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved_count,
              count(*) FILTER (
                WHERE status = 'OPEN' AND usable_evidence_count >= 2 AND (
                  NOT (current_synthesis ? 'summary') OR new_evidence_count >= 3 OR
                  (new_evidence_count > 0 AND last_reviewed_at < now() - interval '14 days')
                )
              )::int AS review_due_count
         FROM inquiry_stats`,
      [req.user.id]
    ),
    db.query(
      `SELECT ${inquirySelect}
         FROM inquiries i ${inquiryEvidenceStatsJoin}
        WHERE i.user_id = $1 AND i.status = 'OPEN'
        ORDER BY i.updated_at DESC LIMIT 3`,
      [req.user.id]
    )
  ]);
  const list = active.rows.map(row => mapInquiry(row));
  return ok(res, {
    openCount: counts.rows[0].open_count,
    pausedCount: counts.rows[0].paused_count,
    resolvedCount: counts.rows[0].resolved_count,
    reviewDueCount: counts.rows[0].review_due_count,
    active: list
  });
}));

router.get('/diary-links/:diaryId', asyncRoute(async (req, res) => {
  const diaryId = uuid(req.params.diaryId);
  if (!diaryId) return fail(res, 400, '日记不存在');
  const result = await db.query(
    `SELECT i.id, i.question, i.status, e.id AS evidence_id
       FROM inquiry_evidence e
       JOIN inquiries i ON i.id = e.inquiry_id AND i.user_id = $2
       JOIN diaries d ON d.id = e.diary_id AND d.user_id = $2 AND d.deleted_at IS NULL
      WHERE e.diary_id = $1 AND e.user_id = $2 ORDER BY i.updated_at DESC`,
    [diaryId, req.user.id]
  );
  return ok(res, result.rows.map(row => ({
    id: row.id, question: row.question, status: row.status, evidenceId: row.evidence_id
  })));
}));

router.put('/diary-links/:diaryId', asyncRoute(async (req, res) => {
  const diaryId = uuid(req.params.diaryId);
  const requestedIds = [...new Set((Array.isArray(req.body.inquiryIds) ? req.body.inquiryIds : [])
    .map(uuid).filter(Boolean))].slice(0, 3);
  if (!diaryId) return fail(res, 400, '日记不存在');
  const synced = await db.transaction(async client => {
    const diaryResult = await client.query(
      `SELECT id, content, to_char(occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
         FROM diaries WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [diaryId, req.user.id]
    );
    if (!diaryResult.rowCount) return { error: 'diary' };
    if (requestedIds.length) {
      const inquiryResult = await client.query(
        `SELECT i.id FROM inquiries i
          WHERE i.user_id = $1 AND i.id = ANY($2::uuid[])
            AND (i.status <> 'RESOLVED' OR EXISTS (
              SELECT 1 FROM inquiry_evidence e
               WHERE e.inquiry_id = i.id AND e.diary_id = $3 AND e.user_id = $1
            ))`,
        [req.user.id, requestedIds, diaryId]
      );
      if (inquiryResult.rowCount !== requestedIds.length) return { error: 'inquiry' };
    }
    const existingResult = await client.query(
      `SELECT inquiry_id, source_label, excerpt FROM inquiry_evidence
        WHERE user_id = $1 AND diary_id = $2`,
      [req.user.id, diaryId]
    );
    const existing = new Map(existingResult.rows.map(row => [row.inquiry_id, row]));
    const removed = await client.query(
      `DELETE FROM inquiry_evidence
        WHERE user_id = $1 AND diary_id = $2
          AND NOT (inquiry_id = ANY($3::uuid[]))
        RETURNING inquiry_id`,
      [req.user.id, diaryId, requestedIds]
    );
    await resetInquirySyntheses(client, req.user.id, removed.rows.map(row => row.inquiry_id));
    const diary = diaryResult.rows[0];
    const sourceLabel = `${diary.source_date} 的日记`;
    const excerpt = text(diary.content, 5000);
    const changedIds = [];
    for (const inquiryId of requestedIds) {
      await client.query(
        `INSERT INTO inquiry_evidence
          (id, user_id, inquiry_id, diary_id, source_type, source_label, excerpt)
         VALUES ($1, $2, $3, $4, 'DIARY', $5, $6)
         ON CONFLICT (inquiry_id, diary_id) WHERE diary_id IS NOT NULL
         DO UPDATE SET source_label = EXCLUDED.source_label, excerpt = EXCLUDED.excerpt,
           updated_at = CASE
             WHEN inquiry_evidence.source_label IS DISTINCT FROM EXCLUDED.source_label
               OR inquiry_evidence.excerpt IS DISTINCT FROM EXCLUDED.excerpt THEN now()
             ELSE inquiry_evidence.updated_at
           END`,
        [crypto.randomUUID(), req.user.id, inquiryId, diaryId, sourceLabel, excerpt]
      );
      const prior = existing.get(inquiryId);
      if (!prior || prior.source_label !== sourceLabel || prior.excerpt !== excerpt) changedIds.push(inquiryId);
    }
    if (changedIds.length) {
      await client.query(
        `UPDATE inquiries SET evidence_revision = evidence_revision + 1, updated_at = now()
          WHERE user_id = $1 AND id = ANY($2::uuid[])`,
        [req.user.id, changedIds]
      );
    }
    return { inquiryIds: requestedIds };
  });
  if (synced.error === 'diary') return fail(res, 404, '日记不存在');
  if (synced.error === 'inquiry') return fail(res, 400, '只能关联自己的进行中问题');
  return ok(res, synced, requestedIds.length ? '已把这篇日记放进问题线索' : '已取消问题关联');
}));

router.get('/', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const selectedStatus = req.query.status === 'ALL' ? null : status(req.query.status);
  const values = [req.user.id, pageSize, offset];
  const statusClause = selectedStatus ? 'AND i.status = $4' : '';
  if (selectedStatus) values.push(selectedStatus);
  const [items, total] = await Promise.all([
    db.query(
      `SELECT ${inquirySelect}
         FROM inquiries i ${inquiryEvidenceStatsJoin}
        WHERE i.user_id = $1 ${statusClause}
        ORDER BY i.updated_at DESC LIMIT $2 OFFSET $3`,
      values
    ),
    db.query(
      `SELECT count(*)::int AS total FROM inquiries
        WHERE user_id = $1 ${selectedStatus ? 'AND status = $2' : ''}`,
      selectedStatus ? [req.user.id, selectedStatus] : [req.user.id]
    )
  ]);
  return ok(res, { list: items.rows.map(row => mapInquiry(row)), total: total.rows[0].total, page, pageSize });
}));

router.post('/', asyncRoute(async (req, res) => {
  const question = text(req.body.question, 300);
  const context = text(req.body.context, 5000);
  if (question.length < 4) return fail(res, 400, '把这个问题再写具体一点');
  const id = crypto.randomUUID();
  const result = await db.query(
    `INSERT INTO inquiries (id, user_id, question, context)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, req.user.id, question, context]
  );
  return ok(res, mapInquiry(result.rows[0]), '问题已留下，先让生活继续提供线索');
}));

router.get('/candidates', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const selectedStatus = ['PENDING', 'ACCEPTED', 'IGNORED'].includes(req.query.status)
    ? req.query.status : 'PENDING';
  const [items, total] = await Promise.all([
    db.query(
      `SELECT c.*, count(cd.diary_id)::int AS evidence_count,
              min(to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')) AS source_date
         FROM inquiry_candidates c
         JOIN inquiry_candidate_diaries cd ON cd.candidate_id = c.id AND cd.user_id = c.user_id
         JOIN diaries d ON d.id = cd.diary_id AND d.user_id = c.user_id AND d.deleted_at IS NULL
        WHERE c.user_id = $1 AND c.status = $2
        GROUP BY c.id ORDER BY c.created_at DESC LIMIT $3 OFFSET $4`,
      [req.user.id, selectedStatus, pageSize, offset]
    ),
    db.query(
      'SELECT count(*)::int AS total FROM inquiry_candidates WHERE user_id = $1 AND status = $2',
      [req.user.id, selectedStatus]
    )
  ]);
  return ok(res, { list: items.rows.map(mapCandidate), total: total.rows[0].total, page, pageSize });
}));

router.post('/candidates/:candidateId/accept', asyncRoute(async (req, res) => {
  const candidateId = uuid(req.params.candidateId);
  if (!candidateId) return fail(res, 404, '候选问题不存在');
  const accepted = await db.transaction(async client => {
    const candidateResult = await client.query(
      'SELECT * FROM inquiry_candidates WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [candidateId, req.user.id]
    );
    if (!candidateResult.rowCount) return { error: 'missing' };
    const candidate = candidateResult.rows[0];
    if (candidate.status === 'IGNORED') return { error: 'ignored' };
    if (candidate.status === 'ACCEPTED' && candidate.accepted_inquiry_id) {
      return { inquiryId: candidate.accepted_inquiry_id, created: false, alreadyAccepted: true };
    }
    let inquiryId = candidate.suggested_inquiry_id;
    if (inquiryId) {
      const existing = await client.query(
        `SELECT id FROM inquiries WHERE id = $1 AND user_id = $2 AND status <> 'RESOLVED'`,
        [inquiryId, req.user.id]
      );
      if (!existing.rowCount) inquiryId = null;
    }
    let created = false;
    if (!inquiryId) {
      inquiryId = crypto.randomUUID();
      await client.query(
        `INSERT INTO inquiries (id, user_id, question, context) VALUES ($1, $2, $3, $4)`,
        [inquiryId, req.user.id, candidate.question, candidate.context]
      );
      created = true;
    }
    const diaries = await client.query(
      `SELECT d.id, d.content,
              to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
         FROM inquiry_candidate_diaries cd
         JOIN diaries d ON d.id = cd.diary_id AND d.user_id = cd.user_id AND d.deleted_at IS NULL
        WHERE cd.candidate_id = $1 AND cd.user_id = $2 ORDER BY d.occurred_at`,
      [candidateId, req.user.id]
    );
    let changed = 0;
    for (const diary of diaries.rows) {
      const result = await client.query(
        `INSERT INTO inquiry_evidence
          (id, user_id, inquiry_id, diary_id, source_type, source_label, excerpt)
         VALUES ($1, $2, $3, $4, 'DIARY', $5, $6)
         ON CONFLICT (inquiry_id, diary_id) WHERE diary_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [crypto.randomUUID(), req.user.id, inquiryId, diary.id, `${diary.source_date} 的日记`, text(diary.content, 5000)]
      );
      changed += result.rowCount;
    }
    if (changed) {
      await client.query(
        'UPDATE inquiries SET evidence_revision = evidence_revision + 1, updated_at = now() WHERE id = $1 AND user_id = $2',
        [inquiryId, req.user.id]
      );
    }
    await client.query(
      `UPDATE inquiry_candidates SET status = 'ACCEPTED', accepted_inquiry_id = $3, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [candidateId, req.user.id, inquiryId]
    );
    return { inquiryId, created, alreadyAccepted: false, evidenceCount: diaries.rowCount };
  });
  if (accepted.error === 'missing') return fail(res, 404, '候选问题不存在');
  if (accepted.error === 'ignored') return fail(res, 400, '这个候选已经忽略');
  const message = accepted.alreadyAccepted
    ? '这个问题已经开始观察'
    : accepted.created ? '问题已留下，日记已成为第一条线索' : '日记已关联到已有问题';
  return ok(res, accepted, message);
}));

router.post('/candidates/:candidateId/ignore', asyncRoute(async (req, res) => {
  const candidateId = uuid(req.params.candidateId);
  if (!candidateId) return fail(res, 404, '候选问题不存在');
  const result = await db.query(
    `UPDATE inquiry_candidates SET status = 'IGNORED', updated_at = now()
      WHERE id = $1 AND user_id = $2 AND status = 'PENDING' RETURNING id`,
    [candidateId, req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '待确认的候选问题不存在');
  return ok(res, { id: result.rows[0].id }, '已忽略，不会创建未解之问');
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const id = uuid(req.params.id);
  if (!id) return fail(res, 404, '问题不存在');
  const inquiry = await findInquiry(req.user.id, id);
  if (!inquiry) return fail(res, 404, '问题不存在');
  const [evidence, history, costs] = await Promise.all([
    db.query(
      `SELECT e.*,
              CASE WHEN e.diary_id IS NOT NULL THEN d.content ELSE e.excerpt END AS excerpt,
              d.ai_allowed,
              to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
         FROM inquiry_evidence e LEFT JOIN diaries d ON d.id = e.diary_id AND d.user_id = $2 AND d.deleted_at IS NULL
        WHERE e.inquiry_id = $1 AND e.user_id = $2 ORDER BY COALESCE(d.occurred_at, e.created_at) DESC`,
      [id, req.user.id]
    ),
    db.query(
      `SELECT version, result, evidence_refs AS "evidenceRefs",
              invalidated_at AS "invalidatedAt", invalidated_reason AS "invalidatedReason",
              created_at AS "createdAt"
         FROM inquiry_syntheses WHERE inquiry_id = $1 AND user_id = $2
        ORDER BY version DESC LIMIT 20`,
      [id, req.user.id]
    ),
    usageSummary(req.user.id, { inquiryId: id })
  ]);
  return ok(res, {
    ...mapInquiry(inquiry, costs),
    evidence: evidence.rows.map(mapEvidence),
    history: history.rows
  });
}));

router.patch('/:id', asyncRoute(async (req, res) => {
  const id = uuid(req.params.id);
  if (!id) return fail(res, 404, '问题不存在');
  const question = req.body.question === undefined ? null : text(req.body.question, 300);
  const context = req.body.context === undefined ? null : text(req.body.context, 5000);
  const nextStatus = req.body.status === undefined ? null : status(req.body.status, null);
  if (question !== null && question.length < 4) return fail(res, 400, '把这个问题再写具体一点');
  if (req.body.status !== undefined && !nextStatus) return fail(res, 400, '问题状态不正确');
  const result = await db.transaction(async client => {
    const existing = await client.query(
      'SELECT id FROM inquiries WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, req.user.id]
    );
    if (!existing.rowCount) return existing;
    if (question !== null || context !== null) await resetInquirySyntheses(client, req.user.id, [id]);
    return client.query(
      `UPDATE inquiries SET question = COALESCE($3, question), context = COALESCE($4, context),
         status = COALESCE($5, status), updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user.id, question, context, nextStatus]
    );
  });
  if (!result.rowCount) return fail(res, 404, '问题不存在');
  return ok(res, mapInquiry(result.rows[0]), '问题已更新');
}));

router.post('/:id/evidence', asyncRoute(async (req, res) => {
  const inquiryId = uuid(req.params.id);
  if (!inquiryId) return fail(res, 404, '问题不存在');
  const sourceType = ['NOTE', 'LINK', 'ACTION', 'REFLECTION'].includes(req.body.sourceType)
    ? req.body.sourceType : 'NOTE';
  const excerpt = text(req.body.excerpt, 5000);
  const note = text(req.body.note, 2000);
  const sourceLabel = text(req.body.sourceLabel, 240);
  const relation = ['SUPPORT', 'CHALLENGE', 'CONTEXT', 'UNKNOWN'].includes(req.body.relation)
    ? req.body.relation : 'CONTEXT';
  if (!excerpt) return fail(res, 400, '先写下这条线索');
  const inserted = await db.transaction(async client => {
    const inquiry = await client.query(
      `SELECT id FROM inquiries WHERE id = $1 AND user_id = $2 AND status <> 'RESOLVED' FOR UPDATE`,
      [inquiryId, req.user.id]
    );
    if (!inquiry.rowCount) return null;
    const result = await client.query(
      `INSERT INTO inquiry_evidence
        (id, user_id, inquiry_id, source_type, source_label, excerpt, note, relation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [crypto.randomUUID(), req.user.id, inquiryId, sourceType, sourceLabel, excerpt, note, relation]
    );
    await client.query(
      'UPDATE inquiries SET evidence_revision = evidence_revision + 1, updated_at = now() WHERE id = $1',
      [inquiryId]
    );
    return result.rows[0];
  });
  if (!inserted) return fail(res, 404, '进行中的问题不存在');
  return ok(res, mapEvidence(inserted), '新线索已加入');
}));

router.delete('/:id/evidence/:evidenceId', asyncRoute(async (req, res) => {
  const inquiryId = uuid(req.params.id);
  const evidenceId = uuid(req.params.evidenceId);
  if (!inquiryId || !evidenceId) return fail(res, 404, '线索不存在');
  const result = await db.transaction(async client => {
    const deleted = await client.query(
      `DELETE FROM inquiry_evidence WHERE id = $1 AND inquiry_id = $2 AND user_id = $3 RETURNING id`,
      [evidenceId, inquiryId, req.user.id]
    );
    if (deleted.rowCount) await resetInquirySyntheses(client, req.user.id, [inquiryId]);
    return deleted;
  });
  if (!result.rowCount) return fail(res, 404, '线索不存在');
  return ok(res, { deleted: true }, '线索已移除');
}));

router.post('/:id/review', asyncRoute(async (req, res) => {
  if (!isAiConfigured()) return fail(res, 503, '长期问题复盘 AI 尚未配置');
  const inquiryId = uuid(req.params.id);
  if (!inquiryId) return fail(res, 404, '问题不存在');
  const inquiry = await findInquiry(req.user.id, inquiryId);
  if (!inquiry) return fail(res, 404, '问题不存在');
  const evidenceResult = await db.query(
    `SELECT e.id, e.source_type, e.source_label,
            CASE WHEN e.diary_id IS NOT NULL THEN d.content ELSE e.excerpt END AS excerpt,
            e.note, e.relation,
            to_char(COALESCE(d.occurred_at, e.created_at) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
       FROM inquiry_evidence e
       LEFT JOIN diaries d ON d.id = e.diary_id AND d.user_id = $2 AND d.deleted_at IS NULL
      WHERE e.inquiry_id = $1 AND e.user_id = $2
        AND (e.diary_id IS NULL OR (d.id IS NOT NULL AND d.ai_allowed))
      ORDER BY COALESCE(d.occurred_at, e.created_at) DESC LIMIT 60`,
    [inquiryId, req.user.id]
  );
  if (evidenceResult.rowCount < 2) return fail(res, 400, '至少积累两条允许 AI 读取的线索，再一起回看');
  const evidence = evidenceResult.rows.reverse().map((row, index) => ({
    key: `E${index + 1}`,
    id: row.id,
    date: row.source_date,
    type: row.source_type,
    label: row.source_label,
    relationMarkedByUser: row.relation,
    content: text(row.excerpt, 1800),
    userNote: text(row.note, 800)
  }));
  const raw = await callJson(INQUIRY_REVIEW_PROMPT, {
    question: inquiry.question,
    context: inquiry.context,
    previousSynthesis: inquiry.current_synthesis || null,
    coverage: { totalEvidenceCount: Number(inquiry.evidence_count || 0), usableEvidenceCount: Number(inquiry.usable_evidence_count || 0), analyzedEvidenceCount: evidence.length },
    evidence
  }, '未解之问复盘', {
    temperature: 0.15,
    maxTokens: 4500,
    usageContext: { userId: req.user.id, inquiryId, feature: 'inquiry_review' }
  });
  const synthesis = normalizeInquiryReview(raw, evidence);
  if (!synthesis.summary) return fail(res, 503, '这次没有形成可靠的当前理解，请稍后重试');
  const saved = await db.transaction(async client => {
    const locked = await client.query(
      'SELECT synthesis_version, evidence_revision FROM inquiries WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [inquiryId, req.user.id]
    );
    if (!locked.rowCount) return null;
    if (Number(locked.rows[0].evidence_revision || 0) !== Number(inquiry.evidence_revision || 0)) {
      return { error: 'changed' };
    }
    const version = Number(locked.rows[0].synthesis_version || 0) + 1;
    const refs = evidence.map(item => ({ key: item.key, evidenceId: item.id, date: item.date, label: item.label }));
    await client.query(
      `INSERT INTO inquiry_syntheses (id, user_id, inquiry_id, version, result, evidence_refs)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
      [crypto.randomUUID(), req.user.id, inquiryId, version, JSON.stringify(synthesis), JSON.stringify(refs)]
    );
    await client.query(
      `UPDATE inquiries SET current_synthesis = $3::jsonb, synthesis_version = $4,
        last_reviewed_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2`,
      [inquiryId, req.user.id, JSON.stringify(synthesis), version]
    );
    return { version, synthesis, evidenceRefs: refs };
  });
  if (!saved) return fail(res, 404, '问题不存在');
  if (saved.error === 'changed') return fail(res, 409, '线索刚刚发生变化，请重新开始这次复盘');
  return ok(res, {
    ...saved,
    costSummary: await usageSummary(req.user.id, { inquiryId })
  }, '新的理解已经形成；问题状态仍由你决定');
}));

module.exports = router;
