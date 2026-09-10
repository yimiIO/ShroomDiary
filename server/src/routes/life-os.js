'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { callJson, isAiConfigured } = require('../ai-engine');
const { asyncRoute, fail, ok, pageParams, requireUser, text } = require('../http');
const {
  LIFE_OS_DRAFT_PROMPT,
  buildLifeOsMarkdown,
  normalizeLifeOsDraft
} = require('../life-os-draft');
const {
  LIFE_OS_REVIEW_PROMPT,
  MAX_ACTIVE_CLAUSES,
  normalizeReviewPlan,
  renderLifeOsMarkdown,
  uniqueRefs
} = require('../life-os-review');

const router = express.Router();
router.use(requireUser);

function mapLifeOs(row) {
  if (!row) return {
    configured: false,
    contentMd: '',
    version: 0,
    updatedAt: null,
    origin: null,
    sourceRefs: [],
    generationMeta: {},
    activeClauseCount: 0,
    pendingProposalCount: 0
  };
  return {
    configured: Boolean(row.content_md),
    contentMd: row.content_md,
    version: row.version,
    updatedAt: row.updated_at,
    origin: row.origin || 'manual',
    sourceRefs: row.source_refs || [],
    generationMeta: row.generation_meta || {},
    activeClauseCount: Number(row.active_clause_count || 0),
    pendingProposalCount: Number(row.pending_proposal_count || 0)
  };
}

function mapClause(row) {
  return {
    id: row.id,
    snapshotVersion: Number(row.snapshot_version),
    area: row.area,
    principle: row.statement,
    boundary: row.boundary || '',
    reviewQuestion: row.review_question || '',
    basis: row.basis,
    confidence: row.confidence,
    position: Number(row.position || 0),
    sourceRefs: row.source_refs || [],
    counterSourceRefs: row.counter_source_refs || [],
    supersedes: row.supersedes || [],
    createdAt: row.created_at
  };
}

function mapProposal(row) {
  if (!row) return null;
  return {
    id: row.id,
    baseVersion: Number(row.base_version || 0),
    triggerType: row.trigger_type,
    status: row.status,
    summary: row.summary || '',
    ...(row.payload || {}),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null
  };
}

function dateText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function lifeOsSources(diaries, cards) {
  const diarySources = diaries.map((row, index) => ({
    key: `D${index + 1}`,
    type: 'diary',
    id: row.id,
    date: dateText(row.source_date),
    label: `${dateText(row.source_date)} 的日记`,
    content: text(row.content, 900),
    mood: row.mood || null
  }));
  const cardSources = cards.map((row, index) => ({
    key: `C${index + 1}`,
    type: 'card',
    id: row.id,
    date: dateText(row.source_date),
    label: `菇卡「${text(row.seed_sentence, 60)}」`,
    content: [row.seed_sentence, row.my_understanding, ...(row.usage_items || [])]
      .map(value => text(value, 500)).filter(Boolean).join('\n'),
    tags: Array.isArray(row.tags) ? row.tags.slice(0, 12) : []
  }));
  return [...diarySources, ...cardSources];
}

async function generationCounts(userId) {
  const result = await db.query(
    `SELECT
      (SELECT count(*)::int FROM diaries WHERE user_id = $1 AND deleted_at IS NULL AND ai_allowed AND length(trim(content)) > 0) AS diaries,
      (SELECT count(*)::int FROM cards WHERE user_id = $1) AS cards`,
    [userId]
  );
  return result.rows[0];
}

async function generationContext(userId) {
  const [diaries, cards, counts] = await Promise.all([
    db.query(
      `SELECT id, content, mood,
              to_char(occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
         FROM diaries
        WHERE user_id = $1 AND deleted_at IS NULL AND ai_allowed AND length(trim(content)) > 0
        ORDER BY occurred_at DESC LIMIT 120`,
      [userId]
    ),
    db.query(
      `SELECT id, seed_sentence, my_understanding, usage_items, tags,
              to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
         FROM cards WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 80`,
      [userId]
    ),
    generationCounts(userId)
  ]);
  return {
    counts,
    sources: lifeOsSources(diaries.rows, cards.rows)
  };
}

