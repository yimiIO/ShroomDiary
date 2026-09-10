#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const endpoint = 'open.volcengineapi.com';
const region = 'cn-beijing';
const service = 'speech_saas_prod';
const version = '2025-05-20';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function mask(value) {
  const text = String(value || '');
  return text ? `${text.slice(0, 3)}…${text.slice(-4)}` : '';
}

function assertSingleLineSecret(value, label) {
  const text = String(value || '');
  if (!text || /[\r\n]/.test(text)) throw new Error(`Invalid ${label}`);
  return text;
}

function writeRootOnly(filePath, content) {
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

async function signedRequest(action, bodyValue, accessKeyId, secretAccessKey) {
  const xDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const shortDate = xDate.slice(0, 8);
  const body = JSON.stringify(bodyValue);
  const bodyHash = sha256(body);
  const contentType = 'application/json; charset=utf-8';
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${endpoint}`,
    `x-content-sha256:${bodyHash}`,
    `x-date:${xDate}`,
    ''
  ].join('\n');
  const query = `Action=${encodeURIComponent(action)}&Version=${version}`;
  const canonicalRequest = ['POST', '/', query, canonicalHeaders, signedHeaders, bodyHash].join('\n');
  const scope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ['HMAC-SHA256', xDate, scope, sha256(canonicalRequest)].join('\n');
  const dateKey = hmac(secretAccessKey, shortDate);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, 'request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  const authorization = `HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(`https://${endpoint}/?${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      Host: endpoint,
      'X-Content-Sha256': bodyHash,
      'X-Date': xDate,
      Authorization: authorization
    },
    body
  });
  return { response, payload: await response.json().catch(() => ({})) };
}

async function main() {
  const accessKeyId = process.env.VOLC_CLOUD_ACCESS_KEY_ID || process.env.VOLC_ASR_APP_KEY;
  const secretAccessKey = process.env.VOLC_CLOUD_SECRET_ACCESS_KEY || process.env.VOLC_ASR_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error('Missing Volcengine cloud AK/SK');

  const projectName = process.env.VOLC_SPEECH_PROJECT || 'default';
  const { response, payload } = await signedRequest('ListAPIKeys', {
    ProjectName: projectName,
    OnlyAvailable: true
  }, accessKeyId, secretAccessKey);
  const keys = (payload.Result && payload.Result.APIKeys) || payload.APIKeys || [];
  const outputPath = process.env.VOLC_SPEECH_KEY_OUTPUT;
  const available = keys.find(item => item && item.APIKey && !item.Disable);
  if (outputPath && available) {
    writeRootOnly(outputPath, `${assertSingleLineSecret(available.APIKey, 'speech API key')}\n`);
  }
  const cloudOutputPath = process.env.VOLC_CLOUD_ENV_OUTPUT;
  if (cloudOutputPath && available) {
    writeRootOnly(cloudOutputPath, [
      `VOLC_CLOUD_ACCESS_KEY_ID=${assertSingleLineSecret(accessKeyId, 'cloud access key ID')}`,
      `VOLC_CLOUD_SECRET_ACCESS_KEY=${assertSingleLineSecret(secretAccessKey, 'cloud secret access key')}`,
      ''
    ].join('\n'));
  }
  const shroomEnvPath = process.env.VOLC_SHROOM_ENV_PATH;
  if (shroomEnvPath && available) {
    const original = fs.readFileSync(shroomEnvPath, 'utf8');
    const lines = original.split(/\r?\n/).filter(line => !/^VOLC_ASR_(?:API_KEY|APP_KEY|ACCESS_KEY)=/.test(line));
    while (lines.at(-1) === '') lines.pop();
    lines.push(`VOLC_ASR_API_KEY=${assertSingleLineSecret(available.APIKey, 'speech API key')}`, '');
    writeRootOnly(shroomEnvPath, lines.join('\n'));
  }
  console.log(JSON.stringify({
    http: response.status,
    requestId: payload.ResponseMetadata && payload.ResponseMetadata.RequestId,
    error: payload.ResponseMetadata && payload.ResponseMetadata.Error && {
      code: payload.ResponseMetadata.Error.Code,
      message: payload.ResponseMetadata.Error.Message
    },
    count: keys.length,
    keys: keys.map(item => ({ id: item.ID, name: item.Name, disabled: item.Disable, key: mask(item.APIKey) })),
    saved: Boolean(available && (outputPath || cloudOutputPath || shroomEnvPath))
  }));
  const activateResource = process.env.VOLC_SPEECH_ACTIVATE_RESOURCE;
  if (activateResource) {
    const activation = await signedRequest('ActivateService', {
      ProjectName: projectName,
      ResourceID: activateResource
    }, accessKeyId, secretAccessKey);
    console.log(JSON.stringify({
      action: 'ActivateService',
      http: activation.response.status,
      resourceId: activateResource,
      requestId: activation.payload.ResponseMetadata && activation.payload.ResponseMetadata.RequestId,
      error: activation.payload.ResponseMetadata && activation.payload.ResponseMetadata.Error
    }));
    if (!activation.response.ok || (activation.payload.ResponseMetadata && activation.payload.ResponseMetadata.Error)) {
      process.exitCode = 3;
    }
  }
  if (!response.ok || !available) process.exitCode = 2;
}

main().catch(error => {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
});
