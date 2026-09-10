'use strict';

const crypto = require('node:crypto');
const { embeddingProfile } = require('./embedding-provider');

async function ensureEmbeddingProfile(client) {
  const profile = embeddingProfile();
  if (!profile) return null;
  await client.query('UPDATE embedding_profiles SET active = false WHERE active AND id <> $1', [profile.id]);
  await client.query(
    `INSERT INTO embedding_profiles
      (id, provider, model, dimension, preprocessing_version, chunker_version, active)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (id) DO UPDATE SET
       provider = EXCLUDED.provider, model = EXCLUDED.model, dimension = EXCLUDED.dimension,
       preprocessing_version = EXCLUDED.preprocessing_version,
       chunker_version = EXCLUDED.chunker_version, active = true`,
    [profile.id, profile.provider, profile.model, profile.dimension,
      profile.preprocessingVersion, profile.chunkerVersion]
  );
  return profile;
}

async function enqueueDiaryIndex(client, diary) {
  const profile = await ensureEmbeddingProfile(client);
  const result = await client.query(
    `INSERT INTO diary_index_tasks
      (id, user_id, diary_id, source_version, index_epoch, embedding_profile_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     ON CONFLICT DO NOTHING RETURNING id`,
    [crypto.randomUUID(), diary.user_id, diary.id, diary.content_version, diary.index_epoch, profile?.id || null]
  );
  return result.rows[0]?.id || null;
}

async function bumpCorpusRevision(client, userId) {
  const result = await client.query(
    'UPDATE users SET corpus_revision = corpus_revision + 1, updated_at = now() WHERE id = $1 RETURNING corpus_revision',
    [userId]
  );
  await client.query('UPDATE reflection_analysis_cache SET valid = false WHERE user_id = $1 AND valid', [userId]);
  return Number(result.rows[0]?.corpus_revision || 0);
}

async function invalidateDiaryDerivatives(client, userId, diaryId, reason) {
  await client.query('DELETE FROM diary_chunks WHERE user_id = $1 AND diary_id = $2', [userId, diaryId]);
  await client.query('DELETE FROM diary_semantic_assessments WHERE user_id = $1 AND diary_id = $2', [userId, diaryId]);
  await client.query(
    `UPDATE diary_index_tasks SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
       error_code = $3::varchar, error_message = $3::text, finished_at = now(), updated_at = now()
     WHERE user_id = $1 AND diary_id = $2 AND status IN ('pending', 'processing')`,
    [userId, diaryId, reason]
  );
  await client.query(
    `UPDATE reflection_messages m SET
       content = '这条回答引用的日记已修改或不再允许 AI 读取，原回答已失效。',
       structured_result = '{}'::jsonb, citations = '[]'::jsonb, invalidated_at = now()
      FROM reflection_message_sources s
     WHERE s.message_id = m.id AND s.diary_id = $2 AND m.user_id = $1
       AND m.invalidated_at IS NULL`,
    [userId, diaryId]
  );
  await client.query(
    `UPDATE reflection_conversations c SET invalidated_at = now(), updated_at = now()
      WHERE c.user_id = $1 AND EXISTS (
        SELECT 1 FROM reflection_messages m
        JOIN reflection_message_sources s ON s.message_id = m.id
        WHERE m.conversation_id = c.id AND s.diary_id = $2
      )`,
    [userId, diaryId]
  );
}

async function adoptUnconfiguredTasks(client) {
  const profile = await ensureEmbeddingProfile(client);
  if (!profile) return 0;
  await client.query(
    `DELETE FROM diary_index_tasks pending
      WHERE pending.embedding_profile_id IS NULL
        AND EXISTS (
          SELECT 1 FROM diary_index_tasks configured
           WHERE configured.diary_id = pending.diary_id
             AND configured.source_version = pending.source_version
             AND configured.index_epoch = pending.index_epoch
             AND configured.embedding_profile_id = $1
        )`,
    [profile.id]
  );
  const result = await client.query(
    `UPDATE diary_index_tasks SET embedding_profile_id = $1, updated_at = now()
     WHERE embedding_profile_id IS NULL AND status IN ('pending', 'failed')`,
    [profile.id]
  );
  return result.rowCount;
}

module.exports = {
  adoptUnconfiguredTasks,
  bumpCorpusRevision,
  enqueueDiaryIndex,
  ensureEmbeddingProfile,
  invalidateDiaryDerivatives
};
