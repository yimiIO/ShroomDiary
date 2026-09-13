'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { uploadPrivateImage } = require('../src/media-storage');

async function main() {
  const values = process.argv.slice(2);
  if (!values.length || values.length % 3 !== 0) {
    throw new Error('Usage: node upload_static_media.js <file> <public/key> <mime> [...]');
  }
  for (let index = 0; index < values.length; index += 3) {
    const filePath = path.resolve(values[index]);
    const key = values[index + 1];
    const mimeType = values[index + 2];
    if (!key.startsWith('public/')) throw new Error('Static media keys must start with public/');
    const stat = fs.statSync(filePath);
    await uploadPrivateImage({ filePath, key, byteSize: stat.size, mimeType });
    process.stdout.write(`uploaded ${key} ${stat.size} bytes\n`);
  }
}

main().catch(error => {
  process.stderr.write(`Static media upload failed: ${error.message || String(error)}\n`);
  process.exitCode = 1;
});
