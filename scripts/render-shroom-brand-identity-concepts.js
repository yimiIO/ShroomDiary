'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../server/node_modules/sharp');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'brand', 'shroom-identity-concepts');
const tokens = require('../docs/brand/shroom-color-tokens.json');
const c = tokens.primitives;
c.brandPaper = c.brandPaper || '#E9F1E1';

const SIZE = 1024;
const concepts = [
  {
    id: '01-avatar-plus-memory-notch',
    name: '头像亲缘 · 记忆缺口',
    rationale: '最贴近现有头像，加入右上记忆缺口和非对称菌盖增强显著性。',
    scene: avatarPlus
  },
  {
    id: '02-shroom-s-negative-space',
    name: 'S 形负空间',
    rationale: '把 Shroom 的 S 融入菌盖负空间，远看是菇，近看有字母结构。',
    scene: sNegative
  },
  {
    id: '03-archive-door-cap',
    name: '档案门菌盖',
    rationale: '菌盖像打开的档案门，强调个人记忆库而不是普通蘑菇。',
    scene: archiveDoor
  },
  {
    id: '04-mycelium-memory-node',
    name: '菌丝记忆节点',
    rationale: '保留菇的外轮廓，加入三条菌丝连接记忆点，适合 AI 记忆产品。',
    scene: myceliumNode
  },
  {
    id: '05-folded-card-mushroom',
    name: '折角卡片菇',
    rationale: '把菇体和日记卡片合并，折角是独特识别点，商标感较强。',
    scene: foldedCard
  },
  {
    id: '06-seal-monogram',
    name: '印章式 S 菇',
    rationale: '更像 App icon 与商标印章，显著但离头像最远，适合注册备选。',
    scene: sealMonogram
  }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(x, y, value, options = {}) {
  return `<text x="${x}" y="${y}" fill="${options.fill || c.myceliumInk}" font-family="PingFang SC, Heiti SC, Arial, sans-serif" font-size="${options.size || 30}" font-weight="${options.weight || 760}" text-anchor="${options.anchor || 'start'}">${escapeXml(value)}</text>`;
}

function base(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" rx="220" fill="${c.brandPaper}"/>
    ${content}
  </svg>`;
}

function avatarPlus() {
  return base(`
    <path d="M268 326 C356 206 596 188 746 322 C670 460 456 500 246 422 C190 400 206 362 268 326Z" fill="${c.myceliumInk}"/>
    <path d="M650 300 L756 300 L756 392 L672 392 C658 360 652 330 650 300Z" fill="${c.memoryLime}"/>
    <path d="M360 432 C406 396 552 396 608 434 L654 720 C558 786 384 778 302 710Z" fill="${c.warmPaper}" stroke="${c.myceliumInk}" stroke-width="30" stroke-linejoin="round"/>
    <path d="M394 618 C456 650 540 650 602 618" fill="none" stroke="${c.myceliumInk}" stroke-width="28" stroke-linecap="round" opacity=".18"/>
  `);
}

function sNegative() {
  return base(`
    <path d="M232 354 C328 196 634 188 786 356 C700 482 472 520 232 424 C176 402 178 384 232 354Z" fill="${c.myceliumInk}"/>
    <path d="M582 292 C492 286 436 318 438 362 C440 406 514 412 568 430 C644 456 662 526 600 578 C552 620 462 630 376 612" fill="none" stroke="${c.brandPaper}" stroke-width="58" stroke-linecap="round"/>
    <rect x="668" y="312" width="96" height="76" rx="16" fill="${c.memoryLime}"/>
    <path d="M392 466 C440 426 554 426 604 468 L654 728 C552 786 386 784 304 712Z" fill="${c.warmPaper}" stroke="${c.myceliumInk}" stroke-width="30"/>
  `);
}

function archiveDoor() {
  return base(`
    <path d="M244 346 C348 214 602 210 764 352 C686 474 480 520 240 432 C182 410 188 380 244 346Z" fill="${c.myceliumInk}"/>
    <path d="M544 284 L738 284 L694 420 L562 420 Z" fill="${c.memoryLime}"/>
    <path d="M332 450 L600 392 L660 736 L362 788 Z" fill="${c.warmPaper}" stroke="${c.myceliumInk}" stroke-width="28" stroke-linejoin="round"/>
    <path d="M430 512 L590 480 M444 592 L604 560 M458 672 L578 646" stroke="${c.myceliumInk}" stroke-width="24" stroke-linecap="round" opacity=".22"/>
  `);
}

function myceliumNode() {
  return base(`
    <path d="M250 336 C344 212 618 194 778 348 C694 472 466 510 240 426 C184 404 192 374 250 336Z" fill="${c.myceliumInk}"/>
    <rect x="672" y="304" width="90" height="72" rx="16" fill="${c.memoryLime}"/>
    <path d="M384 448 C434 414 558 414 612 452 L642 664 C552 724 406 722 320 660Z" fill="${c.warmPaper}" stroke="${c.myceliumInk}" stroke-width="30"/>
    <path d="M482 702 C462 780 386 808 316 842 M510 702 C512 790 512 834 512 884 M540 702 C592 784 666 812 748 838" fill="none" stroke="${c.myceliumInk}" stroke-width="20" stroke-linecap="round"/>
    <circle cx="316" cy="842" r="30" fill="${c.memoryLime}" stroke="${c.myceliumInk}" stroke-width="18"/>
    <circle cx="512" cy="884" r="30" fill="${c.memoryLime}" stroke="${c.myceliumInk}" stroke-width="18"/>
    <circle cx="748" cy="838" r="30" fill="${c.memoryLime}" stroke="${c.myceliumInk}" stroke-width="18"/>
  `);
}

function foldedCard() {
  return base(`
    <path d="M230 360 C334 202 626 202 792 360 C686 470 486 514 238 430 C174 408 176 390 230 360Z" fill="${c.myceliumInk}"/>
    <path d="M620 284 L762 284 L762 420 L684 374 Z" fill="${c.memoryLime}"/>
    <path d="M346 438 L610 438 L692 532 L646 760 L372 760 L316 532 Z" fill="${c.warmPaper}" stroke="${c.myceliumInk}" stroke-width="30" stroke-linejoin="round"/>
    <path d="M610 438 L610 532 L692 532" fill="none" stroke="${c.myceliumInk}" stroke-width="24" stroke-linejoin="round"/>
    <path d="M410 604 L600 604 M430 676 L570 676" stroke="${c.myceliumInk}" stroke-width="24" stroke-linecap="round" opacity=".18"/>
  `);
}

function sealMonogram() {
  return base(`
    <circle cx="512" cy="512" r="330" fill="${c.myceliumInk}"/>
    <circle cx="512" cy="512" r="266" fill="none" stroke="${c.memoryLime}" stroke-width="34"/>
    <path d="M344 392 C420 276 608 282 700 402 C626 474 454 492 322 440 C286 426 300 408 344 392Z" fill="${c.warmPaper}"/>
    <rect x="616" y="376" width="86" height="64" rx="14" fill="${c.memoryLime}"/>
    <path d="M582 376 C498 370 444 402 446 446 C448 490 528 492 574 512 C650 546 650 630 582 680 C526 722 424 718 346 684" fill="none" stroke="${c.myceliumInk}" stroke-width="48" stroke-linecap="round"/>
  `);
}

async function renderConcept(concept) {
  const svg = concept.scene();
  const svgPath = path.join(outDir, `${concept.id}.svg`);
  const pngPath = path.join(outDir, `${concept.id}.png`);
  fs.writeFileSync(svgPath, `${svg}\n`);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  const meta = await sharp(pngPath).metadata();
  return {
    id: concept.id,
    name: concept.name,
    file: path.basename(pngPath),
    svg: path.basename(svgPath),
    width: meta.width,
    height: meta.height,
    rationale: concept.rationale,
    status: 'INTERNAL_REVIEW_NOT_TRADEMARK_ADVICE'
  };
}

async function contactSheet(items) {
  const thumb = 230;
  const cardW = 320;
  const cardH = 390;
  const gap = 28;
  const pad = 38;
  const width = pad * 2 + cardW * 3 + gap * 2;
  const height = pad * 2 + cardH * 2 + gap;
  const overlays = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const x = pad + (index % 3) * (cardW + gap);
    const y = pad + Math.floor(index / 3) * (cardH + gap);
    const image = await sharp(path.join(outDir, item.file)).resize(thumb, thumb).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}">
      <rect width="${cardW}" height="${cardH}" rx="34" fill="${c.warmPaper}" stroke="${c.mistBorder}" stroke-width="4"/>
      ${text(28, 44, item.id.slice(0, 2), { size: 20, weight: 850, fill: c.archiveGrey })}
      ${text(28, 308, item.name, { size: 25, weight: 850 })}
      ${text(28, 344, 'INTERNAL REVIEW · NOT LEGAL ADVICE', { size: 13, weight: 760, fill: c.archiveGrey })}
    </svg>`);
    overlays.push({ input: label, left: x, top: y });
    overlays.push({ input: image, left: x + Math.round((cardW - thumb) / 2), top: y + 62 });
  }
  await sharp({
    create: { width, height, channels: 4, background: c.brandPaper }
  }).composite(overlays).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'contact-sheet.png'));
}

async function main() {
  ensureDir(outDir);
  const items = [];
  for (const concept of concepts) items.push(await renderConcept(concept));
  await contactSheet(items);
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({
    batch: 'shroom-identity-concepts-001',
    generatedAt: new Date().toISOString(),
    brandPaper: c.brandPaper,
    principle: 'Avatar kinship plus distinctive structure. The mark must not be a generic mushroom.',
    legalBoundary: 'Design exploration only; final trademark registrability requires professional search and filing review.',
    recommendedShortlist: ['02-shroom-s-negative-space', '05-folded-card-mushroom', '06-seal-monogram'],
    items,
    contactSheet: 'contact-sheet.png'
  }, null, 2)}\n`);
  process.stdout.write(`${items.map(item => `${item.id}: ${item.file}`).join('\n')}\ncontact-sheet.png\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