async function structuredClauses(userId) {
  const result = await db.query(
    `SELECT id, snapshot_version, area, statement, boundary, review_question,
            basis, confidence, position, supersedes, source_refs,
            counter_source_refs, created_at
       FROM life_os_clauses
      WHERE user_id = $1 AND status = 'active'
      ORDER BY position, created_at`,
    [userId]
  );
  return result.rows.map(mapClause);
}

function reviewClauseInputs(clauses) {
  return clauses.map((clause, index) => ({
    key: `O${index + 1}`,
    id: clause.id,
    area: clause.area,
    principle: clause.principle,
    boundary: clause.boundary,
    reviewQuestion: clause.reviewQuestion,
    basis: clause.basis,
    confidence: clause.confidence,
    sourceRefs: clause.sourceRefs || []
  }));
}

function estimatedPrincipleCount(content) {
  const source = String(content || '');
  const levelThree = source.match(/^###\s+/gm);
  if (levelThree?.length) return levelThree.length;
  const bullets = source.match(/^\s*[-*]\s+[^\n]+/gm);
  return Math.min(40, bullets?.length || (source.trim() ? 1 : 0));
}

async function reviewSignal(userId, config) {
  const updatedAt = config?.updatedAt || null;
  const result = await db.query(
    `SELECT
       (count(DISTINCT (occurred_at AT TIME ZONE 'Asia/Shanghai')::date)
         FILTER (WHERE $2::timestamptz IS NULL OR updated_at > $2::timestamptz))::int AS diary_days,
       (SELECT count(*)::int FROM cards
         WHERE user_id = $1 AND ($2::timestamptz IS NULL OR updated_at > $2::timestamptz)) AS cards
     FROM diaries
     WHERE user_id = $1 AND deleted_at IS NULL AND ai_allowed AND length(trim(content)) > 0`,
    [userId, updatedAt]
  );
  const diaryDays = Number(result.rows[0]?.diary_days || 0);
  const cards = Number(result.rows[0]?.cards || 0);
  const ageDays = updatedAt ? Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000)) : null;
  const reasons = [];
  if (!config?.configured) reasons.push('还没有签发第一版人生 OS');
  else if (!config.activeClauseCount) reasons.push('当前版本仍是旧式文档，适合先整理成独立原则');
  if (diaryDays >= 3) reasons.push(`已有 ${diaryDays} 个新日记日尚未复盘`);
  if (cards >= 3) reasons.push(`已有 ${cards} 张新菇卡尚未对照`);
  if (ageDays !== null && ageDays >= 90) reasons.push('当前版本已经超过 90 天未复查');
  return {
    due: reasons.length > 0,
    reasons,
    newDiaryDays: diaryDays,
    newCardCount: cards,
    daysSinceUpdate: ageDays
  };
}

