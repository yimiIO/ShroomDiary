'use strict';

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const { isAiConfigured } = require('../ai-engine');
const { usageSummary } = require('../ai-usage');
const { embeddingProfile, isEmbeddingConfigured } = require('../embedding-provider');
const { normalizedScope } = require('../memory-retrieval');
const { bumpCorpusRevision } = require('../memory-store');
const { themeCatalog, themePreset } = require('../theme-presets');
const { asyncRoute, fail, ok, requireUser, text } = require('../http');

const router = express.Router();
router.use(requireUser);

function inferMode(value, question) {
  if (['related', 'timeline', 'change'].includes(value)) return value;
  if (/时间线|阶段|什么时候|历程/u.test(question)) return 'timeline';
  if (/变化|改变|成长|越来越|这些年|这几年|长期/u.test(question)) return 'change';
  return 'related';
}

function mapTask(row, costSummary = null) {
  if (!row || !row.task_id) return null;
  return {
    id: row.task_id,
    status: row.task_status,
    progress: row.task_progress,
    error: row.task_error || null,
    costSummary
  };
}

function mapConversation(row, messages = undefined, costs = {}) {
  const value = {
    id: row.id,
    seedDiaryId: row.seed_diary_id,
    title: row.title,
    mode: row.mode,
    scope: row.scope || {},
    question: row.initial_question,
    status: row.status,
    coverage: row.coverage || {},
    error: row.error_message,
    invalidatedAt: row.invalidated_at,
    task: mapTask(row, costs.task || null),
    costSummary: costs.conversation || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (messages) value.messages = messages;
  return value;
}

function mapMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    result: row.structured_result && Object.keys(row.structured_result).length ? row.structured_result : null,
    citations: row.citations || [],
    invalidatedAt: row.invalidated_at,
    createdAt: row.created_at
  };
}

async function validateDiaryScope(userId, seedDiaryId, scope) {
  const ids = [...new Set([seedDiaryId, ...scope.diaryIds].filter(Boolean))];
  if (!ids.length) return true;
  const result = await db.query(
    `SELECT id FROM diaries WHERE user_id = $1 AND id = ANY($2::uuid[])
      AND deleted_at IS NULL AND ai_allowed`,
    [userId, ids]
  );
  return result.rowCount === ids.length;
}

async function createTask(client, userId, conversationId, messageId) {
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO reflection_tasks (id, user_id, conversation_id, user_message_id)
     VALUES ($1, $2, $3, $4)`,
    [id, userId, conversationId, messageId]
  );
  return id;
}

router.get('/status', asyncRoute(async (req, res) => {
  const [counts, jobs] = await Promise.all([
    db.query(
      `SELECT count(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
              count(*) FILTER (WHERE deleted_at IS NULL AND ai_allowed)::int AS allowed
         FROM diaries WHERE user_id = $1`,
      [req.user.id]
    ),
    db.query(
      `SELECT count(*) FILTER (WHERE status = 'completed')::int AS completed,
              count(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS pending,
              count(*) FILTER (WHERE status = 'failed')::int AS failed
         FROM diary_index_tasks WHERE user_id = $1`,
      [req.user.id]
    )
  ]);
  const profile = embeddingProfile();
  return ok(res, {
    enabled: isAiConfigured(),
    model: isAiConfigured() ? config.aiModel : null,
    semanticIndex: {
      enabled: isEmbeddingConfigured(),
      model: profile?.model || null,
      profileId: profile?.id || null,
      completed: jobs.rows[0].completed,
      pending: jobs.rows[0].pending,
      failed: jobs.rows[0].failed
    },
    corpus: counts.rows[0],
    privacy: '只有当前登录账号主动发起回看时，授权范围内的日记片段才会发送给已配置的分析模型。'
  });
}));

router.get('/conversations', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT c.*, t.id AS task_id, t.status AS task_status, t.progress AS task_progress,
            t.error_message AS task_error
       FROM reflection_conversations c
       LEFT JOIN LATERAL (
         SELECT * FROM reflection_tasks WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
       ) t ON true
      WHERE c.user_id = $1 ORDER BY c.updated_at DESC LIMIT 50`,
    [req.user.id]
  );
  return ok(res, result.rows.map(row => mapConversation(row)));
}));

router.get('/themes', asyncRoute(async (req, res) => ok(res, themeCatalog())));

