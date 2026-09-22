'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../server/node_modules/sharp');

const WIDTH = 1080;
const HEIGHT = 1440;
const root = path.join(__dirname, '..');
const dir = path.join(root, 'artifacts', 'xiaohongshu', 'shroom-official-visual-v2');

const covers = [
  {
    code: 'xhs-past-helps-today-001',
    source: 'memory-keeper-conflict-source.png',
    output: '01-past-helps-today-cover-v2.png',
    ink: '#172019',
    light: false,
    series: '菇在找证据 · 01',
    title: [
      { text: 'AI 说我', size: 72 },
      { text: '总在逃避', size: 104 },
      { text: '三个月前的日记', size: 65 },
      { text: '不同意', size: 104 }
    ],
    note: '一条反例  >  一句聪明总结'
  },
  {
    code: 'xhs-one-diary-finds-001',
    source: 'memory-keeper-clue-source.png',
    output: '02-one-diary-cover-v2.png',
    ink: '#172019',
    light: false,
    series: '一条日记能知道什么 · 01',
    title: [
      { text: '只写一句', size: 72 },
      { text: '“今天好累”', size: 95 },
      { text: 'AI 能知道多少？', size: 69 }
    ],
    note: '线索不是诊断  /  不确定也是答案'
  },
  {
    code: 'xhs-building-shroom-001',
    source: 'memory-keeper-ai-hot-source.png',
    output: '03-ai-hot-cover-v2.png',
    ink: '#FBF7EA',
    light: true,
    series: '热点｜菇有话说',
    title: [
      { text: 'AI 越来越聪明', size: 75 },
      { text: '我们真的', size: 95 },
      { text: '更懂自己了吗？', size: 75 }
    ],
    note: '聪明回答  ≠  自我理解'
  }
];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function titleSvg(item) {
  let cursor = 300;
  const title = item.title.map(line => {
    const result = `<text x="64" y="${cursor}" fill="${item.ink}" font-family="PingFang SC, Heiti SC, sans-serif" font-size="${line.size}" font-weight="800" letter-spacing="-2">${escapeXml(line.text)}</text>`;
    cursor += Math.round(line.size * 1.16);
    return result;
  }).join('');
  const labelColor = item.light ? '#172019' : '#FBF7EA';
  const labelFill = item.light ? '#DDEC4A' : '#172019';
  const noteFill = item.light ? '#FBF7EA' : '#172019';
  const noteBox = item.light ? 'rgba(23,32,25,.78)' : 'rgba(251,247,234,.86)';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <defs>
      <linearGradient id="shade" x1="0" x2="1">
        <stop offset="0" stop-color="${item.light ? '#172019' : '#FBF7EA'}" stop-opacity="${item.light ? '.62' : '.28'}"/>
        <stop offset=".58" stop-color="${item.light ? '#172019' : '#FBF7EA'}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="720" height="${HEIGHT}" fill="url(#shade)"/>
    <text x="64" y="78" fill="${item.ink}" font-family="Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="5">SHROOM / 菇日记</text>
    <rect x="64" y="125" width="${Math.max(245, item.series.length * 27)}" height="60" rx="30" fill="${labelFill}"/>
    <text x="92" y="164" fill="${labelColor}" font-family="PingFang SC, Heiti SC, sans-serif" font-size="23" font-weight="750" letter-spacing="1">${escapeXml(item.series)}</text>
    ${title}
    <rect x="64" y="1100" width="${Math.max(430, item.note.length * 29)}" height="82" rx="18" fill="${noteBox}"/>
    <text x="92" y="1152" fill="${noteFill}" font-family="PingFang SC, Heiti SC, sans-serif" font-size="28" font-weight="700">${escapeXml(item.note)}</text>
    <text x="64" y="1368" fill="${item.ink}" fill-opacity=".78" font-family="PingFang SC, Heiti SC, sans-serif" font-size="20" font-weight="650" letter-spacing="1">记忆管理员菇  /  让过去在今天派上用场</text>
  </svg>`);
}

async function renderCover(item) {
  const source = path.join(dir, item.source);
  const output = path.join(dir, item.output);
  await sharp(source)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
    .composite([{ input: titleSvg(item), top: 0, left: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(output);
  const meta = await sharp(output).metadata();
  if (meta.width !== WIDTH || meta.height !== HEIGHT || meta.format !== 'png') {
    throw new Error(`Invalid cover ${item.output}`);
  }
  return { code: item.code, file: item.output, width: meta.width, height: meta.height };
}

async function main() {
  const files = [];
  for (const item of covers) files.push(await renderCover(item));
  const manifest = {
    visualSystem: 'SHROOM_MEMORY_KEEPER_V2',
    version: '2026-09-18-v2',
    purpose: 'Xiaohongshu official-account recognition and thumbnail appeal',
    recurringCharacter: {
      role: '记忆管理员菇',
      invariants: ['深森林绿不对称菌盖', '菌盖上的荧光记忆标签', '暖白身体', '黑色椭圆眼睛', '严肃又略带怀疑的表情']
    },
    benchmarkMechanisms: {
      Duolingo: '固定角色与可重复情绪反应',
      BaiduMaps: '一个具体生活时刻只证明一个功能',
      AntForest: '让长期积累变成可见的记忆卡片',
      Apple: '强主体、少信息、产品判断本身成为画面',
      flomo: '最终回到真实记录方法与用户经验'
    },
    generatedAssetDisclosure: '角色与场景由 AI 生成，中文标题由确定性排版生成；发布时使用平台 AI 内容声明。',
    contentEvidenceStatus: 'PENDING_REAL_PRODUCT_SCREENSHOTS_FOR_INNER_PAGES',
    publicationState: 'NOT_PUBLISHED',
    publishReady: false,
    files
  };
  fs.writeFileSync(path.join(dir, 'manifest-v2.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${files.map(item => `${item.code}: ${item.file}`).join('\n')}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
