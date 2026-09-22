'use strict';

const path = require('node:path');

const ALLOWED_INTERVALS = [24, 72, 168];

function text(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function normalizeSyncInterval(value) {
  const interval = Number(value);
  return ALLOWED_INTERVALS.includes(interval) ? interval : 72;
}

function redactSensitiveText(value, max = 240) {
  let output = text(value, max * 3);
  output = output
    .replace(/https?:\/\/\S+/gi, '[链接]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[邮箱]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[手机号]')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '[证件号]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/(?:^|\s)(?:\/[\w.@+~-]+){2,}/g, ' [本地路径]')
    .replace(/(?:^|\s)[A-Za-z]:\\(?:[^\s\\]+\\)+[^\s]*/g, ' [本地路径]')
    .replace(/\s+/g, ' ')
    .trim();
  return output.slice(0, max);
}

function projectLabel(value) {
  const raw = text(value, 500).replace(/\\/g, '/');
  if (!raw) return '';
  return redactSensitiveText(path.posix.basename(raw), 120);
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCodexActivity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const externalId = text(value.externalId, 200);
  const title = redactSensitiveText(value.title, 240);
  const completedAt = validDate(value.completedAt);
  const outcomeStatus = ['COMPLETED', 'INTERRUPTED', 'FAILED'].includes(value.outcomeStatus)
    ? value.outcomeStatus : null;
  if (!externalId || !title || !completedAt || !outcomeStatus) return null;
  const startedAt = validDate(value.startedAt);
  const runtime = value.taskRuntimeSeconds === null || value.taskRuntimeSeconds === undefined
    ? null : Math.max(0, Math.min(31 * 24 * 3600, Math.round(Number(value.taskRuntimeSeconds) || 0)));
  const activeEstimate = value.activeSecondsEstimate === null || value.activeSecondsEstimate === undefined
    ? null : Math.max(0, Math.min(runtime === null ? 31 * 24 * 3600 : runtime,
      Math.round(Number(value.activeSecondsEstimate) || 0)));
  const metadata = value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata)
    ? {
      category: redactSensitiveText(value.metadata.category, 48),
      family: redactSensitiveText(value.metadata.family, 80),
      reusable: Boolean(value.metadata.reusable),
      automated: Boolean(value.metadata.automated)
    } : {};
  return {
    externalId,
    title,
    projectLabel: projectLabel(value.projectLabel),
    sourceKind: redactSensitiveText(value.sourceKind, 80),
    startedAt,
    completedAt,
    taskRuntimeSeconds: runtime,
    activeSecondsEstimate: activeEstimate,
    outcomeStatus,
    metadata
  };
}

function mapActivity(row) {
  const metadata = row.metadata || {};
  return {
    id: row.id,
    connectionId: row.connection_id,
    source: row.provider,
    sourceName: row.display_name || '菇日记 · Codex 数据源',
    type: row.activity_type,
    title: row.title,
    projectName: row.project_label || '',
    sourceKind: row.source_kind || '',
    startedAt: row.started_at,
    completedAt: row.completed_at,
    taskRuntimeMinutes: row.task_runtime_seconds === null || row.task_runtime_seconds === undefined
      ? null : Math.round((Number(row.task_runtime_seconds) / 60) * 10) / 10,
    activeMinutesEstimate: row.active_seconds_estimate === null || row.active_seconds_estimate === undefined
      ? null : Math.round((Number(row.active_seconds_estimate) / 60) * 10) / 10,
    outcomeStatus: row.outcome_status,
    turnCount: Number(row.turn_count || metadata.turnCount || 1),
    completedTurns: Number(row.completed_turns || metadata.completedTurns || 0),
    interruptedTurns: Number(row.interrupted_turns || metadata.interruptedTurns || 0),
    failedTurns: Number(row.failed_turns || metadata.failedTurns || 0),
    metadata
  };
}

async function listDiarySourceActivities(queryable, userId, date, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return [];
  const usageClause = options.aiOnly ? 'AND c.ai_allowed' : 'AND c.include_in_diary';
  const result = await queryable.query(
    `SELECT min(e.id::text) AS id, e.connection_id, e.provider, e.activity_type,
            regexp_replace((array_agg(e.title ORDER BY e.completed_at))[1], ' · 后续 [0-9]+$', '') AS title,
            COALESCE((array_agg(NULLIF(e.project_label, '') ORDER BY e.completed_at DESC)
              FILTER (WHERE e.project_label <> ''))[1], '') AS project_label,
            COALESCE((array_agg(NULLIF(e.source_kind, '') ORDER BY e.completed_at DESC)
              FILTER (WHERE e.source_kind <> ''))[1], '') AS source_kind,
            NULL::timestamptz AS started_at,
            max(e.completed_at) AS completed_at,
            NULL::integer AS task_runtime_seconds, NULL::integer AS active_seconds_estimate,
            (array_agg(e.outcome_status ORDER BY e.completed_at DESC))[1] AS outcome_status,
            count(*)::int AS turn_count,
            count(*) FILTER (WHERE e.outcome_status = 'COMPLETED')::int AS completed_turns,
            count(*) FILTER (WHERE e.outcome_status = 'INTERRUPTED')::int AS interrupted_turns,
            count(*) FILTER (WHERE e.outcome_status = 'FAILED')::int AS failed_turns,
            jsonb_build_object(
              'category', 'codex_task',
              'turnCount', count(*)::int,
              'completedTurns', count(*) FILTER (WHERE e.outcome_status = 'COMPLETED')::int,
              'interruptedTurns', count(*) FILTER (WHERE e.outcome_status = 'INTERRUPTED')::int,
              'failedTurns', count(*) FILTER (WHERE e.outcome_status = 'FAILED')::int
            ) AS metadata,
            c.display_name
       FROM external_activity_events e
       JOIN data_source_connections c
         ON c.id = e.connection_id AND c.user_id = e.user_id
      WHERE e.user_id = $1 ${usageClause}
        AND (e.completed_at AT TIME ZONE 'Asia/Shanghai')::date = $2::date
      GROUP BY e.connection_id, e.provider, e.activity_type,
               regexp_replace(e.external_id, ':[^:]+$', ''), c.display_name
      ORDER BY max(e.completed_at) DESC
      LIMIT 50`,
    [userId, date]
  );
  return result.rows.map(mapActivity);
}

