'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret-that-is-not-used-in-production';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const {
  createAdminToken,
  createAccessToken,
  createMediaSignature,
  hashPassword,
  hashToken,
  isLegacyPasswordHash,
  verifyAccessToken,
  verifyAdminToken,
  verifyMediaSignature,
  verifyPassword
} = require('../src/security');

test('password hashes verify without storing plaintext', () => {
  const encoded = hashPassword('correct horse battery staple');
  assert.equal(encoded.includes('correct horse battery staple'), false);
  assert.equal(verifyPassword('correct horse battery staple', encoded), true);
  assert.equal(verifyPassword('wrong password', encoded), false);
});

test('legacy bcrypt hashes verify and are marked for one-time upgrade', () => {
  const encoded = bcrypt.hashSync('legacy-password', 4);
  assert.equal(isLegacyPasswordHash(encoded), true);
  assert.equal(verifyPassword('legacy-password', encoded), true);
  assert.equal(verifyPassword('wrong password', encoded), false);
  assert.equal(isLegacyPasswordHash(hashPassword('legacy-password')), false);
});

test('access tokens reject tampering', () => {
  const token = createAccessToken('d04d85d3-4ef8-4b3f-9415-60c2e338d4f8');
  assert.equal(verifyAccessToken(token).sub, 'd04d85d3-4ef8-4b3f-9415-60c2e338d4f8');
  assert.equal(verifyAccessToken(`${token}tampered`), null);
});

test('admin tokens are short-purpose credentials bound to one administrator', () => {
  const userId = 'd04d85d3-4ef8-4b3f-9415-60c2e338d4f8';
  const token = createAdminToken(userId, 60);
  assert.equal(verifyAdminToken(token, userId).type, 'admin');
  assert.equal(verifyAdminToken(token, '718dd538-c101-4d50-84e8-d06146579fc7'), null);
  assert.equal(verifyAdminToken(`${token}tampered`, userId), null);
  assert.equal(verifyAdminToken(createAdminToken(userId, -1), userId), null);
});

test('refresh token hashing is deterministic and one-way shaped', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.match(hashToken('abc'), /^[a-f0-9]{64}$/);
  assert.notEqual(hashToken('abc'), 'abc');
});

test('media signatures expire and reject tampering', () => {
  const mediaId = '0f747224-da9e-453d-894c-72c8f6b7a284';
  const expires = Math.floor(Date.now() / 1000) + 60;
  const signature = createMediaSignature(mediaId, expires);
  assert.equal(verifyMediaSignature(mediaId, expires, signature), true);
  assert.equal(verifyMediaSignature(`${mediaId}x`, expires, signature), false);
  assert.equal(verifyMediaSignature(mediaId, 1, signature), false);
});
