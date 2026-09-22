'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../server/node_modules/sharp');

const WIDTH = 1080;
const HEIGHT = 1440;
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'xiaohongshu', 'shroom-brand-review-10');
const tokens = require('../docs/brand/shroom-color-tokens.json');
const c = tokens.primitives;
c.brandPaper = c.brandPaper || '#E9F1E1';

const batch = 'xhs-brand-review-10-001';

const routes = [
  ['01-evidence-reversal', '01-evidence-reversal.png', '路线 01 / 证据反转', ['AI 说我', '总在逃避', '三个月前的日记', '不同意'], '一条反例 > 一句聪明总结', 'stamp'],
  ['02-emotional-recognition', '02-emotional-recognition.png', '路线 02 / 情绪识别', ['写了 7 年日记', '真正需要时', '我却想不起'], '记录很多，不等于需要时能找回', 'archive'],
  ['03-product-proof', '03-product-proof.png', '路线 03 / 产品证明', ['问过去的自己', '不是搜索框', '是一条证据链'], '概念示意 / 发布前替换真实截图', 'chain'],
  ['04-manifesto', '04-manifesto.png', '路线 04 / 品牌宣言', ['不遗忘你', '也不替你生活'], '记忆属于用户，决定也属于用户', 'manifesto'],
  ['05-cultural-hotspot', '05-cultural-hotspot.png', '路线 05 / 热点判断', ['AI 越来越聪明', '我们真的', '更懂自己了吗？'], '聪明回答 ≠ 自我理解', 'debate'],
  ['06-professional-boundary', '06-professional-boundary.png', '路线 06 / 专业边界', ['只写一句', '“今天好累”', 'AI 能知道多少？'], '线索不是诊断，不确定也是答案', 'boundary'],
  ['07-privacy-position', '07-privacy-position.png', '路线 07 / 隐私立场', ['你的人生数据库', '不该拿你', '做广告'], '默认私密 / 可纠正 / 可撤回 / 可导出', 'vault'],
  ['08-positive-reframe', '08-positive-reframe.png', '路线 08 / 正向重估', ['你不是三分钟热度', '只是忘了', '自己坚持过'], '演示数据：90 天 / 23 天运动 / 11 次复盘', 'timeline'],
  ['09-social-card', '09-social-card.png', '路线 09 / 轻社交', ['可以公开的', '不是日记', '是你愿分享的理解'], '公开理解，不公开原始日记', 'collage'],
  ['10-future-companion', '10-future-companion.png', '路线 10 / 未来愿景', ['未来的 AI 伙伴', '不必一直说话', '只在需要时想起你'], '更少打扰，更准确地想起', 'orbit']
].map(([id, output, series, title, note, style], index) => ({
  id,
  output,
  series,
  title,
  note,
  style,
  index: index + 1
}));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function text(x, y, value, opts = {}) {
  const fill = opts.fill || c.myceliumInk;
  const size = opts.size || 30;
  const weight = opts.weight || 760;
  const anchor = opts.anchor ? ` text-anchor="${opts.anchor}"` : '';
  const rotate = opts.rotate ? ` transform="rotate(${opts.rotate} ${x} ${y})"` : '';
  const opacity = opts.opacity ? ` fill-opacity="${opts.opacity}"` : '';
  return `<text x="${x}" y="${y}" fill="${fill}"${opacity}${anchor}${rotate} font-family="PingFang SC, Heiti SC, Arial, sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="0">${escapeXml(value)}</text>`;
}

function titleBlock(route, opts = {}) {
  const x = opts.x || 72;
  let y = opts.y || 286;
  const fill = opts.fill || c.myceliumInk;
  const sizes = opts.sizes || [64, 78, 64, 78];
  const leading = opts.leading || 1.34;
  return route.title.map((line, index) => {
    const baseSize = sizes[index] || sizes[sizes.length - 1];
    const size = Math.min(baseSize, Math.floor((opts.maxWidth || 860) / Math.max(1, line.length) * 1.72));
    const out = text(x, y, line, { fill, size, weight: 860 });
    y += Math.round(size * leading);
    return out;
  }).join('\n');
}

