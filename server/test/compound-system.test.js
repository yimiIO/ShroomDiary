'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DAILY_YOGA_PRACTICE,
  bodyStreak,
  normalizeYogaSelection,
  presentYogaPractice,
  summarizeCompoundTasks
} = require('../src/compound-system');

test('compound summary counts principal and proven reuse separately from plain automation', () => {
  const payload = {
    meta: { generatedAt: '2026-09-09T12:00:00+08:00' },
    assetBase: {
      principalContributions: 12,
      reuseEvents: 7,
      systems: [
        { key: 'business_rules', name: '业务与防复发规则', contributions: 5, reuseEvents: 3, recentContributions: 2, state: 'yielding' }
      ]
    },
    tasks: [
      { completedAt: '2026-09-09T01:00:00Z', durationMinutes: 40, status: 'seed', assetContribution: true, family: '规则沉淀' },
      { completedAt: '2026-09-09T02:00:00Z', durationMinutes: 20, status: 'reused', leveraged: true, family: '规则复用' },
      { completedAt: '2026-09-09T02:30:00Z', durationMinutes: 10, status: 'automated', automated: true, family: '固定提醒' },
      { completedAt: '2026-09-08T02:00:00Z', durationMinutes: 30, status: 'manual_repeat', family: '财务对账' },
      { completedAt: '2026-09-07T02:00:00Z', durationMinutes: 10, status: 'manual_once', family: '一次性沟通' },
      { completedAt: '2026-07-01T02:00:00Z', durationMinutes: 999, status: 'manual_repeat', family: '过期数据' }
    ]
  };
  const summary = summarizeCompoundTasks(payload, '2026-09-09', new Date('2026-09-09T04:00:00Z'));
  assert.equal(summary.available, true);
  assert.equal(summary.completed, true);
  assert.equal(summary.todayAssetCount, 2);
  assert.equal(summary.totalMinutes, 110);
  assert.equal(summary.compoundMinutes, 20);
  assert.equal(summary.principalMinutes, 40);
  assert.equal(summary.automationOnlyMinutes, 10);
  assert.equal(summary.compoundRate, 18.2);
  assert.equal(summary.principalRate, 36.4);
  assert.equal(summary.leakageRate, 36.4);
  assert.equal(summary.topLeakageFamily, '财务对账');
  assert.equal(summary.topLeakageMinutes, 30);
  assert.equal(summary.totalAssetContributions, 12);
  assert.equal(summary.totalReuseEvents, 7);
  assert.equal(summary.assetSystems[0].name, '业务与防复发规则');
});

test('body streak keeps yesterday alive until today is checked in', () => {
  assert.equal(bodyStreak(['2026-09-08', '2026-09-07'], '2026-09-09'), 2);
  assert.equal(bodyStreak(['2026-09-09', '2026-09-08', '2026-09-07'], '2026-09-09'), 3);
  assert.equal(bodyStreak(['2026-09-09', '2026-09-07'], '2026-09-09'), 1);
});

test('daily yoga is taught as short movement lessons followed by self practice', () => {
  assert.match(DAILY_YOGA_PRACTICE.title, /分段|动作/);
  assert.ok(DAILY_YOGA_PRACTICE.segments.length >= 5);
  for (const segment of DAILY_YOGA_PRACTICE.segments) {
    assert.ok(segment.endSeconds > segment.startSeconds);
    assert.ok(segment.endSeconds - segment.startSeconds <= 120, `${segment.title} is still a follow-along block`);
    assert.ok(segment.practiceSeconds >= 30);
    assert.ok(segment.steps.length >= 2);
  }
  assert.ok(DAILY_YOGA_PRACTICE.videoKeys.zh);
  assert.ok(DAILY_YOGA_PRACTICE.videoKeys.en);
  assert.ok(DAILY_YOGA_PRACTICE.segments.some(segment => segment.id === 'child-pose'));
  assert.ok(!DAILY_YOGA_PRACTICE.segments.some(segment => segment.id === 'plank-transition'));
  for (const segment of DAILY_YOGA_PRACTICE.segments) {
    assert.ok(segment.titleEn);
    assert.ok(segment.focusEn);
    assert.ok(segment.stepsEn.length >= 2);
    assert.ok(segment.cautionEn);
    assert.ok(segment.captions.length >= 3);
    assert.ok(segment.captions.every(caption => caption.zh && caption.en));
  }
  const selection = normalizeYogaSelection([
    DAILY_YOGA_PRACTICE.segments[0].id,
    DAILY_YOGA_PRACTICE.segments[0].id,
    'unknown-segment'
  ]);
  assert.deepEqual(selection.segmentIds, [DAILY_YOGA_PRACTICE.segments[0].id]);
  assert.ok(selection.durationMinutes >= 1);
});

test('daily yoga presents expiring media URLs without exposing storage keys', async () => {
  const practice = await presentYogaPractice(async key => `signed://${key}`);
  assert.match(practice.videoUrls.zh, /fit-for-duty-yoga-24min-zh\.mp4/);
  assert.match(practice.videoUrls.en, /fit-for-duty-yoga-24min-en\.mp4/);
  assert.match(practice.posterUrl, /fit-for-duty-yoga-poster\.jpg/);
  assert.equal(practice.videoKeys, undefined);
  assert.equal(practice.posterKey, undefined);
});
