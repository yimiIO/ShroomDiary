'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const config = require('../config');
const { asyncRoute, fail, ok, requireUser, text } = require('../http');
const { hashToken } = require('../security');
const {
  listDiarySourceActivities,
  normalizeCodexActivity,
  normalizeSyncInterval,
  publicConnection
} = require('../data-sources');

const router = express.Router();
const pairAttempts = new Map();

function sourceInput(message) {
  return Object.assign(new Error(message), { code: 'SHROOM_DATA_SOURCE_INPUT' });
}

function pairingCode() {
  return crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 10);
}

function checkPairRate(req) {
  const now = Date.now();
  const recent = (pairAttempts.get(req.ip) || []).filter(value => now - value < 15 * 60 * 1000);
  if (recent.length >= 20) throw Object.assign(new Error('配对尝试过多，请稍后再试'), { code: 'SHROOM_DATA_SOURCE_RATE' });
  recent.push(now);
  pairAttempts.set(req.ip, recent);
  if (pairAttempts.size > 1000) {
    for (const [key, attempts] of pairAttempts) {
      if (!attempts.some(value => now - value < 15 * 60 * 1000)) pairAttempts.delete(key);
    }
  }
}

async function sourceConnection(req, { lock = false } = {}) {
  const token = text(req.get('x-shroom-source-token'), 256);
  if (!token) return null;
  const result = await db.query(
    `SELECT * FROM data_source_connections
      WHERE sync_token_hash = $1 AND status = 'ACTIVE'${lock ? ' FOR UPDATE' : ''}`,
    [hashToken(token)]
  );
  return result.rows[0] || null;
}

router.post('/codex/pair', asyncRoute(async (req, res) => {
  checkPairRate(req);
  const code = text(req.body.code, 32).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!code) return fail(res, 400, '请输入菇日记生成的配对码');
  const token = crypto.randomBytes(48).toString('base64url');
  const result = await db.query(
    `UPDATE data_source_connections
        SET status = 'ACTIVE', device_name = $2, sync_token_hash = $3,
            pairing_code_hash = NULL, pairing_expires_at = NULL,
            connected_at = COALESCE(connected_at, now()), disconnected_at = NULL,
            last_error = '', updated_at = now()
      WHERE pairing_code_hash = $1 AND pairing_expires_at > now() AND status = 'PENDING'
      RETURNING id, provider, display_name, sync_interval_hours`,
    [hashToken(code), text(req.body.deviceName, 120) || 'Codex 本机连接器', hashToken(token)]
  );
  if (!result.rowCount) return fail(res, 400, '配对码无效或已过期');
  return ok(res, {
    connectionId: result.rows[0].id,
    provider: result.rows[0].provider,
    displayName: result.rows[0].display_name,
    syncIntervalHours: Number(result.rows[0].sync_interval_hours),
    token
  }, '菇日记已连接 Codex');
}));

router.post('/codex/events', asyncRoute(async (req, res) => {
  const connection = await sourceConnection(req);
  if (!connection) return fail(res, 401, '数据源连接已失效，请在菇日记里重新连接');
  if (!Array.isArray(req.body.events)) return fail(res, 400, '同步数据格式不正确');
  if (req.body.events.length > 250) return fail(res, 400, '单次最多同步 250 条任务');
  const activities = req.body.events.map(normalizeCodexActivity);
  if (activities.some(item => !item)) return fail(res, 400, '任务数据不完整或无法识别');
  await db.transaction(async client => {
    const locked = await client.query(
      `SELECT id, user_id FROM data_source_connections
        WHERE id = $1 AND sync_token_hash = $2 AND status = 'ACTIVE' FOR UPDATE`,
      [connection.id, connection.sync_token_hash]
    );
    if (!locked.rowCount) throw sourceInput('数据源连接已暂停或失效');
    for (const activity of activities) {
      await client.query(
        `INSERT INTO external_activity_events
          (id, user_id, connection_id, provider, external_id, activity_type, title,
           project_label, source_kind, started_at, completed_at, task_runtime_seconds,
           active_seconds_estimate, outcome_status, metadata)
         VALUES ($1, $2, $3, 'CODEX', $4, 'CODEX_TASK', $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
         ON CONFLICT (connection_id, external_id) DO UPDATE SET
           title = EXCLUDED.title, project_label = EXCLUDED.project_label,
           source_kind = EXCLUDED.source_kind, started_at = EXCLUDED.started_at,
           completed_at = EXCLUDED.completed_at, task_runtime_seconds = EXCLUDED.task_runtime_seconds,
           active_seconds_estimate = EXCLUDED.active_seconds_estimate,
           outcome_status = EXCLUDED.outcome_status, metadata = EXCLUDED.metadata, updated_at = now()`,
        [crypto.randomUUID(), connection.user_id, connection.id, activity.externalId, activity.title,
          activity.projectLabel, activity.sourceKind, activity.startedAt, activity.completedAt,
          activity.taskRuntimeSeconds, activity.activeSecondsEstimate, activity.outcomeStatus,
          JSON.stringify(activity.metadata)]
      );
    }
    await client.query(
      `UPDATE data_source_connections SET last_cursor = $2, last_sync_at = now(), last_error = '', updated_at = now()
        WHERE id = $1`,
      [connection.id, text(req.body.cursor, 1000)]
    );
  });
  return ok(res, { accepted: activities.length, cursor: text(req.body.cursor, 1000) }, '菇日记已收到 Codex 任务记录');
}));

router.get('/codex/config', asyncRoute(async (req, res) => {
  const connection = await sourceConnection(req);
  if (!connection) return fail(res, 401, '数据源连接已失效，请在菇日记里重新连接');
  return ok(res, {
    connectionId: connection.id,
    displayName: connection.display_name,
    syncIntervalHours: Number(connection.sync_interval_hours),
    lastSyncAt: connection.last_sync_at,
    lastCursor: connection.last_cursor || ''
  });
}));

