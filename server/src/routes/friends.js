'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { clampScore, relationshipLevel, ruleChange } = require('../friend-rules');
const { asyncRoute, fail, ok, pageParams, requireUser, stringArray, text } = require('../http');

const router = express.Router();
router.use(requireUser);

const friendFields = `id, name, category, relationship, description, tags, contact, relation_score,
  trust_score, value_score, energy_score, first_contact, last_interaction, created_at, updated_at`;

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function date(value, fallback = false) {
  const result = text(value, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(result)) return result;
  return fallback ? new Date().toISOString().slice(0, 10) : null;
}

function score(value) {
  if (value === null || value === undefined || value === '') return null;
  return clampScore(value);
}

function requestedId(value) {
  const id = text(value, 96);
  return /^[A-Za-z0-9_-]{1,96}$/.test(id) ? id : crypto.randomUUID();
}

function stableImportId(type, friendId, index, value) {
  return crypto.createHash('sha256')
    .update(`${type}:${friendId}:${index}:${JSON.stringify(value)}`)
    .digest('hex')
    .slice(0, 48);
}

function mapFriend(row) {
  const level = relationshipLevel(row.relation_score);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    relationship: row.relationship,
    description: row.description,
    tags: row.tags || [],
    contact: row.contact || {},
    relationScore: row.relation_score,
    assetValue: {
      trust: row.trust_score,
      value: row.value_score,
      energy: row.energy_score
    },
    level,
    firstContact: row.first_contact,
    lastInteraction: row.last_interaction,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function friendInput(value, options = {}) {
  const assetValue = object(value.assetValue);
  const rawRelationScore = Number(value.relationScore ?? value.relation_score);
  const relationScore = options.allowLegacyScore && Number.isInteger(rawRelationScore) && rawRelationScore >= -3 && rawRelationScore <= 10
    ? rawRelationScore
    : clampScore(rawRelationScore);
  return {
    id: requestedId(value.id),
    name: text(value.name, 120),
    category: text(value.category, 48) || '朋友',
    relationship: text(value.relationship, 1000),
    description: text(value.description, 3000),
    tags: stringArray(value.tags, 30, 80),
    contact: object(value.contact),
    relationScore,
    trustScore: score(value.trustScore ?? value.trust_score ?? assetValue.trust),
    valueScore: score(value.valueScore ?? value.value_score ?? assetValue.value),
    energyScore: score(value.energyScore ?? value.energy_score ?? assetValue.energy),
    lastInteraction: date(value.lastInteraction ?? value.last_interaction),
    firstContact: date(value.firstContact ?? value.first_contact),
    createdAt: text(value.createdAt ?? value.created_at, 40) || null,
    updatedAt: text(value.updatedAt ?? value.updated_at, 40) || null,
    sourceId: options.preserveSource ? (text(value.id, 96) || null) : null,
    sourceCreatedAt: options.preserveSource ? (text(value.createdAt, 40) || null) : null,
    sourceUpdatedAt: options.preserveSource ? (text(value.updatedAt, 40) || null) : null
  };
}

async function upsertFriend(connection, userId, value, options = {}) {
  const input = friendInput(value, options);
  if (!input.name) throw Object.assign(new Error('人脉姓名不能为空'), { code: 'SHROOM_FRIEND_INPUT' });
  const result = await connection.query(
    `INSERT INTO friends
      (id, user_id, name, category, relationship, description, tags, contact, relation_score,
       trust_score, value_score, energy_score, first_contact, last_interaction, created_at, updated_at,
       source_id, source_created_at, source_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14,
       COALESCE($15::timestamptz, now()), COALESCE($16::timestamptz, now()), $17, $18, $19)
     ON CONFLICT (user_id, name) DO UPDATE SET
       category = EXCLUDED.category,
       relationship = EXCLUDED.relationship,
       description = EXCLUDED.description,
       tags = EXCLUDED.tags,
       contact = EXCLUDED.contact,
       relation_score = EXCLUDED.relation_score,
       trust_score = EXCLUDED.trust_score,
       value_score = EXCLUDED.value_score,
       energy_score = EXCLUDED.energy_score,
       first_contact = COALESCE(EXCLUDED.first_contact, friends.first_contact),
       last_interaction = COALESCE(EXCLUDED.last_interaction, friends.last_interaction),
       source_id = COALESCE(EXCLUDED.source_id, friends.source_id),
       source_created_at = COALESCE(EXCLUDED.source_created_at, friends.source_created_at),
       source_updated_at = COALESCE(EXCLUDED.source_updated_at, friends.source_updated_at),
       updated_at = EXCLUDED.updated_at
     RETURNING ${friendFields}`,
    [
      input.id, userId, input.name, input.category, input.relationship, input.description,
      JSON.stringify(input.tags), JSON.stringify(input.contact), input.relationScore,
      input.trustScore, input.valueScore, input.energyScore, input.firstContact,
      input.lastInteraction, input.createdAt, input.updatedAt,
      input.sourceId, input.sourceCreatedAt, input.sourceUpdatedAt
    ]
  );
  return result.rows[0];
}

async function requireFriend(connection, userId, id) {
  const result = await connection.query(
    `SELECT ${friendFields} FROM friends WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [userId, id]
  );
  return result.rows[0] || null;
}

async function listFriends(req, res) {
  const { page, pageSize, offset } = pageParams(req.query);
  const conditions = ['user_id = $1', 'deleted_at IS NULL'];
  const values = [req.user.id];
  const category = text(req.query.category, 48);
  const keyword = text(req.query.keyword, 100);
  const minScore = Number(req.query.minScore);
  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }
  if (keyword) {
    values.push(`%${keyword}%`);
    conditions.push(`(name ILIKE $${values.length} OR relationship ILIKE $${values.length} OR tags::text ILIKE $${values.length})`);
  }
  if (Number.isFinite(minScore)) {
    values.push(clampScore(minScore));
    conditions.push(`relation_score >= $${values.length}`);
  }
  const filter = conditions.join(' AND ');
  const order = req.query.sort === 'lastInteraction'
    ? 'last_interaction DESC NULLS LAST, relation_score DESC, name'
    : 'relation_score DESC, last_interaction DESC NULLS LAST, name';
  const listValues = values.concat(pageSize, offset);
  const [items, total] = await Promise.all([
    db.query(
      `SELECT ${friendFields} FROM friends WHERE ${filter}
       ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      listValues
    ),
    db.query(`SELECT count(*)::int AS total FROM friends WHERE ${filter}`, values)
  ]);
  return ok(res, { list: items.rows.map(mapFriend), total: total.rows[0].total, page, pageSize });
}