function header(route, opts = {}) {
  const fill = opts.fill || c.myceliumInk;
  const pillFill = opts.pillFill || c.myceliumInk;
  const pillText = opts.pillText || c.warmPaper;
  const x = opts.x || 72;
  return `
    ${text(x, 78, 'SHROOM / 菇日记', { fill, size: 22, weight: 850 })}
    <rect x="${x}" y="116" width="${Math.max(326, route.series.length * 24)}" height="54" rx="27" fill="${pillFill}"/>
    ${text(x + 26, 151, route.series, { fill: pillText, size: 22, weight: 760 })}
  `;
}

function footer(route, opts = {}) {
  const fill = opts.fill || c.myceliumInk;
  const noteFill = opts.noteFill || c.warmPaper;
  const noteText = opts.noteText || c.myceliumInk;
  const width = Math.min(890, Math.max(440, route.note.length * 25));
  return `
    <rect x="72" y="1110" width="${width}" height="72" rx="14" fill="${noteFill}"/>
    ${text(100, 1156, route.note, { fill: noteText, size: 25, weight: 720 })}
    ${text(72, 1364, `STYLE ${String(route.index).padStart(2, '0')}/10 · INTERNAL REVIEW · NOT PUBLISHED`, { fill, size: 19, weight: 720, opacity: '.72' })}
  `;
}

function card(x, y, w, h, fill, stroke = c.mistBorder, rx = 22) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`;
}

function mushroomMark(x, y, scale = 1) {
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <path d="M80 18 C146 -16 238 4 270 76 C214 120 128 126 48 92 C22 80 36 43 80 18Z" fill="${c.myceliumInk}"/>
      <rect x="206" y="38" width="58" height="24" rx="6" fill="${c.memoryLime}"/>
      <path d="M96 82 C118 68 186 68 206 86 L222 196 C176 224 92 220 56 190 Z" fill="${c.warmPaper}" stroke="${c.myceliumInk}" stroke-width="7"/>
      <path d="M102 156 C134 172 174 172 204 156" fill="none" stroke="${c.myceliumInk}" stroke-opacity=".16" stroke-width="7" stroke-linecap="round"/>
    </g>
  `;
}

