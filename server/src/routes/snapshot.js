'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { asyncRoute, fail, ok, requireUser, text } = require('../http');

const router = express.Router();
router.use(requireUser);

function uuid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

const MOODS = new Set([
  'super','happy','moved','heart','calm','cozy','speechless','lost','bored',
  'tired','irritated','unhappy','scared','shock','surprise','terrible','unwell',
  'angry','worried','wronged'
]);
const MEAL_TYPES = new Set(['BREAKFAST','LUNCH','DINNER','AFTERNOON_TEA','SUPPER','BRUNCH']);

// GET /api/snapshot/v1/today?date=2026-09-22
router.get('/today', asyncRoute(async (req, res) => {
  const day = req.query.date || today();
  const rows = await db.query(
    `SELECT * FROM snapshots WHERE user_id = $1 AND day = $2::date`,
    [req.user.id, day]
  );
  const snapshot = rows.rows[0] || null;
  let meals = [];
  let meditations = [];
  if (snapshot) {
    const m = await db.query(
      `SELECT * FROM snapshot_meals WHERE snapshot_id = $1 ORDER BY created_at`,
      [snapshot.id]
    );
    meals = m.rows;
  }
  const med = await db.query(
    `SELECT * FROM snapshot_meditations WHERE user_id = $1 AND day = $2::date ORDER BY completed_at`,
    [req.user.id, day]
  );
  meditations = med.rows;
  return ok(res, { snapshot, meals, meditations, date: day });
}));

// PUT /api/snapshot/v1/today  —  upsert 任意字段
router.put('/today', asyncRoute(async (req, res) => {
  const day = req.query.date || today();
  const body = req.body || {};
  const allowed = {
    mood: v => typeof v === 'string' && (v === '' || MOODS.has(v)) ? v : undefined,
    weather_code: v => typeof v === 'string' ? v.slice(0, 24) : undefined,
    weather_temp: v => v === null || v === undefined ? null : Number(v),
    steps: v => Math.max(0, Math.min(1000000, parseInt(v, 10) || 0)),
    bedtime: v => typeof v === 'string' ? v.slice(0, 8) : undefined,
    wake_time: v => typeof v === 'string' ? v.slice(0, 8) : undefined,
    scene: v => typeof v === 'string' ? v.slice(0, 48) : undefined,
    expense_amount: v => Math.max(0, Number(v) || 0),
    expense_category: v => typeof v === 'string' ? v.slice(0, 24) : undefined,
    income_amount: v => Math.max(0, Number(v) || 0),
    income_category: v => typeof v === 'string' ? v.slice(0, 24) : undefined,
    morning_intent: v => text(v, 1000) || '',
    evening_reflection: v => text(v, 2000) || '',
    challenge_completed: v => !!v,
  };
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, fn] of Object.entries(allowed)) {
    if (k in body) {
      const v = fn(body[k]);
      if (v !== undefined) {
        fields.push(`${k} = $${i++}`);
        values.push(v);
      }
    }
  }
  if (!fields.length) return fail(res, 400, 'no fields to update');
  values.push(req.user.id, day);
  const r = await db.query(
    `INSERT INTO snapshots (id, user_id, day) VALUES ($${i++}, $${i++}, $${i++}::date)
     ON CONFLICT (user_id, day) DO UPDATE SET ${fields.join(', ')}, updated_at = now()
     RETURNING *`,
    [uuid(), ...values]
  );
  return ok(res, { snapshot: r.rows[0] });
}));