function uuid(value) {
  const id = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

async function verifiedSourceRefs(userId, requested) {
  const refs = (Array.isArray(requested) ? requested : []).slice(0, 200)
    .map(item => ({ type: item?.type, id: uuid(item?.id) }))
    .filter(item => ['diary', 'card'].includes(item.type) && item.id);
  const diaryIds = [...new Set(refs.filter(item => item.type === 'diary').map(item => item.id))];
  const cardIds = [...new Set(refs.filter(item => item.type === 'card').map(item => item.id))];
  const [diaries, cards] = await Promise.all([
    diaryIds.length ? db.query(
      `SELECT id FROM diaries WHERE user_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
      [userId, diaryIds]
    ) : { rows: [] },
    cardIds.length ? db.query(
      'SELECT id FROM cards WHERE user_id = $1 AND id = ANY($2::uuid[])',
      [userId, cardIds]
    ) : { rows: [] }
  ]);
  const allowed = new Set([
    ...diaries.rows.map(row => `diary:${row.id}`),
    ...cards.rows.map(row => `card:${row.id}`)
  ]);
  return refs.filter((item, index) => allowed.has(`${item.type}:${item.id}`)
    && refs.findIndex(ref => ref.type === item.type && ref.id === item.id) === index);
}

function generationMeta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return {
    summary: text(value.summary, 1200),
    principleCount: Math.max(0, Math.min(20, Number(value.principleCount) || 0)),
    diaryCount: Math.max(0, Number(value.diaryCount) || 0),
    cardCount: Math.max(0, Number(value.cardCount) || 0),
    generatedAt: text(value.generatedAt, 40) || null
  };
}

router.get('/config', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT l.content_md, l.version, l.updated_at,
            v.origin, v.source_refs, v.generation_meta,
            (SELECT count(*) FROM life_os_clauses c
              WHERE c.user_id = l.user_id AND c.status = 'active') AS active_clause_count,
            (SELECT count(*) FROM life_os_review_proposals p
              WHERE p.user_id = l.user_id AND p.status = 'pending') AS pending_proposal_count
       FROM life_os l
       LEFT JOIN life_os_versions v ON v.life_os_id = l.id AND v.version = l.version
      WHERE l.user_id = $1`,
    [req.user.id]
  );
  return ok(res, mapLifeOs(result.rows[0]));
}));

router.put('/config', asyncRoute(async (req, res) => {
  const contentMd = text(req.body.contentMd ?? req.body.content_md, 100000);
  const expectedVersion = Number(req.body.version ?? req.body.expectedVersion);
  const sourceRefs = await verifiedSourceRefs(req.user.id, req.body.sourceRefs);
  const origin = req.body.origin === 'ai_assisted' && sourceRefs.length ? 'ai_assisted' : 'manual';
  const meta = origin === 'ai_assisted' ? generationMeta(req.body.generationMeta) : {};
  const saved = await db.transaction(async client => {
    const current = await client.query(
      'SELECT id, content_md, version, updated_at FROM life_os WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    if (!current.rowCount) {
      if (Number.isFinite(expectedVersion) && expectedVersion !== 0) return { conflict: true, current: null };
      const id = crypto.randomUUID();
      const inserted = await client.query(
        `INSERT INTO life_os (id, user_id, content_md, version)
         VALUES ($1, $2, $3, 1) RETURNING id, content_md, version, updated_at`,
        [id, req.user.id, contentMd]
      );
      await client.query(
        `INSERT INTO life_os_versions
          (id, user_id, life_os_id, version, content_md, origin, source_refs, generation_meta)
         VALUES ($1, $2, $3, 1, $4, $5, $6::jsonb, $7::jsonb)`,
        [crypto.randomUUID(), req.user.id, id, contentMd, origin, JSON.stringify(sourceRefs), JSON.stringify(meta)]
      );
      await client.query(
        `UPDATE life_os_review_proposals SET status = 'superseded', resolved_at = now()
          WHERE user_id = $1 AND status = 'pending'`,
        [req.user.id]
      );
      return { row: { ...inserted.rows[0], origin, source_refs: sourceRefs, generation_meta: meta } };
    }
    const existing = current.rows[0];
    if (Number.isFinite(expectedVersion) && expectedVersion !== existing.version) {
      return { conflict: true, current: existing };
    }
    const updated = await client.query(
      `UPDATE life_os SET content_md = $2, version = version + 1, updated_at = now()
       WHERE user_id = $1 RETURNING id, content_md, version, updated_at`,
      [req.user.id, contentMd]
    );
    await client.query(
      `INSERT INTO life_os_versions
        (id, user_id, life_os_id, version, content_md, origin, source_refs, generation_meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
      [crypto.randomUUID(), req.user.id, updated.rows[0].id, updated.rows[0].version,
        contentMd, origin, JSON.stringify(sourceRefs), JSON.stringify(meta)]
    );
    await client.query(
      `UPDATE life_os_clauses SET status = 'retired', retired_at = now()
        WHERE user_id = $1 AND status = 'active'`,
      [req.user.id]
    );
    await client.query(
      `UPDATE life_os_review_proposals SET status = 'superseded', resolved_at = now()
        WHERE user_id = $1 AND status = 'pending'`,
      [req.user.id]
    );
    return { row: { ...updated.rows[0], origin, source_refs: sourceRefs, generation_meta: meta } };
  });
  if (saved.conflict) return fail(res, 409, '人生 OS 已在其他设备更新，请刷新后重试', mapLifeOs(saved.current));
  return ok(res, mapLifeOs(saved.row), '人生 OS 已保存');
}));

router.get('/workspace', asyncRoute(async (req, res) => {
  const [configResult, clauses, proposalResult] = await Promise.all([
    db.query(
      `SELECT l.content_md, l.version, l.updated_at,
              v.origin, v.source_refs, v.generation_meta,
              (SELECT count(*) FROM life_os_clauses c
                WHERE c.user_id = l.user_id AND c.status = 'active') AS active_clause_count,
              (SELECT count(*) FROM life_os_review_proposals p
                WHERE p.user_id = l.user_id AND p.status = 'pending') AS pending_proposal_count
         FROM life_os l
         LEFT JOIN life_os_versions v ON v.life_os_id = l.id AND v.version = l.version
        WHERE l.user_id = $1`,
      [req.user.id]
    ),
    structuredClauses(req.user.id),
    db.query(
      `SELECT id, base_version, trigger_type, status, summary, payload, created_at, resolved_at
         FROM life_os_review_proposals
        WHERE user_id = $1 AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    )
  ]);
  const config = mapLifeOs(configResult.rows[0]);
  return ok(res, {
    config,
    clauses,
    pendingProposal: mapProposal(proposalResult.rows[0]),
    reviewSignal: await reviewSignal(req.user.id, config),
    policy: {
      idealActiveCount: 9,
      maximumActiveCount: MAX_ACTIVE_CLAUSES,
      confirmationRequired: true,
      cardDefinition: '菇卡是可以带到下一次相似时刻的理解、提醒或观察视角，不是行动或待办。'
    }
  });
}));

router.post('/review/draft', asyncRoute(async (req, res) => {
  if (!isAiConfigured()) return fail(res, 503, '人生 OS 整理服务尚未配置');
  const [context, currentResult, clauses] = await Promise.all([
    generationContext(req.user.id),
    db.query('SELECT content_md, version FROM life_os WHERE user_id = $1', [req.user.id]),
    structuredClauses(req.user.id)
  ]);
  const current = currentResult.rows[0] || { content_md: '', version: 0 };
  if (!current.content_md && Number(context.counts.diaries) < 3) {
    return fail(res, 400, '至少写下 3 天日记，或先亲自写下一个判断标准，才适合开始整理');
  }
  const clauseInputs = reviewClauseInputs(clauses);
  const raw = await callJson(LIFE_OS_REVIEW_PROMPT, {
    currentLifeOs: text(current.content_md, 30000) || null,
    currentPrinciples: clauseInputs.map(item => ({
      key: item.key,
      area: item.area,
      principle: item.principle,
      boundary: item.boundary,
      reviewQuestion: item.reviewQuestion,
      basis: item.basis,
      confidence: item.confidence
    })),
    sources: context.sources.map(source => ({
      key: source.key,
      type: source.type,
      date: source.date,
      content: source.content,
      mood: source.mood,
      tags: source.tags
    }))
  }, '人生 OS 整理', {
    temperature: 0.15,
    maxTokens: 8000,
    usageContext: { userId: req.user.id, feature: 'life_os_review' }
  });
  const plan = normalizeReviewPlan(raw, context.sources, clauseInputs);
  if (!plan.principles.length) return fail(res, 503, '这次没有形成可审核的整理建议，请稍后重试');
  plan.previousPrincipleCount = clauses.length || estimatedPrincipleCount(current.content_md);

  const triggerType = current.content_md && !clauses.length ? 'legacy_cleanup' : 'manual';
  const id = crypto.randomUUID();
  await db.transaction(async client => {
    await client.query(
      `UPDATE life_os_review_proposals SET status = 'superseded', resolved_at = now()
        WHERE user_id = $1 AND status = 'pending'`,
      [req.user.id]
    );
    await client.query(
      `INSERT INTO life_os_review_proposals
        (id, user_id, base_version, trigger_type, summary, payload, source_refs)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [id, req.user.id, Number(current.version || 0), triggerType, plan.summary,
        JSON.stringify(plan), JSON.stringify(plan.sourceRefs)]
    );
  });
  return ok(res, {
    id,
    baseVersion: Number(current.version || 0),
    triggerType,
    status: 'pending',
    ...plan,
    createdAt: new Date().toISOString()
  }, '整理建议已生成，只有你确认签发后才会生效');
}));

router.post('/review/manual', asyncRoute(async (req, res) => {
  const [currentResult, clauses] = await Promise.all([
    db.query('SELECT content_md, version FROM life_os WHERE user_id = $1', [req.user.id]),
    structuredClauses(req.user.id)
  ]);
  const current = currentResult.rows[0] || { content_md: '', version: 0 };
  if (current.content_md && !clauses.length) {
    return fail(res, 409, '当前还是旧式文档，请先生成一次精简建议，再进行逐条编辑');
  }
  const principles = clauses.map((clause, index) => ({
    key: `M${index + 1}`,
    area: clause.area,
    principle: clause.principle,
    boundary: clause.boundary,
    reviewQuestion: clause.reviewQuestion,
    basis: clause.basis,
    confidence: clause.confidence,
    sourceClauseKeys: [`O${index + 1}`],
    sourceClauseIds: [clause.id],
    evidenceKeys: [],
    evidenceLabels: [],
    counterEvidenceKeys: [],
    counterEvidenceLabels: [],
    sourceRefs: clause.sourceRefs || [],
    counterSourceRefs: clause.counterSourceRefs || []
  }));
  principles.push({
    key: `M${principles.length + 1}`,
    area: '核心取向',
    principle: '',
    boundary: '',
    reviewQuestion: '',
    basis: 'chosen',
    confidence: 'emerging',
    sourceClauseKeys: [],
    sourceClauseIds: [],
    evidenceKeys: [],
    evidenceLabels: [],
    counterEvidenceKeys: [],
    counterEvidenceLabels: [],
    sourceRefs: [],
    counterSourceRefs: []
  });
  const plan = {
    summary: clauses.length ? '保留当前原则，由你逐条修订或补充。' : '从你主动选择的一条原则开始。',
    principles,
    changes: clauses.map((clause, index) => ({
      type: 'keep',
      fromClauseKeys: [`O${index + 1}`],
      toPrinciple: `M${index + 1}`,
      title: `保留「${text(clause.principle, 60)}」`,
      reason: '这是你当前已经签发的原则。'
    })),
    cardDrafts: [],
    tensions: [],
    sourceRefs: uniqueRefs(clauses.flatMap(clause => [...(clause.sourceRefs || []), ...(clause.counterSourceRefs || [])])),
    previousPrincipleCount: clauses.length
  };
  const id = crypto.randomUUID();
  await db.transaction(async client => {
    await client.query(
      `UPDATE life_os_review_proposals SET status = 'superseded', resolved_at = now()
        WHERE user_id = $1 AND status = 'pending'`,
      [req.user.id]
    );
    await client.query(
      `INSERT INTO life_os_review_proposals
        (id, user_id, base_version, trigger_type, summary, payload, source_refs)
       VALUES ($1, $2, $3, 'manual', $4, $5::jsonb, $6::jsonb)`,
      [id, req.user.id, Number(current.version || 0), plan.summary, JSON.stringify(plan), JSON.stringify(plan.sourceRefs)]
    );
  });
  return ok(res, {
    id,
    baseVersion: Number(current.version || 0),
    triggerType: 'manual',
    status: 'pending',
    ...plan,
    createdAt: new Date().toISOString()
  }, '已进入逐条编辑，只有你确认签发后才会生效');
}));

router.post('/review/:id/publish', asyncRoute(async (req, res) => {
  const proposalId = uuid(req.params.id);
  if (!proposalId) return fail(res, 400, '整理建议不存在');
  const published = await db.transaction(async client => {
    const proposalResult = await client.query(
      `SELECT id, base_version, status, payload
         FROM life_os_review_proposals
        WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [proposalId, req.user.id]
    );
    const proposal = proposalResult.rows[0];
    if (!proposal) return { error: 'missing' };
    if (proposal.status !== 'pending') return { error: 'resolved' };

    const currentResult = await client.query(
      'SELECT id, version FROM life_os WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    const current = currentResult.rows[0] || null;
    const currentVersion = Number(current?.version || 0);
    if (currentVersion !== Number(proposal.base_version)) return { error: 'conflict' };

    const stored = proposal.payload || {};
    const storedMap = new Map((stored.principles || []).map(item => [item.key, item]));
    const requested = Array.isArray(req.body.principles) ? req.body.principles : [];
    const selections = requested.length ? requested : (stored.principles || []).map(item => ({ key: item.key, included: true }));
    const selected = [];
    const usedKeys = new Set();
    for (const selection of selections) {
      const item = storedMap.get(text(selection?.key, 24));
      if (!item || selection?.included === false || usedKeys.has(item.key)) continue;
      const principle = text(selection?.principle ?? item.principle, 600);
      if (!principle) continue;
      usedKeys.add(item.key);
      selected.push({
        ...item,
        principle,
        boundary: text(selection?.boundary ?? item.boundary, 600),
        reviewQuestion: text(selection?.reviewQuestion ?? item.reviewQuestion, 600)
      });
    }
    if (!selected.length) return { error: 'empty' };
    if (selected.length > MAX_ACTIVE_CLAUSES) return { error: 'too_many' };

    const nextVersion = currentVersion + 1;
    const contentMd = renderLifeOsMarkdown(selected, stored.tensions || []);
    let lifeOsId;
    if (!current) {
      lifeOsId = crypto.randomUUID();
      await client.query(
        `INSERT INTO life_os (id, user_id, content_md, version)
         VALUES ($1, $2, $3, $4)`,
        [lifeOsId, req.user.id, contentMd, nextVersion]
      );
    } else {
      lifeOsId = current.id;
      await client.query(
        `UPDATE life_os SET content_md = $2, version = $3, updated_at = now()
          WHERE id = $1`,
        [lifeOsId, contentMd, nextVersion]
      );
    }
    const snapshotRefs = uniqueRefs(selected.flatMap(item => [...(item.sourceRefs || []), ...(item.counterSourceRefs || [])]));
    await client.query(
      `INSERT INTO life_os_versions
        (id, user_id, life_os_id, version, content_md, origin, source_refs, generation_meta)
       VALUES ($1, $2, $3, $4, $5, 'ai_assisted', $6::jsonb, $7::jsonb)`,
      [crypto.randomUUID(), req.user.id, lifeOsId, nextVersion, contentMd,
        JSON.stringify(snapshotRefs), JSON.stringify({
          reviewProposalId: proposalId,
          principleCount: selected.length,
          previousPrincipleCount: Number(stored.previousPrincipleCount || 0),
          generatedAt: new Date().toISOString()
        })]
    );
    await client.query(
      `UPDATE life_os_clauses SET status = 'retired', retired_at = now()
        WHERE user_id = $1 AND status = 'active'`,
      [req.user.id]
    );

    const createdClauses = [];
    for (let index = 0; index < selected.length; index += 1) {
      const item = selected[index];
      const clauseId = crypto.randomUUID();
      await client.query(
        `INSERT INTO life_os_clauses
          (id, user_id, snapshot_version, area, statement, boundary, review_question,
           basis, confidence, position, supersedes, source_refs, counter_source_refs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid[], $12::jsonb, $13::jsonb)`,
        [clauseId, req.user.id, nextVersion, item.area, item.principle, item.boundary,
          item.reviewQuestion, item.basis, item.confidence, index,
          item.sourceClauseIds || [], JSON.stringify(item.sourceRefs || []), JSON.stringify(item.counterSourceRefs || [])]
      );
      for (const [relation, refs] of [['support', item.sourceRefs || []], ['challenge', item.counterSourceRefs || []]]) {
        for (const ref of refs) {
          await client.query(
            `INSERT INTO life_os_clause_evidence
              (id, user_id, clause_id, source_type, source_id, relation)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (clause_id, source_type, source_id, relation) DO NOTHING`,
            [crypto.randomUUID(), req.user.id, clauseId, ref.type, ref.id, relation]
          );
        }
      }
      createdClauses.push({
        id: clauseId,
        snapshot_version: nextVersion,
        area: item.area,
        statement: item.principle,
        boundary: item.boundary,
        review_question: item.reviewQuestion,
        basis: item.basis,
        confidence: item.confidence,
        position: index,
        supersedes: item.sourceClauseIds || [],
        source_refs: item.sourceRefs || [],
        counter_source_refs: item.counterSourceRefs || [],
        created_at: new Date()
      });
    }

    const selectedCardKeys = new Set(Array.isArray(req.body.cardDraftKeys)
      ? req.body.cardDraftKeys.map(key => text(key, 24)) : []);
    const createdCards = [];
    for (const draft of (stored.cardDrafts || []).filter(item => selectedCardKeys.has(item.key))) {
      const cardId = crypto.randomUUID();
      await client.query(
        `INSERT INTO cards
          (id, user_id, seed_sentence, my_understanding, usage_items, tags, visibility)
         VALUES ($1, $2, $3, $4, '[]'::jsonb, $5::jsonb, 'PRIVATE')`,
        [cardId, req.user.id, text(draft.seedSentence, 500), text(draft.myUnderstanding, 5000), JSON.stringify(draft.tags || [])]
      );
      createdCards.push({ id: cardId, seedSentence: draft.seedSentence });
    }
    await client.query(
      `UPDATE life_os_review_proposals
          SET status = 'accepted', resolved_at = now(), result = $3::jsonb
        WHERE id = $1 AND user_id = $2`,
      [proposalId, req.user.id, JSON.stringify({ version: nextVersion, clauseCount: selected.length, createdCardIds: createdCards.map(card => card.id) })]
    );
    return {
      version: nextVersion,
      contentMd,
      clauses: createdClauses.map(mapClause),
      createdCards
    };
  });
  if (published.error === 'missing') return fail(res, 404, '整理建议不存在');
  if (published.error === 'resolved') return fail(res, 409, '这份整理建议已经处理过');
  if (published.error === 'conflict') return fail(res, 409, '人生 OS 已经产生新版本，请重新整理');
  if (published.error === 'empty') return fail(res, 400, '至少保留一条你认可的原则');
  if (published.error === 'too_many') return fail(res, 400, `当前生效原则最多 ${MAX_ACTIVE_CLAUSES} 条，请先继续精简`);
  return ok(res, published, `人生 OS V${published.version} 已由你确认签发`);
}));

router.post('/review/:id/reject', asyncRoute(async (req, res) => {
  const proposalId = uuid(req.params.id);
  if (!proposalId) return fail(res, 400, '整理建议不存在');
  const result = await db.query(
    `UPDATE life_os_review_proposals
        SET status = 'rejected', resolved_at = now()
      WHERE id = $1 AND user_id = $2 AND status = 'pending'
      RETURNING id`,
    [proposalId, req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '待处理的整理建议不存在');
  return ok(res, { rejected: true }, '已保留当前版本');
}));

router.get('/config/history', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const [items, total] = await Promise.all([
    db.query(
      `SELECT version, content_md AS "contentMd", origin,
              source_refs AS "sourceRefs", generation_meta AS "generationMeta",
              created_at AS "createdAt"
       FROM life_os_versions WHERE user_id = $1
       ORDER BY version DESC LIMIT $2 OFFSET $3`,
      [req.user.id, pageSize, offset]
    ),
    db.query('SELECT count(*)::int AS total FROM life_os_versions WHERE user_id = $1', [req.user.id])
  ]);
  return ok(res, { list: items.rows, total: total.rows[0].total, page, pageSize });
}));

router.get('/draft/status', asyncRoute(async (req, res) => {
  const counts = await generationCounts(req.user.id);
  return ok(res, {
    enabled: isAiConfigured(),
    diaryCount: counts.diaries,
    cardCount: counts.cards,
    ready: Number(counts.diaries) >= 3,
    privacy: '只有你主动生成时，最近的日记和自己的菇卡才会发送给已配置的模型。'
  });
}));

router.post('/draft', asyncRoute(async (req, res) => {
  if (!isAiConfigured()) return fail(res, 503, '人生 OS 提炼服务尚未配置');
  const context = await generationContext(req.user.id);
  if (Number(context.counts.diaries) < 3) {
    return fail(res, 400, '至少写下 3 天日记后，才适合开始提炼人生 OS');
  }
  const current = await db.query('SELECT content_md FROM life_os WHERE user_id = $1', [req.user.id]);
  const raw = await callJson(LIFE_OS_DRAFT_PROMPT, {
    currentLifeOs: text(current.rows[0]?.content_md, 12000) || null,
    sources: context.sources.map(source => ({
      key: source.key,
      type: source.type,
      date: source.date,
      content: source.content,
      mood: source.mood,
      tags: source.tags
    }))
  }, '人生 OS 提炼', {
    temperature: 0.2,
    maxTokens: 5000,
    usageContext: { userId: req.user.id, feature: 'life_os_draft' }
  });
  const draft = normalizeLifeOsDraft(raw, context.sources);
  if (!draft.principles.length) {
    return fail(res, 503, '这些记录里还没有找到至少两条证据支持的稳定原则，这次没有生成草案');
  }
  const generatedAt = new Date().toISOString();
  return ok(res, {
    contentMd: buildLifeOsMarkdown(draft),
    sourceRefs: draft.sourceRefs,
    summary: draft.summary,
    principleCount: draft.principles.length,
    diaryCount: context.counts.diaries,
    cardCount: context.counts.cards,
    generatedAt
  }, '草案已生成，请检查和修改后再保存');
}));

module.exports = router;