function scene(route) {
  const scenes = {
    stamp: `
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.brandPaper}"/>
      <rect x="706" y="0" width="374" height="${HEIGHT}" fill="${c.myceliumInk}"/>
      <circle cx="772" cy="680" r="250" fill="${c.memoryLime}" opacity=".96"/>
      <circle cx="772" cy="680" r="184" fill="none" stroke="${c.myceliumInk}" stroke-width="12"/>
      ${text(772, 646, '反例', { fill: c.myceliumInk, size: 92, weight: 900, anchor: 'middle' })}
      ${text(772, 724, 'FOUND', { fill: c.myceliumInk, size: 34, weight: 850, anchor: 'middle' })}
      ${card(610, 872, 354, 168, c.warmPaper, c.myceliumInk, 18)}
      ${text(648, 935, '5 月 18 日', { size: 28, weight: 850 })}
      ${text(648, 988, '我主动说清了', { size: 32, weight: 850 })}
      ${mushroomMark(706, 1020, .72)}
      ${header(route)}
      ${titleBlock(route, { y: 282, maxWidth: 600, sizes: [66, 78, 62, 78] })}
      ${footer(route)}
    `,
    archive: `
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.myceliumInk}"/>
      <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${c.brandPaper}" opacity=".10"/>
      ${card(612, 246, 336, 640, c.warmPaper, c.memoryLime, 18)}
      ${Array.from({ length: 7 }).map((_, i) => `<rect x="${644 + i * 22}" y="${300 + i * 54}" width="210" height="34" rx="8" fill="${i % 2 ? c.archivePanel : c.memoryLime}" opacity="${i % 2 ? '.9' : '.76'}"/>`).join('')}
      <path d="M600 908 C742 842 856 880 974 802" fill="none" stroke="${c.memoryLime}" stroke-width="8" stroke-linecap="round"/>
      ${text(774, 980, '找不到，不等于没发生', { fill: c.warmPaper, size: 30, weight: 800, anchor: 'middle' })}
      ${header(route, { fill: c.warmPaper, pillFill: c.memoryLime, pillText: c.myceliumInk })}
      ${titleBlock(route, { y: 292, fill: c.warmPaper, maxWidth: 560, sizes: [66, 70, 70] })}
      ${footer(route, { fill: c.warmPaper, noteFill: c.forest, noteText: c.warmPaper })}
    `,
    chain: `
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.myceliumInk}"/>
      <path d="M0 930 C260 780 448 972 650 820 C808 702 928 754 1080 690 L1080 1440 L0 1440 Z" fill="${c.forest}"/>
      ${card(600, 246, 330, 110, c.warmPaper, c.memoryLime)}
      ${text(634, 292, '问题', { fill: c.quietText, size: 24, weight: 740 })}
      ${text(634, 334, '我总在逃避吗？', { size: 30, weight: 850 })}
      ${card(656, 468, 314, 128, c.warmPaper, c.mistBorder)}
      ${text(690, 522, '当下记录', { fill: c.evidenceCoralDark, size: 25, weight: 850 })}
      ${text(690, 568, '拖到明天', { size: 30, weight: 850 })}
      ${card(586, 724, 366, 142, c.memoryLime, c.memoryLime)}
      ${text(622, 780, '反例记录', { size: 25, weight: 850 })}
      ${text(622, 828, '主动沟通过一次', { size: 30, weight: 850 })}
      <path d="M748 356 C748 424 780 432 780 468 M780 596 C780 666 748 672 748 724" fill="none" stroke="${c.memoryLime}" stroke-width="10" stroke-linecap="round"/>
      ${header(route, { fill: c.warmPaper, pillFill: c.memoryLime, pillText: c.myceliumInk })}
      ${titleBlock(route, { y: 288, fill: c.warmPaper, maxWidth: 480, sizes: [60, 68, 62] })}
      ${footer(route, { fill: c.warmPaper, noteFill: c.forest, noteText: c.warmPaper })}
    `,
    manifesto: `
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.brandPaper}"/>
      <rect x="0" y="0" width="174" height="${HEIGHT}" fill="${c.myceliumInk}"/>
      <rect x="174" y="0" width="32" height="${HEIGHT}" fill="${c.memoryLime}"/>
      ${text(748, 274, 'PRIVATE MEMORY SYSTEM', { fill: c.archiveGrey, size: 22, weight: 850, rotate: 90 })}
      ${text(748, 970, 'NOT AN AUTOPILOT', { fill: c.archiveGrey, size: 22, weight: 850, rotate: 90 })}
      ${mushroomMark(680, 844, .72)}
      ${header(route, { x: 246 })}
      ${titleBlock(route, { x: 246, y: 360, maxWidth: 700, sizes: [92, 92] })}
      ${footer(route)}
    `,
    debate: `
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.warmPaper}"/>
      <rect x="0" y="0" width="${WIDTH}" height="612" fill="${c.myceliumInk}"/>
      <circle cx="850" cy="300" r="172" fill="${c.memoryLime}" opacity=".98"/>
      <circle cx="850" cy="300" r="118" fill="none" stroke="${c.myceliumInk}" stroke-width="6"/>
      ${text(850, 290, 'AI', { size: 76, weight: 900, anchor: 'middle' })}
      ${text(850, 344, 'HOT', { size: 28, weight: 850, anchor: 'middle' })}
      ${card(612, 720, 330, 136, c.brandPaper, c.myceliumInk)}
      ${text(646, 774, '像懂你', { size: 34, weight: 850 })}
      ${card(668, 914, 330, 136, c.myceliumInk, c.myceliumInk)}
      ${text(702, 968, '有证据', { fill: c.warmPaper, size: 34, weight: 850 })}
      ${header(route, { fill: c.warmPaper, pillFill: c.memoryLime, pillText: c.myceliumInk })}
      ${titleBlock(route, { y: 282, fill: c.warmPaper, maxWidth: 580, sizes: [60, 70, 62] })}
      ${footer(route)}
    `,
    boundary: `
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.brandPaper}"/>
      <rect x="640" y="0" width="440" height="${HEIGHT}" fill="${c.archivePanel}"/>
      ${card(620, 312, 338, 172, c.warmPaper, c.mistBorder)}
      ${text(656, 374, '可确认', { size: 30, weight: 860 })}
      ${text(656, 424, '今天记录了疲惫', { size: 28, weight: 760 })}
      ${card(620, 548, 338, 172, c.warmPaper, c.evidenceCoral)}
      ${text(656, 610, '不能确认', { fill: c.evidenceCoralDark, size: 30, weight: 860 })}
      ${text(656, 660, '原因、诊断、趋势', { size: 28, weight: 760 })}
      <path d="M620 810 L958 810" stroke="${c.myceliumInk}" stroke-width="8" stroke-linecap="round"/>
      ${text(650, 872, '证据不够时，先停', { size: 30, weight: 850 })}
      ${header(route)}
      ${titleBlock(route, { y: 290, maxWidth: 560, sizes: [66, 76, 64] })}
      ${footer(route)}
    `,
    vault: `
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.brandPaper}"/>
      ${card(620, 304, 328, 456, c.myceliumInk, c.memoryLime, 36)}
      <rect x="676" y="378" width="216" height="256" rx="22" fill="${c.forest}" stroke="${c.memoryLime}" stroke-width="6"/>
      <rect x="724" y="474" width="122" height="104" rx="16" fill="${c.warmPaper}"/>
      <rect x="760" y="426" width="50" height="66" rx="25" fill="none" stroke="${c.warmPaper}" stroke-width="16"/>
      ${text(784, 838, '只在授权时使用', { size: 28, weight: 850, anchor: 'middle' })}
      ${header(route)}
      ${titleBlock(route, { y: 292, maxWidth: 560, sizes: [58, 76, 76] })}
      ${footer(route)}
    `,
    timeline: `
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.warmPaper}"/>
      <path d="M716 260 L716 930" stroke="${c.myceliumInk}" stroke-width="10" stroke-linecap="round"/>
      ${[[356, '23 天运动'], [566, '11 次复盘'], [776, '4 次重启']].map(([y, label]) => `
        <circle cx="716" cy="${y}" r="32" fill="${c.memoryLime}" stroke="${c.myceliumInk}" stroke-width="7"/>
        ${card(768, y - 42, 206, 78, c.brandPaper, c.mistBorder, 18)}
        ${text(798, y + 9, label, { size: 27, weight: 850 })}
      `).join('')}
      ${text(768, 904, '演示数据', { fill: c.archiveGrey, size: 24, weight: 760 })}
      ${header(route)}
      ${titleBlock(route, { y: 288, maxWidth: 570, sizes: [58, 72, 72] })}
      ${footer(route)}
    `,
    collage: `
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.brandPaper}"/>
      <rect x="642" y="286" width="284" height="394" rx="26" fill="${c.warmPaper}" stroke="${c.mistBorder}" stroke-width="4" transform="rotate(-8 784 483)"/>
      <rect x="704" y="418" width="264" height="360" rx="26" fill="${c.memoryLime}" transform="rotate(8 836 598)"/>
      ${card(620, 660, 346, 236, c.myceliumInk, c.myceliumInk, 28)}
      ${text(656, 726, '公开字段', { fill: c.warmPaper, size: 28, weight: 860 })}
      ${text(656, 780, '我的理解', { fill: c.warmPaper, size: 26, weight: 760 })}
      ${text(656, 826, '何时使用', { fill: c.warmPaper, size: 26, weight: 760 })}
      <path d="M562 540 C620 510 654 478 670 420" fill="none" stroke="${c.evidenceCoral}" stroke-width="8" stroke-linecap="round"/>
      ${header(route)}
      ${titleBlock(route, { y: 288, maxWidth: 570, sizes: [66, 76, 60] })}
      ${footer(route)}
    `,
    orbit: `
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.myceliumInk}"/>
      <circle cx="790" cy="570" r="262" fill="none" stroke="${c.memoryLime}" stroke-opacity=".34" stroke-width="3"/>
      <circle cx="790" cy="570" r="178" fill="none" stroke="${c.memoryLime}" stroke-opacity=".50" stroke-width="3"/>
      <circle cx="790" cy="570" r="88" fill="${c.forest}" stroke="${c.memoryLime}" stroke-width="5"/>
      <circle cx="906" cy="386" r="18" fill="${c.memoryLime}"/>
      <circle cx="612" cy="654" r="12" fill="${c.warmPaper}"/>
      ${card(700, 856, 256, 110, c.warmPaper, c.memoryLime, 24)}
      ${text(742, 922, '需要时想起', { size: 28, weight: 850 })}
      ${header(route, { fill: c.warmPaper, pillFill: c.memoryLime, pillText: c.myceliumInk })}
      ${titleBlock(route, { y: 288, fill: c.warmPaper, maxWidth: 570, sizes: [58, 70, 60] })}
      ${footer(route, { fill: c.warmPaper, noteFill: c.forest, noteText: c.warmPaper })}
    `
  };
  return scenes[route.style];
}

