'use strict';

const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const { hashToken } = require('./security');

const ADMIN_COOKIE = 'shroom_admin_session';
const ADMIN_CSRF_HEADER = 'x-shroom-admin-csrf';
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
const ADMIN_IDLE_SECONDS = 30 * 60;

const ROLE_PERMISSIONS = Object.freeze({
  OWNER: ['dashboard.read', 'users.read', 'users.write', 'users.sessions', 'features.read', 'features.write',
    'agents.read', 'agents.write', 'audit.read', 'system.read', 'members.read', 'members.write'],
  OPERATOR: ['dashboard.read', 'users.read', 'users.sessions', 'features.read', 'features.write',
    'agents.read', 'agents.write', 'audit.read', 'system.read'],
  SUPPORT: ['dashboard.read', 'users.read', 'users.sessions', 'features.read',
    'agents.read', 'system.read'],
  VIEWER: ['dashboard.read', 'users.read', 'features.read', 'agents.read', 'audit.read', 'system.read']
});

function adminFail(res, status, message, data = null) {
  return res.status(status).json({ code: status, message, data });
}

function parseCookies(header) {
  const parsed = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { parsed[key] = decodeURIComponent(value); } catch (_) { parsed[key] = value; }
  }
  return parsed;
}

function opaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function secureCookies() {
  return /^https:\/\//i.test(String(config.publicOrigin || ''));
}

function cookieLine(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`, 'SameSite=Strict'];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (secureCookies()) parts.push('Secure');
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${Math.max(0, Math.round(options.maxAge))}`);
  return parts.join('; ');
}

function setAdminCookies(res, sessionToken, csrfToken) {
  res.append('Set-Cookie', cookieLine(ADMIN_COOKIE, sessionToken, {
    path: '/api/admin/v2', maxAge: ADMIN_SESSION_SECONDS
  }));
  res.append('Set-Cookie', cookieLine('shroom_admin_csrf', csrfToken, {
    path: '/admin', maxAge: ADMIN_SESSION_SECONDS, httpOnly: false
  }));
}

function clearAdminCookies(res) {
  res.append('Set-Cookie', cookieLine(ADMIN_COOKIE, '', { path: '/api/admin/v2', maxAge: 0 }));
  res.append('Set-Cookie', cookieLine('shroom_admin_csrf', '', {
    path: '/admin', maxAge: 0, httpOnly: false
  }));
}

function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function createAdminSessionTokens() {
  const sessionToken = opaqueToken();
  const csrfToken = opaqueToken();
  return {
    sessionToken,
    sessionTokenHash: hashToken(sessionToken),
    csrfToken,
    csrfTokenHash: hashToken(csrfToken)
  };
}

async function requireAdminSession(req, res, next) {
  try {
    const token = parseCookies(req.get('cookie'))[ADMIN_COOKIE];
    if (!token) return adminFail(res, 401, '请先登录 Shroom 管理后台');
    const result = await db.query(
      `UPDATE admin_sessions s
          SET last_seen_at = now(),
              idle_expires_at = LEAST(s.expires_at, now() + interval '30 minutes')
         FROM admin_members m, users u
        WHERE s.token_hash = $1
          AND s.admin_user_id = m.user_id
          AND u.id = m.user_id
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND s.idle_expires_at > now()
          AND m.status = 'ACTIVE'
          AND u.account_status = 'ACTIVE'
        RETURNING s.id, s.admin_user_id, s.csrf_token_hash, s.last_reauthenticated_at,
                  s.expires_at, u.mobile, u.nickname, m.role`,
      [hashToken(token)]
    );
    const session = result.rows[0];
    if (!session) {
      clearAdminCookies(res);
      return adminFail(res, 401, '管理会话已失效，请重新登录');
    }
    req.adminSession = session;
    req.admin = {
      userId: session.admin_user_id,
      mobile: session.mobile,
      nickname: session.nickname,
      role: session.role,
      permissions: permissionsForRole(session.role)
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAdminCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = String(req.get(ADMIN_CSRF_HEADER) || '');
  if (!token || hashToken(token) !== req.adminSession.csrf_token_hash) {
    return adminFail(res, 403, '管理操作验证已失效，请刷新页面后重试', { reason: 'ADMIN_CSRF' });
  }
  return next();
}

function requirePermission(permission) {
  return function permissionGate(req, res, next) {
    if (!req.admin || !req.admin.permissions.includes(permission)) {
      return adminFail(res, 403, '当前后台角色没有该操作权限', { permission });
    }
    return next();
  };
}

function requireFreshReauth(maxAgeSeconds = 10 * 60) {
  return function reauthGate(req, res, next) {
    const last = new Date(req.adminSession.last_reauthenticated_at).getTime();
    if (!Number.isFinite(last) || Date.now() - last > maxAgeSeconds * 1000) {
      return adminFail(res, 403, '这是高影响操作，请先重新验证管理员密码', {
        reason: 'ADMIN_REAUTH_REQUIRED'
      });
    }
    return next();
  };
}

module.exports = {
  ADMIN_CSRF_HEADER,
  ADMIN_IDLE_SECONDS,
  ADMIN_SESSION_SECONDS,
  ROLE_PERMISSIONS,
  adminFail,
  clearAdminCookies,
  createAdminSessionTokens,
  parseCookies,
  permissionsForRole,
  requireAdminCsrf,
  requireAdminSession,
  requireFreshReauth,
  requirePermission,
  setAdminCookies
};
