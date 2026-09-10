'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const config = require('./config');
const db = require('./db');
const { isAiConfigured } = require('./ai-engine');
const { embeddingProfile } = require('./embedding-provider');
const { retrieveMemories } = require('./memory-retrieval');
const { planQuestion } = require('./question-planner');
const { analyzeSemanticCensus } = require('./semantic-census');
const { resolveAnalysisPlan } = require('./theme-presets');
const {
  REFLECTION_PROMPT_VERSION,
  analyzeReflection,
  publicCitation,
  validateReflectionSources
} = require('./reflection-engine');

const owner = os.hostname() + ':' + process.pid + ':' + crypto.randomBytes(4).toString('hex');
let timer = null;
let running = false;

function cacheKey(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function claimTask() {
  return db.transaction(async client => {
    const result = await client.query(
      `WITH candidate AS (
         SELECT t.id FROM reflection_tasks t
         JOIN reflection_conversations c ON c.id = t.conversation_id AND c.user_id = t.user_id
          WHERE (
            t.status = 'pending' AND t.available_at <= now() AND c.status <> 'cancelled'
          ) OR (
            t.status = 'processing' AND t.lease_expires_at < now() AND c.status <> 'cancelled'
          )
          ORDER BY t.created_at
          FOR UPDATE OF t SKIP LOCKED
          LIMIT 1
       )
       UPDATE reflection_tasks t SET status = 'processing', progress = GREATEST(progress, 5),
         attempts = attempts + 1, lease_owner = $1,
         lease_expires_at = now() + interval '5 minutes',
         started_at = COALESCE(started_at, now()), updated_at = now()
       FROM candidate WHERE t.id = candidate.id
       RETURNING t.*`,
      [owner]
    );
    return result.rows[0] || null;
  });
}

async function progress(taskId, value) {
  await db.query(
    `UPDATE reflection_tasks SET progress = GREATEST(progress, $2), updated_at = now()
      WHERE id = $1 AND lease_owner = $3 AND status = 'processing'`,
    [taskId, value, owner]
  );
}

async function taskContext(task) {
  const result = await db.query(
    `SELECT c.id AS conversation_id, c.user_id, c.seed_diary_id, c.mode, c.scope,
            c.corpus_revision, m.content AS question, u.corpus_revision AS current_revision
       FROM reflection_conversations c
       JOIN reflection_messages m ON m.id = $2 AND m.conversation_id = c.id AND m.user_id = c.user_id
       JOIN users u ON u.id = c.user_id
      WHERE c.id = $1 AND c.user_id = $3 AND c.status <> 'cancelled'`,
    [task.conversation_id, task.user_message_id, task.user_id]
  );
  return result.rows[0] || null;
}

async function conversationContext(context, currentMessageId) {
  const [messages, feedback] = await Promise.all([
    db.query(
      `SELECT role, content, structured_result FROM reflection_messages
        WHERE conversation_id = $1 AND user_id = $2 AND id <> $3 AND invalidated_at IS NULL
        ORDER BY created_at DESC LIMIT 8`,
      [context.conversation_id, context.user_id, currentMessageId]
    ),
    db.query(
      `SELECT kind, target, note FROM reflection_feedback
        WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 20`,
      [context.conversation_id, context.user_id]
    )
  ]);
  return {
    history: messages.rows.reverse().map(item => ({
      role: item.role,
      content: item.content,
      context: item.role === 'assistant' && item.structured_result ? {
        analysisPlan: item.structured_result.analysisPlan || null,
        analysisStats: item.structured_result.analysisStats ? {
          criterion: item.structured_result.analysisStats.criterion,
          resultLabel: item.structured_result.analysisStats.resultLabel,
          matchedUnits: item.structured_result.analysisStats.matchedUnits,
          unit: item.structured_result.analysisStats.unit,
          rangeLabel: item.structured_result.analysisStats.rangeLabel
        } : null
      } : undefined
    })),
    feedback: feedback.rows.reverse()
  };
}

async function finishTask(task, context, result, key, sourceManifest = null) {
  return db.transaction(async client => {
    const active = await client.query(
      `SELECT t.id FROM reflection_tasks t
       JOIN reflection_conversations c ON c.id = t.conversation_id AND c.user_id = t.user_id
      WHERE t.id = $1 AND t.lease_owner = $2 AND t.status = 'processing'
        AND c.status <> 'cancelled' FOR UPDATE OF t, c`,
      [task.id, owner]
    );
    if (!active.rowCount) return false;
    const revision = await client.query('SELECT corpus_revision FROM users WHERE id = $1 FOR UPDATE', [context.user_id]);
    if (!revision.rowCount || Number(revision.rows[0].corpus_revision) !== Number(context.current_revision)) {
      throw Object.assign(new Error('分析期间日记发生变化，正在按新版本重试'), {
        code: 'SHROOM_CORPUS_CHANGED', retryable: true
      });
    }
    const messageId = crypto.randomUUID();
    const citations = result.sources.map(publicCitation);
    await client.query(
      `INSERT INTO reflection_messages
        (id, conversation_id, user_id, role, content, structured_result, citations,
         model_version, prompt_version)
       VALUES ($1, $2, $3, 'assistant', $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [
        messageId, context.conversation_id, context.user_id,
        result.summary || '在这次允许读取的范围里，还没有找到足够可靠的证据。',
        JSON.stringify(result), JSON.stringify(citations), config.aiModel, REFLECTION_PROMPT_VERSION
      ]
    );
    const dependencies = Array.isArray(sourceManifest) ? sourceManifest : result.sources.map(item => ({
      diaryId: item.diaryId, sourceVersion: item.sourceVersion
    }));
    for (const source of dependencies) {
      await client.query(
        `INSERT INTO reflection_message_sources (message_id, diary_id, source_version)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [messageId, source.diaryId, source.sourceVersion]
      );
    }
    await client.query(
      `UPDATE reflection_conversations SET title = $3, status = $4, coverage = $5::jsonb,
         corpus_revision = $6, error_message = NULL, updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [
        context.conversation_id, context.user_id, result.title, result.status,
        JSON.stringify(result.coverage), context.current_revision
      ]
    );
    await client.query(
      `UPDATE reflection_tasks SET status = 'completed', progress = 100, lease_owner = NULL,
        lease_expires_at = NULL, error_message = NULL, finished_at = now(), updated_at = now()
       WHERE id = $1 AND lease_owner = $2`,
      [task.id, owner]
    );
    await client.query(
      `INSERT INTO reflection_analysis_cache
        (id, user_id, cache_key, corpus_revision, embedding_profile_id,
         model_version, prompt_version, result, source_manifest)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
       ON CONFLICT (user_id, cache_key, corpus_revision, model_version, prompt_version)
       DO UPDATE SET result = EXCLUDED.result, source_manifest = EXCLUDED.source_manifest, valid = true`,
      [
        crypto.randomUUID(), context.user_id, key, context.current_revision,
        embeddingProfile()?.id || null, config.aiModel, REFLECTION_PROMPT_VERSION,
        JSON.stringify(result),
        JSON.stringify(dependencies)
      ]
    );
    return messageId;
  });
}

async function retryOrFail(task, error) {
  const retry = task.attempts < 3 && error.retryable !== false;
  const seconds = Math.min(120, Math.pow(2, Math.max(0, task.attempts - 1)) * 5);
  await db.transaction(async client => {
    const updated = await client.query(
      `UPDATE reflection_tasks SET status = $2, progress = CASE WHEN $2 = 'pending' THEN 5 ELSE progress END,
        available_at = now() + ($3 * interval '1 second'), lease_owner = NULL, lease_expires_at = NULL,
        error_message = $4, finished_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END,
        updated_at = now() WHERE id = $1 AND lease_owner = $5`,
      [task.id, retry ? 'pending' : 'failed', seconds, String(error.message || '分析失败').slice(0, 1000), owner]
    );
    if (!updated.rowCount) return;
    await client.query(
      `UPDATE reflection_conversations SET status = $3, error_message = $4, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status <> 'cancelled'`,
      [task.conversation_id, task.user_id, retry ? 'processing' : 'failed',
        retry ? '日记刚刚有变化，正在重新核对。' : '这次回看没有完成，可以稍后重试。']
    );
  });
}

async function processOne() {
  if (!isAiConfigured()) return false;
  const task = await claimTask();
  if (!task) return false;
  try {
    const context = await taskContext(task);
    if (!context) {
      await db.query(
        `UPDATE reflection_tasks SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
          finished_at = now(), updated_at = now() WHERE id = $1 AND lease_owner = $2`,
        [task.id, owner]
      );
      return true;
    }
    await progress(task.id, 18);
    const conversation = await conversationContext(context, task.user_message_id);
    const plan = await resolveAnalysisPlan({
      scope: context.scope,
      planner: () => planQuestion({
        question: context.question,
        selectedMode: context.mode,
        selectedScope: context.scope,
        seedDiaryId: context.seed_diary_id,
        history: conversation.history,
        usageContext: {
          userId: context.user_id,
          feature: 'reflection_planning',
          conversationId: context.conversation_id,
          taskId: task.id,
          diaryId: context.seed_diary_id
        }
      })
    });
    await progress(task.id, 28);
    const key = cacheKey({
      question: context.question,
      mode: context.mode,
      scope: context.scope,
      seedDiaryId: context.seed_diary_id,
      plan,
      history: conversation.history,
      feedback: conversation.feedback
    });
    const cached = await db.query(
      `SELECT result, source_manifest FROM reflection_analysis_cache
        WHERE user_id = $1 AND cache_key = $2 AND corpus_revision = $3
          AND model_version = $4 AND prompt_version = $5 AND valid
        ORDER BY created_at DESC LIMIT 1`,
      [context.user_id, key, context.current_revision, config.aiModel, REFLECTION_PROMPT_VERSION]
    );
    let result;
    let sourceManifest;
    if (cached.rowCount) {
      result = await validateReflectionSources(context.user_id, cached.rows[0].result);
      sourceManifest = cached.rows[0].source_manifest;
      await progress(task.id, 88);
    } else if (plan.strategy === 'semantic_census') {
      const analysis = await analyzeSemanticCensus({
        userId: context.user_id,
        question: context.question,
        plan,
        usageContext: {
          userId: context.user_id,
          feature: 'reflection_census',
          conversationId: context.conversation_id,
          taskId: task.id,
          diaryId: context.seed_diary_id
        },
        onProgress: async ({ completed, total }) => {
          await progress(task.id, 30 + Math.round((completed / Math.max(1, total)) * 54));
        }
      });
      result = await validateReflectionSources(context.user_id, analysis.result);
      sourceManifest = analysis.sourceManifest;
    } else {
      const retrieval = await retrieveMemories({
        userId: context.user_id,
        question: [context.question, plan.criterion].filter(Boolean).join('\n'),
        mode: plan.intent === 'timeline' ? 'timeline'
          : (['trend', 'compare'].includes(plan.intent) ? 'change' : context.mode),
        scope: plan.scope,
        seedDiaryId: context.seed_diary_id
      });
      await progress(task.id, 48);
      await progress(task.id, 62);
      result = await analyzeReflection({
        userId: context.user_id,
        question: context.question,
        mode: context.mode,
        retrieval,
        history: conversation.history,
        feedback: conversation.feedback,
        plan,
        usageContext: {
          userId: context.user_id,
          feature: 'reflection_answer',
          conversationId: context.conversation_id,
          taskId: task.id,
          diaryId: context.seed_diary_id
        }
      });
      sourceManifest = result.sources.map(item => ({ diaryId: item.diaryId, sourceVersion: item.sourceVersion }));
    }
    await progress(task.id, 88);
    await finishTask(task, context, result, key, sourceManifest);
  } catch (error) {
    await retryOrFail(task, error);
    console.error('reflection task failed', { taskId: task.id, code: error.code, message: error.message });
  }
  return true;
}

async function tick() {
  if (running || !config.memoryWorkerEnabled) return;
  running = true;
  try {
    for (let count = 0; count < 2; count += 1) {
      if (!await processOne()) break;
    }
  } catch (error) {
    console.error('reflection worker tick failed', { code: error.code, message: error.message });
  } finally {
    running = false;
  }
}

function startReflectionWorker() {
  if (!config.memoryWorkerEnabled) return;
  timer = setInterval(tick, config.memoryWorkerIntervalMs);
  timer.unref();
  setImmediate(tick);
}

function stopReflectionWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  cacheKey,
  claimTask,
  processOne,
  startReflectionWorker,
  stopReflectionWorker
};
