'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { hashToken } = require('../security');
const { asyncRoute, text } = require('../http');

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUNTIME_STATES = new Set(['IDLE', 'RUNNING', 'ERROR']);
const TRIGGER_TYPES = new Set(['SCHEDULED', 'MANUAL', 'RETRY', 'SYSTEM']);
const FINAL_EXECUTION_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED']);
const RESULT_STATES = new Set(['OUTPUT', 'VERIFIED', 'REAL_WORLD', 'NONE']);
const SAFETY_STATES = new Set(['PASS', 'STOP']);
const FLYWHEEL_STAGES = new Set(['PRIVATE_VALUE', 'EXPRESSION', 'REACH', 'INVITATION', 'OUTCOME', 'REVENUE', 'SAFETY']);

function ok(res, data = null, message = 'ok') {
  return res.status(200).json({ code: 200, message, data });
}

function fail(res, status, message, data = null) {
  return res.status(status).json({ code: status, message, data });
}

function jsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function shanghaiDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function jsonArray(value, max = 8) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

async function requireRunner(req, res, next) {
  try {
    const token = String(req.get('x-shroom-agent-token') || '');
    if (token.length < 32 || token.length > 256) return fail(res, 401, 'Runner 凭据无效');
    const result = await db.query(
      `UPDATE agent_runner_credentials c
          SET last_used_at = now()
         FROM ai_company_agents a
        WHERE c.token_hash = $1
          AND c.agent_key = a.stable_key
          AND c.revoked_at IS NULL
          AND (c.expires_at IS NULL OR c.expires_at > now())
        RETURNING c.id AS credential_id, c.agent_key, c.name AS credential_name,
                  a.department_key, a.name, a.level, a.status, a.executor_type, a.runtime_state`,
      [hashToken(token)]
    );
    if (!result.rowCount) return fail(res, 401, 'Runner 凭据无效或已过期');
    req.runner = result.rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

router.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  next();
});
router.use(requireRunner);

router.get('/state', asyncRoute(async (req, res) => {
  const [agent, pending] = await Promise.all([
    db.query(
      `SELECT stable_key, department_key, name, level, responsibility, result_definition,
              current_focus, status, executor_type, schedule_text, capabilities,
              runtime_config, version, runtime_state, runtime_message,
              last_heartbeat_at, next_run_at, last_result_state, last_run_at
         FROM ai_company_agents WHERE stable_key = $1`,
      [req.runner.agent_key]
    ),
    db.query(
      `SELECT count(*)::int AS count FROM agent_commands
        WHERE agent_key = $1 AND status = 'PENDING'`,
      [req.runner.agent_key]
    )
  ]);
  return ok(res, {
    agent: agent.rows[0],
    pendingCommands: Number(pending.rows[0]?.count || 0),
    serverTime: new Date().toISOString()
  });
}));

router.post('/department-runs', asyncRoute(async (req, res) => {
  if (req.runner.level !== 'L1') return fail(res, 403, '只有部门总管 Runner 可以写入部门日报');
  const runDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.runDate || ''))
    ? String(req.body.runDate) : shanghaiDate();
  const flywheelStage = text(req.body?.flywheelStage, 32).toUpperCase();
  const resultState = text(req.body?.resultState, 24).toUpperCase();
  const safetyStatus = text(req.body?.safetyStatus, 16).toUpperCase();
  if (!FLYWHEEL_STAGES.has(flywheelStage) || !RESULT_STATES.has(resultState)
      || !SAFETY_STATES.has(safetyStatus)) {
    return fail(res, 400, '部门日报的阶段、结果或安全状态不正确');
  }
  const run = await db.transaction(async client => {
    const result = await client.query(
      `INSERT INTO ai_company_runs
        (id, department_key, run_date, bottleneck, completed_work, evidence,
         flywheel_stage, result_state, safety_status, next_step, source, created_by)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, 'AUTOMATION', NULL)
       ON CONFLICT (department_key, run_date) DO UPDATE SET
         bottleneck = EXCLUDED.bottleneck, completed_work = EXCLUDED.completed_work,
         evidence = EXCLUDED.evidence, flywheel_stage = EXCLUDED.flywheel_stage,
         result_state = EXCLUDED.result_state, safety_status = EXCLUDED.safety_status,
         next_step = EXCLUDED.next_step, source = 'AUTOMATION', created_by = NULL,
         updated_at = now()
       RETURNING *`,
      [crypto.randomUUID(), req.runner.department_key, runDate,
        text(req.body?.bottleneck, 2000), text(req.body?.completedWork, 5000),
        text(req.body?.evidence, 5000), flywheelStage, resultState, safetyStatus,
        text(req.body?.nextStep, 2000)]
    );
    await client.query(
      `UPDATE ai_company_agents
          SET last_result_state = $2, last_run_at = now(), updated_at = now()
        WHERE stable_key = $1`,
      [req.runner.agent_key, resultState]
    );
    return result.rows[0];
  });
  return ok(res, run, '部门日报已记录');
}));

