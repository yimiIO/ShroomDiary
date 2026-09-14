'use strict';

const crypto = require('node:crypto');
const config = require('./config');

const VERSION = 1;

function key() {
  const secret = String(config.financialDataEncryptionKey || '');
  if (secret.length < 24) {
    const error = new Error('财务数据加密密钥未配置');
    error.code = 'SHROOM_FINANCIAL_CONFIG';
    throw error;
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptFinancialPayload(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, body]);
}

function decryptFinancialPayload(value) {
  if (!value) return {};
  const source = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (source[0] !== VERSION || source.length < 30) throw new Error('Unsupported financial payload');
  const iv = source.subarray(1, 13);
  const tag = source.subarray(13, 29);
  const body = source.subarray(29);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'));
}

module.exports = { decryptFinancialPayload, encryptFinancialPayload };
