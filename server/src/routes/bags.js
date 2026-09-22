'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { asyncRoute, fail, ok, requireUser, text } = require('../http');

const router = express.Router();
router.use(requireUser);

const MAX_DURATION_MINUTES = 90;
const MAX_TASKS_PER_BAG = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUuid(value) {
  return UUID_PATTERN.test(String(value || ''));
}

function taskIds(value, allowEmpty = false) {
  const ids = [...new Set((Array.isArray(value) ? value : []).map(String))];
  if ((!allowEmpty && !ids.length) || ids.length > MAX_TASKS_PER_BAG || ids.some(id => !validUuid(id))) return null;
  return ids;
}

function scheduledAt(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? null : date;
}

function duration(value) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= MAX_DURATION_MINUTES ? minutes : null;
}

function mapBag(row) {
  return {
    id: row.id,
    name: row.name,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    adoptedAt: row.adopted_at,
    completedAt: row.completed_at
  };
}

async function bagRow(client, id, userId, lock = false) {
  if (!validUuid(id)) return null;
  const result = await client.query(
    `SELECT * FROM bags WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function ownedAvailableTasks(client, ids, userId, bagId = null) {
  const result = await client.query(
    `SELECT id FROM todos
      WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL
        AND status IN ('pending', 'in_progress')
        AND (bag_id IS NULL OR bag_id = $3::uuid)
      FOR UPDATE`,
    [ids, userId, bagId]
  );
  return result.rowCount === ids.length;
}

router.post('/', asyncRoute(async (req, res) => {
  const name = text(req.body.name, 300);
  const date = scheduledAt(req.body.scheduledAt);
  const minutes = duration(req.body.durationMinutes);
  const ids = taskIds(req.body.taskIds);
  if (!name) return fail(res, 400, '请为统筹袋命名');
  if (!date) return fail(res, 400, '安排时间格式不正确');
  if (!minutes) return fail(res, 400, `每袋时长需在 1-${MAX_DURATION_MINUTES} 分钟之间`);
  if (!ids) return fail(res, 400, `请选择 1-${MAX_TASKS_PER_BAG} 件有效待办`);

  const row = await db.transaction(async client => {
    if (!await ownedAvailableTasks(client, ids, req.user.id)) {
      throw Object.assign(new Error('部分待办不存在、已完成或已装袋'), { code: 'SHROOM_BAG_INPUT' });
    }
    const id = crypto.randomUUID();
    const adopted = req.body.adopt === true;
    await client.query(
      `INSERT INTO bags (id, user_id, name, scheduled_at, duration_minutes, status, adopted_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'adopted' THEN now() ELSE NULL END)`,
      [id, req.user.id, name, date, minutes, adopted ? 'adopted' : 'proposed']
    );
    await client.query(
      `UPDATE todos SET bag_id = $1, grouping_reason = $4, version = version + 1, updated_at = now()
        WHERE id = ANY($2::uuid[]) AND user_id = $3`,
      [id, ids, req.user.id, text(req.body.groupingReason, 500)]
    );
    return bagRow(client, id, req.user.id);
  });
  return ok(res, mapBag(row), row.status === 'adopted' ? '已按这个分组一起处理' : '统筹建议已保存，等待确认');
}));

router.patch('/:id', asyncRoute(async (req, res) => {
  const result = await db.transaction(async client => {
    const current = await bagRow(client, req.params.id, req.user.id, true);
    if (!current) return { missing: true };
    if (current.status !== 'proposed') return { locked: true, row: current };
    if (req.body.version && Number(req.body.version) !== current.version) return { conflict: true, row: current };

    const name = req.body.name === undefined ? current.name : text(req.body.name, 300);
    const date = req.body.scheduledAt === undefined ? current.scheduled_at : scheduledAt(req.body.scheduledAt);
    const minutes = req.body.durationMinutes === undefined ? current.duration_minutes : duration(req.body.durationMinutes);
    if (!name || !date || !minutes) return { invalid: true };
    if (req.body.taskIds !== undefined) {
      const ids = taskIds(req.body.taskIds);
      if (!ids) return { invalidTasks: true };
      if (!await ownedAvailableTasks(client, ids, req.user.id, current.id)) return { unavailableTasks: true };
      await client.query(
        `UPDATE todos SET bag_id = NULL, grouping_reason = '', version = version + 1, updated_at = now()
          WHERE bag_id = $1 AND user_id = $2`,
        [current.id, req.user.id]
      );
      await client.query(
        `UPDATE todos SET bag_id = $1, grouping_reason = $4, version = version + 1, updated_at = now()
          WHERE id = ANY($2::uuid[]) AND user_id = $3`,
        [current.id, ids, req.user.id, text(req.body.groupingReason, 500)]
      );
    }
    const updated = await client.query(
      `UPDATE bags SET name = $3, scheduled_at = $4, duration_minutes = $5,
         version = version + 1, updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [current.id, req.user.id, name, date, minutes]
    );
    return { row: updated.rows[0] };
  });
  if (result.missing) return fail(res, 404, '统筹袋不存在');
  if (result.locked) return fail(res, 409, '已采纳或已结束的统筹袋不可修改');
  if (result.conflict) return fail(res, 409, '统筹袋已在其他页面更新', mapBag(result.row));
  if (result.invalid) return fail(res, 400, '名称、安排时间或时长不正确');
  if (result.invalidTasks) return fail(res, 400, `请选择 1-${MAX_TASKS_PER_BAG} 件有效待办`);
  if (result.unavailableTasks) return fail(res, 400, '部分待办不存在、已完成或已装入其他统筹袋');
  return ok(res, mapBag(result.row), '统筹袋已更新');
}));

