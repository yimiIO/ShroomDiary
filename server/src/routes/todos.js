'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { asyncRoute, fail, ok, pageParams, requireUser, text } = require('../http');
const {
  addDays,
  dateOnly,
  decorateTask,
  groupCurrentTasks,
  normalizeRecurrence,
  normalizeTimeZone,
  recurrenceDates,
  repeatLabel,
  taskMatchesView,
  todayInTimeZone
} = require('../todo-system');

const router = express.Router();
router.use(requireUser);

const TASK_SELECT = `t.id, t.content, t.description, t.project_id, t.scheduled_date, t.deadline,
  t.tags, t.status, t.recurrence_rule_id, t.occurrence_date, t.compound_item_id,
  t.source_type, t.source_ref_id, t.source_diary_id, t.source_compound_thread_id,
  t.started_at, t.completed_at, t.cancelled_at, t.result_text, t.result_media_ids,
  t.position, t.version, t.created_at, t.updated_at,
  p.name AS project_name, p.status AS project_status,
  li.name AS compound_item_name, li.stable_key AS compound_item_key,
  rr.frequency AS recurrence_frequency, rr.starts_on AS recurrence_starts_on,
  rr.ends_on AS recurrence_ends_on, rr.week_days AS recurrence_week_days,
  rr.month_day AS recurrence_month_day, rr.time_zone AS recurrence_time_zone,
  rr.status AS recurrence_status, rr.version AS recurrence_version`;

const TASK_FROM = `FROM todos t
  LEFT JOIN todo_projects p ON p.id = t.project_id AND p.user_id = t.user_id
  LEFT JOIN life_os_items li ON li.id = t.compound_item_id AND li.user_id = t.user_id
  LEFT JOIN todo_recurrence_rules rr ON rr.id = t.recurrence_rule_id AND rr.user_id = t.user_id`;

function mapTask(row, today = todayInTimeZone('Asia/Shanghai')) {
  const recurrence = row.recurrence_rule_id ? {
    id: row.recurrence_rule_id,
    frequency: row.recurrence_frequency,
    startsOn: dateOnly(row.recurrence_starts_on),
    endsOn: dateOnly(row.recurrence_ends_on),
    weekDays: row.recurrence_week_days || [],
    monthDay: row.recurrence_month_day,
    timeZone: row.recurrence_time_zone,
    status: row.recurrence_status,
    version: row.recurrence_version
  } : null;
  return decorateTask({
    id: row.id,
    title: row.content,
    content: row.content,
    description: row.description || '',
    projectId: row.project_id,
    projectName: row.project_name || '',
    projectStatus: row.project_status || null,
    scheduledDate: row.scheduled_date,
    deadline: row.deadline,
    tags: row.tags || [],
    status: row.status,
    recurrenceRuleId: row.recurrence_rule_id,
    occurrenceDate: dateOnly(row.occurrence_date),
    recurrence: recurrence ? { ...recurrence, label: repeatLabel(recurrence) } : null,
    compoundItemId: row.compound_item_id,
    compoundItemName: row.compound_item_name || '',
    compoundItemKey: row.compound_item_key || '',
    sourceType: row.source_type || 'MANUAL',
    sourceRefId: row.source_ref_id || null,
    sourceDiaryId: row.source_diary_id || null,
    sourceCompoundThreadId: row.source_compound_thread_id || null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    result: row.result_text || '',
    resultMediaIds: row.result_media_ids || [],
    position: Number(row.position || 0),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }, today);
}

function mapProject(row) {
  return {
    id: row.id,
    name: row.name,
    goal: row.goal || '',
    status: row.status,
    openCount: Number(row.open_count || 0),
    progressingCount: Number(row.progressing_count || 0),
    completedCount: Number(row.completed_count || 0),
    version: row.version,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function recurrenceFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    projectId: row.project_id,
    compoundItemId: row.compound_item_id,
    frequency: row.frequency,
    startsOn: dateOnly(row.starts_on),
    endsOn: dateOnly(row.ends_on),
    weekDays: row.week_days || [],
    monthDay: row.month_day,
    timeZone: row.time_zone,
    status: row.status,
    version: row.version,
    lastGeneratedThrough: dateOnly(row.last_generated_through)
  };
}

function taskSource(body) {
  const allowed = new Set(['MANUAL', 'DIARY_AI', 'COMPOUND', 'PROJECT']);
  return allowed.has(body.sourceType) ? body.sourceType : 'MANUAL';
}

function clientRequestId(value) {
  return text(value, 100) || null;
}

async function assertOwned(client, table, id, userId, message) {
  if (!id) return null;
  const result = await client.query(`SELECT id FROM ${table} WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!result.rowCount) throw Object.assign(new Error(message), { code: 'SHROOM_TODO_INPUT' });
  return id;
}

async function ownedMediaIds(client, values, userId) {
  const ids = [...new Set((Array.isArray(values) ? values : [])
    .map(item => String(item || '')).filter(item => /^[0-9a-f-]{36}$/i.test(item)))].slice(0, 9);
  if (!ids.length) return [];
  const result = await client.query('SELECT id FROM media_assets WHERE user_id = $1 AND id = ANY($2::uuid[])', [userId, ids]);
  if (result.rowCount !== ids.length) throw Object.assign(new Error('结果附件不属于当前账号'), { code: 'SHROOM_TODO_INPUT' });
  return ids;
}

async function insertEvent(client, {
  userId, todoId, eventType, payload = {}, eventDate = null, sourceDiaryId = null,
  sourceCompoundThreadId = null, visibleInDiary = false, idempotencyKey = null
}) {
  const result = await client.query(
    `INSERT INTO todo_events
      (id, user_id, todo_id, event_type, payload, event_date, source_diary_id,
       source_compound_thread_id, visible_in_diary, idempotency_key)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [crypto.randomUUID(), userId, todoId, eventType, JSON.stringify(payload), eventDate,
      sourceDiaryId, sourceCompoundThreadId, visibleInDiary, idempotencyKey]
  );
  return result.rows[0] || null;
}

