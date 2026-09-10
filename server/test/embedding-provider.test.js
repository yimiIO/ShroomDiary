'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';
process.env.EMBEDDING_API_BASE_URL = 'https://embedding.example.test/v1';
process.env.EMBEDDING_API_KEY = 'test-key';
process.env.EMBEDDING_MODEL = 'test-zh-model';
process.env.EMBEDDING_DIMENSION = '3';

const test = require('node:test');
const assert = require('node:assert/strict');
const { embedBatch, embeddingProfile, toPgVector } = require('../src/embedding-provider');

test('compatible embedding provider validates model, order and dimensions', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://embedding.example.test/v1/embeddings');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'test-zh-model');
    assert.deepEqual(body.input, ['第一条', '第二条']);
    return new Response(JSON.stringify({
      data: [
        { index: 1, embedding: [4, 5, 6] },
        { index: 0, embedding: [1, 2, 3] }
      ]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  assert.deepEqual(await embedBatch(['第一条', '第二条']), [[1, 2, 3], [4, 5, 6]]);
  assert.equal(toPgVector([1, 2, 3]), '[1,2,3]');
  assert.equal(embeddingProfile().dimension, 3);
});

test('dimension mismatch is rejected instead of mixing vector spaces', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => new Response(JSON.stringify({
    data: [{ index: 0, embedding: [1, 2] }]
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await assert.rejects(embedBatch(['文本']), error => error.code === 'SHROOM_EMBEDDING_RESPONSE');
});
