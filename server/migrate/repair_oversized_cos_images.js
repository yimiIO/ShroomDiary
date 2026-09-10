'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const db = require('../src/db');
const { optimizeImageForStorage } = require('../src/image-processor');
const {
  buildPrivateImageKey,
  deletePrivateObject,
  isCosConfigured,
  readPrivateObject,
  uploadPrivateImage
} = require('../src/media-storage');

const execute = process.argv.includes('--execute');
const manifestPath = process.env.MANIFEST_PATH
  || path.resolve(config.uploadDir, `cos-image-size-repair-${Date.now()}.json`);
const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(manifestPath), 'oversized-cos-backup');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function oversizedImages() {
  const result = await db.query(
    `SELECT id, user_id, storage_name, mime_type, byte_size, source_byte_size, created_at
       FROM media_assets
      WHERE storage_provider = 'cos' AND mime_type LIKE 'image/%'
        AND source_byte_size IS NOT NULL AND byte_size > source_byte_size
      ORDER BY created_at`
  );
  return result.rows;
}

async function repairOne(asset) {
  const entry = {
    mediaId: asset.id,
    previousObjectKey: asset.storage_name,
    previousByteSize: asset.byte_size,
    maximumByteSize: asset.source_byte_size,
    status: execute ? 'pending' : 'dry-run'
  };
  if (!execute) return entry;

  const inputPath = path.resolve(config.uploadDir, `.${asset.id}.cos-source`);
  const outputPath = path.resolve(config.uploadDir, `.${asset.id}.cos-repaired`);
  let original;
  let newObjectKey;
  try {
    original = await readPrivateObject(asset.storage_name);
    fs.writeFileSync(inputPath, original, { mode: 0o600 });
    const optimized = await optimizeImageForStorage({
      inputPath,
      outputPath,
      maxPixels: config.imageMaxPixels,
      maxDimension: config.imageMaxDimension,
      maxOutputBytes: asset.source_byte_size
    });
    if (optimized.byteSize > asset.source_byte_size) throw new Error('Repaired image still exceeds source size');

    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(backupDir, `${asset.id}.before`);
    fs.writeFileSync(backupPath, original, { mode: 0o600 });
    newObjectKey = buildPrivateImageKey(
      asset.user_id,
      asset.id,
      new Date(asset.created_at),
      optimized.extension
    );
    await uploadPrivateImage({
      filePath: outputPath,
      key: newObjectKey,
      byteSize: optimized.byteSize,
      mimeType: optimized.mimeType
    });

    const updated = await db.query(
      `UPDATE media_assets
          SET storage_name = $2, mime_type = $3, byte_size = $4, width = $5, height = $6
        WHERE id = $1 AND storage_provider = 'cos' AND byte_size = $7
        RETURNING id`,
      [
        asset.id, newObjectKey, optimized.mimeType, optimized.byteSize,
        optimized.width, optimized.height, asset.byte_size
      ]
    );
    if (!updated.rowCount) throw new Error('Asset changed during size repair');
    if (newObjectKey !== asset.storage_name) await deletePrivateObject(asset.storage_name);

    return {
      ...entry,
      status: 'repaired',
      objectKey: newObjectKey,
      contentType: optimized.mimeType,
      compression: optimized.strategy,
      quality: optimized.quality,
      resized: optimized.resized,
      byteSize: optimized.byteSize,
      savedBytes: asset.byte_size - optimized.byteSize,
      sourceSha256: sha256(original),
      storedSha256: sha256(fs.readFileSync(outputPath)),
      rollbackPath: backupPath
    };
  } catch (error) {
    if (original && newObjectKey === asset.storage_name) {
      try {
        fs.writeFileSync(inputPath, original, { mode: 0o600 });
        await uploadPrivateImage({
          filePath: inputPath,
          key: asset.storage_name,
          byteSize: original.length,
          mimeType: asset.mime_type
        });
      } catch (rollbackError) {
        entry.rollbackError = rollbackError.code || rollbackError.message;
      }
    } else if (newObjectKey) {
      try {
        await deletePrivateObject(newObjectKey);
      } catch (cleanupError) {
        entry.cleanupError = cleanupError.code || cleanupError.message;
      }
    }
    return { ...entry, status: 'failed', error: error.code || error.message };
  } finally {
    fs.rmSync(inputPath, { force: true });
    fs.rmSync(outputPath, { force: true });
  }
}

async function run() {
  if (execute && !isCosConfigured()) throw new Error('COS configuration is required for --execute');
  const assets = await oversizedImages();
  const items = [];
  for (const asset of assets) items.push(await repairOne(asset));
  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: execute ? 'execute' : 'dry-run',
    bucket: config.cos.bucket,
    region: config.cos.region,
    invariant: 'storedByteSize <= sourceByteSize',
    items
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    ok: !items.some(item => item.status === 'failed'),
    manifestPath,
    counts: items.reduce((counts, item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    }, {})
  }));
  if (items.some(item => item.status === 'failed')) process.exitCode = 1;
}

run()
  .catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.code || error.message }));
    process.exitCode = 1;
  })
  .finally(() => db.close());
