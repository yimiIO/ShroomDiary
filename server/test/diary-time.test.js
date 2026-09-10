'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  diaryLocalDate,
  diaryTimeLabel,
  hasExplicitDiaryTime,
  isFullDayDiary
} = require('../../src/utils/diary-time');

test('a diary without explicit hour and minute remains an all-day diary', () => {
  const diary = { hour: null, minute: null, createdAt: '2026-02-08T23:42:00+08:00' };
  assert.equal(hasExplicitDiaryTime(diary), false);
  assert.equal(isFullDayDiary(diary), true);
  assert.equal(diaryTimeLabel(diary), '全天');
});

test('midnight and 23:00 are explicit timeline times', () => {
  assert.equal(hasExplicitDiaryTime({ hour: 0, minute: 0 }), true);
  assert.equal(isFullDayDiary({ hour: 0, minute: 0 }), false);
  assert.equal(diaryTimeLabel({ hour: 0, minute: 0 }), '00:00');
  assert.equal(diaryTimeLabel({ hour: 23, minute: 0 }), '23:00');
});

test('partial or invalid time values are treated as all-day', () => {
  assert.equal(isFullDayDiary({ hour: 23, minute: null }), true);
  assert.equal(isFullDayDiary({ hour: 24, minute: 0 }), true);
  assert.equal(isFullDayDiary({ hour: 12, minute: 60 }), true);
});

test('the server-provided diary date wins over timestamp timezone formatting', () => {
  assert.equal(diaryLocalDate({ date: '2026-09-07', createdAt: '2026-09-06T16:00:00.000Z' }), '2026-09-07');
  assert.equal(diaryLocalDate({ createdAt: '2026-09-07T23:00:00+08:00' }), '2026-09-07');
});
