'use strict';

const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');

const SECRET_KEY = /password|token|secret|cookie|authorization|credential/i;

function sanitizeAuditValue(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 5) return '[depth-limited]';
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitizeAuditValue(item, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 5000) : value;
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    result[key] = SECRET_KEY.test(key) ? '[redacted]' : sanitizeAuditValue(item, depth + 1);
  }
  return result;
}

function ipHash(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  if (!ip) return null;
  return crypto.createHmac('sha256', config.tokenSecret).update(ip).digest('hex');
}

async function recordAdminAudit(options, client = db) {
  const { req, action, targetType, targetId = '', reason = '', before = null, after = null } = options;
  const requestId = String(req.get?.('x-request-id') || crypto.randomUUID()).slice(0, 160);
  await client.query(
    `INSERT INTO admin_audit_events
      (id, actor_user_id, actor_role, action, target_type, target_id, reason,
       before_value, after_value, request_id, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
    [crypto.randomUUID(), req.admin?.userId || null, req.admin?.role || '', String(action).slice(0, 120),
      String(targetType).slice(0, 80), String(targetId).slice(0, 160), String(reason).slice(0, 3000),
      before === null ? null : JSON.stringify(sanitizeAuditValue(before)),
      after === null ? null : JSON.stringify(sanitizeAuditValue(after)), requestId, ipHash(req)]
  );
  return requestId;
}

module.exports = { recordAdminAudit, sanitizeAuditValue };
