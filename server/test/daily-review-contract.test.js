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

test('22:00 inbox delivery is independent from email and only queues users with evidence', () => {
  const migration = source('server/sql/039_daily_review_inbox.sql');
  const worker = source('server/src/daily-review-worker.js');
  const route = source('server/src/routes/daily-reviews.js');
  assert.match(migration, /inbox_enabled boolean NOT NULL DEFAULT true/);
  assert.match(migration, /'INBOX'/);
  assert.match(worker, /queueInboxReviews/);
  assert.match(worker, /p\.inbox_enabled/);
  assert.match(worker, /external_activity_events/);
  assert.match(worker, /if \(isMailConfigured\(\)\)/);
  assert.match(route, /\/inbox\/unread-count/);
  assert.match(route, /router\.get\('\/inbox'/);
});

test('daily review UI is user-opened and defaults to one judgment plus one action', () => {
  const app = source('server/src/app.js');
  const route = source('server/src/routes/daily-reviews.js');
  const page = source('src/pages/shroom/daily-review.vue');
  const me = source('src/pages/shroom/me.vue');
  const inbox = source('src/pages/shroom/inbox.vue');
  assert.match(app, /daily-reviews\/v1/);
  assert.ok(route.indexOf('router.use(requireUser)') < route.indexOf("router.get('/preferences'"));
  assert.match(route, /\/:date\/open/);
  assert.match(page, /今天最需要修正/);
  assert.match(page, /明天只做这一件/);
  assert.doesNotMatch(page, />DAILY REVIEW</);
  assert.doesNotMatch(page, />OWNERSHIP</);
  assert.doesNotMatch(page, />FACTS, LAST</);
  assert.doesNotMatch(page, /为什么重要/);
  assert.match(page, /!showEmailSettings/);
  assert.match(page, /总结设置/);
  assert.match(page, /按日期回看/);
  assert.match(page, /dailyReviewInbox/);
  assert.match(page, /archiveMode\(\) \{ return !this\.date; \}/);
  assert.match(page, /if \(this\.archiveMode\)/);
  assert.match(page, /打开这一天/);
  assert.match(me, /me-daily-review/);
  assert.match(me, /me-inbox/);
  assert.match(inbox, /22:00 投递到收件箱/);
  assert.match(inbox, /应用内红点/);
});

test('daily review generation and email put correction before the activity recap', () => {
  const generator = source('server/src/daily-review.js');
  const worker = source('server/src/daily-review-worker.js');
  assert.match(generator, /daily-review-v3-one-judgment-r1/);
  assert.match(generator, /不得断言用户亲手执行/);
  assert.match(generator, /criticalReview/);
  assert.match(generator, /只输出一个问题和一个行动/);
  assert.doesNotMatch(worker, /SHROOM DAILY REVIEW/);
  assert.doesNotMatch(worker, /今日事实（仅作依据）/);
});

test('private daily reviews are invalidated when diary or Codex AI access is withdrawn', () => {
  const diaryStore = source('server/src/memory-store.js');
  const dataSources = source('server/src/routes/data-sources.js');
  assert.match(diaryStore, /UPDATE daily_reviews/);
  assert.match(diaryStore, /type: 'DIARY'/);
  assert.match(dataSources, /invalidateDailyReviewsUsingCodex/);
  assert.match(dataSources, /req\.body\.aiAllowed === false/);
});
