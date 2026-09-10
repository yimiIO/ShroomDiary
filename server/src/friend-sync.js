'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const config = require('./config');
const db = require('./db');
const { callJson, isAiConfigured } = require('./ai-engine');
const { ENTITY_PROMPT, VERSION } = require('./ai-prompts');
const { ruleChange } = require('./friend-rules');

const owner = os.hostname() + ':' + process.pid + ':' + crypto.randomBytes(4).toString('hex');
let timer = null;
let running = false;

function bounded(value, max) {
  return String(value || '').trim().slice(0, max);
}

function exactEvidence(content, value, max = 500) {
  const evidence = bounded(value, max);
  return evidence && content.includes(evidence) ? evidence : '';
}

function boundedScore(value) {
  return Math.max(-3, Math.min(10, Math.round(Number(value) || 0)));
}

function groundedPerson(content, person) {
  return [person.name, ...(Array.isArray(person.aliases) ? person.aliases : [])]
    .map(item => bounded(item, 120)).filter(Boolean).some(name => content.includes(name));
}

function normalizeExtraction(raw, content) {
  const source = String(content || '');
  const seen = new Set();
  const people = [];
  for (const value of Array.isArray(raw?.people) ? raw.people : []) {
    const name = bounded(value?.name, 120);
    if (!name || seen.has(name.toLocaleLowerCase()) || !groundedPerson(source, value || {})) continue;
    const signals = [];
    for (const signal of Array.isArray(value?.scoreSignals) ? value.scoreSignals.slice(0, 8) : []) {
      const ruleCode = bounded(signal?.ruleCode, 64);
      const evidence = exactEvidence(source, signal?.evidence, 500);
      if (!ruleCode || !evidence) continue;
      try {
        signals.push({ ruleCode, evidence, change: ruleChange(ruleCode, signal?.suggestedChange) });
      } catch (_) {
        // Unknown model-produced rules must never mutate a relationship score.
      }
    }
    const promiseTask = bounded(value?.promise?.task, 1000);
    const promiseEvidence = exactEvidence(source, value?.promise?.evidence || value?.promise?.task, 1000);
    people.push({
      name,
      aliases: [...new Set((Array.isArray(value?.aliases) ? value.aliases : [])
        .map(item => bounded(item, 120)).filter(Boolean))].slice(0, 12),
      likelyNew: Boolean(value?.likelyNew),
      interaction: {
        type: bounded(value?.interaction?.type, 48) || '互动',
        sentiment: ['positive', 'neutral', 'negative', 'bittersweet'].includes(value?.interaction?.sentiment)
          ? value.interaction.sentiment : 'neutral'
      },
      topic: bounded(value?.topic, 1000),
      notes: exactEvidence(source, value?.notes, 2000),
      scoreSignals: signals,
      promise: promiseTask && promiseEvidence ? {
        task: promiseTask,
        evidence: promiseEvidence,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value?.promise?.dueDate || ''))
          ? value.promise.dueDate : null
      } : null
    });
    seen.add(name.toLocaleLowerCase());
    if (people.length >= 20) break;
  }
  return { people };
}

function taskId(kind, task, friendId, suffix = '') {
  return `auto_${crypto.createHash('sha256')
    .update([kind, task.id, task.diary_id, friendId, suffix].join(':'))
    .digest('hex').slice(0, 42)}`;
}

async function enqueueFriendSync(client, diary, options = {}) {
  if (!diary?.ai_allowed) return null;
  const force = Boolean(options.force);
  const result = await client.query(
    `INSERT INTO diary_friend_sync
      (id, user_id, diary_id, source_version, engine_version, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (diary_id, source_version) DO UPDATE SET
       status = CASE
         WHEN $6::boolean THEN 'pending'
         WHEN diary_friend_sync.status = 'completed' THEN 'completed'
         ELSE 'pending'
       END,
       available_at = now(), error_message = NULL,
       lease_owner = CASE WHEN $6::boolean THEN NULL ELSE diary_friend_sync.lease_owner END,
       lease_expires_at = CASE WHEN $6::boolean THEN NULL ELSE diary_friend_sync.lease_expires_at END,
       finished_at = CASE WHEN $6::boolean THEN NULL ELSE diary_friend_sync.finished_at END,
       updated_at = now()
     RETURNING id`,
    [crypto.randomUUID(), diary.user_id, diary.id, diary.content_version, VERSION, force]
  );
  await client.query(
    `UPDATE diary_friend_sync SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
       finished_at = now(), updated_at = now()
     WHERE diary_id = $1 AND source_version <> $2 AND status IN ('pending', 'processing')`,
    [diary.id, diary.content_version]
  );
  return result.rows[0]?.id || null;
}

