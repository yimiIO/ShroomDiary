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
  uploadPrivateImage
} = require('../src/media-storage');

const execute = process.argv.includes('--execute');
const includeUnreferenced = process.argv.includes('--include-unreferenced');
const manifestPath = process.env.MANIFEST_PATH
  || path.resolve(config.uploadDir, `cos-image-migration-${Date.now()}.json`);

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function localImages() {
  const result = await db.query(
    `SELECT m.id, m.user_id, m.storage_name, m.mime_type, m.byte_size, m.created_at,
            count(d.id)::int AS diary_refs
       FROM media_assets m
       LEFT JOIN diaries d ON d.user_id = m.user_id
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(d.images) value
           WHERE value = m.id::text OR value LIKE '%' || m.id::text || '%'
        )
      WHERE m.storage_provider = 'local' AND m.mime_type LIKE 'image/%'
      GROUP BY m.id, m.user_id, m.storage_name, m.mime_type, m.byte_size, m.created_at
      ORDER BY m.created_at`
  );
  return result.rows;
}

async function migrateOne(asset) {
  const sourcePath = path.resolve(config.uploadDir, asset.storage_name);
  const temporaryPath = path.resolve(config.uploadDir, `.cos-migration-${asset.id}.processed`);
  const entry = {
    mediaId: asset.id,
    sourcePath,
    outputFormat: null,
    compression: null,
    objectKey: null,
    privateUrl: null,
    diaryReferences: asset.diary_refs,
    sourceByteSize: asset.byte_size,
    status: 'pending'
  };

  if (!asset.diary_refs && !includeUnreferenced) {
    return { ...entry, status: 'skipped-unreferenced' };
  }
  if (!execute) return { ...entry, status: 'dry-run' };
  if (!fs.existsSync(sourcePath)) return { ...entry, status: 'missing-source' };

  let uploaded = false;
  let objectKey = null;
  try {
    const sourceHash = await sha256(sourcePath);
    const optimized = await optimizeImageForStorage({
      inputPath: sourcePath,
      outputPath: temporaryPath,
      maxPixels: config.imageMaxPixels,
      maxDimension: config.imageMaxDimension,
      maxOutputBytes: asset.byte_size
    });
    objectKey = buildPrivateImageKey(asset.user_id, asset.id, new Date(asset.created_at), optimized.extension);
    const storedHash = await sha256(temporaryPath);
    await uploadPrivateImage({
      filePath: temporaryPath,
      key: objectKey,
      byteSize: optimized.byteSize,
      mimeType: optimized.mimeType
    });
    uploaded = true;
    const updated = await db.query(
      `UPDATE media_assets
          SET storage_name = $2, storage_provider = 'cos', mime_type = $3, byte_size = $4,
              source_byte_size = COALESCE(source_byte_size, $5), width = $6, height = $7
        WHERE id = $1 AND storage_provider = 'local'
        RETURNING id`,
      [
        asset.id, objectKey, optimized.mimeType, optimized.byteSize,
        asset.byte_size, optimized.width, optimized.height
      ]
    );
    if (!updated.rowCount) throw new Error('Asset changed during COS migration');
    fs.rmSync(sourcePath, { force: true });
    return {
      ...entry,
      status: 'migrated',
      outputFormat: optimized.mimeType,
      compression: optimized.strategy,
      objectKey,
      sourceSha256: sourceHash,
      storedSha256: storedHash,
      storedByteSize: optimized.byteSize,
      width: optimized.width,
      height: optimized.height
    };
  } catch (error) {
    if (uploaded && objectKey) {
      try {
        await deletePrivateObject(objectKey);
      } catch (cleanupError) {
        // Preserve both errors in the root-only manifest without exposing credentials.
        entry.cleanupError = cleanupError.code || cleanupError.message;
      }
    }
    return { ...entry, status: 'failed', error: error.code || error.message };
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

async function run() {
  if (execute && !isCosConfigured()) throw new Error('COS configuration is required for --execute');
  const assets = await localImages();
  const items = [];
  for (const asset of assets) items.push(await migrateOne(asset));
  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: execute ? 'execute' : 'dry-run',
    includeUnreferenced,
    bucket: config.cos.bucket,
    region: config.cos.region,
    keyPrefix: 'private/users/{userId}/diary/{YYYY}/{MM}/',
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
