'use strict';

const { normalizeResultType } = require('./ai-result-conversation');

function clean(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function fingerprintVersion(value) {
  const input = clean(value, 64);
  if (!/^[0-9a-f]{8,64}$/i.test(input)) return 1;
  return (Number.parseInt(input.slice(0, 8), 16) % 2147483646) + 1;
}

function displaySummary(type, result) {
  if (type === 'DIARY_ANALYSIS') {
    const observations = Array.isArray(result?.observations) ? result.observations : [];
    const first = observations.find(item => item?.result?.summary || item?.result?.essence || item?.result?.title);
    return clean(first?.result?.summary || first?.result?.essence || first?.result?.title || '这一天的多视角分析', 500);
  }
  if (type === 'DAILY_REVIEW') {
    return clean(result?.criticalReview?.issue || result?.headline || '这一天的总结', 500);
  }
  return clean(result?.summary || '这个问题此刻的理解', 500);
}

function diarySource(row) {
  const content = clean(row.content, 16000);
  if (!content) return null;
  return {
    sourceRef: 'D1',
    sourceType: 'DIARY',
    sourceId: row.diary_id || row.id,
    diaryId: row.diary_id || row.id,
    sourceVersion: Number(row.content_version || 1),
    occurredAt: row.occurred_at || null,
    label: '日记原文',
    content,
    sourceStart: 0,
    sourceEnd: content.length
  };
}

function externalContextSources(items, prefix = 'X') {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    sourceRef: `${prefix}${index + 1}`,
    sourceType: item.sourceType || item.type || 'CONTEXT_RECORD',
    sourceId: item.id || null,
    occurredAt: item.occurredAt || item.date || item.completedAt || null,
    label: clean(item.label || item.title || item.sourceName || '上下文记录', 160),
    content: clean(item.content || item.excerpt || item.summary || item.title, 6000),
    sourceStart: 0,
    sourceEnd: clean(item.content || item.excerpt || item.summary || item.title, 6000).length
  })).filter(item => item.content);
}

async function diaryAnalysisOrigin(queryable, userId, resultId) {
  const response = await queryable.query(
    `SELECT da.*, d.content, d.content_version, d.occurred_at, d.ai_allowed, d.deleted_at
       FROM diary_analysis da
       JOIN diaries d ON d.id = da.diary_id AND d.user_id = da.user_id
      WHERE da.id = $1 AND da.user_id = $2 AND da.status = 'done'`,
    [resultId, userId]
  );
  const row = response.rows[0];
  if (!row || row.deleted_at || !row.ai_allowed) return null;
  const storedContext = row.ai_context_snapshot && Object.keys(row.ai_context_snapshot).length
    ? row.ai_context_snapshot : null;
  const source = diarySource({ ...row, diary_id: row.diary_id });
  if (!source) return null;
  const observations = Array.isArray(row.observations) ? row.observations : [];
  const content = {
    observers: Array.isArray(row.observer_snapshot) ? row.observer_snapshot : [],
    observations,
    fiveViews: row.five_views || {},
    todoCandidates: Array.isArray(row.todo_candidates) ? row.todo_candidates : [],
    cardSuggestion: row.card_suggestion || null
  };
  const context = storedContext || {
    version: 'legacy-reconstructed-v1',
    capturedAt: new Date().toISOString(),
    sources: [source],
    importantContext: {
      note: '历史分析没有保存完整生成上下文；本次只使用当前版本日记与当时保存的分析。'
    }
  };
  if (!Array.isArray(context.sources) || !context.sources.length) context.sources = [source];
  return {
    type: 'DIARY_ANALYSIS',
    id: String(row.id),
    version: 1,
    seedDiaryId: row.diary_id,
    title: '围绕这一天继续聊聊',
    originSnapshot: {
      resultKind: 'DIARY_ANALYSIS',
      displayTitle: '围绕这一天继续聊聊',
      displaySummary: displaySummary('DIARY_ANALYSIS', content),
      generatedAt: row.finished_at || row.updated_at,
      nature: 'AI_GENERATED_INTERPRETATION',
      content
    },
    contextSnapshot: context
  };
}