async function claimTask() {
  return db.transaction(async client => {
    const result = await client.query(
      `WITH candidate AS (
         SELECT id FROM diary_friend_sync
          WHERE (status = 'pending' AND available_at <= now())
             OR (status = 'processing' AND lease_expires_at < now())
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE diary_friend_sync t SET status = 'processing', attempts = attempts + 1,
         lease_owner = $1, lease_expires_at = now() + interval '5 minutes',
         started_at = COALESCE(started_at, now()), updated_at = now()
       FROM candidate WHERE t.id = candidate.id RETURNING t.*`,
      [owner]
    );
    return result.rows[0] || null;
  });
}

async function currentDiary(task) {
  const result = await db.query(
    `SELECT id, user_id, content, voice, content_version, occurred_at
       FROM diaries WHERE id = $1 AND user_id = $2 AND content_version = $3
        AND deleted_at IS NULL AND ai_allowed`,
    [task.diary_id, task.user_id, task.source_version]
  );
  return result.rows[0] || null;
}

function diaryText(diary) {
  const transcript = bounded(diary?.voice?.transcript, 5000);
  const content = bounded(diary?.content, 5000);
  if (!transcript || content.includes(transcript)) return content;
  return [content, `语音转写：${transcript}`].filter(Boolean).join('\n');
}

async function existingPeople(userId) {
  const result = await db.query(
    `SELECT id, name, relationship, tags FROM friends
      WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500`,
    [userId]
  );
  return result.rows.map(item => ({
    id: item.id,
    name: item.name,
    relationship: bounded(item.relationship, 300),
    aliases: Array.isArray(item.tags) ? item.tags.slice(0, 12) : []
  }));
}

async function reverseEffects(client, userId, diaryId, exceptTaskId = null) {
  const previous = await client.query(
    `SELECT id, applied_effects, finished_at FROM diary_friend_sync
      WHERE user_id = $1 AND diary_id = $2 AND ($3::uuid IS NULL OR id <> $3)
        AND status = 'completed' AND jsonb_array_length(applied_effects) > 0
      FOR UPDATE`,
    [userId, diaryId, exceptTaskId]
  );
  for (const task of previous.rows) {
    for (const effect of Array.isArray(task.applied_effects) ? task.applied_effects : []) {
      const interactionIds = Array.isArray(effect.interactionIds) ? effect.interactionIds : [];
      const scoreIds = Array.isArray(effect.scoreHistoryIds) ? effect.scoreHistoryIds : [];
      const todoIds = Array.isArray(effect.todoIds) ? effect.todoIds : [];
      if (interactionIds.length) {
        await client.query('DELETE FROM interactions WHERE user_id = $1 AND id = ANY($2::varchar[])', [userId, interactionIds]);
      }
      if (scoreIds.length) {
        await client.query('DELETE FROM score_histories WHERE user_id = $1 AND id = ANY($2::varchar[])', [userId, scoreIds]);
      }
      if (todoIds.length) {
        await client.query('DELETE FROM friend_todos WHERE user_id = $1 AND id = ANY($2::varchar[])', [userId, todoIds]);
      }
      let removedFriend = false;
      if (effect.friendId && effect.createdFriend && task.finished_at) {
        const removed = await client.query(
          `DELETE FROM friends f WHERE f.user_id = $1 AND f.id = $2
            AND f.updated_at <= $3::timestamptz + interval '1 second'
            AND NOT EXISTS (SELECT 1 FROM interactions i WHERE i.user_id = f.user_id AND i.friend_id = f.id)
            AND NOT EXISTS (SELECT 1 FROM score_histories s WHERE s.user_id = f.user_id AND s.friend_id = f.id)
            AND NOT EXISTS (SELECT 1 FROM friend_todos t WHERE t.user_id = f.user_id AND t.friend_id = f.id)
          RETURNING id`,
          [userId, effect.friendId, task.finished_at]
        );
        removedFriend = Boolean(removed.rowCount);
      }
      const delta = Number(effect.scoreDelta || 0);
      if (effect.friendId && delta && !removedFriend) {
        await client.query(
          `UPDATE friends SET relation_score = GREATEST(-3, LEAST(10, relation_score - $3)), updated_at = now()
            WHERE user_id = $1 AND id = $2`,
          [userId, effect.friendId, delta]
        );
      }
      if (effect.friendId && !removedFriend) {
        await client.query(
          `UPDATE friends SET last_interaction = (
             SELECT max(interaction_date) FROM interactions WHERE user_id = $1 AND friend_id = $2
           ), updated_at = now() WHERE user_id = $1 AND id = $2`,
          [userId, effect.friendId]
        );
      }
    }
    await client.query(
      `UPDATE diary_friend_sync SET applied_effects = '[]'::jsonb, friend_changes = '[]'::jsonb,
        updated_at = now() WHERE id = $1`,
      [task.id]
    );
  }
}

