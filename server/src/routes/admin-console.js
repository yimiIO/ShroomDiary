'use strict';

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const { recordAdminAudit } = require('../admin-audit');
const {
  ADMIN_IDLE_SECONDS,
  ADMIN_SESSION_SECONDS,
  adminFail,
  clearAdminCookies,
  createAdminSessionTokens,
  requireAdminCsrf,
  requireAdminSession,
  requireFreshReauth,
  requirePermission,
  permissionsForRole,
  setAdminCookies
} = require('../admin-auth');
const { FEATURES } = require('../billing-policy');
const { hashToken, verifyPassword } = require('../security');
const { asyncRoute, pageParams, text } = require('../http');
const { isAiConfigured } = require('../ai-engine');
const { isEmbeddingConfigured } = require('../embedding-provider');
const { isTranscriptionConfigured } = require('../transcription');
const { isCosConfigured } = require('../media-storage');
const { isMailConfigured } = require('../mail');
const { shanghaiDate } = require('../compound-system');

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_KEY_PATTERN = /^[a-z][a-z0-9-]{2,79}$/;
const FEATURE_STATES = new Set(['ACTIVE', 'BETA', 'PAUSED']);
const USER_STATES = new Set(['ACTIVE', 'SUSPENDED']);
const AGENT_STATES = new Set(['ACTIVE', 'PAUSED', 'BLOCKED', 'ARCHIVED']);
const EXECUTOR_TYPES = new Set(['MANUAL', 'CODEX_AUTOMATION', 'SERVICE_WORKER']);
const COMMANDS = new Set(['RUN', 'PAUSE', 'RESUME']);
const ADMIN_ROLES = new Set(['OWNER', 'OPERATOR', 'SUPPORT', 'VIEWER']);
const MEMBER_STATES = new Set(['ACTIVE', 'SUSPENDED']);
const RESULT_STATES = new Set(['OUTPUT', 'VERIFIED', 'REAL_WORLD', 'NONE']);
const SAFETY_STATES = new Set(['PASS', 'STOP']);
const FLYWHEEL_STAGES = new Set(['PRIVATE_VALUE', 'EXPRESSION', 'REACH', 'INVITATION', 'OUTCOME', 'REVENUE', 'SAFETY']);
const DECISION_STATES = new Set(['APPROVED', 'REJECTED', 'ADJUSTED', 'DEFERRED']);
const loginAttempts = new Map();

function ok(res, data = null, message = 'ok') {
  return res.status(200).json({ code: 200, message, data });
}

function reason(body) {
  return text(body?.reason, 3000);
}

function maskMobile(value) {
  const mobile = String(value || '');
  return mobile.length >= 7 ? `${mobile.slice(0, 3)}****${mobile.slice(-4)}` : mobile;
}

function jsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function jsonArray(value, max = 30) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function loginAttemptKey(req, mobile) {
  return `${req.ip || 'unknown'}:${mobile}`;
}

function loginBlocked(key, now = Date.now()) {
  const recent = (loginAttempts.get(key) || []).filter(value => now - value < 15 * 60 * 1000);
  loginAttempts.set(key, recent);
  return recent.length >= 8;
}

function rememberLoginFailure(key, now = Date.now()) {
  const recent = (loginAttempts.get(key) || []).filter(value => now - value < 15 * 60 * 1000);
  recent.push(now);
  loginAttempts.set(key, recent);
}

function mapAgent(row) {
  return {
    key: row.stable_key,
    departmentKey: row.department_key,
    name: row.name,
    level: row.level,
    responsibility: row.responsibility,
    resultDefinition: row.result_definition,
    currentFocus: row.current_focus,
    status: row.status,
    executorType: row.executor_type,
    schedule: row.schedule_text,
    capabilities: row.capabilities || [],
    runtimeConfig: row.runtime_config || {},
    version: row.version,
    runtimeState: row.runtime_state,
    runtimeMessage: row.runtime_message,
    lastHeartbeatAt: row.last_heartbeat_at,
    nextRunAt: row.next_run_at,
    lastResultState: row.last_result_state,
    lastRunAt: row.last_run_at,
    updatedAt: row.updated_at
  };
}

router.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  next();
});

router.post('/session/login', asyncRoute(async (req, res) => {
  const mobile = text(req.body?.mobile, 32);
  const password = String(req.body?.password || '').slice(0, 72);
  const attemptKey = loginAttemptKey(req, mobile);
  if (loginBlocked(attemptKey)) return adminFail(res, 429, '后台登录尝试过多，请 15 分钟后再试');
  const result = await db.query(
    `SELECT u.id, u.mobile, u.nickname, u.password_hash, u.account_status,
            m.role, m.status AS admin_status
       FROM users u
       JOIN admin_members m ON m.user_id = u.id
      WHERE u.mobile = $1`,
    [mobile]
  );
  const member = result.rows[0];
  if (!member || !password || !verifyPassword(password, member.password_hash)
      || member.account_status !== 'ACTIVE' || member.admin_status !== 'ACTIVE') {
    rememberLoginFailure(attemptKey);
    return adminFail(res, 401, '管理员账号或密码不正确');
  }
  loginAttempts.delete(attemptKey);
  const tokens = createAdminSessionTokens();
  const sessionId = crypto.randomUUID();
  req.admin = { userId: member.id, role: member.role };
  await db.transaction(async client => {
    await client.query(
      `INSERT INTO admin_sessions
        (id, admin_user_id, token_hash, csrf_token_hash, expires_at, idle_expires_at)
       VALUES ($1, $2, $3, $4, now() + ($5 || ' seconds')::interval,
               now() + ($6 || ' seconds')::interval)`,
      [sessionId, member.id, tokens.sessionTokenHash, tokens.csrfTokenHash,
        ADMIN_SESSION_SECONDS, ADMIN_IDLE_SECONDS]
    );
    await recordAdminAudit({
      req, action: 'ADMIN_LOGIN', targetType: 'ADMIN_SESSION', targetId: sessionId,
      after: { userId: member.id, role: member.role }
    }, client);
  });
  setAdminCookies(res, tokens.sessionToken, tokens.csrfToken);
  return ok(res, {
    admin: {
      id: member.id, mobile: maskMobile(member.mobile), nickname: member.nickname,
      role: member.role, permissions: permissionsForRole(member.role)
    },
    csrfToken: tokens.csrfToken
  }, '已进入 Shroom 管理后台');
}));

