'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sessionError(code, message) {
  return Object.assign(new Error(message), { code });
}

function parseContentRange(value) {
  const match = String(value || '').match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (!match) return null;
  const range = { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
  if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || !Number.isSafeInteger(range.total)) return null;
  if (range.start < 0 || range.end < range.start || range.end >= range.total) return null;
  return range;
}

class VoiceUploadSessionStore {
  constructor({ rootDir, maxBytes, now = Date.now }) {
    this.rootDir = rootDir;
    this.maxBytes = maxBytes;
    this.now = now;
    fs.mkdirSync(rootDir, { recursive: true, mode: 0o750 });
  }

  assertId(uploadId) {
    if (!UUID.test(String(uploadId || ''))) throw sessionError('SHROOM_VOICE_UPLOAD_NOT_FOUND', 'Voice upload session not found');
  }

  metadataPath(uploadId) {
    this.assertId(uploadId);
    return path.join(this.rootDir, `${uploadId}.json`);
  }

  partPath(uploadId) {
    this.assertId(uploadId);
    return path.join(this.rootDir, `${uploadId}.part`);
  }

  async create({ userId, mimeType, originalName, byteSize }) {
    this.cleanupExpired();
    const size = Number(byteSize);
    if (!Number.isSafeInteger(size) || size < 1 || size > this.maxBytes) {
      throw sessionError('SHROOM_VOICE_UPLOAD_SIZE', 'Voice recording is too large');
    }
    const uploadId = crypto.randomUUID();
    const metadata = {
      version: 1,
      uploadId,
      userId: String(userId),
      mimeType: String(mimeType),
      originalName: path.basename(String(originalName || 'voice.webm')),
      byteSize: size,
      createdAt: this.now(),
      mediaId: null
    };
    fs.writeFileSync(this.metadataPath(uploadId), JSON.stringify(metadata), { mode: 0o640, flag: 'wx' });
    fs.writeFileSync(this.partPath(uploadId), Buffer.alloc(0), { mode: 0o640, flag: 'wx' });
    return { ...metadata, receivedBytes: 0 };
  }

  cleanupExpired(maxAgeMs = 24 * 60 * 60 * 1000) {
    const cutoff = this.now() - maxAgeMs;
    for (const name of fs.readdirSync(this.rootDir)) {
      if (!name.endsWith('.json')) continue;
      const metadataPath = path.join(this.rootDir, name);
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (Number(metadata.createdAt) >= cutoff) continue;
        const uploadId = name.slice(0, -5);
        fs.rmSync(metadataPath, { force: true });
        fs.rmSync(this.partPath(uploadId), { force: true });
      } catch (_) {
        // Ignore malformed or concurrently removed session files.
      }
    }
  }

  async load(uploadId, userId) {
    this.assertId(uploadId);
    let metadata;
    try {
      metadata = JSON.parse(fs.readFileSync(this.metadataPath(uploadId), 'utf8'));
    } catch (_) {
      throw sessionError('SHROOM_VOICE_UPLOAD_NOT_FOUND', 'Voice upload session not found');
    }
    if (metadata.userId !== String(userId)) {
      throw sessionError('SHROOM_VOICE_UPLOAD_NOT_FOUND', 'Voice upload session not found');
    }
    const receivedBytes = metadata.mediaId
      ? metadata.byteSize
      : (fs.existsSync(this.partPath(uploadId)) ? fs.statSync(this.partPath(uploadId)).size : 0);
    return { ...metadata, receivedBytes };
  }

  async append({ uploadId, userId, start, total, bytes }) {
    const metadata = await this.load(uploadId, userId);
    if (metadata.mediaId) return metadata;
    if (!Buffer.isBuffer(bytes) || !bytes.length || total !== metadata.byteSize) {
      throw sessionError('SHROOM_VOICE_UPLOAD_RANGE', 'Invalid voice upload range');
    }
    const partPath = this.partPath(uploadId);
    const receivedBytes = fs.statSync(partPath).size;
    if (start < receivedBytes && start + bytes.length <= receivedBytes) {
      const existing = Buffer.alloc(bytes.length);
      const descriptor = fs.openSync(partPath, 'r');
      try {
        fs.readSync(descriptor, existing, 0, bytes.length, start);
      } finally {
        fs.closeSync(descriptor);
      }
      if (!crypto.timingSafeEqual(existing, bytes)) {
        throw sessionError('SHROOM_VOICE_UPLOAD_CONFLICT', 'Voice upload chunk conflicts with saved data');
      }
      return { ...metadata, receivedBytes };
    }
    if (start !== receivedBytes || receivedBytes + bytes.length > metadata.byteSize) {
      throw sessionError('SHROOM_VOICE_UPLOAD_OFFSET', 'Voice upload offset does not match saved progress');
    }
    fs.appendFileSync(partPath, bytes);
    return { ...metadata, receivedBytes: receivedBytes + bytes.length };
  }

  async markCompleted(uploadId, userId, mediaId) {
    const metadata = await this.load(uploadId, userId);
    const completed = { ...metadata, mediaId: String(mediaId), completedAt: this.now() };
    delete completed.receivedBytes;
    fs.writeFileSync(this.metadataPath(uploadId), JSON.stringify(completed), { mode: 0o640 });
    return { ...completed, receivedBytes: completed.byteSize };
  }
}

module.exports = { VoiceUploadSessionStore, parseContentRange };
