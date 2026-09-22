'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../server/node_modules/sharp');

const WIDTH = 1080;
const HEIGHT = 1440;
const root = path.join(__dirname, '..');
const outputRoot = path.join(root, 'artifacts', 'xiaohongshu');

const palette = {
  ink: '#172019',
  forest: '#405646',
  moss: '#6F8067',
  paper: '#FBFCF7',
  mist: '#F1F8E9',
  lime: '#DDEC8C',
  line: '#DDE7D7',
  clay: '#D96F53',
  warm: '#F5EFE6',
  sky: '#DCE8E3'
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textLines(items, options = {}) {
  const {
    x = 84, y = 300, size = 68, lineHeight = 1.25, weight = 720,
    fill = palette.ink, family = 'PingFang SC, Heiti SC, sans-serif',
    anchor = 'start', maxWidth = 900
  } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}">${items.map((item, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : Math.round(size * lineHeight)}" textLength="${Math.min(maxWidth, String(item).length * size)}" lengthAdjust="spacingAndGlyphs">${escapeXml(item)}</tspan>`).join('')}</text>`;
}

function plainText(value, x, y, options = {}) {
  return `<text x="${x}" y="${y}" fill="${options.fill || palette.moss}" font-family="PingFang SC, Heiti SC, sans-serif" font-size="${options.size || 24}" font-weight="${options.weight || 650}" letter-spacing="${options.spacing == null ? 1 : options.spacing}">${escapeXml(value)}</text>`;
}

function frame(post, page, background = palette.mist) {
  const dark = background === palette.ink;
  return `
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${background}"/>
    <rect x="58" y="58" width="964" height="1324" rx="42" fill="none" stroke="${dark ? '#FFFFFF' : palette.ink}" stroke-opacity="0.09" stroke-width="2"/>
    ${plainText('SHROOM / 菇日记', 84, 108, { size: 21, fill: dark ? '#D9E3D6' : palette.forest, spacing: 3 })}
    ${plainText(post.column, 84, 148, { size: 18, fill: dark ? '#AFC0AC' : palette.moss, spacing: 1.2 })}
    ${plainText(`${String(page).padStart(2, '0')} / 07`, 890, 108, { size: 19, fill: dark ? '#AFC0AC' : palette.moss, spacing: 2 })}
    ${plainText('AI 辅助整理 · 演示数据', 84, 1344, { size: 18, fill: dark ? '#829280' : '#8B9889', spacing: 1.1 })}
  `;
}

function svg(post, page, content, background = palette.mist) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${frame(post, page, background)}${content}</svg>`;
}

function pill(value, x, y, options = {}) {
  const width = options.width || Math.max(150, String(value).length * 28 + 64);
  const fill = options.fill || palette.paper;
  const color = options.color || palette.ink;
  return `<g><rect x="${x}" y="${y}" width="${width}" height="66" rx="33" fill="${fill}" stroke="${palette.ink}" stroke-opacity="0.08"/><text x="${x + width / 2}" y="${y + 42}" text-anchor="middle" fill="${color}" font-family="PingFang SC, Heiti SC, sans-serif" font-size="23" font-weight="650">${escapeXml(value)}</text></g>`;
}

function note(date, copy, x, y, options = {}) {
  const width = options.width || 830;
  const accent = options.accent || palette.lime;
  const rows = Array.isArray(copy) ? copy : [copy];
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${options.height || 230}" rx="34" fill="${options.dark ? '#253129' : palette.paper}" stroke="${options.dark ? '#FFFFFF' : palette.ink}" stroke-opacity="0.1" stroke-width="2"/>
    <circle cx="${x + 48}" cy="${y + 49}" r="10" fill="${accent}"/>
    ${plainText(date, x + 74, y + 58, { size: 20, fill: options.dark ? '#B8C8B5' : palette.moss })}
    ${textLines(rows, { x: x + 42, y: y + 128, size: options.size || 34, lineHeight: 1.35, weight: 600, fill: options.dark ? '#F5F8F1' : palette.ink, maxWidth: width - 84 })}
  </g>`;
}

function checklist(items, startY = 600, options = {}) {
  return items.map((item, index) => {
    const y = startY + index * (options.gap || 142);
    const active = options.active === index;
    return `<g>
      <rect x="84" y="${y}" width="912" height="112" rx="30" fill="${active ? palette.ink : palette.paper}" stroke="${palette.ink}" stroke-opacity="0.08"/>
      <circle cx="143" cy="${y + 56}" r="20" fill="${active ? palette.lime : options.accent || palette.lime}"/>
      <path d="M133 ${y + 56} l8 8 l16 -19" fill="none" stroke="${palette.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="190" y="${y + 68}" fill="${active ? '#F5F8F1' : palette.ink}" font-family="PingFang SC, Heiti SC, sans-serif" font-size="31" font-weight="620">${escapeXml(item)}</text>
    </g>`;
  }).join('');
}

