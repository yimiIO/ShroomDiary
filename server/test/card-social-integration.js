'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const baseUrl = process.env.TEST_BASE_URL || 'https://shroom.surfplus.xyz';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const suffix = String(Date.now()).slice(-8);
const mobiles = [`137${suffix}`, `136${suffix}`];
const password = crypto.randomBytes(18).toString('base64url');

async function api(route, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers['x-api-key'] = token;
  if (body) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.code, 200, payload.message);
  return payload.data;
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE mobile = ANY($1::varchar[])', [mobiles]);
}

async function run() {
  await cleanup();
  try {
    for (const [index, mobile] of mobiles.entries()) {
      await api('/api/auth/v1/register', {
        method: 'POST',
        body: { mobile, password, nickname: `Card Social ${index + 1}`, acceptedTerms: true }
      });
    }
    const authorSession = await api('/api/auth/v1/login', {
      method: 'POST', body: { mobile: mobiles[0], password }
    });
    const viewerSession = await api('/api/auth/v1/login', {
      method: 'POST', body: { mobile: mobiles[1], password }
    });
    const authorToken = authorSession.access_token;
    const viewerToken = viewerSession.access_token;

    const source = await api('/api/cards/v1/create', {
      method: 'POST',
      token: authorToken,
      body: {
        seedSentence: '先看见正在发生的事，再决定怎样回应。',
        myUnderstanding: '理解不是结论，而是下一次相似时刻可以带着的视角。',
        usageItems: ['停一下，分别写下事实、解释和感受。'],
        tags: ['关系'],
        visibility: 'PUBLIC_NAMED'
      }
    });
    await api(`/api/cards/v1/practices?id=${source.id}`, {
      method: 'POST',
      token: authorToken,
      body: { context: '作者的私人情境', action: '作者的私人练习' }
    });

    const anonymousView = await api(`/api/cards/v1/view?id=${source.id}`);
    assert.equal(anonymousView.isOwner, false);
    assert.equal(anonymousView.practiceCases.length, 0);
    assert.equal(anonymousView.stats.practiceCount, 0);
    assert.equal(Object.hasOwn(anonymousView, 'sourceDiaryId'), false);
    assert.deepEqual(anonymousView.viewerState, {
      resonated: false,
      favorited: false,
      copiedCardId: null
    });
    const discover = await api('/api/cards/v1/discover?page=1&pageSize=100');
    assert.ok(discover.list.some(card => card.id === source.id));

    await api('/api/cards/v1/resonate', { method: 'POST', token: viewerToken, body: { id: source.id } });
    await api('/api/cards/v1/favorite', { method: 'POST', token: viewerToken, body: { id: source.id } });
    const favorites = await api('/api/cards/v1/favorites?page=1&pageSize=20', { token: viewerToken });
    assert.ok(favorites.list.some(card => card.id === source.id));
    const copy = await api('/api/cards/v1/copy', { method: 'POST', token: viewerToken, body: { id: source.id } });
    assert.equal(copy.isOwner, true);
    assert.equal(copy.visibility, 'PRIVATE');
    assert.equal(copy.copiedFromId, source.id);
    const repeatedCopy = await api('/api/cards/v1/copy', { method: 'POST', token: viewerToken, body: { id: source.id } });
    assert.equal(repeatedCopy.id, copy.id);

    await api(`/api/cards/v1/practices?id=${copy.id}`, {
      method: 'POST',
      token: viewerToken,
      body: { context: '访客自己的情境', action: '访客自己的练习' }
    });
    const viewerSource = await api(`/api/cards/v1/view?id=${source.id}`, { token: viewerToken });
    assert.deepEqual(viewerSource.viewerState, {
      resonated: true,
      favorited: true,
      copiedCardId: copy.id
    });
    assert.equal(viewerSource.practiceCases.length, 0);
    const privateCopy = await api(`/api/cards/v1/view?id=${copy.id}`, { token: viewerToken });
    assert.equal(privateCopy.practiceCases.length, 1);
    assert.equal(privateCopy.practiceCases[0].context, '访客自己的情境');

    await api('/api/cards/v1/unresonate', { method: 'POST', token: viewerToken, body: { id: source.id } });
    await api('/api/cards/v1/unfavorite', { method: 'POST', token: viewerToken, body: { id: source.id } });
    const cleared = await api(`/api/cards/v1/view?id=${source.id}`, { token: viewerToken });
    assert.equal(cleared.viewerState.resonated, false);
    assert.equal(cleared.viewerState.favorited, false);
    const clearedFavorites = await api('/api/cards/v1/favorites?page=1&pageSize=20', { token: viewerToken });
    assert.equal(clearedFavorites.list.some(card => card.id === source.id), false);

    console.log(JSON.stringify({
      ok: true,
      checks: [
        'public-detail-privacy',
        'discover-open-data',
        'resonance-toggle',
        'favorite-toggle',
        'favorite-library',
        'idempotent-private-copy',
        'private-copy-practice-isolation'
      ]
    }));
  } finally {
    await cleanup();
    await pool.end();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
