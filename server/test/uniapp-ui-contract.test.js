'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..', '..');

function source(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function styleRule(vueSource, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = vueSource.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `missing style rule: ${selector}`);
  return match[1];
}

test('todo creation uses native buttons and exposes visible success state', () => {
  const list = source('src/pages/todo/list.vue');
  const edit = source('src/pages/todo/edit.vue');
  const analysis = source('src/pages/shroom/ai-analysis.vue');

  assert.match(list, /<button class="add-button"[^>]+@tap="addTodo"/);
  assert.match(edit, /<button class="nav-save"[^>]+@tap="saveTodo"/);
  assert.match(analysis, /<button[^>]+data-testid="create-analysis-todos"[^>]+@tap="createTodos"/);
  assert.match(analysis, /createdTodoNotice/);
});

test('diary text surfaces stay inside their cards and action labels are centered', () => {
  const edit = source('src/pages/diary/edit.vue');
  const insertButton = styleRule(edit, '.insert-button');
  const transcriptPanel = styleRule(edit, '.transcript-panel');
  const transcriptInput = styleRule(edit, '.transcript-input');
  const contentInput = styleRule(edit, '.content-input');

  for (const declaration of ['display: flex', 'align-items: center', 'justify-content: center', 'box-sizing: border-box']) {
    assert.match(insertButton, new RegExp(declaration));
  }
  for (const rule of [transcriptPanel, transcriptInput, contentInput]) {
    assert.match(rule, /max-width:\s*100%/);
    assert.match(rule, /box-sizing:\s*border-box/);
    assert.match(rule, /overflow-x:\s*hidden/);
  }
  for (const rule of [transcriptInput, contentInput]) {
    assert.match(rule, /word-break:\s*break-word/);
    assert.match(rule, /overflow-wrap:\s*anywhere/);
  }
});

test('image saving exposes aggregate progress and time-slot previews stay compact', () => {
  const edit = source('src/pages/diary/edit.vue');
  const diaryHome = source('src/pages/diary/index.vue');

  assert.match(edit, /imageUploadProgress/);
  assert.match(edit, /trackImageUploadTask/);
  assert.match(edit, /照片保存进度/);
  assert.match(diaryHome, /getTimeSlotPreview\(slot\.diary\)/);
  const scheduleTitle = styleRule(diaryHome, '.schedule-title');
  assert.match(scheduleTitle, /overflow:\s*hidden/);
  assert.match(scheduleTitle, /-webkit-line-clamp:\s*2/);
});

test('life OS is reviewed as confirmed clauses and cards are not actions', () => {
  const lifeOs = source('src/pages/shroom/life-os.vue');
  const me = source('src/pages/shroom/me.vue');

  assert.match(lifeOs, /菇卡帮助我在具体时刻做得更好/);
  assert.match(lifeOs, /人生 OS 帮助我决定什么才叫/);
  assert.match(lifeOs, /菇卡不是行动，默认不会创建/);
  assert.match(lifeOs, /确认签发/);
  assert.match(lifeOs, /maximumActiveCount/);
  assert.match(lifeOs, /保持、改写、合并、转为菇卡、继续观察或退休/);
  assert.match(me, /带到下一次相似时刻的理解/);
});

