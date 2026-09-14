'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const config = require('../config');
const { createMediaSignature } = require('../security');
const {
  bumpCorpusRevision,
  enqueueDiaryIndex,
  invalidateDiaryDerivatives
} = require('../memory-store');
const { enqueueFriendSync, removeDiaryFriendEffects } = require('../friend-sync');
const { invalidateDiaryInquiryEvidence } = require('../inquiry-store');
const { listDiarySourceActivities } = require('../data-sources');
const { asyncRoute, fail, ok, pageParams, requireUser, text, visibility } = require('../http');

const router = express.Router();
router.use(requireUser);

function signedMediaUrl(mediaId) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const signature = createMediaSignature(mediaId, expires);
  return `${config.publicOrigin}/api/media/v1/${mediaId}?expires=${expires}&signature=${signature}`;
}

function diaryImageUrl(value) {
  const image = String(value || '');
  return /^https?:\/\//i.test(image) ? image : signedMediaUrl(image);
}

function mediaId(value) {
  const source = String(value || '');
  const match = source.match(/\/api\/media\/v1\/([0-9a-f-]{36})/i);
  if (match) return match[1];
  return /^[0-9a-f-]{36}$/i.test(source) ? source : null;
}

function mediaIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value.map(item => {
    const match = String(item || '').match(/\/api\/media\/v1\/([0-9a-f-]{36})/i);
    return match ? match[1] : (/^[0-9a-f-]{36}$/i.test(String(item || '')) ? String(item) : null);
  }).filter(Boolean);
  return [...new Set(ids)].slice(0, 9);
}

async function ownedMediaIds(value, userId) {
  const ids = mediaIds(value);
  if (!ids.length) return [];
  const result = await db.query(
    'SELECT id FROM media_assets WHERE user_id = $1 AND id = ANY($2::uuid[])',
    [userId, ids]
  );
  if (result.rowCount !== ids.length) throw Object.assign(new Error('Media ownership mismatch'), { code: 'SHROOM_MEDIA_OWNER' });
  return ids;
}

async function ownedCardIds(value, userId) {
  const ids = [...new Set((Array.isArray(value) ? value : [])
    .map(item => String(item && typeof item === 'object' ? item.id : item || ''))
    .filter(item => /^[0-9a-f-]{36}$/i.test(item)))].slice(0, 30);
  if (!ids.length) return [];
  const result = await db.query(
    'SELECT id FROM cards WHERE user_id = $1 AND id = ANY($2::uuid[])',
    [userId, ids]
  );
  if (result.rowCount !== ids.length) {
    throw Object.assign(new Error('Card ownership mismatch'), { code: 'SHROOM_CARD_OWNER' });
  }
  return ids;
}

async function ownedVoice(value, userId) {
  if (!value) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Invalid voice payload'), { code: 'SHROOM_MEDIA_OWNER' });
  }
  const id = mediaId(value.mediaId || value.id || value.url);
  if (!id) throw Object.assign(new Error('Invalid voice media'), { code: 'SHROOM_MEDIA_OWNER' });
  const result = await db.query(
    `SELECT id, mime_type FROM media_assets
      WHERE id = $1 AND user_id = $2 AND mime_type LIKE 'audio/%'`,
    [id, userId]
  );
  if (!result.rowCount) throw Object.assign(new Error('Voice ownership mismatch'), { code: 'SHROOM_MEDIA_OWNER' });
  const duration = Math.max(0, Math.min(600, Math.round(Number(value.duration) || 0)));
  const transcript = text(value.transcript, 5000);
  return {
    mediaId: id,
    duration,
    mimeType: result.rows[0].mime_type,
    transcript: transcript || null,
    transcribedAt: transcript ? text(value.transcribedAt, 40) || null : null,
    model: transcript ? text(value.model, 80) || null : null
  };
}

