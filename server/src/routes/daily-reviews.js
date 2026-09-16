'use strict';

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const { asyncRoute, fail, ok, requireUser, text } = require('../http');
const {
  mapInboxReview,
  mapReview,
  openDailyReview,
  reviewRow,
  todayInShanghai,
  validReviewDate
} = require('../daily-review');
const { isMailConfigured, sendMail } = require('../mail');

const router = express.Router();
router.use(requireUser);

function emailAddress(value) {
  const email = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function maskedEmail(value) {
  const email = String(value || '');
  const at = email.indexOf('@');
  if (at < 1) return '';
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}${local.length > 2 ? '***' : '*'}${email.slice(at)}`;
}

function verificationHash(userId, email, code) {
  return crypto.createHmac('sha256', config.tokenSecret).update(`${userId}:${email}:${code}`).digest('hex');
}

function safeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function publicPreferences(row) {
  return {
    inboxEnabled: row ? Boolean(row.inbox_enabled) : true,
    inboxDeliveryTime: '22:00',
    pushMode: 'IN_APP',
    email: row?.email_verified_at ? row.email_address : '',
    maskedEmail: maskedEmail(row?.email_address),
    emailVerified: Boolean(row?.email_verified_at),
    emailEnabled: Boolean(row?.email_enabled),
    mailConfigured: isMailConfigured(),
    deliveryTime: '22:00',
    timeZone: 'Asia/Shanghai'
  };
}

async function preferences(userId) {
  const result = await db.query('SELECT * FROM daily_review_preferences WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

async function ensurePreferences(userId) {
  const result = await db.query(
    `INSERT INTO daily_review_preferences (user_id, inbox_enabled)
     VALUES ($1, true)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId]
  );
  return result.rows[0];
}

router.get('/preferences', asyncRoute(async (req, res) => {
  return ok(res, publicPreferences(await ensurePreferences(req.user.id)));
}));

