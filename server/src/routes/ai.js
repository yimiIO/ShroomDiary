'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const config = require('../config');
const { callJson, isAiConfigured } = require('../ai-engine');
const { usageSummary } = require('../ai-usage');
const { normalizeCardSuggestion } = require('../card-suggestions');
const { listDiaryCandidates, normalizeInquiryCandidates, syncDiaryCandidates } = require('../inquiry-candidates');
const {
  ensureDefaultLifeOsItems,
  listDiaryLifeOsLinks,
  normalizeLifeOsLinks,
  syncDiaryLifeOsLinks
} = require('../life-os-long-term');
const { ENTITY_PROMPT, FOLLOWUP_PROMPT, VERSION, VIEW_PROMPTS } = require('../ai-prompts');
const { asyncRoute, fail, ok, requireUser, text } = require('../http');
const { activeObserverSnapshot, listObservers } = require('../observer-store');
const { publicObserver, resolvedObserver } = require('../observer-presets');
const { findDiaryWellbeingRecord, syncDiaryWellbeingRecord } = require('../wellbeing-records');
const { hasDiaryHealthExtraction, legacyHealthObservation, normalizeDiaryHealthExtraction } = require('../diary-health');
const { WELLBEING_REVIEW_VERSION, reviewDiaryWellbeing } = require('../wellbeing-review');
const { listDiarySourceActivities } = require('../data-sources');

const router = express.Router();
router.use(requireUser);

