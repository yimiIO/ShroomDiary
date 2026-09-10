'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { asyncRoute, fail, ok, pageParams, requireUser } = require('../http');

const router = express.Router();
router.use(requireUser);

const DEFAULT_RULES = [
  { type: 'contact_due', label: '重要关系联系提醒', description: '核心关系超过 14 天、重要关系超过 21 天未互动时提醒。' },
  { type: 'commitment_due', label: '承诺到期提醒', description: '你对别人答应的事临近截止或逾期时提醒。' },
  { type: 'monthly_review', label: '月度关系复盘', description: '每月汇总新关系、加减分和未完成承诺。' },
  { type: 'boundary', label: '关系边界提醒', description: '低分关系连续出现负面变化时提醒你保护边界。' }
];

async function ensureRules(userId) {
  for (const rule of DEFAULT_RULES) {
    await db.query(
      `INSERT INTO reminder_rules (id, user_id, type, settings)
       VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (user_id, type) DO NOTHING`,
      [crypto.randomUUID(), userId, rule.type, JSON.stringify({ label: rule.label, description: rule.description })]
    );
  }
}

function mapRule(row) {
  return {
    id: row.id,
    type: row.type,
    enabled: row.enabled,
    label: row.settings?.label || row.type,
    description: row.settings?.description || '',
    updatedAt: row.updated_at
  };
}

router.get('/rules', asyncRoute(async (req, res) => {
  await ensureRules(req.user.id);
  const result = await db.query(
    'SELECT id, type, enabled, settings, updated_at FROM reminder_rules WHERE user_id = $1 ORDER BY created_at',
    [req.user.id]
  );
  return ok(res, result.rows.map(mapRule));
}));

async function updateRule(req, res) {
  const enabled = req.body.enabled;
  if (typeof enabled !== 'boolean') return fail(res, 400, '提醒开关参数不正确');
  await ensureRules(req.user.id);
  const result = await db.query(
    `UPDATE reminder_rules SET enabled = $3, updated_at = now()
     WHERE user_id = $1 AND id = $2
     RETURNING id, type, enabled, settings, updated_at`,
    [req.user.id, req.params.id, enabled]
  );
  if (!result.rowCount) return fail(res, 404, '提醒规则不存在');
  return ok(res, mapRule(result.rows[0]), '提醒设置已更新');
}

router.patch('/rules/:id', asyncRoute(updateRule));
router.put('/rules/:id', asyncRoute(updateRule));

async function buildOverview(userId) {
  await ensureRules(userId);
  const rulesResult = await db.query(
    'SELECT type, enabled FROM reminder_rules WHERE user_id = $1',
    [userId]
  );
  const enabled = Object.fromEntries(rulesResult.rows.map(item => [item.type, item.enabled]));
  const [contact, commitments, boundaries] = await Promise.all([
    enabled.contact_due ? db.query(
      `SELECT f.id AS "friendId", f.name, f.relation_score AS score,
         f.last_interaction AS "lastInteraction",
         CASE WHEN f.relation_score >= 9 THEN 14 ELSE 21 END AS "thresholdDays",
         (SELECT i.topic FROM interactions i
          WHERE i.user_id = f.user_id AND i.friend_id = f.id
          ORDER BY i.interaction_date DESC, i.created_at DESC LIMIT 1) AS "lastTopic"
       FROM friends f
       WHERE f.user_id = $1 AND f.deleted_at IS NULL AND f.relation_score >= 7
         AND (f.last_interaction IS NULL OR
           current_date - f.last_interaction > CASE WHEN f.relation_score >= 9 THEN 14 ELSE 21 END)
       ORDER BY f.relation_score DESC, f.last_interaction NULLS FIRST`,
      [userId]
    ) : Promise.resolve({ rows: [] }),
    enabled.commitment_due ? db.query(
      `SELECT t.id, t.friend_id AS "friendId", f.name, t.task, t.due_date AS "dueDate",
         CASE WHEN t.due_date < current_date THEN 'overdue'
              WHEN t.due_date = current_date THEN 'today' ELSE 'upcoming' END AS urgency
       FROM friend_todos t JOIN friends f ON f.user_id = t.user_id AND f.id = t.friend_id
       WHERE t.user_id = $1 AND t.status IN ('pending', 'overdue')
         AND t.due_date IS NOT NULL AND t.due_date <= current_date + 7
       ORDER BY t.due_date, f.name`,
      [userId]
    ) : Promise.resolve({ rows: [] }),
    enabled.boundary ? db.query(
      `SELECT f.id AS "friendId", f.name, f.relation_score AS score,
         count(*)::int AS "recentNegativeCount"
       FROM friends f JOIN LATERAL (
         SELECT change FROM score_histories s
         WHERE s.user_id = f.user_id AND s.friend_id = f.id
         ORDER BY s.score_date DESC, s.created_at DESC LIMIT 3
       ) latest ON latest.change < 0
       WHERE f.user_id = $1 AND f.deleted_at IS NULL AND f.relation_score <= 2
       GROUP BY f.id, f.name, f.relation_score HAVING count(*) >= 3
       ORDER BY f.relation_score, f.name`,
      [userId]
    ) : Promise.resolve({ rows: [] })
  ]);
  return { contactDue: contact.rows, commitments: commitments.rows, boundaries: boundaries.rows };
}

