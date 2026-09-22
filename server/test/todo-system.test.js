'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clockTime,
  groupCurrentTasks,
  normalizeRecurrence,
  recurrenceDates,
  taskMatchesView
} = require('../src/todo-system');

test('a title-only task stays a valid unscheduled task', () => {
  const task = { id: 'one', title: '整理案例', status: 'pending', scheduledDate: null, deadline: null };
  assert.equal(taskMatchesView(task, 'unscheduled', '2026-09-13'), true);
  assert.equal(taskMatchesView(task, 'current', '2026-09-13'), false);
});

test('starting an undated task puts it first in current without changing its date', () => {
  const groups = groupCurrentTasks([
    { id: 'active', status: 'in_progress', scheduledDate: null, deadline: null },
    { id: 'today', status: 'pending', scheduledDate: '2026-09-13', deadline: null }
  ], '2026-09-13');
  assert.deepEqual(groups.progressing.map(item => item.id), ['active']);
  assert.equal(groups.progressing[0].scheduledDate, null);
  assert.deepEqual(groups.today.map(item => item.id), ['today']);
});

test('past scheduling is not called overdue unless a real deadline passed', () => {
  const groups = groupCurrentTasks([
    { id: 'scheduled', status: 'pending', scheduledDate: '2026-09-10', deadline: null },
    { id: 'deadline', status: 'pending', scheduledDate: null, deadline: '2026-09-11' }
  ], '2026-09-13');
  assert.equal(groups.earlier[0].isPastScheduled, true);
  assert.equal(groups.earlier[0].isOverdue, false);
  assert.equal(groups.earlier[1].isOverdue, true);
});

test('a task matching several current rules is shown only once', () => {
  const groups = groupCurrentTasks([
    { id: 'same', status: 'in_progress', scheduledDate: '2026-09-13', deadline: '2026-09-12' }
  ], '2026-09-13');
  assert.equal(groups.progressing.length, 1);
  assert.equal(groups.today.length, 0);
  assert.equal(groups.earlier.length, 0);
});

test('weekly recurrence is deterministic and idempotent by occurrence date', () => {
  const rule = normalizeRecurrence({
    frequency: 'WEEKLY', startsOn: '2026-09-07', weekDays: [1, 3, 3], timeZone: 'Asia/Shanghai'
  });
  assert.deepEqual(recurrenceDates(rule, '2026-09-07', '2026-09-20'), [
    '2026-09-07', '2026-09-09', '2026-09-14', '2026-09-16'
  ]);
});

test('monthly day 31 clamps to short month and returns to 31 later', () => {
  const rule = normalizeRecurrence({ frequency: 'MONTHLY', startsOn: '2026-01-31', monthDay: 31 });
  assert.deepEqual(recurrenceDates(rule, '2026-01-31', '2026-04-30'), [
    '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'
  ]);
});

test('an invalid timezone falls back without rejecting the base task', () => {
  const rule = normalizeRecurrence({ frequency: 'DAILY', startsOn: '2026-09-13', timeZone: 'Mars/Olympus' });
  assert.equal(rule.timeZone, 'Asia/Shanghai');
});

test('recurring habits keep a validated fixed time window', () => {
  const rule = normalizeRecurrence({
    frequency: 'WEEKLY', startsOn: '2026-09-21', weekDays: [1, 3, 5],
    scheduledStartTime: '07:30', scheduledEndTime: '08:15', timeZone: 'Asia/Shanghai'
  });
  assert.equal(rule.scheduledStartTime, '07:30');
  assert.equal(rule.scheduledEndTime, '08:15');
  assert.equal(clockTime('07:30:00'), '07:30');
  assert.equal(normalizeRecurrence({
    frequency: 'DAILY', startsOn: '2026-09-21', scheduledStartTime: '09:00', scheduledEndTime: '08:00'
  }), null);
});

test('PostgreSQL Date values keep their calendar date in API mapping helpers', () => {
  const task = { id: 'db-date', status: 'pending', scheduledDate: new Date('2026-09-13T00:00:00.000Z') };
  assert.equal(taskMatchesView(task, 'current', '2026-09-13'), true);
});
