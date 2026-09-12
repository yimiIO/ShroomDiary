'use strict';

const HEALTH_EXTRACTION_VERSION = 'diary-health-2026-09-13-v1';
const UNCERTAINTY_PATTERN = /可能|也许|好像|似乎|不确定|怀疑|感觉.*有关|未必|说不清/u;

function text(value, max = 600) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, max);
}

function stringList(value, maxItems = 12, maxLength = 120) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(item => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function boundedNumber(value, min, max) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : null;
}

function groundedExcerpt(value, diaryContent) {
  const excerpt = text(value, 600);
  return excerpt && String(diaryContent || '').includes(excerpt) ? excerpt : '';
}

function certainty(value, excerpt) {
  return value === 'UNCERTAIN' || UNCERTAINTY_PATTERN.test(excerpt) ? 'UNCERTAIN' : 'EXPLICIT';
}

function emptyDiaryHealthExtraction() {
  return {
    psychologicalObservations: [],
    physicalObservations: [],
    lifestyleFactors: [],
    environmentFactors: [],
    healthInquiryLinks: [],
    missingInformation: [],
    redFlags: []
  };
}

function normalizedItems(value, normalize, maxItems = 16) {
  const result = [];
  for (const item of Array.isArray(value) ? value : []) {
    const normalized = normalize(item || {});
    if (!normalized) continue;
    result.push(normalized);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeDiaryHealthExtraction(value, context = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const diaryContent = String(context.diaryContent || '');
  const existingHealthInquiries = new Set((context.existingInquiries || [])
    .filter(item => ['PSYCHOLOGICAL', 'PHYSICAL_HEALTH'].includes(item?.inquiryType || item?.inquiry_type))
    .map(item => String(item.id)));
  const result = emptyDiaryHealthExtraction();

  result.psychologicalObservations = normalizedItems(input.psychologicalObservations || input.psychological_observations, item => {
    const evidenceExcerpt = groundedExcerpt(item.evidenceExcerpt, diaryContent);
    const observation = text(item.observation || item.statement, 400);
    if (!evidenceExcerpt || !observation) return null;
    const aspect = ['EMOTION', 'STRESS', 'COGNITION', 'BEHAVIOR'].includes(item.aspect)
      ? item.aspect : 'EMOTION';
    return { observation, aspect, evidenceExcerpt, certainty: certainty(item.certainty, evidenceExcerpt) };
  });

  result.physicalObservations = normalizedItems(input.physicalObservations || input.physical_observations, item => {
    const evidenceExcerpt = groundedExcerpt(item.evidenceExcerpt, diaryContent);
    const symptom = text(item.symptom || item.observation, 300);
    if (!evidenceExcerpt || !symptom) return null;
    return {
      symptom,
      bodyAreas: stringList(item.bodyAreas, 8, 80),
      severity: boundedNumber(item.severity, 0, 10),
      observedAt: text(item.observedAt, 80),
      duration: text(item.duration, 160),
      measurements: stringList(item.measurements, 12, 200),
      testResults: stringList(item.testResults, 12, 300),
      evidenceExcerpt,
      certainty: certainty(item.certainty, evidenceExcerpt)
    };
  });

  result.lifestyleFactors = normalizedItems(input.lifestyleFactors || input.lifestyle_factors, item => {
    const evidenceExcerpt = groundedExcerpt(item.evidenceExcerpt, diaryContent);
    const factor = text(item.factor || item.observation, 300);
    if (!evidenceExcerpt || !factor) return null;
    const category = ['SLEEP', 'DIET', 'EXERCISE', 'CAFFEINE', 'ALCOHOL', 'MEDICATION', 'OTHER'].includes(item.category)
      ? item.category : 'OTHER';
    return { factor, category, evidenceExcerpt, certainty: certainty(item.certainty, evidenceExcerpt) };
  });

  result.environmentFactors = normalizedItems(input.environmentFactors || input.environment_factors, item => {
    const evidenceExcerpt = groundedExcerpt(item.evidenceExcerpt, diaryContent);
    const observation = text(item.observation || item.factor, 300);
    if (!evidenceExcerpt || !observation) return null;
    const category = ['TEMPERATURE', 'HUMIDITY', 'ALTITUDE', 'TRAVEL', 'LIVING_ENVIRONMENT', 'OTHER'].includes(item.category)
      ? item.category : 'OTHER';
    return { observation, category, evidenceExcerpt, certainty: certainty(item.certainty, evidenceExcerpt) };
  });

  result.healthInquiryLinks = normalizedItems(input.healthInquiryLinks || input.health_inquiry_links, item => {
    const inquiryId = String(item.inquiryId || item.inquiry_id || '');
    const evidenceExcerpt = groundedExcerpt(item.evidenceExcerpt || item.evidence_excerpt, diaryContent);
    const confidence = boundedNumber(item.confidence, 0, 1);
    if (!existingHealthInquiries.has(inquiryId) || !evidenceExcerpt || confidence === null || confidence < 0.65) return null;
    return { inquiryId, reason: text(item.reason, 500), evidenceExcerpt, confidence };
  }, 5);

  result.missingInformation = stringList(input.missingInformation || input.missing_information, 12, 400);
  result.redFlags = normalizedItems(input.redFlags || input.red_flags, item => {
    const evidenceExcerpt = groundedExcerpt(item.evidenceExcerpt || item.evidence_excerpt, diaryContent);
    const signal = text(item.signal, 400);
    if (!evidenceExcerpt || !signal) return null;
    const urgency = item.urgency === 'EMERGENCY' ? 'EMERGENCY' : 'URGENT';
    const action = urgency === 'EMERGENCY'
      ? '如该情况正在发生、加重或令人无法保证安全，请立即联系当地急救服务或前往急诊。'
      : '建议尽快联系医疗专业人员评估；如情况快速加重，请及时前往急诊。';
    return { signal, evidenceExcerpt, urgency, action };
  }, 6);

  return result;
}

function legacyHealthObservation(extraction) {
  const value = extraction || emptyDiaryHealthExtraction();
  const psychological = value.psychologicalObservations || [];
  const physical = value.physicalObservations || [];
  const lifestyle = value.lifestyleFactors || [];
  const stressors = psychological.filter(item => item.aspect === 'STRESS').map(item => item.observation);
  const cognitiveChanges = psychological.filter(item => item.aspect === 'COGNITION').map(item => item.observation);
  const psychologicalFeelings = psychological.filter(item => !['STRESS', 'COGNITION'].includes(item.aspect))
    .map(item => item.observation);
  const sleep = lifestyle.filter(item => item.category === 'SLEEP').map(item => item.factor);
  const behaviors = lifestyle.filter(item => item.category !== 'SLEEP').map(item => item.factor);
  const severityValues = physical.map(item => item.severity).filter(item => item !== null);
  return {
    psychologicalFeelings: stringList(psychologicalFeelings),
    stressors: stringList(stressors),
    cognitiveChanges: stringList(cognitiveChanges),
    physicalSymptoms: stringList(physical.map(item => item.symptom)),
    bodyAreas: stringList(physical.flatMap(item => item.bodyAreas || [])),
    severity: severityValues.length ? Math.max(...severityValues) : null,
    observedAt: text(physical.find(item => item.observedAt)?.observedAt, 80),
    duration: text(physical.find(item => item.duration)?.duration, 160),
    sleep: { hours: null, quality: null, note: text(sleep.join('；'), 300) },
    behaviors: stringList(behaviors),
    environmentFactors: stringList((value.environmentFactors || []).map(item => item.observation)),
    measurements: stringList(physical.flatMap(item => item.measurements || []), 20, 240),
    testResults: stringList(physical.flatMap(item => item.testResults || []), 20, 500)
  };
}

function hasDiaryHealthExtraction(value) {
  const item = value || {};
  return ['psychologicalObservations', 'physicalObservations', 'lifestyleFactors', 'environmentFactors', 'redFlags']
    .some(key => Array.isArray(item[key]) && item[key].length);
}

module.exports = {
  HEALTH_EXTRACTION_VERSION,
  emptyDiaryHealthExtraction,
  hasDiaryHealthExtraction,
  legacyHealthObservation,
  normalizeDiaryHealthExtraction
};
