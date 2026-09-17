'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const config = require('../config');
const {
  createAccessToken,
  createRefreshToken,
  hashPassword,
  hashToken,
  isLegacyPasswordHash,
  verifyAccessToken,
  verifyPassword
} = require('../security');
const { asyncRoute, fail, ok, text } = require('../http');
const { ensureDefaultObservers } = require('../observer-store');
const { setupNewUser } = require('../billing-store');

const router = express.Router();
const MOBILE_PATTERN = /^1[3-9]\d{9}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function member(user) {
  return {
    id: user.id,
    mobile: user.mobile,
    nickname: user.nickname,
    avatar: user.avatar_url || '',
    role: user.role || 'USER'
  };
}

async function issueSession(user, client = db) {
  const accessToken = createAccessToken(user.id);
  const refreshToken = createRefreshToken();
  const refreshId = crypto.randomUUID();
  await client.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)`,
    [refreshId, user.id, hashToken(refreshToken), config.refreshTokenDays]
  );
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: config.accessTokenSeconds,
    member: member(user)
  };
}

router.post('/register', asyncRoute(async (req, res) => {
  const mobile = text(req.body.mobile, 32);
  const password = String(req.body.password || '');
  const nickname = text(req.body.nickname, 80) || `Shroom ${mobile.slice(-4)}`;
  const acquisitionTouchId = UUID_PATTERN.test(String(req.body.acquisitionTouchId || ''))
    ? String(req.body.acquisitionTouchId)
    : null;
  if (!MOBILE_PATTERN.test(mobile)) return fail(res, 400, '手机号格式不正确');
  if (password.length < 6 || password.length > 72) return fail(res, 400, '密码需要 6–72 位');
  if (req.body.acceptedTerms !== true) return fail(res, 400, '请先阅读并同意用户服务协议与隐私政策');

  const existing = await db.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
  if (existing.rowCount) return fail(res, 400, '这个手机号已经注册');

  const user = await db.transaction(async client => {
    const result = await client.query(
      `INSERT INTO users (id, mobile, nickname, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, mobile, nickname, avatar_url, role`,
      [crypto.randomUUID(), mobile, nickname, hashPassword(password)]
    );
    await ensureDefaultObservers(result.rows[0].id, client);
    await setupNewUser(client, result.rows[0].id);
    await client.query(
      `INSERT INTO daily_review_preferences (user_id, inbox_enabled)
       VALUES ($1, true) ON CONFLICT (user_id) DO NOTHING`,
      [result.rows[0].id]
    );
    if (acquisitionTouchId) {
      await client.query(
        `UPDATE acquisition_touchpoints
            SET user_id = $2, registered_at = COALESCE(registered_at, now()), updated_at = now()
          WHERE id = $1 AND user_id IS NULL`,
        [acquisitionTouchId, result.rows[0].id]
      );
    }
    return result.rows[0];
  });
  return ok(res, member(user), '账号已创建');
}));

router.post('/login', asyncRoute(async (req, res) => {
  const mobile = text(req.body.mobile, 32);
  const password = String(req.body.password || '');
  const result = await db.query(
    'SELECT id, mobile, nickname, avatar_url, password_hash, role FROM users WHERE mobile = $1',
    [mobile]
  );
  const user = result.rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return fail(res, 400, '手机号或密码不正确');
  }
  if (isLegacyPasswordHash(user.password_hash)) {
    await db.query(
      `UPDATE users SET password_hash = $2, updated_at = now()
        WHERE id = $1 AND password_hash = $3`,
      [user.id, hashPassword(password), user.password_hash]
    );
  }
  return ok(res, await issueSession(user), '登录成功');
}));

router.post('/refresh', asyncRoute(async (req, res) => {
  const refreshToken = String(req.body.refresh_token || '');
  if (!refreshToken) return fail(res, 401, '刷新凭证无效');
  const session = await db.transaction(async client => {
    const result = await client.query(
      `SELECT rt.id AS refresh_id, u.id, u.mobile, u.nickname, u.avatar_url, u.role
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1 AND rt.expires_at > now()
          AND (rt.revoked_at IS NULL OR rt.revoked_at > now() - ($2 || ' seconds')::interval)
        FOR UPDATE OF rt`,
      [hashToken(refreshToken), config.refreshReuseGraceSeconds]
    );
    const user = result.rows[0];
    if (!user) return null;
    await client.query(
      'UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1',
      [user.refresh_id]
    );
    return issueSession(user, client);
  });
  if (!session) return fail(res, 401, '刷新凭证已失效');
  return ok(res, session);
}));

router.post('/verify', asyncRoute(async (req, res) => {
  const token = String(req.get('x-api-key') || req.body.token || '');
  const payload = verifyAccessToken(token);
  if (!payload) return fail(res, 401, '登录状态已失效');
  const result = await db.query('SELECT id FROM users WHERE id = $1', [payload.sub]);
  if (!result.rowCount) return fail(res, 401, '账号不存在');
  return ok(res, { token: true });
}));

router.post('/sms-code', (req, res) => fail(res, 400, '短信登录尚未启用，请使用密码登录'));
router.post('/mobile-login', (req, res) => fail(res, 400, '短信登录尚未启用，请使用密码登录'));
router.post('/password', (req, res) => fail(res, 400, '短信找回尚未启用，请联系管理员处理'));

module.exports = router;
