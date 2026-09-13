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

test('todo creation stays page-local, title-first and exposes visible success state', () => {
  const list = source('src/pages/todo/list.vue');
  const edit = source('src/pages/todo/edit.vue');
  const analysis = source('src/pages/shroom/ai-analysis.vue');

  assert.match(list, /data-testid="add-todo"[^>]+@tap="openQuickAdd"/);
  assert.match(list, /class="save-button"[^>]+@tap="saveTask"/);
  assert.match(list, /已保存，可在相应视图查看/);
  assert.match(edit, /data-testid="save-todo"[^>]+@tap="save"/);
  assert.match(analysis, /<button[^>]+data-testid="create-analysis-todos"[^>]+@tap="createTodos"/);
  assert.match(analysis, /createdTodoNotice/);
});

test('todo execution layer has current views, projects, recurrence and reversible action records', () => {
  const list = source('src/pages/todo/list.vue');
  const edit = source('src/pages/todo/edit.vue');
  const detail = source('src/pages/todo/detail.vue');
  const project = source('src/pages/todo/project.vue');
  const row = source('src/components/TodoRow.vue');
  const route = source('server/src/routes/todos.js');
  const migration = source('server/sql/026_todo_projects.sql');
  const diary = source('src/pages/diary/index.vue');
  const compound = source('src/pages/shroom/compound.vue');

  for (const label of ['当前', '之后', '未安排', '项目']) assert.match(list, new RegExp(label));
  assert.match(list, /showQuickSheet/);
  assert.match(list, /repeatLabels: \['不重复', '每天', '每周', '每月'\]/);
  assert.match(list, /undoComplete/);
  assert.match(list, /selectionMode/);
  assert.match(row, /已过截止日期/);
  assert.match(detail, /记录结果并完成/);
  assert.match(detail, /添加结果照片/);
  assert.match(detail, /补充完成结果/);
  assert.match(detail, /resultMediaIds/);
  assert.match(detail, /不会伪造或修改你的日记正文/);
  assert.match(detail, /恢复为未完成/);
  assert.match(project, /项目还有|未完成|归档项目/);
  assert.match(project, /转移到其他项目/);
  assert.match(edit, /仅本次/);
  assert.match(edit, /本次及以后/);
  assert.match(route, /generateActiveRules/);
  assert.match(route, /ON CONFLICT \(user_id, recurrence_rule_id, occurrence_date\)/);
  assert.match(route, /这条待办已在其他页面更新/);
  assert.match(route, /router\.patch\('\/result'/);
  assert.match(migration, /todo_recurrence_rules/);
  assert.match(migration, /todo_events/);
  assert.match(diary, /actionRecords/);
  assert.match(compound, /把这一步安排到待办/);
});

test('todo management and project creation use large cross-platform sheets', () => {
  const list = source('src/pages/todo/list.vue');
  assert.match(list, /data-testid="todo-manage"/);
  assert.match(list, /v-if="showPageMenu"/);
  assert.match(list, /class="manage-grid"/);
  assert.match(list, /data-testid="project-name"/);
  assert.match(list, /@tap\.self="closeProjectSheet"/);
  assert.match(list, /:focus="projectNameFocused"/);
  assert.match(list, /class="project-field"/);
  assert.doesNotMatch(list, /openPageMenu\(\)\s*\{[\s\S]{0,180}uni\.showActionSheet/);
});

test('compound system opens a segmented self-paced yoga practice', () => {
  const compound = source('src/pages/shroom/compound.vue');
  const yoga = source('src/pages/shroom/yoga-practice.vue');
  assert.match(compound, /每日自主练习/);
  assert.match(yoga, /initial-time/);
  assert.match(yoga, /:controls="false"/);
  assert.match(yoga, /暂停精讲/);
  assert.match(yoga, /@timeupdate="handleTimeUpdate"/);
  assert.match(yoga, /开始自主练习/);
  assert.match(yoga, /记录今天的练习/);
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

test('compound directions stay secondary while Life OS remains a separate principle module', () => {
  const home = source('src/pages/diary/index.vue');
  const plan = source('src/pages/shroom/life-os-plan.vue');
  const item = source('src/pages/shroom/life-os-item.vue');
  const weekly = source('src/pages/shroom/life-os-weekly.vue');
  const analysis = source('src/pages/shroom/ai-analysis.vue');
  const prompt = source('server/src/ai-prompts.js');
  const defaults = source('server/src/life-os-long-term.js');
  const pages = JSON.parse(source('src/pages.json'));

	assert.doesNotMatch(home, /life-os-entry/);
	assert.doesNotMatch(home, /复利系统/);
	assert.doesNotMatch(home, /compoundHome/);
	assert.match(plan, /当前关注范围/);
	assert.match(plan, /selectDirection\(item\)/);
	assert.match(plan, /compoundStartItemKey/);
	assert.match(plan, /FIVE AREAS · 20 DIRECTIONS/);
	assert.match(plan, /最近关联记录/);
	assert.match(plan, /判断原则与版本/);
	assert.match(plan, /导出 JSON/);
  assert.match(item, /这里没有“永久完成”/);
  assert.match(item, /取消关联/);
  assert.match(item, /原文已变更/);
	assert.match(weekly, /确认前可以修改/);
	assert.match(weekly, /不会自动停止推进、创建待办或修改人生 OS/);
	assert.match(analysis, /进入后才能把它接入正在推进的事/);
  assert.match(prompt, /最多 3 条/);
  assert.match(prompt, /不是 ACTION/);
  assert.equal((defaults.match(/\['\d{2}',/g) || []).length, 20);
  assert.equal(pages.tabBar.list.length, 4);
  assert.ok(pages.pages.some(page => page.path === 'pages/shroom/life-os-plan'));
  assert.ok(pages.pages.some(page => page.path === 'pages/shroom/life-os-item'));
  assert.ok(pages.pages.some(page => page.path === 'pages/shroom/life-os-weekly'));
});

test('compound system resumes real work and persists blockers, results and diary reviews', () => {
	const me = source('src/pages/shroom/me.vue');
	const compound = source('src/pages/shroom/compound.vue');
	const compoundRoute = source('server/src/routes/compound-progress.js');
	const pages = source('src/pages.json');
	const api = source('src/api/compound-system.js');

	assert.doesNotMatch(me, /hasCompoundSystemAccess|COMPOUND_OWNER_USER_ID/);
	assert.match(me, /复利系统/);
	assert.match(pages, /pages\/shroom\/compound/);
	assert.match(api, /\/compound\/v2\/home/);
	assert.match(compound, /先选一件/);
	assert.match(compound, /继续推进/);
	assert.match(compound, /我卡住了/);
	assert.match(compound, /记录结果/);
	assert.match(compound, /实际发生了什么/);
	assert.match(compound, /进入后才能把它接入正在推进的事|回看这次/);
	assert.match(compound, /人生 OS 原则/);
	assert.match(compound, /语音记录/);
	assert.match(compound, /添加照片/);
	assert.match(compound, /重新读取/);
	assert.doesNotMatch(compound, /setTimeout\(\(\) => this\.goBack/);
	assert.match(compoundRoute, /compound_threads/);
	assert.match(compoundRoute, /compound_events/);
	assert.match(compoundRoute, /status = 'DRAFT'/);
	assert.match(compoundRoute, /source_diary_id/);
	assert.doesNotMatch(compoundRoute, /req\.body\.userId/);
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

test('diary analysis proposes unresolved questions without requiring a mood or tag', () => {
  const analysis = source('src/pages/shroom/ai-analysis.vue');
  const prompt = source('server/src/ai-prompts.js');
  const route = source('server/src/routes/ai.js');

  assert.match(analysis, /这篇留下了还没想明白的事吗/);
  assert.match(analysis, /acceptInquiryCandidate/);
  assert.match(analysis, /ignoreInquiryCandidate/);
  assert.match(prompt, /不依赖问号、标签或情绪选择/);
  assert.match(prompt, /需要未来经历、行为结果、反例或跨时间比较/);
  assert.match(route, /normalizeInquiryCandidates/);
  assert.match(route, /syncDiaryCandidates/);
});

test('memory review exposes tokens and a plain-language CNY estimate', () => {
  const memory = source('src/pages/shroom/memory.vue');
  assert.match(memory, /visibleCost/);
  assert.match(memory, /本次回看用量/);
	assert.match(memory, /约 ¥/);
	assert.match(memory, /最终以 DeepSeek 账单为准/);
	assert.doesNotMatch(memory, /暂无价格|公开单价估算/);
	assert.match(memory, /message\.result\.presentation === 'evidence_list'/);
	assert.match(memory, /item\.reason/);
	assert.match(memory, /analysisItemExcerpt/);
});

test('unresolved questions form a user-confirmed evidence and review loop', () => {
  const home = source('src/pages/diary/index.vue');
  const edit = source('src/pages/diary/edit.vue');
  const list = source('src/pages/shroom/inquiries.vue');
  const detail = source('src/pages/shroom/inquiry.vue');
  const me = source('src/pages/shroom/me.vue');
  const pages = source('src/pages.json');
  const route = source('server/src/routes/inquiries.js');

  assert.doesNotMatch(home, /正在想明白的事/);
  assert.doesNotMatch(home, /inquirySummary/);
  assert.match(edit, /关联问题/);
  assert.match(edit, /syncInquiryLinks/);
  assert.match(list, /有些答案，需要生活慢慢提供证据/);
  assert.match(list, /从过去日记里发现的线索/);
  assert.match(list, /loadCandidates/);
  assert.match(list, /acceptCandidate/);
  assert.match(list, /ignoreCandidate/);
  assert.match(detail, /生活留下的线索/);
  assert.match(detail, /状态不会由 AI 自动改变/);
  assert.match(detail, /costSummary/);
  assert.match(me, /未解之问/);
  assert.match(pages, /pages\/shroom\/inquir(?:y|ies)/);
  assert.match(route, /usageContext: \{ userId: req\.user\.id, inquiryId/);
  assert.match(route, /d\.ai_allowed/);
  assert.doesNotMatch(route, /req\.body\.userId/);
});

test('wellbeing records provide independent evidence while inquiries only organize reasoning', () => {
  const edit = source('src/pages/diary/edit.vue');
  const list = source('src/pages/shroom/inquiries.vue');
  const detail = source('src/pages/shroom/inquiry.vue');
  const analysis = source('src/pages/shroom/ai-analysis.vue');
  const wellbeing = source('src/pages/shroom/wellbeing.vue');
  const home = source('src/pages/diary/index.vue');
  const me = source('src/pages/shroom/me.vue');
  const consent = source('src/components/HealthConsentSheet.vue');
  const pages = source('src/pages.json');
  const routes = source('server/src/routes/inquiries.js');
  const wellbeingRoutes = source('server/src/routes/wellbeing.js');
  const prompt = source('server/src/ai-prompts.js');
  const migration = source('server/sql/024_wellbeing_records.sql');

  assert.match(wellbeing, /身心记录提供证据/);
  for (const label of ['心理', '身体', '睡眠', '习惯', '测量', '检查']) assert.match(wellbeing, new RegExp(label));
  assert.match(me, /openWellbeing/);
  assert.match(home, /wellbeing-glimpse/);
  assert.match(list, /身心记录[\s\S]*提供证据/);
  assert.doesNotMatch(list, /typeFilters/);
  assert.match(list, /HealthConsentSheet/);
  assert.match(analysis, /HealthConsentSheet/);
  assert.match(analysis, /与你是否创建未解之问无关/);
  assert.doesNotMatch(list, /uni\.showModal\(/);
  assert.doesNotMatch(analysis, /uni\.showModal\([\s\S]*?健康观察/);
  assert.match(consent, /不复制、移动或改写原始记录/);
  assert.match(consent, /不会影响原始身心记录/);
  assert.match(consent, /不是医学诊断/);
  assert.match(detail, /引用的身心记录/);
  assert.match(detail, /从身心记录引用证据/);
  assert.doesNotMatch(detail, /healthObservationPayload|健康时间线/);
  assert.match(detail, /更新健康线索/);
  assert.match(detail, /INCREMENTAL/);
  assert.match(detail, /用全部线索重新分析/);
  assert.match(detail, /当前线索/);
  assert.match(detail, /原因假设/);
  assert.match(detail, /缺失信息/);
  assert.match(detail, /下一步记录什么最有价值/);
  assert.match(detail, /导出就医摘要/);
  assert.match(detail, /不是医学诊断/);
  assert.match(analysis, /确认这条观察/);
  assert.match(routes, /health-summary/);
  assert.match(wellbeingRoutes, /wellbeing_records/);
  assert.match(wellbeingRoutes, /wellbeing_record_id/);
  assert.match(prompt, /独立的事实层/);
  assert.match(prompt, /不承载原始身心记录/);
  assert.match(prompt, /healthExtraction/);
  assert.match(prompt, /psychologicalObservations/);
  assert.match(prompt, /physicalObservations/);
  assert.match(prompt, /lifestyleFactors/);
  assert.match(prompt, /environmentFactors/);
  assert.match(prompt, /healthInquiryLinks/);
  assert.match(prompt, /missingInformation/);
  assert.match(prompt, /redFlags/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS wellbeing_records/);
  assert.match(migration, /wellbeing_record_id uuid REFERENCES wellbeing_records\(id\) ON DELETE SET NULL/);
  assert.match(migration, /source_type = 'WELLBEING'/);
  assert.doesNotMatch(edit, /healthObservationPayload|健康表单|症状严重程度/);
  const tabBar = JSON.parse(pages).tabBar.list;
  assert.equal(tabBar.length, 4);
  assert.ok(JSON.parse(pages).pages.some(page => page.path === 'pages/shroom/wellbeing'));
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
	assert.match(discover, /过去我有哪些做得不好的地方？/);
	assert.doesNotMatch(discover, /创建菇卡|成为第一个分享者|createCard|publish-button|publish-plus/);
	assert.doesNotMatch(discover, /人类留给自己的提醒|heritageCollection|FEATURED JOURNALERS/);
	assert.doesNotMatch(discover, /SHROOM 策展|CURATED SHROOM CARDS|source-line|editorial-feature/);
  assert.match(detail, /Shroom 转译|provenanceLabel/);
  assert.match(detail, /已核源/);
  assert.match(detail, /查看来源/);
	assert.match(detail, /基于人物真实记录建立的只读人物档案/);
	assert.match(detail, /来自一张公开菇卡/);
	assert.doesNotMatch(cardRoutes, /conditions\.push\('c\.collection_slug IS NULL'\)/);
});
