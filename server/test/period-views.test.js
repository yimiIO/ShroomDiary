'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('period overview API is user-scoped, bounded and keeps source provenance', () => {
  const route = source('server/src/routes/diaries.js');
  assert.match(route, /router\.get\('\/overview'/);
  assert.match(route, /req\.user\.id/);
  assert.match(route, /MAX_OVERVIEW_DAYS/);
  assert.match(route, /scheduled_date BETWEEN/);
  assert.match(route, /event_type = 'COMPLETED'/);
  assert.match(route, /external_activity_events/);
  assert.match(route, /include_in_diary/);
  assert.doesNotMatch(route, /req\.query\.userId/);
});

test('diary home exposes day, week, month and year as first-class views', () => {
  const page = source('src/pages/diary/index.vue');
  const api = source('src/api/diary.js');
  for (const id of ['home-day-flow', 'home-day-timeline', 'home-view-week', 'home-view-month', 'home-view-year']) {
    assert.match(page, new RegExp(`data-testid="${id}"`));
  }
  assert.match(page, /periodView === 'day'/);
  assert.match(page, /class="week-overview"/);
  assert.match(page, /class="month-overview"/);
  assert.match(page, /class="year-overview"/);
  assert.match(page, /weekOverviewDays/);
  assert.match(page, /monthGridDays/);
  assert.match(page, /yearMonths/);
  assert.match(page, /openPeriodEntry/);
  assert.match(api, /diaryOverview/);
});

test('month and year views distinguish diary, todo, completion and connected sources', () => {
  const page = source('src/pages/diary/index.vue');
  assert.match(page, /diaryCount/);
  assert.match(page, /planCount/);
  assert.match(page, /completedCount/);
  assert.match(page, /sourceCount/);
  assert.match(page, /activityLevel/);
  assert.match(page, /计划不代表已经发生/);
});