router.get('/department-runs/:runDate', asyncRoute(async (req, res) => {
  if (req.runner.level !== 'L1') return fail(res, 403, '只有部门总管 Runner 可以读取部门日报');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.runDate)) return fail(res, 400, '日报日期不正确');
  const result = await db.query(
    `SELECT * FROM ai_company_runs
      WHERE department_key = $1 AND run_date = $2::date`,
    [req.runner.department_key, req.params.runDate]
  );
  if (!result.rowCount) return fail(res, 404, '部门日报不存在');
  return ok(res, result.rows[0]);
}));

router.post('/decisions', asyncRoute(async (req, res) => {
  if (req.runner.level !== 'L1') return fail(res, 403, '只有部门总管 Runner 可以提交 CEO 决策卡');
  const title = text(req.body?.title, 200);
  const runId = text(req.body?.runId, 80);
  if (!title || !UUID_PATTERN.test(runId)) return fail(res, 400, '决策标题或日报 ID 不正确');
  const options = jsonArray(req.body?.options).map(item => ({
    label: text(item?.label, 120), impact: text(item?.impact, 600)
  })).filter(item => item.label);
  const decision = await db.transaction(async client => {
    const ownedRun = await client.query(
      'SELECT id FROM ai_company_runs WHERE id = $1 AND department_key = $2',
      [runId, req.runner.department_key]
    );
    if (!ownedRun.rowCount) return null;
    const result = await client.query(
      `INSERT INTO ai_company_decisions
        (id, department_key, run_id, title, why_now, options, recommendation,
         impact_if_deferred, due_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       ON CONFLICT (run_id, title) WHERE run_id IS NOT NULL DO UPDATE SET
         why_now = EXCLUDED.why_now, options = EXCLUDED.options,
         recommendation = EXCLUDED.recommendation,
         impact_if_deferred = EXCLUDED.impact_if_deferred, due_at = EXCLUDED.due_at,
         updated_at = now()
       RETURNING *`,
      [crypto.randomUUID(), req.runner.department_key, runId, title,
        text(req.body?.whyNow, 3000), JSON.stringify(options),
        text(req.body?.recommendation, 2000), text(req.body?.impactIfDeferred, 2000),
        isoDate(req.body?.dueAt)]
    );
    return result.rows[0];
  });
  if (!decision) return fail(res, 404, '日报不存在或不属于当前 Runner 部门');
  return ok(res, decision, 'CEO 决策卡已记录');
}));

router.post('/heartbeat', asyncRoute(async (req, res) => {
  const runtimeState = text(req.body?.runtimeState, 24).toUpperCase() || 'IDLE';
  if (!RUNTIME_STATES.has(runtimeState)) return fail(res, 400, 'Runner 运行状态不正确');
  const nextRunAt = req.body?.nextRunAt ? isoDate(req.body.nextRunAt) : null;
  if (req.body?.nextRunAt && !nextRunAt) return fail(res, 400, '下次运行时间不正确');
  const result = await db.query(
    `UPDATE ai_company_agents
        SET runtime_state = $2, runtime_message = $3, last_heartbeat_at = now(),
            next_run_at = $4, updated_at = now()
      WHERE stable_key = $1
      RETURNING stable_key, status, runtime_state, runtime_message,
                last_heartbeat_at, next_run_at, version`,
    [req.runner.agent_key, runtimeState, text(req.body?.message, 2000), nextRunAt]
  );
  return ok(res, result.rows[0], '心跳已记录');
}));

