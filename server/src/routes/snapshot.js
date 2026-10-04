'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const config = require('../config');
const { createMediaSignature } = require('../security');
const { asyncRoute, fail, ok, requireUser, text } = require('../http');

const router = express.Router();
router.use(requireUser);

function uuid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function requestedDay(value) {
  const day = value === undefined || value === null || value === '' ? today() : String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? null : day;
}

function clockTime(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return undefined;
  return value;
}

function moneyAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(99999999.99, Math.max(0, Math.round(number * 100) / 100));
}

const MOODS = new Set([
  'super','happy','moved','heart','calm','cozy','speechless','lost','bored',
  'tired','irritated','unhappy','scared','shock','surprise','terrible','unwell',
  'angry','worried','wronged'
]);
const MEAL_TYPES = new Set(['BREAKFAST','LUNCH','DINNER','AFTERNOON_TEA','SUPPER','BRUNCH']);
const FINANCE_TYPES = new Set(['EXPENSE', 'INCOME']);

function signedMediaUrl(mediaId) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const signature = createMediaSignature(mediaId, expires);
  return `${config.publicOrigin}/api/media/v1/${mediaId}?expires=${expires}&signature=${signature}`;
}

function stringList(value, limit, itemLimit) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => text(item, itemLimit)).filter(Boolean))].slice(0, limit);
}

async function ownedMediaIds(value, userId) {
  const ids = stringList(value, 18, 40).filter(id => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return [];
  const result = await db.query(
    'SELECT id::text AS id FROM media_assets WHERE user_id = $1 AND id = ANY($2::uuid[])',
    [userId, ids]
  );
  if (result.rowCount !== ids.length) {
    throw Object.assign(new Error('图片不属于当前用户'), { status: 403 });
  }
  return ids;
}

function mapMeal(row) {
  const mediaIds = Array.isArray(row.media_ids) ? row.media_ids : [];
  return {
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : [],
    media_ids: mediaIds,
    media: mediaIds.map(id => ({ id, url: signedMediaUrl(id) })),
  };
}

async function ensureSnapshot(client, userId, day) {
  const result = await client.query(
    `INSERT INTO snapshots (id, user_id, day) VALUES ($1, $2, $3::date)
     ON CONFLICT (user_id, day) DO UPDATE SET updated_at = now() RETURNING id`,
    [uuid(), userId, day]
  );
  return result.rows[0].id;
}

async function refreshFinanceSummary(client, userId, day) {
  const totals = await client.query(
    `SELECT coalesce(sum(amount) FILTER (WHERE entry_type = 'EXPENSE'), 0)::numeric(10,2) AS expense,
            coalesce(sum(amount) FILTER (WHERE entry_type = 'INCOME'), 0)::numeric(10,2) AS income
       FROM snapshot_finance_entries WHERE user_id = $1 AND day = $2::date`,
    [userId, day]
  );
  await ensureSnapshot(client, userId, day);
  await client.query(
    `UPDATE snapshots SET expense_amount = $3, income_amount = $4, updated_at = now()
      WHERE user_id = $1 AND day = $2::date`,
    [userId, day, totals.rows[0].expense, totals.rows[0].income]
  );
  return {
    expense: Number(totals.rows[0].expense) || 0,
    income: Number(totals.rows[0].income) || 0,
  };
}

function previousDay(day, offset = 1) {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

function consecutiveMeditationDays(days, day) {
  if (!days.length || (days[0] !== day && days[0] !== previousDay(day))) return 0;
  let expected = days[0];
  let streak = 0;
  for (const value of days) {
    if (value !== expected) break;
    streak += 1;
    expected = previousDay(expected);
  }
  return streak;
}

async function meditationSummary(userId, day) {
  const [totals, days] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS count,
              coalesce(sum(duration_min), 0)::int AS minutes,
              count(*) FILTER (WHERE day = $2::date)::int AS today_count,
              coalesce(sum(duration_min) FILTER (WHERE day = $2::date), 0)::int AS today_minutes
         FROM snapshot_meditations
        WHERE user_id = $1`,
      [userId, day]
    ),
    db.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day
         FROM snapshot_meditations
        WHERE user_id = $1 AND day <= $2::date
        GROUP BY day
        ORDER BY day DESC
        LIMIT 366`,
      [userId, day]
    )
  ]);
  const row = totals.rows[0] || {};
  return {
    streak: consecutiveMeditationDays(days.rows.map(item => item.day), day),
    totalCount: Number(row.count) || 0,
    totalMinutes: Number(row.minutes) || 0,
    todayCount: Number(row.today_count) || 0,
    todayMinutes: Number(row.today_minutes) || 0,
  };
}

