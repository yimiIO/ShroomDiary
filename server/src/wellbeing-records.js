'use strict';

const crypto = require('node:crypto');
const { normalizeHealthObservation } = require('./inquiry-health');
const {
  HEALTH_EXTRACTION_VERSION,
  emptyDiaryHealthExtraction,
  hasDiaryHealthExtraction,
  legacyHealthObservation,
  normalizeDiaryHealthExtraction
} = require('./diary-health');
const { WELLBEING_VALUE_TYPES, wellbeingSourceFingerprint } = require('./wellbeing-review');

const WELLBEING_STATUSES = ['PENDING', 'CONFIRMED', 'DISMISSED', 'ARCHIVED'];

function bounded(value, limit = 1000) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, limit);
}

function dateOnly(value, fallback = null) {
  const input = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/u.test(input) ? input : fallback;
}

function observationCategories(value) {
  const item = normalizeHealthObservation(value);
  if (!Object.keys(item).length) return [];
  const categories = [];
  if (item.psychologicalFeelings.length || item.stressors.length || item.cognitiveChanges.length) categories.push('PSYCHOLOGICAL');
  if (item.physicalSymptoms.length || item.bodyAreas.length || item.severity !== null || item.duration) categories.push('PHYSICAL');
  if (item.sleep.hours !== null || item.sleep.quality !== null || item.sleep.note) categories.push('SLEEP');
  if (item.behaviors.length || item.environmentFactors.length) categories.push('HABIT');
  if (item.measurements.length) categories.push('MEASUREMENT');
  if (item.testResults.length) categories.push('TEST_RESULT');
  return categories;
}

function extractionExcerpt(extraction) {
  const collections = [
    extraction.psychologicalObservations,
    extraction.physicalObservations,
    extraction.lifestyleFactors,
    extraction.environmentFactors,
    extraction.redFlags
  ];
  for (const items of collections) {
    const excerpt = Array.isArray(items) && items.find(item => item.evidenceExcerpt)?.evidenceExcerpt;
    if (excerpt) return excerpt;
  }
  return '';
}

function normalizeWellbeingCandidate(value, diaryContent = '') {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const extraction = normalizeDiaryHealthExtraction(
    input.extraction || input.healthExtraction || input.health_extraction || {},
    { diaryContent }
  );
  const observation = hasDiaryHealthExtraction(extraction)
    ? normalizeHealthObservation(legacyHealthObservation(extraction))
    : normalizeHealthObservation(input.observation || input.healthObservation || input);
  if (!Object.keys(observation).length) return null;
  const source = String(diaryContent || '');
  const candidateExcerpt = String(input.sourceExcerpt || input.excerpt || extractionExcerpt(extraction) || '').trim();
  if (candidateExcerpt && !source.includes(candidateExcerpt)) return null;
  const sourceExcerpt = candidateExcerpt && source.includes(candidateExcerpt)
    ? bounded(candidateExcerpt, 1200)
    : bounded(source, 1200);
  if (!sourceExcerpt) return null;
  const healthValueTypes = [...new Set((Array.isArray(input.healthValueTypes || input.health_value_types)
    ? (input.healthValueTypes || input.health_value_types) : [])
    .map(item => String(item || '').toUpperCase())
    .filter(item => WELLBEING_VALUE_TYPES.includes(item)))];
  const confidenceValue = Number(input.confidence);
  return {
    observation,
    extraction,
    sourceExcerpt,
    categories: observationCategories(observation),
    extractionVersion: hasDiaryHealthExtraction(extraction) ? HEALTH_EXTRACTION_VERSION : '',
    healthValueTypes,
    whyUseful: bounded(input.whyUseful || input.why_useful, 500),
    confidence: Number.isFinite(confidenceValue)
      ? Math.round(Math.max(0, Math.min(1, confidenceValue)) * 1000) / 1000 : null,
    reviewVersion: bounded(input.reviewVersion || input.review_version, 120),
    sourceFingerprint: bounded(input.sourceFingerprint || input.source_fingerprint, 64)
      || wellbeingSourceFingerprint(diaryContent)
  };
}