router.get('/overview', asyncRoute(async (req, res) => {
  const overview = await buildOverview(req.user.id);
  return ok(res, {
    ...overview,
    total: overview.contactDue.length + overview.commitments.length + overview.boundaries.length,
    generatedAt: new Date().toISOString()
  });
}));

router.post('/run/monthly-review', asyncRoute(async (req, res) => {
  const requested = String(req.body.period || req.query.period || '');
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
    ? requested
    : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 7);
  const [newFriends, changes, commitments, overview] = await Promise.all([
    db.query(
      `SELECT id AS "friendId", name, relation_score AS score FROM friends
       WHERE user_id = $1 AND deleted_at IS NULL
         AND created_at >= (($2 || '-01')::timestamp AT TIME ZONE 'Asia/Shanghai')
         AND created_at < ((($2 || '-01')::timestamp + interval '1 month') AT TIME ZONE 'Asia/Shanghai')
       ORDER BY created_at`,
      [req.user.id, period]
    ),
    db.query(
      `SELECT s.friend_id AS "friendId", f.name, s.change, s.reason, s.score_date AS date,
         f.relation_score AS score
       FROM score_histories s JOIN friends f ON f.user_id = s.user_id AND f.id = s.friend_id
       WHERE s.user_id = $1 AND s.score_date >= ($2 || '-01')::date
         AND s.score_date < (($2 || '-01')::date + interval '1 month')
       ORDER BY s.score_date, s.created_at`,
      [req.user.id, period]
    ),
    db.query(
      `SELECT t.id, t.friend_id AS "friendId", f.name, t.task, t.due_date AS "dueDate", t.status
       FROM friend_todos t JOIN friends f ON f.user_id = t.user_id AND f.id = t.friend_id
       WHERE t.user_id = $1 AND t.status IN ('pending', 'overdue') ORDER BY t.due_date NULLS LAST`,
      [req.user.id]
    ),
    buildOverview(req.user.id)
  ]);
  const payload = {
    period,
    newFriends: newFriends.rows,
    changes: changes.rows,
    maintenance: { contactDue: overview.contactDue, boundaries: overview.boundaries },
    commitments: commitments.rows,
    summary: {
      newFriendCount: newFriends.rowCount,
      positiveChangeCount: changes.rows.filter(item => item.change > 0).length,
      negativeChangeCount: changes.rows.filter(item => item.change < 0).length,
      pendingCommitmentCount: commitments.rowCount
    }
  };
  const result = await db.query(
    `INSERT INTO monthly_relationship_reviews (id, user_id, period, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_id, period) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
     RETURNING id, period, payload, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [crypto.randomUUID(), req.user.id, period, JSON.stringify(payload)]
  );
  return ok(res, result.rows[0], '月度关系复盘已生成');
}));

router.get('/logs', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const [items, total] = await Promise.all([
    db.query(
      `SELECT id, type, friend_id AS "friendId", payload, scheduled_at AS "scheduledAt",
         sent_at AS "sentAt", status, created_at AS "createdAt"
       FROM reminders WHERE user_id = $1 ORDER BY scheduled_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, pageSize, offset]
    ),
    db.query('SELECT count(*)::int AS total FROM reminders WHERE user_id = $1', [req.user.id])
  ]);
  return ok(res, { list: items.rows, total: total.rows[0].total, page, pageSize });
}));

module.exports = router;
