'use strict';

const crypto = require('node:crypto');
const config = require('./config');
const { CHUNKER_VERSION, PREPROCESSING_VERSION, normalizeEmbeddingInput } = require('./memory-chunker');

function isEmbeddingConfigured() {
  return Boolean(
    config.embeddingApiBaseUrl && config.embeddingApiKey && config.embeddingModel &&
    Number.isInteger(config.embeddingDimension) && config.embeddingDimension > 0
  );
}

function embeddingEndpoint() {
  const base = config.embeddingApiBaseUrl.replace(/\/$/, '');
  return base.endsWith('/embeddings') ? base : base + '/embeddings';
}

function embeddingProfile() {
  if (!isEmbeddingConfigured()) return null;
  const identity = [
    config.embeddingProvider,
    config.embeddingModel,
    config.embeddingDimension,
    PREPROCESSING_VERSION,
    CHUNKER_VERSION
  ].join('|');
  return {
    id: 'emb-' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24),
    provider: config.embeddingProvider,
    model: config.embeddingModel,
    dimension: config.embeddingDimension,
    preprocessingVersion: PREPROCESSING_VERSION,
    chunkerVersion: CHUNKER_VERSION
  };
}

function validateVector(value) {
  if (!Array.isArray(value) || value.length !== config.embeddingDimension ||
      value.some(item => !Number.isFinite(Number(item)))) {
    throw Object.assign(new Error('向量服务返回了不匹配的维度'), { code: 'SHROOM_EMBEDDING_RESPONSE' });
  }
  return value.map(Number);
}

async function embedBatch(inputs) {
  if (!isEmbeddingConfigured()) {
    throw Object.assign(new Error('日记语义索引尚未配置'), { code: 'SHROOM_EMBEDDING_UNAVAILABLE' });
  }
  const normalized = inputs.map(normalizeEmbeddingInput);
  if (!normalized.length || normalized.some(item => !item)) {
    throw Object.assign(new Error('向量输入不能为空'), { code: 'SHROOM_EMBEDDING_INPUT' });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.embeddingTimeoutMs);
  try {
    const response = await fetch(embeddingEndpoint(), {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + config.embeddingApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model: config.embeddingModel, input: normalized, encoding_format: 'float' }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error('日记语义索引暂时不可用'), {
        code: 'SHROOM_EMBEDDING_FAILED',
        providerStatus: response.status,
        retryable: response.status === 429 || response.status >= 500
      });
    }
    const data = Array.isArray(payload.data) ? [...payload.data].sort((a, b) => a.index - b.index) : [];
    if (data.length !== normalized.length) {
      throw Object.assign(new Error('向量服务返回数量不匹配'), { code: 'SHROOM_EMBEDDING_RESPONSE' });
    }
    return data.map(item => validateVector(item.embedding));
  } catch (error) {
    if (error.code) throw error;
    throw Object.assign(new Error('日记语义索引暂时不可用'), {
      code: 'SHROOM_EMBEDDING_FAILED', cause: error, retryable: true
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function embedTexts(inputs) {
  const result = [];
  for (let index = 0; index < inputs.length; index += config.embeddingBatchSize) {
    result.push(...await embedBatch(inputs.slice(index, index + config.embeddingBatchSize)));
  }
  return result;
}

function toPgVector(value) {
  return '[' + value.map(item => Number(item).toString()).join(',') + ']';
}

module.exports = {
  embedBatch,
  embedTexts,
  embeddingProfile,
  isEmbeddingConfigured,
  toPgVector,
  validateVector
};
