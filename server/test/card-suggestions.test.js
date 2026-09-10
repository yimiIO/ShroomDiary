'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeCardSuggestion } = require('../src/card-suggestions');

const cards = [{
  id: 'card-1',
  seed_sentence: '先验证事实，再解释情绪',
  tags: ['判断', '情绪']
}, {
  id: 'card-2',
  seed_sentence: '把重要的事放进日历',
  tags: ['行动']
}];

test('card suggestion keeps only owned historical card matches', () => {
  const result = normalizeCardSuggestion({
    shouldCreate: false,
    reason: '已有菇卡足以承接',
    existingMatches: [
      { cardId: 'card-2', reason: '这次经历再次验证了它' },
      { cardId: 'not-owned', reason: 'must be removed' },
      { cardId: 'card-2', reason: 'duplicate' }
    ]
  }, cards);

  assert.equal(result.shouldCreate, false);
  assert.equal(result.newCard, null);
  assert.deepEqual(result.existingMatches, [{
    cardId: 'card-2',
    seedSentence: '把重要的事放进日历',
    tags: ['行动'],
    reason: '这次经历再次验证了它'
  }]);
});

test('new card suggestion is a private-ready bounded draft', () => {
  const result = normalizeCardSuggestion({
    shouldCreate: true,
    reason: '  可以反复使用  ',
    newCard: {
      seedSentence: '  当信息不足时，先问一个事实问题  ',
      myUnderstanding: '  不急着给经历下结论。  ',
      usageItems: ['先问事实', '', '先问事实', '记录答案'],
      tags: ['判断', '判断', '行动']
    },
    existingCardIds: ['card-1']
  }, cards);

  assert.equal(result.shouldCreate, true);
  assert.equal(result.newCard.seedSentence, '当信息不足时，先问一个事实问题');
  assert.deepEqual(result.newCard.usageItems, ['先问事实', '记录答案']);
  assert.deepEqual(result.newCard.tags, ['判断', '行动']);
  assert.equal(result.createdCardId, null);
  assert.deepEqual(result.boundCardIds, []);
  assert.equal(result.existingMatches[0].cardId, 'card-1');
});

test('blank AI draft cannot create an empty card', () => {
  const result = normalizeCardSuggestion({
    shouldCreate: true,
    reason: '',
    newCard: { seedSentence: '   ' }
  }, cards);

  assert.equal(result.shouldCreate, false);
  assert.equal(result.newCard, null);
});

test('a card without a concrete use case remains a diary insight', () => {
  const result = normalizeCardSuggestion({
    shouldCreate: true,
    newCard: { seedSentence: '一个只有观点、没有用法的句子', usageItems: [] }
  }, cards);

  assert.equal(result.shouldCreate, false);
  assert.equal(result.newCard, null);
});
