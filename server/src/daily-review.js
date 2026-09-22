'use strict';

const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const { callJson, isAiConfigured } = require('./ai-engine');
const { listDiarySourceActivities } = require('./data-sources');

const DAILY_REVIEW_VERSION = 'daily-review-v3-one-judgment-r1';

const DAILY_REVIEW_PROMPT = `你是 Shroom 的每日复盘助手。只做一件事：基于当天真实证据，选出一个最需修正的问题，并给出下一次唯一行动。

严格规则：
1. 只能使用输入中的 sources；Codex 任务只证明工具任务发生过，运行时间不等于人的专注时间，任务完成不等于现实结果完成。如果 criticalReview 只引用 CODEX_TASK，只能批评“工作记录呈现出的编排方式”或“结果证据缺口”，不得断言用户亲手执行、持续盯着、投入了多少时间或注意力被切碎。
2. 没有记录不等于用户没做；证据不足必须明确写“证据不足”。
3. 只输出一个问题和一个行动，不写背景、代价、总结、完成清单、人生 OS、复利分析或所有权建议。
4. issue 最多 44 个汉字，直接写问题；recommendation 最多 60 个汉字，必须具体到下一次行为，不能写“继续努力、保持专注、多复盘”之类空话。
5. 按优先级寻找：明确的人生 OS 偏离；高活动但缺少结果或复用证据；本应停止或委派却由本人重复执行；注意力分散。确实没有足够证据时，直说“没有足够证据指出具体失误”，不得为了显得尖锐而编造问题。
6. sourceRefs 只能引用输入中存在的 key。

只返回 JSON：{"criticalReview":{"issue":"今天最需要修正的一个问题","recommendation":"下一次唯一、具体、可执行的行动","sourceRefs":["C1"]}}`;

function clean(value, max = 1200) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function dateText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return todayInShanghai(value);
}

function todayInShanghai(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

function validReviewDate(value, now = new Date()) {
  const date = clean(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime()) || date > todayInShanghai(now)) return null;
  return date;
}

function sourceReferences(value, allowed, max = 8) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => clean(item, 24)))]
    .filter(item => allowed.has(item)).slice(0, max);
}

function evidenceItems(value, allowed, max = 12, textMax = 600) {
  return (Array.isArray(value) ? value : []).slice(0, max).map(item => ({
    text: clean(item?.text, textMax),
    sourceRefs: sourceReferences(item?.sourceRefs, allowed)
  })).filter(item => item.text && item.sourceRefs.length);
}

function legacyLifeOsClauses(markdown, snapshotVersion, max = 12) {
  let area = '人生 OS';
  const candidates = [];
  const seen = new Set();
  String(markdown || '').split(/\r?\n/).forEach((line, order) => {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{2,3}\s+(.+)$/);
    if (heading) {
      area = clean(heading[1].replace(/[*_`]/g, ''), 80) || area;
      return;
    }
    let priority = 99;
    if (/^R\d+【/.test(trimmed)) priority = 0;
    else if (/^(?:[-*]\s*)?(?:\*\*)?(?:任何|每天必须|不要|禁止|优先|必须|只保留)/.test(trimmed)) priority = 1;
    else if (/^>/.test(trimmed) && /(?:长期|系统|复利|规则|AI|未来|目标|价值)/i.test(trimmed)) priority = 2;
    if (priority === 99) return;
    const principle = clean(trimmed.replace(/^>\s*/, '').replace(/^[-*]\s*/, '').replace(/[*_`]/g, ''), 500);
    if (principle.length < 5 || seen.has(principle)) return;
    seen.add(principle);
    const digest = crypto.createHash('sha256').update(`${snapshotVersion}:${principle}`).digest('hex').slice(0, 16);
    candidates.push({
      id: `legacy-${digest}`, snapshotVersion: Number(snapshotVersion || 0), area,
      principle, boundary: '', reviewQuestion: '', confidence: 'LEGACY_SIGNED', priority, order
    });
  });
  return candidates.sort((left, right) => left.priority - right.priority || left.order - right.order)
    .slice(0, max).map(({ priority, order, ...item }) => item);
}