router.post('/themes/:key/open', asyncRoute(async (req, res) => {
  if (!isAiConfigured()) return fail(res, 503, '日记回看 AI 尚未配置');
  const preset = themePreset(req.params.key);
  if (!preset) return fail(res, 404, '主题不存在');

  const opened = await db.transaction(async client => {
    const revisionResult = await client.query(
      'SELECT corpus_revision FROM users WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );
    const revision = Number(revisionResult.rows[0]?.corpus_revision || 0);
    const existingResult = await client.query(
      `SELECT * FROM reflection_conversations
        WHERE user_id = $1 AND scope->>'themeKey' = $2
        ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,
      [req.user.id, preset.key]
    );
    const existing = existingResult.rows[0];

    if (existing && existing.status === 'processing') {
      return { id: existing.id, status: existing.status, reused: true, refreshing: true };
    }
    if (existing && Number(existing.corpus_revision) === revision &&
      ['completed', 'partial', 'insufficient_evidence'].includes(existing.status)) {
      return { id: existing.id, status: existing.status, reused: true, refreshing: false };
    }

    const scope = { ...normalizedScope({}), themeKey: preset.key };
    const messageId = crypto.randomUUID();
    if (existing && existing.status !== 'cancelled') {
      await client.query(
        `INSERT INTO reflection_messages (id, conversation_id, user_id, role, content)
         VALUES ($1, $2, $3, 'user', $4)`,
        [messageId, existing.id, req.user.id, `更新「${preset.title}」主题回看`]
      );
      const taskId = await createTask(client, req.user.id, existing.id, messageId);
      await client.query(
        `UPDATE reflection_conversations SET status = 'processing', scope = $3::jsonb,
          corpus_revision = $4, error_message = NULL, updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [existing.id, req.user.id, JSON.stringify(scope), revision]
      );
      return { id: existing.id, status: 'processing', taskId, reused: true, refreshing: true };
    }

    const conversationId = crypto.randomUUID();
    await client.query(
      `INSERT INTO reflection_conversations
        (id, user_id, title, mode, scope, initial_question, corpus_revision)
       VALUES ($1, $2, $3, 'timeline', $4::jsonb, $5, $6)`,
      [conversationId, req.user.id, preset.title, JSON.stringify(scope), preset.question, revision]
    );
    await client.query(
      `INSERT INTO reflection_messages (id, conversation_id, user_id, role, content)
       VALUES ($1, $2, $3, 'user', $4)`,
      [messageId, conversationId, req.user.id, preset.question]
    );
    const taskId = await createTask(client, req.user.id, conversationId, messageId);
    return { id: conversationId, status: 'processing', taskId, reused: false, refreshing: true };
  });

  return ok(res, opened, opened.refreshing ? '正在更新主题回看' : '已打开最近的主题回看');
}));

