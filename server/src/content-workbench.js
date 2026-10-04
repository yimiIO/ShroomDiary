'use strict';

const crypto = require('node:crypto');

const TOPIC_STATES = Object.freeze([
  'INBOX', 'VERIFIED', 'CANDIDATE', 'LOCKED', 'PRODUCING', 'REVIEW_OPS',
  'REVIEW_COMPLIANCE', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'REJECTED'
]);

const TRANSITIONS = Object.freeze({
  INBOX: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['INBOX', 'CANDIDATE', 'REJECTED'],
  CANDIDATE: ['LOCKED', 'ARCHIVED'],
  LOCKED: ['CANDIDATE', 'PRODUCING', 'ARCHIVED'],
  PRODUCING: ['LOCKED', 'REVIEW_OPS', 'ARCHIVED'],
  REVIEW_OPS: ['PRODUCING', 'REVIEW_COMPLIANCE'],
  REVIEW_COMPLIANCE: ['PRODUCING', 'SCHEDULED'],
  SCHEDULED: ['REVIEW_COMPLIANCE', 'PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['CANDIDATE'],
  REJECTED: ['INBOX']
});

const REVIEW_REQUIRED = Object.freeze({
  REVIEW_COMPLIANCE: 'OPS',
  SCHEDULED: 'COMPLIANCE'
});

const FEEDBACK_STAGES = Object.freeze({
  INBOX: { outcome: 'INBOX', label: '待审核' },
  VERIFIED: { outcome: 'UNDER_REVIEW', label: '已核验' },
  CANDIDATE: { outcome: 'ACCEPTED', label: '已采用' },
  LOCKED: { outcome: 'ACCEPTED', label: '已锁定' },
  PRODUCING: { outcome: 'IN_PROGRESS', label: '创作中' },
  REVIEW_OPS: { outcome: 'IN_PROGRESS', label: '待运营审' },
  REVIEW_COMPLIANCE: { outcome: 'IN_PROGRESS', label: '待合规审' },
  SCHEDULED: { outcome: 'READY_TO_PUBLISH', label: '待发布' },
  PUBLISHED: { outcome: 'PUBLISHED', label: '已发布' },
  ARCHIVED: { outcome: 'ARCHIVED', label: '已归档' },
  REJECTED: { outcome: 'REJECTED', label: '已拒绝' }
});

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function contentHash(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function sourceFingerprint(item) {
  return contentHash({
    source: String(item?.source || '').trim().toLowerCase(),
    externalKey: String(item?.externalKey || '').trim(),
    url: String(item?.url || '').trim(),
    title: String(item?.title || '').trim()
  });
}

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

function transitionRequirement(to) {
  return REVIEW_REQUIRED[to] || '';
}

function contentFeedbackStage(status) {
  return FEEDBACK_STAGES[status] || { outcome: 'UNKNOWN', label: String(status || '未知') };
}

function contentFeedbackReason(status, latestReview, lastTransition) {
  if (status === 'REJECTED') return String(lastTransition?.reason || latestReview?.notes || '');
  if (['CHANGES_REQUESTED', 'STOP'].includes(latestReview?.decision)) {
    return String(latestReview?.notes || '');
  }
  return '';
}

function topicSnapshot(row) {
  return {
    code: row.code,
    title: row.title,
    channel: row.channel,
    status: row.status,
    score: row.score,
    scheduledFor: row.scheduled_for,
    evidence: row.evidence,
    sources: row.sources || [],
    productConnection: row.product_connection,
    assignedRole: row.assigned_role,
    assignedTo: row.assigned_to,
    dueAt: row.due_at,
    brief: row.brief || {},
    draft: row.draft || {},
    blocker: row.blocker,
    sourceName: row.source_name,
    sourceKeyword: row.source_keyword,
    sourceUrl: row.source_url,
    sourceAuthor: row.source_author,
    sourceExternalKey: row.source_external_key,
    sourcePublishedAt: row.source_published_at,
    capturedAt: row.captured_at,
    sourceLikes: row.source_likes,
    evidenceLevel: row.evidence_level,
    trendStatus: row.trend_status,
    rawMetadata: row.raw_metadata || {}
  };
}

module.exports = {
  TOPIC_STATES,
  TRANSITIONS,
  canTransition,
  contentHash,
  contentFeedbackReason,
  contentFeedbackStage,
  sourceFingerprint,
  topicSnapshot,
  transitionRequirement
};