router.get('/list', asyncRoute(listFriends));
router.get('/search', asyncRoute(listFriends));

router.post('/upsert', asyncRoute(async (req, res) => {
  const row = await upsertFriend(db, req.user.id, req.body || {});
  return ok(res, mapFriend(row), '人脉已保存');
}));

router.put('/:id', asyncRoute(async (req, res) => {
  const input = friendInput({ ...(req.body || {}), id: req.params.id });
  if (!input.name) return fail(res, 400, '人脉姓名不能为空');
  const result = await db.query(
    `UPDATE friends SET
       name = $3, category = $4, relationship = $5, tags = $6::jsonb,
       contact = $7::jsonb, relation_score = $8, trust_score = $9,
       value_score = $10, energy_score = $11,
       last_interaction = COALESCE($12, last_interaction), updated_at = now()
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING ${friendFields}`,
    [
      req.user.id, req.params.id, input.name, input.category, input.relationship,
      JSON.stringify(input.tags), JSON.stringify(input.contact), input.relationScore,
      input.trustScore, input.valueScore, input.energyScore, input.lastInteraction
    ]
  );
  if (!result.rowCount) return fail(res, 404, '人脉不存在');
  return ok(res, mapFriend(result.rows[0]), '人脉已更新');
}));

router.post('/import', asyncRoute(async (req, res) => {
  const source = Array.isArray(req.body) ? req.body : req.body.friends;
  if (!Array.isArray(source) || source.length > 5000) return fail(res, 400, '导入数据格式不正确');
  const counts = { friends: 0, interactions: 0, scoreHistory: 0, todos: 0, milestones: 0 };
  await db.transaction(async client => {
    for (const value of source) {
      const friend = await upsertFriend(client, req.user.id, value, { allowLegacyScore: true, preserveSource: true });
      counts.friends += 1;
      const friendId = friend.id;
      const interactions = Array.isArray(value.interactions) ? value.interactions : [];
      for (const [index, item] of interactions.entries()) {
        const itemId = stableImportId('interaction', friendId, index, item);
        await client.query(
          `INSERT INTO interactions
            (id, user_id, friend_id, interaction_date, interaction_type, topic, sentiment, notes, follow_up, diary_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (user_id, id) DO UPDATE SET
             interaction_date = EXCLUDED.interaction_date, interaction_type = EXCLUDED.interaction_type,
             topic = EXCLUDED.topic, sentiment = EXCLUDED.sentiment, notes = EXCLUDED.notes,
             follow_up = EXCLUDED.follow_up, diary_id = EXCLUDED.diary_id`,
          [
            itemId, req.user.id, friendId, date(item.date, true), text(item.type, 48) || '互动',
            text(item.topic, 2000), ['positive', 'neutral', 'negative', 'bittersweet'].includes(item.sentiment) ? item.sentiment : 'neutral',
            text(item.notes, 5000), text(item.followUp ?? item.follow_up, 1000), text(item.diaryId ?? item.diary_id, 128) || null
          ]
        );
        counts.interactions += 1;
      }
      const histories = Array.isArray(value.scoreHistory) ? value.scoreHistory : (Array.isArray(value.score_histories) ? value.score_histories : []);
      for (const [index, item] of histories.entries()) {
        const itemId = stableImportId('score', friendId, index, item);
        const ruleCode = text(item.ruleCode ?? item.rule_code, 64) || null;
        const rawChange = Number(item.change);
        const change = !ruleCode && Number.isInteger(rawChange) && rawChange >= -3 && rawChange <= 3
          ? rawChange
          : ruleChange(ruleCode, item.change);
        await client.query(
          `INSERT INTO score_histories
            (id, user_id, friend_id, score_date, change, reason, rule_code, diary_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, id) DO UPDATE SET
             score_date = EXCLUDED.score_date, change = EXCLUDED.change, reason = EXCLUDED.reason,
             rule_code = EXCLUDED.rule_code, diary_id = EXCLUDED.diary_id`,
          [
            itemId, req.user.id, friendId, date(item.date, true), change,
            text(item.reason, 2000) || '历史评分迁移', ruleCode,
            text(item.diaryId ?? item.diary_id, 128) || null
          ]
        );
        counts.scoreHistory += 1;
      }
      const todos = Array.isArray(value.todos) ? value.todos : [];
      for (const [index, item] of todos.entries()) {
        const itemId = stableImportId('todo', friendId, index, item);
        const status = ['pending', 'done', 'completed', 'overdue', 'cancelled', 'created'].includes(item.status) ? item.status : 'pending';
        await client.query(
          `INSERT INTO friend_todos
            (id, user_id, friend_id, task, due_date, status, priority, completed_at, completion_note, source_created_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (user_id, id) DO UPDATE SET
             task = EXCLUDED.task, due_date = EXCLUDED.due_date, status = EXCLUDED.status,
             priority = EXCLUDED.priority, completed_at = EXCLUDED.completed_at,
             completion_note = EXCLUDED.completion_note, source_created_date = EXCLUDED.source_created_date,
             updated_at = now()`,
          [
            itemId, req.user.id, friendId, text(item.task, 2000), date(item.dueDate ?? item.due_date), status,
            text(item.priority, 16) || null, date(item.completedAt ?? item.completed_at),
            text(item.completionNote ?? item.completion_note, 3000), date(item.createdAt ?? item.created_at)
          ]
        );
        counts.todos += 1;
      }
      const milestones = Array.isArray(value.milestones) ? value.milestones : [];
      for (const [index, item] of milestones.entries()) {
        const itemId = stableImportId('milestone', friendId, index, item);
        await client.query(
          `INSERT INTO friend_milestones (id, user_id, friend_id, milestone_date, raw_date, event, context)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, id) DO UPDATE SET
             milestone_date = EXCLUDED.milestone_date, raw_date = EXCLUDED.raw_date,
             event = EXCLUDED.event, context = EXCLUDED.context`,
          [itemId, req.user.id, friendId, date(item.date), text(item.date, 32), text(item.event, 1000), text(item.context, 3000)]
        );
        counts.milestones += 1;
      }
    }
  });
  return ok(res, counts, '人脉资产导入完成');
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const friend = await requireFriend(db, req.user.id, req.params.id);
  if (!friend) return fail(res, 404, '人脉不存在');
  const [interactions, history, todos, milestones] = await Promise.all([
    db.query(
      `SELECT id, interaction_date AS date, interaction_type AS type, topic, sentiment, notes,
        follow_up AS "followUp", diary_id AS "diaryId", created_at AS "createdAt"
       FROM interactions WHERE user_id = $1 AND friend_id = $2 ORDER BY interaction_date DESC, created_at DESC`,
      [req.user.id, friend.id]
    ),
    db.query(
      `SELECT id, score_date AS date, change, reason, rule_code AS "ruleCode", diary_id AS "diaryId",
        created_at AS "createdAt"
       FROM score_histories WHERE user_id = $1 AND friend_id = $2 ORDER BY score_date DESC, created_at DESC`,
      [req.user.id, friend.id]
    ),
    db.query(
      `SELECT id, task, due_date AS "dueDate", status, priority,
        completed_at AS "completedAt", completion_note AS "completionNote",
        source_created_date AS "sourceCreatedAt", global_todo_id AS "globalTodoId",
        created_at AS "createdAt", updated_at AS "updatedAt"
       FROM friend_todos WHERE user_id = $1 AND friend_id = $2 ORDER BY due_date NULLS LAST, created_at DESC`,
      [req.user.id, friend.id]
    ),
    db.query(
      `SELECT id, COALESCE(to_char(milestone_date, 'YYYY-MM-DD'), raw_date) AS date,
        event, context, created_at AS "createdAt"
       FROM friend_milestones WHERE user_id = $1 AND friend_id = $2
       ORDER BY milestone_date DESC NULLS LAST, created_at DESC`,
      [req.user.id, friend.id]
    )
  ]);
  return ok(res, {
    ...mapFriend(friend),
    interactions: interactions.rows,
    scoreHistory: history.rows,
    todos: todos.rows,
    milestones: milestones.rows
  });
}));