function diaryVoice(value) {
  if (!value || typeof value !== 'object') return null;
  const id = mediaId(value.mediaId || value.id || value.url);
  if (!id) return value.url ? value : null;
  return { ...value, mediaId: id, url: signedMediaUrl(id) };
}

function mapDiary(row) {
  return {
    id: row.id,
    date: row.date,
    content: row.content,
    mood: row.mood,
    images: (row.images || []).map(diaryImageUrl),
    voice: diaryVoice(row.voice),
    hour: row.hour,
    minute: row.minute,
    type: row.entry_type,
    linkedCards: row.linked_cards || [],
    visibility: row.visibility,
    aiAllowed: row.ai_allowed,
    contentVersion: row.content_version,
    createdAt: row.occurred_at,
    updatedAt: row.updated_at
  };
}

const selectFields = `id, content, mood, images, voice, hour, minute, entry_type,
  linked_cards, visibility, ai_allowed, content_version, occurred_at, updated_at,
  to_char(occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date`;

function occurredAtInput(body) {
  const explicit = text(body.createdAt, 32);
  if (explicit) return explicit;
  const localDate = text(body.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const hour = Number.isInteger(body.hour) && body.hour >= 0 && body.hour <= 23 ? body.hour : 12;
  const minute = Number.isInteger(body.minute) && body.minute >= 0 && body.minute <= 59 ? body.minute : 0;
  return `${localDate} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

router.get('/calendar', asyncRoute(async (req, res) => {
  const month = String(req.query.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return fail(res, 400, '月份格式不正确');
  }
  const result = await db.query(
    `WITH diary_days AS (
       SELECT (occurred_at AT TIME ZONE 'Asia/Shanghai')::date AS local_date,
              count(*)::int AS diary_count
         FROM diaries
        WHERE user_id = $1 AND deleted_at IS NULL
          AND occurred_at >= (($2 || '-01')::timestamp AT TIME ZONE 'Asia/Shanghai')
          AND occurred_at < ((($2 || '-01')::timestamp + interval '1 month') AT TIME ZONE 'Asia/Shanghai')
        GROUP BY 1
     ), source_days AS (
       SELECT (e.completed_at AT TIME ZONE 'Asia/Shanghai')::date AS local_date,
              count(DISTINCT (e.connection_id::text || ':' || regexp_replace(e.external_id, ':[^:]+$', '')))::int AS source_count
         FROM external_activity_events e
         JOIN data_source_connections c ON c.id = e.connection_id AND c.user_id = e.user_id
        WHERE e.user_id = $1 AND c.include_in_diary
          AND e.completed_at >= (($2 || '-01')::timestamp AT TIME ZONE 'Asia/Shanghai')
          AND e.completed_at < ((($2 || '-01')::timestamp + interval '1 month') AT TIME ZONE 'Asia/Shanghai')
        GROUP BY 1
     ), available_days AS (
       SELECT local_date FROM diary_days UNION SELECT local_date FROM source_days
     )
     SELECT to_char(a.local_date, 'YYYY-MM-DD') AS date,
            COALESCE(d.diary_count, 0)::int AS count,
            COALESCE(s.source_count, 0)::int AS source_count
       FROM available_days a
       LEFT JOIN diary_days d ON d.local_date = a.local_date
       LEFT JOIN source_days s ON s.local_date = a.local_date
      ORDER BY a.local_date`,
    [req.user.id, month]
  );
  return ok(res, { list: result.rows });
}));

router.get('/dates', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT to_char(local_date, 'YYYY-MM-DD') AS date FROM (
       SELECT (occurred_at AT TIME ZONE 'Asia/Shanghai')::date AS local_date
         FROM diaries WHERE user_id = $1 AND deleted_at IS NULL
       UNION
       SELECT (e.completed_at AT TIME ZONE 'Asia/Shanghai')::date AS local_date
         FROM external_activity_events e
         JOIN data_source_connections c ON c.id = e.connection_id AND c.user_id = e.user_id
        WHERE e.user_id = $1 AND c.include_in_diary
     ) available_dates ORDER BY local_date DESC`,
    [req.user.id]
  );
  return ok(res, result.rows.map(item => item.date));
}));