async function taskRow(client, id, userId, lock = false) {
  const result = await client.query(
    `SELECT ${TASK_SELECT} ${TASK_FROM}
      WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NULL${lock ? ' FOR UPDATE OF t' : ''}`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function insertOccurrence(client, userId, rule, occurrenceDate) {
  const id = crypto.randomUUID();
  const result = await client.query(
    `INSERT INTO todos
      (id, user_id, content, description, project_id, scheduled_date, deadline, status,
       recurrence_rule_id, occurrence_date, compound_item_id, source_type, position)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, 'pending', $7, $6, $8, 'RECURRENCE',
       COALESCE((SELECT max(position) + 1 FROM todos WHERE user_id = $2 AND project_id IS NOT DISTINCT FROM $5), 1))
     ON CONFLICT (user_id, recurrence_rule_id, occurrence_date)
       WHERE recurrence_rule_id IS NOT NULL AND occurrence_date IS NOT NULL AND deleted_at IS NULL
     DO NOTHING RETURNING id`,
    [id, userId, rule.title, rule.description, rule.projectId, occurrenceDate, rule.id, rule.compoundItemId]
  );
  if (result.rowCount) {
    await insertEvent(client, {
      userId, todoId: id, eventType: 'CREATED', eventDate: occurrenceDate,
      payload: { source: 'RECURRENCE', recurrenceRuleId: rule.id, occurrenceDate },
      idempotencyKey: `recurrence:${rule.id}:${occurrenceDate}:created`
    });
  }
  return result.rows[0]?.id || null;
}

async function generateRule(client, userId, row, throughDate) {
  const rule = recurrenceFromRow(row);
  if (rule.status !== 'ACTIVE') return [];
  const fromDate = rule.lastGeneratedThrough ? addDays(rule.lastGeneratedThrough, 1) : rule.startsOn;
  const effectiveThrough = rule.endsOn && rule.endsOn < throughDate ? rule.endsOn : throughDate;
  if (effectiveThrough < fromDate) return [];
  const dates = recurrenceDates(rule, fromDate, effectiveThrough);
  const ids = [];
  for (const occurrenceDate of dates) {
    const id = await insertOccurrence(client, userId, rule, occurrenceDate);
    if (id) ids.push(id);
  }
  await client.query(
    `UPDATE todo_recurrence_rules SET last_generated_through = GREATEST(COALESCE(last_generated_through, starts_on), $3::date), updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [rule.id, userId, effectiveThrough]
  );
  return ids;
}

async function generateActiveRules(userId, today) {
  return db.transaction(async client => {
    const rules = await client.query(
      `SELECT * FROM todo_recurrence_rules
        WHERE user_id = $1 AND status = 'ACTIVE' AND starts_on <= $2::date + 62
          AND (ends_on IS NULL OR ends_on >= $2::date - 366)
        FOR UPDATE`,
      [userId, today]
    );
    for (const row of rules.rows) {
      const daysAhead = row.frequency === 'DAILY' ? 1 : (row.frequency === 'WEEKLY' ? 7 : 32);
      const through = [addDays(today, daysAhead), row.starts_on].sort().pop();
      await generateRule(client, userId, row, through);
    }
  });
}

async function listTaskRows(userId, { projectId = null, query = '', includeCancelled = false } = {}) {
  const values = [userId];
  const clauses = ['t.user_id = $1', 't.deleted_at IS NULL'];
  if (projectId) {
    values.push(projectId);
    clauses.push(`t.project_id = $${values.length}`);
  }
  if (query) {
    values.push(`%${query}%`);
    clauses.push(`(t.content ILIKE $${values.length} OR t.description ILIKE $${values.length}
      OR p.name ILIKE $${values.length} OR t.result_text ILIKE $${values.length})`);
  }
  if (!includeCancelled) clauses.push("t.status <> 'cancelled'");
  const result = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_FROM} WHERE ${clauses.join(' AND ')}
      ORDER BY t.position, COALESCE(t.scheduled_date, t.deadline) NULLS LAST, t.created_at DESC`,
    values
  );
  return result.rows;
}

async function projectRows(userId, includeArchived = false) {
  const result = await db.query(
    `SELECT p.*,
      count(t.id) FILTER (WHERE t.status IN ('pending', 'in_progress') AND t.deleted_at IS NULL)::int AS open_count,
      count(t.id) FILTER (WHERE t.status = 'in_progress' AND t.deleted_at IS NULL)::int AS progressing_count,
      count(t.id) FILTER (WHERE t.status = 'completed' AND t.deleted_at IS NULL)::int AS completed_count
     FROM todo_projects p LEFT JOIN todos t ON t.project_id = p.id AND t.user_id = p.user_id
     WHERE p.user_id = $1 ${includeArchived ? '' : "AND p.status <> 'ARCHIVED'"}
     GROUP BY p.id ORDER BY p.status, p.position, p.updated_at DESC`,
    [userId]
  );
  return result.rows;
}

router.get('/home', asyncRoute(async (req, res) => {
  const timeZone = normalizeTimeZone(req.query.timeZone);
  const today = todayInTimeZone(timeZone);
  await generateActiveRules(req.user.id, today);
  const view = ['current', 'upcoming', 'unscheduled', 'projects', 'all', 'completed']
    .includes(req.query.view) ? req.query.view : 'current';
  const query = text(req.query.q, 100);
  const projects = (await projectRows(req.user.id)).map(mapProject);
  if (view === 'projects') return ok(res, { view, today, timeZone, projects, groups: [] });
  const rows = await listTaskRows(req.user.id, { query, includeCancelled: view === 'all' });
  const tasks = rows.map(row => mapTask(row, today));
  if (view === 'current') {
    const groups = groupCurrentTasks(tasks, today);
    return ok(res, {
      view, today, timeZone, projects,
      groups: [
        { key: 'progressing', label: '正在推进', items: groups.progressing },
        { key: 'today', label: '今天安排', items: groups.today },
        { key: 'earlier', label: '之前安排', items: groups.earlier, collapsible: true }
      ].filter(group => group.items.length),
      unscheduledCount: tasks.filter(item => taskMatchesView(item, 'unscheduled', today)).length
    });
  }
  const filtered = tasks.filter(item => taskMatchesView(item, view, today));
  filtered.sort((left, right) => String(left.scheduledDate || left.deadline || '').localeCompare(String(right.scheduledDate || right.deadline || '')));
  return ok(res, { view, today, timeZone, projects, groups: [{ key: view, label: '', items: filtered }] });
}));

router.get('/index', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const timeZone = normalizeTimeZone(req.query.timeZone);
  const today = todayInTimeZone(timeZone);
  await generateActiveRules(req.user.id, today);
  const status = ['pending', 'in_progress', 'completed', 'cancelled', 'open'].includes(req.query.status) ? req.query.status : null;
  const rows = await listTaskRows(req.user.id, { query: text(req.query.q, 100), includeCancelled: Boolean(status === 'cancelled') });
  const tasks = rows.map(row => mapTask(row, today)).filter(item => !status
    || (status === 'open' ? ['pending', 'in_progress'].includes(item.status) : item.status === status));
  return ok(res, { list: tasks.slice(offset, offset + pageSize), total: tasks.length, page, pageSize });
}));