function coverSvg(route) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${scene(route)}
  </svg>`);
}

async function renderCover(route) {
  const output = path.join(outDir, route.output);
  await sharp(coverSvg(route)).png({ compressionLevel: 9 }).toFile(output);
  const meta = await sharp(output).metadata();
  if (meta.width !== WIDTH || meta.height !== HEIGHT || meta.format !== 'png') {
    throw new Error(`Invalid generated cover ${route.output}`);
  }
  return {
    id: route.id,
    file: route.output,
    width: meta.width,
    height: meta.height,
    sourceType: 'deterministic-svg-render',
    visualStyle: route.style,
    title: route.title.join(' / '),
    publicationState: 'NOT_PUBLISHED',
    publishReady: false
  };
}

async function renderContactSheet(files) {
  const thumbW = 270;
  const thumbH = 360;
  const gap = 24;
  const pad = 36;
  const labelH = 48;
  const sheetW = pad * 2 + thumbW * 5 + gap * 4;
  const sheetH = pad * 2 + (thumbH + labelH + 10) * 2 + gap;
  const composites = [];
  for (let index = 0; index < files.length; index += 1) {
    const x = pad + (index % 5) * (thumbW + gap);
    const y = pad + Math.floor(index / 5) * (thumbH + labelH + 10 + gap);
    const thumb = await sharp(path.join(outDir, files[index].file))
      .resize(thumbW, thumbH, { fit: 'cover' })
      .png()
      .toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${thumbW}" height="${labelH}">
      <rect width="${thumbW}" height="${labelH}" fill="${c.myceliumInk}"/>
      ${text(14, 31, files[index].id, { fill: c.warmPaper, size: 17, weight: 780 })}
    </svg>`);
    composites.push({ input: thumb, left: x, top: y });
    composites.push({ input: label, left: x, top: y + thumbH + 8 });
  }
  await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: c.brandPaper
    }
  }).composite(composites).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'contact-sheet.png'));
}

async function main() {
  ensureDir(outDir);
  const files = [];
  for (const route of routes) files.push(await renderCover(route));
  await renderContactSheet(files);
  const manifest = {
    batch,
    brandTokenVersion: tokens.version,
    visualSystem: 'SHROOM_BRAND_REVIEW_10_DISTINCT_V2',
    generatedAt: new Date().toISOString(),
    publicationState: 'NOT_PUBLISHED',
    publishReady: false,
    generatedAssetDisclosure: '本批次封面全部由确定性 SVG + Sharp 渲染；未使用图片模型生成中文。旧 AI 生成底图仅保留在 sources/ 供追溯，本版封面不依赖它们。',
    reviewInstruction: '供 CEO 内审选择方向；不得直接发布。涉及产品能力的内页必须替换为真实演示截图或明确标注概念示意。',
    colors: {
      myceliumInk: c.myceliumInk,
      brandPaper: c.brandPaper,
      livingPaper: c.livingPaper,
      memoryLime: c.memoryLime,
      warmPaper: c.warmPaper,
      evidenceCoral: c.evidenceCoral
    },
    routes: files,
    contactSheet: 'contact-sheet.png'
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${files.map(item => `${item.id}: ${item.file}`).join('\n')}\ncontact-sheet.png\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