router.use(requireAdminSession);
router.use(requireAdminCsrf);

router.get('/session', (req, res) => ok(res, { admin: req.admin, expiresAt: req.adminSession.expires_at }));

router.post('/session/logout', asyncRoute(async (req, res) => {
  await db.transaction(async client => {
    await client.query('UPDATE admin_sessions SET revoked_at = now() WHERE id = $1', [req.adminSession.id]);
    await recordAdminAudit({
      req, action: 'ADMIN_LOGOUT', targetType: 'ADMIN_SESSION', targetId: req.adminSession.id
    }, client);
  });
  clearAdminCookies(res);
  return ok(res, null, '已退出管理后台');
}));

router.post('/session/reauth', asyncRoute(async (req, res) => {
  const password = String(req.body?.password || '').slice(0, 72);
  const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.admin.userId]);
  if (!password || !result.rowCount || !verifyPassword(password, result.rows[0].password_hash)) {
    return adminFail(res, 403, '管理员密码不正确');
  }
  await db.transaction(async client => {
    await client.query('UPDATE admin_sessions SET last_reauthenticated_at = now() WHERE id = $1', [req.adminSession.id]);
    await recordAdminAudit({
      req, action: 'ADMIN_REAUTHENTICATED', targetType: 'ADMIN_SESSION', targetId: req.adminSession.id
    }, client);
  });
  req.adminSession.last_reauthenticated_at = new Date();
  return ok(res, { validForSeconds: 600 }, '高影响操作已重新验证');
}));

router.get('/dashboard', requirePermission('dashboard.read'), asyncRoute(async (req, res) => {
  const [users, activity, usage, agents, decisions, features] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE created_at >= current_date)::int AS new_today,
              count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS new_7d,
              count(*) FILTER (WHERE account_status = 'SUSPENDED')::int AS suspended
         FROM users`
    ),
    db.query(
      `SELECT count(DISTINCT user_id)::int AS active_7d FROM (
         SELECT user_id FROM diaries WHERE deleted_at IS NULL AND updated_at >= now() - interval '7 days'
         UNION
         SELECT user_id FROM reflection_conversations WHERE updated_at >= now() - interval '7 days'
       ) active`
    ),
    db.query(
      `SELECT count(*)::int AS calls_30d,
              COALESCE(sum(total_tokens), 0)::bigint AS tokens_30d,
              COALESCE(sum(cost_cny), 0)::numeric AS cost_cny_30d,
              COALESCE(sum(charged_point_cents), 0)::bigint AS charged_point_cents_30d
         FROM ai_usage_events WHERE created_at >= now() - interval '30 days'`
    ),
    db.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
              count(*) FILTER (WHERE runtime_state = 'RUNNING')::int AS running,
              count(*) FILTER (WHERE runtime_state = 'ERROR')::int AS errors,
              count(*) FILTER (WHERE last_heartbeat_at IS NULL
                OR last_heartbeat_at < now() - interval '15 minutes')::int AS disconnected
         FROM ai_company_agents WHERE status <> 'ARCHIVED'`
    ),
    db.query(`SELECT count(*)::int AS pending FROM ai_company_decisions WHERE status = 'PENDING'`),
    db.query(`SELECT feature_key, status, version, updated_at FROM feature_rollouts ORDER BY feature_key`)
  ]);
  return ok(res, {
    users: { ...users.rows[0], active7d: activity.rows[0]?.active_7d || 0 },
    aiUsage: {
      calls30d: Number(usage.rows[0]?.calls_30d || 0),
      tokens30d: Number(usage.rows[0]?.tokens_30d || 0),
      costCny30d: Number(usage.rows[0]?.cost_cny_30d || 0),
      chargedPoints30d: Number(usage.rows[0]?.charged_point_cents_30d || 0) / 100
    },
    agents: agents.rows[0],
    pendingDecisions: Number(decisions.rows[0]?.pending || 0),
    features: features.rows,
    services: {
      database: true,
      ai: isAiConfigured(),
      embedding: isEmbeddingConfigured(),
      transcription: isTranscriptionConfigured(),
      privateImageStorage: isCosConfigured(),
      mail: isMailConfigured(),
      billingMode: config.billing.mode
    }
  });
}));

