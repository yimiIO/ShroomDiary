'use strict';

// Compress on the device before sending bytes. Server-side optimization happens too late
// to help a slow mobile uplink. Canvas output also excludes source EXIF/location data.
async function prepareMealImage(filePath, env) {
  const browser = env || { fetch: (...args) => fetch(...args), Image, createCanvas: () => document.createElement('canvas'), URL };
  const source = await browser.fetch(filePath).then(response => {
    if (!response.ok) throw new Error('照片读取失败，请重新选择');
    return response.blob();
  });
  if (/^image\/(jpeg|png|webp)$/.test(source.type) && source.size <= 512 * 1024) return { filePath, release() {} };
  const image = await new Promise((resolve, reject) => {
    const photo = new browser.Image();
    photo.onload = () => resolve(photo);
    photo.onerror = () => reject(new Error('无法读取这张照片，请转为 JPG 或重新拍照'));
    photo.src = filePath;
  });
  const canvas = browser.createCanvas();
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法准备照片，请重新打开页面后重试');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    let blob;
    for (const quality of [.82, .68, .55, .42]) {
      blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('照片压缩失败，请重新拍照')), 'image/jpeg', quality));
      if (blob.size <= 512 * 1024) break;
    }
    if (blob.size > 1024 * 1024) throw new Error('照片仍较大，请裁剪后重试');
    const url = browser.URL.createObjectURL(blob);
    return { filePath: url, release: () => browser.URL.revokeObjectURL(url) };
  } finally { canvas.width = 0; canvas.height = 0; }
}

module.exports = { prepareMealImage };
