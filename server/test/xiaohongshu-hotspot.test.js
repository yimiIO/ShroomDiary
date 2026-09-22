'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateHotspot, weightedScore } = require('../src/xiaohongshu-hotspot');

test('weighted score keeps the public 0-100 contract', () => {
  assert.equal(weightedScore({
    targetAudienceFit: 5,
    brandTruthFit: 5,
    participationPotential: 5,
    freshness: 5,
    evidenceQuality: 5,
    safety: 5
  }), 100);
});

test('a relevant sourced AI discussion can enter the founder-judgment column', () => {
  const result = evaluateHotspot({
    title: 'AI越来越聪明我们更懂自己了吗',
    angle: 'FOUNDER_JUDGMENT',
    evidenceType: 'CROSS_PLATFORM_SIGNAL',
    expiresAt: '2026-09-20T23:59:59+08:00',
    sources: [{ url: 'https://noobclaw.com/cn/hot-topics/2026-09-18/' }],
    shroomTruth: '聪明回答不等于能回到个人原文、变化与反例的自我理解。',
    userQuestion: 'AI说过哪句话让你觉得被理解，后来还觉得准确吗？',
    scores: {
      targetAudienceFit: 5,
      brandTruthFit: 5,
      participationPotential: 4,
      freshness: 5,
      evidenceQuality: 3.5,
      safety: 5
    }
  });

  assert.equal(result.decision, 'PURSUE');
  assert.equal(result.column, '做菇的人');
  assert.equal(result.evidenceType, 'CROSS_PLATFORM_SIGNAL');
  assert.ok(result.score >= 78);
});

test('a high-traffic memorial or disaster topic is rejected regardless of score', () => {
  const result = evaluateHotspot({
    title: '高热纪念事件',
    angle: 'FOUNDER_JUDGMENT',
    sources: [{ url: 'https://example.com/source' }],
    shroomTruth: '不应商业化利用。',
    userQuestion: '无',
    hardStopReasons: ['MEMORIAL_EVENT'],
    scores: Object.fromEntries(['targetAudienceFit', 'brandTruthFit', 'participationPotential', 'freshness', 'evidenceQuality', 'safety'].map(key => [key, 5]))
  });

  assert.equal(result.decision, 'REJECT');
  assert.deepEqual(result.hardStopReasons, ['MEMORIAL_EVENT']);
});

test('hot traffic without a Shroom-owned angle or source never enters production', () => {
  const result = evaluateHotspot({
    title: '一个纯娱乐热梗',
    angle: 'UNKNOWN',
    scores: {
      targetAudienceFit: 5,
      brandTruthFit: 5,
      participationPotential: 5,
      freshness: 5,
      evidenceQuality: 5,
      safety: 5
    }
  });

  assert.equal(result.decision, 'REJECT');
  assert.deepEqual(result.missing.sort(), ['column_route', 'shroom_truth', 'source', 'user_question']);
});