function cover(post, lines, kicker, subtitle, accent = palette.lime, background = palette.mist) {
  return svg(post, 1, `
    <circle cx="858" cy="296" r="176" fill="${accent}" fill-opacity="0.9"/>
    <circle cx="858" cy="296" r="116" fill="${background}"/>
    ${plainText(kicker, 84, 250, { size: 24, fill: palette.forest, spacing: 1.2 })}
    ${textLines(lines, { x: 84, y: 390, size: 78, lineHeight: 1.23, weight: 760, maxWidth: 875 })}
    <rect x="84" y="930" width="912" height="224" rx="38" fill="${palette.ink}"/>
    ${textLines(subtitle, { x: 132, y: 1022, size: 32, lineHeight: 1.5, weight: 560, fill: '#F5F8F1', maxWidth: 815 })}
  `, background);
}

function closing(post, accent = palette.lime) {
  return svg(post, 7, `
    <circle cx="846" cy="307" r="218" fill="${accent}" fill-opacity="0.92"/>
    <circle cx="846" cy="307" r="145" fill="${palette.mist}"/>
    ${plainText('最后想问你', 84, 250, { size: 25, fill: palette.forest })}
    ${textLines(['如果能从过去的记录里', '重新找到一件事，', '你最想弄明白什么？'], { x: 84, y: 390, size: 64, lineHeight: 1.27, weight: 760, maxWidth: 880 })}
    <rect x="84" y="875" width="912" height="214" rx="42" fill="${palette.ink}"/>
    ${textLines(['让过去的经历，', '在需要时真正帮到你。'], { x: 132, y: 960, size: 39, lineHeight: 1.45, weight: 620, fill: '#F5F8F1', maxWidth: 810 })}
  `);
}

