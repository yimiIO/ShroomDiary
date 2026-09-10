'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret-that-is-not-used-in-production';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');
const { optimizeImageForStorage } = require('../src/image-processor');
const { buildPrivateImageKey, isCosConfigured } = require('../src/media-storage');

test('image processing preserves decoded pixels while converting to WebP', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-image-'));
  const inputPath = path.join(directory, 'source.png');
  const outputPath = path.join(directory, 'stored.webp');
  const pixels = Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 128
  ]);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  await sharp(pixels, { raw: { width: 2, height: 2, channels: 4 } })
    .png()
    .toFile(inputPath);
  const result = await optimizeImageForStorage({ inputPath, outputPath, maxPixels: 100 });
  const output = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true });
  const metadata = await sharp(outputPath).metadata();

  assert.equal(result.mimeType, 'image/webp');
  assert.equal(result.width, 2);
  assert.equal(result.height, 2);
  assert.deepEqual(output.data, pixels);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.exif, undefined);
  assert.ok(result.byteSize <= result.sourceByteSize);
});

test('already-compressed photos never grow during storage optimization', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-photo-'));
  const inputPath = path.join(directory, 'source.jpg');
  const outputPath = path.join(directory, 'stored.webp');
  const width = 320;
  const height = 240;
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = (index * 29) % 256;
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  await sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 60 })
    .toFile(inputPath);
  const sourceByteSize = fs.statSync(inputPath).size;
  const result = await optimizeImageForStorage({
    inputPath,
    outputPath,
    maxPixels: width * height,
    maxOutputBytes: sourceByteSize
  });

  assert.ok(result.byteSize <= sourceByteSize);
  assert.equal(result.savedBytes, sourceByteSize - result.byteSize);
  assert.equal((await sharp(outputPath).metadata()).exif, undefined);
});

test('private COS keys isolate users and use Shanghai calendar folders', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const instant = new Date('2026-01-31T16:30:00.000Z');
  assert.equal(
    buildPrivateImageKey(userId, mediaId, instant),
    `private/users/${userId}/diary/2026/02/${mediaId}.webp`
  );
  assert.equal(isCosConfigured(), false);
});
