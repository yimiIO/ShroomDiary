'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  COLLECTION_SLUG,
  COLLECTION_TITLE,
  deterministicUuid,
  EDITORIAL_CARDS,
	historicalUserId,
	historicalUserMobile,
  PEOPLE
} = require('../src/editorial-cards');

test('the first curated archive contains seven balanced voices and 56 reviewable cards', () => {
  assert.equal(COLLECTION_SLUG, 'human-notes');
  assert.equal(COLLECTION_TITLE, '人类留给自己的提醒');
  assert.equal(Object.keys(PEOPLE).length, 7);
  assert.equal(EDITORIAL_CARDS.length, 56);

  const counts = new Map();
	const owners = new Set();
  for (const card of EDITORIAL_CARDS) {
    const source = card.editorialSource;
    counts.set(source.personSlug, (counts.get(source.personSlug) || 0) + 1);
		assert.equal(card.ownerUserId, historicalUserId(source.personSlug));
		owners.add(card.ownerUserId);
  }
  assert.deepEqual([...counts.values()], [8, 8, 8, 8, 8, 8, 8]);
	assert.equal(owners.size, 7);
	assert.equal(new Set(Object.keys(PEOPLE).map(historicalUserMobile)).size, 7);
});

test('curated cards are explicit paraphrases or synthesis, never fabricated direct quotes', () => {
  const slugs = new Set();
  const ids = new Set();
  for (const card of EDITORIAL_CARDS) {
    assert.ok(card.seedSentence.length >= 12);
    assert.ok(card.myUnderstanding.length >= 20);
    assert.equal(card.usageItems.length, 2);
    assert.ok(card.tags.length >= 2);
    assert.ok(['PARAPHRASE', 'SYNTHESIS'].includes(card.editorialSource.provenanceType));
    assert.equal(card.editorialSource.directQuote, false);
    assert.match(card.editorialSource.sourceUrl, /^https:\/\//);
    assert.ok(card.editorialSource.sourceInstitution);
    assert.ok(card.editorialSource.editorialNote.includes('不是'));
    assert.equal(slugs.has(card.slug), false);
    slugs.add(card.slug);
    ids.add(deterministicUuid(`shroom:${card.collectionSlug}:${card.slug}`));
  }
  assert.equal(ids.size, EDITORIAL_CARDS.length);
});

test('the historical collection preserves critical distance from achievement and power', () => {
  const criticalCard = EDITORIAL_CARDS.find(card => card.slug === 'zeng-guofan-read-power-critically');
  assert.ok(criticalCard);
  assert.match(criticalCard.myUnderstanding, /权力|政治/);
  assert.match(criticalCard.editorialSource.editorialNote, /争议|完美导师/);
});
