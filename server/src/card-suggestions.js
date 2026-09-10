'use strict';

function cleanText(value, maximum) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function cleanList(value, maximumItems, maximumLength) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanText(item, maximumLength)).filter(Boolean))].slice(0, maximumItems);
}

function normalizeCardSuggestion(value, existingCards) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const cards = Array.isArray(existingCards) ? existingCards : [];
  const cardsById = new Map(cards.map(card => [String(card.id), card]));
  const rawMatches = Array.isArray(source.existingMatches)
    ? source.existingMatches
    : (Array.isArray(source.existingCardIds) ? source.existingCardIds.map(cardId => ({ cardId })) : []);
  const seen = new Set();
  const existingMatches = [];

  for (const match of rawMatches) {
    const cardId = cleanText(match && typeof match === 'object' ? (match.cardId || match.id) : match, 64);
    const card = cardsById.get(cardId);
    if (!card || seen.has(cardId)) continue;
    seen.add(cardId);
    existingMatches.push({
      cardId,
      seedSentence: cleanText(card.seedSentence || card.seed_sentence, 500),
      tags: cleanList(card.tags, 6, 80),
      reason: cleanText(match && typeof match === 'object' ? match.reason : '', 300)
    });
    if (existingMatches.length >= 5) break;
  }

  const rawCard = source.newCard && typeof source.newCard === 'object' && !Array.isArray(source.newCard)
    ? source.newCard : {};
  const seedSentence = cleanText(rawCard.seedSentence, 500);
  const usageItems = cleanList(rawCard.usageItems, 10, 500);
  const shouldCreate = source.shouldCreate === true && Boolean(seedSentence) && usageItems.length > 0;
  const newCard = shouldCreate ? {
    seedSentence,
    myUnderstanding: cleanText(rawCard.myUnderstanding, 5000),
    usageItems,
    tags: cleanList(rawCard.tags, 20, 80)
  } : null;

  return {
    shouldCreate,
    reason: cleanText(source.reason, 500) || (shouldCreate ? '这段经历包含可以反复使用的个人觉察。' : '这篇日记更适合保留为完整经历。'),
    newCard,
    existingMatches,
    createdCardId: null,
    boundCardIds: []
  };
}

module.exports = { normalizeCardSuggestion };
