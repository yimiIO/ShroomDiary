'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  COLLAPSED_GAP_HEIGHT,
  HOUR_HEIGHT,
  buildTimelineLayout,
  minutesForTimelineOffset,
  timelineOffsetForMinutes
} = require('../../src/utils/day-timeline');

function percent(styleValue) {
  return Number(String(styleValue).replace('%', ''));
}

test('overlapping events share the row in separate columns', () => {
  const layout = buildTimelineLayout([
    { key: 'long', actualMinutes: 9 * 60, durationMinutes: 120 },
    { key: 'first', actualMinutes: 9 * 60 + 15, durationMinutes: 30 },
    { key: 'second', actualMinutes: 10 * 60, durationMinutes: 30 }
  ], 8, 12);
  const [long, first, second] = layout.entries;

  assert.equal(long.layoutColumnCount, 2);
  assert.equal(first.layoutColumnCount, 2);
  assert.equal(second.layoutColumnCount, 2);
  assert.equal(percent(long.timelineStyle.left), 0);
  assert.equal(percent(first.timelineStyle.left), 50);
  assert.equal(percent(second.timelineStyle.left), 50);
  assert.match(long.timelineStyle.width, /^calc\(50%/);
});

test('simultaneous point events receive one column each without changing time scale', () => {
  const entries = Array.from({ length: 4 }, (_, index) => ({ key: `event-${index}`, actualMinutes: 9 * 60 }));
  const layout = buildTimelineLayout(entries, 8, 11);

  assert.deepEqual(layout.entries.map(entry => entry.layoutColumn), [0, 1, 2, 3]);
  assert.deepEqual(layout.entries.map(entry => percent(entry.timelineStyle.left)), [0, 25, 50, 75]);
  assert.equal(layout.stageHeight, 3 * HOUR_HEIGHT);
});

test('events separated by the minimum readable visual interval stay full width', () => {
  const layout = buildTimelineLayout([
    { key: 'one', actualMinutes: 9 * 60, durationMinutes: 30 },
    { key: 'two', actualMinutes: 9 * 60 + 45, durationMinutes: 30 }
  ], 9, 11);

  layout.entries.forEach(entry => {
    assert.equal(entry.layoutColumnCount, 1);
    assert.equal(entry.timelineStyle.left, '0%');
    assert.match(entry.timelineStyle.width, /^calc\(100%/);
  });
});

test('short adjacent events use columns instead of visually covering each other', () => {
  const layout = buildTimelineLayout([
    { key: 'one', actualMinutes: 9 * 60, durationMinutes: 5 },
    { key: 'two', actualMinutes: 9 * 60 + 30, durationMinutes: 5 }
  ], 9, 11);

  assert.deepEqual(layout.entries.map(entry => entry.layoutColumn), [0, 1]);
  layout.entries.forEach(entry => assert.equal(entry.timelineStyle.height, '80rpx'));
});

test('timeline coordinate conversion uses a stable linear hour scale', () => {
  const layout = buildTimelineLayout([
    { key: 'one', actualMinutes: 600 },
    { key: 'two', actualMinutes: 605 },
    { key: 'three', actualMinutes: 610 }
  ], 9, 12);
  const offset = timelineOffsetForMinutes(layout, 10 * 60 + 30);
  const restored = minutesForTimelineOffset(layout, offset);

  assert.equal(offset, HOUR_HEIGHT * 1.5);
  assert.ok(Math.abs(restored - 630) < 0.001);
});

test('three or more continuous empty hours collapse into one truthful time segment', () => {
  const layout = buildTimelineLayout([
    { key: 'morning', actualMinutes: 8 * 60, durationMinutes: 60 },
    { key: 'evening', actualMinutes: 21 * 60, durationMinutes: 60 }
  ], 0, 24, { collapseEmptyGaps: true });

  assert.deepEqual(layout.gaps.map(gap => [gap.startHour, gap.endHour, gap.hours, gap.collapsed]), [
    [0, 8, 8, true],
    [9, 21, 12, true]
  ]);
  assert.equal(layout.gaps[0].height, COLLAPSED_GAP_HEIGHT);
  assert.equal(layout.gaps[1].height, COLLAPSED_GAP_HEIGHT);
  assert.ok(layout.stageHeight < 24 * HOUR_HEIGHT);
});

test('two empty hours remain expanded and an explicitly opened gap restores its full scale', () => {
  const entries = [
    { key: 'early', actualMinutes: 8 * 60, durationMinutes: 60 },
    { key: 'late', actualMinutes: 12 * 60, durationMinutes: 60 }
  ];
  const collapsed = buildTimelineLayout(entries, 8, 13, { collapseEmptyGaps: true });
  assert.equal(collapsed.gaps.length, 1);
  assert.equal(collapsed.gaps[0].key, '9-12');

  const expanded = buildTimelineLayout(entries, 8, 13, {
    collapseEmptyGaps: true,
    expandedGapKeys: ['9-12']
  });
  assert.equal(expanded.gaps[0].collapsed, false);
  assert.equal(expanded.gaps[0].height, 3 * HOUR_HEIGHT);
  assert.equal(expanded.stageHeight, 5 * HOUR_HEIGHT);

  const twoHourGap = buildTimelineLayout([
    { key: 'first', actualMinutes: 8 * 60, durationMinutes: 60 },
    { key: 'second', actualMinutes: 11 * 60, durationMinutes: 60 }
  ], 8, 12, { collapseEmptyGaps: true });
  assert.equal(twoHourGap.gaps.length, 0);
});

test('minute conversion remains reversible across compressed empty gaps', () => {
  const layout = buildTimelineLayout([
    { key: 'morning', actualMinutes: 8 * 60, durationMinutes: 60 },
    { key: 'evening', actualMinutes: 21 * 60, durationMinutes: 60 }
  ], 0, 24, { collapseEmptyGaps: true });
  const minute = 15 * 60 + 30;
  const offset = timelineOffsetForMinutes(layout, minute);
  const restored = minutesForTimelineOffset(layout, offset);

  assert.ok(Math.abs(restored - minute) < 0.001);
});
