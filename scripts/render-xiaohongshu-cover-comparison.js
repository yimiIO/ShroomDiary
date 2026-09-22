'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../server/node_modules/sharp');

const WIDTH = 1080;
const HEIGHT = 1440;
const root = path.join(__dirname, '..');
const pilotDir = path.join(root, 'artifacts', 'xiaohongshu', 'xhs-diary-reuse-001');
const variantsDir = path.join(pilotDir, 'cover-variants');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textLines(items, { x, y, size, lineHeight, fill, weight = 700 }) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="PingFang SC, Heiti SC, sans-serif" font-size="${size}" font-weight="${weight}">${items.map((item, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : Math.round(size * lineHeight)}">${escapeXml(item)}</tspan>`).join('')}</text>`;
}

function photographicOverlay() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <rect x="58" y="58" width="780" height="616" rx="38" fill="#F6F0E7" fill-opacity="0.91"/>
    <text x="96" y="122" fill="#405646" font-family="PingFang SC, Heiti SC, sans-serif" font-size="22" font-weight="650" letter-spacing="3">SHROOM / 菇日记</text>
    <text x="96" y="205" fill="#566B59" font-family="PingFang SC, Heiti SC, sans-serif" font-size="25" font-weight="650" letter-spacing="1">写过很多，却很少再用到</text>
    ${textLines(['日记写了很多，', '遇到同一个问题', '还是要从头想'], { x: 96, y: 322, size: 76, lineHeight: 1.21, fill: '#172019', weight: 760 })}
    <path d="M96 620 L250 620" stroke="#D96F53" stroke-width="8" stroke-linecap="round"/>
    <rect x="58" y="1310" width="410" height="62" rx="31" fill="#172019" fill-opacity="0.82"/>
    <text x="86" y="1350" fill="#F4F7F0" font-family="PingFang SC, Heiti SC, sans-serif" font-size="20" font-weight="560" letter-spacing="1">AI 视觉素材 · 演示内容</text>
  </svg>`);
}

function symbolicOverlay() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <rect width="${WIDTH}" height="770" fill="url(#fade)"/>
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#07110B" stop-opacity="0.93"/>
        <stop offset="0.72" stop-color="#07110B" stop-opacity="0.42"/>
        <stop offset="1" stop-color="#07110B" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <text x="82" y="108" fill="#DDEC8C" font-family="PingFang SC, Heiti SC, sans-serif" font-size="22" font-weight="650" letter-spacing="3">SHROOM / 菇日记</text>
    <text x="82" y="190" fill="#C6D3C3" font-family="PingFang SC, Heiti SC, sans-serif" font-size="25" font-weight="620" letter-spacing="1">写过很多，却很少再用到</text>
    ${textLines(['日记写了很多，', '遇到同一个问题', '还是要从头想'], { x: 82, y: 314, size: 78, lineHeight: 1.2, fill: '#F8FAF4', weight: 760 })}
    <path d="M82 612 L244 612" stroke="#D96F53" stroke-width="8" stroke-linecap="round"/>
    <rect x="58" y="1310" width="410" height="62" rx="31" fill="#07110B" fill-opacity="0.78"/>
    <text x="86" y="1350" fill="#E9EFE5" font-family="PingFang SC, Heiti SC, sans-serif" font-size="20" font-weight="560" letter-spacing="1">AI 视觉素材 · 演示内容</text>
  </svg>`);
}

async function renderVariant(backgroundName, outputName, overlay) {
  await sharp(path.join(variantsDir, backgroundName))
    .resize(WIDTH, HEIGHT, { fit: 'cover' })
    .composite([{ input: overlay }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(variantsDir, outputName));
}

async function buildComparison() {
  const candidates = [
    { path: path.join(pilotDir, '01.png'), label: 'A  确定性编辑设计' },
    { path: path.join(variantsDir, 'cover-b-photographic.png'), label: 'B  编辑摄影 + 精确排版' },
    { path: path.join(variantsDir, 'cover-c-symbolic.png'), label: 'C  抽象记忆视觉 + 精确排版' }
  ];
  const previews = await Promise.all(candidates.map(candidate => sharp(candidate.path)
    .resize(330, 440, { fit: 'cover' })
    .png()
    .toBuffer()));
  const sheetWidth = 1150;
  const sheetHeight = 590;
  const xPositions = [60, 410, 760];
  const labelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}">
    <rect width="${sheetWidth}" height="${sheetHeight}" fill="#111713"/>
    <text x="60" y="54" fill="#F4F7F0" font-family="PingFang SC, Heiti SC, sans-serif" font-size="30" font-weight="700">同一文案，三种视觉生产方法</text>
    ${candidates.map((candidate, index) => `<text x="${xPositions[index]}" y="552" fill="#D8E1D5" font-family="PingFang SC, Heiti SC, sans-serif" font-size="21" font-weight="600">${escapeXml(candidate.label)}</text>`).join('')}
  </svg>`);
  await sharp(labelSvg)
    .composite(previews.map((input, index) => ({ input, left: xPositions[index], top: 82 })))
    .png({ compressionLevel: 9 })
    .toFile(path.join(variantsDir, 'cover-comparison.png'));
}

async function main() {
  fs.mkdirSync(variantsDir, { recursive: true });
  await renderVariant('background-photographic.png', 'cover-b-photographic.png', photographicOverlay());
  await renderVariant('background-symbolic.png', 'cover-c-symbolic.png', symbolicOverlay());
  await buildComparison();
  process.stdout.write(`${variantsDir}\n3 cover methods ready\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