router.post('/commands/next', asyncRoute(async (req, res) => {
  const command = await db.transaction(async client => {
    const selected = await client.query(
      `SELECT id FROM agent_commands
        WHERE agent_key = $1 AND status = 'PENDING'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [req.runner.agent_key]
    );
    if (!selected.rowCount) return null;
    const claimed = await client.query(
      `UPDATE agent_commands
          SET status = 'CLAIMED', claimed_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING id, agent_key, command, payload, reason, created_at, claimed_at`,
      [selected.rows[0].id]
    );
    return claimed.rows[0];
  });
  return ok(res, command, command ? '已领取指令' : '暂无待执行指令');
}));

router.post('/commands/:id/complete', asyncRoute(async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return fail(res, 400, '指令 ID 不正确');
  const status = text(req.body?.status, 24).toUpperCase();
  if (!['COMPLETED', 'FAILED'].includes(status)) return fail(res, 400, '指令完成状态不正确');
  const executionId = req.body?.executionId ? text(req.body.executionId, 80) : null;
  if (executionId && !UUID_PATTERN.test(executionId)) return fail(res, 400, '执行 ID 不正确');
  const result = await db.query(
      `UPDATE agent_commands
        SET status = $3, completed_at = now(), result_execution_id = $4, updated_at = now()
      WHERE id = $1 AND agent_key = $2 AND status = 'CLAIMED'
        AND ($4::uuid IS NULL OR EXISTS (
          SELECT 1 FROM agent_executions e WHERE e.id = $4 AND e.agent_key = $2
        ))
      RETURNING id, command, status, completed_at, result_execution_id`,
    [req.params.id, req.runner.agent_key, status, executionId]
  );
  if (!result.rowCount) return fail(res, 409, '指令不存在、不属于该 Runner 或已结束');
  return ok(res, result.rows[0], '指令状态已更新');
}));

router.post('/executions', asyncRoute(async (req, res) => {
  const triggerType = text(req.body?.triggerType, 24).toUpperCase() || 'SCHEDULED';
  const commandId = req.body?.commandId ? text(req.body.commandId, 80) : null;
  if (!TRIGGER_TYPES.has(triggerType) || (commandId && !UUID_PATTERN.test(commandId))) {
    return fail(res, 400, '执行触发类型或指令 ID 不正确');
  }
  const execution = await db.transaction(async client => {
    const agent = await client.query(
      'SELECT status FROM ai_company_agents WHERE stable_key = $1 FOR UPDATE',
      [req.runner.agent_key]
    );
    if (!agent.rowCount || agent.rows[0].status !== 'ACTIVE') return { conflict: true };
    if (commandId) {
      const command = await client.query(
        `SELECT id FROM agent_commands
          WHERE id = $1 AND agent_key = $2 AND status = 'CLAIMED'`,
        [commandId, req.runner.agent_key]
      );
      if (!command.rowCount) return { badCommand: true };
    }
    const result = await client.query(
      `INSERT INTO agent_executions
        (id, agent_key, command_id, trigger_type, status, metadata)
       VALUES ($1, $2, $3, $4, 'RUNNING', $5::jsonb)
       RETURNING *`,
      [crypto.randomUUID(), req.runner.agent_key, commandId, triggerType,
        JSON.stringify(jsonObject(req.body?.metadata))]
    );
    await client.query(
      `UPDATE ai_company_agents
          SET runtime_state = 'RUNNING', runtime_message = $2,
              last_heartbeat_at = now(), updated_at = now()
        WHERE stable_key = $1`,
      [req.runner.agent_key, text(req.body?.message, 2000)]
    );
    return result.rows[0];
  });
  if (execution.conflict) return fail(res, 409, '当前 Agent 未处于运行状态');
  if (execution.badCommand) return fail(res, 409, '指令未领取或不属于该 Agent');
  return ok(res, execution, '执行已开始');
}));

router.patch('/executions/:id', asyncRoute(async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return fail(res, 400, '执行 ID 不正确');
  const status = text(req.body?.status, 24).toUpperCase();
  const resultState = text(req.body?.resultState, 24).toUpperCase() || 'NONE';
  if (!FINAL_EXECUTION_STATES.has(status) || !RESULT_STATES.has(resultState)) {
    return fail(res, 400, '执行结果状态不正确');
  }
  const execution = await db.transaction(async client => {
    const result = await client.query(
      `UPDATE agent_executions
          SET status = $3, result_state = $4, summary = $5, evidence = $6,
              error_message = $7, metadata = metadata || $8::jsonb,
              finished_at = now(), updated_at = now()
        WHERE id = $1 AND agent_key = $2 AND status = 'RUNNING'
        RETURNING *`,
      [req.params.id, req.runner.agent_key, status, resultState,
        text(req.body?.summary, 6000), text(req.body?.evidence, 12000),
        text(req.body?.errorMessage, 6000), JSON.stringify(jsonObject(req.body?.metadata))]
    );
    if (!result.rowCount) return null;
    const failed = status === 'FAILED';
    await client.query(
      `UPDATE ai_company_agents
          SET runtime_state = $2, runtime_message = $3, last_heartbeat_at = now(),
              last_result_state = $4, last_run_at = now(), updated_at = now()
        WHERE stable_key = $1`,
      [req.runner.agent_key, failed ? 'ERROR' : 'IDLE',
        failed ? text(req.body?.errorMessage, 2000) : text(req.body?.summary, 2000), resultState]
    );
    return result.rows[0];
  });
  if (!execution) return fail(res, 409, '执行不存在、不属于该 Runner 或已结束');
  return ok(res, execution, '执行结果已记录');
}));

module.exports = router;
