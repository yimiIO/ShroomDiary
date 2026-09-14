'use strict';

const db = require('./db');
const { embedTexts, embeddingProfile, isEmbeddingConfigured, toPgVector } = require('./embedding-provider');
const {
  codexCorpusCounts,
  codexKeywordChannel,
  codexTemporalChannel
} = require('./external-memory');

function normalizedScope(value = {}) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const ids = Array.isArray(value.diaryIds)
    ? [...new Set(value.diaryIds.map(String).filter(item => /^[0-9a-f-]{36}$/i.test(item)))].slice(0, 100)
    : [];
  return {
    dateFrom: datePattern.test(String(value.dateFrom || '')) ? value.dateFrom : null,
    dateTo: datePattern.test(String(value.dateTo || '')) ? value.dateTo : null,
    diaryIds: ids
  };
}

function scopeSql(alias, scope, startIndex) {
  const clauses = [];
  const values = [];
  let index = startIndex;
  if (scope.dateFrom) {
    clauses.push(alias + ".occurred_at >= ($" + index + "::date::timestamp AT TIME ZONE 'Asia/Shanghai')");
    values.push(scope.dateFrom);
    index += 1;
  }
  if (scope.dateTo) {
    clauses.push(alias + ".occurred_at < (($" + index + "::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')");
    values.push(scope.dateTo);
    index += 1;
  }
  if (scope.diaryIds.length) {
    clauses.push(alias + '.id = ANY($' + index + '::uuid[])');
    values.push(scope.diaryIds);
    index += 1;
  }
  return { clause: clauses.length ? ' AND ' + clauses.join(' AND ') : '', values };
}

const ignoredTerms = new Set([
  '什么', '怎么', '怎样', '哪些', '有没有', '是不是', '为什么', '以前', '过去',
  '现在', '这篇', '日记', '记录', '变化', '几年', '一年', '今年', '去年', '自己'
]);

function keywordTerms(value) {
  const terms = [];
  const groups = String(value || '').match(/[A-Za-z0-9_-]{2,}|[\u3400-\u9fff]{2,}/g) || [];
  for (const group of groups) {
    if (/^[\u3400-\u9fff]+$/u.test(group) && group.length > 4) {
      for (let index = 0; index < group.length - 1; index += 2) terms.push(group.slice(index, index + 2));
    } else {
      terms.push(group);
    }
  }
  return [...new Set(terms.map(item => item.trim()).filter(item => item.length >= 2 && !ignoredTerms.has(item)))].slice(0, 10);
}

function excerptAround(content, terms, preferredStart = null, preferredEnd = null) {
  const source = String(content || '');
  let start = Number.isInteger(preferredStart) ? preferredStart : -1;
  let end = Number.isInteger(preferredEnd) ? preferredEnd : -1;
  if (start < 0 || end <= start || end > source.length) {
    const hit = terms.map(term => source.indexOf(term)).filter(index => index >= 0).sort((a, b) => a - b)[0];
    start = hit === undefined ? 0 : Math.max(0, hit - 180);
    end = Math.min(source.length, start + 760);
  } else {
    start = Math.max(0, start - 100);
    end = Math.min(source.length, Math.max(end + 100, start + 320));
  }
  start = Math.min(start, Math.max(0, source.length - 1));
  end = Math.max(start + 1, Math.min(source.length, end));
  return { sourceStart: start, sourceEnd: end, excerpt: source.slice(start, end) };
}