const posts = [
  {
    code: 'xhs-past-helps-today-001',
    column: '过去怎样在今天帮到我',
    accent: palette.lime,
    pages: post => [
      cover(post, ['AI 说“你总在逃避”', '三个月前的日记', '却不同意'], '一条反例，可能更重要', ['最近一次行为，', '不等于一个人的长期模式。'], palette.lime),
      svg(post, 2, `
        ${plainText('今天的记录', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['只看这一篇，', '结论很容易变成：', '“我总是在逃避。”'], { x: 84, y: 350, size: 68, lineHeight: 1.28, weight: 740 })}
        ${note('演示日记 · 今天', ['我又把一次难谈的沟通', '拖到了明天。'], 125, 820, { width: 830, accent: palette.clay })}
      `),
      svg(post, 3, `
        ${plainText('过去的反例', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['但三个月前，', '还有另一条记录'], { x: 84, y: 350, size: 72, lineHeight: 1.28, weight: 740 })}
        ${note('演示日记 · 05 / 18', ['我先约了对方，', '把分歧和下一步一次说清。'], 125, 720, { width: 830, accent: palette.lime })}
        ${pill('一条真实反例', 125, 1028, { width: 258, fill: palette.lime })}
      `),
      svg(post, 4, `
        ${plainText('更可靠的判断', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['顺耳的总结，', '不等于证据完整'], { x: 84, y: 350, size: 74, lineHeight: 1.28, weight: 740 })}
        <path d="M140 735 C320 650 430 850 604 755 C750 675 845 790 944 705" fill="none" stroke="${palette.clay}" stroke-width="10" stroke-linecap="round"/>
        <circle cx="140" cy="735" r="28" fill="${palette.clay}"/><circle cx="604" cy="755" r="28" fill="${palette.lime}"/><circle cx="944" cy="705" r="28" fill="${palette.forest}"/>
        ${textLines(['一次推迟', '一次主动', '都应留下'], { x: 84, y: 960, size: 38, lineHeight: 1.55, weight: 560, fill: palette.forest })}
      `),
      svg(post, 5, `
        ${plainText('Shroom 带回什么', 84, 244, { size: 25, fill: '#B8C8B5' })}
        ${textLines(['不是一句性格判断，', '而是一组可核对的来源'], { x: 84, y: 360, size: 66, lineHeight: 1.3, weight: 720, fill: '#F6F8F1' })}
        ${checklist(['相关日期与原文', '相似经历', '支持证据与反例', '用户可以纠正解释'], 700, { active: 3 })}
      `, palette.ink),
      svg(post, 6, `
        ${plainText('当前只能说到这里', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['这一次，', '确实推迟了沟通。'], { x: 84, y: 360, size: 73, lineHeight: 1.28, weight: 740 })}
        <rect x="84" y="690" width="912" height="320" rx="42" fill="${palette.paper}" stroke="${palette.ink}" stroke-opacity="0.08"/>
        ${textLines(['过去也有主动处理的记录。', '证据不支持“你总是如此”。'], { x: 132, y: 812, size: 39, lineHeight: 1.65, weight: 590, fill: palette.forest, maxWidth: 810 })}
        ${plainText('少一点确定，多一点真实。', 132, 1110, { size: 27, fill: palette.moss })}
      `),
      closing(post, palette.lime)
    ]
  },
  {
    code: 'xhs-one-diary-finds-001',
    column: '一条日记能发现什么',
    accent: palette.sky,
    pages: post => [
      cover(post, ['日记里只写了', '“今天好累”', 'AI 到底能知道什么？'], '一条日记的边界', ['能记录线索，', '不能凭一句话下诊断。'], palette.sky, palette.warm),
      svg(post, 2, `
        ${plainText('能确认的事实', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['今天，本人记录了', '明显的疲惫。'], { x: 84, y: 370, size: 76, lineHeight: 1.3, weight: 750 })}
        ${note('演示日记 · 今天', ['今天好累。'], 125, 760, { width: 830, height: 210, accent: palette.sky, size: 42 })}
        ${plainText('原文事实，不需要加工成更专业的词。', 125, 1060, { size: 27, fill: palette.moss })}
      `, palette.warm),
      svg(post, 3, `
        ${plainText('不能确认的原因', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['一句“好累”，', '不能直接等于任何诊断'], { x: 84, y: 360, size: 69, lineHeight: 1.3, weight: 740 })}
        ${pill('睡眠', 84, 695, { width: 198, fill: palette.sky })}
        ${pill('工作负荷', 306, 695, { width: 248 })}
        ${pill('情绪状态', 578, 695, { width: 248 })}
        ${pill('身体不适', 84, 795, { width: 248 })}
        ${pill('其他因素', 356, 795, { width: 248 })}
        ${plainText('它们都只是待核对的可能性。', 84, 1015, { size: 31, fill: palette.forest })}
      `, palette.warm),
      svg(post, 4, `
        ${plainText('下一步最值得记录', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['不是更快下结论，', '而是补上关键变化'], { x: 84, y: 355, size: 70, lineHeight: 1.28, weight: 740 })}
        ${checklist(['出现了多久', '最近睡了多久', '休息后是否缓解', '有没有影响日常'], 660, { accent: palette.sky })}
      `, palette.warm),
      svg(post, 5, `
        ${plainText('Shroom 分开保存', 84, 244, { size: 25, fill: '#B8C8B5' })}
        ${textLines(['观察、可能性、', '缺失信息，不混成一句话'], { x: 84, y: 360, size: 66, lineHeight: 1.3, weight: 720, fill: '#F6F8F1' })}
        ${checklist(['原文观察', '可能相关因素', '仍缺的信息', '下一步记录建议'], 690, { active: 0, accent: palette.sky })}
      `, palette.ink),
      svg(post, 6, `
        ${plainText('它提供的是观察线索', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['不是医学诊断，', '也不替代专业评估'], { x: 84, y: 365, size: 73, lineHeight: 1.28, weight: 750 })}
        <rect x="84" y="710" width="912" height="310" rx="42" fill="${palette.paper}" stroke="${palette.ink}" stroke-opacity="0.08"/>
        ${textLines(['如果持续、加重或影响生活，', '应寻求合适的专业帮助。'], { x: 132, y: 835, size: 40, lineHeight: 1.6, weight: 590, fill: palette.forest, maxWidth: 810 })}
      `, palette.warm),
      closing(post, palette.sky)
    ]
  },
  {
    code: 'xhs-building-shroom-001',
    column: '做菇的人',
    accent: palette.clay,
    pages: post => [
      cover(post, ['做 AI 日记时', '我放弃了一句', '很有卖点的话'], '一个真实产品取舍', ['“AI 比你更懂你”', '听起来很强，但我决定不用。'], palette.clay, palette.warm),
      svg(post, 2, `
        ${plainText('这句话为什么诱人', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['只要持续写，', 'AI 就能看穿模式，', '告诉你真正的问题。'], { x: 84, y: 360, size: 70, lineHeight: 1.27, weight: 740 })}
        <rect x="84" y="835" width="912" height="176" rx="38" fill="${palette.ink}"/>
        ${textLines(['它很像魔法，也很像一个承诺。'], { x: 132, y: 940, size: 36, weight: 590, fill: '#F5F8F1', maxWidth: 810 })}
      `, palette.warm),
      svg(post, 3, `
        ${plainText('问题是：日记本来就不完整', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['一次沉默、一次疲惫、', '一次冲突，', '都可能只是当时的情境。'], { x: 84, y: 355, size: 68, lineHeight: 1.3, weight: 740 })}
        ${note('局部记录', ['不是完整的人生，', '更不是固定的人格。'], 125, 845, { width: 830, accent: palette.clay })}
      `, palette.warm),
      svg(post, 4, `
        ${plainText('流畅不等于完整', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['如果没有来源和反例，', '“更懂你”很容易变成', '“更会给你贴标签”'], { x: 84, y: 355, size: 65, lineHeight: 1.3, weight: 740 })}
        <path d="M142 918 L938 918" stroke="${palette.clay}" stroke-width="10" stroke-linecap="round"/>
        <circle cx="142" cy="918" r="25" fill="${palette.clay}"/><circle cx="938" cy="918" r="25" fill="${palette.lime}"/>
        ${plainText('从一句断言 → 回到可核对的证据', 142, 1015, { size: 29, fill: palette.forest })}
      `, palette.warm),
      svg(post, 5, `
        ${plainText('所以，菇给 AI 四条规矩', 84, 244, { size: 25, fill: '#B8C8B5' })}
        ${textLines(['重要判断，', '必须经得起核对'], { x: 84, y: 365, size: 71, lineHeight: 1.28, weight: 730, fill: '#F6F8F1' })}
        ${checklist(['回到日期与原文', '事实、解释、假设分开', '主动寻找反例', '证据不足就说不知道'], 690, { active: 3, accent: palette.clay })}
      `, palette.ink),
      svg(post, 6, `
        ${plainText('少一点“魔法感”', 84, 244, { size: 25, fill: palette.forest })}
        ${textLines(['把最终解释权，', '留给记录者'], { x: 84, y: 365, size: 77, lineHeight: 1.3, weight: 750 })}
        <rect x="84" y="730" width="912" height="284" rx="42" fill="${palette.paper}" stroke="${palette.ink}" stroke-opacity="0.08"/>
        ${textLines(['你可以说：', '“不是同一件事” / “解释不对”'], { x: 132, y: 840, size: 38, lineHeight: 1.65, weight: 590, fill: palette.forest, maxWidth: 810 })}
        ${plainText('这比一句漂亮结论更重要。', 132, 1110, { size: 28, fill: palette.moss })}
      `, palette.warm),
      closing(post, palette.clay)
    ]
  }
];

