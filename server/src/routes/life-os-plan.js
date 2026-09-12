'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const config = require('../config');
const { callJson, isAiConfigured } = require('../ai-engine');
const { usageSummary } = require('../ai-usage');
const { asyncRoute, fail, ok, pageParams, requireUser, text } = require('../http');
const {
  SECTIONS,
  WEEKLY_REVIEW_PROMPT,
  ensureDefaultLifeOsItems,
  normalizeWeeklyReview,
  weekStart
} = require('../life-os-long-term');

const router = express.Router();
router.use(requireUser);
router.use(asyncRoute(async (req, res, next) => {
  await ensureDefaultLifeOsItems(db, req.user.id);
  next();
}));

function stableKey(value) {
  const key = String(value || '');
  return /^(0[1-9]|1\d|20)$/.test(key) ? key : null;
}

function uuid(value) {
  const id = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function mapItem(row) {
  return {
    id: row.id,
    stableKey: row.stable_key,
    originalNumber: Number(row.original_number),
    section: row.section,
    name: row.name,
    description: row.description || '',
    minimumAction: row.minimum_action || '',
    currentNextStep: row.current_next_step || '',
    priority: Number(row.priority),
    status: row.status,
    isWeekFocus: Boolean(row.is_week_focus),
    relatedRecordCount: Number(row.related_record_count || 0),
    updatedAt: row.updated_at
  };
}

function mapLink(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    itemKey: row.stable_key,
    itemName: row.item_name,
    diaryId: row.diary_id,
    sourceDate: row.source_date,
    recordType: row.record_type,
    evidenceExcerpt: row.evidence_excerpt || '',
    summary: row.summary || '',
    suggestedNextStep: row.suggested_next_step || '',
    origin: row.origin,
    userConfirmed: Boolean(row.user_confirmed),
    sourceValid: Boolean(row.source_valid),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReference(row) {
  return {
    id: row.id,
    itemKey: row.stable_key || undefined,
    refType: row.ref_type,
    refId: row.ref_id,
    label: row.label || '',
    externalUrl: row.external_url || '',
    createdAt: row.created_at
  };
}

function mapReview(row) {
  return {
    id: row.id,
    weekStart: String(row.week_start).slice(0, 10),
    status: row.status,
    result: row.result || {},
    sourceRefs: row.source_refs || [],
    modelVersion: row.model_version || '',
    costSummary: row.cost_summary || null,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function itemRows(userId, selectedWeek = weekStart()) {
  const result = await db.query(
    `SELECT i.*,
            EXISTS (SELECT 1 FROM life_os_week_focus f
              WHERE f.user_id = i.user_id AND f.item_id = i.id AND f.week_start = $2::date) AS is_week_focus,
            (SELECT count(*)::int FROM life_os_item_links l
              WHERE l.user_id = i.user_id AND l.item_id = i.id AND l.status = 'ACTIVE' AND l.source_valid) AS related_record_count
       FROM life_os_items i
      WHERE i.user_id = $1
      ORDER BY i.priority, i.original_number`,
    [userId, selectedWeek]
  );
  return result.rows;
}

async function replaceFocus(client, userId, selectedWeek, keys) {
  const itemKeys = [...new Set((Array.isArray(keys) ? keys : []).map(stableKey).filter(Boolean))].slice(0, 3);
  const owned = itemKeys.length ? await client.query(
    `SELECT id, stable_key FROM life_os_items
      WHERE user_id = $1 AND stable_key::text = ANY($2::text[]) AND status = 'ACTIVE'`,
    [userId, itemKeys]
  ) : { rows: [] };
  if (owned.rows.length !== itemKeys.length) return false;
  const itemMap = new Map(owned.rows.map(item => [item.stable_key, item.id]));
  await client.query('DELETE FROM life_os_week_focus WHERE user_id = $1 AND week_start = $2::date', [userId, selectedWeek]);
  for (let index = 0; index < itemKeys.length; index += 1) {
    await client.query(
      `INSERT INTO life_os_week_focus (user_id, week_start, item_id, position)
       VALUES ($1, $2::date, $3, $4)`,
      [userId, selectedWeek, itemMap.get(itemKeys[index]), index + 1]
    );
  }
  return true;
}

router.get('/home', asyncRoute(async (req, res) => {
  const selectedWeek = weekStart();
  const reviewId = crypto.randomUUID();
  const [rows, recent, latestReview] = await Promise.all([
    itemRows(req.user.id, selectedWeek),
    db.query(
      `SELECT l.*, i.stable_key, i.name AS item_name,
              to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
         FROM life_os_item_links l
         JOIN life_os_items i ON i.id = l.item_id AND i.user_id = l.user_id
         LEFT JOIN diaries d ON d.id = l.diary_id AND d.user_id = l.user_id
        WHERE l.user_id = $1 AND l.status = 'ACTIVE' AND l.source_valid
        ORDER BY COALESCE(d.occurred_at, l.created_at) DESC, l.created_at DESC LIMIT 12`,
      [req.user.id]
    ),
    db.query(
      `SELECT * FROM life_os_weekly_reviews
        WHERE user_id = $1 ORDER BY week_start DESC, created_at DESC LIMIT 1`,
      [req.user.id]
    )
  ]);
  const items = rows.map(mapItem);
  const sections = SECTIONS.map(section => ({ section, items: items.filter(item => item.section === section) }));
  return ok(res, {
    weekStart: selectedWeek,
    focus: items.filter(item => item.isWeekFocus).slice(0, 3),
    sections,
    recentRecords: recent.rows.map(mapLink),
    latestReview: latestReview.rowCount ? mapReview(latestReview.rows[0]) : null,
    counts: {
      total: items.length,
      active: items.filter(item => item.status === 'ACTIVE').length,
      paused: items.filter(item => item.status === 'PAUSED').length
    },
    privacy: '人生 OS 仅本人可见，不随日记公开，也不进入发现。'
  });
}));

router.put('/focus', asyncRoute(async (req, res) => {
  const selectedWeek = weekStart();
  const keys = Array.isArray(req.body.itemKeys) ? req.body.itemKeys : [];
  if (keys.length > 3) return fail(res, 400, '本周重点最多 3 项');
  const saved = await db.transaction(client => replaceFocus(client, req.user.id, selectedWeek, keys));
  if (!saved) return fail(res, 400, '本周重点只能选择正在维护的长期事项');
  const rows = await itemRows(req.user.id, selectedWeek);
  return ok(res, rows.filter(row => row.is_week_focus).map(mapItem), keys.length ? '本周重点已更新' : '已清空本周重点');
}));

router.get('/items/:key', asyncRoute(async (req, res) => {
  const key = stableKey(req.params.key);
  if (!key) return fail(res, 404, '长期事项不存在');
  const itemResult = await db.query(
    `SELECT i.*, EXISTS (SELECT 1 FROM life_os_week_focus f
      WHERE f.user_id = i.user_id AND f.item_id = i.id AND f.week_start = $3::date) AS is_week_focus,
      (SELECT count(*)::int FROM life_os_item_links l WHERE l.item_id = i.id AND l.status = 'ACTIVE' AND l.source_valid) AS related_record_count
      FROM life_os_items i WHERE i.user_id = $1 AND i.stable_key = $2`,
    [req.user.id, key, weekStart()]
  );
  if (!itemResult.rowCount) return fail(res, 404, '长期事项不存在');
  const item = itemResult.rows[0];
  const [links, refs, history, todos, cards, inquiries] = await Promise.all([
    db.query(
      `SELECT l.*, i.stable_key, i.name AS item_name,
              to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
         FROM life_os_item_links l
         JOIN life_os_items i ON i.id = l.item_id
         LEFT JOIN diaries d ON d.id = l.diary_id AND d.user_id = l.user_id
        WHERE l.user_id = $1 AND l.item_id = $2 AND l.status <> 'REMOVED'
        ORDER BY COALESCE(d.occurred_at, l.created_at) DESC LIMIT 80`,
      [req.user.id, item.id]
    ),
    db.query('SELECT * FROM life_os_item_refs WHERE user_id = $1 AND item_id = $2 ORDER BY created_at DESC', [req.user.id, item.id]),
    db.query('SELECT id, change_type, snapshot, created_at FROM life_os_item_history WHERE user_id = $1 AND item_id = $2 ORDER BY created_at DESC LIMIT 50', [req.user.id, item.id]),
    db.query(`SELECT id, content AS label, status FROM todos WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20`, [req.user.id]),
    db.query(`SELECT id, seed_sentence AS label, 'ACTIVE' AS status FROM cards WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20`, [req.user.id]),
    db.query(`SELECT id, question AS label, status FROM inquiries WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20`, [req.user.id])
  ]);
  return ok(res, {
    item: mapItem(item),
    relatedRecords: links.rows.map(mapLink),
    references: refs.rows.map(mapReference),
    history: history.rows.map(row => ({ id: row.id, changeType: row.change_type, snapshot: row.snapshot || {}, createdAt: row.created_at })),
    referenceOptions: {
      TODO: todos.rows,
      CARD: cards.rows,
      INQUIRY: inquiries.rows
    }
  });
}));

router.patch('/items/:key', asyncRoute(async (req, res) => {
  const key = stableKey(req.params.key);
  if (!key) return fail(res, 404, '长期事项不存在');
  const saved = await db.transaction(async client => {
    const currentResult = await client.query('SELECT * FROM life_os_items WHERE user_id = $1 AND stable_key = $2 FOR UPDATE', [req.user.id, key]);
    if (!currentResult.rowCount) return null;
    const current = currentResult.rows[0];
    const name = req.body.name === undefined ? current.name : text(req.body.name, 120);
    if (!name) return { error: 'name' };
    const priorityInput = Number(req.body.priority);
    const priority = req.body.priority === undefined || !Number.isInteger(priorityInput)
      ? Number(current.priority) : Math.max(1, Math.min(99, priorityInput));
    const status = ['ACTIVE', 'PAUSED'].includes(req.body.status) ? req.body.status : current.status;
    const next = {
      name,
      description: req.body.description === undefined ? current.description : text(req.body.description, 3000),
      minimumAction: req.body.minimumAction === undefined ? current.minimum_action : text(req.body.minimumAction, 2000),
      currentNextStep: req.body.currentNextStep === undefined ? current.current_next_step : text(req.body.currentNextStep, 1000),
      priority,
      status
    };
    await client.query(
      `INSERT INTO life_os_item_history (id, user_id, item_id, change_type, snapshot)
       VALUES ($1, $2, $3, 'EDIT', $4::jsonb)`,
      [crypto.randomUUID(), req.user.id, current.id, JSON.stringify({
        name: current.name, description: current.description, minimumAction: current.minimum_action,
        currentNextStep: current.current_next_step, priority: current.priority, status: current.status
      })]
    );
    const updated = await client.query(
      `UPDATE life_os_items SET name = $3, description = $4, minimum_action = $5,
         current_next_step = $6, priority = $7, status = $8, updated_at = now()
       WHERE user_id = $1 AND stable_key = $2 RETURNING *`,
      [req.user.id, key, next.name, next.description, next.minimumAction, next.currentNextStep, next.priority, next.status]
    );
    if (status === 'PAUSED') {
      await client.query('DELETE FROM life_os_week_focus WHERE user_id = $1 AND item_id = $2 AND week_start >= $3::date', [req.user.id, current.id, weekStart()]);
    }
    return { row: updated.rows[0] };
  });
  if (!saved) return fail(res, 404, '长期事项不存在');
  if (saved.error === 'name') return fail(res, 400, '名称不能为空');
  return ok(res, mapItem(saved.row), '长期事项已更新');
}));

router.patch('/links/:id', asyncRoute(async (req, res) => {
  const id = uuid(req.params.id);
  const recordType = ['PLAN', 'ACTION', 'RESULT', 'OBSERVATION', 'INQUIRY'].includes(req.body.recordType)
    ? req.body.recordType : null;
  if (!id || !recordType) return fail(res, 400, '关联或记录类型无效');
  const saved = await db.transaction(async client => {
    const currentResult = await client.query(
      'SELECT * FROM life_os_item_links WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, req.user.id]
    );
    const current = currentResult.rows[0];
    if (!current || !current.source_valid) return null;
    const duplicate = await client.query(
      `SELECT * FROM life_os_item_links
        WHERE user_id = $1 AND item_id = $2 AND diary_id = $3 AND record_type = $4 AND id <> $5
          AND status = 'ACTIVE' AND source_valid
        FOR UPDATE`,
      [req.user.id, current.item_id, current.diary_id, recordType, id]
    );
    if (duplicate.rowCount) {
      await client.query(
        `UPDATE life_os_item_links SET user_confirmed = true, status = 'ACTIVE', updated_at = now()
          WHERE id = $1`,
        [duplicate.rows[0].id]
      );
      await client.query(
        `UPDATE life_os_item_links SET user_confirmed = true, status = 'REMOVED', updated_at = now()
          WHERE id = $1`,
        [id]
      );
      return duplicate.rows[0];
    }
    const updated = await client.query(
      `UPDATE life_os_item_links SET record_type = $3, user_confirmed = true,
         status = 'ACTIVE', updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user.id, recordType]
    );
    return updated.rows[0];
  });
  if (!saved) return fail(res, 404, '关联不存在或来源已失效');
  return ok(res, mapLink(saved), '记录类型已纠正');
}));

router.delete('/links/:id', asyncRoute(async (req, res) => {
  const id = uuid(req.params.id);
  if (!id) return fail(res, 404, '关联不存在');
  const result = await db.query(
    `UPDATE life_os_item_links SET status = 'REMOVED', user_confirmed = true, updated_at = now()
      WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '关联不存在');
  return ok(res, { id }, '已取消关联');
}));

router.post('/items/:key/references', asyncRoute(async (req, res) => {
  const key = stableKey(req.params.key);
  const refType = ['TODO', 'CARD', 'INQUIRY', 'EXTERNAL_ASSET'].includes(req.body.refType) ? req.body.refType : null;
  if (!key || !refType) return fail(res, 400, '引用类型无效');
  const itemResult = await db.query('SELECT id FROM life_os_items WHERE user_id = $1 AND stable_key = $2', [req.user.id, key]);
  if (!itemResult.rowCount) return fail(res, 404, '长期事项不存在');
  const refId = uuid(req.body.refId);
  let label = text(req.body.label, 240);
  let externalUrl = text(req.body.externalUrl, 2000);
  if (refType === 'EXTERNAL_ASSET') {
    if (!label || !/^https?:\/\/[^\s]+$/i.test(externalUrl)) return fail(res, 400, '请填写资产名称和 http(s) 链接');
  } else {
    if (!refId) return fail(res, 400, '引用对象不存在');
    const table = { TODO: 'todos', CARD: 'cards', INQUIRY: 'inquiries' }[refType];
    const owned = await db.query(`SELECT id FROM ${table} WHERE id = $1 AND user_id = $2`, [refId, req.user.id]);
    if (!owned.rowCount) return fail(res, 404, '只能引用自己的内容');
    externalUrl = '';
    label = label || { TODO: '待办', CARD: '菇卡', INQUIRY: '未解之问' }[refType];
  }
  const result = await db.query(
    `INSERT INTO life_os_item_refs (id, user_id, item_id, ref_type, ref_id, label, external_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, item_id, ref_type, ref_id) WHERE ref_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [crypto.randomUUID(), req.user.id, itemResult.rows[0].id, refType, refId, label, externalUrl]
  );
  if (!result.rowCount) return fail(res, 400, '这项内容已经关联过');
  return ok(res, mapReference(result.rows[0]), '资产引用已保存');
}));

router.delete('/references/:id', asyncRoute(async (req, res) => {
  const id = uuid(req.params.id);
  if (!id) return fail(res, 404, '引用不存在');
  const result = await db.query('DELETE FROM life_os_item_refs WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!result.rowCount) return fail(res, 404, '引用不存在');
  return ok(res, { id }, '引用已移除');
}));

async function weeklySources(userId, selectedWeek) {
  const result = await db.query(
    `SELECT l.id, l.record_type, l.evidence_excerpt, l.summary, l.suggested_next_step,
            l.origin, l.user_confirmed,
            i.stable_key, i.name AS item_name,
            to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
       FROM life_os_item_links l
       JOIN life_os_items i ON i.id = l.item_id AND i.user_id = l.user_id
       JOIN diaries d ON d.id = l.diary_id AND d.user_id = l.user_id AND d.deleted_at IS NULL
      WHERE l.user_id = $1 AND l.status = 'ACTIVE' AND l.source_valid
        AND d.occurred_at >= $2::date AT TIME ZONE 'Asia/Shanghai'
        AND d.occurred_at < ($2::date + 7) AT TIME ZONE 'Asia/Shanghai'
      ORDER BY d.occurred_at, l.created_at`,
    [userId, selectedWeek]
  );
  return result.rows.map((row, index) => ({
    sourceKey: `R${index + 1}`,
    linkId: row.id,
    itemId: row.stable_key,
    itemName: row.item_name,
    recordType: row.record_type,
    date: row.source_date,
    evidenceExcerpt: row.evidence_excerpt,
    summary: row.summary,
    suggestedNextStep: row.suggested_next_step,
    origin: row.origin,
    userConfirmed: Boolean(row.user_confirmed)
  }));
}

router.get('/reviews', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const [items, total] = await Promise.all([
    db.query('SELECT * FROM life_os_weekly_reviews WHERE user_id = $1 ORDER BY week_start DESC, created_at DESC LIMIT $2 OFFSET $3', [req.user.id, pageSize, offset]),
    db.query('SELECT count(*)::int AS total FROM life_os_weekly_reviews WHERE user_id = $1', [req.user.id])
  ]);
  return ok(res, { list: items.rows.map(mapReview), total: total.rows[0].total, page, pageSize });
}));

router.post('/reviews/draft', asyncRoute(async (req, res) => {
  if (!isAiConfigured()) return fail(res, 503, '每周复盘 AI 尚未配置');
  const selectedWeek = weekStart();
  const [sources, rows] = await Promise.all([weeklySources(req.user.id, selectedWeek), itemRows(req.user.id, selectedWeek)]);
  if (!sources.length) return fail(res, 400, '本周还没有与人生 OS 关联的日记记录');
  const items = rows.map(mapItem);
  const raw = await callJson(WEEKLY_REVIEW_PROMPT, {
    weekStart: selectedWeek,
    items: items.map(item => ({
      itemId: item.stableKey, section: item.section, name: item.name,
      minimumAction: item.minimumAction, currentNextStep: item.currentNextStep,
      isWeekFocus: item.isWeekFocus, status: item.status
    })),
    records: sources
  }, '人生 OS 每周复盘', {
    temperature: 0.15,
    maxTokens: 5000,
    usageContext: { userId: req.user.id, feature: 'life_os_weekly_review', taskId: reviewId }
  });
  const result = normalizeWeeklyReview(raw, sources, items);
  if (!result.actualProgress.length && !result.accumulations.length && !result.observations.length) {
    return fail(res, 503, '这次没有形成可核对的复盘草稿');
  }
  const costSummary = await usageSummary(req.user.id, { taskId: reviewId });
  const review = await db.transaction(async client => {
    await client.query(
      `UPDATE life_os_weekly_reviews SET status = 'SUPERSEDED', updated_at = now()
        WHERE user_id = $1 AND week_start = $2::date AND status = 'DRAFT'`,
      [req.user.id, selectedWeek]
    );
    const inserted = await client.query(
      `INSERT INTO life_os_weekly_reviews
        (id, user_id, week_start, status, result, source_refs, model_version, cost_summary)
       VALUES ($1, $2, $3::date, 'DRAFT', $4::jsonb, $5::jsonb, $6, $7::jsonb) RETURNING *`,
      [reviewId, req.user.id, selectedWeek, JSON.stringify(result),
        JSON.stringify(sources.map(item => ({ sourceKey: item.sourceKey, linkId: item.linkId, itemId: item.itemId, date: item.date }))),
        config.aiModel || 'configured-model', JSON.stringify(costSummary)]
    );
    return inserted.rows[0];
  });
  return ok(res, mapReview(review), '复盘草稿已生成，确认后才会保留为历史');
}));

router.post('/reviews/:id/confirm', asyncRoute(async (req, res) => {
  const reviewId = uuid(req.params.id);
  if (!reviewId) return fail(res, 404, '复盘草稿不存在');
  const confirmed = await db.transaction(async client => {
    const reviewResult = await client.query(
      `SELECT * FROM life_os_weekly_reviews WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [reviewId, req.user.id]
    );
    const review = reviewResult.rows[0];
    if (!review) return { error: 'missing' };
    if (review.status !== 'DRAFT') return { error: 'resolved' };
    const rows = await client.query('SELECT * FROM life_os_items WHERE user_id = $1 ORDER BY priority, original_number', [req.user.id]);
    const normalized = normalizeWeeklyReview(req.body.result || review.result, review.source_refs || [], rows.rows);
    const availableNextSteps = new Map(normalized.nextSteps.map(item => [item.itemId, item]));
    const selectedKeys = [...new Set((Array.isArray(req.body.selectedItemKeys) ? req.body.selectedItemKeys : [])
      .map(stableKey).filter(key => key && availableNextSteps.has(key)))].slice(0, 3);
    const nextWeek = weekStart(new Date(), 1);
    if (!(await replaceFocus(client, req.user.id, nextWeek, selectedKeys))) return { error: 'focus' };
    for (const key of selectedKeys) {
      await client.query(
        `UPDATE life_os_items SET current_next_step = $3, updated_at = now()
          WHERE user_id = $1 AND stable_key = $2`,
        [req.user.id, key, availableNextSteps.get(key).action]
      );
    }
    const updated = await client.query(
      `UPDATE life_os_weekly_reviews SET status = 'CONFIRMED', result = $3::jsonb,
         confirmed_at = now(), updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [reviewId, req.user.id, JSON.stringify(normalized)]
    );
    return { row: updated.rows[0], nextWeek, selectedKeys };
  });
  if (confirmed.error === 'missing') return fail(res, 404, '复盘草稿不存在');
  if (confirmed.error === 'resolved') return fail(res, 400, '这份复盘已经处理');
  if (confirmed.error === 'focus') return fail(res, 400, '下周重点中包含已暂停事项');
  return ok(res, { review: mapReview(confirmed.row), nextWeek: confirmed.nextWeek, selectedItemKeys: confirmed.selectedKeys }, '本周复盘已确认');
}));

function lifeOsMarkdown(payload) {
  const lines = [
    '# 我的人生 OS · 长期事项', '',
    `> 导出时间：${payload.exportedAt}`, '',
    '这是长期方向与证据连接，不是每日必须完成的打卡表。'
  ];
  for (const section of payload.sections) {
    lines.push('', `## ${section.section}`);
    for (const item of section.items) {
      lines.push('', `### ${item.stableKey} · ${item.name}`);
      if (item.description) lines.push('', item.description);
      lines.push(`- 状态：${item.status === 'PAUSED' ? '暂停维护' : '维护中'}`);
      lines.push(`- 最低行动：${item.minimumAction || '未设置'}`);
      lines.push(`- 当前下一步：${item.currentNextStep || '未设置'}`);
    }
  }
  if (payload.confirmedPrinciples.length) {
    lines.push('', '## 已确认的判断原则');
    payload.confirmedPrinciples.forEach(item => lines.push('', `- ${item.statement}`));
  }
  if (payload.reviews.length) {
    lines.push('', '## 历史每周复盘');
    payload.reviews.forEach(item => lines.push('', `### ${item.weekStart}`, '', item.result.summary || '无摘要'));
  }
  if (payload.itemHistory.length) {
    lines.push('', '## 长期事项调整历史');
    payload.itemHistory.forEach(item => lines.push('', `- ${item.itemKey} · ${String(item.createdAt || '').slice(0, 10)} · ${item.changeType}`));
  }
  return lines.join('\n');
}

router.get('/export', asyncRoute(async (req, res) => {
  const rows = await itemRows(req.user.id, weekStart());
  const items = rows.map(mapItem);
  const [focus, links, refs, reviews, clauses, history] = await Promise.all([
    db.query(`SELECT f.week_start, f.position, f.created_at, i.stable_key
      FROM life_os_week_focus f JOIN life_os_items i ON i.id = f.item_id AND i.user_id = f.user_id
      WHERE f.user_id = $1 ORDER BY f.week_start, f.position`, [req.user.id]),
    db.query(`SELECT l.*, i.stable_key, i.name AS item_name,
      to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
      FROM life_os_item_links l JOIN life_os_items i ON i.id = l.item_id
      LEFT JOIN diaries d ON d.id = l.diary_id AND d.user_id = l.user_id
      WHERE l.user_id = $1 ORDER BY l.created_at`, [req.user.id]),
    db.query(`SELECT r.*, i.stable_key FROM life_os_item_refs r
      JOIN life_os_items i ON i.id = r.item_id AND i.user_id = r.user_id
      WHERE r.user_id = $1 ORDER BY r.created_at`, [req.user.id]),
    db.query(`SELECT * FROM life_os_weekly_reviews WHERE user_id = $1 AND status = 'CONFIRMED' ORDER BY week_start, created_at`, [req.user.id]),
    db.query(`SELECT id, area, statement, boundary, review_question, basis, confidence, source_refs, created_at
      FROM life_os_clauses WHERE user_id = $1 AND status = 'active' ORDER BY position, created_at`, [req.user.id]),
    db.query(`SELECT h.id, h.change_type, h.snapshot, h.created_at, i.stable_key
      FROM life_os_item_history h JOIN life_os_items i ON i.id = h.item_id AND i.user_id = h.user_id
      WHERE h.user_id = $1 ORDER BY h.created_at`, [req.user.id])
  ]);
  const payload = {
    format: 'shroom-life-os-v1',
    exportedAt: new Date().toISOString(),
    templateVersion: '2026-09-12-v1',
    sections: SECTIONS.map(section => ({ section, items: items.filter(item => item.section === section) })),
    weekFocus: focus.rows.map(row => ({ weekStart: String(row.week_start).slice(0, 10), itemId: row.stable_key, position: Number(row.position), createdAt: row.created_at })),
    relatedRecords: links.rows.map(mapLink),
    references: refs.rows.map(mapReference),
    reviews: reviews.rows.map(mapReview),
    itemHistory: history.rows.map(row => ({ id: row.id, itemKey: row.stable_key, changeType: row.change_type, snapshot: row.snapshot || {}, createdAt: row.created_at })),
    confirmedPrinciples: clauses.rows,
    note: '不包含无关日记全文；关联记录只保留必要摘要和来源标识。'
  };
  return ok(res, { json: payload, markdown: lifeOsMarkdown(payload) });
}));

module.exports = router;
