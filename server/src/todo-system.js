'use strict';

const TASK_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const RECURRENCE_FREQUENCIES = new Set(['DAILY', 'WEEKLY', 'MONTHLY']);

function dateOnly(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const input = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const parsed = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input ? null : input;
}

function normalizeTimeZone(value) {
  const candidate = String(value || '').trim() || 'Asia/Shanghai';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch (_) {
    return 'Asia/Shanghai';
  }
}

function todayInTimeZone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function utcDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value, amount) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function compareDates(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function isoWeekday(value) {
  const day = utcDate(value).getUTCDay();
  return day === 0 ? 7 : day;
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function normalizeRecurrence(value = {}, fallbackStartDate = null, fallbackTimeZone = null) {
  const frequency = String(value.frequency || '').toUpperCase();
  if (!RECURRENCE_FREQUENCIES.has(frequency)) return null;
  const startsOn = dateOnly(value.startsOn) || dateOnly(fallbackStartDate);
  if (!startsOn) return null;
  const endsOn = dateOnly(value.endsOn);
  const weekDays = [...new Set((Array.isArray(value.weekDays) ? value.weekDays : [])
    .map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort();
  const monthDay = Math.max(1, Math.min(31, Number(value.monthDay) || Number(startsOn.slice(8, 10))));
  return {
    frequency,
    startsOn,
    endsOn: endsOn && endsOn >= startsOn ? endsOn : null,
    weekDays: frequency === 'WEEKLY' ? (weekDays.length ? weekDays : [isoWeekday(startsOn)]) : [],
    monthDay: frequency === 'MONTHLY' ? monthDay : null,
    timeZone: normalizeTimeZone(value.timeZone || fallbackTimeZone)
  };
}

function recurrenceDates(rule, fromDate, throughDate, limit = 800) {
  const from = dateOnly(fromDate) || rule.startsOn;
  const through = dateOnly(throughDate) || from;
  if (!rule || !dateOnly(rule.startsOn) || through < from) return [];
  const start = compareDates(from, rule.startsOn) < 0 ? rule.startsOn : from;
  const end = rule.endsOn && rule.endsOn < through ? rule.endsOn : through;
  if (end < start) return [];
  const dates = [];

  if (rule.frequency === 'MONTHLY') {
    let cursor = utcDate(start);
    cursor.setUTCDate(1);
    const final = utcDate(end);
    while (cursor <= final && dates.length < limit) {
      const day = Math.min(rule.monthDay, lastDayOfMonth(cursor.getUTCFullYear(), cursor.getUTCMonth()));
      const candidate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), day)).toISOString().slice(0, 10);
      if (candidate >= start && candidate >= rule.startsOn && candidate <= end) dates.push(candidate);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return dates;
  }

  let cursor = start;
  while (cursor <= end && dates.length < limit) {
    if (rule.frequency === 'DAILY' || (rule.frequency === 'WEEKLY' && rule.weekDays.includes(isoWeekday(cursor)))) {
      dates.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function decorateTask(task, today) {
  const deadline = dateOnly(task.deadline);
  const scheduledDate = dateOnly(task.scheduledDate || task.scheduled_date);
  return {
    ...task,
    deadline,
    scheduledDate,
    isOverdue: Boolean(deadline && deadline < today && !['completed', 'cancelled'].includes(task.status)),
    isPastScheduled: Boolean(scheduledDate && scheduledDate < today && !['completed', 'cancelled'].includes(task.status))
  };
}

function groupCurrentTasks(tasks, today) {
  const remaining = tasks.map(item => decorateTask(item, today))
    .filter(item => ['pending', 'in_progress'].includes(item.status));
  const used = new Set();
  const take = predicate => remaining.filter(item => !used.has(item.id) && predicate(item)).map(item => {
    used.add(item.id);
    return item;
  });
  return {
    progressing: take(item => item.status === 'in_progress'),
    today: take(item => item.scheduledDate === today || item.deadline === today),
    earlier: take(item => Boolean((item.scheduledDate && item.scheduledDate < today)
      || (!item.scheduledDate && item.deadline && item.deadline < today)))
  };
}

function taskMatchesView(task, view, today) {
  const item = decorateTask(task, today);
  if (view === 'completed') return item.status === 'completed';
  if (view === 'all') return item.status !== 'cancelled';
  if (!['pending', 'in_progress'].includes(item.status)) return false;
  if (view === 'unscheduled') return !item.scheduledDate;
  if (view === 'upcoming') {
    const nextDate = item.scheduledDate || item.deadline;
    return Boolean(nextDate && nextDate > today);
  }
  return item.status === 'in_progress'
    || Boolean(item.scheduledDate && item.scheduledDate <= today)
    || Boolean(item.deadline && item.deadline <= today);
}

function repeatLabel(rule) {
  if (!rule) return '';
  if (rule.frequency === 'DAILY') return '每天重复';
  if (rule.frequency === 'WEEKLY') return `每周 ${rule.weekDays.join('、')}`;
  if (rule.frequency === 'MONTHLY') return `每月 ${rule.monthDay} 日`;
  return '';
}

module.exports = {
  RECURRENCE_FREQUENCIES,
  TASK_STATUSES,
  addDays,
  compareDates,
  dateOnly,
  decorateTask,
  groupCurrentTasks,
  normalizeRecurrence,
  normalizeTimeZone,
  recurrenceDates,
  repeatLabel,
  taskMatchesView,
  todayInTimeZone
};
