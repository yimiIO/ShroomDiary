'use strict';

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const { asyncRoute, fail, ok, requireAdmin, requireUser, text } = require('../http');
const { shanghaiDate } = require('../compound-system');
const { createAdminToken, verifyAdminToken, verifyPassword } = require('../security');

const router = express.Router();

const FLYWHEEL_STAGES = [
  { key: 'PRIVATE_VALUE', name: '私人价值', description: '过去的数据在正确时机真正帮到用户' },
  { key: 'EXPRESSION', name: '真实表达', description: '用户采纳并公开有来源的表达' },
  { key: 'REACH', name: '外部触达', description: '内容把访客带到用户授权的公开档案' },
  { key: 'INVITATION', name: '邀请参与', description: '访客完成提问、连接或加入' },
  { key: 'OUTCOME', name: '共同成果', description: '双方确认具体经历、事实和结果' },
  { key: 'REVENUE', name: '持续收入', description: '用户因持续价值付费并留存' }
];
const RESULT_STATES = new Set(['OUTPUT', 'VERIFIED', 'REAL_WORLD', 'NONE']);
const SAFETY_STATES = new Set(['PASS', 'STOP']);
const AGENT_STATES = new Set(['ACTIVE', 'PAUSED', 'BLOCKED']);
const DECISION_STATES = new Set(['PENDING', 'APPROVED', 'REJECTED', 'ADJUSTED', 'DEFERRED']);
const STAGE_KEYS = new Set([...FLYWHEEL_STAGES.map(item => item.key), 'SAFETY']);
const ADMIN_UNLOCK_SECONDS = 15 * 60;
const ADMIN_UNLOCK_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_UNLOCK_MAX_ATTEMPTS = 6;
const unlockAttempts = new Map();

function unlockAttemptKey(req) {
  return `${req.user.id}:${req.ip || 'unknown'}`;
}

function recentUnlockAttempts(key, now = Date.now()) {
  return (unlockAttempts.get(key) || []).filter(value => now - value < ADMIN_UNLOCK_WINDOW_MS);
}

function isAdminUnlocked(req) {
  if (!req.user || req.user.role !== 'ADMIN') return false;
  if (req.authKind === 'api-token') return true;
  return Boolean(verifyAdminToken(req.get('x-shroom-admin-token'), req.user.id));
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
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
    lastResultState: row.last_result_state,
    lastRunAt: row.last_run_at
  };
}

