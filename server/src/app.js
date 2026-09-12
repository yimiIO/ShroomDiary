'use strict';

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const db = require('./db');
const { asyncRoute, fail, ok } = require('./http');
const authRoutes = require('./routes/auth');
const diaryRoutes = require('./routes/diaries');
const todoRoutes = require('./routes/todos');
const cardRoutes = require('./routes/cards');
const mediaRoutes = require('./routes/media');
const friendRoutes = require('./routes/friends');
const lifeOsRoutes = require('./routes/life-os');
const lifeOsPlanRoutes = require('./routes/life-os-plan');
const reminderRoutes = require('./routes/reminders');
const exportRoutes = require('./routes/export');
const aiRoutes = require('./routes/ai');
const memoryRoutes = require('./routes/memory');
const compoundRoutes = require('./routes/compound');
const compoundProgressRoutes = require('./routes/compound-progress');
const inquiryRoutes = require('./routes/inquiries');
const wellbeingRoutes = require('./routes/wellbeing');
const { isAiConfigured } = require('./ai-engine');
const { embeddingProfile, isEmbeddingConfigured } = require('./embedding-provider');
const { isTranscriptionConfigured } = require('./transcription');
const { isCosConfigured } = require('./media-storage');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const allowedOrigins = new Set([
  config.publicOrigin,
  ...config.allowedOrigins,
  'http://localhost:8080',
  'http://127.0.0.1:8080'
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  },
  allowedHeaders: ['Content-Type', 'x-api-key', 'x-rfdiary-token'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 86400
}));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()'
  });
  next();
});

const authAttempts = new Map();
app.use('/api/auth', (req, res, next) => {
  const now = Date.now();
  const key = req.ip;
  const recent = (authAttempts.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
  if (recent.length >= 60) return fail(res, 429, '尝试次数过多，请稍后再试');
  recent.push(now);
  authAttempts.set(key, recent);
  if (authAttempts.size > 1000) {
    for (const [address, attempts] of authAttempts) {
      if (!attempts.some(time => now - time < 15 * 60 * 1000)) authAttempts.delete(address);
    }
  }
  next();
});

app.get('/api/health', asyncRoute(async (req, res) => {
  const database = await db.healthcheck();
  return ok(res, {
    service: 'shroom-api',
    database,
    transcription: {
      enabled: isTranscriptionConfigured(),
      provider: isTranscriptionConfigured() ? config.asrProvider || 'compatible' : null
    },
    analysis: {
      enabled: isAiConfigured(),
      model: isAiConfigured() ? config.aiModel : null
    },
    memory: {
      enabled: isAiConfigured(),
      semanticIndexEnabled: isEmbeddingConfigured(),
      embeddingModel: embeddingProfile()?.model || null
    },
    media: {
      imageStorage: isCosConfigured() ? 'private-cos' : 'local',
      imageStorageRequired: config.cosRequiredForImages,
      imageSizeGrowthAllowed: false,
      maxDimension: config.imageMaxDimension,
      adaptiveWebp: true
    }
  });
}));
app.use('/api/auth/v1', authRoutes);
app.use('/api/diaries/v1', diaryRoutes);
app.use('/api/todos/v1', todoRoutes);
app.use('/api/cards/v1', cardRoutes);
app.use('/api/media/v1', mediaRoutes);
app.use('/api/friends/v1', friendRoutes);
app.use('/api/life-os/v1/plan', lifeOsPlanRoutes);
app.use('/api/life-os/v1', lifeOsRoutes);
app.use('/api/reminders/v1', reminderRoutes);
app.use('/api/export/v1', exportRoutes);
app.use('/api/ai/v1', aiRoutes);
app.use('/api/memory/v1', memoryRoutes);
app.use('/api/compound/v1', compoundRoutes);
app.use('/api/compound/v2', compoundProgressRoutes);
app.use('/api/inquiries/v1', inquiryRoutes);
app.use('/api/wellbeing/v1', wellbeingRoutes);

const publicDir = process.env.STATIC_DIR || path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, { index: 'index.html', maxAge: '1h' }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return fail(res, 404, '接口不存在');
  if (req.method !== 'GET') return next();
  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('request failed', {
    path: req.path,
    name: error.name,
    code: error.code,
    provider: error.provider,
    providerStatus: error.providerStatus,
    providerMessage: error.providerMessage,
    providerLogId: error.providerLogId
  });
  if (error.code === '23505') return fail(res, 400, '记录已经存在');
  if (error.code === '22P02') return fail(res, 400, '参数格式不正确');
  if (error.code === 'SHROOM_MEDIA_OWNER') return fail(res, 400, '媒体文件不属于当前账号');
  if (error.code === 'SHROOM_CARD_OWNER') return fail(res, 400, '关联菇卡不属于当前账号');
  if (error.code === 'SHROOM_MEDIA_TYPE') return fail(res, 400, '文件格式不受支持');
  if (error.code === 'SHROOM_IMAGE_INVALID') return fail(res, 400, error.message);
  if (['SHROOM_FRIEND_INPUT', 'SHROOM_FRIEND_RULE', 'SHROOM_FRIEND_SCORE'].includes(error.code)) {
    return fail(res, 400, error.message);
  }
  if (error.code === 'LIMIT_FILE_SIZE') return fail(res, 400, '图片和语音不能超过 10MB');
  if (error.code === 'SHROOM_ASR_UNAVAILABLE') return fail(res, 503, error.message);
  if (['SHROOM_ASR_TIMEOUT', 'SHROOM_ASR_FAILED', 'SHROOM_ASR_CONFIG', 'SHROOM_ASR_EMPTY'].includes(error.code)) {
    return fail(res, 503, error.message);
  }
  if (error.code === 'SHROOM_AI_UNAVAILABLE') return fail(res, 503, error.message);
  if (['SHROOM_COS_CONFIG', 'SHROOM_COS_UNAVAILABLE'].includes(error.code)) return fail(res, 503, error.message);
  if (error.code === 'SHROOM_API_SCOPE') return fail(res, 403, error.message);
  if (['SHROOM_AI_FAILED', 'SHROOM_AI_INPUT'].includes(error.code)) return fail(res, 503, error.message);
  if (error.code === 'SHROOM_REFLECTION_INPUT') return fail(res, 400, error.message);
  if (String(error.code || '').startsWith('SHROOM_EMBEDDING_')) return fail(res, 503, error.message);
  if (error.message === 'Origin not allowed') return fail(res, 400, '请求来源不被允许');
  return fail(res, 500, '服务暂时不可用，请稍后重试');
});

module.exports = app;
