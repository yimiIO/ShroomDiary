'use strict';

const crypto = require('node:crypto');

function text(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function logicalTaskId(externalId) {
  const value = text(externalId, 200);
  const separator = value.lastIndexOf(':');
  return separator > 0 ? value.slice(0, separator) : value;
}

function baseCodexTitle(value) {
  return text(value, 240).replace(/ · 后续 \d+$/u, '');
}

function instant(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shanghaiDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date).replace(/\//g, '-');
}

function taskSnapshot(row) {
  return {
    connectionId: String(row.connection_id),
    externalTaskId: text(row.external_task_id, 200),
    title: baseCodexTitle(row.title),
    projectName: text(row.project_label, 120),
    firstObservedAt: instant(row.first_observed_at),
    lastCompletedAt: instant(row.last_completed_at),
    turnCount: Number(row.turn_count || 0),
    completedTurns: Number(row.completed_turns || 0),
    interruptedTurns: Number(row.interrupted_turns || 0),
    failedTurns: Number(row.failed_turns || 0),
    latestOutcomeStatus: text(row.latest_outcome_status, 20),
    sourceUpdatedAt: instant(row.source_updated_at)
  };
}

function taskFingerprint(row) {
  return crypto.createHash('sha256').update(JSON.stringify(taskSnapshot(row))).digest('hex');
}

function taskContent(snapshot) {
  const parts = [`Codex 任务「${snapshot.title || '未命名任务'}」`];
  if (snapshot.projectName) parts.push(`项目：${snapshot.projectName}`);
  parts.push(`Codex 记录 ${snapshot.turnCount} 个对话轮次`);
  if (snapshot.completedTurns) parts.push(`其中 ${snapshot.completedTurns} 个轮次已结束`);
  if (snapshot.interruptedTurns) parts.push(`${snapshot.interruptedTurns} 个轮次被中断`);
  if (snapshot.failedTurns) parts.push(`${snapshot.failedTurns} 个轮次失败`);
  parts.push(`最近记录时间：${shanghaiDateTime(snapshot.lastCompletedAt)}`);
  return parts.join('；') + '。';
}

function mapCodexMemoryTask(row) {
  const snapshot = taskSnapshot(row);
  const content = taskContent(snapshot);
  return {
    memory_key: `codex:${snapshot.connectionId}:${snapshot.externalTaskId}`,
    source_type: 'CODEX_TASK',
    source_name: row.display_name || '菇日记 · Codex 数据源',
    connection_id: snapshot.connectionId,
    external_task_id: snapshot.externalTaskId,
    source_fingerprint: taskFingerprint(row),
    content,
    occurred_at: snapshot.lastCompletedAt,
    mood: null,
    project_name: snapshot.projectName,
    observed_facts: snapshot
  };
}

const CODEX_TASKS_CTE = `WITH codex_tasks AS (
  SELECT e.user_id, e.connection_id,
         regexp_replace(e.external_id, ':[^:]+$', '') AS external_task_id,
         regexp_replace((array_agg(e.title ORDER BY e.completed_at))[1], ' · 后续 [0-9]+$', '') AS title,
         COALESCE((array_agg(NULLIF(e.project_label, '') ORDER BY e.completed_at DESC)
           FILTER (WHERE e.project_label <> ''))[1], '') AS project_label,
         min(e.completed_at) AS first_observed_at,
         max(e.completed_at) AS last_completed_at,
         count(*)::int AS turn_count,
         count(*) FILTER (WHERE e.outcome_status = 'COMPLETED')::int AS completed_turns,
         count(*) FILTER (WHERE e.outcome_status = 'INTERRUPTED')::int AS interrupted_turns,
         count(*) FILTER (WHERE e.outcome_status = 'FAILED')::int AS failed_turns,
         (array_agg(e.outcome_status ORDER BY e.completed_at DESC))[1] AS latest_outcome_status,
         max(e.updated_at) AS source_updated_at,
         c.display_name
    FROM external_activity_events e
    JOIN data_source_connections c
      ON c.id = e.connection_id AND c.user_id = e.user_id
   WHERE e.user_id = $1 AND c.ai_allowed
   GROUP BY e.user_id, e.connection_id,
            regexp_replace(e.external_id, ':[^:]+$', ''), c.display_name
)`;

function sourceScopeSql(alias, scope, startIndex) {
  const clauses = [];
  const values = [];
  let index = startIndex;
  if (scope.dateFrom) {
    clauses.push(alias + ".last_completed_at >= ($" + index + "::date::timestamp AT TIME ZONE 'Asia/Shanghai')");
    values.push(scope.dateFrom);
    index += 1;
  }
  if (scope.dateTo) {
    clauses.push(alias + ".last_completed_at < (($" + index + "::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')");
    values.push(scope.dateTo);
  }
  return { clause: clauses.length ? ' AND ' + clauses.join(' AND ') : '', values };
}

function sourceMemoryAllowed(scope) {
  return !Array.isArray(scope.diaryIds) || scope.diaryIds.length === 0;
}

async function codexCorpusCounts(queryable, userId, scope) {
  if (!sourceMemoryAllowed(scope)) return { total: 0, firstAt: null, lastAt: null };
  const scoped = sourceScopeSql('t', scope, 2);
  const result = await queryable.query(
    `${CODEX_TASKS_CTE}
     SELECT count(*)::int AS total, min(t.first_observed_at) AS first_at,
            max(t.last_completed_at) AS last_at
       FROM codex_tasks t WHERE true${scoped.clause}`,
    [userId, ...scoped.values]
  );
  return {
    total: Number(result.rows[0]?.total || 0),
    firstAt: result.rows[0]?.first_at || null,
    lastAt: result.rows[0]?.last_at || null
  };
}

async function codexKeywordChannel(queryable, userId, terms, scope) {
  if (!terms.length || !sourceMemoryAllowed(scope)) return { name: 'codex_keyword', rows: [] };
  const patterns = terms.map(term => '%' + term.replace(/[\\%_]/g, '\\$&') + '%');
  const scoped = sourceScopeSql('t', scope, 3);
  const result = await queryable.query(
    `${CODEX_TASKS_CTE}
     SELECT t.* FROM codex_tasks t
      WHERE (t.title ILIKE ANY($2::text[]) OR t.project_label ILIKE ANY($2::text[]))
        ${scoped.clause}
      ORDER BY t.last_completed_at DESC LIMIT 36`,
    [userId, patterns, ...scoped.values]
  );
  return { name: 'codex_keyword', rows: result.rows.map(mapCodexMemoryTask) };
}

async function codexTemporalChannel(queryable, userId, scope, limit) {
  if (!sourceMemoryAllowed(scope)) return { name: 'codex_time_sample', rows: [] };
  const scoped = sourceScopeSql('t', scope, 2);
  const result = await queryable.query(
    `${CODEX_TASKS_CTE}, scoped_tasks AS (
       SELECT t.*, ntile(12) OVER (ORDER BY t.last_completed_at) AS time_bucket
         FROM codex_tasks t WHERE true${scoped.clause}
     ), sampled AS (
       SELECT *, row_number() OVER (PARTITION BY time_bucket ORDER BY last_completed_at DESC) AS bucket_rank
         FROM scoped_tasks
     )
     SELECT * FROM sampled WHERE bucket_rank <= 2
      ORDER BY last_completed_at DESC LIMIT $${2 + scoped.values.length}`,
    [userId, ...scoped.values, limit]
  );
  return { name: 'codex_time_sample', rows: result.rows.map(mapCodexMemoryTask) };
}

async function validateCodexMemorySources(queryable, userId, sources) {
  const keys = [...new Set(sources.map(item => `${item.connectionId}:${item.externalTaskId}`))];
  if (!keys.length) return [];
  const result = await queryable.query(
    `${CODEX_TASKS_CTE}
     SELECT t.* FROM codex_tasks t
      WHERE (t.connection_id::text || ':' || t.external_task_id) = ANY($2::text[])`,
    [userId, keys]
  );
  const current = new Map(result.rows.map(row => {
    const task = mapCodexMemoryTask(row);
    return [`${task.connection_id}:${task.external_task_id}`, task];
  }));
  return sources.filter(source => {
    const task = current.get(`${source.connectionId}:${source.externalTaskId}`);
    return task && task.source_fingerprint === source.sourceFingerprint
      && source.sourceStart === 0 && source.sourceEnd === task.content.length
      && source.excerpt === task.content;
  });
}

module.exports = {
  CODEX_TASKS_CTE,
  baseCodexTitle,
  codexCorpusCounts,
  codexKeywordChannel,
  codexTemporalChannel,
  logicalTaskId,
  mapCodexMemoryTask,
  sourceMemoryAllowed,
  sourceScopeSql,
  taskContent,
  taskFingerprint,
  taskSnapshot,
  validateCodexMemorySources
};