function mapRun(row) {
  return {
    id: row.id,
    departmentKey: row.department_key,
    departmentName: row.department_name,
    runDate: dateOnly(row.run_date),
    bottleneck: row.bottleneck,
    completedWork: row.completed_work,
    evidence: row.evidence,
    flywheelStage: row.flywheel_stage,
    resultState: row.result_state,
    safetyStatus: row.safety_status,
    nextStep: row.next_step,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDecision(row) {
  return {
    id: row.id,
    departmentKey: row.department_key,
    departmentName: row.department_name,
    runId: row.run_id,
    title: row.title,
    whyNow: row.why_now,
    options: Array.isArray(row.options) ? row.options : [],
    recommendation: row.recommendation,
    impactIfDeferred: row.impact_if_deferred,
    dueAt: row.due_at,
    status: row.status,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function decisionOptions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map(item => ({
    label: text(item && item.label, 120),
    impact: text(item && item.impact, 600)
  })).filter(item => item.label);
}

async function companyOverview() {
  const [departments, agents, runs, decisions, summary] = await Promise.all([
    db.query('SELECT * FROM ai_company_departments ORDER BY sort_order, created_at'),
    db.query('SELECT * FROM ai_company_agents ORDER BY department_key, sort_order, created_at'),
    db.query(
      `SELECT r.*, d.name AS department_name
         FROM ai_company_runs r
         JOIN ai_company_departments d ON d.stable_key = r.department_key
        ORDER BY r.run_date DESC, r.updated_at DESC
        LIMIT 30`
    ),
    db.query(
      `SELECT x.*, d.name AS department_name
         FROM ai_company_decisions x
         JOIN ai_company_departments d ON d.stable_key = x.department_key
        ORDER BY (x.status = 'PENDING') DESC, x.due_at NULLS LAST, x.created_at DESC
        LIMIT 40`
    ),
    db.query(
      `SELECT
         (SELECT count(*)::int FROM ai_company_agents WHERE status = 'ACTIVE') AS active_agents,
         (SELECT count(*)::int FROM ai_company_decisions WHERE status = 'PENDING') AS pending_decisions,
         (SELECT count(*)::int FROM ai_company_runs
           WHERE run_date >= current_date - 29 AND result_state = 'VERIFIED') AS verified_runs,
         (SELECT count(*)::int FROM ai_company_runs
           WHERE run_date >= current_date - 29 AND result_state = 'REAL_WORLD') AS real_world_runs,
         (SELECT max(updated_at) FROM ai_company_runs) AS last_run_at`
    )
  ]);

  const agentsByDepartment = new Map();
  for (const row of agents.rows) {
    const list = agentsByDepartment.get(row.department_key) || [];
    list.push(mapAgent(row));
    agentsByDepartment.set(row.department_key, list);
  }
  const count = summary.rows[0] || {};
  return {
    governance: {
      chiefExecutive: 'CEO · 你',
      decisionRule: '战略、隐私、预算、生产与不可逆事项由 CEO 决定',
      resultStates: ['OUTPUT', 'VERIFIED', 'REAL_WORLD', 'NONE']
    },
    flywheelStages: FLYWHEEL_STAGES,
    summary: {
      activeAgents: Number(count.active_agents || 0),
      pendingDecisions: Number(count.pending_decisions || 0),
      verifiedRuns30d: Number(count.verified_runs || 0),
      realWorldRuns30d: Number(count.real_world_runs || 0),
      lastRunAt: count.last_run_at || null
    },
    departments: departments.rows.map(row => ({
      key: row.stable_key,
      name: row.name,
      mission: row.mission,
      status: row.status,
      cadence: row.cadence,
      reportChannel: row.report_channel,
      agents: agentsByDepartment.get(row.stable_key) || []
    })),
    recentRuns: runs.rows.map(mapRun),
    decisions: decisions.rows.map(mapDecision)
  };
}

router.use(requireUser);
router.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  next();
});

router.get('/status', asyncRoute(async (req, res) => {
  return ok(res, {
    allowed: req.user.role === 'ADMIN',
    unlocked: isAdminUnlocked(req)
  });
}));

router.post('/unlock', asyncRoute(async (req, res) => {
  if (req.user.role !== 'ADMIN') return fail(res, 403, '仅管理员可访问');
  if (req.authKind === 'api-token') return fail(res, 400, '机器凭证不需要人工解锁');
  const now = Date.now();
  const key = unlockAttemptKey(req);
  const recent = recentUnlockAttempts(key, now);
  if (recent.length >= ADMIN_UNLOCK_MAX_ATTEMPTS) {
    unlockAttempts.set(key, recent);
    return fail(res, 429, '管理员密码尝试次数过多，请 15 分钟后再试');
  }
  const username = text((req.body || {}).username, 80);
  const password = String((req.body || {}).password || '').slice(0, 72);
  if (!config.adminConsoleUsername || !config.adminConsolePasswordHash) {
    return fail(res, 503, '总后台独立凭证尚未配置');
  }
  const validUsername = username === config.adminConsoleUsername;
  const validPassword = verifyPassword(password, config.adminConsolePasswordHash);
  if (!username || !password || !validUsername || !validPassword) {
    recent.push(now);
    unlockAttempts.set(key, recent);
    return fail(res, 403, '管理员账号或密码不正确');
  }
  unlockAttempts.delete(key);
  const adminToken = createAdminToken(req.user.id, ADMIN_UNLOCK_SECONDS);
  return ok(res, {
    adminToken,
    expiresAt: new Date(now + ADMIN_UNLOCK_SECONDS * 1000).toISOString()
  }, '管理后台已解锁');
}));

router.use(requireAdmin);

router.get('/company', asyncRoute(async (req, res) => ok(res, await companyOverview())));

router.patch('/agents/:key', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const status = text(body.status, 24).toUpperCase();
  const currentFocus = text(body.currentFocus, 1200);
  if (status && !AGENT_STATES.has(status)) return fail(res, 400, 'Agent 状态不正确');
  if (!status && !currentFocus) return fail(res, 400, '没有需要更新的内容');
  const result = await db.query(
    `UPDATE ai_company_agents
        SET status = CASE WHEN $2 = '' THEN status ELSE $2 END,
            current_focus = CASE WHEN $3 = '' THEN current_focus ELSE $3 END,
            updated_at = now()
      WHERE stable_key = $1
      RETURNING *`,
    [text(req.params.key, 80), status, currentFocus]
  );
  if (!result.rowCount) return fail(res, 404, 'Agent 不存在');
  return ok(res, mapAgent(result.rows[0]), 'Agent 已更新');
}));

