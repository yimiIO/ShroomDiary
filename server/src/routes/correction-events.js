'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { asyncRoute, fail, ok, requireUser } = require('../http');

const router = express.Router();
router.use(requireUser);

const VALID_EVENT_TYPES = new Set(['drag_reclassify', 'scatter', 'reject_suggestion']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function state(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const serialized = JSON.stringify(value);
  return serialized.length <= 50000 ? serialized : null;
}

router.post('/', asyncRoute(async (req, res) => {
  const eventType = String(req.body.eventType || '').trim();
  const originalState = state(req.body.originalState);
  const newState = state(req.body.newState);
  if (!VALID_EVENT_TYPES.has(eventType)) return fail(res, 400, '事件类型不合法');
  if (!originalState || !newState) return fail(res, 400, '纠错状态不能为空或过大');
  const result = await db.query(
    `INSERT INTO correction_events (id, user_id, event_type, original_state, new_state)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
     RETURNING id, event_type, created_at`,
    [crypto.randomUUID(), req.user.id, eventType, originalState, newState]
  );
  return ok(res, {
    id: result.rows[0].id,
    eventType: result.rows[0].event_type,
    createdAt: result.rows[0].created_at
  }, '纠错事件已记录');
}));

router.get('/', asyncRoute(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const result = await db.query(
    `SELECT id, event_type, original_state, new_state, created_at
       FROM correction_events WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [req.user.id, limit]
  );
  return ok(res, { events: result.rows.map(row => ({
    id: row.id,
    eventType: row.event_type,
    originalState: row.original_state,
    newState: row.new_state,
    createdAt: row.created_at
  })) });
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return fail(res, 400, '事件 ID 格式不正确');
  const result = await db.query(
    'DELETE FROM correction_events WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '纠错事件不存在');
  return ok(res, null, '纠错事件已删除');
}));

module.exports = router;