router.get('/options', asyncRoute(async (req, res) => {
  const [projects, directions] = await Promise.all([
    projectRows(req.user.id),
    db.query(`SELECT id, stable_key, section, name FROM life_os_items
      WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY priority, original_number`, [req.user.id])
  ]);
  return ok(res, {
    projects: projects.map(mapProject),
    directions: directions.rows.map(row => ({ id: row.id, key: row.stable_key, section: row.section, name: row.name }))
  });
}));

router.get('/view', asyncRoute(async (req, res) => {
  const timeZone = normalizeTimeZone(req.query.timeZone);
  const today = todayInTimeZone(timeZone);
  const row = await taskRow(db, req.query.id, req.user.id);
  if (!row) return fail(res, 404, '待办不存在');
  const [events, inferredDiary] = await Promise.all([
    db.query(
      `SELECT id, event_type, payload, event_date, source_diary_id, source_compound_thread_id,
        visible_in_diary, valid, created_at FROM todo_events
       WHERE todo_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
      [req.query.id, req.user.id]
    ),
    db.query(
      `SELECT da.diary_id, left(d.content, 180) AS excerpt,
        to_char(d.occurred_at AT TIME ZONE $3, 'YYYY-MM-DD') AS date
       FROM diary_analysis da JOIN diaries d ON d.id = da.diary_id AND d.user_id = da.user_id
       WHERE da.user_id = $1 AND d.deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(da.todo_candidates) c
           WHERE c->>'createdTodoId' = $2::text)
       LIMIT 1`,
      [req.user.id, req.query.id, timeZone]
    )
  ]);
  const task = mapTask(row, today);
  const linkedDiaryIds = [...new Set(events.rows.map(item => item.source_diary_id).filter(Boolean))];
  let linkedDiaries = [];
  if (linkedDiaryIds.length) {
    const result = await db.query(
      `SELECT id, left(content, 180) AS excerpt,
        to_char(occurred_at AT TIME ZONE $3, 'YYYY-MM-DD') AS date
       FROM diaries WHERE user_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
      [req.user.id, linkedDiaryIds, timeZone]
    );
    linkedDiaries = result.rows;
  }
  if (inferredDiary.rowCount && !linkedDiaries.some(item => item.id === inferredDiary.rows[0].diary_id)) {
    linkedDiaries.push({ id: inferredDiary.rows[0].diary_id, excerpt: inferredDiary.rows[0].excerpt, date: inferredDiary.rows[0].date });
  }
  return ok(res, {
    ...task,
    events: events.rows.map(item => ({
      id: item.id, type: item.event_type, payload: item.payload || {}, eventDate: item.event_date,
      sourceDiaryId: item.source_diary_id, sourceCompoundThreadId: item.source_compound_thread_id,
      visibleInDiary: item.visible_in_diary, valid: item.valid, createdAt: item.created_at
    })),
    linkedDiaries
  });
}));