router.post('/:id/interactions', asyncRoute(async (req, res) => {
  const result = await db.transaction(async client => {
    const friend = await requireFriend(client, req.user.id, req.params.id);
    if (!friend) return null;
    const interactionDate = date(req.body.date, true);
    const sentiment = ['positive', 'neutral', 'negative'].includes(req.body.sentiment) ? req.body.sentiment : 'neutral';
    const item = await client.query(
      `INSERT INTO interactions
        (id, user_id, friend_id, interaction_date, interaction_type, topic, sentiment, notes, follow_up, diary_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, interaction_date AS date, interaction_type AS type, topic, sentiment, notes,
         follow_up AS "followUp", diary_id AS "diaryId", created_at AS "createdAt"`,
      [
        crypto.randomUUID(), req.user.id, friend.id, interactionDate, text(req.body.type, 48) || '互动',
        text(req.body.topic, 2000), sentiment, text(req.body.notes, 5000),
        text(req.body.followUp, 1000), text(req.body.diaryId, 128) || null
      ]
    );
    await client.query(
      `UPDATE friends SET last_interaction = GREATEST(COALESCE(last_interaction, $3::date), $3::date), updated_at = now()
       WHERE user_id = $1 AND id = $2`,
      [req.user.id, friend.id, interactionDate]
    );
    return item.rows[0];
  });
  if (!result) return fail(res, 404, '人脉不存在');
  return ok(res, result, '互动已记录');
}));

