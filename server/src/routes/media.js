'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const db = require('../db');
const { optimizeImageForStorage } = require('../image-processor');
const {
  buildPrivateImageKey,
  buildPrivateVoiceKey,
  deletePrivateObject,
  isCosConfigured,
  readPrivateObject,
  signPrivateUploadUrl,
  statPrivateObject,
  uploadPrivateImage
} = require('../media-storage');
const { createMediaSignature, verifyMediaSignature } = require('../security');
const { asyncRoute, fail, ok, requireUser } = require('../http');
const { transcribeVoice } = require('../transcription');
const { VoiceUploadSessionStore, parseContentRange } = require('../voice-upload-session-store');

fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o750 });

const imageExtensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const voiceExtensions = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/aac': '.aac',
  'audio/flac': '.flac'
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const extensions = { ...imageExtensions, ...voiceExtensions };

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename(req, file, callback) {
    callback(null, `${crypto.randomUUID()}${extensions[file.mimetype] || ''}`);
  }
});

function uploadFor(allowedExtensions, fileSize) {
  return multer({
    storage,
    limits: { fileSize, files: 1 },
    fileFilter(req, file, callback) {
      if (allowedExtensions[file.mimetype]) return callback(null, true);
      return callback(Object.assign(new Error('Unsupported media type'), { code: 'SHROOM_MEDIA_TYPE' }));
    }
  });
}

const imageUpload = uploadFor(imageExtensions, 10 * 1024 * 1024);
const voiceUpload = uploadFor(voiceExtensions, 20 * 1024 * 1024);
const voiceChunkBody = express.raw({ type: 'application/octet-stream', limit: '300kb' });
const voiceUploadSessions = new VoiceUploadSessionStore({
  rootDir: path.resolve(config.uploadDir, '.voice-upload-sessions'),
  maxBytes: 20 * 1024 * 1024
});

const router = express.Router();

function signedUrl(mediaId) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const signature = createMediaSignature(mediaId, expires);
  return `${config.publicOrigin}/api/media/v1/${mediaId}?expires=${expires}&signature=${signature}`;
}

router.get('/:id', asyncRoute(async (req, res) => {
  if (!verifyMediaSignature(req.params.id, req.query.expires, req.query.signature)) {
    return fail(res, 401, '媒体访问链接已失效');
  }
  const result = await db.query(
    `SELECT storage_name, storage_provider, original_name, mime_type, byte_size
       FROM media_assets WHERE id = $1`,
    [req.params.id]
  );
  const media = result.rows[0];
  if (!media) return fail(res, 404, '媒体不存在');
  res.set({
    'Content-Type': media.mime_type,
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, max-age=1800',
    'X-Robots-Tag': 'noindex, nofollow'
  });
  if (media.storage_provider === 'cos') {
    const body = await readPrivateObject(media.storage_name);
    res.set('Content-Length', String(body.length));
    return res.send(body);
  }
  return res.sendFile(path.resolve(config.uploadDir, media.storage_name));
}));

router.use(requireUser);

async function persistLocalUpload(req, res) {
  if (!req.file) return fail(res, 400, '请选择支持的图片或音频文件');
  const id = crypto.randomUUID();
  try {
    await db.query(
      `INSERT INTO media_assets
        (id, user_id, storage_name, storage_provider, original_name, mime_type, byte_size, source_byte_size)
       VALUES ($1, $2, $3, 'local', $4, $5, $6, $6)`,
      [id, req.user.id, req.file.filename, path.basename(req.file.originalname), req.file.mimetype, req.file.size]
    );
  } catch (error) {
    fs.rmSync(req.file.path, { force: true });
    throw error;
  }
  return ok(res, { id, url: signedUrl(id) }, '上传成功');
}