router.post('/create', asyncRoute(async (req, res) => {
  const title = text(req.body.title || req.body.content, 500);
  if (!title) return fail(res, 400, '写下要做什么就能保存');
  const description = text(req.body.description, 5000);
  const scheduledDate = req.body.scheduledDate ? dateOnly(req.body.scheduledDate) : null;
  const deadline = req.body.deadline ? dateOnly(req.body.deadline) : null;
  if (req.body.scheduledDate && !scheduledDate) return fail(res, 400, '安排日期格式不正确');
  if (req.body.deadline && !deadline) return fail(res, 400, '截止日期格式不正确');
  const timeZone = normalizeTimeZone(req.body.timeZone);
  const requestId = clientRequestId(req.body.clientRequestId);
  const sourceType = taskSource(req.body);
  const result = await db.transaction(async client => {
    if (requestId) {
      const existing = await client.query('SELECT id FROM todos WHERE user_id = $1 AND client_request_id = $2 AND deleted_at IS NULL', [req.user.id, requestId]);
      if (existing.rowCount) return taskRow(client, existing.rows[0].id, req.user.id);
      const existingRule = await client.query('SELECT * FROM todo_recurrence_rules WHERE user_id = $1 AND client_request_id = $2', [req.user.id, requestId]);
      if (existingRule.rowCount) {
        const existingDaysAhead = existingRule.rows[0].frequency === 'DAILY' ? 1 : (existingRule.rows[0].frequency === 'WEEKLY' ? 7 : 32);
        await generateRule(client, req.user.id, existingRule.rows[0], addDays(todayInTimeZone(timeZone), existingDaysAhead));
        const task = await client.query(`SELECT id FROM todos WHERE user_id = $1 AND recurrence_rule_id = $2 AND deleted_at IS NULL ORDER BY occurrence_date LIMIT 1`, [req.user.id, existingRule.rows[0].id]);
        return task.rowCount ? taskRow(client, task.rows[0].id, req.user.id) : null;
      }
    }
    const projectId = await assertOwned(client, 'todo_projects', req.body.projectId || null, req.user.id, '项目不存在');
    const compoundItemId = await assertOwned(client, 'life_os_items', req.body.compoundItemId || null, req.user.id, '复利方向不存在');
    const sourceDiaryId = await assertOwned(client, 'diaries', req.body.sourceDiaryId || null, req.user.id, '来源日记不存在');
    const sourceCompoundThreadId = await assertOwned(client, 'compound_threads', req.body.sourceCompoundThreadId || null, req.user.id, '复利推进不存在');
    const recurrence = req.body.recurrence ? normalizeRecurrence(req.body.recurrence, scheduledDate || todayInTimeZone(timeZone), timeZone) : null;
    if (req.body.recurrence && !recurrence) return { inputError: '重复设置不完整' };
    if (recurrence) {
      const ruleId = crypto.randomUUID();
      const insertedRule = await client.query(
        `INSERT INTO todo_recurrence_rules
          (id, user_id, title, description, project_id, compound_item_id, frequency,
           starts_on, ends_on, week_days, month_day, time_zone, client_request_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13) RETURNING *`,
        [ruleId, req.user.id, title, description, projectId, compoundItemId, recurrence.frequency,
          recurrence.startsOn, recurrence.endsOn, JSON.stringify(recurrence.weekDays), recurrence.monthDay,
          recurrence.timeZone, requestId]
      );
      const daysAhead = recurrence.frequency === 'DAILY' ? 1 : (recurrence.frequency === 'WEEKLY' ? 7 : 32);
      const through = [addDays(todayInTimeZone(recurrence.timeZone), daysAhead), recurrence.startsOn].sort().pop();
      await generateRule(client, req.user.id, insertedRule.rows[0], through);
      const first = await client.query(
        `SELECT id FROM todos WHERE user_id = $1 AND recurrence_rule_id = $2 AND deleted_at IS NULL
          ORDER BY occurrence_date LIMIT 1`,
        [req.user.id, ruleId]
      );
      return first.rowCount ? taskRow(client, first.rows[0].id, req.user.id) : null;
    }
    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO todos
        (id, user_id, content, description, project_id, scheduled_date, deadline, tags,
         status, compound_item_id, source_type, source_ref_id, source_diary_id,
         source_compound_thread_id, client_request_id, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,'pending',$8,$9,$10,$11,$12,$13,
         COALESCE((SELECT max(position) + 1 FROM todos WHERE user_id = $2 AND project_id IS NOT DISTINCT FROM $5), 1))`,
      [id, req.user.id, title, description, projectId, scheduledDate, deadline, compoundItemId,
        sourceType, clientRequestId(req.body.sourceRefId), sourceDiaryId, sourceCompoundThreadId, requestId]
    );
    await insertEvent(client, {
      userId: req.user.id, todoId: id, eventType: 'CREATED', eventDate: scheduledDate,
      sourceDiaryId, sourceCompoundThreadId,
      payload: { sourceType, title }, idempotencyKey: requestId ? `create:${requestId}` : null
    });
    if (sourceDiaryId) {
      await insertEvent(client, {
        userId: req.user.id, todoId: id, eventType: 'DIARY_LINKED', sourceDiaryId,
        payload: { relation: 'SOURCE' }, idempotencyKey: `todo:${id}:diary:${sourceDiaryId}`
      });
    }
    return taskRow(client, id, req.user.id);
  });
  if (result?.inputError) return fail(res, 400, result.inputError);
  if (!result) return fail(res, 400, '重复任务在所选日期范围内没有实例');
  return ok(res, mapTask(result, todayInTimeZone(timeZone)), '待办已创建');
}));

router.put('/update', asyncRoute(async (req, res) => {
  const title = text(req.body.title || req.body.content, 500);
  if (!title) return fail(res, 400, '待办标题不能为空');
  const scheduledDate = req.body.scheduledDate ? dateOnly(req.body.scheduledDate) : null;
  const deadline = req.body.deadline ? dateOnly(req.body.deadline) : null;
  if (req.body.scheduledDate && !scheduledDate) return fail(res, 400, '安排日期格式不正确');
  if (req.body.deadline && !deadline) return fail(res, 400, '截止日期格式不正确');
  const updated = await db.transaction(async client => {
    const current = await taskRow(client, req.query.id, req.user.id, true);
    if (!current) return { missing: true };
    if (req.body.version && Number(req.body.version) !== current.version) return { conflict: true, row: current };
    const projectId = await assertOwned(client, 'todo_projects', req.body.projectId || null, req.user.id, '项目不存在');
    const compoundItemId = await assertOwned(client, 'life_os_items', req.body.compoundItemId || null, req.user.id, '复利方向不存在');
    await client.query(
      `UPDATE todos SET content=$3, description=$4, project_id=$5, scheduled_date=$6,
        deadline=$7, compound_item_id=$8, version=version+1, updated_at=now()
       WHERE id=$1 AND user_id=$2`,
      [req.query.id, req.user.id, title, text(req.body.description, 5000), projectId,
        scheduledDate, deadline, compoundItemId]
    );
    await insertEvent(client, { userId: req.user.id, todoId: req.query.id, eventType: 'UPDATED', payload: { title, scheduledDate, deadline } });
    return { row: await taskRow(client, req.query.id, req.user.id) };
  });
  if (updated.missing) return fail(res, 404, '待办不存在');
  if (updated.conflict) return fail(res, 409, '这条待办已在其他页面更新，请刷新后再修改', mapTask(updated.row));
  return ok(res, mapTask(updated.row), '待办已更新');
}));

router.patch('/status', asyncRoute(async (req, res) => {
  const action = String(req.body.action || '').toUpperCase();
  const allowed = new Set(['START', 'COMPLETE', 'RESTORE', 'CANCEL', 'REOPEN', 'SKIP']);
  if (!allowed.has(action)) return fail(res, 400, '状态操作不支持');
  const timeZone = normalizeTimeZone(req.body.timeZone);
  const today = todayInTimeZone(timeZone);
  const operationId = clientRequestId(req.body.operationId);
  const result = await db.transaction(async client => {
    const current = await taskRow(client, req.body.id || req.query.id, req.user.id, true);
    if (!current) return { missing: true };
    if ((action === 'COMPLETE' && current.status === 'completed')
      || (action === 'START' && current.status === 'in_progress')
      || ((action === 'CANCEL' || action === 'SKIP') && current.status === 'cancelled')
      || (action === 'RESTORE' && current.status === 'pending')
      || (action === 'REOPEN' && current.status === 'pending')) {
      return { row: current, unchanged: true };
    }
    if (req.body.version && Number(req.body.version) !== current.version) return { conflict: true, row: current };
    const mediaIds = await ownedMediaIds(client, req.body.resultMediaIds, req.user.id);
    const id = current.id;
    let eventType = '';
    let nextStatus = current.status;
    let visibleInDiary = false;
    let resultText = current.result_text || '';
    if (action === 'START') {
      if (current.status === 'completed') return { invalid: '已完成待办请先恢复' };
      nextStatus = 'in_progress'; eventType = 'STARTED';
    } else if (action === 'COMPLETE') {
      if (current.status === 'cancelled') return { invalid: '已取消待办请先恢复' };
      nextStatus = 'completed'; eventType = 'COMPLETED'; visibleInDiary = true;
      resultText = text(req.body.result, 5000);
    } else if (action === 'RESTORE') {
      if (current.status !== 'completed') return { invalid: '这条待办还没有完成' };
      nextStatus = 'pending'; eventType = 'RESTORED'; resultText = '';
      await client.query(`UPDATE todo_events SET valid=false, invalidated_at=now()
        WHERE todo_id=$1 AND user_id=$2 AND event_type='COMPLETED' AND valid`, [id, req.user.id]);
    } else if (action === 'CANCEL' || action === 'SKIP') {
      if (current.status === 'completed') return { invalid: '已完成待办不能直接取消' };
      if (action === 'SKIP' && !current.recurrence_rule_id) return { invalid: '只有重复任务实例可以跳过' };
      nextStatus = 'cancelled'; eventType = action === 'SKIP' ? 'SKIPPED' : 'CANCELLED';
    } else if (action === 'REOPEN') {
      if (current.status !== 'cancelled') return { invalid: '这条待办没有取消' };
      nextStatus = 'pending'; eventType = 'RESTORED';
    }
    await client.query(
      `UPDATE todos SET status=$3,
        started_at=CASE WHEN $4='START' THEN COALESCE(started_at,now()) ELSE started_at END,
        completed_at=CASE WHEN $4='COMPLETE' THEN now() WHEN $4='RESTORE' THEN NULL ELSE completed_at END,
        cancelled_at=CASE WHEN $4 IN ('CANCEL','SKIP') THEN now() WHEN $4='REOPEN' THEN NULL ELSE cancelled_at END,
        result_text=CASE WHEN $4 IN ('COMPLETE','RESTORE') THEN $5 ELSE result_text END,
        result_media_ids=CASE WHEN $4='COMPLETE' THEN $6::jsonb WHEN $4='RESTORE' THEN '[]'::jsonb ELSE result_media_ids END,
        version=version+1, updated_at=now() WHERE id=$1 AND user_id=$2`,
      [id, req.user.id, nextStatus, action, resultText, JSON.stringify(mediaIds)]
    );
    await insertEvent(client, {
      userId: req.user.id, todoId: id, eventType,
      eventDate: ['COMPLETED', 'SKIPPED'].includes(eventType) ? today : null,
      visibleInDiary,
      payload: { result: resultText, resultMediaIds: mediaIds, occurrenceDate: current.occurrence_date || null },
      idempotencyKey: operationId ? `todo:${id}:${action}:${operationId}` : null
    });
    return { row: await taskRow(client, id, req.user.id) };
  });
  if (result.missing) return fail(res, 404, '待办不存在');
  if (result.conflict) return fail(res, 409, '这条待办已在其他页面更新，请刷新后再操作', mapTask(result.row, today));
  if (result.invalid) return fail(res, 400, result.invalid);
  return ok(res, mapTask(result.row, today), result.unchanged ? '状态没有变化' : '待办状态已更新');
}));

router.post('/complete', asyncRoute(async (req, res) => {
  req.body = { ...req.body, id: req.query.id || req.body.id, action: 'COMPLETE' };
  const timeZone = normalizeTimeZone(req.body.timeZone);
  const today = todayInTimeZone(timeZone);
  const result = await db.transaction(async client => {
    const current = await taskRow(client, req.body.id, req.user.id, true);
    if (!current) return null;
    if (current.status === 'completed') return current;
    await client.query(`UPDATE todos SET status='completed', completed_at=now(), version=version+1, updated_at=now() WHERE id=$1 AND user_id=$2`, [current.id, req.user.id]);
    await insertEvent(client, { userId: req.user.id, todoId: current.id, eventType: 'COMPLETED', eventDate: today, visibleInDiary: true, payload: { result: '' } });
    return taskRow(client, current.id, req.user.id);
  });
  if (!result) return fail(res, 404, '待办不存在');
  return ok(res, mapTask(result, today), '待办已完成');
}));

router.delete('/delete', asyncRoute(async (req, res) => {
  const result = await db.query(
    `UPDATE todos SET deleted_at=now(), version=version+1, updated_at=now()
      WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id`,
    [req.query.id, req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '待办不存在');
  return ok(res, null, '待办已删除');
}));

router.post('/bulk', asyncRoute(async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : [])
    .map(String).filter(item => /^[0-9a-f-]{36}$/i.test(item)))].slice(0, 100);
  if (!ids.length) return fail(res, 400, '请选择待办');
  const action = String(req.body.action || '').toUpperCase();
  const result = await db.transaction(async client => {
    if (action === 'MOVE_PROJECT') {
      const projectId = await assertOwned(client, 'todo_projects', req.body.projectId || null, req.user.id, '项目不存在');
      return client.query(`UPDATE todos SET project_id=$3, version=version+1, updated_at=now()
        WHERE user_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL RETURNING id`, [req.user.id, ids, projectId]);
    }
    if (action === 'SCHEDULE') {
      const date = req.body.scheduledDate ? dateOnly(req.body.scheduledDate) : null;
      if (req.body.scheduledDate && !date) return { inputError: true };
      return client.query(`UPDATE todos SET scheduled_date=$3, version=version+1, updated_at=now()
        WHERE user_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL RETURNING id`, [req.user.id, ids, date]);
    }
    if (action === 'CANCEL') {
      return client.query(`UPDATE todos SET status='cancelled', cancelled_at=now(), version=version+1, updated_at=now()
        WHERE user_id=$1 AND id=ANY($2::uuid[]) AND status IN ('pending','in_progress') AND deleted_at IS NULL RETURNING id`, [req.user.id, ids]);
    }
    return { inputError: true };
  });
  if (result.inputError) return fail(res, 400, '批量操作不支持或参数不正确');
  return ok(res, { updated: result.rowCount }, '批量操作已完成');
}));

router.get('/projects', asyncRoute(async (req, res) => {
  return ok(res, { list: (await projectRows(req.user.id, req.query.archived === '1')).map(mapProject) });
}));

router.post('/projects', asyncRoute(async (req, res) => {
  const name = text(req.body.name, 160);
  if (!name) return fail(res, 400, '项目名称不能为空');
  const result = await db.query(
    `INSERT INTO todo_projects (id,user_id,name,goal,position)
     VALUES ($1,$2,$3,$4,COALESCE((SELECT max(position)+1 FROM todo_projects WHERE user_id=$2),1)) RETURNING *`,
    [crypto.randomUUID(), req.user.id, name, text(req.body.goal, 2000)]
  );
  return ok(res, mapProject(result.rows[0]), '项目已创建');
}));

router.get('/projects/:id', asyncRoute(async (req, res) => {
  const projects = await db.query('SELECT * FROM todo_projects WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!projects.rowCount) return fail(res, 404, '项目不存在');
  const today = todayInTimeZone(normalizeTimeZone(req.query.timeZone));
  const rows = await listTaskRows(req.user.id, { projectId: req.params.id, includeCancelled: true });
  const tasks = rows.map(row => mapTask(row, today));
  return ok(res, {
    project: mapProject(projects.rows[0]),
    groups: [
      { key: 'in_progress', label: '进行中', items: tasks.filter(item => item.status === 'in_progress') },
      { key: 'pending', label: '待做', items: tasks.filter(item => item.status === 'pending') },
      { key: 'completed', label: '已完成', items: tasks.filter(item => item.status === 'completed'), collapsible: true },
      { key: 'cancelled', label: '已取消', items: tasks.filter(item => item.status === 'cancelled'), collapsible: true }
    ].filter(group => group.items.length)
  });
}));

router.put('/projects/:id', asyncRoute(async (req, res) => {
  const name = text(req.body.name, 160);
  if (!name) return fail(res, 400, '项目名称不能为空');
  const result = await db.query(
    `UPDATE todo_projects SET name=$3, goal=$4, version=version+1, updated_at=now()
     WHERE id=$1 AND user_id=$2 AND ($5::int IS NULL OR version=$5) RETURNING *`,
    [req.params.id, req.user.id, name, text(req.body.goal, 2000), req.body.version ? Number(req.body.version) : null]
  );
  if (!result.rowCount) return fail(res, 409, '项目已更新，请刷新后重试');
  return ok(res, mapProject(result.rows[0]), '项目已更新');
}));

router.post('/projects/:id/complete', asyncRoute(async (req, res) => {
  const open = await db.query(`SELECT count(*)::int AS count FROM todos
    WHERE user_id=$1 AND project_id=$2 AND status IN ('pending','in_progress') AND deleted_at IS NULL`, [req.user.id, req.params.id]);
  if (open.rows[0].count) return fail(res, 409, `项目还有 ${open.rows[0].count} 条未完成待办，请先处理`);
  const result = await db.query(`UPDATE todo_projects SET status='COMPLETED', completed_at=now(), version=version+1, updated_at=now()
    WHERE id=$1 AND user_id=$2 RETURNING *`, [req.params.id, req.user.id]);
  if (!result.rowCount) return fail(res, 404, '项目不存在');
  return ok(res, mapProject(result.rows[0]), '项目已完成');
}));

router.post('/projects/:id/archive', asyncRoute(async (req, res) => {
  const strategy = String(req.body.strategy || '').toUpperCase();
  const result = await db.transaction(async client => {
    const project = await client.query('SELECT * FROM todo_projects WHERE id=$1 AND user_id=$2 FOR UPDATE', [req.params.id, req.user.id]);
    if (!project.rowCount) return { missing: true };
    const open = await client.query(`SELECT id FROM todos WHERE user_id=$1 AND project_id=$2
      AND status IN ('pending','in_progress') AND deleted_at IS NULL FOR UPDATE`, [req.user.id, req.params.id]);
    if (open.rowCount && !['KEEP', 'MOVE', 'CANCEL'].includes(strategy)) return { choiceRequired: open.rowCount };
    if (open.rowCount && strategy === 'KEEP') {
      await client.query(`UPDATE todos SET project_id=NULL, version=version+1, updated_at=now()
        WHERE user_id=$1 AND project_id=$2 AND status IN ('pending','in_progress') AND deleted_at IS NULL`, [req.user.id, req.params.id]);
    } else if (open.rowCount && strategy === 'MOVE') {
      const targetId = await assertOwned(client, 'todo_projects', req.body.targetProjectId, req.user.id, '目标项目不存在');
      if (targetId === req.params.id) return { inputError: '请选择另一个项目' };
      await client.query(`UPDATE todos SET project_id=$3, version=version+1, updated_at=now()
        WHERE user_id=$1 AND project_id=$2 AND status IN ('pending','in_progress') AND deleted_at IS NULL`, [req.user.id, req.params.id, targetId]);
    } else if (open.rowCount && strategy === 'CANCEL') {
      await client.query(`UPDATE todos SET status='cancelled', cancelled_at=now(), version=version+1, updated_at=now()
        WHERE user_id=$1 AND project_id=$2 AND status IN ('pending','in_progress') AND deleted_at IS NULL`, [req.user.id, req.params.id]);
    }
    const archived = await client.query(`UPDATE todo_projects SET status='ARCHIVED', archived_at=now(), version=version+1, updated_at=now()
      WHERE id=$1 AND user_id=$2 RETURNING *`, [req.params.id, req.user.id]);
    return { row: archived.rows[0] };
  });
  if (result.missing) return fail(res, 404, '项目不存在');
  if (result.choiceRequired) return fail(res, 409, '归档前请选择如何处理未完成待办', { openCount: result.choiceRequired });
  if (result.inputError) return fail(res, 400, result.inputError);
  return ok(res, mapProject(result.row), '项目已归档');
}));

router.put('/recurrences/:id', asyncRoute(async (req, res) => {
  const title = text(req.body.title || req.body.content, 500);
  if (!title) return fail(res, 400, '待办标题不能为空');
  const timeZone = normalizeTimeZone(req.body.timeZone);
  const effectiveOn = dateOnly(req.body.effectiveOn);
  if (!effectiveOn) return fail(res, 400, '请指定“本次及以后”的起始日期');
  const requested = normalizeRecurrence(req.body.recurrence, effectiveOn, timeZone);
  if (!requested) return fail(res, 400, '重复设置不完整');
  const recurrence = { ...requested, startsOn: requested.startsOn < effectiveOn ? effectiveOn : requested.startsOn };
  if (recurrence.endsOn && recurrence.endsOn < recurrence.startsOn) return fail(res, 400, '结束日期不能早于新的开始日期');
  const operationId = clientRequestId(req.body.operationId);
  const result = await db.transaction(async client => {
    const ruleResult = await client.query(
      'SELECT * FROM todo_recurrence_rules WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [req.params.id, req.user.id]
    );
    if (!ruleResult.rowCount) return { missing: true };
    const currentRule = ruleResult.rows[0];
    if (operationId) {
      const alreadyApplied = await client.query(
        `SELECT id FROM todo_events WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1`,
        [req.user.id, `recurrence:${req.params.id}:update:${operationId}`]
      );
      if (alreadyApplied.rowCount) return { row: currentRule, unchanged: true };
    }
    if (req.body.version && Number(req.body.version) !== currentRule.version) return { conflict: true, row: currentRule };
    const projectId = await assertOwned(client, 'todo_projects', req.body.projectId || null, req.user.id, '项目不存在');
    const compoundItemId = await assertOwned(client, 'life_os_items', req.body.compoundItemId || null, req.user.id, '复利方向不存在');
    const currentTaskId = req.body.currentTaskId ? String(req.body.currentTaskId) : null;
    let currentTask = null;
    if (currentTaskId) {
      const taskResult = await client.query(
        `SELECT * FROM todos WHERE id=$1 AND user_id=$2 AND recurrence_rule_id=$3
          AND status IN ('pending','in_progress') AND deleted_at IS NULL FOR UPDATE`,
        [currentTaskId, req.user.id, req.params.id]
      );
      currentTask = taskResult.rows[0] || null;
      if (!currentTask) return { inputError: '当前重复实例不可修改，请刷新后重试' };
    }
    const completedConflict = await client.query(
      `SELECT id FROM todos WHERE user_id=$1 AND recurrence_rule_id=$2 AND occurrence_date=$3
        AND status='completed' AND deleted_at IS NULL AND ($4::uuid IS NULL OR id<>$4) LIMIT 1`,
      [req.user.id, req.params.id, recurrence.startsOn, currentTaskId]
    );
    if (completedConflict.rowCount) return { inputError: '新开始日期已有完成记录，请选择其他日期' };

    const future = await client.query(
      `SELECT id FROM todos WHERE user_id=$1 AND recurrence_rule_id=$2 AND occurrence_date >= $3
        AND status IN ('pending','in_progress') AND deleted_at IS NULL
        AND ($4::uuid IS NULL OR id<>$4) FOR UPDATE`,
      [req.user.id, req.params.id, effectiveOn, currentTaskId]
    );
    for (const task of future.rows) {
      await insertEvent(client, {
        userId: req.user.id, todoId: task.id, eventType: 'RESCHEDULED',
        payload: { scope: 'THIS_AND_FUTURE', replacedByRule: req.params.id }
      });
    }
    await client.query(
      `UPDATE todos SET deleted_at=now(), version=version+1, updated_at=now()
        WHERE user_id=$1 AND recurrence_rule_id=$2 AND occurrence_date >= $3
          AND status IN ('pending','in_progress') AND deleted_at IS NULL
          AND ($4::uuid IS NULL OR id<>$4)`,
      [req.user.id, req.params.id, effectiveOn, currentTaskId]
    );
    const updatedRule = await client.query(
      `UPDATE todo_recurrence_rules SET title=$3, description=$4, project_id=$5,
        compound_item_id=$6, frequency=$7, starts_on=$8, ends_on=$9, week_days=$10::jsonb,
        month_day=$11, time_zone=$12, status='ACTIVE', last_generated_through=$13,
        version=version+1, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, req.user.id, title, text(req.body.description, 5000), projectId,
        compoundItemId, recurrence.frequency, recurrence.startsOn, recurrence.endsOn,
        JSON.stringify(recurrence.weekDays), recurrence.monthDay, recurrence.timeZone,
        addDays(recurrence.startsOn, -1)]
    );
    if (currentTask) {
      await client.query(
        `UPDATE todos SET content=$3, description=$4, project_id=$5, scheduled_date=$6,
          occurrence_date=$6, compound_item_id=$7, version=version+1, updated_at=now()
          WHERE id=$1 AND user_id=$2`,
        [currentTask.id, req.user.id, title, text(req.body.description, 5000), projectId,
          recurrence.startsOn, compoundItemId]
      );
      await insertEvent(client, {
        userId: req.user.id, todoId: currentTask.id, eventType: 'RESCHEDULED',
        eventDate: recurrence.startsOn,
        payload: { scope: 'THIS_AND_FUTURE', startsOn: recurrence.startsOn },
        idempotencyKey: operationId ? `recurrence:${req.params.id}:update:${operationId}` : null
      });
    }
    const daysAhead = recurrence.frequency === 'DAILY' ? 1 : (recurrence.frequency === 'WEEKLY' ? 7 : 32);
    await generateRule(client, req.user.id, updatedRule.rows[0], addDays(todayInTimeZone(recurrence.timeZone), daysAhead));
    return { row: updatedRule.rows[0] };
  });
  if (result.missing) return fail(res, 404, '重复规则不存在');
  if (result.conflict) return fail(res, 409, '重复安排已在其他页面更新，请刷新后重试', recurrenceFromRow(result.row));
  if (result.inputError) return fail(res, 400, result.inputError);
  return ok(res, recurrenceFromRow(result.row), result.unchanged ? '重复安排没有变化' : '本次及以后的安排已更新');
}));