router.post('/:id/adopt', asyncRoute(async (req, res) => {
  const result = await db.transaction(async client => {
    const current = await bagRow(client, req.params.id, req.user.id, true);
    if (!current) return { missing: true };
    if (current.status === 'adopted') return { row: current, unchanged: true };
    if (current.status !== 'proposed') return { invalid: true };
    const updated = await client.query(
      `UPDATE bags SET status = 'adopted', adopted_at = now(), version = version + 1,
         updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [current.id, req.user.id]
    );
    return { row: updated.rows[0] };
  });
  if (result.missing) return fail(res, 404, '统筹袋不存在');
  if (result.invalid) return fail(res, 409, '当前状态不可采纳');
  return ok(res, mapBag(result.row), result.unchanged ? '已采纳' : '统筹袋已采纳');
}));

router.post('/:id/complete', asyncRoute(async (req, res) => {
  const resultText = text(req.body.result, 5000);
  const result = await db.transaction(async client => {
    const current = await bagRow(client, req.params.id, req.user.id, true);
    if (!current) return { missing: true };
    if (current.status === 'completed') return { row: current, completedCount: 0, unchanged: true };
    if (current.status !== 'adopted') return { invalid: true };

    const tasks = await client.query(
      `SELECT id FROM todos WHERE bag_id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [current.id, req.user.id]
    );
    const availableIds = tasks.rows.map(row => row.id);
    const requestedIds = req.body.completedTaskIds === undefined
      ? availableIds
      : taskIds(req.body.completedTaskIds, true);
    if (!requestedIds || requestedIds.some(id => !availableIds.includes(id))) return { invalidTasks: true };

    const completed = requestedIds.length ? await client.query(
      `UPDATE todos SET status = 'completed', completed_at = now(), result_text = $4,
         version = version + 1, updated_at = now()
       WHERE id = ANY($1::uuid[]) AND user_id = $2 AND bag_id = $3
         AND status IN ('pending', 'in_progress')
       RETURNING id`,
      [requestedIds, req.user.id, current.id, resultText]
    ) : { rows: [], rowCount: 0 };

    for (const task of completed.rows) {
      await client.query(
        `INSERT INTO todo_events
          (id, user_id, todo_id, event_type, payload, event_date, visible_in_diary, idempotency_key)
         VALUES ($1, $2, $3, 'COMPLETED', $4::jsonb,
           (now() AT TIME ZONE 'Asia/Shanghai')::date, true, $5)
         ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [crypto.randomUUID(), req.user.id, task.id,
          JSON.stringify({ source: 'BAG', bagId: current.id, bagName: current.name, result: resultText }),
          `bag:${current.id}:complete:${task.id}`]
      );
    }
    const updated = await client.query(
      `UPDATE bags SET status = 'completed', completed_at = now(), version = version + 1,
         updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [current.id, req.user.id]
    );
    return { row: updated.rows[0], completedCount: completed.rowCount };
  });
  if (result.missing) return fail(res, 404, '统筹袋不存在');
  if (result.invalid) return fail(res, 409, '请先采纳统筹袋再完成');
  if (result.invalidTasks) return fail(res, 400, '完成项必须属于当前统筹袋');
  return ok(res, { bag: mapBag(result.row), completedTaskCount: result.completedCount },
    result.unchanged ? '统筹袋已经完成' : '统筹袋已完成，行动记录已写入时间线');
}));

router.post('/:id/scatter', asyncRoute(async (req, res) => {
  const result = await db.transaction(async client => {
    const current = await bagRow(client, req.params.id, req.user.id, true);
    if (!current) return { missing: true };
    if (current.status === 'scattered') return { row: current, unchanged: true };
    if (current.status === 'completed') return { invalid: true };
    const linked = await client.query(
      `UPDATE todos SET bag_id = NULL, grouping_reason = '', version = version + 1, updated_at = now()
        WHERE bag_id = $1 AND user_id = $2 RETURNING id`,
      [current.id, req.user.id]
    );
    const updated = await client.query(
      `UPDATE bags SET status = 'scattered', version = version + 1, updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [current.id, req.user.id]
    );
    await client.query(
      `INSERT INTO correction_events (id, user_id, event_type, original_state, new_state)
       VALUES ($1, $2, 'scatter', $3::jsonb, $4::jsonb)`,
      [crypto.randomUUID(), req.user.id,
        JSON.stringify({ bagId: current.id, status: current.status, taskIds: linked.rows.map(row => row.id) }),
        JSON.stringify({ bagId: current.id, status: 'scattered', taskIds: [] })]
    );
    return { row: updated.rows[0] };
  });
  if (result.missing) return fail(res, 404, '统筹袋不存在');
  if (result.invalid) return fail(res, 409, '已完成的统筹袋不可打散');
  return ok(res, mapBag(result.row), result.unchanged ? '已打散' : '统筹袋已打散');
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const result = await db.transaction(async client => {
    const current = await bagRow(client, req.params.id, req.user.id, true);
    if (!current) return { missing: true };
    if (current.status !== 'proposed') return { locked: true };
    await client.query(
      `UPDATE todos SET bag_id = NULL, grouping_reason = '', version = version + 1, updated_at = now()
        WHERE bag_id = $1 AND user_id = $2`,
      [current.id, req.user.id]
    );
    await client.query('DELETE FROM bags WHERE id = $1 AND user_id = $2', [current.id, req.user.id]);
    return {};
  });
  if (result.missing) return fail(res, 404, '统筹袋不存在');
  if (result.locked) return fail(res, 409, '已采纳或已结束的统筹袋不可删除');
  return ok(res, null, '统筹袋已删除');
}));

router.get('/', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT b.*, count(t.id)::int AS task_count
       FROM bags b LEFT JOIN todos t ON t.bag_id = b.id AND t.user_id = b.user_id AND t.deleted_at IS NULL
      WHERE b.user_id = $1 AND ($2::text IS NULL OR b.status = $2)
      GROUP BY b.id ORDER BY b.scheduled_at DESC LIMIT 100`,
    [req.user.id, req.query.status || null]
  );
  return ok(res, { bags: result.rows.map(row => ({ ...mapBag(row), taskCount: row.task_count })) });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const bag = await bagRow(db, req.params.id, req.user.id);
  if (!bag) return fail(res, 404, '统筹袋不存在');
  const tasks = await db.query(
    `SELECT id, content, tags, project_id, scheduled_date, deadline, estimated_minutes,
            grouping_reason, status, position, version
       FROM todos WHERE bag_id = $1 AND user_id = $2 AND deleted_at IS NULL
       ORDER BY position, created_at`,
    [bag.id, req.user.id]
  );
  return ok(res, {
    bag: mapBag(bag),
    tasks: tasks.rows.map(row => ({
      id: row.id,
      title: row.content,
      tags: row.tags || [],
      projectId: row.project_id,
      scheduledDate: row.scheduled_date,
      deadline: row.deadline,
      estimatedMinutes: row.estimated_minutes,
      groupingReason: row.grouping_reason,
      status: row.status,
      position: Number(row.position || 0),
      version: row.version
    }))
  });
}));

module.exports = router;