async function persistImageUpload(req, res) {
  if (!req.file) return fail(res, 400, '请选择支持的图片文件');
  const id = crypto.randomUUID();
  const originalPath = req.file.path;
  const optimizedPath = path.resolve(config.uploadDir, `.${id}.processed`);
  let storageProvider = 'local';
  let storageName = '';
  let localStoredPath = null;
  let cosObjectKey = null;

  try {
    const optimized = await optimizeImageForStorage({
      inputPath: originalPath,
      outputPath: optimizedPath,
      maxPixels: config.imageMaxPixels,
      maxDimension: config.imageMaxDimension,
      maxOutputBytes: req.file.size
    });

    if (isCosConfigured()) {
      storageProvider = 'cos';
      cosObjectKey = buildPrivateImageKey(req.user.id, id, new Date(), optimized.extension);
      storageName = cosObjectKey;
      await uploadPrivateImage({
        filePath: optimizedPath,
        key: cosObjectKey,
        byteSize: optimized.byteSize,
        mimeType: optimized.mimeType
      });
    } else if (config.cosRequiredForImages) {
      throw Object.assign(new Error('Shroom 图片存储尚未完成安全配置'), { code: 'SHROOM_COS_CONFIG' });
    } else {
      localStoredPath = path.resolve(config.uploadDir, `${id}.${optimized.extension}`);
      fs.renameSync(optimizedPath, localStoredPath);
      storageName = path.basename(localStoredPath);
    }

    await db.query(
      `INSERT INTO media_assets
        (id, user_id, storage_name, storage_provider, original_name, mime_type, byte_size,
         source_byte_size, width, height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id, req.user.id, storageName, storageProvider, path.basename(req.file.originalname),
        optimized.mimeType, optimized.byteSize, req.file.size, optimized.width, optimized.height
      ]
    );
    return ok(res, {
      id,
      url: signedUrl(id),
      mimeType: optimized.mimeType,
      byteSize: optimized.byteSize,
      sourceByteSize: req.file.size,
      savedBytes: optimized.savedBytes,
      compression: optimized.strategy,
      width: optimized.width,
      height: optimized.height
    }, '上传成功');
  } catch (error) {
    if (cosObjectKey) {
      try {
        await deletePrivateObject(cosObjectKey);
      } catch (cleanupError) {
        console.error('failed to clean COS object after image upload error', {
          code: cleanupError.code,
          providerStatus: cleanupError.providerStatus
        });
      }
    }
    if (localStoredPath) fs.rmSync(localStoredPath, { force: true });
    throw error;
  } finally {
    fs.rmSync(originalPath, { force: true });
    fs.rmSync(optimizedPath, { force: true });
  }
}

router.post('/image/upload', imageUpload.single('file'), asyncRoute(persistImageUpload));
router.post('/voice/upload', voiceUpload.single('file'), asyncRoute(persistLocalUpload));

function directVoiceMetadata(body) {
  const byteSize = Number(body.byteSize);
  const mimeType = String(body.mimeType || '').split(';')[0].toLowerCase();
  const extension = voiceExtensions[mimeType];
  if (!extension) throw Object.assign(new Error('录音格式不受支持'), { code: 'SHROOM_MEDIA_TYPE' });
  if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 20 * 1024 * 1024) {
    throw Object.assign(new Error('录音文件不能超过20MB'), { code: 'SHROOM_VOICE_UPLOAD_SIZE' });
  }
  return {
    byteSize,
    mimeType,
    extension: extension.slice(1),
    originalName: path.basename(String(body.fileName || `voice${extension}`))
  };
}

router.post('/voice/direct-uploads', asyncRoute(async (req, res) => {
  if (!isCosConfigured()) {
    throw Object.assign(new Error('Shroom 私有媒体存储尚未完成安全配置'), { code: 'SHROOM_COS_CONFIG' });
  }
  const metadata = directVoiceMetadata(req.body || {});
  let uploadId = String(req.body.uploadId || '');
  if (uploadId && !UUID.test(uploadId)) return fail(res, 400, '续传任务无效');
  if (!uploadId) uploadId = crypto.randomUUID();

  const existing = await db.query('SELECT id, user_id FROM media_assets WHERE id = $1', [uploadId]);
  if (existing.rows[0]) {
    if (existing.rows[0].user_id !== req.user.id) uploadId = crypto.randomUUID();
    else return ok(res, {
      uploadId,
      completed: true,
      media: { id: uploadId, url: signedUrl(uploadId) }
    }, '上传已完成');
  }

  const storageName = buildPrivateVoiceKey(req.user.id, uploadId, new Date(), metadata.extension);
  const uploadUrl = await signPrivateUploadUrl(storageName, metadata.mimeType);
  return ok(res, {
    uploadId,
    uploadUrl,
    completed: false,
    headers: { 'Content-Type': metadata.mimeType }
  }, '私有直传任务已准备');
}));

router.post('/voice/direct-uploads/:id/complete', asyncRoute(async (req, res) => {
  const uploadId = String(req.params.id || '');
  if (!UUID.test(uploadId)) return fail(res, 400, '上传任务无效');
  const metadata = directVoiceMetadata(req.body || {});
  const existing = await db.query('SELECT id, user_id FROM media_assets WHERE id = $1', [uploadId]);
  if (existing.rows[0]) {
    if (existing.rows[0].user_id !== req.user.id) return fail(res, 404, '上传任务不存在');
    return ok(res, { id: uploadId, url: signedUrl(uploadId) }, '上传成功');
  }

  const storageName = buildPrivateVoiceKey(req.user.id, uploadId, new Date(), metadata.extension);
  const stored = await statPrivateObject(storageName);
  if (stored.byteSize !== metadata.byteSize) return fail(res, 409, '录音尚未完整上传');
  if (stored.mimeType && stored.mimeType !== metadata.mimeType) return fail(res, 409, '录音格式校验失败');

  await db.query(
    `INSERT INTO media_assets
      (id, user_id, storage_name, storage_provider, original_name, mime_type, byte_size, source_byte_size)
     VALUES ($1, $2, $3, 'cos', $4, $5, $6, $6)`,
    [uploadId, req.user.id, storageName, metadata.originalName, metadata.mimeType, metadata.byteSize]
  );
  return ok(res, { id: uploadId, url: signedUrl(uploadId) }, '上传成功');
}));

function voiceSessionData(session) {
  return {
    uploadId: session.uploadId,
    receivedBytes: session.receivedBytes,
    completed: Boolean(session.mediaId),
    media: session.mediaId ? { id: session.mediaId, url: signedUrl(session.mediaId) } : null
  };
}

router.post('/voice/uploads', asyncRoute(async (req, res) => {
  const byteSize = Number(req.body.byteSize);
  const mimeType = String(req.body.mimeType || '').split(';')[0].toLowerCase();
  const originalName = path.basename(String(req.body.fileName || 'voice.webm'));
  if (!voiceExtensions[mimeType]) return fail(res, 400, '录音格式不受支持');

  let session = null;
  if (req.body.uploadId) {
    try {
      session = await voiceUploadSessions.load(String(req.body.uploadId), req.user.id);
    } catch (error) {
      if (error.code !== 'SHROOM_VOICE_UPLOAD_NOT_FOUND') throw error;
    }
    if (session && (session.byteSize !== byteSize || session.mimeType !== mimeType)) {
      return fail(res, 409, '本机录音与续传任务不一致，请重新建立上传任务');
    }
  }
  if (!session) {
    session = await voiceUploadSessions.create({
      userId: req.user.id,
      mimeType,
      originalName,
      byteSize
    });
  }
  return ok(res, voiceSessionData(session), '续传任务已准备');
}));

router.put('/voice/uploads/:id/:start', voiceChunkBody, asyncRoute(async (req, res) => {
  const range = parseContentRange(req.get('content-range'));
  const start = Number(req.params.start);
  if (!range || range.start !== start || !Buffer.isBuffer(req.body) || req.body.length !== range.end - range.start + 1) {
    return fail(res, 400, '录音分片范围无效');
  }
  const session = await voiceUploadSessions.append({
    uploadId: req.params.id,
    userId: req.user.id,
    start,
    total: range.total,
    bytes: req.body
  });
  return ok(res, { uploadId: session.uploadId, receivedBytes: session.receivedBytes }, '录音分片已保存');
}));

router.post('/voice/uploads/:id/complete', asyncRoute(async (req, res) => {
  const session = await voiceUploadSessions.load(req.params.id, req.user.id);
  if (session.mediaId) return ok(res, { id: session.mediaId, url: signedUrl(session.mediaId) }, '上传成功');
  if (session.receivedBytes !== session.byteSize) return fail(res, 409, '录音尚未上传完整');

  const id = crypto.randomUUID();
  const finalName = `${id}${voiceExtensions[session.mimeType]}`;
  const partPath = voiceUploadSessions.partPath(session.uploadId);
  const finalPath = path.resolve(config.uploadDir, finalName);
  fs.renameSync(partPath, finalPath);
  try {
    await db.transaction(async client => {
      await client.query(
        `INSERT INTO media_assets
          (id, user_id, storage_name, storage_provider, original_name, mime_type, byte_size, source_byte_size)
         VALUES ($1, $2, $3, 'local', $4, $5, $6, $6)`,
        [id, req.user.id, finalName, session.originalName, session.mimeType, session.byteSize]
      );
      await voiceUploadSessions.markCompleted(session.uploadId, req.user.id, id);
    });
  } catch (error) {
    if (fs.existsSync(finalPath) && !fs.existsSync(partPath)) fs.renameSync(finalPath, partPath);
    throw error;
  }
  return ok(res, { id, url: signedUrl(id) }, '上传成功');
}));

router.get('/voice/:id/playback', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT id FROM media_assets
      WHERE id = $1 AND user_id = $2 AND mime_type LIKE 'audio/%'`,
    [req.params.id, req.user.id]
  );
  const media = result.rows[0];
  if (!media) return fail(res, 404, '录音不存在');
  return ok(res, { id: media.id, url: signedUrl(media.id) }, '播放地址已准备');
}));

router.post('/voice/:id/transcribe', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT storage_name, storage_provider, original_name, mime_type
       FROM media_assets
      WHERE id = $1 AND user_id = $2 AND mime_type LIKE 'audio/%'`,
    [req.params.id, req.user.id]
  );
  const media = result.rows[0];
  if (!media) return fail(res, 404, '录音不存在');

  let temporaryPath = null;
  try {
    if (media.storage_provider === 'cos') {
      temporaryPath = path.resolve(config.uploadDir, `.${crypto.randomUUID()}.transcribe`);
      fs.writeFileSync(temporaryPath, await readPrivateObject(media.storage_name), { mode: 0o600 });
    }
    const transcript = await transcribeVoice({
      filePath: temporaryPath || path.resolve(config.uploadDir, media.storage_name),
      originalName: media.original_name,
      mimeType: media.mime_type
    });
    return ok(res, transcript, '转写完成');
  } finally {
    if (temporaryPath) fs.rmSync(temporaryPath, { force: true });
  }
}));

module.exports = router;