router.post('/recurrences/:id/stop', asyncRoute(async (req, res) => {
  const today = todayInTimeZone(normalizeTimeZone(req.body.timeZone));
  const result = await db.transaction(async client => {
    const stopped = await client.query(`UPDATE todo_recurrence_rules SET status='STOPPED', version=version+1, updated_at=now()
      WHERE id=$1 AND user_id=$2 RETURNING id`, [req.params.id, req.user.id]);
    if (!stopped.rowCount) return null;
    await client.query(`UPDATE todos SET status='cancelled', cancelled_at=now(), version=version+1, updated_at=now()
      WHERE user_id=$1 AND recurrence_rule_id=$2 AND occurrence_date>$3 AND status='pending' AND deleted_at IS NULL`, [req.user.id, req.params.id, today]);
    return stopped.rows[0];
  });
  if (!result) return fail(res, 404, '重复规则不存在');
  return ok(res, result, '已停止未来重复，历史记录保留');
}));

router.post('/reorder', asyncRoute(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(String)
    .filter(item => /^[0-9a-f-]{36}$/i.test(item)).slice(0, 200);
  if (!ids.length) return fail(res, 400, '排序内容不能为空');
  await db.transaction(async client => {
    for (let index = 0; index < ids.length; index += 1) {
      await client.query(`UPDATE todos SET position=$3, version=version+1, updated_at=now()
        WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`, [ids[index], req.user.id, index + 1]);
    }
  });
  return ok(res, { ids }, '顺序已更新');
}));

