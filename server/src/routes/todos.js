'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { asyncRoute, fail, ok, pageParams, requireUser, stringArray, text } = require('../http');

const router = express.Router();
router.use(requireUser);

function mapTodo(row) {
  return {
    id: row.id,
    content: row.content,
    deadline: row.deadline,
    tags: row.tags || [],
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const selectFields = 'id, content, deadline, tags, status, completed_at, created_at, updated_at';

router.get('/index', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const status = ['pending', 'completed'].includes(req.query.status) ? req.query.status : null;
  const values = [req.user.id, pageSize, offset];
  if (status) values.push(status);
  const filter = status ? 'AND status = $4' : '';
  const [items, total] = await Promise.all([
    db.query(
      `SELECT ${selectFields} FROM todos WHERE user_id = $1 ${filter}
       ORDER BY CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, deadline, created_at DESC LIMIT $2 OFFSET $3`,
      values
    ),
    db.query(
      `SELECT count(*)::int AS total FROM todos WHERE user_id = $1 ${status ? 'AND status = $2' : ''}`,
      status ? [req.user.id, status] : [req.user.id]
    )
  ]);
  return ok(res, { list: items.rows.map(mapTodo), total: total.rows[0].total, page, pageSize });
}));

router.get('/view', asyncRoute(async (req, res) => {
  const result = await db.query(`SELECT ${selectFields} FROM todos WHERE id = $1 AND user_id = $2`, [req.query.id, req.user.id]);
  if (!result.rowCount) return fail(res, 404, '待办不存在');
  return ok(res, mapTodo(result.rows[0]));
}));

router.post('/create', asyncRoute(async (req, res) => {
  const content = text(req.body.content, 500);
  if (!content) return fail(res, 400, '待办内容不能为空');
  const result = await db.query(
    `INSERT INTO todos (id, user_id, content, deadline, tags, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'pending') RETURNING ${selectFields}`,
    [crypto.randomUUID(), req.user.id, content, req.body.deadline || null, JSON.stringify(stringArray(req.body.tags))]
  );
  return ok(res, mapTodo(result.rows[0]), '待办已创建');
}));

router.put('/update', asyncRoute(async (req, res) => {
  const content = text(req.body.content, 500);
  if (!content) return fail(res, 400, '待办内容不能为空');
  const result = await db.query(
    `UPDATE todos SET content = $3, deadline = $4, tags = $5::jsonb, updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING ${selectFields}`,
    [req.query.id, req.user.id, content, req.body.deadline || null, JSON.stringify(stringArray(req.body.tags))]
  );
  if (!result.rowCount) return fail(res, 404, '待办不存在');
  return ok(res, mapTodo(result.rows[0]), '待办已更新');
}));

router.delete('/delete', asyncRoute(async (req, res) => {
  const result = await db.query('DELETE FROM todos WHERE id = $1 AND user_id = $2', [req.query.id, req.user.id]);
  if (!result.rowCount) return fail(res, 404, '待办不存在');
  return ok(res, null, '待办已删除');
}));

router.post('/complete', asyncRoute(async (req, res) => {
  const id = req.query.id || req.body.id;
  const result = await db.query(
    `UPDATE todos SET status = 'completed', completed_at = now(), updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING ${selectFields}`,
    [id, req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '待办不存在');
  return ok(res, mapTodo(result.rows[0]), '待办已完成');
}));

module.exports = router;