router.post('/runs', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const departmentKey = text(body.departmentKey, 80) || 'growth-compounding';
  const runDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.runDate || ''))
    ? String(body.runDate)
    : shanghaiDate();
  const flywheelStage = text(body.flywheelStage, 32).toUpperCase();
  const resultState = text(body.resultState, 24).toUpperCase();
  const safetyStatus = text(body.safetyStatus, 16).toUpperCase();
  const source = req.authKind === 'api-token' ? 'AUTOMATION' : 'MANUAL';
  if (!STAGE_KEYS.has(flywheelStage)) return fail(res, 400, '飞轮阶段不正确');
  if (!RESULT_STATES.has(resultState)) return fail(res, 400, '结果状态不正确');
  if (!SAFETY_STATES.has(safetyStatus)) return fail(res, 400, '安全状态不正确');
  const result = await db.query(
    `INSERT INTO ai_company_runs
      (id, department_key, run_date, bottleneck, completed_work, evidence,
       flywheel_stage, result_state, safety_status, next_step, source, created_by)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (department_key, run_date) DO UPDATE SET
       bottleneck = EXCLUDED.bottleneck,
       completed_work = EXCLUDED.completed_work,
       evidence = EXCLUDED.evidence,
       flywheel_stage = EXCLUDED.flywheel_stage,
       result_state = EXCLUDED.result_state,
       safety_status = EXCLUDED.safety_status,
       next_step = EXCLUDED.next_step,
       source = EXCLUDED.source,
       created_by = EXCLUDED.created_by,
       updated_at = now()
     RETURNING *`,
    [crypto.randomUUID(), departmentKey, runDate, text(body.bottleneck, 2000),
      text(body.completedWork, 5000), text(body.evidence, 5000), flywheelStage,
      resultState, safetyStatus, text(body.nextStep, 2000), source, req.user.id]
  );
  await db.query(
    `UPDATE ai_company_agents
        SET last_result_state = $2, last_run_at = now(), updated_at = now()
      WHERE department_key = $1 AND status = 'ACTIVE'`,
    [departmentKey, resultState]
  );
  return ok(res, mapRun(result.rows[0]), '部门日报已记录');
}));

router.post('/decisions', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const title = text(body.title, 200);
  if (!title) return fail(res, 400, '请写明需要 CEO 决定什么');
  const result = await db.query(
    `INSERT INTO ai_company_decisions
      (id, department_key, run_id, title, why_now, options, recommendation,
       impact_if_deferred, due_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     ON CONFLICT (run_id, title) WHERE run_id IS NOT NULL DO UPDATE SET
       why_now = EXCLUDED.why_now,
       options = EXCLUDED.options,
       recommendation = EXCLUDED.recommendation,
       impact_if_deferred = EXCLUDED.impact_if_deferred,
       due_at = EXCLUDED.due_at,
       updated_at = now()
     RETURNING *`,
    [crypto.randomUUID(), text(body.departmentKey, 80) || 'growth-compounding',
      body.runId || null, title, text(body.whyNow, 3000),
      JSON.stringify(decisionOptions(body.options)), text(body.recommendation, 2000),
      text(body.impactIfDeferred, 2000), body.dueAt || null]
  );
  return ok(res, mapDecision(result.rows[0]), 'CEO 决策卡已创建');
}));

router.patch('/decisions/:id', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const status = text(body.status, 24).toUpperCase();
  if (!DECISION_STATES.has(status) || status === 'PENDING') return fail(res, 400, '决策状态不正确');
  const result = await db.query(
    `UPDATE ai_company_decisions
        SET status = $2,
            resolution_note = $3,
            resolved_at = now(),
            resolved_by = $4,
            updated_at = now()
      WHERE id = $1 AND status = 'PENDING'
      RETURNING *`,
    [req.params.id, status, text(body.resolutionNote, 3000), req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '待处理决策不存在或已处理');
  return ok(res, mapDecision(result.rows[0]), 'CEO 决策已记录');
}));

module.exports = router;