router.get('/stats', asyncRoute(async (req, res) => {
  const result = await db.query(
    `WITH local_diaries AS (
       SELECT (occurred_at AT TIME ZONE 'Asia/Shanghai')::date AS diary_date
         FROM diaries
        WHERE user_id = $1 AND deleted_at IS NULL
     ), current_year AS (
       SELECT EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Shanghai')::int AS year
     )
     SELECT current_year.year,
       count(local_diaries.diary_date)::int AS total_entries,
       count(DISTINCT local_diaries.diary_date)::int AS total_days,
       count(local_diaries.diary_date) FILTER (
         WHERE EXTRACT(YEAR FROM local_diaries.diary_date)::int = current_year.year
       )::int AS year_entries,
       count(DISTINCT local_diaries.diary_date) FILTER (
         WHERE EXTRACT(YEAR FROM local_diaries.diary_date)::int = current_year.year
       )::int AS year_days
     FROM current_year LEFT JOIN local_diaries ON true
     GROUP BY current_year.year`,
    [req.user.id]
  );
  const row = result.rows[0];
  return ok(res, {
    year: row.year,
    yearEntries: row.year_entries,
    yearDays: row.year_days,
    totalEntries: row.total_entries,
    totalDays: row.total_days
  });
}));

router.get('/index', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : null;
  const values = [req.user.id, pageSize, offset];
  const dateClause = date ? `AND (occurred_at AT TIME ZONE 'Asia/Shanghai')::date = $4::date` : '';
  if (date) values.push(date);
  const [items, total, actions, activities] = await Promise.all([
    db.query(
      `SELECT ${selectFields} FROM diaries
        WHERE user_id = $1 AND deleted_at IS NULL ${dateClause}
        ORDER BY occurred_at DESC LIMIT $2 OFFSET $3`,
      values
    ),
    db.query(
      `SELECT count(*)::int AS total FROM diaries
        WHERE user_id = $1 AND deleted_at IS NULL ${date ? `AND (occurred_at AT TIME ZONE 'Asia/Shanghai')::date = $2::date` : ''}`,
      date ? [req.user.id, date] : [req.user.id]
    ),
    date ? db.query(
      `SELECT e.id, e.todo_id, e.event_date, e.created_at, e.payload,
        t.content, t.result_text, p.name AS project_name
       FROM todo_events e
       JOIN todos t ON t.id = e.todo_id AND t.user_id = e.user_id AND t.deleted_at IS NULL
       LEFT JOIN todo_projects p ON p.id = t.project_id
       WHERE e.user_id = $1 AND e.event_type = 'COMPLETED' AND e.visible_in_diary
         AND e.valid AND e.event_date = $2::date
       ORDER BY e.created_at DESC`,
      [req.user.id, date]
    ) : Promise.resolve({ rows: [] }),
    date ? listDiarySourceActivities(db, req.user.id, date) : Promise.resolve([])
  ]);
  return ok(res, {
    list: items.rows.map(mapDiary), total: total.rows[0].total, page, pageSize,
    actionRecords: actions.rows.map(row => ({
      id: row.id,
      taskId: row.todo_id,
      title: row.content,
      result: row.result_text || row.payload?.result || '',
      projectName: row.project_name || '',
      completedAt: row.created_at
    })),
    activityRecords: activities
  });
}));

router.get('/view', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT ${selectFields} FROM diaries WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [req.query.id, req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '日记不存在');
  return ok(res, mapDiary(result.rows[0]));
}));

