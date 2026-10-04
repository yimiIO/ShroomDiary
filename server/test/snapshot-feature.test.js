'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('daily snapshot migration keeps one private snapshot per user and day', () => {
  const migration = source('server/sql/059_snapshot.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS snapshots/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS snapshot_meals/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS snapshot_meditations/);
  assert.match(migration, /snapshots_user_day_unique[\s\S]*user_id, day/);
  assert.match(migration, /REFERENCES users\(id\) ON DELETE CASCADE/);
});

test('daily snapshot API is authenticated and persists allowlisted fields on insert and update', () => {
  const app = source('server/src/app.js');
  const route = source('server/src/routes/snapshot.js');
  assert.match(app, /app\.use\('\/api\/snapshot\/v1', snapshotRoutes\)/);
  assert.match(route, /router\.use\(requireUser\)/);
  assert.match(route, /ON CONFLICT \(user_id, day\) DO UPDATE SET \$\{updateFields\}/);
  assert.match(route, /\[uuid\(\), req\.user\.id, day, \.\.\.fieldValues\]/);
  assert.doesNotMatch(route, /req\.body\s*\.\s*user_?id/i);
});

test('daily snapshot client omits an undefined date and exposes the fifth tab', () => {
  const api = source('src/api/snapshot.js');
  const meal = source('src/pages/snapshot/meal.vue');
  const meditation = source('src/pages/snapshot/meditation.vue');
  const app = source('src/App.vue');
  const pages = JSON.parse(source('src/pages.json'));
  assert.match(api, /date \? \{ params: \{ date \} \} : \{\}/);
  assert.match(meal, /await addMeal\(/);
  assert.match(meditation, /await completeMeditation\(/);
  assert.equal(pages.tabBar.list.length, 5);
  assert.ok(pages.tabBar.list.some(item => item.pagePath === 'pages/snapshot/index'));
  assert.deepEqual(
    pages.tabBar.list.map(item => [item.pagePath, item.text]),
    [
      ['pages/diary/index', '记录'],
      ['pages/shroom/cards', '菇卡'],
      ['pages/snapshot/index', '今日'],
      ['pages/shroom/discover', '发现'],
      ['pages/shroom/me', '我的']
    ]
  );
  assert.match(app, /uni-tabbar \.uni-tabbar__bd\s*\{[^}]*background:\s*transparent\s*!important;[^}]*box-shadow:\s*none\s*!important;/);
  assert.match(app, /img\[src\*="-selected"\]\) \.uni-tabbar__icon img\s*\{[^}]*opacity:\s*1\s*!important;/);
  assert.match(app, /img\[src\*="-selected"\]\) \.uni-tabbar__label\s*\{[^}]*color:\s*#171717\s*!important;/);
});

test('daily snapshot page follows the approved editorial structure without baking live data into artwork', () => {
  const page = source('src/pages/snapshot/index.vue');
  const requiredAssets = [
    'src/static/images/shroom-snapshot-hero-art-v2.webp',
    'src/static/images/shroom-snapshot-health-landscape-v1.webp',
    'src/static/images/shroom-snapshot-meal-art-v1.webp'
  ];

  assert.match(page, /class="snapshot-hero"/);
  assert.match(page, /class="challenge-panel"/);
  assert.match(page, /class="state-panel"/);
  assert.match(page, /class="health-panel"/);
  assert.match(page, /class="life-panel"/);
  assert.match(page, /class="meal-panel"/);
  assert.match(page, /\{\{ todayLabel \}\}/);
  assert.match(page, /\{\{ aiSuggestion\.title \}\}/);
  assert.match(page, /\{\{ moodLabel \}\}/);
  assert.doesNotMatch(page, />9:41</);
  assert.doesNotMatch(page, /status-icons|battery-icon/);
  requiredAssets.forEach(asset => assert.equal(fs.existsSync(path.join(root, asset)), true, asset));
});

test('sleep time editing uses one inertial wheel with five-minute snapping', () => {
  const page = source('src/pages/snapshot/index.vue');

  assert.doesNotMatch(page, /<picker\s+mode="time"/);
  assert.match(page, /<picker-view[\s\S]*@change="onSleepPickerChange"/);
  assert.match(page, /<picker-view-column>[\s\S]*v-for="hour in sleepHourOptions"/);
  assert.match(page, /<picker-view-column>[\s\S]*v-for="minute in sleepMinuteOptions"/);
  assert.match(page, /data-testid="snapshot-bedtime-value"/);
  assert.match(page, /data-testid="snapshot-wake-time-value"/);
  assert.match(page, /sleepMinuteOptions:\s*\['00','05','10','15','20','25','30','35','40','45','50','55'\]/);
  assert.match(page, /openSleepSheet\('bedtime'\)/);
  assert.match(page, /openSleepSheet\('wakeTime'\)/);
  assert.match(page, /switchSleepField\(field\)/);
  assert.match(page, /syncSleepPicker\(field\)/);
  assert.match(page, /onSleepPickerChange\(event\)/);
  assert.doesNotMatch(page, /bedtimePresets|wakeTimePresets|sleep-adjust/);
  assert.match(page, /bedtime:\s*'',\s*\n\s*wakeTime:\s*''/);
  assert.match(page, /this\.data\.bedtime\s*=\s*payload\.snapshot\.bedtime\s*\|\|\s*''/);
  assert.match(page, /this\.data\.wakeTime\s*=\s*payload\.snapshot\.wake_time\s*\|\|\s*''/);
  assert.match(page, /\.sheet-mask\s*\{[^}]*z-index:\s*1000;/);
  assert.match(page, /\.sheet\s*\{[^}]*z-index:\s*1001;/);
});

