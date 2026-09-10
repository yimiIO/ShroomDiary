'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildLifeOsMarkdown,
  normalizeLifeOsDraft
} = require('../src/life-os-draft');

const sources = [
  { key: 'D1', type: 'diary', id: 'diary-1', date: '2026-08-01', label: '8 月 1 日的日记' },
  { key: 'D2', type: 'diary', id: 'diary-2', date: '2026-08-18', label: '8 月 18 日的日记' },
  { key: 'C1', type: 'card', id: 'card-1', date: '2026-08-20', label: '菇卡「先补充能量」' }
];

test('life OS draft keeps only cross-record principles backed by owned sources', () => {
  const normalized = normalizeLifeOsDraft({
    summary: '当前最稳定的上层模式与能量、边界有关。',
    principles: [{
      area: '能量与节律',
      principle: '先保护基础能量，再做高强度决策。',
      boundary: '短期紧急事件可以临时打破，但需要补偿。',
      reviewQuestion: '我现在是在做决策，还是在对抗疲惫？',
      evidence: ['D1', 'D2', 'NOT_OWNED'],
      confidence: 'high'
    }, {
      area: '关系与边界',
      principle: '一次性感受不应该成为人生 OS。',
      evidence: ['D1'],
      confidence: 'emerging'
    }]
  }, sources);

  assert.equal(normalized.principles.length, 1);
  assert.deepEqual(normalized.principles[0].evidence, ['D1', 'D2']);
  assert.deepEqual(normalized.sourceRefs, [
    { type: 'diary', id: 'diary-1' },
    { type: 'diary', id: 'diary-2' }
  ]);
});

test('life OS markdown describes an abstract operating layer with inspectable evidence', () => {
  const normalized = normalizeLifeOsDraft({
    summary: '你在多个场景里都会被能量不足改变判断。',
    principles: [{
      area: '能量与节律',
      principle: '重大判断应建立在基础能量可用之上。',
      boundary: '紧急事件之后要补偿。',
      reviewQuestion: '我现在的能量足以做这个判断吗？',
      evidence: ['D1', 'D2', 'C1'],
      confidence: 'high'
    }],
    tensions: ['成长速度与恢复节律仍有冲突']
  }, sources);
  const markdown = buildLifeOsMarkdown(normalized);

  assert.match(markdown, /# 我的人生 OS/);
  assert.match(markdown, /跨情境的选择系统/);
  assert.match(markdown, /证据：8 月 1 日的日记、8 月 18 日的日记、菇卡/);
  assert.match(markdown, /仍在观察/);
});