router.post('/create', asyncRoute(async (req, res) => {
  const content = text(req.body.content, 5000);
  const occurredAt = occurredAtInput(req.body);
  const [images, voice, linkedCards] = await Promise.all([
    ownedMediaIds(req.body.images, req.user.id),
    ownedVoice(req.body.voice, req.user.id),
    ownedCardIds(req.body.linkedCards, req.user.id)
  ]);
  if (!content && !voice) return fail(res, 400, '写点文字或留下一段语音吧');
  const result = await db.transaction(async client => {
    const inserted = await client.query(
      `INSERT INTO diaries
      (id, user_id, content, mood, images, voice, hour, minute, entry_type, linked_cards, visibility, occurred_at)
     VALUES
      ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10::jsonb, $11,
       COALESCE($12::timestamp AT TIME ZONE 'Asia/Shanghai', now()))
     RETURNING user_id, index_epoch, ${selectFields}`,
      [
      crypto.randomUUID(), req.user.id, content, text(req.body.mood, 32) || null, JSON.stringify(images),
      voice ? JSON.stringify(voice) : null,
      Number.isInteger(req.body.hour) ? req.body.hour : null,
      Number.isInteger(req.body.minute) ? req.body.minute : null,
      text(req.body.type, 48) || 'default', JSON.stringify(linkedCards),
      visibility(req.body.visibility), occurredAt
      ]
    );
    await enqueueDiaryIndex(client, inserted.rows[0]);
    await enqueueFriendSync(client, inserted.rows[0]);
    await bumpCorpusRevision(client, req.user.id);
    return inserted;
  });
  return ok(res, mapDiary(result.rows[0]), '日记已保存');
}));

router.put('/update', asyncRoute(async (req, res) => {
  const content = text(req.body.content, 5000);
  const occurredAt = occurredAtInput(req.body);
  const [images, voice, linkedCards] = await Promise.all([
    ownedMediaIds(req.body.images, req.user.id),
    ownedVoice(req.body.voice, req.user.id),
    ownedCardIds(req.body.linkedCards, req.user.id)
  ]);
  if (!content && !voice) return fail(res, 400, '写点文字或留下一段语音吧');
  const result = await db.transaction(async client => {
    const currentResult = await client.query(
      `SELECT id, user_id, content, voice, content_version, index_epoch, ai_allowed
         FROM diaries WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [req.query.id, req.user.id]
    );
    if (!currentResult.rowCount) return currentResult;
    const current = currentResult.rows[0];
    const contentChanged = current.content !== content;
    const voiceChanged = JSON.stringify(current.voice || null) !== JSON.stringify(voice || null);
    const analysisChanged = contentChanged || voiceChanged;
    if (analysisChanged) {
      await invalidateDiaryDerivatives(client, req.user.id, current.id, 'diary_content_changed');
    }
    const updated = await client.query(
      `UPDATE diaries SET
       content = $3, mood = $4, images = $5::jsonb, voice = $6::jsonb,
       hour = $7, minute = $8, entry_type = $9, linked_cards = $10::jsonb,
       visibility = $11,
       occurred_at = COALESCE($12::timestamp AT TIME ZONE 'Asia/Shanghai', occurred_at),
       content_version = content_version + CASE WHEN content IS DISTINCT FROM $3 OR voice IS DISTINCT FROM $6::jsonb THEN 1 ELSE 0 END,
       index_epoch = index_epoch + CASE WHEN content IS DISTINCT FROM $3 OR voice IS DISTINCT FROM $6::jsonb THEN 1 ELSE 0 END,
       updated_at = now()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING user_id, index_epoch, ${selectFields}`,
      [
      req.query.id, req.user.id, content, text(req.body.mood, 32) || null, JSON.stringify(images),
      voice ? JSON.stringify(voice) : null,
      Number.isInteger(req.body.hour) ? req.body.hour : null,
      Number.isInteger(req.body.minute) ? req.body.minute : null,
      text(req.body.type, 48) || 'default', JSON.stringify(linkedCards),
      visibility(req.body.visibility), occurredAt
      ]
    );
    if (analysisChanged && current.ai_allowed) {
      await enqueueDiaryIndex(client, updated.rows[0]);
      await enqueueFriendSync(client, updated.rows[0]);
    }
    if (contentChanged) {
      await invalidateDiaryInquiryEvidence(client, req.user.id, current.id, { content });
    }
    await bumpCorpusRevision(client, req.user.id);
    return updated;
  });
  if (!result.rowCount) return fail(res, 404, '日记不存在');
  return ok(res, mapDiary(result.rows[0]), '日记已更新');
}));

router.delete('/delete', asyncRoute(async (req, res) => {
  const result = await db.transaction(async client => {
    const updated = await client.query(
      `UPDATE diaries SET deleted_at = now(), ai_allowed = false, index_epoch = index_epoch + 1, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.query.id, req.user.id]
    );
    if (!updated.rowCount) return updated;
    await invalidateDiaryInquiryEvidence(client, req.user.id, req.query.id, { remove: true });
    await removeDiaryFriendEffects(client, req.user.id, req.query.id);
    await invalidateDiaryDerivatives(client, req.user.id, req.query.id, 'diary_deleted');
    await bumpCorpusRevision(client, req.user.id);
    return updated;
  });
  if (!result.rowCount) return fail(res, 404, '日记不存在');
  return ok(res, null, '日记已删除');
}));

