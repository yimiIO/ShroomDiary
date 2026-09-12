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

function normalizeWellbeingCandidate(value, diaryContent = '', existingInquiries = []) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const extraction = normalizeDiaryHealthExtraction(
    input.extraction || input.healthExtraction || input.health_extraction || {},
    { diaryContent, existingInquiries }
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
  return {
    observation,
    extraction,
    sourceExcerpt,
    categories: observationCategories(observation),
    extractionVersion: hasDiaryHealthExtraction(extraction) ? HEALTH_EXTRACTION_VERSION : ''
  };
}

function mapWellbeingRecord(row) {
  const observation = normalizeHealthObservation(row.observation);
  const rawExtraction = row.extraction && typeof row.extraction === 'object' && !Array.isArray(row.extraction)
    ? row.extraction : {};
  const extraction = { ...emptyDiaryHealthExtraction(), ...rawExtraction };
  const linkedInquiryIds = new Set((Array.isArray(row.linked_inquiry_ids) ? row.linked_inquiry_ids : []).map(String));
  return {
    id: row.id,
    diaryId: row.diary_id || null,
    sourceType: row.source_type,
    status: WELLBEING_STATUSES.includes(row.status) ? row.status : 'PENDING',
    recordedOn: row.recorded_on instanceof Date ? row.recorded_on.toISOString().slice(0, 10) : row.recorded_on,
    sourceLabel: row.source_label || '',
    sourceExcerpt: row.source_excerpt || '',
    observation,
    extraction,
    extractionVersion: row.extraction_version || '',
    modelVersion: row.model_version || '',
    healthInquiryLinks: extraction.healthInquiryLinks.map(item => ({
      ...item,
      linked: linkedInquiryIds.has(String(item.inquiryId))
    })),
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
    `SELECT w.*,
            COALESCE(array_agg(e.inquiry_id) FILTER (WHERE e.inquiry_id IS NOT NULL), ARRAY[]::uuid[]) AS linked_inquiry_ids
       FROM wellbeing_records w
       LEFT JOIN inquiry_evidence e ON e.wellbeing_record_id = w.id AND e.user_id = w.user_id
      WHERE w.user_id = $1 AND w.diary_id = $2 AND w.status <> 'DISMISSED'
      GROUP BY w.id ORDER BY w.updated_at DESC LIMIT 1`,
    [userId, diaryId]
  );
  return result.rowCount ? mapWellbeingRecord(result.rows[0]) : null;
}

async function syncDiaryWellbeingRecord(client, {
  userId, diary, modelVersion = '', candidate, existingInquiries = []
}) {
  const normalized = normalizeWellbeingCandidate(candidate, diary.content, existingInquiries);
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
  const id = existing.rows[0]?.id || crypto.randomUUID();
  const recordedOn = dateOnly(diary.diary_date)
    || new Date(diary.occurred_at || Date.now()).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const label = `${recordedOn} 的日记`;
  const result = await client.query(
    `INSERT INTO wellbeing_records
      (id, user_id, diary_id, source_type, status, recorded_on, source_label,
       source_excerpt, observation, extraction, extraction_version, model_version, ai_allowed)
     VALUES ($1, $2, $3, 'DIARY_ANALYSIS', 'PENDING', $4, $5, $6, $7::jsonb,
       $8::jsonb, $9, $10, false)
     ON CONFLICT (user_id, diary_id) WHERE diary_id IS NOT NULL DO UPDATE SET
       source_label = EXCLUDED.source_label,
       source_excerpt = EXCLUDED.source_excerpt,
       observation = EXCLUDED.observation,
       extraction = EXCLUDED.extraction,
       extraction_version = EXCLUDED.extraction_version,
       model_version = EXCLUDED.model_version,
       updated_at = now()
     WHERE wellbeing_records.status = 'PENDING'
     RETURNING id`,
    [id, userId, diary.id, recordedOn, label, normalized.sourceExcerpt,
      JSON.stringify(normalized.observation), JSON.stringify(normalized.extraction),
      normalized.extractionVersion, bounded(modelVersion, 120)]
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