// GET /api/snapshot/v1/today?date=2026-09-22
router.get('/today', asyncRoute(async (req, res) => {
  const day = requestedDay(req.query.date);
  if (!day) return fail(res, 400, '日期格式不正确');
  const rows = await db.query(
    `SELECT * FROM snapshots WHERE user_id = $1 AND day = $2::date`,
    [req.user.id, day]
  );
  const snapshot = rows.rows[0] || null;
  let meals = [];
  let meditations = [];
  let financeEntries = [];
  if (snapshot) {
    const m = await db.query(
      `SELECT * FROM snapshot_meals WHERE snapshot_id = $1 ORDER BY created_at`,
      [snapshot.id]
    );
    meals = m.rows.map(mapMeal);
  }
  const med = await db.query(
    `SELECT * FROM snapshot_meditations WHERE user_id = $1 AND day = $2::date ORDER BY completed_at`,
    [req.user.id, day]
  );
  meditations = med.rows;
  const finance = await db.query(
    `SELECT * FROM snapshot_finance_entries
      WHERE user_id = $1 AND day = $2::date
      ORDER BY coalesce(occurred_at, created_at::time) DESC, created_at DESC`,
    [req.user.id, day]
  );
  financeEntries = finance.rows;
  return ok(res, { snapshot, meals, meditations, financeEntries, date: day });
}));

// PUT /api/snapshot/v1/today  —  upsert 任意字段
router.put('/today', asyncRoute(async (req, res) => {
  const day = requestedDay(req.query.date);
  if (!day) return fail(res, 400, '日期格式不正确');
  const body = req.body || {};
  const allowed = {
    mood: v => typeof v === 'string' && (v === '' || MOODS.has(v)) ? v : undefined,
    weather_code: v => typeof v === 'string' ? v.slice(0, 24) : undefined,
    weather_temp: v => {
      if (v === null || v === undefined || v === '') return null;
      const number = Number(v);
      return Number.isFinite(number) && number >= -100 && number <= 100 ? Math.round(number) : undefined;
    },
    steps: v => Math.max(0, Math.min(1000000, parseInt(v, 10) || 0)),
    bedtime: clockTime,
    wake_time: clockTime,
    scene: v => typeof v === 'string' ? v.slice(0, 48) : undefined,
    expense_amount: moneyAmount,
    expense_category: v => typeof v === 'string' ? v.slice(0, 24) : undefined,
    income_amount: moneyAmount,
    income_category: v => typeof v === 'string' ? v.slice(0, 24) : undefined,
    morning_intent: v => text(v, 1000) || '',
    evening_reflection: v => text(v, 2000) || '',
    challenge_completed: v => !!v,
    challenge_skipped: v => !!v,
    challenge_title: v => text(v, 500) || '',
    challenge_todo_id: v => v === null || v === '' ? null : (/^[0-9a-f-]{36}$/i.test(String(v)) ? String(v) : undefined),
    daily_question: v => text(v, 500) || '',
    daily_answer: v => text(v, 3000) || '',
    question_saved: v => !!v,
  };
  const fieldNames = [];
  const fieldValues = [];
  for (const [k, fn] of Object.entries(allowed)) {
    if (k in body) {
      const v = fn(body[k]);
      if (v !== undefined) {
        fieldNames.push(k);
        fieldValues.push(v);
      }
    }
  }
  const todoIndex = fieldNames.indexOf('challenge_todo_id');
  if (todoIndex >= 0 && fieldValues[todoIndex]) {
    const ownedTodo = await db.query(
      'SELECT id FROM todos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [fieldValues[todoIndex], req.user.id]
    );
    if (!ownedTodo.rowCount) return fail(res, 400, '今日计划不存在');
  }
  if (!fieldNames.length) return fail(res, 400, '没有可更新的字段');
  const insertColumns = fieldNames.length ? `, ${fieldNames.join(', ')}` : '';
  const insertValues = fieldValues.map((value, index) => `$${index + 4}`).join(', ');
  const updateFields = fieldNames.map(name => `${name} = EXCLUDED.${name}`).join(', ');
  const r = await db.query(
    `INSERT INTO snapshots (id, user_id, day${insertColumns})
     VALUES ($1, $2, $3::date${insertValues ? `, ${insertValues}` : ''})
     ON CONFLICT (user_id, day) DO UPDATE SET ${updateFields}, updated_at = now()
     RETURNING *`,
    [uuid(), req.user.id, day, ...fieldValues]
  );
  return ok(res, { snapshot: r.rows[0] });
}));