async function removeDiaryFriendEffects(client, userId, diaryId) {
  await client.query(
    `UPDATE diary_friend_sync SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
      finished_at = now(), updated_at = now()
     WHERE user_id = $1 AND diary_id = $2 AND status IN ('pending', 'processing')`,
    [userId, diaryId]
  );
  await reverseEffects(client, userId, diaryId);
}

async function applyExtraction(task, extraction) {
  return db.transaction(async client => {
    const diaryResult = await client.query(
      `SELECT id, occurred_at FROM diaries
        WHERE id = $1 AND user_id = $2 AND content_version = $3
          AND deleted_at IS NULL AND ai_allowed FOR UPDATE`,
      [task.diary_id, task.user_id, task.source_version]
    );
    if (!diaryResult.rowCount) {
      await client.query(
        `UPDATE diary_friend_sync SET status = 'cancelled', lease_owner = NULL,
          lease_expires_at = NULL, finished_at = now(), updated_at = now()
         WHERE id = $1 AND lease_owner = $2`,
        [task.id, owner]
      );
      return null;
    }

    await reverseEffects(client, task.user_id, task.diary_id, task.id);
    const eventDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(diaryResult.rows[0].occurred_at));
    const changes = [];
    const effects = [];

    for (const [personIndex, person] of extraction.people.entries()) {
      let friend = await client.query(
        `SELECT id, name, relation_score FROM friends
          WHERE user_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) FOR UPDATE`,
        [task.user_id, person.name]
      );
      let newFriend = false;
      if (!friend.rowCount) {
        friend = await client.query(
          `INSERT INTO friends (id, user_id, name, category, relation_score, last_interaction)
           VALUES ($1, $2, $3, '朋友', 4, $4) RETURNING id, name, relation_score`,
          [crypto.randomUUID(), task.user_id, person.name, eventDate]
        );
        newFriend = true;
      }
      const row = friend.rows[0];
      const interactionId = taskId('interaction', task, row.id, personIndex);
      await client.query(
        `INSERT INTO interactions
          (id, user_id, friend_id, interaction_date, interaction_type, topic, sentiment, notes, follow_up, diary_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, id) DO UPDATE SET interaction_date = EXCLUDED.interaction_date,
           interaction_type = EXCLUDED.interaction_type, topic = EXCLUDED.topic,
           sentiment = EXCLUDED.sentiment, notes = EXCLUDED.notes,
           follow_up = EXCLUDED.follow_up, diary_id = EXCLUDED.diary_id`,
        [interactionId, task.user_id, row.id, eventDate, person.interaction.type, person.topic,
          person.interaction.sentiment, person.notes, person.promise?.task || '', task.diary_id]
      );

      let score = Number(row.relation_score);
      let scoreDelta = 0;
      const scoreHistoryIds = [];
      for (const [signalIndex, signal] of person.scoreSignals.entries()) {
        const nextScore = boundedScore(score + signal.change);
        const effectiveChange = nextScore - score;
        if (!effectiveChange) continue;
        const scoreId = taskId('score', task, row.id, `${signalIndex}:${signal.ruleCode}`);
        await client.query(
          `INSERT INTO score_histories
            (id, user_id, friend_id, score_date, change, reason, rule_code, diary_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [scoreId, task.user_id, row.id, eventDate, effectiveChange,
            `${signal.evidence}（${signal.ruleCode}）`, signal.ruleCode, task.diary_id]
        );
        score = nextScore;
        scoreDelta += effectiveChange;
        scoreHistoryIds.push(scoreId);
      }

      const todoIds = [];
      if (person.promise) {
        const todoId = taskId('promise', task, row.id, personIndex);
        await client.query(
          `INSERT INTO friend_todos (id, user_id, friend_id, task, due_date, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [todoId, task.user_id, row.id, person.promise.task, person.promise.dueDate]
        );
        todoIds.push(todoId);
      }

      await client.query(
        `UPDATE friends SET relation_score = $3,
          last_interaction = GREATEST(COALESCE(last_interaction, $4::date), $4::date), updated_at = now()
         WHERE user_id = $1 AND id = $2`,
        [task.user_id, row.id, score, eventDate]
      );
      changes.push({
        friendId: row.id,
        name: row.name,
        newFriend,
        event: person.topic || person.interaction.type,
        delta: scoreDelta,
        score,
        ruleCodes: person.scoreSignals.map(item => item.ruleCode),
        promiseCreated: Boolean(person.promise)
      });
      effects.push({
        friendId: row.id,
        createdFriend: newFriend,
        interactionIds: [interactionId],
        scoreHistoryIds,
        todoIds,
        scoreDelta
      });
    }

    const updated = await client.query(
      `UPDATE diary_friend_sync SET status = 'completed', extracted_people = $3::jsonb,
        friend_changes = $4::jsonb, applied_effects = $5::jsonb, error_message = NULL,
        lease_owner = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
       WHERE id = $1 AND lease_owner = $2 RETURNING id`,
      [task.id, owner, JSON.stringify(extraction.people), JSON.stringify(changes), JSON.stringify(effects)]
    );
    if (!updated.rowCount) throw Object.assign(new Error('人脉任务租约已经失效'), { retryable: true });
    await client.query(
      `UPDATE diary_analysis SET friend_changes = $3::jsonb, updated_at = now()
        WHERE user_id = $1 AND diary_id = $2`,
      [task.user_id, task.diary_id, JSON.stringify(changes)]
    );
    return changes;
  });
}