function mapAnalysis(row) {
  const snapshot = Array.isArray(row.observer_snapshot) ? row.observer_snapshot.map(publicObserver) : [];
  let observations = Array.isArray(row.observations) ? row.observations : [];
  if (!observations.length && row.five_views && Object.keys(row.five_views).length) {
    observations = Object.values(row.five_views).map((result, index) => ({
      observer: {
        id: `legacy-${index + 1}`,
        name: result.name || `观察席 ${index + 1}`,
        shortName: result.name || `观察 ${index + 1}`,
        renderType: ['first_principles', 'entropy', 'compound', 'life_os', 'biological'][index] || 'custom',
        isSystem: true,
        enabled: true,
        sortOrder: (index + 1) * 10
      },
      result
    }));
  }
  return {
    taskId: row.id,
    diaryId: row.diary_id,
    engineVersion: row.engine_version,
    status: row.status,
    views: row.five_views || {},
    observers: snapshot,
    observations,
    sourceActivities: Array.isArray(row.source_activities) ? row.source_activities : [],
    todoCandidates: row.todo_candidates || [],
    cardSuggestion: row.card_suggestion && Object.keys(row.card_suggestion).length ? row.card_suggestion : null,
    friendChanges: row.friend_changes || [],
    costSummary: row.cost_summary && Object.keys(row.cost_summary).length ? row.cost_summary : null,
    error: row.error_message || null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function mapAnalysisWithCandidates(row, userId, queryable = db) {
  const analysis = mapAnalysis(row);
  const [inquiryCandidates, lifeOsLinks, wellbeingRecord] = row.status === 'done'
    ? await Promise.all([
      listDiaryCandidates(queryable, userId, row.diary_id),
      listDiaryLifeOsLinks(queryable, userId, row.diary_id),
      findDiaryWellbeingRecord(queryable, userId, row.diary_id)
    ])
    : [[], [], null];
  analysis.inquiryCandidates = inquiryCandidates;
  analysis.wellbeingRecord = wellbeingRecord;
  analysis.lifeOsLinks = lifeOsLinks;
  analysis.compoundLinks = lifeOsLinks;
  return analysis;
}

const analysisFields = `id, diary_id, engine_version, five_views, observer_snapshot, observations,
  source_activities, todo_candidates, card_suggestion, friend_changes, cost_summary, status, error_message,
  started_at, finished_at, created_at, updated_at`;

async function ownedDiary(userId, diaryId) {
  const result = await db.query(
    `SELECT id, content, mood, linked_cards, occurred_at, content_version,
            to_char(occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS diary_date
       FROM diaries
      WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL AND ai_allowed`,
    [userId, diaryId]
  );
  return result.rows[0] || null;
}

async function cardHistory(userId, linkedCards) {
  const linked = new Set((Array.isArray(linkedCards) ? linkedCards : []).map(String));
  const result = await db.query(
    `SELECT id, seed_sentence, my_understanding, tags
       FROM cards WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 80`,
    [userId]
  );
  return result.rows.filter(card => !linked.has(String(card.id))).map(card => ({
    id: card.id,
    seedSentence: card.seed_sentence,
    myUnderstanding: text(card.my_understanding, 600),
    tags: Array.isArray(card.tags) ? card.tags.slice(0, 10) : []
  }));
}

async function lifeOs(userId) {
  const result = await db.query('SELECT content_md FROM life_os WHERE user_id = $1', [userId]);
  return result.rows[0]?.content_md || '';
}

async function currentInquiries(userId) {
  const result = await db.query(
    `SELECT id, question, context, status, inquiry_type AS "inquiryType" FROM inquiries
      WHERE user_id = $1 AND status IN ('OPEN', 'PAUSED')
      ORDER BY updated_at DESC LIMIT 50`,
    [userId]
  );
  return result.rows.map(row => ({
    id: row.id,
    question: row.question,
    context: text(row.context, 800),
    status: row.status,
    inquiryType: row.inquiryType
  }));
}

async function latestFriendChanges(userId, diaryId) {
  const result = await db.query(
    `SELECT friend_changes FROM diary_friend_sync
      WHERE user_id = $1 AND diary_id = $2 AND status = 'completed'
      ORDER BY source_version DESC, updated_at DESC LIMIT 1`,
    [userId, diaryId]
  );
  return Array.isArray(result.rows[0]?.friend_changes) ? result.rows[0].friend_changes : [];
}

function viewInput(diary, os, observer, sourceActivities = []) {
  const payload = {
    diary: { content: diary.content, mood: diary.mood, occurredAt: diary.occurred_at },
    sourceActivities
  };
  if (['compound', 'life_os'].includes(observer.renderType)) payload.lifeOs = os || '';
  return payload;
}

async function appendDiaryCards(client, diaryId, userId, cardIds) {
  const result = await client.query(
    'SELECT linked_cards FROM diaries WHERE id = $1 AND user_id = $2 FOR UPDATE',
    [diaryId, userId]
  );
  if (!result.rowCount) return false;
  const current = Array.isArray(result.rows[0].linked_cards) ? result.rows[0].linked_cards.map(String) : [];
  const linkedCards = [...new Set([...current, ...cardIds.map(String)])].slice(0, 30);
  await client.query(
    'UPDATE diaries SET linked_cards = $3::jsonb, updated_at = now() WHERE id = $1 AND user_id = $2',
    [diaryId, userId, JSON.stringify(linkedCards)]
  );
  return true;
}

function storedCardSuggestion(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function executeAnalysis(userId, analysisId, diaryId) {
  await db.query(
    `UPDATE diary_analysis SET status = 'running', error_message = NULL, started_at = now(),
       finished_at = NULL, updated_at = now() WHERE id = $1 AND user_id = $2`,
    [analysisId, userId]
  );
  try {
    await ensureDefaultLifeOsItems(db, userId);
    const diary = await ownedDiary(userId, diaryId);
    if (!diary) throw Object.assign(new Error('日记不存在'), { code: 'SHROOM_AI_INPUT' });
    const [os, cards, stored, existingInquiries, lifeOsItemsResult, sourceActivities] = await Promise.all([
      lifeOs(userId),
      cardHistory(userId, diary.linked_cards),
      db.query('SELECT observer_snapshot FROM diary_analysis WHERE id = $1 AND user_id = $2', [analysisId, userId]),
      currentInquiries(userId),
      db.query(
        `SELECT id, stable_key AS "stableKey", section, name, minimum_action AS "minimumAction",
                current_next_step AS "currentNextStep", status
           FROM life_os_items WHERE user_id = $1 ORDER BY priority, original_number`,
        [userId]
      ),
      listDiarySourceActivities(db, userId, diary.diary_date, { aiOnly: true })
    ]);
    let observers = Array.isArray(stored.rows[0]?.observer_snapshot) ? stored.rows[0].observer_snapshot : [];
    if (!observers.length) observers = await activeObserverSnapshot(userId);
    if (!observers.length) throw Object.assign(new Error('请至少启用一个观察席'), { code: 'SHROOM_AI_INPUT' });
    const observations = await Promise.all(observers.map(async observer => {
      if (observer.requiresLifeOs && !os) {
        return { observer: publicObserver(observer), result: { name: observer.name, disabled: true, message: '未配置人生 OS' } };
      }
      const result = await callJson(
        observer.prompt,
        viewInput(diary, os, observer, sourceActivities),
        observer.name,
        {
          usageContext: {
            userId,
            feature: 'diary_observer',
            diaryId,
            analysisId,
            observerId: observer.id
          }
        }
      );
      return { observer: publicObserver(observer), result };
    }));
    const presetIndexes = { first_principles: 1, entropy: 2, compound: 3, life_os: 4, biological: 5 };
    const fiveViews = {};
    for (const observation of observations) {
      const view = presetIndexes[observation.observer.presetKey];
      if (view) fiveViews[`v${view}`] = { ...observation.result, view };
    }
    const followup = await callJson(FOLLOWUP_PROMPT, {
      diary: viewInput(diary, os, observers[0], sourceActivities).diary,
      sourceActivities,
      fiveViews,
      observations,
      existingCards: cards,
      existingInquiries,
      compoundDirections: lifeOsItemsResult.rows
    }, '行动与菇卡整理', {
      usageContext: { userId, feature: 'diary_observation_followup', diaryId, analysisId }
    });
    const rawCandidates = followup.todoCandidates || followup.candidates;
    const candidates = Array.isArray(rawCandidates) ? rawCandidates.slice(0, 30) : [];
    const cardSuggestion = normalizeCardSuggestion(followup.cardSuggestion, cards);
    const inquiryCandidates = normalizeInquiryCandidates(
      followup.inquiryCandidates,
      existingInquiries
    );
    const healthExtraction = normalizeDiaryHealthExtraction(
      followup.healthExtraction || followup.health_extraction || {},
      { diaryContent: diary.content }
    );
    const firstWellbeingCandidate = (hasDiaryHealthExtraction(healthExtraction) ? {
      extraction: healthExtraction,
      observation: legacyHealthObservation(healthExtraction)
    } : null) || followup.wellbeingObservation || followup.wellbeingRecord
      || null;
    let wellbeingReviewCompleted = false;
    let wellbeingCandidate;
    try {
      const feedback = await db.query(
        `SELECT source_excerpt AS "sourceExcerpt", feedback_reason AS reason
           FROM wellbeing_records
          WHERE user_id = $1 AND status = 'DISMISSED' AND feedback_reason IS NOT NULL
          ORDER BY updated_at DESC LIMIT 12`,
        [userId]
      );
      wellbeingCandidate = await reviewDiaryWellbeing(callJson, {
        diary,
        firstCandidate: firstWellbeingCandidate,
        userFeedback: feedback.rows,
        usageContext: { userId, feature: 'diary_wellbeing_review', diaryId, analysisId }
      });
      wellbeingReviewCompleted = true;
    } catch (error) {
      console.error('wellbeing value review failed', error);
    }
    const lifeOsLinks = normalizeLifeOsLinks(followup.compoundLinks || followup.lifeOsLinks, lifeOsItemsResult.rows, diary.content);
    const friendChanges = await latestFriendChanges(userId, diaryId);
    const costSummary = await usageSummary(userId, { analysisId });
    return db.transaction(async client => {
      const result = await client.query(
        `UPDATE diary_analysis SET status = 'done', five_views = $3::jsonb, observations = $4::jsonb,
           todo_candidates = $5::jsonb, card_suggestion = $6::jsonb, friend_changes = $7::jsonb,
           cost_summary = $8::jsonb, source_activities = $9::jsonb,
           finished_at = now(), updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING ${analysisFields}`,
        [analysisId, userId, JSON.stringify(fiveViews), JSON.stringify(observations), JSON.stringify(candidates),
          JSON.stringify(cardSuggestion), JSON.stringify(friendChanges), JSON.stringify(costSummary),
          JSON.stringify(sourceActivities)]
      );
      await syncDiaryCandidates(client, {
        userId,
        diaryId,
        modelVersion: VERSION,
        candidates: inquiryCandidates
      });
      if (wellbeingReviewCompleted) {
        await syncDiaryWellbeingRecord(client, {
          userId,
          diary,
          modelVersion: `${VERSION}:${WELLBEING_REVIEW_VERSION}`,
          candidate: wellbeingCandidate
        });
      }
      await syncDiaryLifeOsLinks(client, {
        userId,
        diary,
        analysisId,
        items: lifeOsItemsResult.rows,
        links: lifeOsLinks
      });
      return mapAnalysisWithCandidates(result.rows[0], userId, client);
    });
  } catch (error) {
    const costSummary = await usageSummary(userId, { analysisId }).catch(() => null);
    await db.query(
      `UPDATE diary_analysis SET status = 'failed', error_message = $3,
         cost_summary = COALESCE($4::jsonb, cost_summary), finished_at = now(), updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [analysisId, userId, text(error.message, 1000) || '分析失败', costSummary ? JSON.stringify(costSummary) : null]
    );
    throw error;
  }
}

async function startAnalysis(req, res) {
  if (!isAiConfigured()) return fail(res, 503, '观察席 AI 尚未配置；日记不会发送给第三方模型');
  const diaryId = text(req.body.diaryId, 64);
  const diary = await ownedDiary(req.user.id, diaryId);
  if (!diary) return fail(res, 404, '日记不存在');
  const observers = await activeObserverSnapshot(req.user.id);
  if (!observers.length) return fail(res, 400, '请至少启用一个观察席');
  const taskId = crypto.randomUUID();
  const result = await db.query(
    `INSERT INTO diary_analysis
      (id, user_id, diary_id, engine_version, status, five_views, observer_snapshot, observations,
       todo_candidates, card_suggestion, friend_changes, cost_summary, source_activities)
     VALUES ($1, $2, $3, $4, 'pending', '{}'::jsonb, $5::jsonb, '[]'::jsonb,
       '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb)
     ON CONFLICT (user_id, diary_id) DO UPDATE SET
       id = EXCLUDED.id, engine_version = EXCLUDED.engine_version, status = 'pending',
       five_views = '{}'::jsonb, observer_snapshot = EXCLUDED.observer_snapshot, observations = '[]'::jsonb,
       todo_candidates = '[]'::jsonb, card_suggestion = '{}'::jsonb, cost_summary = '{}'::jsonb,
       source_activities = '[]'::jsonb,
       error_message = NULL, started_at = NULL, finished_at = NULL, updated_at = now()
     RETURNING ${analysisFields}`,
    [taskId, req.user.id, diary.id, VERSION, JSON.stringify(observers)]
  );
  if (req.body.sync === true) {
    try {
      const completed = await executeAnalysis(req.user.id, result.rows[0].id, diary.id);
      return ok(res, completed, '观察席分析完成');
    } catch (error) {
      return fail(res, 503, error.message || '观察席分析失败');
    }
  }
  setImmediate(() => executeAnalysis(req.user.id, result.rows[0].id, diary.id)
    .catch(error => console.error('background diary analysis failed', { analysisId: result.rows[0].id, message: error.message })));
  return ok(res, await mapAnalysisWithCandidates(result.rows[0], req.user.id), '分析任务已创建');
}

router.get('/status', asyncRoute(async (req, res) => ok(res, {
  enabled: isAiConfigured(),
  model: isAiConfigured() ? config.aiModel : null,
  engineVersion: VERSION,
  privacy: '只有用户主动发起分析时，日记正文、自己的菇卡摘要和当天已授权的数据源线索才会发送给已配置的模型服务。'
})));

router.get('/observers', asyncRoute(async (req, res) => {
  return ok(res, await listObservers(req.user.id));
}));

router.post('/observers', asyncRoute(async (req, res) => {
  const name = text(req.body.name, 80);
  const description = text(req.body.description, 300);
  const prompt = text(req.body.instructions || req.body.prompt, 3000);
  if (!name) return fail(res, 400, '请给观察席一个名字');
  if (!prompt) return fail(res, 400, '请写下这个观察席要如何观察日记');
  await listObservers(req.user.id);
  const count = await db.query('SELECT count(*)::int AS count FROM ai_observers WHERE user_id = $1', [req.user.id]);
  if (count.rows[0].count >= 20) return fail(res, 400, '每个账号最多保留 20 个观察席');
  const order = await db.query('SELECT COALESCE(max(sort_order), 0) + 10 AS value FROM ai_observers WHERE user_id = $1', [req.user.id]);
  const result = await db.query(
    `INSERT INTO ai_observers
      (id, user_id, name, description, prompt, render_type, is_system, enabled, sort_order)
     VALUES ($1, $2, $3, $4, $5, 'custom', false, true, $6) RETURNING *`,
    [crypto.randomUUID(), req.user.id, name, description, prompt, Number(order.rows[0].value)]
  );
  return ok(res, publicObserver(resolvedObserver(result.rows[0])), '观察席已创建');
}));

router.patch('/observers/:id', asyncRoute(async (req, res) => {
  const current = await db.query('SELECT * FROM ai_observers WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!current.rowCount) return fail(res, 404, '观察席不存在');
  const row = current.rows[0];
  const enabled = typeof req.body.enabled === 'boolean' ? req.body.enabled : row.enabled;
  let name = row.name;
  let description = row.description;
  let prompt = row.prompt;
  if (!row.is_system) {
    name = text(req.body.name, 80) || row.name;
    description = req.body.description === undefined ? row.description : text(req.body.description, 300);
    prompt = req.body.instructions === undefined && req.body.prompt === undefined
      ? row.prompt : text(req.body.instructions || req.body.prompt, 3000);
    if (!prompt) return fail(res, 400, '观察说明不能为空');
  }
  const result = await db.query(
    `UPDATE ai_observers SET name = $3, description = $4, prompt = $5, enabled = $6, updated_at = now()
      WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.user.id, name, description, prompt, enabled]
  );
  return ok(res, publicObserver(resolvedObserver(result.rows[0])), enabled ? '观察席已启用' : '观察席已暂停');
}));

router.delete('/observers/:id', asyncRoute(async (req, res) => {
  const result = await db.query(
    `DELETE FROM ai_observers WHERE id = $1 AND user_id = $2 AND is_system = false RETURNING id`,
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) return fail(res, 400, '默认观察席不能删除，只能暂停');
  return ok(res, { id: result.rows[0].id }, '观察席已删除');
}));

router.post('/analyze', asyncRoute(startAnalysis));

router.get('/analysis', asyncRoute(async (req, res) => {
  const diaryId = text(req.query.diaryId, 64);
  const result = await db.query(
    `SELECT ${analysisFields} FROM diary_analysis WHERE user_id = $1 AND diary_id = $2`,
    [req.user.id, diaryId]
  );
  return ok(res, result.rowCount ? await mapAnalysisWithCandidates(result.rows[0], req.user.id) : null);
}));

router.get('/diary-flow/:taskId', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT ${analysisFields} FROM diary_analysis WHERE user_id = $1 AND id = $2`,
    [req.user.id, req.params.taskId]
  );
  if (!result.rowCount) return fail(res, 404, '分析任务不存在');
  return ok(res, await mapAnalysisWithCandidates(result.rows[0], req.user.id));
}));

router.post('/diary-flow/:taskId/todos', asyncRoute(async (req, res) => {
  const indexes = [...new Set((Array.isArray(req.body.indexes) ? req.body.indexes : [])
    .map(Number).filter(value => Number.isInteger(value) && value >= 0 && value < 30))];
  if (!indexes.length) return fail(res, 400, '请至少选择一项待办');
  const created = await db.transaction(async client => {
    const analysisResult = await client.query(
      `SELECT id, diary_id, todo_candidates FROM diary_analysis
       WHERE id = $1 AND user_id = $2 AND status = 'done' FOR UPDATE`,
      [req.params.taskId, req.user.id]
    );
    if (!analysisResult.rowCount) return null;
    const candidates = Array.isArray(analysisResult.rows[0].todo_candidates)
      ? analysisResult.rows[0].todo_candidates : [];
    const items = [];
    for (const index of indexes) {
      const candidate = candidates[index];
      if (!candidate || candidate.createdTodoId) continue;
      const title = text(candidate.title, 500);
      if (!title) continue;
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.dueDate || '')) ? candidate.dueDate : null;
      const tags = Array.isArray(candidate.tags)
        ? candidate.tags.slice(0, 20).map(item => text(item, 80)).filter(Boolean) : [];
      const todoId = crypto.randomUUID();
      await client.query(
        `INSERT INTO todos
          (id, user_id, content, description, deadline, tags, status,
           source_type, source_ref_id, source_diary_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending', 'DIARY_AI', $7, $8)`,
        [todoId, req.user.id, title, text(candidate.source, 2000), dueDate,
          JSON.stringify(tags), analysisResult.rows[0].id, analysisResult.rows[0].diary_id]
      );
      await client.query(
        `INSERT INTO todo_events
          (id, user_id, todo_id, event_type, payload, source_diary_id, idempotency_key)
         VALUES ($1,$2,$3,'CREATED',$4::jsonb,$5,$6),
                ($7,$2,$3,'DIARY_LINKED',$8::jsonb,$5,$9)
         ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [crypto.randomUUID(), req.user.id, todoId, JSON.stringify({ source: 'DIARY_AI' }),
          analysisResult.rows[0].diary_id, `analysis:${analysisResult.rows[0].id}:todo:${index}:create`,
          crypto.randomUUID(), JSON.stringify({ relation: 'SOURCE' }),
          `analysis:${analysisResult.rows[0].id}:todo:${index}:diary-link`]
      );
      const friendId = text(candidate.friendId, 96);
      if (friendId) {
        await client.query(
          `INSERT INTO friend_todos (id, user_id, friend_id, task, due_date, status, global_todo_id)
           SELECT $1, $2, id, $4, $5, 'created', $6 FROM friends
           WHERE user_id = $2 AND id = $3 AND deleted_at IS NULL`,
          [crypto.randomUUID(), req.user.id, friendId, title, dueDate, todoId]
        );
      }
      candidates[index] = { ...candidate, createdTodoId: todoId, status: 'created' };
      items.push({ index, todoId, title });
    }
    await client.query(
      'UPDATE diary_analysis SET todo_candidates = $3::jsonb, updated_at = now() WHERE id = $1 AND user_id = $2',
      [req.params.taskId, req.user.id, JSON.stringify(candidates)]
    );
    return { items, todoCandidates: candidates };
  });
  if (!created) return fail(res, 404, '已完成的分析任务不存在');
  return ok(res, created, created.items.length ? '待办已创建' : '所选待办已经创建过');
}));

router.post('/diary-flow/:taskId/cards/create', asyncRoute(async (req, res) => {
  const created = await db.transaction(async client => {
    const analysisResult = await client.query(
      `SELECT id, diary_id, card_suggestion FROM diary_analysis
       WHERE id = $1 AND user_id = $2 AND status = 'done' FOR UPDATE`,
      [req.params.taskId, req.user.id]
    );
    if (!analysisResult.rowCount) return { error: 'analysis' };
    const analysis = analysisResult.rows[0];
    const suggestion = storedCardSuggestion(analysis.card_suggestion);
    if (!suggestion.shouldCreate || !suggestion.newCard || !text(suggestion.newCard.seedSentence, 500)) {
      return { error: 'suggestion' };
    }

    let cardResult = await client.query(
      'SELECT id FROM cards WHERE user_id = $1 AND source_diary_id = $2',
      [req.user.id, analysis.diary_id]
    );
    let cardId = cardResult.rows[0]?.id;
    if (!cardId) {
      cardId = crypto.randomUUID();
      const card = suggestion.newCard;
      await client.query(
        `INSERT INTO cards
          (id, user_id, seed_sentence, my_understanding, usage_items, tags, visibility,
           source_diary_id, source_analysis_id)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'PRIVATE', $7, $8)`,
        [
          cardId, req.user.id, text(card.seedSentence, 500), text(card.myUnderstanding, 5000),
          JSON.stringify(Array.isArray(card.usageItems) ? card.usageItems.slice(0, 10) : []),
          JSON.stringify(Array.isArray(card.tags) ? card.tags.slice(0, 20) : []),
          analysis.diary_id, analysis.id
        ]
      );
    }

    await appendDiaryCards(client, analysis.diary_id, req.user.id, [cardId]);
    const nextSuggestion = {
      ...suggestion,
      createdCardId: cardId,
      boundCardIds: [...new Set([...(Array.isArray(suggestion.boundCardIds) ? suggestion.boundCardIds : []), cardId])]
    };
    const updated = await client.query(
      `UPDATE diary_analysis SET card_suggestion = $3::jsonb, updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING ${analysisFields}`,
      [analysis.id, req.user.id, JSON.stringify(nextSuggestion)]
    );
    return { cardId, analysis: await mapAnalysisWithCandidates(updated.rows[0], req.user.id, client) };
  });
  if (created.error === 'analysis') return fail(res, 404, '已完成的分析任务不存在');
  if (created.error === 'suggestion') return fail(res, 400, '这次分析没有建议创建新菇卡');
  return ok(res, created, '菇卡已创建并关联到这篇日记');
}));

router.post('/diary-flow/:taskId/cards/bind', asyncRoute(async (req, res) => {
  const requested = [...new Set((Array.isArray(req.body.cardIds) ? req.body.cardIds : [])
    .map(value => text(value, 64)).filter(Boolean))].slice(0, 5);
  if (!requested.length) return fail(res, 400, '请选择要关联的历史菇卡');
  const bound = await db.transaction(async client => {
    const analysisResult = await client.query(
      `SELECT id, diary_id, card_suggestion FROM diary_analysis
       WHERE id = $1 AND user_id = $2 AND status = 'done' FOR UPDATE`,
      [req.params.taskId, req.user.id]
    );
    if (!analysisResult.rowCount) return { error: 'analysis' };
    const analysis = analysisResult.rows[0];
    const suggestion = storedCardSuggestion(analysis.card_suggestion);
    const allowed = new Set((Array.isArray(suggestion.existingMatches) ? suggestion.existingMatches : [])
      .map(item => String(item.cardId || '')));
    if (requested.some(cardId => !allowed.has(cardId))) return { error: 'suggestion' };
    const cards = await client.query(
      'SELECT id FROM cards WHERE user_id = $1 AND id = ANY($2::uuid[])',
      [req.user.id, requested]
    );
    if (cards.rowCount !== requested.length) return { error: 'card' };

    await appendDiaryCards(client, analysis.diary_id, req.user.id, requested);
    const nextSuggestion = {
      ...suggestion,
      boundCardIds: [...new Set([...(Array.isArray(suggestion.boundCardIds) ? suggestion.boundCardIds : []), ...requested])]
    };
    const updated = await client.query(
      `UPDATE diary_analysis SET card_suggestion = $3::jsonb, updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING ${analysisFields}`,
      [analysis.id, req.user.id, JSON.stringify(nextSuggestion)]
    );
    return { cardIds: requested, analysis: await mapAnalysisWithCandidates(updated.rows[0], req.user.id, client) };
  });
  if (bound.error === 'analysis') return fail(res, 404, '已完成的分析任务不存在');
  if (bound.error === 'suggestion') return fail(res, 400, '只能关联这次分析推荐的历史菇卡');
  if (bound.error === 'card') return fail(res, 404, '历史菇卡不存在');
  return ok(res, bound, '历史菇卡已关联到这篇日记');
}));

router.post('/extract', asyncRoute(async (req, res) => {
  if (!isAiConfigured()) return fail(res, 503, '观察席 AI 尚未配置');
  const diary = req.body.diaryId ? await ownedDiary(req.user.id, text(req.body.diaryId, 64)) : null;
  const content = diary?.content || text(req.body.content, 5000);
  if (!content) return fail(res, 400, '日记内容不能为空');
  const result = await callJson(ENTITY_PROMPT, { diary: { content } }, '实体提取', {
    usageContext: { userId: req.user.id, feature: 'entity_extract', diaryId: diary?.id || null }
  });
  return ok(res, result);
}));

router.post('/views/:viewId', asyncRoute(async (req, res) => {
  if (!isAiConfigured()) return fail(res, 503, '观察席 AI 尚未配置');
  const viewId = Number(req.params.viewId);
  if (!VIEW_PROMPTS[viewId]) return fail(res, 400, '视角编号必须为 1 到 5');
  const diary = req.body.diaryId ? await ownedDiary(req.user.id, text(req.body.diaryId, 64)) : null;
  const content = diary?.content || text(req.body.content, 5000);
  if (!content) return fail(res, 400, '日记内容不能为空');
  const os = await lifeOs(req.user.id);
  if (viewId === 4 && !os) return ok(res, { view: 4, name: '人生OS对照', disabled: true, message: '未配置人生OS' });
  const observer = { renderType: ['first_principles', 'entropy', 'compound', 'life_os', 'biological'][viewId - 1] };
  const result = await callJson(VIEW_PROMPTS[viewId], viewInput({ ...diary, content }, os, observer), `视角 ${viewId}`, {
    usageContext: { userId: req.user.id, feature: 'legacy_diary_view', diaryId: diary?.id || null }
  });
  return ok(res, { ...result, view: viewId });
}));

module.exports = router;