router.get('/actions', asyncRoute(async (req, res) => {
  const date = dateOnly(req.query.date) || todayInTimeZone(normalizeTimeZone(req.query.timeZone));
  const result = await db.query(
    `SELECT e.id, e.todo_id, e.event_date, e.payload, e.created_at, t.content, t.result_text,
      p.name AS project_name FROM todo_events e
      JOIN todos t ON t.id=e.todo_id AND t.user_id=e.user_id
      LEFT JOIN todo_projects p ON p.id=t.project_id
     WHERE e.user_id=$1 AND e.event_type='COMPLETED' AND e.visible_in_diary AND e.valid
       AND e.event_date=$2 ORDER BY e.created_at DESC`,
    [req.user.id, date]
  );
  return ok(res, { date, list: result.rows.map(row => ({
    id: row.id, taskId: row.todo_id, title: row.content, result: row.result_text || row.payload?.result || '',
    projectName: row.project_name || '', completedAt: row.created_at
  })) });
}));

router.get('/export', asyncRoute(async (req, res) => {
  const [projects, rules, tasks, events] = await Promise.all([
    projectRows(req.user.id, true),
    db.query('SELECT * FROM todo_recurrence_rules WHERE user_id=$1 ORDER BY created_at', [req.user.id]),
    listTaskRows(req.user.id, { includeCancelled: true }),
    db.query(`SELECT id,todo_id,event_type,payload,event_date,source_diary_id,source_compound_thread_id,
      visible_in_diary,valid,created_at FROM todo_events WHERE user_id=$1 ORDER BY created_at`, [req.user.id])
  ]);
  const payload = {
    format: 'shroom-tasks-v2', exportedAt: new Date().toISOString(),
    projects: projects.map(mapProject), recurrenceRules: rules.rows.map(recurrenceFromRow),
    tasks: tasks.map(row => mapTask(row)), events: events.rows
  };
  if (String(req.query.format).toLowerCase() !== 'markdown') return ok(res, payload);
  const lines = ['# Shroom 待办与项目', '', `导出时间：${payload.exportedAt}`, ''];
  for (const project of payload.projects) {
    lines.push(`## ${project.name}`, project.goal || '未填写项目目标', '');
    payload.tasks.filter(task => task.projectId === project.id).forEach(task => {
      lines.push(`- [${task.status === 'completed' ? 'x' : ' '}] ${task.title}${task.result ? ` — 结果：${task.result}` : ''}`);
    });
    lines.push('');
  }
  const inbox = payload.tasks.filter(task => !task.projectId);
  if (inbox.length) {
    lines.push('## 未归属项目', '');
    inbox.forEach(task => lines.push(`- [${task.status === 'completed' ? 'x' : ' '}] ${task.title}`));
  }
  return ok(res, { ...payload, markdown: lines.join('\n') });
}));

module.exports = router;