router.get('/users', requirePermission('users.read'), asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const query = text(req.query.query, 100);
  const state = text(req.query.status, 24).toUpperCase();
  const result = await db.query(
    `SELECT u.id, u.mobile, u.nickname, u.role, u.account_status, u.status_reason,
            u.created_at, u.last_login_at,
            count(*) OVER()::int AS total_count,
            (SELECT count(*)::int FROM diaries d WHERE d.user_id = u.id AND d.deleted_at IS NULL) AS diary_count,
            (SELECT count(*)::int FROM cards c WHERE c.user_id = u.id) AS card_count,
            (SELECT count(*)::int FROM ai_usage_events a WHERE a.user_id = u.id) AS ai_call_count,
            COALESCE((SELECT paid_balance_cents + reward_balance_cents FROM wallet_accounts w WHERE w.user_id = u.id), 0)::int AS balance_cents,
            m.role AS admin_role
       FROM users u
       LEFT JOIN admin_members m ON m.user_id = u.id AND m.status = 'ACTIVE'
      WHERE ($1 = '' OR u.mobile ILIKE '%' || $1 || '%' OR u.nickname ILIKE '%' || $1 || '%'
             OR u.id::text = $1)
        AND ($2 = '' OR u.account_status = $2)
      ORDER BY u.created_at DESC, u.id
      LIMIT $3 OFFSET $4`,
    [query, USER_STATES.has(state) ? state : '', pageSize, offset]
  );
  const items = result.rows.map(row => ({
    id: row.id,
    mobile: maskMobile(row.mobile),
    nickname: row.nickname,
    accountStatus: row.account_status,
    statusReason: row.status_reason,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    diaryCount: Number(row.diary_count || 0),
    cardCount: Number(row.card_count || 0),
    aiCallCount: Number(row.ai_call_count || 0),
    balancePoints: Number(row.balance_cents || 0) / 100,
    adminRole: row.admin_role || null
  }));
  return ok(res, { items, page, pageSize, total: Number(result.rows[0]?.total_count || 0) });
}));