// POST /api/snapshot/v1/meals  —  加一餐
router.post('/meals', asyncRoute(async (req, res) => {
  const day = requestedDay(req.query.date);
  if (!day) return fail(res, 400, '日期格式不正确');
  const body = req.body || {};
  const mealType = MEAL_TYPES.has(body.meal_type) ? body.meal_type : 'BRUNCH';
  const name = text(body.name, 240) || '';
  if (!name) return fail(res, 400, '先写下这一餐吃了什么');
  const description = text(body.description, 2000) || '';
  const diningWay = text(body.dining_way, 32) || '';
  const tags = stringList(body.tags, 8, 24);
  const mediaIds = await ownedMediaIds(body.media_ids, req.user.id);
  // ensure snapshot exists
  const s = await db.query(
    `INSERT INTO snapshots (id, user_id, day) VALUES ($1, $2, $3::date)
     ON CONFLICT (user_id, day) DO UPDATE SET updated_at = now() RETURNING id`,
    [uuid(), req.user.id, day]
  );
  const meal = await db.query(
    `INSERT INTO snapshot_meals
      (id, snapshot_id, meal_type, name, description, meal_time, dining_way, tags, media_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb) RETURNING *`,
    [uuid(), s.rows[0].id, mealType, name, description, clockTime(body.meal_time || '') || null,
      diningWay, JSON.stringify(tags), JSON.stringify(mediaIds)]
  );
  return ok(res, { meal: mapMeal(meal.rows[0]) });
}));

// PUT /api/snapshot/v1/meals/:id
router.put('/meals/:id', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const mealType = MEAL_TYPES.has(body.meal_type) ? body.meal_type : 'BRUNCH';
  const name = text(body.name, 240) || '';
  if (!name) return fail(res, 400, '先写下这一餐吃了什么');
  const mediaIds = await ownedMediaIds(body.media_ids, req.user.id);
  const result = await db.query(
    `UPDATE snapshot_meals m
        SET meal_type = $3, name = $4, description = $5, meal_time = $6,
            dining_way = $7, tags = $8::jsonb, media_ids = $9::jsonb
       FROM snapshots s
      WHERE m.id = $1 AND m.snapshot_id = s.id AND s.user_id = $2
      RETURNING m.*`,
    [req.params.id, req.user.id, mealType, name, text(body.description, 2000) || '',
      clockTime(body.meal_time || '') || null, text(body.dining_way, 32) || '',
      JSON.stringify(stringList(body.tags, 8, 24)), JSON.stringify(mediaIds)]
  );
  if (!result.rowCount) return fail(res, 404, '这餐记录不存在');
  return ok(res, { meal: mapMeal(result.rows[0]) });
}));