router.get('/inbox/unread-count', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT count(*)::int AS unread_count,
            (array_agg(id ORDER BY review_date DESC, updated_at DESC))[1] AS latest_unread_id
       FROM daily_reviews
      WHERE user_id = $1 AND status = 'READY' AND viewed_at IS NULL`,
    [req.user.id]
  );
  return ok(res, {
    unreadCount: Number(result.rows[0]?.unread_count || 0),
    latestUnreadId: result.rows[0]?.latest_unread_id || null
  });
}));

router.get('/inbox', asyncRoute(async (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 30));
  const result = await db.query(
    `SELECT id, review_date, result, viewed_at, created_at, updated_at
       FROM daily_reviews
      WHERE user_id = $1 AND status = 'READY'
      ORDER BY review_date DESC, updated_at DESC
      LIMIT $2`,
    [req.user.id, limit]
  );
  return ok(res, {
    items: result.rows.map(mapInboxReview),
    unreadCount: result.rows.filter(row => !row.viewed_at).length
  });
}));

router.post('/preferences/email/request', asyncRoute(async (req, res) => {
  if (!isMailConfigured()) return fail(res, 503, '邮件服务尚未配置，暂时不能绑定邮箱');
  const email = emailAddress(req.body.email);
  if (!email) return fail(res, 400, '请输入有效邮箱地址');
  const current = await preferences(req.user.id);
  if (current?.last_verification_sent_at
    && Date.now() - new Date(current.last_verification_sent_at).getTime() < 60000) {
    return fail(res, 429, '验证码发送过于频繁，请一分钟后再试');
  }
  if (current?.email_verified_at && current.email_address === email) {
    return ok(res, publicPreferences(current), '这个邮箱已经验证');
  }
  const code = String(crypto.randomInt(100000, 1000000));
  await db.query(
    `INSERT INTO daily_review_preferences
      (user_id, email_address, email_enabled, verification_code_hash,
       verification_expires_at, verification_attempts, last_verification_sent_at)
     VALUES ($1, $2, false, $3, now() + interval '10 minutes', 0, now())
     ON CONFLICT (user_id) DO UPDATE SET
       email_address = EXCLUDED.email_address, email_verified_at = NULL, email_enabled = false,
       verification_code_hash = EXCLUDED.verification_code_hash,
       verification_expires_at = EXCLUDED.verification_expires_at,
       verification_attempts = 0, last_verification_sent_at = now(), updated_at = now()`,
    [req.user.id, email, verificationHash(req.user.id, email, code)]
  );
  await sendMail({
    to: email,
    subject: '验证你的菇每日总结邮箱',
    text: `你的验证码是 ${code}，10 分钟内有效。只有验证并主动开启后，菇才会在 22:00 发送私人每日总结。`,
    html: `<p>你的验证码是 <strong style="font-size:24px;letter-spacing:3px">${code}</strong></p><p>10 分钟内有效。只有验证并主动开启后，菇才会在 22:00 发送私人每日总结。</p>`
  });
  return ok(res, { maskedEmail: maskedEmail(email), expiresInMinutes: 10 }, '验证码已发送');
}));

router.post('/preferences/email/verify', asyncRoute(async (req, res) => {
  const email = emailAddress(req.body.email);
  const code = text(req.body.code, 6);
  if (!email || !/^\d{6}$/.test(code)) return fail(res, 400, '邮箱或验证码不正确');
  const result = await db.transaction(async client => {
    const locked = await client.query(
      'SELECT * FROM daily_review_preferences WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    const row = locked.rows[0];
    if (!row || row.email_address !== email || !row.verification_code_hash
      || !row.verification_expires_at || new Date(row.verification_expires_at).getTime() < Date.now()
      || Number(row.verification_attempts || 0) >= 5) return null;
    const matched = safeEqual(row.verification_code_hash, verificationHash(req.user.id, email, code));
    if (!matched) {
      await client.query(
        'UPDATE daily_review_preferences SET verification_attempts = verification_attempts + 1, updated_at = now() WHERE user_id = $1',
        [req.user.id]
      );
      return false;
    }
    const verified = await client.query(
      `UPDATE daily_review_preferences SET email_verified_at = now(), email_enabled = true,
         verification_code_hash = NULL, verification_expires_at = NULL,
         verification_attempts = 0, updated_at = now()
       WHERE user_id = $1 RETURNING *`,
      [req.user.id]
    );
    return verified.rows[0];
  });
  if (!result) return fail(res, 400, '验证码无效或已过期，请重新发送');
  if (result === false) return fail(res, 400, '验证码不正确');
  return ok(res, publicPreferences(result), '邮箱已验证，22:00 邮件已开启');
}));

router.patch('/preferences', asyncRoute(async (req, res) => {
  const changesInbox = typeof req.body.inboxEnabled === 'boolean';
  const changesEmail = typeof req.body.emailEnabled === 'boolean';
  if (!changesInbox && !changesEmail) return fail(res, 400, '设置内容不正确');
  const current = await ensurePreferences(req.user.id);
  if (changesEmail && !current?.email_verified_at) return fail(res, 400, '请先验证接收邮箱');
  const result = await db.query(
    `UPDATE daily_review_preferences
        SET inbox_enabled = $2, email_enabled = $3, updated_at = now()
      WHERE user_id = $1 RETURNING *`,
    [
      req.user.id,
      changesInbox ? req.body.inboxEnabled : current.inbox_enabled,
      changesEmail ? req.body.emailEnabled : current.email_enabled
    ]
  );
  const message = changesInbox
    ? (req.body.inboxEnabled ? '每日总结会进入收件箱' : '每日总结收件箱投递已关闭')
    : (req.body.emailEnabled ? '22:00 邮件已开启' : '每日总结邮件已关闭');
  return ok(res, publicPreferences(result.rows[0]), message);
}));

router.get('/:date', asyncRoute(async (req, res) => {
  const date = validReviewDate(req.params.date);
  if (!date) return fail(res, 400, '总结日期不正确');
  return ok(res, mapReview(await reviewRow(req.user.id, date)));
}));

router.post('/:date/open', asyncRoute(async (req, res) => {
  const date = validReviewDate(req.params.date);
  if (!date) return fail(res, 400, '总结日期不正确');
  return ok(res, await openDailyReview(req.user.id, date), `${date === todayInShanghai() ? '今天' : date}的总结已准备好`);
}));

module.exports = router;
