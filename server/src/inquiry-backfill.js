'use strict';

const crypto = require('node:crypto');
const { candidateFingerprint, normalizeQuestion } = require('./inquiry-candidates');

function bounded(value, limit) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, limit);
}

function buildDiaryBatches(diaries, options = {}) {
  const maxChars = Math.max(100, Number(options.maxChars || 18000));
  const maxEntries = Math.max(1, Number(options.maxEntries || 16));
  const maxDiaryChars = Math.max(100, Number(options.maxDiaryChars || 5000));
  const batches = [];
  let current = [];
  let currentChars = 0;
  for (const diary of Array.isArray(diaries) ? diaries : []) {
    const content = String(diary.content || '').trim().slice(0, maxDiaryChars);
    if (!content) continue;
    const item = { id: String(diary.id), date: diary.diary_date || diary.date || '', content };
    const itemChars = content.length + item.date.length + item.id.length;
    if (current.length && (current.length >= maxEntries || currentChars + itemChars > maxChars)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += itemChars;
  }
  if (current.length) batches.push(current);
  return batches;
}

function normalizeHistoricalCandidates(value, allowedDiaryIds = [], allowedInquiryIds = []) {
  const allowedDiaries = new Set(allowedDiaryIds.map(String));
  const allowedInquiries = new Set(allowedInquiryIds.map(String));
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || item.shouldTrack === false) continue;
    const question = normalizeQuestion(item.question);
    const key = question.replace(/[\s？?，,。.!！]/gu, '').toLowerCase();
    const confidence = Number(item.confidence);
    const sourceDiaryIds = [...new Set((Array.isArray(item.sourceDiaryIds) ? item.sourceDiaryIds : [])
      .map(String).filter(id => allowedDiaries.has(id)))];
    if (!question || seen.has(key) || !Number.isFinite(confidence) || confidence < 0.65 || !sourceDiaryIds.length) continue;
    const suggested = String(item.existingInquiryId || '');
    result.push({
      question,
      context: bounded(item.context || item.reason, 2000),
      confidence: Math.max(0, Math.min(1, confidence)),
      sourceDiaryIds,
      suggestedInquiryId: allowedInquiries.has(suggested) ? suggested : null
    });
    seen.add(key);
    if (result.length >= 20) break;
  }
  return result;
}

async function storeHistoricalCandidates(client, { userId, modelVersion, candidates, replacePending = false }) {
  if (replacePending) {
    await client.query(
      `DELETE FROM inquiry_candidates
        WHERE user_id = $1 AND source = 'HISTORICAL_BACKFILL' AND status = 'PENDING'`,
      [userId]
    );
  }
  let inserted = 0;
  for (const candidate of candidates) {
    const id = crypto.randomUUID();
    const fingerprint = candidateFingerprint(candidate.question, candidate.sourceDiaryIds);
    const result = await client.query(
      `INSERT INTO inquiry_candidates
        (id, user_id, question, context, source, confidence, fingerprint,
         suggested_inquiry_id, model_version)
       VALUES ($1, $2, $3, $4, 'HISTORICAL_BACKFILL', $5, $6, $7, $8)
       ON CONFLICT (user_id, fingerprint) DO NOTHING RETURNING id`,
      [id, userId, candidate.question, candidate.context, candidate.confidence, fingerprint,
        candidate.suggestedInquiryId, modelVersion]
    );
    if (!result.rowCount) continue;
    for (const diaryId of candidate.sourceDiaryIds) {
      await client.query(
        `INSERT INTO inquiry_candidate_diaries (candidate_id, diary_id, user_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [id, diaryId, userId]
      );
    }
    inserted += 1;
  }
  return inserted;
}

module.exports = {
  buildDiaryBatches,
  normalizeHistoricalCandidates,
  storeHistoricalCandidates
};
