'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const config = require('./config');

const base64url = value => Buffer.from(value).toString('base64url');
const hmac = value => crypto.createHmac('sha256', config.tokenSecret).update(value).digest('base64url');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function isLegacyPasswordHash(encoded) {
  return /^\$2[aby]\$\d{2}\$/.test(String(encoded || ''));
}

function verifyPassword(password, encoded) {
  if (isLegacyPasswordHash(encoded)) {
    return bcrypt.compareSync(password, encoded);
  }
  const [salt, expected] = String(encoded || '').split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function createAccessToken(userId, expiresInSeconds = config.accessTokenSeconds) {
  const payload = base64url(JSON.stringify({
    sub: userId,
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    nonce: crypto.randomBytes(8).toString('hex')
  }));
  return `${payload}.${hmac(payload)}`;
}

function verifyAccessToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(hmac(payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (value.type !== 'access' || !value.sub || value.exp <= Math.floor(Date.now() / 1000)) return null;
    return value;
  } catch (error) {
    return null;
  }
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createMediaSignature(mediaId, expires) {
  return hmac(`media:${mediaId}:${expires}`);
}

function verifyMediaSignature(mediaId, expires, signature) {
  if (!mediaId || !expires || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(createMediaSignature(mediaId, expires));
  const actual = Buffer.from(String(signature || ''));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  createAccessToken,
  createMediaSignature,
  createRefreshToken,
  hashPassword,
  hashToken,
  isLegacyPasswordHash,
  verifyAccessToken,
  verifyMediaSignature,
  verifyPassword
};