router.post('/:id/score', asyncRoute(async (req, res) => {
  const result = await db.transaction(async client => {
    const friend = await requireFriend(client, req.user.id, req.params.id);
    if (!friend) return null;
    const ruleCode = text(req.body.ruleCode, 64) || null;
    const change = ruleChange(ruleCode, req.body.change);
    const reason = text(req.body.reason, 2000);
    if (!reason) throw Object.assign(new Error('请填写加减分理由'), { code: 'SHROOM_FRIEND_INPUT' });
    const nextScore = clampScore(friend.relation_score + change);
    const history = await client.query(
      `INSERT INTO score_histories
        (id, user_id, friend_id, score_date, change, reason, rule_code, diary_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, score_date AS date, change, reason, rule_code AS "ruleCode", diary_id AS "diaryId"`,
      [
        crypto.randomUUID(), req.user.id, friend.id, date(req.body.date, true), change, reason,
        ruleCode, text(req.body.diaryId, 128) || null
      ]
    );
    await client.query(
      'UPDATE friends SET relation_score = $3, updated_at = now() WHERE user_id = $1 AND id = $2',
      [req.user.id, friend.id, nextScore]
    );
    return { relationScore: nextScore, level: relationshipLevel(nextScore), history: history.rows[0] };
  });
  if (!result) return fail(res, 404, '人脉不存在');
  return ok(res, result, '人脉分值已更新');
}));