function normalizeDailyReview(value, context) {
  const allowed = new Set(context.sources.map(item => item.key));
  const clauseIds = new Set(context.lifeOsClauses.map(item => item.id));
  const lifeOsAudit = (Array.isArray(value?.lifeOsAudit) ? value.lifeOsAudit : [])
    .slice(0, context.lifeOsClauses.length).map(item => ({
      clauseId: clauseIds.has(String(item?.clauseId || '')) ? String(item.clauseId) : '',
      status: ['ALIGNED', 'DEVIATED', 'NOT_TRIGGERED', 'INSUFFICIENT'].includes(item?.status)
        ? item.status : 'INSUFFICIENT',
      reason: clean(item?.reason, 800),
      sourceRefs: sourceReferences(item?.sourceRefs, allowed)
    })).filter(item => item.clauseId).map(item => {
      if (item.status !== 'INSUFFICIENT' && !item.sourceRefs.length) {
        item.status = 'INSUFFICIENT';
        item.reason = '没有可核对的当天来源，不能据此判断这条人生 OS。';
      }
      const clause = context.lifeOsClauses.find(candidate => candidate.id === item.clauseId);
      return { ...item, area: clause?.area || '', principle: clause?.principle || '' };
    });
  for (const clause of context.lifeOsClauses) {
    if (!lifeOsAudit.some(item => item.clauseId === clause.id)) {
      lifeOsAudit.push({
        clauseId: clause.id, area: clause.area, principle: clause.principle,
        status: 'INSUFFICIENT', reason: '当天证据不足，不能判断是否触发。', sourceRefs: []
      });
    }
  }
  const auditOrder = { DEVIATED: 0, INSUFFICIENT: 1, ALIGNED: 2, NOT_TRIGGERED: 3 };
  lifeOsAudit.sort((left, right) => auditOrder[left.status] - auditOrder[right.status]);
  const ownershipDecisions = (Array.isArray(value?.ownershipDecisions) ? value.ownershipDecisions : [])
    .slice(0, 8).map(item => ({
      task: clean(item?.task, 300),
      owner: ['SELF', 'CODEX', 'STAFF', 'STOP'].includes(item?.owner) ? item.owner : 'SELF',
      reason: clean(item?.reason, 700),
      sourceRefs: sourceReferences(item?.sourceRefs, allowed)
    })).filter(item => item.task && item.reason && item.sourceRefs.length);
  const ownerOrder = { STOP: 0, CODEX: 1, STAFF: 2, SELF: 3 };
  ownershipDecisions.sort((left, right) => ownerOrder[left.owner] - ownerOrder[right.owner]);
  const adjustment = value?.tomorrowAdjustment || {};
  const candidate = value?.criticalReview || {};
  const candidateRefs = sourceReferences(candidate.sourceRefs, allowed);
  const supportedCriticalReview = clean(candidate.issue, 44)
    && clean(candidate.recommendation, 60) && candidateRefs.length;
  const criticalReview = supportedCriticalReview ? {
    issue: clean(candidate.issue, 44),
    consequence: '',
    recommendation: clean(candidate.recommendation, 60),
    sourceRefs: candidateRefs
  } : {
    issue: '今天没有足够证据指出具体失误',
    consequence: '',
    recommendation: clean(adjustment.action, 60)
      || '补一条最能证明实际结果或时间取舍的记录，再决定下一步修正。',
    sourceRefs: sourceReferences(adjustment.sourceRefs, allowed)
  };
  return {
    criticalReview,
    headline: clean(value?.headline, 240) || '今天的记录还不足以形成可靠判断',
    factsSummary: clean(value?.factsSummary, 180) || '已整理当天可读取记录；缺少的记录不会被解释为没有行动。',
    evidenceHighlights: evidenceItems(value?.evidenceHighlights, allowed, 5, 220),
    lifeOsAudit,
    compoundReview: {
      personalAssets: evidenceItems(value?.compoundReview?.personalAssets, allowed, 8),
      businessAssets: evidenceItems(value?.compoundReview?.businessAssets, allowed, 8),
      oneOffWork: evidenceItems(value?.compoundReview?.oneOffWork, allowed, 8),
      opportunities: evidenceItems(value?.compoundReview?.opportunities, allowed, 6)
    },
    ownershipDecisions,
    tomorrowAdjustment: {
      action: criticalReview.recommendation,
      why: criticalReview.consequence,
      sourceRefs: criticalReview.sourceRefs
    },
    caveats: (Array.isArray(value?.caveats) ? value.caveats : [])
      .slice(0, 8).map(item => clean(item, 500)).filter(Boolean)
  };
}

