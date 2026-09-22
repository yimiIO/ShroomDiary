'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

const root = path.join(__dirname, '..', '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const readJson = relative => JSON.parse(source(relative));

test('Shroom brand system locks the five core colors and contrast gates', () => {
  const tokens = readJson('docs/brand/shroom-color-tokens.json');
  const brand = source('docs/SHROOM_BRAND_SYSTEM.md');

  assert.deepEqual({
    myceliumInk: tokens.primitives.myceliumInk,
    brandPaper: tokens.primitives.brandPaper,
    livingPaper: tokens.primitives.livingPaper,
    memoryLime: tokens.primitives.memoryLime,
    warmPaper: tokens.primitives.warmPaper,
    evidenceCoral: tokens.primitives.evidenceCoral
  }, {
    myceliumInk: '#172019',
    brandPaper: '#E9F1E1',
    livingPaper: '#F1F8E9',
    memoryLime: '#DDEC8C',
    warmPaper: '#FFFDF7',
    evidenceCoral: '#D86246'
  });

  for (const key of [
    'textPrimaryOnSurfaceApp',
    'textPrimaryOnSurfaceCampaign',
    'textPrimaryOnMemoryLime',
    'textPrimaryOnMemoryFlash',
    'textSecondaryOnSurfaceApp',
    'textSecondaryOnSurfaceCampaign',
    'whiteOnMoss',
    'textPrimaryOnEvidenceCoral',
    'onEvidenceCautionOnEvidenceCaution'
  ]) {
    assert.ok(tokens.contrast[key] >= 4.5, `${key} should be readable for normal text`);
  }
  assert.ok(tokens.contrast.archiveGreyOnSurfaceApp < 4.5);
  assert.ok(tokens.contrast.archiveGreyOnSurfaceCampaign < 4.5);
  assert.match(brand, /Archive Grey/);
  assert.match(brand, /`#718075` \/ `#F1F8E9` \| 3\.83 \| 只允许大字、元信息或非正文/);
  assert.match(brand, /`#172019` \/ `#E9F1E1` \| 14\.43/);
  assert.match(brand, /正式 logo \/ App 图标源文件优先于宣发角色/);
  assert.match(brand, /封面暂不使用有表情的小脸蘑菇作为主角/);
  assert.match(brand, /MISSING_SOURCE/);
  assert.match(brand, /正式 App 图标源文件/);
  assert.match(brand, /Memory Flash \/ 传播闪色/);
  assert.match(brand, /单张画面占比不超过 25%/);
});

test('brand review batch contains ten unpublished 3:4 Xiaohongshu covers', async () => {
  const manifest = readJson('artifacts/xiaohongshu/shroom-brand-review-10/manifest.json');
  const reviewDoc = source('docs/XIAOHONGSHU_BRAND_REVIEW_10.md');
  const renderer = source('scripts/render-shroom-brand-review-10.js');

  assert.equal(manifest.batch, 'xhs-brand-review-10-001');
  assert.equal(manifest.publicationState, 'NOT_PUBLISHED');
  assert.equal(manifest.publishReady, false);
  assert.equal(manifest.routes.length, 10);
  assert.equal(new Set(manifest.routes.map(route => route.id)).size, 10);
  assert.equal(manifest.generatedAssetDisclosure.includes('AI 生成'), true);
  assert.match(renderer, /docs\/brand\/shroom-color-tokens\.json/);
  assert.match(renderer, /brandPaper/);
  assert.match(renderer, /mushroomMark/);
  assert.doesNotMatch(renderer, /function mushroom\(/);
  assert.doesNotMatch(renderer, /r="8" fill="\$\\{c\.myceliumInk\\}"/);
  assert.doesNotMatch(source('artifacts/xiaohongshu/shroom-brand-review-10/manifest.json'), /"publishReady": true/);

  for (const id of [
    '01-evidence-reversal',
    '02-emotional-recognition',
    '03-product-proof',
    '04-manifesto',
    '05-cultural-hotspot',
    '06-professional-boundary',
    '07-privacy-position',
    '08-positive-reframe',
    '09-social-card',
    '10-future-companion'
  ]) {
    assert.match(reviewDoc, new RegExp(id.replace(/^\d+-/, '')));
    assert.ok(manifest.routes.some(route => route.id === id), `${id} should be in manifest`);
  }

  for (const route of manifest.routes) {
    const file = path.join(root, 'artifacts/xiaohongshu/shroom-brand-review-10', route.file);
    assert.equal(fs.existsSync(file), true);
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1440);
    assert.equal(meta.format, 'png');
    assert.equal(route.width, 1080);
    assert.equal(route.height, 1440);
    assert.equal(route.publicationState, 'NOT_PUBLISHED');
    assert.equal(route.publishReady, false);
  }

  const sheet = path.join(root, 'artifacts/xiaohongshu/shroom-brand-review-10', manifest.contactSheet);
  assert.equal(fs.existsSync(sheet), true);
  const sheetMeta = await sharp(sheet).metadata();
  assert.equal(sheetMeta.format, 'png');
  assert.ok(sheetMeta.width > 1080);
  assert.ok(sheetMeta.height > 720);
});

test('current social visual system points to the finalized brand tokens and review batch', () => {
  const system = source('docs/XIAOHONGSHU_HOTSPOT_AND_VISUAL_SYSTEM.md');
  const readme = source('docs/README.md');
  const identity = source('docs/SHROOM_BRAND_IDENTITY_AGENT.md');
  const migration = source('server/sql/052_shroom_brand_and_xhs_review_10.sql');
  const revision = source('server/sql/053_shroom_brand_review_10_distinct_v2.sql');
  const logoDecision = source('server/sql/054_shroom_brand_logo_shape_decision.sql');
  const identityDecision = source('server/sql/055_shroom_brand_identity_concepts.sql');
  const mascotDecision = source('server/sql/056_shroom_mascot_ip_agent.sql');

  assert.match(system, /SHROOM_BRAND_SYSTEM\.md/);
  assert.match(system, /菌丝墨绿/);
  assert.match(system, /Brand Paper/);
  assert.match(system, /活纸雾绿/);
  assert.match(system, /记忆黄绿/);
  assert.match(system, /Memory Flash/);
  assert.match(system, /xhs-brand-review-10-001/);
  assert.match(system, /不再生成或强化有表情的小脸蘑菇/);
  assert.match(system, /NOT_PUBLISHED/);
  assert.match(readme, /SHROOM_BRAND_SYSTEM\.md/);
  assert.match(readme, /SHROOM_BRAND_IDENTITY_AGENT\.md/);
  assert.match(readme, /SHROOM_MASCOT_IP_AGENT\.md/);
  assert.match(readme, /XIAOHONGSHU_BRAND_REVIEW_10\.md/);
  assert.match(migration, /'shroom-brand-steward'/);
  assert.match(migration, /xhs-brand-review-10-001/);
  assert.match(migration, /"publicationState":"NOT_PUBLISHED"/);
  assert.match(migration, /"publishReady":false/);
  assert.match(migration, /"canPublish": false/);
  assert.match(migration, /"iconSourceStatus": "MISSING_SOURCE"/);
  assert.match(revision, /SHROOM_BRAND_REVIEW_10_DISTINCT_V2/);
  assert.match(revision, /NO_TEXT_OVERLAP/);
  assert.match(revision, /USE_SHROOM_BRAND_TOKENS/);
  assert.match(revision, /TEN_DISTINCT_VISUAL_STRATEGIES/);
  assert.match(revision, /NOT_PUBLISHED/);
  assert.match(logoDecision, /FORMAL_LOGO_SOURCE_OVERRIDES_TEMPORARY_MUSHROOM_CHARACTER/);
  assert.match(logoDecision, /#E9F1E1/);
  assert.match(logoDecision, /PAUSED_AS_FORMAL_IP/);
  assert.match(logoDecision, /FACELESS_MUSHROOM_SILHOUETTE/);
  assert.match(logoDecision, /canUseSmallFaceMushroomAsOfficialLogo":false/);
  assert.match(identityDecision, /shroom-identity-concepts-001/);
  assert.match(identityDecision, /AVATAR_KINSHIP_PLUS_DISTINCTIVE_MEMORY_STRUCTURE/);
  assert.match(identityDecision, /02-shroom-s-negative-space/);
  assert.match(identityDecision, /05-folded-card-mushroom/);
  assert.match(identityDecision, /06-seal-monogram/);
  assert.match(identityDecision, /requiresProfessionalTrademarkSearch":true/);
  assert.match(identityDecision, /SMALL_FACE_MUSHROOM_AS_FORMAL_IP/);
  assert.match(mascotDecision, /shroom-mascot-ip-v1/);
  assert.match(mascotDecision, /记忆管理员菇/);
  assert.match(mascotDecision, /MASCOT_IP_SEPARATE_FROM_TRADEMARK_LOGO/);
  assert.match(mascotDecision, /memory-detective-mushroom/);
  assert.match(mascotDecision, /diary-gremlin-mushroom/);
  assert.match(mascotDecision, /fixedBehaviors/);
  assert.match(mascotDecision, /DUOLINGO_OWL_SIMILARITY/);

  assert.match(identity, /头像、商标图形、运营角色/);
  assert.match(identity, /02 S 形负空间/);
  assert.match(identity, /05 折角卡片菇/);
  assert.match(identity, /06 印章式 S 菇/);
  assert.match(identity, /当前不建议继续用“小脸蘑菇”做正式品牌形象/);
});

test('brand identity concepts are vector-first and include six internal review marks', async () => {
  const manifest = readJson('artifacts/brand/shroom-identity-concepts/manifest.json');
  const renderer = source('scripts/render-shroom-brand-identity-concepts.js');

  assert.equal(manifest.batch, 'shroom-identity-concepts-001');
  assert.equal(manifest.items.length, 6);
  assert.deepEqual(manifest.recommendedShortlist, [
    '02-shroom-s-negative-space',
    '05-folded-card-mushroom',
    '06-seal-monogram'
  ]);
  assert.match(renderer, /Design exploration only/);
  assert.match(renderer, /S 形负空间/);
  assert.match(renderer, /折角卡片菇/);
  assert.match(renderer, /印章式 S 菇/);

  for (const item of manifest.items) {
    const png = path.join(root, 'artifacts/brand/shroom-identity-concepts', item.file);
    const svg = path.join(root, 'artifacts/brand/shroom-identity-concepts', item.svg);
    assert.equal(fs.existsSync(png), true);
    assert.equal(fs.existsSync(svg), true);
    const meta = await sharp(png).metadata();
    assert.equal(meta.width, 1024);
    assert.equal(meta.height, 1024);
    assert.equal(item.status, 'INTERNAL_REVIEW_NOT_TRADEMARK_ADVICE');
  }

  assert.equal(fs.existsSync(path.join(root, 'artifacts/brand/shroom-identity-concepts/contact-sheet.png')), true);
});

test('mascot IP separates social character acting from formal trademark logo', async () => {
  const mascotDoc = source('docs/SHROOM_MASCOT_IP_AGENT.md');
  const manifest = readJson('artifacts/brand/shroom-mascot-ip-v1/manifest.json');
  const asset = path.join(root, 'artifacts/brand/shroom-mascot-ip-v1', manifest.asset);

  assert.match(mascotDoc, /卡通 IP/);
  assert.match(mascotDoc, /多邻国/);
  assert.match(mascotDoc, /游戏官方号/);
  assert.match(mascotDoc, /记忆侦探菇/);
  assert.match(mascotDoc, /日记捣蛋菇/);
  assert.match(mascotDoc, /找：从旧日记里找证据/);
  assert.match(mascotDoc, /Logo \/ 商标/);
  assert.match(mascotDoc, /卡通 IP 不替代商标图形/);

  assert.equal(manifest.batch, 'shroom-mascot-ip-v1');
  assert.equal(manifest.status, 'INTERNAL_REVIEW_NOT_PUBLISHED');
  assert.equal(manifest.roleName, '记忆管理员菇');
  assert.equal(manifest.workingNickname, '小菇');
  assert.equal(manifest.principle, 'Mascot IP is separate from trademark logo: use cartoon personality for social growth, keep logo for formal recognition.');
  assert.equal(manifest.publishReady, false);
  assert.equal(manifest.directions.length, 4);
  assert.ok(manifest.directions.some(direction => direction.id === 'memory-detective-mushroom' && direction.recommendation === 'PRIMARY_CHARACTER_BASE'));
  assert.ok(manifest.directions.some(direction => direction.id === 'diary-gremlin-mushroom' && direction.recommendation === 'SOCIAL_EXPRESSION_MODE'));
  assert.ok(manifest.mustAvoid.includes('Duolingo owl similarity'));
  assert.ok(manifest.mustAvoid.includes('cute without product behavior'));
  assert.equal(fs.existsSync(asset), true);

  const meta = await sharp(asset).metadata();
  assert.equal(meta.width, 1254);
  assert.equal(meta.height, 1254);
  assert.equal(meta.format, 'png');
});