router.post('/conversations', asyncRoute(async (req, res) => {
  if (!isAiConfigured()) return fail(res, 503, '日记回看 AI 尚未配置；不会把日记发送给未配置的服务');
  const seedDiaryId = text(req.body.seedDiaryId, 64) || null;
  const scope = normalizedScope(req.body.scope);
  const question = text(req.body.question, 1000) ||
    (seedDiaryId ? '这篇日记与过去的哪些经历有关？有哪些相同、不同或还不能确定的地方？' : '');
  if (!question) return fail(res, 400, '写下你想向过去的自己询问的问题');
  if (!await validateDiaryScope(req.user.id, seedDiaryId, scope)) {
    return fail(res, 404, '所选日记不存在或没有授权 AI 读取');
  }
  const mode = inferMode(req.body.mode, question);
  const created = await db.transaction(async client => {
    const revision = await client.query('SELECT corpus_revision FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    await client.query(
      `INSERT INTO reflection_conversations
        (id, user_id, seed_diary_id, mode, scope, initial_question, corpus_revision)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        conversationId, req.user.id, seedDiaryId, mode, JSON.stringify(scope), question,
        revision.rows[0].corpus_revision
      ]
    );
    await client.query(
      `INSERT INTO reflection_messages (id, conversation_id, user_id, role, content)
       VALUES ($1, $2, $3, 'user', $4)`,
      [messageId, conversationId, req.user.id, question]
    );
    const taskId = await createTask(client, req.user.id, conversationId, messageId);
    return { conversationId, taskId };
  });
  return ok(res, {
    id: created.conversationId,
    status: 'processing',
    mode,
    scope,
    task: { id: created.taskId, status: 'pending', progress: 0 }
  }, '正在从日记中核对');
}));

router.get('/conversations/:id', asyncRoute(async (req, res) => {
  const [conversation, messages] = await Promise.all([
    db.query(
      `SELECT c.*, t.id AS task_id, t.status AS task_status, t.progress AS task_progress,
              t.error_message AS task_error
         FROM reflection_conversations c
         LEFT JOIN LATERAL (
           SELECT * FROM reflection_tasks WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
         ) t ON true
        WHERE c.id = $1 AND c.user_id = $2`,
      [req.params.id, req.user.id]
    ),
    db.query(
      `SELECT * FROM reflection_messages
        WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at`,
      [req.params.id, req.user.id]
    )
  ]);
  if (!conversation.rowCount) return fail(res, 404, '回看对话不存在');
  const row = conversation.rows[0];
  const [conversationCost, taskCost] = await Promise.all([
    usageSummary(req.user.id, { conversationId: req.params.id }),
    row.task_id ? usageSummary(req.user.id, { taskId: row.task_id }) : Promise.resolve(null)
  ]);
  return ok(res, mapConversation(row, messages.rows.map(mapMessage), {
    conversation: conversationCost,
    task: taskCost
  }));
}));

router.post('/conversations/:id/messages', asyncRoute(async (req, res) => {
  if (!isAiConfigured()) return fail(res, 503, '日记回看 AI 尚未配置');
  const content = text(req.body.content, 1000);
  if (!content) return fail(res, 400, '写下你想继续讨论的内容');
  const created = await db.transaction(async client => {
    const conversation = await client.query(
      `SELECT id FROM reflection_conversations
        WHERE id = $1 AND user_id = $2 AND status <> 'cancelled' FOR UPDATE`,
      [req.params.id, req.user.id]
    );
    if (!conversation.rowCount) return null;
    const active = await client.query(
      `SELECT id FROM reflection_tasks
        WHERE conversation_id = $1 AND status IN ('pending', 'processing') FOR UPDATE`,
      [req.params.id]
    );
    if (active.rowCount) return { busy: true };
    const revision = await client.query('SELECT corpus_revision FROM users WHERE id = $1', [req.user.id]);
    const messageId = crypto.randomUUID();
    await client.query(
      `INSERT INTO reflection_messages (id, conversation_id, user_id, role, content)
       VALUES ($1, $2, $3, 'user', $4)`,
      [messageId, req.params.id, req.user.id, content]
    );
    const taskId = await createTask(client, req.user.id, req.params.id, messageId);
    await client.query(
      `UPDATE reflection_conversations SET status = 'processing', corpus_revision = $3,
        error_message = NULL, updated_at = now() WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id, revision.rows[0].corpus_revision]
    );
    return { messageId, taskId };
  });
  if (!created) return fail(res, 404, '回看对话不存在');
  if (created.busy) return fail(res, 400, '上一条问题还在核对，请稍等');
  return ok(res, { messageId: created.messageId, task: { id: created.taskId, status: 'pending', progress: 0 } });
}));

router.post('/conversations/:id/feedback', asyncRoute(async (req, res) => {
  const kind = text(req.body.kind, 32);
  if (!['not_same_event', 'wrong_interpretation', 'not_now', 'helpful'].includes(kind)) {
    return fail(res, 400, '纠正类型不正确');
  }
  const note = text(req.body.note, 1000);
  const targetJson = req.body.target && typeof req.body.target === 'object' && !Array.isArray(req.body.target)
    ? JSON.stringify(req.body.target) : '{}';
  const target = targetJson.length <= 4000 ? JSON.parse(targetJson) : {};
  const saved = await db.transaction(async client => {
    const conversation = await client.query(
      'SELECT id FROM reflection_conversations WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [req.params.id, req.user.id]
    );
    if (!conversation.rowCount) return null;
    const messageId = text(req.body.messageId, 64) || null;
    if (messageId) {
      const message = await client.query(
        'SELECT id FROM reflection_messages WHERE id = $1 AND conversation_id = $2 AND user_id = $3',
        [messageId, req.params.id, req.user.id]
      );
      if (!message.rowCount) return { missingMessage: true };
    }
    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO reflection_feedback
        (id, user_id, conversation_id, message_id, kind, target, note)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [id, req.user.id, req.params.id, messageId, kind, JSON.stringify(target), note]
    );
    await bumpCorpusRevision(client, req.user.id);
    await client.query(
      'UPDATE reflection_conversations SET updated_at = now() WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    return { id };
  });
  if (!saved) return fail(res, 404, '回看对话不存在');
  if (saved.missingMessage) return fail(res, 404, '要纠正的回答不存在');
  return ok(res, saved, '这条纠正会用于后续回答');
}));