test('personal compound system is account-gated and keeps four cadences separate', () => {
  const me = source('src/pages/shroom/me.vue');
  const compound = source('src/pages/shroom/compound.vue');
  const compoundRoute = source('server/src/routes/compound.js');
  const pages = source('src/pages.json');
  const api = source('src/api/compound-system.js');

  assert.match(me, /hasCompoundSystemAccess/);
  assert.match(me, /COMPOUND_OWNER_USER_ID/);
  assert.match(me, /复利系统/);
  assert.match(pages, /pages\/shroom\/compound/);
  assert.match(api, /\/compound\/v1\/today/);
  for (const label of ['系统复利', '金融复利', '信用复利', '身体复利']) {
    assert.match(compoundRoute, new RegExp(label));
  }
  assert.match(compound, /\[5, 15, 30\]/);
  assert.match(compound, /由 Codex 记录自动判断/);
  assert.match(compound, /六类复利本金/);
  assert.match(compound, /重新读取/);
  assert.doesNotMatch(compound, /setTimeout\(\(\) => this\.goBack/);
  assert.match(compound, /只确认你按既定规则完成/);
  assert.match(compound, /跟练结束后可打卡/);
  assert.match(compound, /@ended="finishYogaPractice"/);
  assert.match(compoundRoute, /bodyPractice: DAILY_YOGA_PRACTICE/);
  const compoundSystem = source('server/src/compound-system.js');
  assert.match(compoundSystem, /durationMinutes: 24/);
  assert.match(compoundSystem, /fit-for-duty-yoga-24min-h264\.mp4/);
  assert.match(compoundSystem, /https:\/\/img\.surfplus\.xyz\/shroom\/compound-system\/yoga/);
});

test('diary writing has no manual tags and archive themes open semantic cached reviews', () => {
  const edit = source('src/pages/diary/edit.vue');
  const archive = source('src/pages/common/diary/search.vue');

  assert.doesNotMatch(edit, /availableTags|toggleTag|addNewTag|diaryForm\.tags/);
  assert.doesNotMatch(archive, /normalizeTags\(diary\.tags\)|内容与标签都可以搜索/);
  assert.match(archive, /openTheme\(theme\)/);
  assert.match(archive, /memoryThemeOpen/);
});

test('observers are user-configurable and analysis renders dynamic seats with cost', () => {
  const observers = source('src/pages/shroom/observers.vue');
  const analysis = source('src/pages/shroom/ai-analysis.vue');
  const me = source('src/pages/shroom/me.vue');
  const pages = source('src/pages.json');

  assert.match(observers, /v-for="\(item,index\) in observers"/);
  assert.match(observers, /@change="toggleObserver\(item, \$event\)"/);
  assert.match(observers, /增加自定义观察席/);
  assert.match(observers, /最多 20 席/);
  assert.match(analysis, /analysis\.observations/);
  assert.match(analysis, /viewType === 'custom'/);
  assert.match(analysis, /analysis\.costSummary/);
  assert.match(me, /openObservers/);
  assert.match(pages, /pages\/shroom\/observers/);
});

test('memory review exposes tokens and a plain-language CNY estimate', () => {
  const memory = source('src/pages/shroom/memory.vue');
  assert.match(memory, /visibleCost/);
  assert.match(memory, /本次回看用量/);
	assert.match(memory, /约 ¥/);
	assert.match(memory, /最终以 DeepSeek 账单为准/);
	assert.doesNotMatch(memory, /暂无价格|公开单价估算/);
});

test('public cards form a horizontal deck and open an ownership-aware detail', () => {
  const discover = source('src/pages/shroom/discover.vue');
  const personalCards = source('src/pages/shroom/cards.vue');
  const detail = source('src/pages/common/cards/detail.vue');
	const cardRoutes = source('server/src/routes/cards.js');

  assert.match(discover, /<swiper[\s\S]*?class="cards-swiper"/);
  assert.match(discover, /@change="onCardChange"/);
  assert.match(discover, /@tap="openCard\(card\)"/);
  assert.match(discover, /左右滑动看下一张/);
	assert.doesNotMatch(discover, /deck-progress-track/);
  assert.match(personalCards, /<swiper class="cards-swiper"/);
  assert.match(personalCards, /点开查看、练习或引用到日记/);
  assert.match(personalCards, /我的收藏/);
  assert.match(personalCards, /shroomCardFavorites/);
	assert.doesNotMatch(personalCards, /indicator-track/);

  assert.match(detail, /isOwner/);
  assert.match(detail, /公开的是觉察句、理解与使用提示/);
  assert.match(detail, /共鸣/);
  assert.match(detail, /收藏/);
	assert.match(detail, /引用到我的菇卡|保存为私密参考/);
	assert.match(detail, /引用并开始练习/);
	assert.match(discover, /resolveAuthorName/);
	assert.doesNotMatch(discover, /人类留给自己的提醒|heritageCollection|FEATURED JOURNALERS/);
	assert.doesNotMatch(discover, /SHROOM 策展|CURATED SHROOM CARDS|source-line|editorial-feature/);
  assert.match(detail, /Shroom 转译|provenanceLabel/);
  assert.match(detail, /已核源/);
  assert.match(detail, /查看来源/);
	assert.match(detail, /基于人物真实记录建立的只读人物档案/);
	assert.match(detail, /来自一张公开菇卡/);
	assert.doesNotMatch(cardRoutes, /conditions\.push\('c\.collection_slug IS NULL'\)/);
});
