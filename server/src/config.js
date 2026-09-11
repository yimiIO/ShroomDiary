'use strict';

const bundledFfmpegPath = require('ffmpeg-static');

const required = ['DATABASE_URL', 'TOKEN_SECRET'];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

module.exports = {
  port: Number(process.env.PORT || 3102),
  databaseUrl: process.env.DATABASE_URL,
  tokenSecret: process.env.TOKEN_SECRET,
  publicOrigin: process.env.PUBLIC_ORIGIN || 'https://shroom.surfplus.xyz',
  allowedOrigins: String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || '/www/wwwroot/shroom/shared/uploads',
  imageMaxPixels: Number(process.env.IMAGE_MAX_PIXELS || 40000000),
  imageMaxDimension: Number(process.env.IMAGE_MAX_DIMENSION || 1600),
  cosRequiredForImages: process.env.COS_REQUIRED_FOR_IMAGES === 'true',
  cos: {
    bucket: process.env.COS_BUCKET || 'shroom-1303825367',
    region: process.env.COS_REGION || 'ap-guangzhou',
    secretId: process.env.COS_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || ''
  },
  asrProvider: process.env.ASR_PROVIDER || '',
  asrApiBaseUrl: process.env.ASR_API_BASE_URL || '',
  asrApiKey: process.env.ASR_API_KEY || '',
  asrModel: process.env.ASR_MODEL || '',
  asrLanguage: process.env.ASR_LANGUAGE || 'zh',
  asrTimeoutMs: Number(process.env.ASR_TIMEOUT_MS || 120000),
  volcAsrEndpoint: process.env.VOLC_ASR_ENDPOINT || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash',
  volcAsrApiKey: process.env.VOLC_ASR_API_KEY || '',
  volcAsrAppKey: process.env.VOLC_ASR_APP_KEY || '',
  volcAsrAccessKey: process.env.VOLC_ASR_ACCESS_KEY || '',
  volcAsrResourceId: process.env.VOLC_ASR_RESOURCE_ID || 'volc.bigasr.auc_turbo',
  aiApiBaseUrl: process.env.AI_API_BASE_URL || '',
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || '',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 120000),
  aiUsdCnyRate: Number(process.env.AI_USD_CNY_RATE || 7.2),
  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'compatible',
  embeddingApiBaseUrl: process.env.EMBEDDING_API_BASE_URL || '',
  embeddingApiKey: process.env.EMBEDDING_API_KEY || '',
  embeddingModel: process.env.EMBEDDING_MODEL || '',
  embeddingDimension: Number(process.env.EMBEDDING_DIMENSION || 0),
  embeddingTimeoutMs: Number(process.env.EMBEDDING_TIMEOUT_MS || 60000),
  embeddingBatchSize: Math.max(1, Math.min(100, Number(process.env.EMBEDDING_BATCH_SIZE || 32))),
  memoryWorkerEnabled: process.env.MEMORY_WORKER_ENABLED !== 'false',
  memoryWorkerIntervalMs: Math.max(1000, Number(process.env.MEMORY_WORKER_INTERVAL_MS || 3000)),
  friendSyncWorkerEnabled: process.env.FRIEND_SYNC_WORKER_ENABLED !== 'false',
  friendSyncWorkerIntervalMs: Math.max(1000, Number(process.env.FRIEND_SYNC_WORKER_INTERVAL_MS || 3000)),
  compound: {
    ownerUserIds: String(process.env.COMPOUND_OWNER_USER_IDS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
    stats: {
      url: process.env.COMPOUND_STATS_URL || '',
      username: process.env.COMPOUND_STATS_USERNAME || '',
      password: process.env.COMPOUND_STATS_PASSWORD || '',
      timeoutMs: Number(process.env.COMPOUND_STATS_TIMEOUT_MS || 8000)
    }
  },
  ffmpegPath: process.env.FFMPEG_PATH || bundledFfmpegPath || 'ffmpeg',
  accessTokenSeconds: Number(process.env.ACCESS_TOKEN_SECONDS || 7200),
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS || 90),
  refreshReuseGraceSeconds: Math.max(0, Math.min(120, Number(process.env.REFRESH_REUSE_GRACE_SECONDS || 30)))
};
