'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('first Xiaohongshu pilot is CEO-approved but not represented as published', () => {
  const campaign = source('docs/FIRST_ACQUISITION_CAMPAIGN.md');
  const pilot = source('docs/XIAOHONGSHU_PILOT_001.md');

  assert.match(campaign, /CEO 已批准首轮 3 篇自然内容测试；尚未发布/);
  assert.match(pilot, /CEO 决策：`APPROVED`/);
  assert.match(pilot, /发布状态：三篇均未发布/);
  for (const code of ['xhs-past-helps-today-001', 'xhs-one-diary-finds-001', 'xhs-building-shroom-001']) {
    assert.match(pilot, new RegExp(code));
  }
});

test('pilot keeps one audience while testing three official-account columns', () => {
  const pilot = source('docs/XIAOHONGSHU_PILOT_001.md');
  const agents = source('docs/XIAOHONGSHU_AGENT_SYSTEM.md');
  const campaign = source('docs/FIRST_ACQUISITION_CAMPAIGN.md');

  assert.match(pilot, /过去怎样在今天帮到我/);
  assert.match(pilot, /一条日记能发现什么/);
  assert.match(pilot, /做菇的人/);
  assert.match(pilot, /统一讨论问题/);
  assert.match(pilot, /如果能从过去的记录里重新找到一件事，你最想弄明白什么/);
  assert.doesNotMatch(pilot, /回看/);
  assert.doesNotMatch(campaign, /回看/);
  assert.match(pilot, /UNKNOWN/);
  assert.match(pilot, /不投流、不发动员工或朋友互动、不购买 SEO、不互赞互粉/);
  assert.match(pilot, /平台没有公开点赞、收藏等行为的固定权重/);
  assert.match(agents, /分析者不生成最终稿，生成者不评价自己的结果/);
  assert.match(agents, /不能宣布“没有需求”/);
});

test('pilot has independent compliance and explicit AI disclosure', () => {
  const pilot = source('docs/XIAOHONGSHU_PILOT_001.md');

  assert.match(pilot, /事实与合规门禁/);
  assert.match(pilot, /PASS（内容与方法通过；真实素材仍需发布前逐页核对）/);
  assert.match(pilot, /本文由 AI 辅助整理/);
  assert.match(pilot, /不进行医疗或心理诊断/);
  assert.match(pilot, /每次实际发布仍需人工确认/);
});