// POST /api/snapshot/v1/meals  —  加一餐
router.post('/meals', asyncRoute(async (req, res) => {
  const day = req.query.date || today();
  const body = req.body || {};
  const mealType = MEAL_TYPES.has(body.meal_type) ? body.meal_type : 'BRUNCH';
  const name = text(body.name, 240) || '';
  const description = text(body.description, 2000) || '';
  // ensure snapshot exists
  const s = await db.query(
    `INSERT INTO snapshots (id, user_id, day) VALUES ($1, $2, $3::date)
     ON CONFLICT (user_id, day) DO UPDATE SET updated_at = now() RETURNING id`,
    [uuid(), req.user.id, day]
  );
  const meal = await db.query(
    `INSERT INTO snapshot_meals (id, snapshot_id, meal_type, name, description, meal_time)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [uuid(), s.rows[0].id, mealType, name, description, body.meal_time || null]
  );
  return ok(res, { meal: meal.rows[0] });
}));

// DELETE /api/snapshot/v1/meals/:id
router.delete('/meals/:id', asyncRoute(async (req, res) => {
  await db.query(
    `DELETE FROM snapshot_meals WHERE id = $1 AND snapshot_id IN (SELECT id FROM snapshots WHERE user_id = $2)`,
    [req.params.id, req.user.id]
  );
  return ok(res, { deleted: true });
}));

// POST /api/snapshot/v1/meditation/complete
router.post('/meditation/complete', asyncRoute(async (req, res) => {
  const day = req.query.date || today();
  const body = req.body || {};
  const duration = Math.max(1, Math.min(120, parseInt(body.duration_min, 10) || 3));
  const affirmation = text(body.affirmation, 1000) || '';
  const m = await db.query(
    `INSERT INTO snapshot_meditations (id, user_id, day, duration_min, affirmation)
     VALUES ($1, $2, $3::date, $4, $5) RETURNING *`,
    [uuid(), req.user.id, day, duration, affirmation]
  );
  // streak
  const streakR = await db.query(
    `WITH days AS (
       SELECT DISTINCT day FROM snapshot_meditations
       WHERE user_id = $1 AND day <= $2::date
       ORDER BY day DESC
     )
     SELECT count(*) AS streak FROM (
       SELECT day, row_number() OVER (ORDER BY day DESC) AS rn FROM days
     ) t WHERE day = $2::date - (rn - 1) * interval '1 day'`,
    [req.user.id, day]
  );
  const totalR = await db.query(
    `SELECT count(*)::int AS count, coalesce(sum(duration_min),0)::int AS minutes
     FROM snapshot_meditations WHERE user_id = $1`,
    [req.user.id]
  );
  return ok(res, {
    meditation: m.rows[0],
    streak: streakR.rows[0].streak,
    totalCount: totalR.rows[0].count,
    totalMinutes: totalR.rows[0].minutes,
  });
}));

// GET /api/snapshot/v1/history?days=7
router.get('/history', asyncRoute(async (req, res) => {
  const days = Math.max(1, Math.min(90, parseInt(req.query.days, 10) || 7));
  const rows = await db.query(
    `SELECT s.day, s.mood, s.weather_code, s.weather_temp, s.steps,
            s.bedtime, s.wake_time, s.expense_amount, s.income_amount,
            (SELECT count(*) FROM snapshot_meals m WHERE m.snapshot_id = s.id) AS meal_count
       FROM snapshots s
      WHERE s.user_id = $1 AND s.day >= current_date - $2::int
      ORDER BY s.day DESC`,
    [req.user.id, days]
  );
  return ok(res, { days: rows.rows });
}));

// GET /api/snapshot/v1/trend
router.get('/trend', asyncRoute(async (req, res) => {
  const rows = await db.query(
    `SELECT day, mood, steps,
            (EXTRACT(EPOCH FROM (
              CASE WHEN wake_time > bedtime
                THEN (wake_time::time - bedtime::time)
                ELSE (wake_time::time - bedtime::time) + interval '24 hours'
              END
            ))/3600)::numeric(4,1) AS sleep_hours
       FROM snapshots
      WHERE user_id = $1 AND day >= current_date - 6
      ORDER BY day ASC`,
    [req.user.id]
  );
  return ok(res, { trend: rows.rows });
}));

module.exports = router;
