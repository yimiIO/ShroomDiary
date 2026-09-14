'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  conceptCatalogForModel,
  findLegacyWellbeingConcept,
  findWellbeingConcept,
  publicConcept
} = require('../src/wellbeing-concepts');

test('controlled wellbeing catalog has stable unique ids in both domains', () => {
  const concepts = [
    ...conceptCatalogForModel('PSYCHOLOGICAL'),
    ...conceptCatalogForModel('PHYSICAL')
  ];
  assert.ok(concepts.length >= 20);
  assert.equal(new Set(concepts.map(item => item.conceptId)).size, concepts.length);
  assert.ok(concepts.every(item => item.matchGuidance && item.boundary));
});

test('public concept explanations include professional source and diagnostic boundary', () => {
  for (const conceptId of ['psych.rejection-sensitivity', 'psych.anger-rumination', 'physical.hyperhidrosis']) {
    const concept = publicConcept(findWellbeingConcept(conceptId));
    assert.ok(concept.definition.length > 20);
    assert.ok(concept.boundary.length > 20);
    assert.match(concept.source.url, /^https:\/\//u);
  }
});

test('legacy aliases resolve only to curated concepts', () => {
  assert.equal(findLegacyWellbeingConcept('愤怒反刍与冲突后持续投入').id, 'psych.anger-rumination');
  assert.equal(findLegacyWellbeingConcept('冲突回避与告别困难'), null);
});