function fallbackDailyReview(context) {
  const counts = context.coverage;
  const summary = [
    counts.diaryCount ? `${counts.diaryCount} 篇日记` : '',
    counts.codexTaskCount ? `${counts.codexTaskCount} 个 Codex 任务` : '',
    counts.completedTodoCount ? `${counts.completedTodoCount} 个已完成待办` : ''
  ].filter(Boolean).join('、');
  return normalizeDailyReview({
    criticalReview: summary ? {
      issue: '今天最大的复盘缺口是：有活动记录，但缺少可验证的现实结果',
      consequence: '如果把任务发生或完成直接当成结果，会高估有效投入，也无法判断是否符合人生 OS 或形成复利。',
      recommendation: '补一条实际交付、真实复用或明确取舍的结果证据，再决定下一步。',
      sourceRefs: context.sources.slice(0, 5).map(item => item.key)
    } : undefined,
    headline: summary ? `今天留下了 ${summary}` : '今天还没有足够的可读取记录',
    factsSummary: summary
      ? `系统只能确认${summary}；这不等于投入时长、现实交付或能力提升已经得到证明。`
      : '没有记录不能证明今天没有行动。可以补一条日记或等待 Codex 完成同步。',
    lifeOsAudit: context.lifeOsClauses.map(item => ({
      clauseId: item.id, status: 'INSUFFICIENT', reason: '缺少足够语义判断，暂不对这条人生 OS 下结论。', sourceRefs: []
    })),
    caveats: ['AI 当前不可用，因此这里只展示事实层，不生成推测性的价值判断。']
  }, context);
}

function sourceFingerprint(context) {
  return crypto.createHash('sha256').update(JSON.stringify({
    reviewVersion: DAILY_REVIEW_VERSION,
    date: context.date,
    sources: context.sourceManifest,
    lifeOs: context.lifeOsClauses.map(item => [item.id, item.snapshotVersion, item.principle, item.boundary]),
    plans: context.compoundPlans.map(item => [item.id, item.updatedAt])
  })).digest('hex');
}