// DELETE /api/snapshot/v1/meals/:id
router.delete('/meals/:id', asyncRoute(async (req, res) => {
  const result = await db.query(
    `DELETE FROM snapshot_meals WHERE id = $1 AND snapshot_id IN (SELECT id FROM snapshots WHERE user_id = $2)`,
    [req.params.id, req.user.id]
  );
  return ok(res, { deleted: result.rowCount > 0 });
}));

// GET /api/snapshot/v1/finance?date=2026-09-30
router.get('/finance', asyncRoute(async (req, res) => {
  const day = requestedDay(req.query.date);
  if (!day) return fail(res, 400, '日期格式不正确');
  const result = await db.query(
    `SELECT * FROM snapshot_finance_entries
      WHERE user_id = $1 AND day = $2::date
      ORDER BY coalesce(occurred_at, created_at::time) DESC, created_at DESC`,
    [req.user.id, day]
  );
  const totals = result.rows.reduce((value, entry) => {
    value[entry.entry_type === 'INCOME' ? 'income' : 'expense'] += Number(entry.amount) || 0;
    return value;
  }, { expense: 0, income: 0 });
  return ok(res, { date: day, entries: result.rows, ...totals, balance: totals.income - totals.expense });
}));

// POST /api/snapshot/v1/finance
router.post('/finance', asyncRoute(async (req, res) => {
  const day = requestedDay(req.query.date);
  if (!day) return fail(res, 400, '日期格式不正确');
  const body = req.body || {};
  const entryType = FINANCE_TYPES.has(body.entry_type) ? body.entry_type : null;
  const amount = moneyAmount(body.amount);
  if (!entryType) return fail(res, 400, '请选择收入或支出');
  if (!amount) return fail(res, 400, '金额必须大于 0');
  const occurredAt = body.occurred_at ? clockTime(body.occurred_at) : '';
  if (body.occurred_at && occurredAt === undefined) return fail(res, 400, '时间格式不正确');
  const result = await db.transaction(async client => {
    const inserted = await client.query(
      `INSERT INTO snapshot_finance_entries
        (id, user_id, day, entry_type, amount, category, note, occurred_at)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8) RETURNING *`,
      [uuid(), req.user.id, day, entryType, amount, text(body.category, 24) || '',
        text(body.note, 240) || '', occurredAt || null]
    );
    const totals = await refreshFinanceSummary(client, req.user.id, day);
    return { entry: inserted.rows[0], ...totals };
  });
  return ok(res, result, '账单已保存');
}));

// DELETE /api/snapshot/v1/finance/:id
router.delete('/finance/:id', asyncRoute(async (req, res) => {
  const result = await db.transaction(async client => {
    const removed = await client.query(
      `DELETE FROM snapshot_finance_entries
        WHERE id = $1 AND user_id = $2 RETURNING to_char(day, 'YYYY-MM-DD') AS day`,
      [req.params.id, req.user.id]
    );
    if (!removed.rowCount) return null;
    const day = removed.rows[0].day;
    return { day, ...(await refreshFinanceSummary(client, req.user.id, day)) };
  });
  if (!result) return fail(res, 404, '账单记录不存在');
  return ok(res, { deleted: true, ...result });
}));

