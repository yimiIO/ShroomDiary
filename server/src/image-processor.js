'use strict';

const fs = require('node:fs');
const sharp = require('sharp');

const mimeTypes = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif'
};

function imageError(message, cause) {
  return Object.assign(new Error(message), { code: 'SHROOM_IMAGE_INVALID', cause });
}

function imagePipeline(inputPath, { animated, maxPixels, resize }) {
  let pipeline = sharp(inputPath, { animated, failOn: 'warning', limitInputPixels: maxPixels }).rotate();
  if (resize) {
    pipeline = pipeline.resize({
      width: resize,
      height: resize,
      fit: 'inside',
      withoutEnlargement: true
    });
  }
  return pipeline;
}

async function optimizeImageForStorage({
  inputPath,
  outputPath,
  maxPixels = 40000000,
  maxDimension = 1600,
  maxOutputBytes
}) {
  try {
    const metadata = await sharp(inputPath, {
      animated: true,
      failOn: 'warning',
      limitInputPixels: maxPixels
    }).metadata();
    if (!metadata.width || !metadata.height) throw imageError('无法读取图片尺寸');

    const sourceByteSize = fs.statSync(inputPath).size;
    const byteLimit = Math.max(1, Number(maxOutputBytes) || sourceByteSize);
    const animated = (metadata.pages || 1) > 1;
    const photoLike = metadata.format === 'jpeg' || (!metadata.hasAlpha && metadata.format !== 'gif');
    const resize = photoLike && Math.max(metadata.width, metadata.height) > maxDimension ? maxDimension : null;
    const candidates = [];

    if (!photoLike || metadata.format === 'webp') {
      const lossless = await imagePipeline(inputPath, { animated, maxPixels, resize })
        .webp({ lossless: true, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      candidates.push({
        buffer: lossless.data,
        info: lossless.info,
        quality: 100,
        lossless: true,
        strategy: 'lossless-webp'
      });
    }

    // Prefer the highest-quality result that is no larger than the incoming file.
    // Lower qualities are reached only when the source was already heavily compressed.
    for (const quality of [88, 84, 82, 80, 78, 74, 70, 66, 62, 58, 54, 50]) {
      const encoded = await imagePipeline(inputPath, { animated, maxPixels, resize })
        .webp({ quality, smartSubsample: true, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      candidates.push({
        buffer: encoded.data,
        info: encoded.info,
        quality,
        lossless: false,
        strategy: `adaptive-webp-q${quality}`
      });
      if (encoded.data.length <= byteLimit) break;
    }

    let selected = candidates.find(candidate => candidate.buffer.length <= byteLimit);
    if (!selected) {
      selected = candidates.reduce((smallest, item) => (
        !smallest || item.buffer.length < smallest.buffer.length ? item : smallest
      ), null);
    }

    const hasPrivateMetadata = Boolean(metadata.exif || metadata.xmp || metadata.iptc || metadata.orientation);
    if (selected.buffer.length > byteLimit && !hasPrivateMetadata && sourceByteSize <= byteLimit) {
      selected = {
        buffer: fs.readFileSync(inputPath),
        info: { width: metadata.width, height: metadata.height },
        quality: null,
        lossless: true,
        strategy: 'preserved-already-smaller',
        format: metadata.format
      };
    }
    if (selected.buffer.length > byteLimit) {
      throw imageError('该图片在移除隐私元数据后无法压缩到原文件以下');
    }

    fs.writeFileSync(outputPath, selected.buffer, { mode: 0o600 });
    const format = selected.format || 'webp';
    return {
      byteSize: selected.buffer.length,
      sourceByteSize,
      savedBytes: sourceByteSize - selected.buffer.length,
      width: selected.info.width,
      height: selected.info.height,
      mimeType: mimeTypes[format] || 'application/octet-stream',
      extension: format === 'jpeg' ? 'jpg' : format,
      quality: selected.quality,
      lossless: selected.lossless,
      strategy: selected.strategy,
      resized: Boolean(resize)
    };
  } catch (error) {
    if (error.code === 'SHROOM_IMAGE_INVALID') throw error;
    throw imageError('图片无法解析或超过可处理尺寸', error);
  }
}

module.exports = { optimizeImageForStorage };
