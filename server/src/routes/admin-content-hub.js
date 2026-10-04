'use strict';

// Content Hub: one lifecycle for captured leads, production work and publication evidence.
// Mounted inside routes/admin-console.js AFTER requireAdminSession/requireAdminCsrf,
// so every endpoint reuses the existing admin session, CSRF, permission and audit
// boundaries. No publishing, no platform automation, no user data access.

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { deletePrivateObject, signPrivateObjectUrl } = require('../media-storage');
const { recordAdminAudit } = require('../admin-audit');
const { adminFail, requirePermission } = require('../admin-auth');
const { asyncRoute, text } = require('../http');
const {
  TOPIC_STATES,
  TRANSITIONS,
  canTransition,
  contentHash,
  sourceFingerprint,
  topicSnapshot,
  transitionRequirement
} = require('../content-workbench');

const router = express.Router();

const TOPIC_STATE_SET = new Set(TOPIC_STATES);
const CHANNELS = new Set(['XHS_PERSONAL', 'XHS_COMPANY']);
const REVIEW_TYPES = new Set(['OPS', 'COMPLIANCE']);
const REVIEW_DECISIONS = new Set(['PASS', 'CHANGES_REQUESTED', 'STOP']);
const ASSET_KINDS = new Set(['COVER', 'IMAGE', 'VIDEO', 'DOCUMENT', 'OTHER']);
const DELETABLE_TOPIC_STATES = new Set(['INBOX', 'VERIFIED', 'CANDIDATE']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function ok(res, data = null, message = 'ok') {
  return res.status(200).json({ code: 200, message, data });
}

function reason(body) {
  return text(body?.reason, 3000);
}

function optionalScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 100) return undefined;
  return score;
}

function optionalDate(value) {
  if (!value) return null;
  return DATE_PATTERN.test(String(value)) ? String(value) : undefined;
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20)
    .map(item => Array.isArray(item)
      ? [text(item[0], 80), text(item[1], 500)]
      : [text(item?.label, 80), text(item?.url, 500)])
    .filter(pair => pair[0] || pair[1]);
}

function jsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mapTopic(row) {
  return {
    id: row.id, code: row.code, title: row.title, channel: row.channel,
    status: row.status, score: row.score, scheduledFor: row.scheduled_for,
    evidence: row.evidence, sources: row.sources || [],
    productConnection: row.product_connection, publishedUrl: row.published_url,
    assignedRole: row.assigned_role || '', assignedTo: row.assigned_to || '',
    dueAt: row.due_at, brief: row.brief || {}, draft: row.draft || {},
    blocker: row.blocker || '', version: Number(row.version || 1),
    sourceName: row.source_name || '', sourceKeyword: row.source_keyword || '',
    sourceUrl: row.source_url || '', sourceAuthor: row.source_author || '',
    sourceExternalKey: row.source_external_key || '',
    sourcePublishedAt: row.source_published_at, capturedAt: row.captured_at,
    sourceLikes: row.source_likes, evidenceLevel: row.evidence_level || 'UNKNOWN',
    trendStatus: row.trend_status || 'UNKNOWN', rawMetadata: row.raw_metadata || {},
    allowedTransitions: TRANSITIONS[row.status] || [],
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

async function recordTopicVersion(client, req, row, changeReason) {
  await client.query(
    `INSERT INTO content_topic_versions
      (id, topic_id, version, snapshot, change_reason, created_by, actor_type, actor_key)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'HUMAN', $7)
     ON CONFLICT (topic_id, version) DO NOTHING`,
    [crypto.randomUUID(), row.id, row.version, JSON.stringify(topicSnapshot(row)),
      changeReason, req.admin.userId, req.admin.nickname || req.admin.mobile || req.admin.role]
  );
}

async function recordContentActivity(client, req, { topicId = null, sourceId = null, action, detail = {} }) {
  await client.query(
    `INSERT INTO content_activity_events
      (id, topic_id, source_id, action, actor_type, actor_key, detail)
     VALUES ($1, $2, $3, $4, 'HUMAN', $5, $6::jsonb)`,
    [crypto.randomUUID(), topicId, sourceId, action,
      req.admin.nickname || req.admin.mobile || req.admin.role, JSON.stringify(detail)]
  );
}

function mapHotspot(row) {
  return {
    id: row.id, capturedOn: row.captured_on, source: row.source, keyword: row.keyword,
    title: row.title, url: row.url, likes: row.likes, score: row.score,
    analysis: row.analysis, suggestTopic: row.suggest_topic,
    promotedTopicId: row.promoted_topic_id, externalKey: row.external_key,
    author: row.author, sourcePublishedAt: row.source_published_at,
    capturedAt: row.captured_at, evidenceLevel: row.evidence_level,
    trendStatus: row.trend_status, rejectedReason: row.rejected_reason,
    relation: row.relation || null, createdAt: row.created_at
  };
}

router.get('/content/overview', requirePermission('content.read'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT
       (SELECT count(*) FROM content_topics)::int AS items_total,
       (SELECT count(*) FROM content_topics WHERE status = 'INBOX')::int AS items_inbox,
       (SELECT count(*) FROM content_topics WHERE status = 'VERIFIED')::int AS items_verified,
       (SELECT count(*) FROM content_topics WHERE status = 'LOCKED')::int AS topics_locked,
       (SELECT count(*) FROM content_topics WHERE status = 'SCHEDULED')::int AS topics_scheduled,
       (SELECT count(*) FROM content_topics WHERE status = 'PUBLISHED')::int AS topics_published,
       (SELECT count(*) FROM content_topics
         WHERE captured_at >= CURRENT_DATE - INTERVAL '7 days')::int AS captured_7d`
  );
  return ok(res, result.rows[0]);
}));

router.get('/content/topics', requirePermission('content.read'), asyncRoute(async (req, res) => {
  const status = text(req.query?.status, 24).toUpperCase();
  const channel = text(req.query?.channel, 32).toUpperCase();
  const query = text(req.query?.query, 120);
  const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 100));
  const result = await db.query(
    `SELECT * FROM content_topics
      WHERE ($1 = '' OR status = $1) AND ($2 = '' OR channel = $2)
        AND ($3 = '' OR (title ILIKE '%' || $3 || '%' OR code ILIKE '%' || $3 || '%'
                         OR product_connection ILIKE '%' || $3 || '%'
                         OR source_name ILIKE '%' || $3 || '%'
                         OR source_keyword ILIKE '%' || $3 || '%'))
      ORDER BY scheduled_for DESC NULLS LAST, updated_at DESC
      LIMIT $4`,
    [TOPIC_STATE_SET.has(status) ? status : '', CHANNELS.has(channel) ? channel : '', query, limit]
  );
  return ok(res, { items: result.rows.map(mapTopic) });
}));

router.get('/content/topics/:id', requirePermission('content.read'), asyncRoute(async (req, res) => {
  const id = String(req.params.id || '');
  if (!UUID_PATTERN.test(id)) return adminFail(res, 400, '选题 ID 不合法');
  const [topic, sources, reviews, assets, publications, versions, activity] = await Promise.all([
    db.query('SELECT * FROM content_topics WHERE id = $1', [id]),
    db.query(
      `SELECT h.*, ts.relation
         FROM content_topic_sources ts JOIN content_hotspots h ON h.id = ts.source_id
        WHERE ts.topic_id = $1 ORDER BY h.captured_at DESC`, [id]
    ),
    db.query(
      `SELECT id, topic_version, review_type, decision, notes, rubric,
              reviewer_role, created_at
         FROM content_reviews WHERE topic_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]
    ),
    db.query(
      `SELECT id, topic_version, kind, url, storage_key, label, provenance, created_at
         FROM content_assets WHERE topic_id = $1 ORDER BY created_at DESC`, [id]
    ),
    db.query(
      `SELECT id, topic_version, channel, frozen_content_hash, status, scheduled_for,
              platform_publication_id, published_url, error_message, created_at, updated_at
         FROM content_publications WHERE topic_id = $1 ORDER BY created_at DESC`, [id]
    ),
    db.query(
      `SELECT id, version, change_reason, actor_type, actor_key, created_at
         FROM content_topic_versions WHERE topic_id = $1 ORDER BY version DESC LIMIT 50`, [id]
    ),
    db.query(
      `SELECT id, action, actor_type, actor_key, detail, created_at
         FROM content_activity_events WHERE topic_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]
    )
  ]);
  if (!topic.rowCount) return adminFail(res, 404, '选题不存在');
  const resolvedAssets = await Promise.all(assets.rows.map(async asset => ({
    ...asset,
    url: asset.storage_key?.startsWith('private/content-ops/')
      ? await signPrivateObjectUrl(asset.storage_key, 60 * 60)
      : asset.url
  })));
  return ok(res, {
    topic: mapTopic(topic.rows[0]),
    sources: sources.rows.map(mapHotspot),
    reviews: reviews.rows,
    assets: resolvedAssets,
    publications: publications.rows,
    versions: versions.rows,
    activity: activity.rows
  });
}));

router.post('/content/topics', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const title = text(req.body?.title, 300);
  const operationReason = reason(req.body);
  if (!title || !operationReason) return adminFail(res, 400, '请填写选题标题和创建原因');
  const status = 'CANDIDATE';
  const channel = text(req.body?.channel, 32).toUpperCase() || 'XHS_PERSONAL';
  const score = optionalScore(req.body?.score);
  const scheduledFor = optionalDate(req.body?.scheduledFor);
  if (!CHANNELS.has(channel)) return adminFail(res, 400, '发布渠道不合法');
  if (score === undefined) return adminFail(res, 400, '打分必须是 0-100 的整数或留空');
  if (scheduledFor === undefined) return adminFail(res, 400, '排期日期格式必须是 YYYY-MM-DD');
  const code = text(req.body?.code, 32).toUpperCase()
    || `T${Date.now().toString(36).toUpperCase()}`;
  const topic = await db.transaction(async client => {
    const result = await client.query(
      `INSERT INTO content_topics
        (id, code, title, channel, status, score, scheduled_for, evidence,
         sources, product_connection, published_url, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9::jsonb, $10, $11, $12, $12)
       RETURNING *`,
      [crypto.randomUUID(), code, title, channel, status, score, scheduledFor,
        text(req.body?.evidence, 160), JSON.stringify(normalizeSources(req.body?.sources)),
        text(req.body?.productConnection, 3000), '',
        req.admin.userId]
    );
    await recordAdminAudit({
      req, action: 'CONTENT_TOPIC_CREATED', targetType: 'CONTENT_TOPIC',
      targetId: result.rows[0].id, reason: operationReason, after: result.rows[0]
    }, client);
    await recordTopicVersion(client, req, result.rows[0], operationReason);
    await recordContentActivity(client, req, {
      topicId: result.rows[0].id, action: 'TOPIC_CREATED', detail: { version: 1 }
    });
    return result.rows[0];
  });
  return ok(res, mapTopic(topic), '选题已创建');
}));

router.patch('/content/topics/:id', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const id = String(req.params.id || '');
  if (!UUID_PATTERN.test(id)) return adminFail(res, 400, '选题 ID 不合法');
  const operationReason = reason(req.body);
  if (!operationReason) return adminFail(res, 400, '请写明本次修改原因');
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return adminFail(res, 400, '请提供当前 expectedVersion，避免覆盖他人修改');
  }
  const fields = [];
  const values = [];
  const push = (column, value, cast = '') => { values.push(value); fields.push(`${column} = $${fields.length + 1}${cast}`); };
  if (req.body?.title !== undefined) {
    const title = text(req.body.title, 300);
    if (!title) return adminFail(res, 400, '选题标题不能为空');
    push('title', title);
  }
  if (req.body?.status !== undefined) {
    const status = text(req.body.status, 24).toUpperCase();
    if (!TOPIC_STATE_SET.has(status)) return adminFail(res, 400, '选题状态不合法');
    return adminFail(res, 400, '请使用受控状态转换接口修改选题状态');
  }
  if (req.body?.channel !== undefined) {
    const channel = text(req.body.channel, 32).toUpperCase();
    if (!CHANNELS.has(channel)) return adminFail(res, 400, '发布渠道不合法');
    push('channel', channel);
  }
  if (req.body?.score !== undefined) {
    const score = optionalScore(req.body.score);
    if (score === undefined) return adminFail(res, 400, '打分必须是 0-100 的整数或留空');
    push('score', score);
  }
  if (req.body?.scheduledFor !== undefined) {
    const scheduledFor = optionalDate(req.body.scheduledFor);
    if (scheduledFor === undefined) return adminFail(res, 400, '排期日期格式必须是 YYYY-MM-DD');
    push('scheduled_for', scheduledFor, '::date');
  }
  if (req.body?.evidence !== undefined) push('evidence', text(req.body.evidence, 160));
  if (req.body?.sources !== undefined) push('sources', JSON.stringify(normalizeSources(req.body.sources)), '::jsonb');
  if (req.body?.productConnection !== undefined) push('product_connection', text(req.body.productConnection, 3000));
  if (req.body?.publishedUrl !== undefined) {
    return adminFail(res, 400, '发布地址只能由成功的发布记录回写');
  }
  if (req.body?.assignedRole !== undefined) push('assigned_role', text(req.body.assignedRole, 80));
  if (req.body?.assignedTo !== undefined) push('assigned_to', text(req.body.assignedTo, 160));
  if (req.body?.dueAt !== undefined) {
    const dueAt = req.body.dueAt ? new Date(req.body.dueAt) : null;
    if (dueAt && !Number.isFinite(dueAt.getTime())) return adminFail(res, 400, '截止时间格式不正确');
    push('due_at', dueAt ? dueAt.toISOString() : null, '::timestamptz');
  }
  if (req.body?.brief !== undefined) push('brief', JSON.stringify(jsonObject(req.body.brief)), '::jsonb');
  if (req.body?.draft !== undefined) push('draft', JSON.stringify(jsonObject(req.body.draft)), '::jsonb');
  if (req.body?.blocker !== undefined) push('blocker', text(req.body.blocker, 3000));
  if (!fields.length) return adminFail(res, 400, '没有需要更新的字段');
  values.push(req.admin.userId, id, expectedVersion);
  const updated = await db.transaction(async client => {
    const before = await client.query('SELECT * FROM content_topics WHERE id = $1', [id]);
    if (!before.rowCount) return null;
    const result = await client.query(
      `UPDATE content_topics SET ${fields.join(', ')}, version = version + 1,
         updated_by = $${values.length - 2}, updated_at = now()
        WHERE id = $${values.length - 1} AND version = $${values.length}
        RETURNING *`,
      values
    );
    if (!result.rowCount) return { conflict: true };
    await recordAdminAudit({
      req, action: 'CONTENT_TOPIC_UPDATED', targetType: 'CONTENT_TOPIC',
      targetId: id, reason: operationReason, before: before.rows[0], after: result.rows[0]
    }, client);
    await recordTopicVersion(client, req, result.rows[0], operationReason);
    await recordContentActivity(client, req, {
      topicId: id, action: 'TOPIC_CONTENT_UPDATED', detail: { version: result.rows[0].version }
    });
    return result.rows[0];
  });
  if (!updated) return adminFail(res, 404, '选题不存在');
  if (updated.conflict) return adminFail(res, 409, '选题已被其他人更新，请刷新后重试');
  return ok(res, mapTopic(updated), '选题已更新');
}));

router.post('/content/topics/:id/transitions', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const id = String(req.params.id || '');
  const to = text(req.body?.to, 24).toUpperCase();
  const operationReason = reason(req.body);
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!UUID_PATTERN.test(id) || !TOPIC_STATE_SET.has(to) || !operationReason) {
    return adminFail(res, 400, '状态转换参数或原因不完整');
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return adminFail(res, 400, '请提供当前 expectedVersion');
  }
  const transitioned = await db.transaction(async client => {
    const current = await client.query('SELECT * FROM content_topics WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rowCount) return { missing: true };
    const before = current.rows[0];
    if (Number(before.version) !== expectedVersion) return { conflict: true };
    if (!canTransition(before.status, to)) return { invalid: true, from: before.status };
    const requiredReview = transitionRequirement(to);
    if (requiredReview) {
      const review = await client.query(
        `SELECT decision FROM content_reviews
          WHERE topic_id = $1 AND topic_version = $2 AND review_type = $3
          ORDER BY created_at DESC LIMIT 1`,
        [id, before.version, requiredReview]
      );
      if (review.rows[0]?.decision !== 'PASS') return { reviewRequired: requiredReview };
    }
    if (to === 'PUBLISHED') {
      const publication = await client.query(
        `SELECT id, published_url FROM content_publications
          WHERE topic_id = $1 AND topic_version = $2 AND status = 'SUCCEEDED'
          ORDER BY updated_at DESC LIMIT 1`, [id, before.version]
      );
      if (!publication.rowCount || !publication.rows[0].published_url) return { publicationRequired: true };
    }
    const result = await client.query(
      `UPDATE content_topics SET status = $2, updated_by = $3, updated_at = now()
        WHERE id = $1 RETURNING *`, [id, to, req.admin.userId]
    );
    await recordAdminAudit({
      req, action: 'CONTENT_TOPIC_TRANSITIONED', targetType: 'CONTENT_TOPIC', targetId: id,
      reason: operationReason, before: { status: before.status, version: before.version },
      after: { status: to, version: before.version }
    }, client);
    await recordContentActivity(client, req, {
      topicId: id, action: 'TOPIC_TRANSITIONED',
      detail: { from: before.status, to, version: before.version, reason: operationReason }
    });
    return { topic: result.rows[0] };
  });
  if (transitioned.missing) return adminFail(res, 404, '选题不存在');
  if (transitioned.conflict) return adminFail(res, 409, '选题版本已变化，请刷新后重试');
  if (transitioned.invalid) return adminFail(res, 409, `不允许从 ${transitioned.from} 转到 ${to}`);
  if (transitioned.reviewRequired) return adminFail(res, 409, `当前版本需要 ${transitioned.reviewRequired} 审核通过`);
  if (transitioned.publicationRequired) return adminFail(res, 409, '没有成功发布记录，不能标记为已发布');
  return ok(res, mapTopic(transitioned.topic), '选题状态已推进');
}));

router.post('/content/topics/:id/reviews', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const id = String(req.params.id || '');
  const reviewType = text(req.body?.reviewType, 24).toUpperCase();
  const decision = text(req.body?.decision, 24).toUpperCase();
  const notes = text(req.body?.notes, 6000);
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!UUID_PATTERN.test(id) || !REVIEW_TYPES.has(reviewType) || !REVIEW_DECISIONS.has(decision)
      || !notes || !Number.isInteger(expectedVersion)) {
    return adminFail(res, 400, '审核类型、结论、意见或版本不完整');
  }
  const review = await db.transaction(async client => {
    const topic = await client.query('SELECT id, version FROM content_topics WHERE id = $1 FOR UPDATE', [id]);
    if (!topic.rowCount) return { missing: true };
    if (Number(topic.rows[0].version) !== expectedVersion) return { conflict: true };
    const result = await client.query(
      `INSERT INTO content_reviews
        (id, topic_id, topic_version, review_type, decision, notes, rubric,
         reviewer_user_id, reviewer_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING *`,
      [crypto.randomUUID(), id, expectedVersion, reviewType, decision, notes,
        JSON.stringify(jsonObject(req.body?.rubric)), req.admin.userId, req.admin.role]
    );
    await recordAdminAudit({
      req, action: `CONTENT_REVIEW_${reviewType}_${decision}`, targetType: 'CONTENT_TOPIC',
      targetId: id, reason: notes, after: result.rows[0]
    }, client);
    await recordContentActivity(client, req, {
      topicId: id, action: 'REVIEW_RECORDED',
      detail: { reviewType, decision, topicVersion: expectedVersion }
    });
    return { review: result.rows[0] };
  });
  if (review.missing) return adminFail(res, 404, '选题不存在');
  if (review.conflict) return adminFail(res, 409, '审核对应版本已经变化，请重新检查最新内容');
  return ok(res, review.review, '审核结论已记录');
}));

router.post('/content/topics/:id/assets', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const id = String(req.params.id || '');
  const kind = text(req.body?.kind, 24).toUpperCase();
  const url = text(req.body?.url, 1000);
  const storageKey = text(req.body?.storageKey, 1000);
  const expectedVersion = Number(req.body?.expectedVersion);
  const operationReason = reason(req.body);
  if (!UUID_PATTERN.test(id) || !ASSET_KINDS.has(kind) || (!url && !storageKey)
      || !Number.isInteger(expectedVersion) || !operationReason) {
    return adminFail(res, 400, '素材类型、地址、版本或来源说明不完整');
  }
  const asset = await db.transaction(async client => {
    const topic = await client.query('SELECT id, version FROM content_topics WHERE id = $1 FOR UPDATE', [id]);
    if (!topic.rowCount) return { missing: true };
    if (Number(topic.rows[0].version) !== expectedVersion) return { conflict: true };
    const result = await client.query(
      `INSERT INTO content_assets
        (id, topic_id, topic_version, kind, url, storage_key, label, provenance, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) RETURNING *`,
      [crypto.randomUUID(), id, expectedVersion, kind, url, storageKey,
        text(req.body?.label, 200), JSON.stringify(jsonObject(req.body?.provenance)), req.admin.userId]
    );
    await recordContentActivity(client, req, {
      topicId: id, action: 'ASSET_ADDED', detail: { assetId: result.rows[0].id, kind }
    });
    return { asset: result.rows[0] };
  });
  if (asset.missing) return adminFail(res, 404, '选题不存在');
  if (asset.conflict) return adminFail(res, 409, '选题版本已变化，请刷新后重试');
  return ok(res, asset.asset, '素材已加入当前内容版本');
}));

router.post('/content/topics/:id/publications', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const id = String(req.params.id || '');
  const expectedVersion = Number(req.body?.expectedVersion);
  const operationReason = reason(req.body);
  if (!UUID_PATTERN.test(id) || !Number.isInteger(expectedVersion) || !operationReason) {
    return adminFail(res, 400, '选题、版本或发布准备原因不完整');
  }
  const scheduledFor = req.body?.scheduledFor ? new Date(req.body.scheduledFor) : null;
  if (scheduledFor && !Number.isFinite(scheduledFor.getTime())) {
    return adminFail(res, 400, '预计发布时间格式不正确');
  }
  const publication = await db.transaction(async client => {
    const topic = await client.query('SELECT * FROM content_topics WHERE id = $1 FOR UPDATE', [id]);
    if (!topic.rowCount) return { missing: true };
    const row = topic.rows[0];
    if (Number(row.version) !== expectedVersion) return { conflict: true };
    if (row.status !== 'SCHEDULED') return { badState: true };
    const review = await client.query(
      `SELECT decision FROM content_reviews
        WHERE topic_id = $1 AND topic_version = $2 AND review_type = 'COMPLIANCE'
        ORDER BY created_at DESC LIMIT 1`, [id, expectedVersion]
    );
    if (review.rows[0]?.decision !== 'PASS') return { reviewRequired: true };
    const existing = await client.query(
      `SELECT id, status FROM content_publications
        WHERE topic_id = $1 AND topic_version = $2 AND channel = $3 FOR UPDATE`,
      [id, expectedVersion, row.channel]
    );
    if (['PUBLISHING', 'SUCCEEDED'].includes(existing.rows[0]?.status)) {
      return { activePublication: existing.rows[0].status };
    }
    const frozenHash = contentHash(topicSnapshot(row));
    const result = await client.query(
      `INSERT INTO content_publications
        (id, topic_id, topic_version, channel, frozen_content_hash, status,
         scheduled_for, created_by)
       VALUES ($1, $2, $3, $4, $5, 'READY', $6, $7)
       ON CONFLICT (topic_id, topic_version, channel) DO UPDATE
         SET status = 'READY', frozen_content_hash = EXCLUDED.frozen_content_hash,
             scheduled_for = EXCLUDED.scheduled_for, platform_publication_id = '',
             published_url = '', error_message = '', updated_at = now()
       RETURNING *`,
      [crypto.randomUUID(), id, expectedVersion, row.channel, frozenHash,
        scheduledFor ? scheduledFor.toISOString() : null, req.admin.userId]
    );
    await recordAdminAudit({
      req, action: 'CONTENT_PUBLICATION_PREPARED', targetType: 'CONTENT_PUBLICATION',
      targetId: result.rows[0].id, reason: operationReason, after: result.rows[0]
    }, client);
    await recordContentActivity(client, req, {
      topicId: id, action: 'PUBLICATION_PREPARED',
      detail: { publicationId: result.rows[0].id, frozenContentHash: frozenHash }
    });
    return { publication: result.rows[0] };
  });
  if (publication.missing) return adminFail(res, 404, '选题不存在');
  if (publication.conflict) return adminFail(res, 409, '选题版本已变化，请刷新后重试');
  if (publication.badState) return adminFail(res, 409, '只有待发布状态可以冻结发布版本');
  if (publication.reviewRequired) return adminFail(res, 409, '当前版本尚未通过合规审核');
  if (publication.activePublication) {
    return adminFail(res, 409, `发布任务已处于 ${publication.activePublication}，不能重复冻结`);
  }
  return ok(res, publication.publication, '发布版本已冻结；尚未执行外部发布');
}));

router.delete('/content/topics/:id', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const id = String(req.params.id || '');
  if (!UUID_PATTERN.test(id)) return adminFail(res, 400, '选题 ID 不合法');
  const operationReason = reason(req.body);
  const expectedVersion = Number(req.body?.expectedVersion);
  const confirmation = text(req.body?.confirmation, 32).toUpperCase();
  if (!operationReason) return adminFail(res, 400, '请填写删除原因');
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return adminFail(res, 400, '请提供有效的选题版本');
  }

  const deleted = await db.transaction(async client => {
    const topicResult = await client.query('SELECT * FROM content_topics WHERE id = $1 FOR UPDATE', [id]);
    if (!topicResult.rowCount) return { missing: true };
    const topic = topicResult.rows[0];
    if (Number(topic.version) !== expectedVersion) return { conflict: true };
    if (confirmation !== String(topic.code || '').toUpperCase()) return { badConfirmation: true };
    if (!DELETABLE_TOPIC_STATES.has(topic.status)) return { badState: topic.status };

    const dependencyResult = await client.query(
      `SELECT
         (SELECT count(*) FROM content_reviews WHERE topic_id = $1)::int AS reviews,
         (SELECT count(*) FROM content_publications WHERE topic_id = $1)::int AS publications`,
      [id]
    );
    const dependencies = dependencyResult.rows[0];
    if (dependencies.reviews > 0 || dependencies.publications > 0) return { dependencies };

    const assetResult = await client.query(
      'SELECT storage_key FROM content_assets WHERE topic_id = $1 AND storage_key <> $2',
      [id, '']
    );
    await recordAdminAudit({
      req,
      action: 'CONTENT_TOPIC_DELETED',
      targetType: 'content_topic',
      targetId: id,
      reason: operationReason,
      before: topic,
      after: null
    }, client);
    await client.query('DELETE FROM content_topics WHERE id = $1', [id]);
    return {
      topic: mapTopic(topic),
      storageKeys: assetResult.rows.map(row => row.storage_key)
    };
  });

  if (deleted.missing) return adminFail(res, 404, '选题不存在');
  if (deleted.conflict) return adminFail(res, 409, '选题版本已变化，请刷新后重试');
  if (deleted.badConfirmation) return adminFail(res, 400, '请输入完整内容编号确认删除');
  if (deleted.badState) return adminFail(res, 409, `当前阶段 ${deleted.badState} 不允许删除，只能删除待核验、已核验或候选内容`);
  if (deleted.dependencies) return adminFail(res, 409, '已有审核或发布记录，不能删除');

  const failedStorageKeys = [];
  for (const storageKey of deleted.storageKeys) {
    if (!String(storageKey).startsWith('private/content-ops/')) continue;
    try {
      await deletePrivateObject(storageKey);
    } catch (error) {
      failedStorageKeys.push(storageKey);
      console.error('[content-topic-delete] COS cleanup failed', { topicId: id, storageKey, error: error.message });
    }
  }
  return ok(res, {
    id,
    code: deleted.topic.code,
    removedAssets: deleted.storageKeys.length,
    storageCleanupPending: failedStorageKeys.length
  }, '内容已删除');
}));

router.get('/content/hotspots', requirePermission('content.read'), asyncRoute(async (req, res) => {
  const keyword = text(req.query?.keyword, 80);
  const source = text(req.query?.source, 80);
  const limit = Math.min(500, Math.max(1, Number(req.query?.limit) || 100));
  const result = await db.query(
    `SELECT * FROM content_hotspots
      WHERE ($1 = '' OR keyword = $1) AND ($2 = '' OR source = $2)
      ORDER BY captured_on DESC, created_at DESC
      LIMIT $3`,
    [keyword, source, limit]
  );
  return ok(res, { items: result.rows.map(mapHotspot) });
}));

router.post('/content/items:batchImport', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const operationReason = reason(req.body);
  if (!operationReason) return adminFail(res, 400, '请写明入库原因或数据来源说明');
  const candidates = Array.isArray(req.body?.items) ? req.body.items.slice(0, 100) : [req.body];
  const normalized = [];
  for (const item of candidates) {
    const title = text(item?.title, 300);
    if (!title) continue;
    const capturedOn = optionalDate(item?.capturedOn);
    if (capturedOn === undefined) return adminFail(res, 400, 'capturedOn 格式必须是 YYYY-MM-DD');
    const score = optionalScore(item?.score);
    if (score === undefined) return adminFail(res, 400, 'score 必须是 0-100 的整数或留空');
    const likes = item?.likes === null || item?.likes === undefined || item?.likes === ''
      ? null : Number(item.likes);
    if (likes !== null && (!Number.isInteger(likes) || likes < 0)) return adminFail(res, 400, 'likes 必须是非负整数或留空');
    const evidenceLevel = text(item?.evidenceLevel, 24).toUpperCase() || 'UNKNOWN';
    const trendStatus = text(item?.trendStatus, 24).toUpperCase() || 'UNKNOWN';
    if (!['VERIFIED', 'PARTIAL', 'WATCH', 'UNKNOWN'].includes(evidenceLevel)) {
      return adminFail(res, 400, 'evidenceLevel 不合法');
    }
    if (!['RISING', 'STABLE', 'FALLING', 'WATCH', 'UNKNOWN'].includes(trendStatus)) {
      return adminFail(res, 400, 'trendStatus 不合法');
    }
    const sourcePublishedAt = item?.sourcePublishedAt ? new Date(item.sourcePublishedAt) : null;
    if (sourcePublishedAt && !Number.isFinite(sourcePublishedAt.getTime())) {
      return adminFail(res, 400, 'sourcePublishedAt 格式不合法');
    }
    normalized.push({
      title, capturedOn, source: text(item?.source, 80), keyword: text(item?.keyword, 80),
      url: text(item?.url, 500), likes, score, analysis: text(item?.analysis, 3000),
      suggestTopic: text(item?.suggestTopic, 300), externalKey: text(item?.externalKey, 200) || null,
      author: text(item?.author, 160),
      sourcePublishedAt: sourcePublishedAt ? sourcePublishedAt.toISOString() : null,
      evidenceLevel, trendStatus, rawMetadata: jsonObject(item?.rawMetadata),
      contentHash: sourceFingerprint(item)
    });
  }
  if (!normalized.length) return adminFail(res, 400, '没有可入库的热点样本（title 必填）');
  const inserted = await db.transaction(async client => {
    const rows = [];
    for (const item of normalized) {
      const itemId = crypto.randomUUID();
      const code = `S${itemId.replaceAll('-', '').slice(0, 15).toUpperCase()}`;
      const result = await client.query(
        `INSERT INTO content_topics
          (id, code, title, channel, status, score, evidence, sources,
           product_connection, published_url, created_by, updated_by,
           source_name, source_keyword, source_url, source_author,
           source_external_key, source_published_at, captured_at, source_likes,
           evidence_level, trend_status, content_hash, raw_metadata, brief)
         VALUES ($1, $2, $3, 'XHS_PERSONAL', 'INBOX', $4, 'SOURCE_CAPTURED', '[]'::jsonb,
                 $5, '', $6, $6, $7, $8, $9, $10, $11, $12::timestamptz,
                 COALESCE(NULLIF($13, '')::date::timestamptz, now()), $14, $15, $16,
                 $17, $18::jsonb, $19::jsonb)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [itemId, code, item.title, item.score, item.analysis, req.admin.userId,
          item.source, item.keyword, item.url, item.author, item.externalKey,
          item.sourcePublishedAt, item.capturedOn, item.likes, item.evidenceLevel,
          item.trendStatus, item.contentHash, JSON.stringify(item.rawMetadata),
          JSON.stringify({ sourceAnalysis: item.analysis, suggestedTopic: item.suggestTopic })]
      );
      if (result.rowCount) {
        rows.push(result.rows[0]);
        await recordTopicVersion(client, req, result.rows[0], operationReason);
        await recordContentActivity(client, req, {
          topicId: result.rows[0].id, action: 'SOURCE_INGESTED', detail: { source: item.source }
        });
      }
    }
    await recordAdminAudit({
      req, action: 'CONTENT_ITEMS_IMPORTED', targetType: 'CONTENT_TOPIC',
      targetId: `${rows.length} items`, reason: operationReason,
      after: rows.map(row => ({ id: row.id, title: row.title, source: row.source_name }))
    }, client);
    return rows;
  });
  return ok(res, {
    received: normalized.length,
    imported: inserted.length,
    duplicates: normalized.length - inserted.length,
    items: inserted.map(mapTopic)
  }, `已进入统一内容池 ${inserted.length} 条，跳过 ${normalized.length - inserted.length} 条重复`);
}));

