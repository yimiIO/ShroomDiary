'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const config = require('./config');
const db = require('./db');
const { chunkDiary } = require('./memory-chunker');
const { embedTexts, embeddingProfile, isEmbeddingConfigured, toPgVector } = require('./embedding-provider');
const { adoptUnconfiguredTasks, ensureEmbeddingProfile } = require('./memory-store');

const owner = os.hostname() + ':' + process.pid + ':' + crypto.randomBytes(4).toString('hex');
let timer = null;
let running = false;

async function enqueueBackfill(client, limit = 500) {
  const profile = await ensureEmbeddingProfile(client);
  if (!profile) return 0;
  const result = await client.query(
    `INSERT INTO diary_index_tasks
      (id, user_id, diary_id, source_version, index_epoch, embedding_profile_id, status)
     SELECT gen_random_uuid(), d.user_id, d.id, d.content_version, d.index_epoch, $1, 'pending'
       FROM diaries d
      WHERE d.deleted_at IS NULL AND d.ai_allowed
        AND NOT EXISTS (
          SELECT 1 FROM diary_index_tasks t
           WHERE t.diary_id = d.id AND t.source_version = d.content_version
             AND t.index_epoch = d.index_epoch AND t.embedding_profile_id = $1
             AND t.status IN ('pending', 'processing', 'completed')
        )
      ORDER BY d.occurred_at DESC
      LIMIT $2
     ON CONFLICT DO NOTHING`,
    [profile.id, limit]
  );
  return result.rowCount;
}

async function claimTask() {
  return db.transaction(async client => {
    await adoptUnconfiguredTasks(client);
    await enqueueBackfill(client, 100);
    const result = await client.query(
      `WITH candidate AS (
         SELECT id FROM diary_index_tasks
          WHERE (
            status = 'pending' AND available_at <= now()
          ) OR (
            status = 'processing' AND lease_expires_at < now()
          )
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
       UPDATE diary_index_tasks t SET status = 'processing', attempts = attempts + 1,
         lease_owner = $1, lease_expires_at = now() + interval '5 minutes',
         started_at = COALESCE(started_at, now()), updated_at = now()
       FROM candidate WHERE t.id = candidate.id
       RETURNING t.*`,
      [owner]
    );
    return result.rows[0] || null;
  });
}

async function cancelTask(task, code) {
  await db.query(
    `UPDATE diary_index_tasks SET status = 'cancelled', error_code = $2, error_message = $2,
       lease_owner = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
     WHERE id = $1 AND lease_owner = $3`,
    [task.id, code, owner]
  );
}

async function failTask(task, error) {
  const retry = task.attempts < 5 && error.retryable !== false;
  const seconds = Math.min(900, Math.pow(2, Math.max(0, task.attempts - 1)) * 10);
  await db.query(
    `UPDATE diary_index_tasks SET status = $2, available_at = now() + ($3 * interval '1 second'),
       lease_owner = NULL, lease_expires_at = NULL, error_code = $4, error_message = $5,
       finished_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END, updated_at = now()
     WHERE id = $1 AND lease_owner = $6`,
    [
      task.id, retry ? 'pending' : 'failed', seconds,
      String(error.code || 'SHROOM_EMBEDDING_FAILED').slice(0, 80),
      String(error.message || 'indexing failed').slice(0, 1000), owner
    ]
  );
}

async function loadCurrentDiary(task) {
  const result = await db.query(
    `SELECT id, user_id, content, content_version, index_epoch
       FROM diaries
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND ai_allowed
        AND content_version = $3 AND index_epoch = $4`,
    [task.diary_id, task.user_id, task.source_version, task.index_epoch]
  );
  return result.rows[0] || null;
}

async function publishChunks(task, chunks, vectors, profile) {
  return db.transaction(async client => {
    const current = await client.query(
      `SELECT id FROM diaries
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND ai_allowed
          AND content_version = $3 AND index_epoch = $4
        FOR UPDATE`,
      [task.diary_id, task.user_id, task.source_version, task.index_epoch]
    );
    if (!current.rowCount) {
      await client.query(
        `UPDATE diary_index_tasks SET status = 'cancelled', error_code = 'stale_version',
          error_message = 'stale_version', lease_owner = NULL, lease_expires_at = NULL,
          finished_at = now(), updated_at = now() WHERE id = $1 AND lease_owner = $2`,
        [task.id, owner]
      );
      return false;
    }
    await client.query('DELETE FROM diary_chunks WHERE diary_id = $1', [task.diary_id]);
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      await client.query(
        `INSERT INTO diary_chunks
          (id, user_id, diary_id, source_version, index_epoch, chunk_index,
           source_start, source_end, chunk_text, embedding, embedding_profile_id,
           chunker_version, embedding_input_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, $12, $13)`,
        [
          crypto.randomUUID(), task.user_id, task.diary_id, task.source_version, task.index_epoch,
          chunk.chunkIndex, chunk.sourceStart, chunk.sourceEnd, chunk.chunkText,
          toPgVector(vectors[index]), profile.id, profile.chunkerVersion, chunk.embeddingInputHash
        ]
      );
    }
    await client.query(
      `UPDATE diary_index_tasks SET status = 'completed', lease_owner = NULL,
        lease_expires_at = NULL, error_code = NULL, error_message = NULL,
        finished_at = now(), updated_at = now() WHERE id = $1 AND lease_owner = $2`,
      [task.id, owner]
    );
    return true;
  });
}

async function processOne() {
  if (!isEmbeddingConfigured()) return false;
  const task = await claimTask();
  if (!task) return false;
  try {
    const profile = embeddingProfile();
    if (!profile || task.embedding_profile_id !== profile.id) {
      await cancelTask(task, 'inactive_embedding_profile');
      return true;
    }
    const diary = await loadCurrentDiary(task);
    if (!diary) {
      await cancelTask(task, 'stale_or_forbidden');
      return true;
    }
    const chunks = chunkDiary(diary.content);
    const vectors = chunks.length ? await embedTexts(chunks.map(item => item.embeddingInput)) : [];
    await publishChunks(task, chunks, vectors, profile);
  } catch (error) {
    await failTask(task, error);
    console.error('memory index task failed', { taskId: task.id, code: error.code, message: error.message });
  }
  return true;
}

async function tick() {
  if (running || !config.memoryWorkerEnabled) return;
  running = true;
  try {
    for (let count = 0; count < 4; count += 1) {
      if (!await processOne()) break;
    }
  } catch (error) {
    console.error('memory worker tick failed', { code: error.code, message: error.message });
  } finally {
    running = false;
  }
}

function startMemoryWorker() {
  if (!config.memoryWorkerEnabled) return;
  timer = setInterval(tick, config.memoryWorkerIntervalMs);
  timer.unref();
  setImmediate(tick);
}

function stopMemoryWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  claimTask,
  enqueueBackfill,
  processOne,
  publishChunks,
  startMemoryWorker,
  stopMemoryWorker
};
