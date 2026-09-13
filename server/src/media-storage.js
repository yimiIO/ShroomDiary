'use strict';

const fs = require('node:fs');
const COS = require('cos-nodejs-sdk-v5');
const config = require('./config');

let cosClient;

function isCosConfigured() {
  return Boolean(
    config.cos.bucket
    && config.cos.region
    && config.cos.secretId
    && config.cos.secretKey
  );
}

function requireCos() {
  if (!isCosConfigured()) {
    throw Object.assign(new Error('Shroom 图片存储尚未完成安全配置'), { code: 'SHROOM_COS_CONFIG' });
  }
  if (!cosClient) {
    cosClient = new COS({
      SecretId: config.cos.secretId,
      SecretKey: config.cos.secretKey
    });
  }
  return cosClient;
}

function cosCall(method, parameters) {
  const client = requireCos();
  return new Promise((resolve, reject) => {
    client[method](parameters, (error, data) => {
      if (!error) return resolve(data);
      return reject(Object.assign(new Error('Shroom 私有媒体存储暂时不可用'), {
        code: 'SHROOM_COS_UNAVAILABLE',
        provider: 'tencent-cos',
        providerStatus: error.statusCode,
        providerMessage: error.error && error.error.Message,
        cause: error
      }));
    });
  });
}

function shanghaiYearMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}/${value.month}`;
}

function buildPrivateImageKey(userId, mediaId, now = new Date(), extension = 'webp') {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId)) || !/^[0-9a-f-]{36}$/i.test(String(mediaId))) {
    throw new Error('Invalid private media owner or id');
  }
  const safeExtension = ['jpg', 'png', 'webp', 'gif'].includes(extension) ? extension : 'webp';
  return `private/users/${userId}/diary/${shanghaiYearMonth(now)}/${mediaId}.${safeExtension}`;
}

async function uploadPrivateImage({ filePath, key, byteSize, mimeType = 'image/webp' }) {
  await cosCall('putObject', {
    Bucket: config.cos.bucket,
    Region: config.cos.region,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentLength: byteSize,
    Headers: {
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Type': mimeType,
      'Content-Disposition': 'inline'
    }
  });
  return key;
}

async function readPrivateObject(key) {
  const result = await cosCall('getObject', {
    Bucket: config.cos.bucket,
    Region: config.cos.region,
    Key: key
  });
  return Buffer.isBuffer(result.Body) ? result.Body : Buffer.from(result.Body || '');
}

function signPrivateObjectUrl(key, expires = 6 * 60 * 60) {
  if (!key) throw new Error('Private media key is required');
  const client = requireCos();
  return new Promise((resolve, reject) => {
    client.getObjectUrl({
      Bucket: config.cos.bucket,
      Region: config.cos.region,
      Key: key,
      Sign: true,
      Expires: Math.max(60, Number(expires) || 60)
    }, (error, data) => {
      if (!error && data && data.Url) return resolve(data.Url);
      return reject(Object.assign(new Error('Shroom 私有媒体链接暂时不可用'), {
        code: 'SHROOM_COS_SIGNING_UNAVAILABLE',
        cause: error
      }));
    });
  });
}

async function deletePrivateObject(key) {
  if (!isCosConfigured() || !key) return;
  await cosCall('deleteObject', {
    Bucket: config.cos.bucket,
    Region: config.cos.region,
    Key: key
  });
}

module.exports = {
  buildPrivateImageKey,
  deletePrivateObject,
  isCosConfigured,
  readPrivateObject,
  signPrivateObjectUrl,
  uploadPrivateImage
};