router.patch('/content/hotspots/:id', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const id = String(req.params.id || '');
  if (!UUID_PATTERN.test(id)) return adminFail(res, 400, '热点样本 ID 不合法');
  const operationReason = reason(req.body);
  if (!operationReason) return adminFail(res, 400, '请写明本次修改原因');
  const fields = [];
  const values = [];
  const push = (column, value, cast = '') => { values.push(value); fields.push(`${column} = $${fields.length + 1}${cast}`); };
  if (req.body?.score !== undefined) {
    const score = optionalScore(req.body.score);
    if (score === undefined) return adminFail(res, 400, 'score 必须是 0-100 的整数或留空');
    push('score', score, '::int');
  }
  if (req.body?.analysis !== undefined) push('analysis', text(req.body.analysis, 3000));
  if (req.body?.suggestTopic !== undefined) push('suggest_topic', text(req.body.suggestTopic, 300));
  if (req.body?.likes !== undefined) {
    const likes = req.body.likes === null || req.body.likes === '' ? null : Number(req.body.likes);
    if (likes !== null && !Number.isFinite(likes)) return adminFail(res, 400, 'likes 必须是数字或留空');
    push('likes', likes, '::int');
  }
  if (!fields.length) return adminFail(res, 400, '没有需要更新的字段');
  values.push(id);
  const updated = await db.transaction(async client => {
    const before = await client.query('SELECT * FROM content_hotspots WHERE id = $1', [id]);
    if (!before.rowCount) return null;
    const result = await client.query(
      `UPDATE content_hotspots SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    await recordAdminAudit({
      req, action: 'CONTENT_HOTSPOT_UPDATED', targetType: 'CONTENT_HOTSPOT',
      targetId: id, reason: operationReason, before: before.rows[0], after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  if (!updated) return adminFail(res, 404, '热点样本不存在');
  return ok(res, mapHotspot(updated), '热点样本已更新');
}));

router.delete('/content/hotspots/:id', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const id = String(req.params.id || '');
  if (!UUID_PATTERN.test(id)) return adminFail(res, 400, '热点样本 ID 不合法');
  const operationReason = reason(req.body);
  if (!operationReason) return adminFail(res, 400, '请写明删除原因');
  const rejected = await db.transaction(async client => {
    const before = await client.query('SELECT * FROM content_hotspots WHERE id = $1', [id]);
    if (!before.rowCount) return null;
    const result = await client.query(
      'UPDATE content_hotspots SET rejected_reason = $2 WHERE id = $1 RETURNING *',
      [id, operationReason]
    );
    await recordAdminAudit({
      req, action: 'CONTENT_HOTSPOT_REJECTED', targetType: 'CONTENT_HOTSPOT',
      targetId: id, reason: operationReason, before: before.rows[0], after: result.rows[0]
    }, client);
    await recordContentActivity(client, req, {
      sourceId: id, action: 'SOURCE_REJECTED', detail: { reason: operationReason }
    });
    return result.rows[0];
  });
  if (!rejected) return adminFail(res, 404, '热点样本不存在');
  return ok(res, mapHotspot(rejected), '素材已拒绝并保留审计记录');
}));

router.post('/content/hotspots/:id/promote', requirePermission('content.write'), asyncRoute(async (req, res) => {
  const id = String(req.params.id || '');
  if (!UUID_PATTERN.test(id)) return adminFail(res, 400, '热点样本 ID 不合法');
  const operationReason = reason(req.body);
  if (!operationReason) return adminFail(res, 400, '请写明转为选题的原因');
  const unified = await db.query('SELECT status FROM content_topics WHERE id = $1', [id]);
  if (unified.rowCount) {
    return adminFail(res, 409, '该记录已进入统一内容池，请刷新后台并通过阶段按钮推进');
  }
  const promoted = await db.transaction(async client => {
    const hotspot = await client.query('SELECT * FROM content_hotspots WHERE id = $1', [id]);
    if (!hotspot.rowCount) return null;
    const sample = hotspot.rows[0];
    if (sample.promoted_topic_id) return { alreadyPromoted: sample.promoted_topic_id };
    const title = text(req.body?.title, 300) || sample.suggest_topic || sample.title;
    const code = text(req.body?.code, 32).toUpperCase() || `T${Date.now().toString(36).toUpperCase()}`;
    const result = await client.query(
      `INSERT INTO content_topics
        (id, code, title, channel, status, score, evidence, sources, product_connection, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'CANDIDATE', $5, $6, $7::jsonb, $8, $9, $9)
       RETURNING *`,
      [crypto.randomUUID(), code, title, CHANNELS.has(text(req.body?.channel, 32).toUpperCase())
        ? text(req.body.channel, 32).toUpperCase() : 'XHS_PERSONAL',
        sample.score, 'HOTSPOT_PROMOTED',
        JSON.stringify(sample.url ? [[sample.source || '热点样本', sample.url]] : []),
        text(sample.analysis, 3000), req.admin.userId]
    );
    await client.query('UPDATE content_hotspots SET promoted_topic_id = $2 WHERE id = $1', [id, result.rows[0].id]);
    await client.query(
      `INSERT INTO content_topic_sources (topic_id, source_id, relation, added_by)
       VALUES ($1, $2, 'EVIDENCE', $3) ON CONFLICT DO NOTHING`,
      [result.rows[0].id, id, req.admin.userId]
    );
    await recordAdminAudit({
      req, action: 'CONTENT_HOTSPOT_PROMOTED', targetType: 'CONTENT_TOPIC',
      targetId: result.rows[0].id, reason: operationReason,
      before: { hotspotId: id }, after: result.rows[0]
    }, client);
    await recordTopicVersion(client, req, result.rows[0], operationReason);
    await recordContentActivity(client, req, {
      topicId: result.rows[0].id, action: 'SOURCE_PROMOTED', detail: { sourceId: id }
    });
    return result.rows[0];
  });
  if (!promoted) return adminFail(res, 404, '热点样本不存在');
  if (promoted.alreadyPromoted) return adminFail(res, 409, '该素材已经转为候选选题');
  return ok(res, mapTopic(promoted), '已转为候选选题');
}));

module.exports = router;
