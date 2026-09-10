'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LIFE_OS_REVIEW_PROMPT,
  MAX_ACTIVE_CLAUSES,
  normalizeReviewPlan,
  renderLifeOsMarkdown
} = require('../src/life-os-review');

const sources = [
  { key: 'D1', type: 'diary', id: '11111111-1111-4111-8111-111111111111', label: '9 月 1 日的日记' },
  { key: 'D2', type: 'diary', id: '22222222-2222-4222-8222-222222222222', label: '9 月 8 日的日记' },
  { key: 'C1', type: 'card', id: '33333333-3333-4333-8333-333333333333', label: '菇卡「给判断留出恢复时间」' }
];

const clauses = [{
  key: 'O1',
  id: '44444444-4444-4444-8444-444444444444',
  principle: '精力不足时推迟重大判断。',
  sourceRefs: [{ type: 'diary', id: sources[0].id }]
}];

test('review prompt keeps cards separate from actions and asks for compression', () => {
  assert.match(LIFE_OS_REVIEW_PROMPT, /菇卡不是行动、待办或承诺/);
  assert.equal(MAX_ACTIVE_CLAUSES, 50);
  assert.match(LIFE_OS_REVIEW_PROMPT, /理想 5–9 条，最多 50 条/);
  assert.match(LIFE_OS_REVIEW_PROMPT, /重复项要合并/);
});

test('review normalization accepts up to the configured 50-clause ceiling', () => {
  const proposedPrinciples = Array.from({ length: 55 }, (_, index) => ({
    key: `N${index + 1}`,
    area: '核心取向',
    principle: `我主动选择的判断标准 ${index + 1}`,
    basis: 'chosen',
    confidence: 'emerging'
  }));

  const result = normalizeReviewPlan({ proposedPrinciples }, sources, clauses);
  assert.equal(result.principles.length, 50);
});

test('review plan keeps chosen principles but rejects weak inferred claims', () => {
  const result = normalizeReviewPlan({
    summary: '从三条缩成两条。',
    proposedPrinciples: [{
      key: 'N1',
      area: '核心取向',
      principle: '我优先保护长期自主性。',
      basis: 'chosen',
      confidence: 'medium',
      evidence: []
    }, {
      key: 'N2',
      area: '能量与节律',
      principle: '能量不足时，我推迟不可逆的判断。',
      basis: 'observed',
      confidence: 'high',
      sourceClauses: ['O1'],
      evidence: ['D1', 'D2', 'NOT_OWNED'],
      counterEvidence: ['C1']
    }, {
      key: 'N3',
      area: '关系与边界',
      principle: '一次日记就证明我总是逃避冲突。',
      basis: 'observed',
      evidence: ['D1']
    }]
  }, sources, clauses);

  assert.equal(result.principles.length, 2);
  assert.equal(result.principles[0].basis, 'chosen');
  assert.deepEqual(result.principles[1].sourceClauseIds, [clauses[0].id]);
  assert.deepEqual(result.principles[1].evidenceKeys, ['D1', 'D2']);
  assert.deepEqual(result.principles[1].counterEvidenceKeys, ['C1']);
  assert.deepEqual(result.principles[1].sourceRefs, [
    { type: 'diary', id: sources[0].id },
    { type: 'diary', id: sources[1].id }
  ]);
});

test('rendered OS is a compact signed view rather than a card collection', () => {
  const markdown = renderLifeOsMarkdown([{
    area: '决策与取舍',
    principle: '我用长期自主性判断短期机会。',
    boundary: '重要关系中的主动承诺不等同于失去自主。',
    reviewQuestion: '这个机会扩大还是缩小了未来的选择空间？',
    basis: 'mixed',
    confidence: 'medium'
  }], ['自由与承诺的边界仍需观察']);

  assert.match(markdown, /菇卡帮助我在具体时刻做得更好/);
  assert.match(markdown, /当前生效 1 条原则/);
  assert.match(markdown, /形成方式：选择与经历共同形成/);
  assert.match(markdown, /仍在观察/);
});