async function dailyReviewOrigin(queryable, userId, resultId) {
  const response = await queryable.query(
    `SELECT * FROM daily_reviews
      WHERE id = $1 AND user_id = $2 AND status = 'READY'`,
    [resultId, userId]
  );
  const row = response.rows[0];
  if (!row) return null;
  let context = row.ai_context_snapshot && Object.keys(row.ai_context_snapshot).length
    ? row.ai_context_snapshot : null;
  if (!context) {
    const refs = Array.isArray(row.source_refs) ? row.source_refs : [];
    const diaryIds = refs.filter(item => item.type === 'DIARY' && item.id).map(item => item.id);
    const diaries = diaryIds.length ? await queryable.query(
      `SELECT id, content, content_version, occurred_at FROM diaries
        WHERE user_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL AND ai_allowed`,
      [userId, diaryIds]
    ) : { rows: [] };
    const sources = diaries.rows.map((diary, index) => ({ ...diarySource(diary), sourceRef: `D${index + 1}` }));
    sources.push(...externalContextSources(refs.filter(item => item.type !== 'DIARY'), 'R'));
    context = {
      version: 'legacy-reconstructed-v1',
      capturedAt: new Date().toISOString(),
      sources,
      importantContext: { reviewDate: row.review_date }
    };
  }
  return {
    type: 'DAILY_REVIEW',
    id: String(row.id),
    version: fingerprintVersion(row.source_fingerprint),
    seedDiaryId: null,
    title: '围绕这份每日总结继续聊聊',
    originSnapshot: {
      resultKind: 'DAILY_REVIEW',
      displayTitle: '围绕这份每日总结继续聊聊',
      displaySummary: displaySummary('DAILY_REVIEW', row.result),
      generatedAt: row.updated_at,
      nature: 'AI_GENERATED_INTERPRETATION',
      content: row.result || {}
    },
    contextSnapshot: context
  };
}

async function inquirySynthesisOrigin(queryable, userId, inquiryId, version) {
  const response = await queryable.query(
    `SELECT s.*, i.question, i.context, i.inquiry_type
       FROM inquiry_syntheses s
       JOIN inquiries i ON i.id = s.inquiry_id AND i.user_id = s.user_id
      WHERE s.inquiry_id = $1 AND s.user_id = $2 AND s.version = $3
        AND s.invalidated_at IS NULL`,
    [inquiryId, userId, version]
  );
  const row = response.rows[0];
  if (!row) return null;
  let context = row.ai_context_snapshot && Object.keys(row.ai_context_snapshot).length
    ? row.ai_context_snapshot : null;
  if (!context) {
    const refs = Array.isArray(row.evidence_refs) ? row.evidence_refs : [];
    const evidenceIds = refs.map(item => item.evidenceId).filter(Boolean);
    const evidence = evidenceIds.length ? await queryable.query(
      `SELECT e.id, e.source_type, e.source_label,
              CASE WHEN e.diary_id IS NOT NULL THEN d.content ELSE e.excerpt END AS content,
              e.diary_id, d.content_version, COALESCE(d.occurred_at, e.created_at) AS occurred_at
         FROM inquiry_evidence e
         LEFT JOIN diaries d ON d.id = e.diary_id AND d.user_id = e.user_id
          AND d.deleted_at IS NULL AND d.ai_allowed
        WHERE e.user_id = $1 AND e.inquiry_id = $2 AND e.id = ANY($3::uuid[])
          AND (e.diary_id IS NULL OR d.id IS NOT NULL)`,
      [userId, inquiryId, evidenceIds]
    ) : { rows: [] };
    context = {
      version: 'legacy-reconstructed-v1',
      capturedAt: new Date().toISOString(),
      sources: evidence.rows.map((item, index) => {
        const content = clean(item.content, 16000);
        return {
          sourceRef: refs.find(ref => String(ref.evidenceId) === String(item.id))?.key || `E${index + 1}`,
          sourceType: item.diary_id ? 'DIARY' : item.source_type,
          sourceId: item.id,
          diaryId: item.diary_id || null,
          sourceVersion: item.content_version ? Number(item.content_version) : null,
          occurredAt: item.occurred_at,
          label: clean(item.source_label || item.source_type, 160),
          content,
          sourceStart: 0,
          sourceEnd: content.length
        };
      }),
      importantContext: {
        inquiry: { question: row.question, context: row.context, inquiryType: row.inquiry_type }
      }
    };
  }
  return {
    type: 'INQUIRY_SYNTHESIS',
    id: String(row.inquiry_id),
    version: Number(row.version),
    seedDiaryId: null,
    title: '围绕这个问题继续聊聊',
    originSnapshot: {
      resultKind: 'INQUIRY_SYNTHESIS',
      displayTitle: '围绕这个问题继续聊聊',
      displaySummary: displaySummary('INQUIRY_SYNTHESIS', row.result),
      generatedAt: row.created_at,
      nature: 'AI_GENERATED_INTERPRETATION',
      content: row.result || {}
    },
    contextSnapshot: context
  };
}

async function loadAiResultOrigin(queryable, userId, input) {
  const type = normalizeResultType(input?.resultType);
  const id = clean(input?.resultId, 160);
  const version = Math.max(1, Math.min(100000, Number(input?.resultVersion) || 1));
  if (!type || !id) return null;
  if (type === 'DIARY_ANALYSIS') return diaryAnalysisOrigin(queryable, userId, id);
  if (type === 'DAILY_REVIEW') return dailyReviewOrigin(queryable, userId, id);
  return inquirySynthesisOrigin(queryable, userId, id, version);
}

module.exports = {
  dailyReviewOrigin,
  diaryAnalysisOrigin,
  displaySummary,
  inquirySynthesisOrigin,
  loadAiResultOrigin
};