test('carousel renderer keeps Chinese copy deterministic and exports three seven-page sets', () => {
  const renderer = source('scripts/render-xiaohongshu-pilot.js');

  assert.match(renderer, /const WIDTH = 1080/);
  assert.match(renderer, /const HEIGHT = 1440/);
  assert.match(renderer, /pageCount: pages\.length/);
  assert.match(renderer, /aiIllustrationUsed: false/);
  assert.match(renderer, /visualQaStatus: 'PASS'/);
  assert.match(renderer, /contentEvidenceStatus: 'PENDING_REAL_DEMO_SCREENSHOTS'/);
  assert.match(renderer, /publishReady: false/);
  assert.match(renderer, /publicationState: 'NOT_PUBLISHED'/);
  assert.match(renderer, /if \(metadata\.width !== WIDTH \|\| metadata\.height !== HEIGHT/);
  for (const code of ['xhs-past-helps-today-001', 'xhs-one-diary-finds-001', 'xhs-building-shroom-001']) {
    assert.match(renderer, new RegExp(code));
    const manifest = JSON.parse(source(`artifacts/xiaohongshu/${code}/manifest.json`));
    assert.equal(manifest.contentCode, code);
    assert.equal(manifest.pageCount, 7);
    assert.equal(manifest.width, 1080);
    assert.equal(manifest.height, 1440);
    assert.equal(manifest.publishReady, false);
    assert.equal(manifest.files.length, 7);
  }
});

test('benchmark research separates sustained accounts from note-level virality', () => {
  const agents = source('docs/XIAOHONGSHU_AGENT_SYSTEM.md');
  const research = source('docs/XIAOHONGSHU_BENCHMARK_RESEARCH.md');
  const migration = source('server/sql/047_xiaohongshu_benchmark_research.sql');

  assert.match(agents, /`ACCOUNT_BENCHMARK`/);
  assert.match(agents, /`POST_EVALUATION`/);
  assert.match(agents, /第三方粉丝增长榜只证明账号趋势/);
  assert.match(research, /CURRENT_SUSTAINED/);
  assert.match(research, /本轮唯一通过全年跨度、连续近期窗口和近期性三重门槛的官方账号/);
  assert.match(research, /任何等级都不自动等于“爆文”/);
  assert.match(research, /小红书开放平台只开放 `basic_info`/);
  assert.match(migration, /noteLevelClaimsRequireDirectNoteAudit/);
  assert.match(migration, /thirdPartyRankingsProveAccountTrendOnly/);
  assert.match(migration, /executor_type = 'MANUAL'/);
});

test('Shroom benchmark pool contains ten official-account learning modules', () => {
  const accounts = source('docs/XIAOHONGSHU_SHROOM_BENCHMARK_ACCOUNTS.md');
  const migration = source('server/sql/048_xiaohongshu_shroom_benchmark_accounts.sql');

  for (const account of [
    '多邻国 Duolingo', 'Apple', '蚂蚁森林', 'TapNow', '种草学习薯',
    '百度地图', '支付宝', '滴滴', '丁香园', '寿司郎'
  ]) {
    assert.match(accounts, new RegExp(account));
    assert.match(migration, new RegExp(account));
  }
  assert.match(accounts, /不代表这些账号的全部做法都适合复制/);
  assert.match(accounts, /具体模仿前，仍需完成笔记级直接审计/);
  assert.match(migration, /"count":10/);
  assert.match(migration, /"nextGate":"DIRECT_NOTE_AUDIT"/);
  assert.doesNotMatch(migration, /canPublish[^\n]*true/);
});

test('deep benchmark research chooses one Shroom account and removes offline incentive bias', () => {
  const research = source('docs/XIAOHONGSHU_DEEP_RESEARCH_AND_ACCOUNT_STRATEGY.md');
  const playbook = source('docs/OPERATIONS_PLAYBOOK.md');
  const migration = source('server/sql/049_xiaohongshu_account_strategy.sql');

  assert.match(research, /一个品牌官方主账号/);
  assert.match(research, /flomo 浮墨笔记/);
  assert.match(research, /移出主动池 \| 寿司郎/);
  assert.match(research, /主号完成至少 12 周、36 篇/);
  assert.match(research, /创始人个人账号/);
  assert.match(playbook, /不按身心记录、人生 OS、菇卡、未解之问等产品功能拆分专题账号/);
  assert.match(migration, /"accountModel":"SINGLE_OFFICIAL_WITH_COLUMNS"/);
  assert.match(migration, /"model":"SINGLE_OFFICIAL_WITH_COLUMNS"/);
  assert.match(migration, /"requiresCeoDecisionToSplit":true/);
  assert.match(migration, /"canCreateAccounts":false/);
  assert.match(migration, /"canPublish":false/);

  const activePool = migration.match(/\{benchmarkAccounts\}[\s\S]*?\]'::jsonb/);
  assert.ok(activePool);
  assert.match(activePool[0], /flomo 浮墨笔记/);
  assert.doesNotMatch(activePool[0], /寿司郎/);
});

test('hotspot layer is a sourced internal accelerator, not a fourth column or publishing authority', () => {
  const system = source('docs/XIAOHONGSHU_HOTSPOT_AND_VISUAL_SYSTEM.md');
  const playbook = source('docs/OPERATIONS_PLAYBOOK.md');
  const migration = source('server/sql/051_xiaohongshu_hotspot_and_visual_v2.sql');

  assert.match(system, /热点不是第四个栏目/);
  assert.match(system, /CROSS_PLATFORM_SIGNAL/);
  assert.match(system, /跨平台信号不得冒充小红书官方热点/);
  assert.match(playbook, /小红书热点雷达 Agent/);
  assert.match(migration, /xiaohongshu-hotspot-radar/);
  assert.match(migration, /TOPIC_ACCELERATOR_NOT_A_FOURTH_COLUMN/);
  assert.match(migration, /"canPublish": false/);
  assert.match(migration, /xiaohongshuFirstPartyTrendVerified/);
});

test('official visual v2 has a recurring character and three deterministic 3:4 covers', () => {
  const system = source('docs/XIAOHONGSHU_HOTSPOT_AND_VISUAL_SYSTEM.md');
  const renderer = source('scripts/render-xiaohongshu-brand-v2.js');
  const manifest = JSON.parse(source('artifacts/xiaohongshu/shroom-official-visual-v2/manifest-v2.json'));

  assert.match(system, /记忆管理员菇/);
  assert.match(renderer, /const WIDTH = 1080/);
  assert.match(renderer, /const HEIGHT = 1440/);
  assert.equal(manifest.visualSystem, 'SHROOM_MEMORY_KEEPER_V2');
  assert.equal(manifest.publicationState, 'NOT_PUBLISHED');
  assert.equal(manifest.publishReady, false);
  assert.equal(manifest.files.length, 3);
  for (const cover of manifest.files) {
    const absolute = path.join(root, 'artifacts/xiaohongshu/shroom-official-visual-v2', cover.file);
    assert.equal(fs.existsSync(absolute), true);
    assert.equal(cover.width, 1080);
    assert.equal(cover.height, 1440);
  }
});