router.get('/users/:id', requirePermission('users.read'), asyncRoute(async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return adminFail(res, 400, '用户 ID 不正确');
  const [user, summary, entitlements, grants] = await Promise.all([
    db.query(
      `SELECT u.id, u.mobile, u.nickname, u.avatar_url, u.role, u.account_status, u.status_reason,
              u.status_changed_at, u.created_at, u.updated_at, u.last_login_at, m.role AS admin_role
         FROM users u LEFT JOIN admin_members m ON m.user_id = u.id
        WHERE u.id = $1`, [req.params.id]
    ),
    db.query(
      `SELECT
        (SELECT count(*)::int FROM diaries WHERE user_id = $1 AND deleted_at IS NULL) AS diaries,
        (SELECT count(*)::int FROM cards WHERE user_id = $1) AS cards,
        (SELECT count(*)::int FROM reflection_conversations WHERE user_id = $1) AS conversations,
        (SELECT count(*)::int FROM ai_usage_events WHERE user_id = $1) AS ai_calls,
        (SELECT count(*)::int FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()) AS sessions,
        (SELECT count(*)::int FROM api_tokens WHERE user_id = $1 AND revoked_at IS NULL) AS api_tokens,
        COALESCE((SELECT paid_balance_cents FROM wallet_accounts WHERE user_id = $1), 0)::int AS paid_balance,
        COALESCE((SELECT reward_balance_cents FROM wallet_accounts WHERE user_id = $1), 0)::int AS reward_balance`,
      [req.params.id]
    ),
    db.query(
      `SELECT feature_key, status, purchased_at, refunded_at
         FROM billing_feature_entitlements WHERE user_id = $1 ORDER BY purchased_at DESC`,
      [req.params.id]
    ),
    db.query(
      `SELECT id, feature_key, access, reason, expires_at, created_at
         FROM feature_access_grants
        WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
      [req.params.id]
    )
  ]);
  if (!user.rowCount) return adminFail(res, 404, '用户不存在');
  const row = user.rows[0];
  const totals = summary.rows[0] || {};
  return ok(res, {
    user: {
      id: row.id, mobile: row.mobile, nickname: row.nickname, avatar: row.avatar_url || '',
      accountStatus: row.account_status, statusReason: row.status_reason,
      statusChangedAt: row.status_changed_at, createdAt: row.created_at,
      updatedAt: row.updated_at, lastLoginAt: row.last_login_at, adminRole: row.admin_role || null
    },
    summary: {
      diaries: Number(totals.diaries || 0), cards: Number(totals.cards || 0),
      conversations: Number(totals.conversations || 0), aiCalls: Number(totals.ai_calls || 0),
      sessions: Number(totals.sessions || 0), apiTokens: Number(totals.api_tokens || 0),
      paidPoints: Number(totals.paid_balance || 0) / 100,
      rewardPoints: Number(totals.reward_balance || 0) / 100
    },
    entitlements: entitlements.rows,
    featureGrants: grants.rows
  });
}));

router.patch('/users/:id/status', requirePermission('users.write'), requireFreshReauth(), asyncRoute(async (req, res) => {
  const status = text(req.body?.status, 24).toUpperCase();
  const operationReason = reason(req.body);
  if (!UUID_PATTERN.test(req.params.id) || !USER_STATES.has(status)) return adminFail(res, 400, '用户或状态不正确');
  if (!operationReason) return adminFail(res, 400, '请填写状态变更原因');
  if (req.params.id === req.admin.userId && status !== 'ACTIVE') return adminFail(res, 400, '不能暂停当前管理员账号');
  const updated = await db.transaction(async client => {
    const beforeResult = await client.query(
      'SELECT id, account_status, status_reason FROM users WHERE id = $1 FOR UPDATE', [req.params.id]
    );
    if (!beforeResult.rowCount) return null;
    const before = beforeResult.rows[0];
    const result = await client.query(
      `UPDATE users SET account_status = $2, status_reason = $3,
              status_changed_at = now(), status_changed_by = $4, updated_at = now()
        WHERE id = $1 RETURNING id, account_status, status_reason, status_changed_at`,
      [req.params.id, status, operationReason, req.admin.userId]
    );
    if (status === 'SUSPENDED') {
      await client.query('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1', [req.params.id]);
      await client.query('UPDATE api_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1', [req.params.id]);
      await client.query('UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE admin_user_id = $1', [req.params.id]);
    }
    await recordAdminAudit({
      req, action: 'USER_STATUS_CHANGED', targetType: 'USER', targetId: req.params.id,
      reason: operationReason, before, after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  if (!updated) return adminFail(res, 404, '用户不存在');
  return ok(res, updated, '用户状态已更新');
}));

router.post('/users/:id/sessions/revoke', requirePermission('users.sessions'), requireFreshReauth(), asyncRoute(async (req, res) => {
  const operationReason = reason(req.body);
  if (!UUID_PATTERN.test(req.params.id) || !operationReason) return adminFail(res, 400, '请选择用户并填写注销原因');
  const result = await db.transaction(async client => {
    const revoked = await client.query(
      `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now())
        WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`, [req.params.id]
    );
    await recordAdminAudit({
      req, action: 'USER_SESSIONS_REVOKED', targetType: 'USER', targetId: req.params.id,
      reason: operationReason, after: { revokedSessions: revoked.rowCount }
    }, client);
    return revoked.rowCount;
  });
  return ok(res, { revokedSessions: result }, '已注销该用户的浏览器登录');
}));

router.get('/members', requirePermission('members.read'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT m.user_id, m.role, m.status, m.created_at, m.updated_at,
            u.mobile, u.nickname, u.account_status,
            count(s.id) FILTER (WHERE s.revoked_at IS NULL AND s.idle_expires_at > now())::int AS active_sessions
       FROM admin_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN admin_sessions s ON s.admin_user_id = m.user_id
      GROUP BY m.user_id, m.role, m.status, m.created_at, m.updated_at,
               u.mobile, u.nickname, u.account_status
      ORDER BY (m.role = 'OWNER') DESC, m.created_at`
  );
  return ok(res, result.rows.map(row => ({
    userId: row.user_id,
    mobile: maskMobile(row.mobile),
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    accountStatus: row.account_status,
    activeSessions: Number(row.active_sessions || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })));
}));

router.put('/members/:userId', requirePermission('members.write'), requireFreshReauth(), asyncRoute(async (req, res) => {
  const userId = text(req.params.userId, 80);
  const role = text(req.body?.role, 24).toUpperCase();
  const status = text(req.body?.status, 24).toUpperCase();
  const operationReason = reason(req.body);
  if (!UUID_PATTERN.test(userId) || !ADMIN_ROLES.has(role) || !MEMBER_STATES.has(status) || !operationReason) {
    return adminFail(res, 400, '管理员角色、状态或变更原因不完整');
  }
  if (userId === req.admin.userId && (role !== 'OWNER' || status !== 'ACTIVE')) {
    return adminFail(res, 400, '不能降级或暂停当前 Owner');
  }
  const member = await db.transaction(async client => {
    const user = await client.query(
      'SELECT id, account_status FROM users WHERE id = $1 FOR UPDATE', [userId]
    );
    if (!user.rowCount || user.rows[0].account_status !== 'ACTIVE') return null;
    const previous = await client.query('SELECT * FROM admin_members WHERE user_id = $1', [userId]);
    const result = await client.query(
      `INSERT INTO admin_members (user_id, role, status, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET role = EXCLUDED.role, status = EXCLUDED.status, updated_at = now()
       RETURNING *`,
      [userId, role, status, req.admin.userId]
    );
    if (status === 'SUSPENDED') {
      await client.query(
        'UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE admin_user_id = $1',
        [userId]
      );
    }
    await recordAdminAudit({
      req, action: previous.rowCount ? 'ADMIN_MEMBER_UPDATED' : 'ADMIN_MEMBER_CREATED',
      targetType: 'ADMIN_MEMBER', targetId: userId, reason: operationReason,
      before: previous.rows[0] || null, after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  if (!member) return adminFail(res, 404, '用户不存在或账号已暂停');
  return ok(res, member, '管理员成员已更新');
}));

router.get('/features', requirePermission('features.read'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT r.*,
            (SELECT count(*)::int FROM feature_access_grants g
              WHERE g.feature_key = r.feature_key AND g.revoked_at IS NULL
                AND (g.expires_at IS NULL OR g.expires_at > now())) AS active_grants,
            (SELECT count(*)::int FROM billing_feature_entitlements e
              WHERE e.feature_key = r.feature_key AND e.status = 'ACTIVE') AS active_entitlements
       FROM feature_rollouts r ORDER BY r.feature_key`
  );
  return ok(res, result.rows.map(row => ({
    key: row.feature_key,
    name: FEATURES[row.feature_key]?.name || row.feature_key,
    description: FEATURES[row.feature_key]?.description || '',
    status: row.status,
    platforms: row.platforms || [],
    maintenanceMessage: row.maintenance_message,
    runtimeConfig: row.runtime_config || {},
    version: row.version,
    activeGrants: Number(row.active_grants || 0),
    activeEntitlements: Number(row.active_entitlements || 0),
    updatedAt: row.updated_at
  })));
}));

router.patch('/features/:key', requirePermission('features.write'), requireFreshReauth(), asyncRoute(async (req, res) => {
  const key = text(req.params.key, 40);
  const status = text(req.body?.status, 24).toUpperCase();
  const operationReason = reason(req.body);
  const expectedVersion = Number(req.body?.version);
  if (!FEATURES[key] || !FEATURE_STATES.has(status) || !operationReason || !Number.isInteger(expectedVersion)) {
    return adminFail(res, 400, '功能状态、版本或变更原因不完整');
  }
  const updated = await db.transaction(async client => {
    const before = await client.query('SELECT * FROM feature_rollouts WHERE feature_key = $1 FOR UPDATE', [key]);
    if (!before.rowCount || Number(before.rows[0].version) !== expectedVersion) return null;
    const result = await client.query(
      `UPDATE feature_rollouts
          SET status = $2, platforms = $3::jsonb, maintenance_message = $4,
              runtime_config = $5::jsonb, version = version + 1,
              updated_by = $6, updated_at = now()
        WHERE feature_key = $1 AND version = $7 RETURNING *`,
      [key, status,
        JSON.stringify(Object.prototype.hasOwnProperty.call(req.body || {}, 'platforms')
          ? jsonArray(req.body.platforms) : before.rows[0].platforms),
        Object.prototype.hasOwnProperty.call(req.body || {}, 'maintenanceMessage')
          ? text(req.body.maintenanceMessage, 1000) : before.rows[0].maintenance_message,
        JSON.stringify(Object.prototype.hasOwnProperty.call(req.body || {}, 'runtimeConfig')
          ? jsonObject(req.body.runtimeConfig) : before.rows[0].runtime_config),
        req.admin.userId, expectedVersion]
    );
    if (!result.rowCount) return null;
    await recordAdminAudit({
      req, action: 'FEATURE_ROLLOUT_UPDATED', targetType: 'FEATURE', targetId: key,
      reason: operationReason, before: before.rows[0], after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  if (!updated) return adminFail(res, 409, '功能配置已被其他操作更新，请刷新后重试');
  return ok(res, updated, '功能发布状态已更新');
}));

router.post('/features/:key/grants', requirePermission('features.write'), requireFreshReauth(), asyncRoute(async (req, res) => {
  const key = text(req.params.key, 40);
  const userId = text(req.body?.userId, 80);
  const access = text(req.body?.access, 16).toUpperCase();
  const operationReason = reason(req.body);
  if (!FEATURES[key] || !UUID_PATTERN.test(userId) || !['ALLOW', 'DENY'].includes(access) || !operationReason) {
    return adminFail(res, 400, '用户、授权状态或原因不完整');
  }
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  if (expiresAt && !Number.isFinite(expiresAt.getTime())) return adminFail(res, 400, '授权到期时间不正确');
  const grant = await db.transaction(async client => {
    const user = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!user.rowCount) return null;
    await client.query(
      `UPDATE feature_access_grants
          SET revoked_at = now(), revoked_by = $3, revoked_reason = 'replaced by newer grant'
        WHERE feature_key = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [key, userId, req.admin.userId]
    );
    const result = await client.query(
      `INSERT INTO feature_access_grants
        (id, feature_key, user_id, access, reason, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [crypto.randomUUID(), key, userId, access, operationReason,
        expiresAt ? expiresAt.toISOString() : null, req.admin.userId]
    );
    await recordAdminAudit({
      req, action: 'FEATURE_ACCESS_GRANTED', targetType: 'USER_FEATURE', targetId: `${userId}:${key}`,
      reason: operationReason, after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  if (!grant) return adminFail(res, 404, '用户不存在');
  return ok(res, grant, '用户功能授权已更新');
}));

router.delete('/features/:key/grants/:id', requirePermission('features.write'), requireFreshReauth(), asyncRoute(async (req, res) => {
  const operationReason = reason(req.body);
  if (!UUID_PATTERN.test(req.params.id) || !operationReason) return adminFail(res, 400, '请填写撤销原因');
  const result = await db.transaction(async client => {
    const revoked = await client.query(
      `UPDATE feature_access_grants
          SET revoked_at = now(), revoked_by = $3, revoked_reason = $4
        WHERE id = $1 AND feature_key = $2 AND revoked_at IS NULL RETURNING *`,
      [req.params.id, req.params.key, req.admin.userId, operationReason]
    );
    if (!revoked.rowCount) return null;
    await recordAdminAudit({
      req, action: 'FEATURE_ACCESS_REVOKED', targetType: 'USER_FEATURE',
      targetId: `${revoked.rows[0].user_id}:${req.params.key}`, reason: operationReason,
      before: revoked.rows[0], after: { revoked: true }
    }, client);
    return revoked.rows[0];
  });
  if (!result) return adminFail(res, 404, '有效授权不存在');
  return ok(res, result, '用户功能授权已撤销');
}));

router.get('/company', requirePermission('agents.read'), asyncRoute(async (req, res) => {
  const [departments, agents, executions, commands, decisions, runs, credentials, acquisition] = await Promise.all([
    db.query('SELECT * FROM ai_company_departments ORDER BY sort_order, created_at'),
    db.query('SELECT * FROM ai_company_agents ORDER BY department_key, sort_order, created_at'),
    db.query('SELECT * FROM agent_executions ORDER BY started_at DESC LIMIT 100'),
    db.query('SELECT * FROM agent_commands ORDER BY created_at DESC LIMIT 100'),
    db.query(`SELECT * FROM ai_company_decisions ORDER BY (status = 'PENDING') DESC, created_at DESC LIMIT 100`),
    db.query('SELECT * FROM ai_company_runs ORDER BY run_date DESC, updated_at DESC LIMIT 60'),
    req.admin.permissions.includes('members.write')
      ? db.query(
        `SELECT id, agent_key, name, last_used_at, expires_at, revoked_at, created_at
           FROM agent_runner_credentials ORDER BY created_at DESC LIMIT 100`
      )
      : Promise.resolve({ rows: [] }),
    db.query(
      `SELECT c.content_code, c.name, c.source, c.campaign, c.status, c.landing_path,
              count(t.id)::int AS visitors,
              COALESCE(sum(t.visit_count), 0)::int AS visits,
              count(t.user_id)::int AS registrations,
              count(t.user_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM diaries d WHERE d.user_id = t.user_id
                  AND d.deleted_at IS NULL AND d.created_at >= t.registered_at
              ))::int AS first_diaries,
              count(t.user_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM reflection_conversations r WHERE r.user_id = t.user_id
                  AND r.created_at >= t.registered_at
              ))::int AS first_reflections,
              count(t.user_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM diaries d WHERE d.user_id = t.user_id
                  AND d.deleted_at IS NULL AND d.created_at >= t.registered_at
              ) AND EXISTS (
                SELECT 1 FROM reflection_conversations r WHERE r.user_id = t.user_id
                  AND r.created_at >= t.registered_at
              ))::int AS activations,
              count(t.user_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM diaries d WHERE d.user_id = t.user_id
                  AND d.deleted_at IS NULL AND d.created_at >= t.registered_at + interval '7 days'
              ) OR EXISTS (
                SELECT 1 FROM reflection_conversations r WHERE r.user_id = t.user_id
                  AND r.created_at >= t.registered_at + interval '7 days'
              ))::int AS seven_day_returns
         FROM acquisition_campaigns c
         LEFT JOIN acquisition_touchpoints t ON t.content_code = c.content_code
        GROUP BY c.content_code ORDER BY c.created_at DESC`
    )
  ]);
  const agentsByDepartment = new Map();
  for (const row of agents.rows) {
    const list = agentsByDepartment.get(row.department_key) || [];
    list.push(mapAgent(row));
    agentsByDepartment.set(row.department_key, list);
  }
  return ok(res, {
    departments: departments.rows.map(row => ({
      key: row.stable_key, name: row.name, mission: row.mission, status: row.status,
      cadence: row.cadence, reportChannel: row.report_channel,
      operatingSystem: row.operating_system || {}, agents: agentsByDepartment.get(row.stable_key) || []
    })),
    executions: executions.rows,
    commands: commands.rows,
    decisions: decisions.rows,
    departmentRuns: runs.rows,
    runnerCredentials: credentials.rows,
    acquisition: acquisition.rows
  });
}));

router.post('/company/runs', requirePermission('agents.write'), asyncRoute(async (req, res) => {
  const departmentKey = text(req.body?.departmentKey, 80);
  const runDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.runDate || ''))
    ? String(req.body.runDate) : shanghaiDate();
  const flywheelStage = text(req.body?.flywheelStage, 32).toUpperCase();
  const resultState = text(req.body?.resultState, 24).toUpperCase();
  const safetyStatus = text(req.body?.safetyStatus, 16).toUpperCase();
  const operationReason = reason(req.body);
  if (!departmentKey || !FLYWHEEL_STAGES.has(flywheelStage) || !RESULT_STATES.has(resultState)
      || !SAFETY_STATES.has(safetyStatus) || !operationReason) {
    return adminFail(res, 400, '部门日报的阶段、结果、安全状态或记录原因不完整');
  }
  const run = await db.transaction(async client => {
    const department = await client.query('SELECT stable_key FROM ai_company_departments WHERE stable_key = $1', [departmentKey]);
    if (!department.rowCount) return null;
    const before = await client.query(
      'SELECT * FROM ai_company_runs WHERE department_key = $1 AND run_date = $2::date',
      [departmentKey, runDate]
    );
    const result = await client.query(
      `INSERT INTO ai_company_runs
        (id, department_key, run_date, bottleneck, completed_work, evidence,
         flywheel_stage, result_state, safety_status, next_step, source, created_by)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, 'MANUAL', $11)
       ON CONFLICT (department_key, run_date) DO UPDATE SET
         bottleneck = EXCLUDED.bottleneck, completed_work = EXCLUDED.completed_work,
         evidence = EXCLUDED.evidence, flywheel_stage = EXCLUDED.flywheel_stage,
         result_state = EXCLUDED.result_state, safety_status = EXCLUDED.safety_status,
         next_step = EXCLUDED.next_step, source = 'MANUAL', created_by = EXCLUDED.created_by,
         updated_at = now()
       RETURNING *`,
      [crypto.randomUUID(), departmentKey, runDate, text(req.body?.bottleneck, 2000),
        text(req.body?.completedWork, 5000), text(req.body?.evidence, 5000),
        flywheelStage, resultState, safetyStatus, text(req.body?.nextStep, 2000), req.admin.userId]
    );
    await client.query(
      `UPDATE ai_company_agents SET last_result_state = $2, last_run_at = now(), updated_at = now()
        WHERE department_key = $1 AND status = 'ACTIVE'`, [departmentKey, resultState]
    );
    await recordAdminAudit({
      req, action: before.rowCount ? 'DEPARTMENT_RUN_UPDATED' : 'DEPARTMENT_RUN_CREATED',
      targetType: 'COMPANY_DEPARTMENT', targetId: departmentKey, reason: operationReason,
      before: before.rows[0] || null, after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  if (!run) return adminFail(res, 404, '部门不存在');
  return ok(res, run, '部门日报已记录');
}));

router.post('/company/decisions', requirePermission('agents.write'), asyncRoute(async (req, res) => {
  const title = text(req.body?.title, 200);
  const departmentKey = text(req.body?.departmentKey, 80);
  const operationReason = reason(req.body);
  if (!title || !departmentKey || !operationReason) return adminFail(res, 400, '请写明决策、部门和创建原因');
  const options = jsonArray(req.body?.options, 8).map(item => ({
    label: text(item?.label, 120), impact: text(item?.impact, 600)
  })).filter(item => item.label);
  const decision = await db.transaction(async client => {
    const result = await client.query(
      `INSERT INTO ai_company_decisions
        (id, department_key, run_id, title, why_now, options, recommendation,
         impact_if_deferred, due_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING *`,
      [crypto.randomUUID(), departmentKey, req.body?.runId || null, title,
        text(req.body?.whyNow, 3000), JSON.stringify(options),
        text(req.body?.recommendation, 2000), text(req.body?.impactIfDeferred, 2000),
        req.body?.dueAt || null]
    );
    await recordAdminAudit({
      req, action: 'CEO_DECISION_CREATED', targetType: 'COMPANY_DECISION',
      targetId: result.rows[0].id, reason: operationReason, after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  return ok(res, decision, 'CEO 决策卡已创建');
}));

router.patch('/company/decisions/:id', requirePermission('members.write'), requireFreshReauth(), asyncRoute(async (req, res) => {
  const status = text(req.body?.status, 24).toUpperCase();
  const operationReason = reason(req.body);
  if (!UUID_PATTERN.test(req.params.id) || !DECISION_STATES.has(status) || !operationReason) {
    return adminFail(res, 400, '决策状态或决策原因不完整');
  }
  const decision = await db.transaction(async client => {
    const before = await client.query(
      `SELECT * FROM ai_company_decisions WHERE id = $1 AND status = 'PENDING' FOR UPDATE`,
      [req.params.id]
    );
    if (!before.rowCount) return null;
    const result = await client.query(
      `UPDATE ai_company_decisions
          SET status = $2, resolution_note = $3, resolved_at = now(),
              resolved_by = $4, updated_at = now()
        WHERE id = $1 AND status = 'PENDING' RETURNING *`,
      [req.params.id, status, text(req.body?.resolutionNote, 3000), req.admin.userId]
    );
    await recordAdminAudit({
      req, action: 'CEO_DECISION_RESOLVED', targetType: 'COMPANY_DECISION',
      targetId: req.params.id, reason: operationReason,
      before: before.rows[0], after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  if (!decision) return adminFail(res, 404, '待处理决策不存在或已处理');
  return ok(res, decision, 'CEO 决策已记录');
}));

router.post('/company/agents', requirePermission('agents.write'), asyncRoute(async (req, res) => {
  const key = text(req.body?.key, 80);
  const departmentKey = text(req.body?.departmentKey, 80);
  const operationReason = reason(req.body);
  if (!STABLE_KEY_PATTERN.test(key) || !departmentKey || !text(req.body?.name, 120) || !operationReason) {
    return adminFail(res, 400, 'Agent key、部门、名称和创建原因不完整');
  }
  const agent = await db.transaction(async client => {
    const result = await client.query(
      `INSERT INTO ai_company_agents
        (stable_key, department_key, name, level, responsibility, result_definition,
         current_focus, status, executor_type, schedule_text, capabilities, runtime_config, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PAUSED', $8, $9, $10::jsonb, $11::jsonb, $12)
       RETURNING *`,
      [key, departmentKey, text(req.body?.name, 120), text(req.body?.level, 40) || 'L2',
        text(req.body?.responsibility, 4000), text(req.body?.resultDefinition, 4000),
        text(req.body?.currentFocus, 2000),
        EXECUTOR_TYPES.has(text(req.body?.executorType, 32).toUpperCase())
          ? text(req.body.executorType, 32).toUpperCase() : 'MANUAL',
        text(req.body?.schedule, 160), JSON.stringify(jsonArray(req.body?.capabilities)),
        JSON.stringify(jsonObject(req.body?.runtimeConfig)), Number(req.body?.sortOrder) || 100]
    );
    await recordAdminAudit({
      req, action: 'AGENT_CREATED', targetType: 'COMPANY_AGENT', targetId: key,
      reason: operationReason, after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  return ok(res, mapAgent(agent), 'Agent 已创建，默认暂停');
}));

router.patch('/company/agents/:key', requirePermission('agents.write'), asyncRoute(async (req, res) => {
  const key = text(req.params.key, 80);
  const operationReason = reason(req.body);
  const expectedVersion = Number(req.body?.version);
  if (!operationReason || !Number.isInteger(expectedVersion)) return adminFail(res, 400, '请填写变更原因并使用当前版本');
  const allowed = {
    name: ['name', text(req.body?.name, 120)],
    level: ['level', text(req.body?.level, 40)],
    responsibility: ['responsibility', text(req.body?.responsibility, 4000)],
    resultDefinition: ['result_definition', text(req.body?.resultDefinition, 4000)],
    currentFocus: ['current_focus', text(req.body?.currentFocus, 2000)],
    status: ['status', text(req.body?.status, 24).toUpperCase()],
    executorType: ['executor_type', text(req.body?.executorType, 32).toUpperCase()],
    schedule: ['schedule_text', text(req.body?.schedule, 160)],
    capabilities: ['capabilities', JSON.stringify(jsonArray(req.body?.capabilities)), 'jsonb'],
    runtimeConfig: ['runtime_config', JSON.stringify(jsonObject(req.body?.runtimeConfig)), 'jsonb']
  };
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status') && !AGENT_STATES.has(allowed.status[1])) {
    return adminFail(res, 400, 'Agent 状态不正确');
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'executorType') && !EXECUTOR_TYPES.has(allowed.executorType[1])) {
    return adminFail(res, 400, 'Agent 执行器类型不正确');
  }
  const entries = Object.entries(allowed).filter(([input]) => Object.prototype.hasOwnProperty.call(req.body || {}, input));
  if (!entries.length) return adminFail(res, 400, '没有需要更新的 Agent 字段');
  const updated = await db.transaction(async client => {
    const before = await client.query('SELECT * FROM ai_company_agents WHERE stable_key = $1 FOR UPDATE', [key]);
    if (!before.rowCount || Number(before.rows[0].version) !== expectedVersion) return null;
    const values = [key];
    const sets = [];
    for (const [, [column, value, cast]] of entries) {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast ? `::${cast}` : ''}`);
    }
    values.push(expectedVersion);
    const result = await client.query(
      `UPDATE ai_company_agents SET ${sets.join(', ')}, version = version + 1, updated_at = now()
        WHERE stable_key = $1 AND version = $${values.length} RETURNING *`, values
    );
    if (!result.rowCount) return null;
    await recordAdminAudit({
      req, action: 'AGENT_UPDATED', targetType: 'COMPANY_AGENT', targetId: key,
      reason: operationReason, before: before.rows[0], after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  if (!updated) return adminFail(res, 409, 'Agent 配置已变更，请刷新后重试');
  return ok(res, mapAgent(updated), 'Agent 配置已更新');
}));

router.post('/company/agents/:key/commands', requirePermission('agents.write'), asyncRoute(async (req, res) => {
  const key = text(req.params.key, 80);
  const command = text(req.body?.command, 24).toUpperCase();
  const operationReason = reason(req.body);
  if (!COMMANDS.has(command) || !operationReason) return adminFail(res, 400, '指令或执行原因不正确');
  const result = await db.transaction(async client => {
    const agent = await client.query('SELECT * FROM ai_company_agents WHERE stable_key = $1 FOR UPDATE', [key]);
    if (!agent.rowCount || agent.rows[0].status === 'ARCHIVED') return null;
    if (command === 'RUN' && agent.rows[0].status !== 'ACTIVE') {
      return { conflict: '只有处于运行状态的 Agent 才能立即执行' };
    }
    if (command === 'PAUSE') await client.query(`UPDATE ai_company_agents SET status = 'PAUSED', version = version + 1, updated_at = now() WHERE stable_key = $1`, [key]);
    if (command === 'RESUME') await client.query(`UPDATE ai_company_agents SET status = 'ACTIVE', version = version + 1, updated_at = now() WHERE stable_key = $1`, [key]);
    const created = await client.query(
      `INSERT INTO agent_commands (id, agent_key, command, payload, reason, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING *`,
      [crypto.randomUUID(), key, command, JSON.stringify(jsonObject(req.body?.payload)), operationReason, req.admin.userId]
    );
    await recordAdminAudit({
      req, action: `AGENT_COMMAND_${command}`, targetType: 'COMPANY_AGENT', targetId: key,
      reason: operationReason, before: { status: agent.rows[0].status }, after: created.rows[0]
    }, client);
    return created.rows[0];
  });
  if (!result) return adminFail(res, 404, 'Agent 不存在或已归档');
  if (result.conflict) return adminFail(res, 409, result.conflict);
  return ok(res, result, '指令已进入 Agent 执行队列');
}));

router.post('/company/agents/:key/credentials', requirePermission('members.write'), requireFreshReauth(), asyncRoute(async (req, res) => {
  const key = text(req.params.key, 80);
  const operationReason = reason(req.body);
  if (!operationReason) return adminFail(res, 400, '请填写创建 Runner 凭据的原因');
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
    return adminFail(res, 400, 'Runner 凭据到期时间不正确');
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const credential = await db.transaction(async client => {
    const agent = await client.query('SELECT stable_key FROM ai_company_agents WHERE stable_key = $1', [key]);
    if (!agent.rowCount) return null;
    const result = await client.query(
      `INSERT INTO agent_runner_credentials
        (id, agent_key, name, token_hash, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, agent_key, name, expires_at, created_at`,
      [crypto.randomUUID(), key, text(req.body?.name, 120) || `${key} runner`, hashToken(token),
        req.admin.userId, expiresAt ? expiresAt.toISOString() : null]
    );
    await recordAdminAudit({
      req, action: 'AGENT_RUNNER_CREDENTIAL_CREATED', targetType: 'COMPANY_AGENT', targetId: key,
      reason: operationReason, after: result.rows[0]
    }, client);
    return result.rows[0];
  });
  if (!credential) return adminFail(res, 404, 'Agent 不存在');
  return ok(res, { ...credential, token }, 'Runner 凭据只显示这一次，请立即安全保存');
}));

router.delete('/company/agents/:key/credentials/:id', requirePermission('members.write'), requireFreshReauth(), asyncRoute(async (req, res) => {
  const operationReason = reason(req.body);
  if (!UUID_PATTERN.test(req.params.id) || !operationReason) return adminFail(res, 400, '请填写撤销 Runner 凭据的原因');
  const credential = await db.transaction(async client => {
    const result = await client.query(
      `UPDATE agent_runner_credentials SET revoked_at = now()
        WHERE id = $1 AND agent_key = $2 AND revoked_at IS NULL
        RETURNING id, agent_key, name, revoked_at`,
      [req.params.id, req.params.key]
    );
    if (!result.rowCount) return null;
    await recordAdminAudit({
      req, action: 'AGENT_RUNNER_CREDENTIAL_REVOKED', targetType: 'COMPANY_AGENT',
      targetId: req.params.key, reason: operationReason, before: result.rows[0], after: { revoked: true }
    }, client);
    return result.rows[0];
  });
  if (!credential) return adminFail(res, 404, '有效 Runner 凭据不存在');
  return ok(res, credential, 'Runner 凭据已撤销');
}));

router.get('/audit', requirePermission('audit.read'), asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const action = text(req.query.action, 120);
  const targetType = text(req.query.targetType, 80);
  const result = await db.query(
    `SELECT a.*, u.nickname AS actor_name, count(*) OVER()::int AS total_count
       FROM admin_audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE ($1 = '' OR a.action = $1) AND ($2 = '' OR a.target_type = $2)
      ORDER BY a.created_at DESC LIMIT $3 OFFSET $4`,
    [action, targetType, pageSize, offset]
  );
  return ok(res, {
    items: result.rows.map(row => ({
      id: row.id, actorUserId: row.actor_user_id, actorName: row.actor_name,
      actorRole: row.actor_role, action: row.action, targetType: row.target_type,
      targetId: row.target_id, reason: row.reason, before: row.before_value,
      after: row.after_value, requestId: row.request_id, createdAt: row.created_at
    })),
    page, pageSize, total: Number(result.rows[0]?.total_count || 0)
  });
}));

module.exports = router;
module.exports.maskMobile = maskMobile;
