'use strict';

const crypto = require('node:crypto');
const { HEALTH_EXTRACTION_VERSION, hasDiaryHealthExtraction, legacyHealthObservation, normalizeDiaryHealthExtraction } = require('./diary-health');
const { wellbeingSourceFingerprint } = require('./wellbeing-review');

function bounded(value, limit = 1200) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, limit);
}

function wellbeingDiaryFingerprint(content) {
  return String(content || '').normalize('NFKC').replace(/\s+/gu, '').trim();
}

function selectHistoricalDiaries(rows, replacePending = false) {
  const protectedFingerprints = new Set(rows
    .filter(item => ['CONFIRMED', 'DISMISSED', 'ARCHIVED'].includes(item.wellbeing_status))
    .map(item => wellbeingDiaryFingerprint(item.content)).filter(Boolean));
  const seen = new Set();
  return rows.filter(item => {
    if (item.wellbeing_status && (!replacePending || item.wellbeing_status !== 'PENDING')) return false;
    const key = wellbeingDiaryFingerprint(item.content);
    if (!key || protectedFingerprints.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstExcerpt(extraction) {
  for (const items of [
    extraction.psychologicalObservations,
    extraction.physicalObservations,
    extraction.lifestyleFactors,
    extraction.environmentFactors,
    extraction.redFlags
  ]) {
    const excerpt = Array.isArray(items) && items.find(item => item.evidenceExcerpt)?.evidenceExcerpt;
    if (excerpt) return bounded(excerpt);
  }
  return '';
}

function normalizeHistoricalWellbeingRecords(value, diaries = []) {
  const diaryMap = new Map(diaries.map(item => [String(item.id), item]));
  const seen = new Set();
  const records = [];
  for (const item of Array.isArray(value) ? value : []) {
    const diaryId = String(item?.diaryId || item?.diary_id || '');
    const diary = diaryMap.get(diaryId);
    if (!diary || seen.has(diaryId)) continue;
    const extraction = normalizeDiaryHealthExtraction(
      item.healthExtraction || item.health_extraction || item.extraction || {},
      { diaryContent: diary.content, existingInquiries: [] }
    );
    if (!hasDiaryHealthExtraction(extraction)) continue;
    records.push({
      diaryId,
      recordedOn: diary.diary_date || diary.date,
      sourceExcerpt: firstExcerpt(extraction),
      observation: legacyHealthObservation(extraction),
      extraction,
      healthValueTypes: Array.isArray(item.healthValueTypes) ? item.healthValueTypes : [],
      whyUseful: bounded(item.whyUseful, 500),
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
      reviewVersion: bounded(item.reviewVersion, 120),
      sourceFingerprint: bounded(item.sourceFingerprint, 64) || wellbeingSourceFingerprint(diary.content)
    });
    seen.add(diaryId);
  }
  return records;
}

async function storeHistoricalWellbeingRecords(client, { userId, records, modelVersion }) {
  let inserted = 0;
  for (const record of records) {
    const result = await client.query(
      `INSERT INTO wellbeing_records
        (id, user_id, diary_id, source_type, status, recorded_on, source_label,
         source_excerpt, observation, extraction, extraction_version, model_version, ai_allowed,
         health_value_types, why_useful, confidence, review_version, source_fingerprint)
       VALUES ($1, $2, $3, 'MIGRATED', 'PENDING', $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, false,
         $11::jsonb, $12, $13, $14, $15)
       ON CONFLICT (user_id, diary_id) WHERE diary_id IS NOT NULL DO UPDATE SET
         source_type = EXCLUDED.source_type,
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
      [crypto.randomUUID(), userId, record.diaryId, record.recordedOn,
        `${record.recordedOn} 的日记`, record.sourceExcerpt,
        JSON.stringify(record.observation), JSON.stringify(record.extraction),
        HEALTH_EXTRACTION_VERSION, bounded(modelVersion, 120),
        JSON.stringify(record.healthValueTypes || []), bounded(record.whyUseful, 500),
        record.confidence ?? null, bounded(record.reviewVersion, 120), bounded(record.sourceFingerprint, 64)]
    );
    inserted += result.rowCount;
  }
  return inserted;
}

module.exports = {
  normalizeHistoricalWellbeingRecords,
  selectHistoricalDiaries,
  storeHistoricalWellbeingRecords,
  wellbeingDiaryFingerprint
};
