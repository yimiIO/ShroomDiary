'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('daily review storage keeps view, provenance, consent and idempotent delivery separate', () => {
  const migration = source('server/sql/038_daily_reviews.sql');
  assert.match(migration, /UNIQUE \(user_id, review_date\)/);
  assert.match(migration, /email_verified_at IS NOT NULL/);
  assert.match(migration, /NOT email_enabled OR email_verified_at IS NOT NULL/);
  assert.match(migration, /source_fingerprint/);
  assert.match(migration, /viewed_at/);
  assert.match(migration, /email_status/);
});

test('22:00 delivery skips viewed reviews and rechecks email consent before sending', () => {
  const worker = source('server/src/daily-review-worker.js');
  assert.match(worker, /Asia\/Shanghai/);
  assert.match(worker, /viewed_at IS NULL/);
  assert.match(worker, /email_verified_at IS NOT NULL/);
  assert.match(worker, /recipient_allowed/);
  assert.match(worker, /FOR UPDATE OF r SKIP LOCKED/);
  assert.match(worker, /email_status = 'SENT'/);
});

test('daily review UI is user-opened and labels evidence boundaries', () => {
  const app = source('server/src/app.js');
  const route = source('server/src/routes/daily-reviews.js');
  const page = source('src/pages/shroom/daily-review.vue');
  const me = source('src/pages/shroom/me.vue');
  assert.match(app, /daily-reviews\/v1/);
  assert.ok(route.indexOf('router.use(requireUser)') < route.indexOf("router.get('/preferences'"));
  assert.match(route, /\/:date\/open/);
  assert.match(page, /人生 OS/);
  assert.match(page, /复利与一次性交付/);
  assert.match(page, /哪些不该继续自己做/);
  assert.match(page, /证据边界/);
  assert.match(me, /me-daily-review/);
});

test('private daily reviews are invalidated when diary or Codex AI access is withdrawn', () => {
  const diaryStore = source('server/src/memory-store.js');
  const dataSources = source('server/src/routes/data-sources.js');
  assert.match(diaryStore, /UPDATE daily_reviews/);
  assert.match(diaryStore, /type: 'DIARY'/);
  assert.match(dataSources, /invalidateDailyReviewsUsingCodex/);
  assert.match(dataSources, /req\.body\.aiAllowed === false/);
});
