'use strict';

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

function validDateOnly(value) {
  const input = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const parsed = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input ? null : input;
}

function shanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function diaryDateFromOccurredAt(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T]|$)/);
  return match ? validDateOnly(match[1]) : null;
}

function isTodayDiaryDate(value, now = new Date()) {
  return validDateOnly(value) === shanghaiDate(now);
}

module.exports = {
  SHANGHAI_TIME_ZONE,
  diaryDateFromOccurredAt,
  isTodayDiaryDate,
  shanghaiDate,
  validDateOnly
};