async function getDiarySourceActivity(queryable, userId, id) {
  const anchor = await queryable.query(
    `SELECT connection_id, external_id FROM external_activity_events
      WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId]
  );
  if (!anchor.rowCount) return null;
  const values = [userId, anchor.rows[0].connection_id, anchor.rows[0].external_id];
  const detail = await queryable.query(
    `SELECT min(e.id::text) AS id, e.connection_id, e.provider, e.activity_type,
            regexp_replace((array_agg(e.title ORDER BY e.completed_at))[1], ' · 后续 [0-9]+$', '') AS title,
            COALESCE((array_agg(NULLIF(e.project_label, '') ORDER BY e.completed_at DESC)
              FILTER (WHERE e.project_label <> ''))[1], '') AS project_label,
            COALESCE((array_agg(NULLIF(e.source_kind, '') ORDER BY e.completed_at DESC)
              FILTER (WHERE e.source_kind <> ''))[1], '') AS source_kind,
            min(e.started_at) AS started_at, max(e.completed_at) AS completed_at,
            sum(e.task_runtime_seconds)::integer AS task_runtime_seconds,
            sum(e.active_seconds_estimate)::integer AS active_seconds_estimate,
            (array_agg(e.outcome_status ORDER BY e.completed_at DESC))[1] AS outcome_status,
            count(*)::int AS turn_count,
            count(*) FILTER (WHERE e.outcome_status = 'COMPLETED')::int AS completed_turns,
            count(*) FILTER (WHERE e.outcome_status = 'INTERRUPTED')::int AS interrupted_turns,
            count(*) FILTER (WHERE e.outcome_status = 'FAILED')::int AS failed_turns,
            jsonb_build_object('category', 'codex_task', 'turnCount', count(*)::int) AS metadata,
            c.display_name
       FROM external_activity_events e
       JOIN data_source_connections c ON c.id = e.connection_id AND c.user_id = e.user_id
      WHERE e.user_id = $1 AND e.connection_id = $2
        AND regexp_replace(e.external_id, ':[^:]+$', '') = regexp_replace($3, ':[^:]+$', '')
      GROUP BY e.connection_id, e.provider, e.activity_type, c.display_name`,
    values
  );
  if (!detail.rowCount) return null;
  const turns = await queryable.query(
    `SELECT id, source_kind, started_at, completed_at, task_runtime_seconds,
            active_seconds_estimate, outcome_status
       FROM external_activity_events
      WHERE user_id = $1 AND connection_id = $2
        AND regexp_replace(external_id, ':[^:]+$', '') = regexp_replace($3, ':[^:]+$', '')
      ORDER BY completed_at`,
    values
  );
  return {
    activity: mapActivity(detail.rows[0]),
    turns: turns.rows.map((row, index) => ({
      id: row.id,
      index: index + 1,
      sourceKind: row.source_kind || '',
      startedAt: row.started_at,
      completedAt: row.completed_at,
      taskRuntimeMinutes: row.task_runtime_seconds === null ? null : Math.round(Number(row.task_runtime_seconds) / 6) / 10,
      activeMinutesEstimate: row.active_seconds_estimate === null ? null : Math.round(Number(row.active_seconds_estimate) / 6) / 10,
      outcomeStatus: row.outcome_status
    }))
  };
}

function publicConnection(row) {
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.display_name,
    deviceName: row.device_name || '',
    connectionMode: row.connection_mode,
    status: row.status,
    syncIntervalHours: Number(row.sync_interval_hours),
    includeInDiary: Boolean(row.include_in_diary),
    aiAllowed: Boolean(row.ai_allowed),
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    eventCount: Number(row.event_count || 0),
    lastActivityAt: row.last_activity_at || null,
    lastSyncAt: row.last_sync_at || null,
    lastError: row.last_error || '',
    connectedAt: row.connected_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  ALLOWED_INTERVALS,
  getDiarySourceActivity,
  listDiarySourceActivities,
  mapActivity,
  normalizeCodexActivity,
  normalizeSyncInterval,
  publicConnection,
  redactSensitiveText
};