async function failTask(task, error) {
  const retry = task.attempts < 3 && error.retryable !== false;
  const seconds = Math.min(120, Math.pow(2, Math.max(0, task.attempts - 1)) * 8);
  await db.query(
    `UPDATE diary_friend_sync SET status = $2::varchar, available_at = now() + ($3 * interval '1 second'),
      lease_owner = NULL, lease_expires_at = NULL, error_message = $4,
      finished_at = CASE WHEN $2::text = 'failed' THEN now() ELSE NULL END, updated_at = now()
     WHERE id = $1 AND lease_owner = $5`,
    [task.id, retry ? 'pending' : 'failed', seconds, bounded(error?.message || '人脉整理失败', 1000), owner]
  );
}

async function processOne() {
  if (!isAiConfigured()) return false;
  const task = await claimTask();
  if (!task) return false;
  try {
    const diary = await currentDiary(task);
    if (!diary) {
      await db.query(
        `UPDATE diary_friend_sync SET status = 'cancelled', lease_owner = NULL,
          lease_expires_at = NULL, finished_at = now(), updated_at = now()
         WHERE id = $1 AND lease_owner = $2`,
        [task.id, owner]
      );
      return true;
    }
    const content = diaryText(diary);
    if (!content) {
      await applyExtraction(task, { people: [] });
      return true;
    }
    const knownPeople = await existingPeople(task.user_id);
    const raw = await callJson(ENTITY_PROMPT, {
      diary: { content, recordedAt: diary.occurred_at },
      existingPeople: knownPeople
    }, '日记人脉整理', {
      maxTokens: 3000,
      temperature: 0,
      usageContext: {
        userId: task.user_id,
        feature: 'friend_sync',
        diaryId: task.diary_id,
        taskId: task.id
      }
    });
    await applyExtraction(task, normalizeExtraction(raw, content));
  } catch (error) {
    try {
      await failTask(task, error);
    } catch (recoveryError) {
      console.error('friend sync task recovery failed', {
        taskId: task.id,
        taskCode: error.code,
        taskMessage: error.message,
        recoveryCode: recoveryError.code,
        recoveryMessage: recoveryError.message
      });
      throw recoveryError;
    }
    console.error('friend sync task failed', { taskId: task.id, code: error.code, message: error.message });
  }
  return true;
}

async function tick() {
  if (running || !config.friendSyncWorkerEnabled) return;
  running = true;
  try {
    for (let count = 0; count < 2; count += 1) {
      if (!await processOne()) break;
    }
  } catch (error) {
    console.error('friend sync worker tick failed', { code: error.code, message: error.message });
  } finally {
    running = false;
  }
}

function startFriendSyncWorker() {
  if (!config.friendSyncWorkerEnabled) return;
  timer = setInterval(tick, config.friendSyncWorkerIntervalMs);
  timer.unref();
  setImmediate(tick);
}

function stopFriendSyncWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  applyExtraction,
  enqueueFriendSync,
  normalizeExtraction,
  processOne,
  removeDiaryFriendEffects,
  startFriendSyncWorker,
  stopFriendSyncWorker
};
