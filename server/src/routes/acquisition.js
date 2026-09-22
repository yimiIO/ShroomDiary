'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { asyncRoute, fail, ok, text } = require('../http');

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,79}$/;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TOUCHES_PER_WINDOW = 30;
const touchAttempts = new Map();

function rateLimitKey(req) {
  return req.ip || 'unknown';
}

function allowTouch(req, now = Date.now()) {
  const key = rateLimitKey(req);
  const recent = (touchAttempts.get(key) || []).filter(value => now - value < WINDOW_MS);
  if (recent.length >= MAX_TOUCHES_PER_WINDOW) {
    touchAttempts.set(key, recent);
    return false;
  }
  recent.push(now);
  touchAttempts.set(key, recent);
  if (touchAttempts.size > 1000) {
    for (const [address, attempts] of touchAttempts) {
      if (!attempts.some(value => now - value < WINDOW_MS)) touchAttempts.delete(address);
    }
  }
  return true;
}

router.post('/touch', asyncRoute(async (req, res) => {
  if (!allowTouch(req)) return fail(res, 429, '记录访问过于频繁，请稍后再试');
  const contentCode = text((req.body || {}).contentCode, 80).toLowerCase();
  if (!CODE_PATTERN.test(contentCode)) return fail(res, 400, '内容编号不正确');
  const visitorId = UUID_PATTERN.test(String((req.body || {}).visitorId || ''))
    ? String(req.body.visitorId)
    : crypto.randomUUID();

  const campaign = await db.query(
    `SELECT content_code, source, campaign, landing_path
       FROM acquisition_campaigns
      WHERE content_code = $1 AND status IN ('READY', 'LIVE')`,
    [contentCode]
  );
  if (!campaign.rowCount) return fail(res, 404, '这个内容入口尚未开放');

  const touchpoint = await db.query(
    `INSERT INTO acquisition_touchpoints (id, visitor_id, content_code)
     VALUES ($1, $2, $3)
     ON CONFLICT (visitor_id, content_code) DO UPDATE SET
       visit_count = acquisition_touchpoints.visit_count + 1,
       last_seen_at = now(),
       updated_at = now()
     RETURNING id, visitor_id, content_code`,
    [crypto.randomUUID(), visitorId, contentCode]
  );
  return ok(res, {
    touchId: touchpoint.rows[0].id,
    visitorId: touchpoint.rows[0].visitor_id,
    contentCode: touchpoint.rows[0].content_code
  });
}));

module.exports = router;
