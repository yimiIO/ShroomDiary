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
  const pages = JSON.parse(source('src/pages.json'));
  assert.match(api, /date \? \{ params: \{ date \} \} : \{\}/);
  assert.match(meal, /await addMeal\(/);
  assert.match(meditation, /await completeMeditation\(/);
  assert.equal(pages.tabBar.list.length, 5);
  assert.ok(pages.tabBar.list.some(item => item.pagePath === 'pages/snapshot/index'));
});