router.get('/:id/todos', asyncRoute(async (req, res) => {
  const friend = await requireFriend(db, req.user.id, req.params.id);
  if (!friend) return fail(res, 404, '人脉不存在');
  const result = await db.query(
    `SELECT id, task, due_date AS "dueDate", status, global_todo_id AS "globalTodoId",
      created_at AS "createdAt", updated_at AS "updatedAt"
     FROM friend_todos WHERE user_id = $1 AND friend_id = $2 ORDER BY due_date NULLS LAST, created_at DESC`,
    [req.user.id, friend.id]
  );
  return ok(res, result.rows);
}));

router.post('/:id/todos', asyncRoute(async (req, res) => {
  const friend = await requireFriend(db, req.user.id, req.params.id);
  if (!friend) return fail(res, 404, '人脉不存在');
  const task = text(req.body.task, 2000);
  if (!task) return fail(res, 400, '承诺内容不能为空');
  const result = await db.query(
    `INSERT INTO friend_todos (id, user_id, friend_id, task, due_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, task, due_date AS "dueDate", status, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [crypto.randomUUID(), req.user.id, friend.id, task, date(req.body.dueDate)]
  );
  return ok(res, result.rows[0], '承诺已记录');
}));

async function updateFriendTodo(req, res) {
  const status = ['pending', 'done', 'completed', 'overdue', 'cancelled', 'created'].includes(req.body.status) ? req.body.status : null;
  if (!status) return fail(res, 400, '承诺状态不正确');
  const result = await db.query(
    `UPDATE friend_todos SET status = $4, updated_at = now()
     WHERE user_id = $1 AND friend_id = $2 AND id = $3
     RETURNING id, task, due_date AS "dueDate", status, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [req.user.id, req.params.id, req.params.todoId, status]
  );
  if (!result.rowCount) return fail(res, 404, '承诺不存在');
  return ok(res, result.rows[0], '承诺状态已更新');
}

router.patch('/:id/todos/:todoId', asyncRoute(updateFriendTodo));
router.put('/:id/todos/:todoId', asyncRoute(updateFriendTodo));

router.delete('/:id', asyncRoute(async (req, res) => {
  const result = await db.query(
    'UPDATE friends SET deleted_at = now(), updated_at = now() WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL',
    [req.user.id, req.params.id]
  );
  if (!result.rowCount) return fail(res, 404, '人脉不存在');
  return ok(res, null, '人脉已移入归档');
}));

module.exports = router;
