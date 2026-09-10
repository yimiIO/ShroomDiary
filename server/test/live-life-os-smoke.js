'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3102';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const mobile = `137${String(Date.now()).slice(-8)}`;
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

async function run() {
  try {
    await api('/api/auth/v1/register', {
      method: 'POST', body: { mobile, password, nickname: 'Life OS Smoke' }
    });
    const session = await api('/api/auth/v1/login', {
      method: 'POST', body: { mobile, password }
    });
    const token = session.access_token;
    const manual = await api('/api/life-os/v1/review/manual', {
      method: 'POST', token, body: {}
    });
    assert.equal(manual.status, 'pending');
    assert.equal(manual.principles.length, 1);

    const published = await api(`/api/life-os/v1/review/${manual.id}/publish`, {
      method: 'POST', token, body: {
        principles: [{
          key: manual.principles[0].key,
          included: true,
          principle: '我用长期自主性判断短期机会。',
          boundary: '重要关系中的主动承诺不等同于失去自主。',
          reviewQuestion: '这次选择扩大还是缩小了未来的选择空间？'
        }]
      }
    });
    assert.equal(published.version, 1);
    assert.equal(published.clauses.length, 1);

    const workspace = await api('/api/life-os/v1/workspace', { token });
    assert.equal(workspace.config.version, 1);
    assert.equal(workspace.clauses.length, 1);
    assert.equal(workspace.pendingProposal, null);
    assert.equal(workspace.policy.maximumActiveCount, 50);

    const exported = await api('/api/export/v1/all', { token });
    assert.equal(exported.lifeOsClauses.length, 1);
    assert.equal(exported.lifeOsVersions.length, 1);
    assert.equal(exported.lifeOsReviewProposals[0].status, 'accepted');
    console.log(JSON.stringify({
      ok: true,
      version: workspace.config.version,
      clauses: workspace.clauses.length,
      maximumActiveCount: workspace.policy.maximumActiveCount
    }));
  } finally {
    await pool.query('DELETE FROM users WHERE mobile = $1', [mobile]);
    await pool.end();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