test('sleep trend stays out of the time editor and supports selectable history ranges', () => {
  const index = source('src/pages/snapshot/index.vue');
  const trend = source('src/pages/snapshot/trend.vue');
  const route = source('server/src/routes/snapshot.js');
  const pages = JSON.parse(source('src/pages.json'));

  assert.match(index, /class="sleep-trend-entry"[^>]*@tap="goSleepTrend"/);
  assert.match(index, /goSleepTrend\(\)\s*\{\s*uni\.navigateTo\(\{\s*url:\s*'\/pages\/snapshot\/trend'/);
  assert.ok(pages.pages.some(item => item.path === 'pages/snapshot/trend'));
  assert.match(trend, /getSnapshotHistory/);
  assert.match(trend, /rangeOptions:\s*\[7,\s*30,\s*90\]/);
  assert.match(trend, /canvas-id="sleepTrendCanvas"/);
  assert.match(trend, /drawChart\(\)/);
  assert.match(trend, /selectRange\(days\)/);
  assert.match(trend, /selectPoint\(event\)/);
  assert.match(route, /to_char\(s\.day,\s*'YYYY-MM-DD'\)\s+AS day/);
  assert.match(route, /current_date\s*-\s*\(\$2::int\s*-\s*1\)/);
});

test('morning meditation uses real persisted stats and only records a naturally completed session', () => {
  const page = source('src/pages/snapshot/meditation.vue');
  const index = source('src/pages/snapshot/index.vue');
  const api = source('src/api/snapshot.js');
  const route = source('server/src/routes/snapshot.js');

  assert.match(api, /getMeditationSummary/);
  assert.match(route, /router\.get\('\/meditation\/summary'/);
  assert.match(page, /await getMeditationSummary\(/);
  assert.match(page, /streak:\s*0/);
  assert.match(page, /totalCount:\s*0/);
  assert.match(page, /totalMinutes:\s*0/);
  assert.doesNotMatch(page, /streak:\s*7|totalCount:\s*23|totalMinutes:\s*68/);
  assert.match(page, /finishMeditation\(\)/);
  assert.match(page, /cancelMeditation\(\)/);
  assert.match(page, /await completeMeditation\(/);
  assert.match(page, /isCompleting/);
  assert.match(index, /meditationSummary/);
  assert.match(index, /payload\.meditations/);
});

test('every daily snapshot child page hides the primary tab bar', () => {
  const app = source('src/App.vue');
  const childPages = ['history', 'trend', 'detail', 'finance', 'meal', 'meditation', 'health'];

  for (const name of childPages) {
    const page = source(`src/pages/snapshot/${name}.vue`);
    assert.match(page, /snapshot-subpage/, name);
    assert.match(page, /onShow\(\)\s*\{[\s\S]{0,180}uni\.hideTabBar/, name);
  }
  assert.match(app, /html:has\(\.snapshot-subpage\) uni-tabbar\.uni-tabbar-bottom/);
});

test('snapshot secondary experiences use persisted user data instead of demo handlers', () => {
  const migration = source('server/sql/060_snapshot_real_features.sql');
  const route = source('server/src/routes/snapshot.js');
  const api = source('src/api/snapshot.js');
  const index = source('src/pages/snapshot/index.vue');
  const history = source('src/pages/snapshot/history.vue');
  const detail = source('src/pages/snapshot/detail.vue');
  const finance = source('src/pages/snapshot/finance.vue');
  const meal = source('src/pages/snapshot/meal.vue');
  const health = source('src/pages/snapshot/health.vue');
  const pages = JSON.parse(source('src/pages.json'));

  assert.match(migration, /CREATE TABLE IF NOT EXISTS snapshot_finance_entries/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS snapshot_places/);
  assert.match(migration, /snapshot_meals[\s\S]*dining_way[\s\S]*media_ids/);
  assert.match(route, /router\.post\('\/finance'/);
  assert.match(route, /router\.delete\('\/finance\/:id'/);
  assert.match(route, /router\.put\('\/meals\/:id'/);
  assert.match(route, /ownedMediaIds/);
  assert.match(route, /router\.post\('\/places'/);
  assert.match(api, /getSnapshotFinance/);
  assert.match(api, /updateMeal/);
  assert.match(api, /addSnapshotPlace/);

  assert.match(history, /await getSnapshotHistory\(90\)/);
  assert.doesNotMatch(history, /8432|5231|3102|9月21日/);
  assert.match(detail, /await getTodaySnapshot\(this\.date\)/);
  assert.doesNotMatch(detail, /详情页（限当日编辑）/);
  assert.match(finance, /await addSnapshotFinance/);
  assert.match(finance, /await deleteSnapshotFinance/);
  assert.doesNotMatch(finance, /记一笔开发中|amount">0\.00/);
  assert.match(meal, /await this\.\$http\.upload\(uploadImage/);
  assert.match(meal, /await updateMeal/);
  assert.match(meal, /dining_way/);
  assert.match(health, /await getSnapshotHistory\(30\)/);
  assert.ok(pages.pages.some(item => item.path === 'pages/snapshot/health'));

  assert.match(index, /await this\.\$http\.post\(todoCreate/);
  assert.match(index, /uni\.chooseLocation/);
  assert.match(index, /await addSnapshotPlace/);
  assert.match(index, /goHealthProfile\(\)\s*\{\s*uni\.navigateTo/);
  assert.doesNotMatch(index, /健康档案页开发中|已加入今日计划|relocate\(\)\s*\{\s*uni\.showToast/);
});
