'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const baseUrl = process.env.TEST_BASE_URL || 'https://shroom.surfplus.xyz';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const suffix = String(Date.now()).slice(-8);
const mobileA = `136${suffix}`;
const mobileB = `135${suffix}`;
const password = crypto.randomBytes(18).toString('base64url');

async function api(route, { method = 'GET', token, body, expectedStatus = 200 } = {}) {
  const headers = {};
  if (token) headers['x-api-key'] = token;
  if (body) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  assert.equal(response.status, 200, payload.message);
  assert.equal(payload.code, expectedStatus, payload.message);
  return payload.data;
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE mobile = ANY($1::varchar[])', [[mobileA, mobileB]]);
}

async function run() {
  await cleanup();
  try {
    await api('/api/auth/v1/register', { method: 'POST', body: { mobile: mobileA, password, nickname: 'Card flow A', acceptedTerms: true } });
    await api('/api/auth/v1/register', { method: 'POST', body: { mobile: mobileB, password, nickname: 'Card flow B', acceptedTerms: true } });
    const sessionA = await api('/api/auth/v1/login', { method: 'POST', body: { mobile: mobileA, password } });
    const sessionB = await api('/api/auth/v1/login', { method: 'POST', body: { mobile: mobileB, password } });
    const historical = await api('/api/cards/v1/create', {
      method: 'POST',
      token: sessionA.access_token,
      body: {
        seedSentence: '信息不足时，先验证事实再解释情绪',
        myUnderstanding: '不要让猜测抢在事实前面。',
        usageItems: ['当我准备下结论时，先确认一个可验证事实'],
        tags: ['判断'],
        visibility: 'PRIVATE'
      }
    });
    const diary = await api('/api/diaries/v1/create', {
      method: 'POST',
      token: sessionA.access_token,
      body: {
        content: '今天我在信息不足时停下了猜测，先确认事实，发现原来的情绪解释并不成立。',
        linkedCards: [],
        visibility: 'PRIVATE',
        date: '2026-09-08'
      }
    });
    if (process.env.RUN_LIVE_AI === '1') {
      const generated = await api('/api/ai/v1/analyze', {
        method: 'POST',
        token: sessionA.access_token,
        body: { diaryId: diary.id, sync: true }
      });
      assert.equal(generated.status, 'done');
      assert.equal(generated.engineVersion, 'lobster-2026-09-08-v2');
      assert.ok(generated.cardSuggestion);
      assert.equal(typeof generated.cardSuggestion.shouldCreate, 'boolean');
      assert.ok(Array.isArray(generated.cardSuggestion.existingMatches));
      await pool.query('DELETE FROM diary_analysis WHERE user_id = $1 AND diary_id = $2', [sessionA.member.id, diary.id]);
    }
    const taskId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO diary_analysis
        (id, user_id, diary_id, engine_version, five_views, todo_candidates, card_suggestion, friend_changes,
         status, started_at, finished_at)
       VALUES ($1, $2, $3, 'smoke-v2', '{}'::jsonb, '[]'::jsonb, $4::jsonb, '[]'::jsonb,
         'done', now(), now())`,
      [
        taskId,
        sessionA.member.id,
        diary.id,
        JSON.stringify({
          shouldCreate: true,
          reason: '形成了一条可重复使用的判断规则。',
          newCard: {
            seedSentence: '先找到事实，再决定如何解释',
            myUnderstanding: '这次经历让我看到猜测和事实之间的差异。',
            usageItems: ['当我因猜测产生情绪时，先写下一个可验证事实'],
            tags: ['判断', '情绪']
          },
          existingMatches: [{
            cardId: historical.id,
            seedSentence: historical.seedSentence,
            tags: historical.tags,
            reason: '历史菇卡已经覆盖事实核验原则。'
          }],
          createdCardId: null,
          boundCardIds: []
        })
      ]
    );

    await api(`/api/ai/v1/diary-flow/${taskId}/cards/bind`, {
      method: 'POST', token: sessionB.access_token, body: { cardIds: [historical.id] }, expectedStatus: 404
    });
    const bound = await api(`/api/ai/v1/diary-flow/${taskId}/cards/bind`, {
      method: 'POST', token: sessionA.access_token, body: { cardIds: [historical.id] }
    });
    assert.deepEqual(bound.cardIds, [historical.id]);
    assert.ok(bound.analysis.cardSuggestion.boundCardIds.includes(historical.id));

    const created = await api(`/api/ai/v1/diary-flow/${taskId}/cards/create`, {
      method: 'POST', token: sessionA.access_token, body: {}
    });
    const repeated = await api(`/api/ai/v1/diary-flow/${taskId}/cards/create`, {
      method: 'POST', token: sessionA.access_token, body: {}
    });
    assert.equal(repeated.cardId, created.cardId);
    const createdCard = await api(`/api/cards/v1/view?id=${created.cardId}`, { token: sessionA.access_token });
    assert.equal(createdCard.visibility, 'PRIVATE');
    assert.equal(createdCard.sourceDiaryId, diary.id);
    const diaryView = await api(`/api/diaries/v1/view?id=${diary.id}`, { token: sessionA.access_token });
    assert.deepEqual(new Set(diaryView.linkedCards), new Set([historical.id, created.cardId]));
    const sourceCount = await pool.query(
      'SELECT count(*)::int AS total FROM cards WHERE user_id = $1 AND source_diary_id = $2',
      [sessionA.member.id, diary.id]
    );
    assert.equal(sourceCount.rows[0].total, 1);
    const checks = ['analysis-owner-isolation', 'bind-historical-card', 'create-private-card', 'auto-link-diary', 'idempotent-create'];
    if (process.env.RUN_LIVE_AI === '1') checks.unshift('live-ai-card-decision');
    console.log(JSON.stringify({ ok: true, checks }));
  } finally {
    await cleanup();
    await pool.end();
  }
}

run().catch(async error => {
  console.error(error.stack || error.message);
  try { await cleanup(); } catch (_) {}
  try { await pool.end(); } catch (_) {}
  process.exitCode = 1;
});
