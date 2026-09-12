'use strict';

const crypto = require('node:crypto');
const { HEALTH_EXTRACTION_VERSION, hasDiaryHealthExtraction, legacyHealthObservation, normalizeDiaryHealthExtraction } = require('./diary-health');

function bounded(value, limit = 1200) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, limit);
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
      extraction
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
         source_excerpt, observation, extraction, extraction_version, model_version, ai_allowed)
       VALUES ($1, $2, $3, 'MIGRATED', 'PENDING', $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, false)
       ON CONFLICT (user_id, diary_id) WHERE diary_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [crypto.randomUUID(), userId, record.diaryId, record.recordedOn,
        `${record.recordedOn} 的日记`, record.sourceExcerpt,
        JSON.stringify(record.observation), JSON.stringify(record.extraction),
        HEALTH_EXTRACTION_VERSION, bounded(modelVersion, 120)]
    );
    inserted += result.rowCount;
  }
  return inserted;
}

module.exports = { normalizeHistoricalWellbeingRecords, storeHistoricalWellbeingRecords };