// GET /api/snapshot/v1/places
router.get('/places', asyncRoute(async (req, res) => {
  const result = await db.query(
    'SELECT * FROM snapshot_places WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  return ok(res, { places: result.rows });
}));

// POST /api/snapshot/v1/places
router.post('/places', asyncRoute(async (req, res) => {
  const label = text(req.body && req.body.label, 80) || '';
  if (!label) return fail(res, 400, '写下常用地点');
  const result = await db.query(
    `INSERT INTO snapshot_places (id, user_id, label) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, label) DO UPDATE SET label = EXCLUDED.label
     RETURNING *`,
    [uuid(), req.user.id, label]
  );
  return ok(res, { place: result.rows[0] });
}));

// DELETE /api/snapshot/v1/places/:id
router.delete('/places/:id', asyncRoute(async (req, res) => {
  const result = await db.query(
    'DELETE FROM snapshot_places WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  return ok(res, { deleted: result.rowCount > 0 });
}));

// GET /api/snapshot/v1/meditation/summary
router.get('/meditation/summary', asyncRoute(async (req, res) => {
  const day = requestedDay(req.query.date);
  if (!day) return fail(res, 400, '日期格式不正确');
  return ok(res, await meditationSummary(req.user.id, day));
}));

// POST /api/snapshot/v1/meditation/complete
router.post('/meditation/complete', asyncRoute(async (req, res) => {
  const day = requestedDay(req.query.date);
  if (!day) return fail(res, 400, '日期格式不正确');
  const body = req.body || {};
  const duration = Math.max(1, Math.min(120, parseInt(body.duration_min, 10) || 3));
  const affirmation = text(body.affirmation, 1000) || '';
  const meditation = await db.transaction(async client => {
    await ensureSnapshot(client, req.user.id, day);
    const result = await client.query(
      `INSERT INTO snapshot_meditations (id, user_id, day, duration_min, affirmation)
       VALUES ($1, $2, $3::date, $4, $5) RETURNING *`,
      [uuid(), req.user.id, day, duration, affirmation]
    );
    return result.rows[0];
  });
  const summary = await meditationSummary(req.user.id, day);
  return ok(res, {
    meditation,
    ...summary,
  });
}));

// GET /api/snapshot/v1/history?days=7
router.get('/history', asyncRoute(async (req, res) => {
  const days = Math.max(1, Math.min(90, parseInt(req.query.days, 10) || 7));
  const rows = await db.query(
    `SELECT to_char(s.day, 'YYYY-MM-DD') AS day, s.mood, s.weather_code, s.weather_temp, s.steps,
            s.bedtime, s.wake_time, s.scene, s.expense_amount, s.expense_category,
            s.income_amount, s.income_category, s.morning_intent, s.evening_reflection,
            s.challenge_completed, s.challenge_skipped, s.challenge_title,
            s.daily_question, s.daily_answer, s.question_saved,
            (SELECT count(*)::int FROM snapshot_meals m WHERE m.snapshot_id = s.id) AS meal_count,
            (SELECT count(*)::int FROM snapshot_meditations med WHERE med.user_id = s.user_id AND med.day = s.day) AS meditation_count,
            (SELECT coalesce(sum(duration_min), 0)::int FROM snapshot_meditations med WHERE med.user_id = s.user_id AND med.day = s.day) AS meditation_minutes,
            (SELECT count(*)::int FROM snapshot_finance_entries f WHERE f.user_id = s.user_id AND f.day = s.day) AS finance_count
       FROM snapshots s
      WHERE s.user_id = $1 AND s.day >= current_date - ($2::int - 1)
      ORDER BY s.day DESC`,
    [req.user.id, days]
  );
  return ok(res, { days: rows.rows });
}));

// GET /api/snapshot/v1/trend
router.get('/trend', asyncRoute(async (req, res) => {
  const rows = await db.query(
    `SELECT day, mood, steps,
            CASE WHEN wake_time = '' OR bedtime = '' THEN NULL
              ELSE (EXTRACT(EPOCH FROM (
                (wake_time::time - bedtime::time)
                + CASE WHEN wake_time::time > bedtime::time
                    THEN interval '0 hours' ELSE interval '24 hours' END
              ))/3600)::numeric(4,1)
            END AS sleep_hours
       FROM snapshots
      WHERE user_id = $1 AND day >= current_date - 6
      ORDER BY day ASC`,
    [req.user.id]
  );
  return ok(res, { trend: rows.rows });
}));

module.exports = router;