router.get('/search', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const keyword = text(req.query.keyword, 100);
  if (!keyword) return ok(res, { list: [], total: 0, page, pageSize });
  const pattern = `%${keyword}%`;
  const [items, total] = await Promise.all([
    db.query(
      `SELECT ${selectFields} FROM diaries
        WHERE user_id = $1 AND deleted_at IS NULL AND (content ILIKE $2 OR COALESCE(voice::text, '') ILIKE $2)
        ORDER BY occurred_at DESC LIMIT $3 OFFSET $4`,
      [req.user.id, pattern, pageSize, offset]
    ),
    db.query(
      `SELECT count(*)::int AS total FROM diaries
        WHERE user_id = $1 AND deleted_at IS NULL AND (content ILIKE $2 OR COALESCE(voice::text, '') ILIKE $2)`,
      [req.user.id, pattern]
    )
  ]);
  return ok(res, { list: items.rows.map(mapDiary), total: total.rows[0].total, page, pageSize });
}));

router.patch('/ai-access', asyncRoute(async (req, res) => {
  if (typeof req.body.allowed !== 'boolean') return fail(res, 400, '请指定是否允许 AI 读取');
  const result = await db.transaction(async client => {
    const currentResult = await client.query(
      `SELECT id, user_id, content_version, index_epoch, ai_allowed
         FROM diaries WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [req.query.id, req.user.id]
    );
    if (!currentResult.rowCount) return currentResult;
    const current = currentResult.rows[0];
    if (current.ai_allowed === req.body.allowed) return currentResult;
    await invalidateDiaryDerivatives(client, req.user.id, current.id, 'diary_ai_access_changed');
    await invalidateDiaryInquiryEvidence(client, req.user.id, current.id);
    const updated = await client.query(
      `UPDATE diaries SET ai_allowed = $3, index_epoch = index_epoch + 1, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, content_version, index_epoch, ai_allowed`,
      [req.query.id, req.user.id, req.body.allowed]
    );
    if (req.body.allowed) {
      await enqueueDiaryIndex(client, updated.rows[0]);
      await enqueueFriendSync(client, updated.rows[0], { force: true });
    } else {
      await removeDiaryFriendEffects(client, req.user.id, req.query.id);
    }
    await bumpCorpusRevision(client, req.user.id);
    return updated;
  });
  if (!result.rowCount) return fail(res, 404, '日记不存在');
  return ok(res, { id: result.rows[0].id, aiAllowed: result.rows[0].ai_allowed });
}));

module.exports = router;
