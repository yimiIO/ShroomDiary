'use strict';

const db = require('./db');
const { hashToken, verifyAccessToken, verifyAdminToken } = require('./security');

function ok(res, data = null, message = 'ok') {
  return res.json({ code: 200, message, data });
}

function fail(res, code, message, data = null) {
  return res.json({ code, message, data });
}

async function resolveUser(req) {
  const token = req.get('x-api-key') || req.get('x-rfdiary-token');
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (payload) {
    const result = await db.query(
      'SELECT id, mobile, nickname, avatar_url, role FROM users WHERE id = $1',
      [payload.sub]
    );
    req.authKind = 'session';
    return result.rows[0] || null;
  }
  const result = await db.query(
    `UPDATE api_tokens t SET last_used_at = now()
       FROM users u
      WHERE t.token_hash = $1 AND t.user_id = u.id
        AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())
      RETURNING u.id, u.mobile, u.nickname, u.avatar_url, u.role, t.scopes`,
    [hashToken(token)]
  );
  const user = result.rows[0];
  if (!user) return null;
  const pathParts = String(req.originalUrl || '').split('?')[0].split('/').filter(Boolean);
  const resource = pathParts[0] === 'api' ? pathParts[1] : null;
  const action = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? 'read' : 'write';
  const scopes = Array.isArray(user.scopes) ? user.scopes : [];
  if (!resource || (!scopes.includes(`${resource}:${action}`) && !scopes.includes(`${resource}:*`))) {
    throw Object.assign(new Error('API Token 没有访问此资源的权限'), { code: 'SHROOM_API_SCOPE' });
  }
  delete user.scopes;
  req.authKind = 'api-token';
  return user;
}

async function requireUser(req, res, next) {
  try {
    const user = await resolveUser(req);
    if (!user) return fail(res, 401, '登录状态已失效，请重新登录');
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') return fail(res, 403, '仅管理员可访问');
  if (req.authKind === 'api-token') return next();
  const payload = verifyAdminToken(req.get('x-shroom-admin-token'), req.user.id);
  if (!payload) return fail(res, 403, '请重新验证管理员密码', { reason: 'ADMIN_UNLOCK_REQUIRED' });
  req.adminSession = payload;
  return next();
}

function optionalUser(req, res, next) {
  resolveUser(req).then(user => {
    req.user = user;
    next();
  }).catch(next);
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function pageParams(query) {
  const page = Math.max(1, Math.min(100000, Number(query.page) || 1));
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function text(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function stringArray(value, maxItems = 20, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map(item => text(item, maxLength)).filter(Boolean);
}

function visibility(value) {
  return ['PRIVATE', 'PUBLIC_ANON', 'PUBLIC_NAMED'].includes(value) ? value : 'PRIVATE';
}

module.exports = {
  asyncRoute,
  fail,
  ok,
  optionalUser,
  pageParams,
  requireAdmin,
  requireUser,
  stringArray,
  text,
  visibility
};
