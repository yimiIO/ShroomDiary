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
  deletePrivateObject,
  isCosConfigured,
  readPrivateObject,
  uploadPrivateImage
} = require('../media-storage');
const { createMediaSignature, verifyMediaSignature } = require('../security');
const { asyncRoute, fail, ok, requireUser } = require('../http');
const { transcribeVoice } = require('../transcription');

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
const voiceUpload = uploadFor(voiceExtensions, 10 * 1024 * 1024);

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

router.post('/voice/:id/transcribe', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT storage_name, original_name, mime_type
       FROM media_assets
      WHERE id = $1 AND user_id = $2 AND mime_type LIKE 'audio/%'`,
    [req.params.id, req.user.id]
  );
  const media = result.rows[0];
  if (!media) return fail(res, 404, '录音不存在');

  const transcript = await transcribeVoice({
    filePath: path.resolve(config.uploadDir, media.storage_name),
    originalName: media.original_name,
    mimeType: media.mime_type
  });
  return ok(res, transcript, '转写完成');
}));

module.exports = router;
