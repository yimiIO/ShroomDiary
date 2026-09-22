'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret-that-is-not-used-in-production';

const assert = require('node:assert/strict');
const test = require('node:test');
const { featureAccessForUser } = require('../src/feature-access');

function clientWith(row) {
  return { query: async () => ({ rows: row ? [row] : [] }) };
}

test('paused rollout overrides an individual allow grant', async () => {
  const result = await featureAccessForUser('user', 'compound', 'H5', clientWith({
    feature_key: 'compound', status: 'PAUSED', platforms: ['H5'],
    maintenance_message: '维护中', grant_access: 'ALLOW'
  }));
  assert.deepEqual(result, {
    allowed: false, reason: 'FEATURE_PAUSED', featureKey: 'compound', message: '维护中'
  });
});

test('rollout platform scope is enforced for official clients', async () => {
  const result = await featureAccessForUser('user', 'compound', 'MP_WEIXIN', clientWith({
    feature_key: 'compound', status: 'ACTIVE', platforms: ['H5'], grant_access: null
  }));
  assert.deepEqual(result, {
    allowed: false, reason: 'FEATURE_PLATFORM_DISABLED', featureKey: 'compound', platform: 'MP_WEIXIN'
  });
});

test('a current allow grant admits one user to beta without changing billing data', async () => {
  const result = await featureAccessForUser('user', 'inquiries', 'H5', clientWith({
    feature_key: 'inquiries', status: 'BETA', platforms: ['H5'], grant_access: 'ALLOW'
  }));
  assert.deepEqual(result, { allowed: true, reason: 'ADMIN_GRANT', featureKey: 'inquiries' });
});

test('beta blocks users without an explicit grant', async () => {
  const result = await featureAccessForUser('user', 'wellbeing', 'H5', clientWith({
    feature_key: 'wellbeing', status: 'BETA', platforms: ['H5'], grant_access: null
  }));
  assert.deepEqual(result, { allowed: false, reason: 'FEATURE_BETA', featureKey: 'wellbeing' });
});