async function loadDailyReviewContext(userId, date, queryable = db) {
  const sourceCutoff = new Date().toISOString();
  const [diaries, activities, todos, clauses, legacyLifeOs, plans, events, sync] = await Promise.all([
    queryable.query(
      `SELECT id, content, mood, content_version,
              to_char(occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
         FROM diaries
        WHERE user_id = $1 AND deleted_at IS NULL AND ai_allowed
          AND (occurred_at AT TIME ZONE 'Asia/Shanghai')::date = $2::date
        ORDER BY occurred_at LIMIT 20`,
      [userId, date]
    ),
    listDiarySourceActivities(queryable, userId, date, { aiOnly: true }),
    queryable.query(
      `SELECT t.id, t.content, t.result_text, t.completed_at, p.name AS project_name
         FROM todos t LEFT JOIN todo_projects p ON p.id = t.project_id AND p.user_id = t.user_id
        WHERE t.user_id = $1 AND t.deleted_at IS NULL AND t.status = 'completed'
          AND (t.completed_at AT TIME ZONE 'Asia/Shanghai')::date = $2::date
        ORDER BY t.completed_at LIMIT 30`,
      [userId, date]
    ),
    queryable.query(
      `SELECT id, snapshot_version, area, statement, boundary, review_question, confidence
         FROM life_os_clauses WHERE user_id = $1 AND status = 'active'
        ORDER BY position, created_at LIMIT 12`,
      [userId]
    ),
    queryable.query('SELECT content_md, version FROM life_os WHERE user_id = $1', [userId]),
    queryable.query(
      `SELECT id, title, desired_outcome, compound_mechanism, current_step, current_milestone,
              stop_list, outcome_evidence, updated_at
         FROM compound_threads WHERE user_id = $1 AND status = 'ACTIVE'
        ORDER BY is_primary DESC, last_activity_at DESC LIMIT 3`,
      [userId]
    ),
    queryable.query(
      `SELECT e.id, e.thread_id, e.kind, e.summary, e.payload, e.created_at
         FROM compound_events e
        WHERE e.user_id = $1 AND e.status = 'CONFIRMED' AND e.source_valid
          AND (e.created_at AT TIME ZONE 'Asia/Shanghai')::date = $2::date
        ORDER BY e.created_at LIMIT 30`,
      [userId, date]
    ),
    queryable.query(
      `SELECT max(last_sync_at) AS last_sync_at FROM data_source_connections
        WHERE user_id = $1 AND provider = 'CODEX' AND status IN ('ACTIVE', 'PAUSED')`,
      [userId]
    )
  ]);

  const sources = [];
  diaries.rows.forEach((row, index) => sources.push({
    key: `D${index + 1}`, type: 'DIARY', id: row.id, date: row.source_date,
    label: `${row.source_date} 的日记`, content: clean(row.content, 2400), mood: row.mood || null
  }));
  activities.forEach((item, index) => sources.push({
    key: `C${index + 1}`, type: 'CODEX_TASK', id: item.id, connectionId: item.connectionId, date,
    label: item.projectName ? `Codex · ${item.projectName}` : 'Codex 任务',
    title: item.title, outcomeStatus: item.outcomeStatus, turnCount: item.turnCount,
    completedTurns: item.completedTurns, interruptedTurns: item.interruptedTurns, failedTurns: item.failedTurns
  }));
  todos.rows.forEach((row, index) => sources.push({
    key: `T${index + 1}`, type: 'TODO', id: row.id, date,
    label: row.project_name ? `待办 · ${row.project_name}` : '已完成待办',
    title: clean(row.content, 500), result: clean(row.result_text, 1200)
  }));
  events.rows.forEach((row, index) => sources.push({
    key: `E${index + 1}`, type: 'COMPOUND_EVENT', id: row.id, date,
    label: `复利记录 · ${row.kind}`, summary: clean(row.summary, 1200), payload: row.payload || {}
  }));
  let lifeOsClauses = clauses.rows.map(row => ({
    id: String(row.id), snapshotVersion: Number(row.snapshot_version), area: row.area,
    principle: row.statement, boundary: row.boundary || '', reviewQuestion: row.review_question || '',
    confidence: row.confidence
  }));
  if (!lifeOsClauses.length && legacyLifeOs.rows[0]?.content_md) {
    lifeOsClauses = legacyLifeOsClauses(
      legacyLifeOs.rows[0].content_md,
      legacyLifeOs.rows[0].version,
      12
    );
  }
  const compoundPlans = plans.rows.map(row => ({
    id: String(row.id), title: row.title, desiredOutcome: row.desired_outcome,
    compoundMechanism: row.compound_mechanism, currentStep: row.current_step,
    currentMilestone: row.current_milestone, stopList: row.stop_list || [],
    outcomeEvidence: row.outcome_evidence, updatedAt: row.updated_at
  }));
  const sourceManifest = sources.map(item => ({
    key: item.key, type: item.type, id: item.id, date: item.date,
    fingerprint: crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex')
  }));
  const context = {
    date,
    sourceCutoff,
    sources,
    sourceManifest,
    lifeOsClauses,
    compoundPlans,
    lastCodexSyncAt: sync.rows[0]?.last_sync_at || null,
    coverage: {
      diaryCount: diaries.rowCount,
      codexTaskCount: activities.length,
      completedTodoCount: todos.rowCount,
      compoundEvidenceCount: events.rowCount,
      lifeOsClauseCount: lifeOsClauses.length,
      activeCompoundPlanCount: plans.rowCount
    }
  };
  context.fingerprint = sourceFingerprint(context);
  return context;
}

function publicSourceRefs(context) {
  return context.sources.map(item => ({
    key: item.key, type: item.type, id: item.id, date: item.date, label: item.label,
    connectionId: item.type === 'CODEX_TASK' ? item.connectionId : undefined,
    title: item.type === 'DIARY' ? '' : clean(item.title || item.summary, 300)
  }));
}

async function createReviewResult(userId, context) {
  if (!isAiConfigured()) return { result: fallbackDailyReview(context), modelVersion: '' };
  try {
    const raw = await callJson(DAILY_REVIEW_PROMPT, {
      date: context.date,
      evidenceRules: {
        codexRuntimeIsHumanFocusTime: false,
        taskCompletionIsRealWorldSuccess: false,
        missingRecordMeansNoAction: false
      },
      sources: context.sources,
      signedLifeOs: context.lifeOsClauses,
      activeCompoundPlans: context.compoundPlans
    }, '每日总结', {
      temperature: 0.2,
      maxTokens: 800,
      usageContext: { userId, feature: 'daily_review', billable: false }
    });
    return { result: normalizeDailyReview(raw, context), modelVersion: config.aiModel };
  } catch (error) {
    console.error('daily review AI fallback', { userId, date: context.date, code: error.code, message: error.message });
    return { result: fallbackDailyReview(context), modelVersion: '' };
  }
}