router.use(requireUser);

router.get('/connections', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT c.*, count(e.id)::int AS event_count, max(e.completed_at) AS last_activity_at
       FROM data_source_connections c
       LEFT JOIN external_activity_events e ON e.connection_id = c.id AND e.user_id = c.user_id
      WHERE c.user_id = $1
      GROUP BY c.id ORDER BY c.created_at DESC`,
    [req.user.id]
  );
  return ok(res, result.rows.map(publicConnection));
}));

router.post('/codex/connections', asyncRoute(async (req, res) => {
  const code = pairingCode();
  const id = crypto.randomUUID();
  const interval = normalizeSyncInterval(req.body.syncIntervalHours);
  const result = await db.query(
    `INSERT INTO data_source_connections
      (id, user_id, provider, display_name, status, sync_interval_hours,
       include_in_diary, ai_allowed, pairing_code_hash, pairing_expires_at)
     VALUES ($1, $2, 'CODEX', '菇日记 · Codex 数据源', 'PENDING', $3, $4, $5, $6, now() + interval '10 minutes')
     ON CONFLICT (user_id, provider) DO UPDATE SET
       status = 'PENDING', sync_interval_hours = EXCLUDED.sync_interval_hours,
       include_in_diary = EXCLUDED.include_in_diary, ai_allowed = EXCLUDED.ai_allowed,
       pairing_code_hash = EXCLUDED.pairing_code_hash, pairing_expires_at = EXCLUDED.pairing_expires_at,
       sync_token_hash = NULL, last_error = '', paused_at = NULL, updated_at = now()
     RETURNING *`,
    [id, req.user.id, interval, req.body.includeInDiary !== false, req.body.aiAllowed !== false, hashToken(code)]
  );
  const origin = String(config.publicOrigin || '').replace(/\/$/, '');
  return ok(res, {
    connection: publicConnection(result.rows[0]),
    pairingCode: code,
    expiresInMinutes: 10,
    command: `shroom-codex connect --server ${origin} --code ${code}`
  }, '请在这台电脑上完成 Codex 配对');
}));

router.patch('/connections/:id', asyncRoute(async (req, res) => {
  const current = await db.query(
    `SELECT * FROM data_source_connections
      WHERE id = $1 AND user_id = $2 AND status <> 'DISCONNECTED'`,
    [req.params.id, req.user.id]
  );
  if (!current.rowCount) return fail(res, 404, '数据源连接不存在');
  const row = current.rows[0];
  const requestedStatus = ['ACTIVE', 'PAUSED'].includes(req.body.status) ? req.body.status : row.status;
  if (row.status === 'PENDING' && requestedStatus === 'ACTIVE') return fail(res, 400, '请先在 Codex 电脑上完成配对');
  const result = await db.query(
    `UPDATE data_source_connections SET
       sync_interval_hours = $3, include_in_diary = $4, ai_allowed = $5, status = $6,
       paused_at = CASE WHEN $6 = 'PAUSED' THEN COALESCE(paused_at, now()) ELSE NULL END,
       updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.user.id,
      req.body.syncIntervalHours === undefined ? Number(row.sync_interval_hours) : normalizeSyncInterval(req.body.syncIntervalHours),
      typeof req.body.includeInDiary === 'boolean' ? req.body.includeInDiary : row.include_in_diary,
      typeof req.body.aiAllowed === 'boolean' ? req.body.aiAllowed : row.ai_allowed,
      requestedStatus]
  );
  return ok(res, publicConnection(result.rows[0]), requestedStatus === 'PAUSED' ? '已暂停菇日记的 Codex 同步' : '数据源设置已更新');
}));

router.delete('/connections/:id', asyncRoute(async (req, res) => {
  const purge = String(req.query.purge || '') === 'true';
  const result = await db.transaction(async client => {
    const current = await client.query(
      `SELECT id FROM data_source_connections
        WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [req.params.id, req.user.id]
    );
    if (!current.rowCount) return null;
    if (purge) {
      const affected = await client.query(
        `SELECT id FROM diary_analysis
          WHERE user_id = $1 AND source_activities @> $2::jsonb`,
        [req.user.id, JSON.stringify([{ connectionId: req.params.id }])]
      );
      if (affected.rowCount) {
        await client.query(
          `UPDATE diary_analysis SET status = 'failed', five_views = '{}'::jsonb,
             observations = '[]'::jsonb, todo_candidates = '[]'::jsonb,
             card_suggestion = '{}'::jsonb, source_activities = '[]'::jsonb,
             error_message = '数据源已删除，这份旧分析已失效', updated_at = now()
           WHERE user_id = $1 AND id = ANY($2::uuid[])`,
          [req.user.id, affected.rows.map(item => item.id)]
        );
      }
      await client.query(
        'DELETE FROM external_activity_events WHERE connection_id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
    }
    if (purge) {
      await client.query('DELETE FROM data_source_connections WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    } else {
      await client.query(
        `UPDATE data_source_connections SET status = 'DISCONNECTED', ai_allowed = false,
           pairing_code_hash = NULL, pairing_expires_at = NULL, sync_token_hash = NULL,
           disconnected_at = now(), updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id]
      );
    }
    return { id: req.params.id, purged: purge };
  });
  if (!result) return fail(res, 404, '数据源连接不存在');
  return ok(res, result, purge ? 'Codex 连接和已同步记录已删除' : 'Codex 数据源已断开');
}));

router.get('/activities', asyncRoute(async (req, res) => {
  const date = text(req.query.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 400, '日期格式不正确');
  return ok(res, await listDiarySourceActivities(db, req.user.id, date));
}));

module.exports = router;
