'use strict';

const db = require('../src/db');
const { isEmbeddingConfigured } = require('../src/embedding-provider');
const { enqueueBackfill } = require('../src/memory-worker');

async function main() {
  if (!isEmbeddingConfigured()) throw new Error('Embedding provider is not configured');
  let total = 0;
  while (true) {
    const count = await db.transaction(client => enqueueBackfill(client, 500));
    total += count;
    if (count < 500) break;
  }
  console.log(JSON.stringify({ enqueued: total }));
}

main()
  .then(() => db.close())
  .catch(async error => {
    console.error(error.message);
    await db.close();
    process.exitCode = 1;
  });