function mapReview(row, context = null) {
  if (!row) return null;
  return {
    id: row.id,
    date: dateText(row.review_date),
    status: row.status,
    result: row.result || {},
    sources: row.source_refs || [],
    sourceCutoff: row.source_cutoff,
    sourceFingerprint: row.source_fingerprint,
    generatedBy: row.generated_by,
    modelVersion: row.model_version || '',
    viewedAt: row.viewed_at,
    emailStatus: row.email_status,
    emailedAt: row.emailed_at,
    stale: context ? row.source_fingerprint !== context.fingerprint : false,
    lastCodexSyncAt: context?.lastCodexSyncAt || null,
    coverage: context?.coverage || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInboxReview(row) {
  if (!row) return null;
  const result = row.result || {};
  const date = dateText(row.review_date);
  return {
    id: row.id,
    type: 'DAILY_REVIEW',
    date,
    title: result.criticalReview?.issue
      ? `最需要修正：${result.criticalReview.issue}`
      : (result.headline || `${date} 的菇每日总结`),
    preview: result.criticalReview?.recommendation
      ? `建议：${result.criticalReview.recommendation}`
      : (result.factsSummary || '当天总结已经准备好。'),
    unread: !row.viewed_at,
    readAt: row.viewed_at,
    availableAt: row.updated_at || row.created_at,
    route: `/pages/shroom/daily-review?date=${date}`
  };
}

async function reviewRow(userId, date, queryable = db) {
  const result = await queryable.query(
    'SELECT * FROM daily_reviews WHERE user_id = $1 AND review_date = $2::date',
    [userId, date]
  );
  return result.rows[0] || null;
}

async function generateDailyReview(userId, date, options = {}) {
  const context = options.context || await loadDailyReviewContext(userId, date);
  const generated = await createReviewResult(userId, context);
  const id = options.id || crypto.randomUUID();
  const generatedBy = ['USER', 'EMAIL', 'INBOX'].includes(options.generatedBy)
    ? options.generatedBy : 'USER';
  const result = await db.query(
    `INSERT INTO daily_reviews
      (id, user_id, review_date, status, result, source_refs, source_fingerprint,
       source_cutoff, generated_by, model_version, error_message)
     VALUES ($1, $2, $3::date, 'READY', $4::jsonb, $5::jsonb, $6, $9::timestamptz, $7, $8, '')
     ON CONFLICT (user_id, review_date) DO UPDATE SET
       status = 'READY', result = EXCLUDED.result, source_refs = EXCLUDED.source_refs,
       source_fingerprint = EXCLUDED.source_fingerprint, source_cutoff = EXCLUDED.source_cutoff,
       generated_by = EXCLUDED.generated_by, model_version = EXCLUDED.model_version,
       error_message = '', updated_at = now()
     RETURNING *`,
    [id, userId, date, JSON.stringify(generated.result), JSON.stringify(publicSourceRefs(context)),
      context.fingerprint, generatedBy, generated.modelVersion,
      context.sourceCutoff]
  );
  return mapReview(result.rows[0], context);
}

async function openDailyReview(userId, date) {
  const context = await loadDailyReviewContext(userId, date);
  let row = await reviewRow(userId, date);
  if (!row || row.status !== 'READY' || row.source_fingerprint !== context.fingerprint) {
    await generateDailyReview(userId, date, { context, generatedBy: 'USER', id: row?.id });
  }
  const opened = await db.query(
    `UPDATE daily_reviews SET viewed_at = COALESCE(viewed_at, now()),
       email_status = CASE WHEN email_status IN ('PENDING', 'PROCESSING', 'FAILED') THEN 'SKIPPED' ELSE email_status END,
       updated_at = now()
     WHERE user_id = $1 AND review_date = $2::date RETURNING *`,
    [userId, date]
  );
  return mapReview(opened.rows[0], context);
}

module.exports = {
  DAILY_REVIEW_PROMPT,
  DAILY_REVIEW_VERSION,
  fallbackDailyReview,
  generateDailyReview,
  legacyLifeOsClauses,
  loadDailyReviewContext,
  mapInboxReview,
  mapReview,
  normalizeDailyReview,
  openDailyReview,
  reviewRow,
  sourceFingerprint,
  todayInShanghai,
  validReviewDate
};
