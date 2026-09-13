'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDiaryHealthExtraction } = require('../src/diary-health');
const { normalizeInquiryCandidates } = require('../src/inquiry-candidates');

const root = path.join(__dirname, '..', '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('wellbeing extraction cannot choose or link an inquiry', () => {
  const inquiryId = '11111111-1111-4111-8111-111111111111';
  const extraction = normalizeDiaryHealthExtraction({
    physicalObservations: [{ symptom: '头痛', evidenceExcerpt: '今天头痛', certainty: 'EXPLICIT' }],
    healthInquiryLinks: [{ inquiryId, reason: '可能相关', evidenceExcerpt: '今天头痛', confidence: 0.9 }]
  }, {
    diaryContent: '今天头痛',
    existingInquiries: [{ id: inquiryId, inquiryType: 'PHYSICAL_HEALTH' }]
  });

  assert.equal(extraction.healthInquiryLinks, undefined);
});

test('inquiry candidates do not carry wellbeing observations', () => {
  const [candidate] = normalizeInquiryCandidates([{
    question: '为什么我最近总是头痛？',
    context: '需要继续观察',
    confidence: 0.9,
    inquiryType: 'PHYSICAL_HEALTH',
    healthObservation: { physicalSymptoms: ['头痛'] }
  }]);

  assert.equal(Object.hasOwn(candidate, 'healthObservation'), false);
});

test('inquiry and wellbeing routes have no cross-module storage dependency', () => {
  const inquiryRoutes = source('server/src/routes/inquiries.js');
  const wellbeingRoutes = source('server/src/routes/wellbeing.js');
  const wellbeingStore = source('server/src/wellbeing-records.js');
  const prompt = source('server/src/ai-prompts.js');
  const migration = source('server/sql/027_decouple_inquiries_wellbeing.sql');

  assert.doesNotMatch(inquiryRoutes, /wellbeing_records|wellbeing_record_id|source_type\s*=\s*'WELLBEING'/u);
  assert.doesNotMatch(wellbeingRoutes, /inquiry_evidence|\/inquiries\/:inquiryId/u);
  assert.doesNotMatch(wellbeingStore, /inquiry_evidence|linked_inquiry_ids/u);
  assert.doesNotMatch(prompt, /healthInquiryLinks/u);
  assert.match(migration, /DROP COLUMN IF EXISTS wellbeing_record_id/u);
  assert.match(migration, /DROP COLUMN IF EXISTS health_observation/u);
});

test('the product UI describes two independent readings of the same diary', () => {
  const inquiryList = source('src/pages/shroom/inquiries.vue');
  const inquiryDetail = source('src/pages/shroom/inquiry.vue');
  const analysis = source('src/pages/shroom/ai-analysis.vue');
  const wellbeingApi = source('src/api/wellbeing.js');

  assert.match(inquiryList, /同一篇日记[^<]*独立理解/u);
  assert.match(inquiryDetail, /直接来自日记/u);
  assert.doesNotMatch(analysis, /wellbeingInquiryLink|healthInquiryLinks/u);
  assert.doesNotMatch(wellbeingApi, /wellbeingInquiryLink/u);
});