function mapWellbeingRecord(row) {
  const observation = normalizeHealthObservation(row.observation);
  const rawExtraction = row.extraction && typeof row.extraction === 'object' && !Array.isArray(row.extraction)
    ? row.extraction : {};
  const extraction = { ...emptyDiaryHealthExtraction(), ...rawExtraction };
  const recordedOn = row.recorded_on instanceof Date
    ? row.recorded_on.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    : row.recorded_on;
  return {
    id: row.id,
    diaryId: row.diary_id || null,
    sourceType: row.source_type,
    status: WELLBEING_STATUSES.includes(row.status) ? row.status : 'PENDING',
    recordedOn,
    sourceLabel: row.source_label || '',
    sourceExcerpt: row.source_excerpt || '',
    observation,
    extraction,
    extractionVersion: row.extraction_version || '',
    modelVersion: row.model_version || '',
    healthValueTypes: Array.isArray(row.health_value_types) ? row.health_value_types : [],
    whyUseful: row.why_useful || '',
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    reviewVersion: row.review_version || '',
    feedbackReason: row.feedback_reason || '',
    sourceFingerprint: row.source_fingerprint || '',
    missingInformation: extraction.missingInformation,
    redFlags: extraction.redFlags,
    categories: observationCategories(observation),
    aiAllowed: Boolean(row.ai_allowed),
    confirmedAt: row.confirmed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findDiaryWellbeingRecord(queryable, userId, diaryId) {
  const result = await queryable.query(
    `SELECT w.* FROM wellbeing_records w
      WHERE w.user_id = $1 AND w.diary_id = $2 AND w.status <> 'DISMISSED'
      ORDER BY w.updated_at DESC LIMIT 1`,
    [userId, diaryId]
  );
  return result.rowCount ? mapWellbeingRecord(result.rows[0]) : null;
}

async function syncDiaryWellbeingRecord(client, {
  userId, diary, modelVersion = '', candidate
}) {
  const normalized = normalizeWellbeingCandidate(candidate, diary.content);
  const existing = await client.query(
    `SELECT id, status FROM wellbeing_records
      WHERE user_id = $1 AND diary_id = $2 FOR UPDATE`,
    [userId, diary.id]
  );
  if (!normalized) {
    if (existing.rows[0]?.status === 'PENDING') {
      await client.query('DELETE FROM wellbeing_records WHERE id = $1 AND user_id = $2', [existing.rows[0].id, userId]);
    }
    return null;
  }
  if (existing.rows[0] && existing.rows[0].status !== 'PENDING') return existing.rows[0].id;
  const duplicate = normalized.sourceFingerprint ? await client.query(
    `SELECT id FROM wellbeing_records
      WHERE user_id = $1 AND source_fingerprint = $2 AND diary_id <> $3
      ORDER BY CASE status WHEN 'CONFIRMED' THEN 0 WHEN 'ARCHIVED' THEN 1 WHEN 'DISMISSED' THEN 2 ELSE 3 END,
        created_at ASC LIMIT 1`,
    [userId, normalized.sourceFingerprint, diary.id]
  ) : { rowCount: 0, rows: [] };
  if (duplicate.rowCount) {
    if (existing.rows[0]?.status === 'PENDING') {
      await client.query('DELETE FROM wellbeing_records WHERE id = $1 AND user_id = $2', [existing.rows[0].id, userId]);
    }
    return duplicate.rows[0].id;
  }
  const id = existing.rows[0]?.id || crypto.randomUUID();
  const recordedOn = dateOnly(diary.diary_date)
    || new Date(diary.occurred_at || Date.now()).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const label = `${recordedOn} 的日记`;
  const result = await client.query(
    `INSERT INTO wellbeing_records
      (id, user_id, diary_id, source_type, status, recorded_on, source_label,
       source_excerpt, observation, extraction, extraction_version, model_version, ai_allowed,
       health_value_types, why_useful, confidence, review_version, source_fingerprint)
     VALUES ($1, $2, $3, 'DIARY_ANALYSIS', 'PENDING', $4, $5, $6, $7::jsonb,
       $8::jsonb, $9, $10, false, $11::jsonb, $12, $13, $14, $15)
     ON CONFLICT (user_id, diary_id) WHERE diary_id IS NOT NULL DO UPDATE SET
       source_label = EXCLUDED.source_label,
       source_excerpt = EXCLUDED.source_excerpt,
       observation = EXCLUDED.observation,
       extraction = EXCLUDED.extraction,
       extraction_version = EXCLUDED.extraction_version,
       model_version = EXCLUDED.model_version,
       health_value_types = EXCLUDED.health_value_types,
       why_useful = EXCLUDED.why_useful,
       confidence = EXCLUDED.confidence,
       review_version = EXCLUDED.review_version,
       source_fingerprint = EXCLUDED.source_fingerprint,
       feedback_reason = NULL,
       updated_at = now()
     WHERE wellbeing_records.status = 'PENDING'
     RETURNING id`,
    [id, userId, diary.id, recordedOn, label, normalized.sourceExcerpt,
      JSON.stringify(normalized.observation), JSON.stringify(normalized.extraction),
      normalized.extractionVersion, bounded(modelVersion, 120),
      JSON.stringify(normalized.healthValueTypes), normalized.whyUseful,
      normalized.confidence, normalized.reviewVersion, normalized.sourceFingerprint]
  );
  return result.rows[0]?.id || id;
}

module.exports = {
  WELLBEING_STATUSES,
  dateOnly,
  findDiaryWellbeingRecord,
  mapWellbeingRecord,
  normalizeWellbeingCandidate,
  observationCategories,
  syncDiaryWellbeingRecord
};
