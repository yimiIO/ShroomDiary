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
    metadata: row.metadata || {}
  };
}

async function listDiarySourceActivities(queryable, userId, date, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return [];
  const usageClause = options.aiOnly ? 'AND c.ai_allowed' : 'AND c.include_in_diary';
  const result = await queryable.query(
    `SELECT e.id, e.connection_id, e.provider, e.activity_type, e.title, e.project_label,
            e.source_kind, e.started_at, e.completed_at, e.task_runtime_seconds,
            e.active_seconds_estimate, e.outcome_status, e.metadata, c.display_name
       FROM external_activity_events e
       JOIN data_source_connections c
         ON c.id = e.connection_id AND c.user_id = e.user_id
      WHERE e.user_id = $1 ${usageClause}
        AND (e.completed_at AT TIME ZONE 'Asia/Shanghai')::date = $2::date
      ORDER BY e.completed_at DESC
      LIMIT 50`,
    [userId, date]
  );
  return result.rows.map(mapActivity);
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
  listDiarySourceActivities,
  mapActivity,
  normalizeCodexActivity,
  normalizeSyncInterval,
  publicConnection,
  redactSensitiveText
};
