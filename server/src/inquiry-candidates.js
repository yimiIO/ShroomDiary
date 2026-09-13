'use strict';

const crypto = require('node:crypto');
const { normalizeInquiryType } = require('./inquiry-health');

function bounded(value, limit) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, limit);
}

function normalizeQuestion(value) {
  const question = bounded(value, 300);
  if (question.length < 4) return '';
  return /[？?]$/u.test(question) ? question : `${question}？`;
}

function normalizeInquiryCandidates(value, existingInquiries = []) {
  const allowedExisting = new Map(existingInquiries.map(item => {
    if (item && typeof item === 'object') return [String(item.id), normalizeInquiryType(item.inquiryType || item.inquiry_type)];
    return [String(item), null];
  }));
  const input = Array.isArray(value) ? value : [];
  const seen = new Set();
  const candidates = [];
  for (const item of input) {
    if (!item || item.shouldTrack === false) continue;
    const question = normalizeQuestion(item.question);
    const key = question.replace(/[\s？?，,。.!！]/gu, '').toLowerCase();
    if (!question || seen.has(key)) continue;
    const confidence = Math.max(0, Math.min(1, Number(item.confidence)));
    if (!Number.isFinite(confidence) || confidence < 0.65) continue;
    const inquiryType = normalizeInquiryType(item.inquiryType);
    const suggested = String(item.existingInquiryId || '');
    const suggestedType = allowedExisting.get(suggested);
    candidates.push({
      question,
      context: bounded(item.context || item.reason, 2000),
      confidence,
      inquiryType,
      suggestedInquiryId: allowedExisting.has(suggested) && (suggestedType === null || suggestedType === inquiryType)
        ? suggested : null
    });
    seen.add(key);
    if (candidates.length >= 2) break;
  }
  return candidates;
}

function candidateFingerprint(question, diaryIds) {
  const normalized = normalizeQuestion(question).replace(/\s+/gu, '').toLowerCase();
  const sources = [...new Set(diaryIds.map(String))].sort().join(',');
  return crypto.createHash('sha256').update(`${normalized}\n${sources}`).digest('hex');
}

function mapCandidate(row) {
  return {
    id: row.id,
    question: row.question,
    context: row.context || '',
    status: row.status,
    source: row.source,
    confidence: row.confidence === null ? null : Number(row.confidence),
    inquiryType: normalizeInquiryType(row.inquiry_type),
    suggestedInquiryId: row.suggested_inquiry_id || null,
    acceptedInquiryId: row.accepted_inquiry_id || null,
    evidenceCount: Number(row.evidence_count || 0),
    sourceDate: row.source_date || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listDiaryCandidates(queryable, userId, diaryId) {
  const result = await queryable.query(
    `SELECT c.*,
            count(cd.diary_id)::int AS evidence_count,
            min(to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')) AS source_date
       FROM inquiry_candidates c
       JOIN inquiry_candidate_diaries cd ON cd.candidate_id = c.id AND cd.user_id = c.user_id
       JOIN diaries d ON d.id = cd.diary_id AND d.user_id = c.user_id AND d.deleted_at IS NULL
      WHERE c.user_id = $1 AND cd.diary_id = $2 AND c.status <> 'IGNORED'
      GROUP BY c.id ORDER BY c.created_at`,
    [userId, diaryId]
  );
  return result.rows.map(mapCandidate);
}

async function syncDiaryCandidates(client, { userId, diaryId, modelVersion, candidates }) {
  const pending = await client.query(
    `SELECT DISTINCT c.id FROM inquiry_candidates c
       JOIN inquiry_candidate_diaries cd ON cd.candidate_id = c.id AND cd.user_id = c.user_id
      WHERE c.user_id = $1 AND cd.diary_id = $2 AND c.source = 'DIARY_ANALYSIS' AND c.status = 'PENDING'`,
    [userId, diaryId]
  );
  if (pending.rowCount) {
    await client.query(
      `DELETE FROM inquiry_candidates WHERE user_id = $1 AND id = ANY($2::uuid[]) AND status = 'PENDING'`,
      [userId, pending.rows.map(row => row.id)]
    );
  }
  for (const candidate of candidates) {
    const id = crypto.randomUUID();
    const fingerprint = candidateFingerprint(candidate.question, [diaryId]);
    const inserted = await client.query(
      `INSERT INTO inquiry_candidates
        (id, user_id, question, context, source, confidence, fingerprint,
         suggested_inquiry_id, model_version, inquiry_type)
       VALUES ($1, $2, $3, $4, 'DIARY_ANALYSIS', $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, fingerprint) DO NOTHING RETURNING id`,
      [id, userId, candidate.question, candidate.context, candidate.confidence, fingerprint,
        candidate.suggestedInquiryId, modelVersion, normalizeInquiryType(candidate.inquiryType)]
    );
    if (!inserted.rowCount) continue;
    await client.query(
      `INSERT INTO inquiry_candidate_diaries (candidate_id, diary_id, user_id) VALUES ($1, $2, $3)`,
      [id, diaryId, userId]
    );
  }
}

module.exports = {
  candidateFingerprint,
  listDiaryCandidates,
  mapCandidate,
  normalizeInquiryCandidates,
  normalizeQuestion,
  syncDiaryCandidates
};