async function renderPost(post) {
  const outputDir = path.join(outputRoot, post.code);
  fs.mkdirSync(outputDir, { recursive: true });
  const pages = post.pages(post);
  const files = [];
  for (let index = 0; index < pages.length; index += 1) {
    const filename = `${String(index + 1).padStart(2, '0')}.png`;
    const output = path.join(outputDir, filename);
    await sharp(Buffer.from(pages[index])).png({ compressionLevel: 9 }).toFile(output);
    const metadata = await sharp(output).metadata();
    if (metadata.width !== WIDTH || metadata.height !== HEIGHT || metadata.format !== 'png') {
      throw new Error(`Invalid render ${post.code}/${filename}: ${metadata.width}x${metadata.height} ${metadata.format}`);
    }
    files.push({ filename, width: metadata.width, height: metadata.height, format: metadata.format });
  }
  const manifest = {
    experiment: 'xhs-shroom-columns-001',
    contentCode: post.code,
    column: post.column,
    version: '2026-09-18-v2',
    pageCount: pages.length,
    width: WIDTH,
    height: HEIGHT,
    copySource: 'docs/XIAOHONGSHU_PILOT_001.md',
    aiIllustrationUsed: false,
    aiAssistedCopy: true,
    visualQaStatus: 'PASS',
    contentEvidenceStatus: 'PENDING_REAL_DEMO_SCREENSHOTS',
    publishReady: false,
    publicationState: 'NOT_PUBLISHED',
    files
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { post, outputDir, pages: pages.length };
}

async function main() {
  const rendered = [];
  for (const post of posts) rendered.push(await renderPost(post));
  process.stdout.write(`${rendered.map(item => `${item.post.code}: ${item.pages} pages → ${item.outputDir}`).join('\n')}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
