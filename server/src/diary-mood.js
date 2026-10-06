'use strict';

const DIARY_MOODS = new Set([
  'happy',
  'excited',
  'calm',
  'tired',
  'anxious',
  'sad',
  'angry',
  'confused',
  'complex'
]);

function normalizeDiaryMood(value) {
  if (typeof value !== 'string') return null;
  const mood = value.trim();
  return DIARY_MOODS.has(mood) ? mood : null;
}

module.exports = { DIARY_MOODS, normalizeDiaryMood };