function rrfMerge(channels, seedDiaryId, limit) {
  const merged = new Map();
  for (const channel of channels) {
    channel.rows.forEach((row, index) => {
      if (String(row.diary_id) === String(seedDiaryId || '')) return;
      const key = row.memory_key || row.diary_id;
      if (!key) return;
      const current = merged.get(key) || { row, score: 0, reasons: [] };
      current.score += 1 / (60 + index + 1);
      current.reasons.push(channel.name);
      if (channel.name === 'semantic') current.row = row;
      merged.set(key, current);
    });
  }
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

async function corpusCounts(userId, scope, profile) {
  const scoped = scopeSql('d', scope, 2);
  const total = await db.query(
    `SELECT count(*)::int AS total, min(d.occurred_at) AS first_at, max(d.occurred_at) AS last_at
       FROM diaries d WHERE d.user_id = $1 AND d.deleted_at IS NULL AND d.ai_allowed${scoped.clause}`,
    [userId, ...scoped.values]
  );
  let indexed = 0;
  if (profile) {
    const indexedResult = await db.query(
      `SELECT count(DISTINCT d.id)::int AS total
         FROM diaries d JOIN diary_chunks c ON c.diary_id = d.id AND c.user_id = d.user_id
        WHERE d.user_id = $1 AND d.deleted_at IS NULL AND d.ai_allowed
          AND c.source_version = d.content_version AND c.index_epoch = d.index_epoch
          AND c.embedding_profile_id = $2${scopeSql('d', scope, 3).clause}`,
      [userId, profile.id, ...scopeSql('d', scope, 3).values]
    );
    indexed = indexedResult.rows[0].total;
  }
  return {
    total: total.rows[0].total,
    indexed,
    firstAt: total.rows[0].first_at,
    lastAt: total.rows[0].last_at
  };
}

async function seedDiary(userId, diaryId) {
  if (!diaryId) return null;
  const result = await db.query(
    `SELECT id AS diary_id, content, content_version, index_epoch, occurred_at, mood
       FROM diaries WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND ai_allowed`,
    [diaryId, userId]
  );
  return result.rows[0] || null;
}

async function semanticChannel(userId, query, scope, profile) {
  if (!profile || !query.trim()) return { name: 'semantic', rows: [] };
  try {
    const [vector] = await embedTexts([query]);
    const scoped = scopeSql('d', scope, 4);
    const result = await db.query(
      `SELECT c.diary_id, d.content, d.content_version, d.occurred_at, d.mood,
              c.source_start, c.source_end, c.embedding <=> $2::vector AS distance
         FROM diary_chunks c
         JOIN diaries d ON d.id = c.diary_id AND d.user_id = c.user_id
        WHERE c.user_id = $1 AND c.embedding_profile_id = $3
          AND d.deleted_at IS NULL AND d.ai_allowed
          AND c.source_version = d.content_version AND c.index_epoch = d.index_epoch
          ${scoped.clause}
        ORDER BY c.embedding <=> $2::vector
        LIMIT 36`,
      [userId, toPgVector(vector), profile.id, ...scoped.values]
    );
    return { name: 'semantic', rows: result.rows };
  } catch (error) {
    console.error('semantic diary retrieval unavailable', { code: error.code, message: error.message });
    return { name: 'semantic', rows: [] };
  }
}

async function keywordChannel(userId, terms, scope) {
  if (!terms.length) return { name: 'keyword', rows: [] };
  const patterns = terms.map(term => '%' + term.replace(/[\\%_]/g, '\\$&') + '%');
  const scoped = scopeSql('d', scope, 3);
  const result = await db.query(
    `SELECT d.id AS diary_id, d.content, d.content_version, d.occurred_at, d.mood
       FROM diaries d
      WHERE d.user_id = $1 AND d.deleted_at IS NULL AND d.ai_allowed
        AND d.content ILIKE ANY($2::text[])
        ${scoped.clause}
      ORDER BY d.occurred_at DESC LIMIT 36`,
    [userId, patterns, ...scoped.values]
  );
  return { name: 'keyword', rows: result.rows };
}

async function temporalChannel(userId, scope, limit) {
  const scoped = scopeSql('d', scope, 2);
  const result = await db.query(
    `WITH base AS (
       SELECT d.id AS diary_id, d.content, d.content_version, d.occurred_at, d.mood,
              ntile(12) OVER (ORDER BY d.occurred_at) AS time_bucket
         FROM diaries d
        WHERE d.user_id = $1 AND d.deleted_at IS NULL AND d.ai_allowed${scoped.clause}
     ), sampled AS (
       SELECT *, row_number() OVER (PARTITION BY time_bucket ORDER BY occurred_at DESC) AS bucket_rank
         FROM base
     )
     SELECT * FROM sampled WHERE bucket_rank <= 2 ORDER BY occurred_at DESC LIMIT $${2 + scoped.values.length}`,
    [userId, ...scoped.values, limit]
  );
  return { name: 'time_sample', rows: result.rows };
}

async function retrieveMemories({ userId, question, mode, scope: rawScope, seedDiaryId }) {
  const scope = normalizedScope(rawScope);
  const seed = await seedDiary(userId, seedDiaryId);
  if (seedDiaryId && !seed) {
    throw Object.assign(new Error('起始日记不存在或没有授权 AI 读取'), { code: 'SHROOM_REFLECTION_INPUT' });
  }
  const profile = isEmbeddingConfigured() ? embeddingProfile() : null;
  const terms = keywordTerms(question);
  const retrievalQuery = [question, seed ? seed.content.slice(0, 1800) : ''].filter(Boolean).join('\n\n');
  const longRange = mode === 'timeline' || mode === 'change';
  const [counts, codexCounts, semantic, keyword, temporal, codexKeyword, codexTemporal] = await Promise.all([
    corpusCounts(userId, scope, profile),
    codexCorpusCounts(db, userId, scope),
    semanticChannel(userId, retrievalQuery, scope, profile),
    keywordChannel(userId, terms, scope),
    temporalChannel(userId, scope, longRange ? 30 : 12),
    codexKeywordChannel(db, userId, terms, scope),
    codexTemporalChannel(db, userId, scope, longRange ? 24 : 10)
  ]);
  const merged = rrfMerge(
    [semantic, keyword, codexKeyword, temporal, codexTemporal],
    seedDiaryId,
    longRange ? 42 : 22
  );
  const sources = [];
  if (seed) {
    const range = excerptAround(seed.content, terms, 0, Math.min(seed.content.length, 1200));
    sources.push({ ...seed, ...range, role: 'seed', retrievalReasons: ['seed'] });
  }
  for (const item of merged) {
    const row = item.row;
    const external = row.source_type === 'CODEX_TASK';
    const range = external
      ? { sourceStart: 0, sourceEnd: row.content.length, excerpt: row.content }
      : excerptAround(row.content, terms,
        Number.isInteger(row.source_start) ? row.source_start : null,
        Number.isInteger(row.source_end) ? row.source_end : null);
    sources.push({ ...row, ...range, role: 'memory', retrievalReasons: item.reasons });
  }
  sources.forEach((source, index) => {
    source.sourceRef = 'S' + (index + 1);
  });
  const processedDiaryIds = [...new Set(sources.map(item => item.diary_id).filter(Boolean))];
  const processedExternalIds = [...new Set(sources.map(item => item.memory_key).filter(Boolean))];
  const totalAvailable = counts.total + codexCounts.total;
  const processedRecords = processedDiaryIds.length + processedExternalIds.length;
  const complete = totalAvailable <= processedRecords;
  const availableDates = [counts.firstAt, counts.lastAt, codexCounts.firstAt, codexCounts.lastAt]
    .filter(Boolean).sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
  const firstAt = availableDates[0] || null;
  const lastAt = availableDates[availableDates.length - 1] || null;
  return {
    scope,
    sources,
    coverage: {
      totalAvailable,
      processedRecords,
      processedDiaries: processedDiaryIds.length,
      processedExternalActivities: processedExternalIds.length,
      indexedDiaries: counts.indexed,
      unindexedDiaries: Math.max(0, counts.total - counts.indexed),
      firstRecordAt: firstAt,
      lastRecordAt: lastAt,
      sourceBreakdown: {
        diaries: counts.total,
        codexTasks: codexCounts.total
      },
      semanticIndexEnabled: Boolean(profile),
      complete,
      note: complete
        ? '本次授权范围内的日记与 Codex 任务记录均已读取。'
        : '本次读取了检索命中与分层时间样本；日记与 Codex 任务保持来源区分，未处理的记录不会被算作已覆盖。'
    }
  };
}

module.exports = {
  excerptAround,
  keywordTerms,
  normalizedScope,
  retrieveMemories,
  rrfMerge,
  scopeSql
};