router.post('/conversations/:id/cards', asyncRoute(async (req, res) => {
  const messageId = text(req.body.messageId, 64);
  if (!messageId) return fail(res, 400, '请选择要保存的回看结论');
  const created = await db.transaction(async client => {
    const message = await client.query(
      `SELECT structured_result FROM reflection_messages
        WHERE id = $1 AND conversation_id = $2 AND user_id = $3
          AND role = 'assistant' AND invalidated_at IS NULL FOR UPDATE`,
      [messageId, req.params.id, req.user.id]
    );
    if (!message.rowCount) return { error: 'message' };
    const draft = message.rows[0].structured_result?.cardDraft;
    const seedSentence = text(req.body.seedSentence || draft?.seedSentence, 500);
    const myUnderstanding = text(req.body.myUnderstanding || draft?.myUnderstanding, 5000);
    const usageItems = (Array.isArray(req.body.usageItems) ? req.body.usageItems : draft?.usageItems || [])
      .map(item => text(item, 500)).filter(Boolean).slice(0, 10);
    const tags = (Array.isArray(req.body.tags) ? req.body.tags : draft?.tags || [])
      .map(item => text(item, 80)).filter(Boolean).slice(0, 20);
    if (!seedSentence || !usageItems.length) return { error: 'draft' };
    const sources = await client.query(
      `SELECT s.diary_id, s.source_version FROM reflection_message_sources s
       JOIN diaries d ON d.id = s.diary_id AND d.user_id = $2
        AND d.deleted_at IS NULL AND d.ai_allowed AND d.content_version = s.source_version
      WHERE s.message_id = $1`,
      [messageId, req.user.id]
    );
    if (!sources.rowCount) return { error: 'sources' };
    const cardId = crypto.randomUUID();
    const cardResult = await client.query(
      `INSERT INTO cards
        (id, user_id, seed_sentence, my_understanding, usage_items, tags, visibility,
         source_reflection_message_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'PRIVATE', $7)
       ON CONFLICT (user_id, source_reflection_message_id)
         WHERE source_reflection_message_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [cardId, req.user.id, seedSentence, myUnderstanding, JSON.stringify(usageItems), JSON.stringify(tags), messageId]
    );
    const savedCardId = cardResult.rows[0]?.id || (await client.query(
      'SELECT id FROM cards WHERE user_id = $1 AND source_reflection_message_id = $2',
      [req.user.id, messageId]
    )).rows[0]?.id;
    if (!cardResult.rowCount) return { cardId: savedCardId };
    for (const source of sources.rows) {
      await client.query(
        `INSERT INTO reflection_card_sources
          (card_id, conversation_id, message_id, diary_id, source_version)
         VALUES ($1, $2, $3, $4, $5)`,
        [savedCardId, req.params.id, messageId, source.diary_id, source.source_version]
      );
    }
    return { cardId: savedCardId };
  });
  if (created.error === 'message') return fail(res, 404, '可保存的回看结论不存在');
  if (created.error === 'draft') return fail(res, 400, '请先确认觉察句和至少一种具体用法');
  if (created.error === 'sources') return fail(res, 400, '来源日记已变化，请重新分析后再保存');
  return ok(res, created, '已由你确认并保存为私密菇卡');
}));

router.post('/conversations/:id/cancel', asyncRoute(async (req, res) => {
  const result = await db.transaction(async client => {
    const conversation = await client.query(
      `UPDATE reflection_conversations SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!conversation.rowCount) return conversation;
    await client.query(
      `UPDATE reflection_tasks SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
        finished_at = now(), updated_at = now()
       WHERE conversation_id = $1 AND user_id = $2 AND status IN ('pending', 'processing')`,
      [req.params.id, req.user.id]
    );
    return conversation;
  });
  if (!result.rowCount) return fail(res, 404, '回看对话不存在');
  return ok(res, { cancelled: true });
}));

router.post('/conversations/:id/retry', asyncRoute(async (req, res) => {
  const result = await db.transaction(async client => {
    const task = await client.query(
      `SELECT t.id FROM reflection_tasks t
       JOIN reflection_conversations c ON c.id = t.conversation_id
      WHERE t.conversation_id = $1 AND t.user_id = $2 AND t.status = 'failed'
        AND c.status = 'failed'
      ORDER BY t.created_at DESC LIMIT 1 FOR UPDATE OF t`,
      [req.params.id, req.user.id]
    );
    if (!task.rowCount) return task;
    await client.query(
      `UPDATE reflection_tasks SET status = 'pending', progress = 0, attempts = 0,
        available_at = now(), error_message = NULL, finished_at = NULL, updated_at = now()
       WHERE id = $1`,
      [task.rows[0].id]
    );
    await client.query(
      `UPDATE reflection_conversations SET status = 'processing', error_message = NULL, updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    return task;
  });
  if (!result.rowCount) return fail(res, 400, '这条对话当前不需要重试');
  return ok(res, { retried: true });
}));

router.delete('/conversations/:id', asyncRoute(async (req, res) => {
  const result = await db.query(
    'DELETE FROM reflection_conversations WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '回看对话不存在');
  return ok(res, null, '回看对话已删除');
}));

module.exports = router;
