'use strict';

const app = require('./app');
const config = require('./config');
const db = require('./db');
const { startMemoryWorker, stopMemoryWorker } = require('./memory-worker');
const { startReflectionWorker, stopReflectionWorker } = require('./reflection-worker');
const { startFriendSyncWorker, stopFriendSyncWorker } = require('./friend-sync');
const { startDailyReviewWorker, stopDailyReviewWorker } = require('./daily-review-worker');

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`shroom-api listening on 127.0.0.1:${config.port}`);
  startMemoryWorker();
  startReflectionWorker();
  startFriendSyncWorker();
  startDailyReviewWorker();
});

async function shutdown(signal) {
  console.log(`received ${signal}, shutting down`);
  stopMemoryWorker();
  stopReflectionWorker();
  stopFriendSyncWorker();
  stopDailyReviewWorker();
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
