'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  diaryDateFromOccurredAt,
  isTodayDiaryDate,
  shanghaiDate
} = require('../src/diary-write-policy');

test('Shanghai diary day changes at China midnight rather than UTC midnight', () => {
  const afterShanghaiMidnight = new Date('2026-09-17T16:05:00.000Z');
  assert.equal(shanghaiDate(afterShanghaiMidnight), '2026-09-18');
  assert.equal(isTodayDiaryDate('2026-09-18', afterShanghaiMidnight), true);
  assert.equal(isTodayDiaryDate('2026-09-17', afterShanghaiMidnight), false);
  assert.equal(isTodayDiaryDate('2026-09-19', afterShanghaiMidnight), false);
});

test('diary occurred-at input exposes a validated local calendar date', () => {
  assert.equal(diaryDateFromOccurredAt('2026-09-18 08:30:00'), '2026-09-18');
  assert.equal(diaryDateFromOccurredAt('2026-09-18T08:30:00'), '2026-09-18');
  assert.equal(diaryDateFromOccurredAt('2026-02-30 08:30:00'), null);
  assert.equal(diaryDateFromOccurredAt('not-a-date'), null);
});
