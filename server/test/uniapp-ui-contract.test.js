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

test('local H5 development uses the same-origin API proxy without changing native builds', () => {
  const config = source('src/config/index.config.js');
  const vueConfig = source('vue.config.js');

  assert.match(config, /let shroomDevelopmentApi = 'https:\/\/shroom\.evox\.run\/api'/);
  assert.match(config, /process\.env\.NODE_ENV === 'development'\) shroomDevelopmentApi = '\/api'/);
  assert.match(config, /baseUrl: shroomDevelopmentApi/);
  assert.match(vueConfig, /'\/api':\s*\{[\s\S]*target: 'https:\/\/shroom\.surfplus\.xyz'[\s\S]*changeOrigin: true/);
});

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

test('diary home offers two honest day projections and one unified record entry', () => {
  const home = source('src/pages/diary/index.vue');
  const edit = source('src/pages/diary/edit.vue');

  assert.match(home, /data-testid="home-day-flow"/);
  assert.match(home, /data-testid="home-day-timeline"/);
	assert.match(home, /class="stream-entry"/);
	assert.match(home, /dayStreamEntries/);
	assert.match(home, /class="timeline-stage"/);
	assert.match(home, /timelineHours/);
  assert.match(home, /data-testid="home-create-diary"/);
  assert.doesNotMatch(home, /data-testid="home-create-voice"/);
  assert.doesNotMatch(home, /data-testid="home-create-text"/);
  assert.match(home, /计划，不代表已经发生/);
	assert.match(home, /外部观测/);
	assert.match(home, /不代表现实结果/);
	assert.doesNotMatch(home, /class="planned-panel"/);
	assert.match(home, /handleCaptureTap\('record'\)/);
	assert.doesNotMatch(home, /mode=voice/);
  assert.match(edit, /if \(!options \|\| !options\.id\) this\.voicePanelOpen = true/);
  assert.ok(edit.indexOf('class="voice-studio"') > edit.indexOf('class="writing-sheet"'));
  assert.match(edit, /\.capture-editor-stack\s*\{[^}]*flex-direction:\s*column/);
  assert.match(edit, /\.voice-studio\s*\{[^}]*order:\s*0/);
  assert.match(edit, /\.writing-sheet\s*\{[^}]*order:\s*1/);
});

test('day planning supports overlap columns, source filters, direct details, swipe and dock drag creation', () => {
  const home = source('src/pages/diary/index.vue');
  const layout = source('src/utils/day-timeline.js');
  const activity = source('src/pages/shroom/data-sources/activity.vue');
  const pages = source('src/pages.json');

  assert.match(home, /sourceFilterOptions/);
  assert.match(home, /entry\.sourceIcon/);
  assert.match(home, /completeTodoFromHome/);
  assert.match(home, /<swiper class="week-swiper"/);
	assert.match(home, /beginCaptureDrag\('record'/);
	assert.match(home, /beginCaptureDrag\('todo'/);
	assert.match(home, /updateCaptureDrag/);
	assert.match(home, /finishCaptureDrag/);
	assert.match(home, /data-testid="home-create-todo"/);
	assert.match(home, /data-testid="home-open-todos"[^>]+@tap="goToTodoList"/);
	assert.match(home, /class="date-dropdown-arrow"/);
	assert.match(home, /data-testid="home-open-view-panel"[^>]+openHomePanel\('view'\)/);
	assert.match(home, /data-testid="home-open-options-panel"[^>]+openHomePanel\('options'\)/);
	assert.match(home, /data-testid="home-open-settings"[^>]+openHomePanel\('settings'\)/);
	assert.doesNotMatch(home, /\uff0b \u62d6\u52a8\u5b89\u6392|toggleTimelineCreateMode|beginTimelineSelection/);
	assert.match(home, /pages\/todo\/edit\?scheduledDate=/);
	assert.match(home, /pages\/diary\/edit\?time=/);
	assert.match(home, /pages\/shroom\/data-sources\/activity\?id=/);
	assert.match(layout, /clusterIntervals/);
	assert.match(layout, /assignColumns/);
	assert.match(layout, /layoutColumnCount/);
	assert.match(layout, /width: `calc\(\$\{width\}%/);
	assert.doesNotMatch(layout, /count \* \(EVENT_HEIGHT \+ EVENT_GAP\)|left: '112rpx'/);
  assert.match(activity, /\u8fd9\u6761\u8bb0\u5f55\u8bc1\u660e\u4ec0\u4e48/);
  assert.match(pages, /pages\/shroom\/data-sources\/activity/);
});

test('timeline compresses long empty runs according to past, today and future editability', () => {
	const home = source('src/pages/diary/index.vue');
	const layout = source('src/utils/day-timeline.js');

	assert.match(home, /collapseEmptyGaps:\s*!this\.isSelectedFuture/);
	assert.match(home, /expandedGapKeys:\s*this\.isSelectedToday \? this\.expandedTimelineGapKeys : \[\]/);
	assert.match(home, /toggleTimelineGap\(gap\)[\s\S]{0,100}if \(!this\.isSelectedToday/);
	assert.match(home, /:disabled="isSelectedPast"/);
	assert.match(home, /class="timeline-gap-marker"/);
	assert.match(home, /:style="\{ top: gap\.top \+ 'rpx', height: gap\.height \+ 'rpx' \}"/);
	assert.doesNotMatch(home, /:style="timelineGapStyle\(gap\)"/);
	assert.match(layout, /MIN_COLLAPSIBLE_HOURS = 3/);
	assert.match(layout, /COLLAPSED_GAP_HEIGHT = 64/);
});

test('home uses an anchored view popover and keeps homepage-only options in secondary panels', () => {
	const home = source('src/pages/diary/index.vue');
	const template = home.slice(home.indexOf('<template>'), home.indexOf('<script>'));
	const streamEntryStart = template.indexOf('class="stream-entry"');
	const streamEntryEnd = template.indexOf('</view>\n\t\t\t</view>', streamEntryStart);
	const streamEntryTemplate = template.slice(streamEntryStart, streamEntryEnd);

	assert.match(template, /data-testid="home-view-panel"/);
	assert.match(template, /data-testid="home-options-panel"/);
	assert.match(template, /data-testid="home-settings-panel"/);
	assert.match(template, /class="view-popover" :style="viewPopoverStyle"/);
	assert.match(template, /selectHomeView\('day', 'flow'\)/);
	assert.match(template, /selectHomeView\('day', 'timeline'\)/);
	assert.match(template, /selectHomeView\('week'\)/);
	assert.match(template, /class="panel-source-options"/);
	assert.doesNotMatch(template, /class="period-view-switch"/);
	assert.doesNotMatch(template, /class="source-filter-scroll"/);
	assert.doesNotMatch(template, /class="period-choice-grid"/);
	assert.match(streamEntryTemplate, /class="stream-time"/);
	assert.doesNotMatch(streamEntryTemplate, /entry-source-icon/);
	assert.match(home, /selectHomeView\(period, mode\)[\s\S]{0,420}this\.closeHomePanel\(\)/);
	assert.match(home, /HOME_PREFERENCES_STORAGE_KEY/);
	assert.match(home, /uni\.setStorageSync\(HOME_PREFERENCES_STORAGE_KEY/);
	assert.match(template, /homePreferences\.showWeekStrip/);
	assert.match(template, /homePreferences\.showFlowMeta/);
	assert.doesNotMatch(home, /uni\.navigateTo\(\{ url: '\/pages\/shroom\/settings' \}\)/);
});

test('diary home restores search and pending review while default view remains user-owned', () => {
	const home = source('src/pages/diary/index.vue');
	const template = home.slice(home.indexOf('<template>'), home.indexOf('<script>'));

	assert.match(template, /class="selected-date-text">\{\{ isSelectedToday \? '菇日记' : selectedDateHeaderTitle \}\}<\/text>/);
	assert.match(template, /class="date-dropdown-arrow"/);
	assert.match(styleRule(home, '.date-dropdown-arrow'), /align-self:\s*center/);
	assert.match(template, /<swiper class="week-swiper"[^>]+:key="weekAnchorKey"/);
	assert.match(home, /selectedDateHeaderTitle\(\)[\s\S]{0,120}YYYY\/MM\/DD/);
	assert.match(home, /weekAnchorKey\(\)[\s\S]{0,120}startOf\('week'\)/);
	assert.match(template, /data-testid="home-search-diary"[^>]+@tap="goToSearch"/);
	assert.match(template, /data-testid="home-pending-wellbeing"[^>]+v-if="isSelectedToday && hasPendingWellbeingChanges"/);
	assert.match(home, /hasPendingWellbeingChanges\(\)[\s\S]{0,100}this\.pendingWellbeingCount > 0/);
	assert.match(home, /dayViewMode:\s*'timeline'/);
	assert.match(home, /homePreferences:\s*\{ defaultView:\s*DEFAULT_HOME_VIEW/);
	assert.match(template, /data-testid="home-default-view-options"/);
	for (const view of ['timeline', 'flow', 'week', 'month', 'year']) {
		assert.match(home, new RegExp(`key: '${view}'`));
	}
	assert.match(home, /applyDefaultHomeView\(defaultView\)/);
	assert.match(home, /selectDefaultHomeView\(view\)[\s\S]{0,220}uni\.setStorageSync\(HOME_PREFERENCES_STORAGE_KEY/);
});

test('diary home typography stays readable at mobile rpx scale', () => {
	const home = source('src/pages/diary/index.vue');
	const layout = source('src/utils/day-timeline.js');

	assert.match(styleRule(home, '.selected-date-text'), /font-size:\s*30rpx/);
	assert.match(home, /\.panel-source-option > view text:first-child[\s\S]{0,240}font-size:\s*26rpx/);
	assert.match(styleRule(home, '.stream-entry-title'), /font-size:\s*29rpx/);
	assert.match(styleRule(home, '.timeline-hour > text'), /font-size:\s*24rpx/);
	assert.match(styleRule(home, '.timeline-event-main > text:last-child'), /font-size:\s*24rpx/);
	assert.match(styleRule(home, '.timeline-event-meta'), /font-size:\s*19rpx/);
	assert.match(styleRule(home, '.timeline-event.is-compact .timeline-event-meta'), /font-size:\s*19rpx/);
	assert.match(home, /\.capture-dock button\s*\{[^}]*font-size:\s*28rpx/);
	assert.match(layout, /const MIN_EVENT_HEIGHT = 80/);
	assert.match(layout, /const DEFAULT_EVENT_MINUTES = 45/);
});

test('Codex is a user-level Shroom data source with explicit provenance and controls', () => {
  const connections = source('src/pages/shroom/data-sources.vue');
  const codex = source('src/pages/shroom/data-sources/codex.vue');
  const pages = source('src/pages.json');
  const me = source('src/pages/shroom/me.vue');
  const preferences = source('src/pages/shroom/settings.vue');
  const diary = source('src/pages/diary/index.vue');
  const analysis = source('src/pages/shroom/ai-analysis.vue');
  const route = source('server/src/routes/data-sources.js');
  const migration = source('server/sql/031_data_sources.sql');

  assert.match(me, /data-testid="me-settings"[^>]+@tap="openSettings"/);
  assert.doesNotMatch(me, /私密空间|space-status/);
  assert.match(me, /\/pages\/shroom\/settings/);
  assert.doesNotMatch(me, /数据与连接|带走我的数据|退出当前账号/);
  assert.match(preferences, /数据与连接/);
  assert.match(preferences, /带走我的数据/);
  assert.match(preferences, /退出当前账号/);
  assert.match(preferences, /\/pages\/shroom\/data-sources/);
  assert.match(preferences, /\/pages\/shroom\/export/);
  assert.match(connections, /连接/);
  assert.match(connections, /@tap="openCodex"/);
  assert.match(connections, /\/pages\/shroom\/data-sources\/codex/);
  assert.match(pages, /pages\/shroom\/data-sources\/codex/);
  assert.match(codex, /不属于 AI 复利/);
  assert.match(codex, /菇日记 · Codex 数据源/);
  assert.match(codex, /显示在日记时间线/);
  assert.match(codex, /允许用于 AI 日记分析/);
  assert.match(codex, /断开并删除已同步记录/);
  assert.match(diary, /来自已连接的数据源/);
  assert.match(analysis, /外部观测，不是你亲笔写下的日记/);
  assert.match(route, /x-shroom-source-token/);
  assert.doesNotMatch(route, /req\.body\.userId/);
  assert.match(migration, /data_source_connections/);
  assert.match(migration, /external_activity_events/);
});

test('Codex pairing copy works on H5 and always gives visible feedback', () => {
  const settings = source('src/pages/shroom/data-sources/codex.vue');

  assert.match(settings, /window\.navigator\.clipboard/);
  assert.match(settings, /clipboard\.writeText/);
  assert.match(settings, /document\.execCommand\('copy'\)/);
  assert.match(settings, /复制失败/);
  assert.match(settings, /复制给 Codex/);
  assert.doesNotMatch(settings, /pairing\.pairingCode/);
  assert.doesNotMatch(settings, /copiedTarget === 'code'/);
  assert.equal((settings.match(/@tap="copy\(/g) || []).length, 1);
  assert.match(settings, /-webkit-user-select:\s*text/);
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

  for (const label of ['现在要做', '未来安排', '待安排']) assert.match(list, new RegExp(label));
  assert.match(list, /timeViews:/);
  assert.doesNotMatch(list, /timeViews:[^\n]+key: 'projects'/);
  assert.match(list, /组织方式/);
  assert.match(list, /按项目查看/);
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
  assert.match(compound, /加入待办/);
});

test('new todos can become fixed-time daily, weekly or monthly habits', () => {
  const edit = source('src/pages/todo/edit.vue');
  const detail = source('src/pages/todo/detail.vue');
  const route = source('server/src/routes/todos.js');
  const migration = source('server/sql/057_todo_schedule_times.sql');

  assert.match(edit, /设为习惯/);
  assert.match(edit, /repeatEnabled/);
  assert.match(edit, /scheduledStartTime/);
  assert.match(edit, /scheduledEndTime/);
  assert.match(edit, /recurrence\.weekDays/);
  assert.match(detail, /scheduleTimeLabel/);
  assert.match(route, /scheduled_start_time/);
  assert.match(route, /scheduled_end_time/);
  assert.match(route, /RECURRENCE_LOOKAHEAD_DAYS = 35/);
  assert.match(migration, /ALTER TABLE todo_recurrence_rules/);
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

test('compound system offers the existing daily yoga set as a body compound example without restoring its old shortcut', () => {
  const compound = source('src/pages/shroom/compound.vue');
  const archetypes = source('server/src/compound-archetypes.js');
  const yoga = source('src/pages/shroom/yoga-practice.vue');
  assert.match(archetypes, /daily_yoga_practice/);
  assert.match(archetypes, /每天练一遍 7 动作全身瑜伽/);
  assert.match(archetypes, /完成每日瑜伽的天数/);
  assert.doesNotMatch(compound, /openYogaPractice|pages\/shroom\/yoga-practice|class="secondary-links"/);
  assert.match(yoga, /initial-time/);
  assert.match(yoga, /:controls="false"/);
  assert.match(yoga, /暂停视频/);
  assert.match(yoga, /<\/view>\s*<view class="clip-controls">[\s\S]*▶ 播放这个动作/);
  assert.match(yoga, /switchAudioLocale/);
  assert.match(yoga, /activeVideoUrl/);
  assert.match(yoga, /detectAudioLocale\(systemInfo\)/);
  assert.match(yoga, /getStorageSync\('shroom_yoga_audio_locale'\)/);
  assert.match(yoga, /setStorageSync\('shroom_yoga_audio_locale', locale\)/);
  assert.match(yoga, /activeCaption\.zh/);
  assert.match(yoga, /activeCaption\.en/);
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

test('image saving exposes aggregate progress and homepage previews stay compact', () => {
  const edit = source('src/pages/diary/edit.vue');
  const diaryHome = source('src/pages/diary/index.vue');

  assert.match(edit, /imageUploadProgress/);
  assert.match(edit, /trackImageUploadTask/);
  assert.match(edit, /照片保存进度/);
	assert.match(diaryHome, /getDiaryPreview\(diary\)/);
	const streamTitle = styleRule(diaryHome, '.stream-entry-title');
	assert.match(streamTitle, /overflow:\s*hidden/);
	assert.match(streamTitle, /-webkit-line-clamp:\s*3/);
});

test('diary calendar marks diaries without crowding cells with connected-source counts', () => {
  const diaryHome = source('src/pages/diary/index.vue');

  assert.match(diaryHome, /info: diaryCount > 1 \? `\$\{diaryCount\}篇` : ''/);
  assert.match(diaryHome, /filter\(item => item\.data\.hasDiary \|\| item\.data\.hasSource\)/);
  assert.match(diaryHome, /item\.date === dateStr && Number\(item\.count \|\| 0\) > 0/);
  assert.doesNotMatch(diaryHome, /\$\{sourceCount\} 个 Codex 任务/);
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

test('legacy long-term directions remain inspectable while new compound plans no longer depend on them', () => {
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
  const compound = source('src/pages/shroom/compound.vue');
  assert.doesNotMatch(compound, /与哪个长期方向一致|compoundStartItemKey|openDirections/);
  assert.doesNotMatch(compound, /class="secondary-links"|openPrinciples|人生 OS/);
});

test('compound system starts from a shared archetype catalog and verifies private compounding evidence', () => {
	const me = source('src/pages/shroom/me.vue');
	const compound = source('src/pages/shroom/compound.vue');
	const compoundRoute = source('server/src/routes/compound-progress.js');
	const planningMigration = source('server/sql/033_compound_planning.sql');
	const archetypeMigration = source('server/sql/035_compound_archetypes.sql');
	const archetypes = source('server/src/compound-archetypes.js');
	const pages = source('src/pages.json');
	const api = source('src/api/compound-system.js');

	assert.doesNotMatch(me, /hasCompoundSystemAccess|COMPOUND_OWNER_USER_ID/);
	assert.match(me, /复利系统/);
	assert.match(pages, /pages\/shroom\/compound/);
	assert.match(api, /\/compound\/v2\/home/);
	assert.match(api, /\/compound\/v2\/archetypes/);
	assert.match(api, /\/validation/);
	assert.match(compound, /从真正会积累的东西里/);
	assert.match(compound, /这些是所有用户共享的复利原型/);
	assert.match(compound, /直接产生积累/);
	assert.match(compound, /保护长期底盘/);
	assert.match(compound, /只需要回答 4 件事/);
	assert.match(compound, /planSetup\.commitmentLabel/);
	assert.match(compound, /系统已经替你设定/);
	assert.match(compound, /先运行，再判断/);
	assert.match(compound, /复利已出现/);
	assert.match(compound, /目前线性/);
	assert.match(compound, /新增本金/);
	assert.match(compound, /新增复用 \/ 回报/);
	assert.match(compound, /当前里程碑/);
	assert.match(compound, /修改复利项名称/);
	assert.match(compound, /openRename\(plan\)/);
	assert.match(compound, /patch\(compoundPlan\(this\.selectedPlan\.id\), \{ title \}\)/);
	assert.match(compound, /为了保护它/);
	assert.match(compound, /本周真实分给它多少分钟/);
	assert.match(compound, /可能影响计划的现实反馈/);
	assert.doesNotMatch(compound, /class="secondary-links"|openYogaPractice|openPrinciples|人生 OS/);
	assert.match(compound, /重新读取/);
	assert.doesNotMatch(compound, /setTimeout\(\(\) => this\.goBack/);
	assert.doesNotMatch(compound, /今天不推进/);
	assert.doesNotMatch(compound, /必要完成/);
	assert.match(compoundRoute, /compound_threads/);
	assert.match(compoundRoute, /compound_week_plans/);
	assert.match(planningMigration, /CREATE TABLE IF NOT EXISTS compound_week_plans/);
	assert.match(archetypeMigration, /ALTER COLUMN item_id DROP NOT NULL/);
	assert.match(archetypeMigration, /principal_metric_current/);
	assert.match(archetypeMigration, /return_metric_current/);
	assert.match(archetypes, /capability_feedback/);
	assert.match(archetypes, /financial_capital/);
	assert.match(archetypes, /body_capacity/);
	assert.match(compoundRoute, /return_metric_current/);
	assert.match(compoundRoute, /validation_status/);
	assert.match(compoundRoute, /compound_events/);
	assert.match(compoundRoute, /status = 'DRAFT'/);
	assert.match(compoundRoute, /source_diary_id/);
	assert.match(compoundRoute, /principalEventId/);
	assert.match(compoundRoute, /QUIET_DAY/);
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

test('AI analysis never calls the API without an explicit diary context', () => {
  const analysis = source('src/pages/shroom/ai-analysis.vue');

  assert.match(analysis, /v-if="invalidDiaryContext"/);
  assert.match(analysis, /请先选择一篇日记/);
  assert.match(analysis, /if \(!this\.diaryId\) \{[\s\S]*this\.invalidDiaryContext = true;[\s\S]*return;/);
  assert.match(analysis, /if \(!this\.diaryId \|\| !this\.analysisEnabled\) return;/);
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

test('memory review exposes truthful tokens and the actual Shroom charge', () => {
  const memory = source('src/pages/shroom/memory.vue');
  assert.match(memory, /visibleCost/);
  assert.match(memory, /本次回看用量/);
	assert.match(memory, /约 ¥/);
	assert.match(memory, /chargedPoints/);
	assert.match(memory, /已扣/);
	assert.doesNotMatch(memory, /暂无价格|公开单价估算/);
	assert.match(memory, /message\.result\.presentation === 'evidence_list'/);
	assert.match(memory, /item\.reason/);
	assert.match(memory, /analysisItemExcerpt/);
});

test('memory review leads with scannable findings and reveals depth only on demand', () => {
  const memory = source('src/pages/shroom/memory.vue');
  const reflection = source('server/src/reflection-engine.js');
  const preview = source('src/utils/reflection-preview.js');

  assert.match(memory, /这次回看到的/);
  assert.match(memory, /observationHeadline\(item\)/);
  assert.match(memory, /toggleObservation\(message\.id, index\)/);
  assert.match(memory, /isObservationExpanded\(message\.id, index\)/);
  assert.match(memory, /时间线与全部来源/);
  assert.match(memory, /toggleSupplement\(message\.id\)/);
  assert.match(reflection, /"headline":"一句话说清这条发现/);
  assert.match(reflection, /oneSentence\(raw\?\.summary, 120\)/);
  assert.match(preview, /firstSentencePreview/);
  assert.match(preview, /remainingDetail/);
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
  assert.match(detail, /日记与生活线索/);
  assert.match(detail, /状态不会由 AI 自动改变/);
  assert.match(detail, /costSummary/);
  assert.match(me, /未解之问/);
  assert.match(pages, /pages\/shroom\/inquir(?:y|ies)/);
  assert.match(route, /usageContext: \{ userId: req\.user\.id, billable: true, inquiryId/);
  assert.match(route, /d\.ai_allowed/);
  assert.doesNotMatch(route, /req\.body\.userId/);
});

test('Shroom billing keeps diary writing free, rewards seven days without requiring sharing, and gates paid features', () => {
  const wallet = source('src/pages/shroom/wallet.vue');
  const share = source('src/pages/shroom/seven-day-share.vue');
  const login = source('src/pages/public/login.vue');
  const diaryHome = source('src/pages/diary/index.vue');
  const request = source('src/utils/request/index.js');
  const billingRoute = source('server/src/routes/billing.js');
  const billingStore = source('server/src/billing-store.js');
  const billingPolicy = source('server/src/billing-policy.js');
  const legacyCompoundRoute = source('server/src/routes/compound.js');
  const wechatPay = source('server/src/wechat-pay.js');
  const billingRefunds = source('server/src/billing-refunds.js');
  const migration = source('server/sql/036_billing.sql');
  const paymentOperationsMigration = source('server/sql/037_payment_operations.sql');
  const exportRoute = source('server/src/routes/export.js');
  const environmentTemplate = source('server/.env.example');
  const pages = source('src/pages.json');

  assert.match(wallet, /连续记录 7 天/);
  assert.match(wallet, /1 菇点/);
  assert.match(wallet, /10/);
  assert.match(wallet, /20/);
  assert.match(wallet, /50/);
  assert.match(wallet, /100/);
  assert.match(wallet, /自定义/);
  assert.match(wallet, /data-testid="billing-consent"/);
  assert.match(wallet, /确认并保存/);
  assert.match(wallet, /实际 Token 用量对应的供应商成本 × 2\.5/);
  assert.match(wallet, /data-testid="commercial-rollout"/);
  assert.match(wallet, /免费测试期全部开放/);
  assert.match(wallet, /当前免费测试，不充值、不扣费/);
  assert.match(wallet, /测试期开放/);
  assert.match(billingPolicy, /复利系统/);
  assert.match(billingPolicy, /未解之问/);
  assert.match(billingPolicy, /身心问题/);
  assert.match(share, /分享完全自愿，不影响菇点奖励/);
  assert.doesNotMatch(share, /diary\.content|diaryContent|loadDiary/);
  assert.match(login, /acceptedTerms/);
  assert.match(login, /琼ICP备2020004041号-1/);
  assert.match(diaryHome, /琼ICP备2020004041号-1/);
  assert.match(diaryHome, /https:\/\/beian\.miit\.gov\.cn\//);
  assert.match(request, /case 402:[\s\S]{0,80}handleBillingRequired/);
  assert.match(billingRoute, /merchantLegalName/);
  assert.match(billingRoute, /paymentConfiguration\(\)\.legalReady/);
  assert.match(billingRoute, /WALLET_BILLING/);
  assert.match(environmentTemplate, /BILLING_MERCHANT_LEGAL_NAME="海口溯野体育文化有限公司"/);
  assert.match(environmentTemplate, /BILLING_INVOICE_LEGAL_NAME="海口溯野体育文化有限公司"/);
  assert.match(environmentTemplate, /BILLING_MERCHANT_TAX_ID=\n/);
  assert.match(environmentTemplate, /BILLING_MERCHANT_ADDRESS=\n/);
  assert.match(wallet, /小程序内暂不提供充值/);
  assert.doesNotMatch(wallet, /uni\.requestPayment/);
  assert.match(wallet, /WeixinJSBridge/);
  assert.match(wallet, /billingWechatJsapiAuthUrl/);
  assert.match(wallet, /billingWechatJsapiPayer/);
  assert.match(wallet, /sessionStorage/);
  assert.doesNotMatch(wallet, /payment\.h5Url/);
  assert.doesNotMatch(wallet, /redirect_url=/);
  assert.match(billingRoute, /\/payments\/wechat-jsapi\/auth-url/);
  assert.match(billingRoute, /\/payments\/wechat-jsapi\/payer/);
  assert.match(billingRoute, /target\.pathname !== '\/pages\/shroom\/wallet'/);
  assert.match(wechatPay, /WECHAT_VIRTUAL_PAYMENT_REQUIRED/);
  assert.match(wechatPay, /queryPayment/);
  assert.match(billingRefunds, /requestRefund/);
  assert.match(billingRefunds, /refundPaidBalance/);
  assert.match(billingStore, /SEVEN_DAY_REWARD_POINT_CENTS/);
  assert.match(billingStore, /requireFeature/);
  assert.match(billingStore, /BILLING_AGREEMENT_REQUIRED/);
  assert.match(billingStore, /ON CONFLICT \(user_id, document_key, document_version, acceptance_source\) DO NOTHING/);
  assert.match(legacyCompoundRoute, /requireFeature\('compound'\)/);
  assert.doesNotMatch(legacyCompoundRoute, /ownerUserIds/);
  assert.doesNotMatch(billingStore, /allowDebt:\s*true/);
  assert.doesNotMatch(billingStore, /debt_cents|debtDelta/);
  assert.doesNotMatch(wallet, /debtPoints|待补足/);
  assert.match(billingStore, /charge_status = 'ABSORBED'/);
  assert.match(migration, /wallet_ledger/);
  assert.match(migration, /billing_feature_entitlements/);
  assert.match(migration, /billing_refund_items/);
  assert.match(paymentOperationsMigration, /billing_refund_items/);
  assert.match(migration, /provider_transaction_id/);
  assert.match(exportRoute, /billingPaymentOrders/);
  assert.match(exportRoute, /legalAcceptances/);
  assert.match(pages, /pages\/shroom\/wallet/);
  assert.match(pages, /pages\/shroom\/seven-day-share/);
});

test('wellbeing records and inquiries independently interpret the same diary', () => {
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
  const decouplingMigration = source('server/sql/027_decouple_inquiries_wellbeing.sql');

  assert.match(wellbeing, /从日记独立提取/);
  for (const label of ['心理', '身体', '睡眠', '习惯', '测量', '检查']) assert.match(wellbeing, new RegExp(label));
  assert.match(me, /openWellbeing/);
  assert.match(home, /wellbeing-glimpse/);
  assert.match(list, /同一篇日记[\s\S]*独立理解/);
  assert.doesNotMatch(list, /typeFilters/);
  assert.match(list, /HealthConsentSheet/);
  assert.match(analysis, /HealthConsentSheet/);
  assert.match(analysis, /与你是否创建未解之问无关/);
  assert.doesNotMatch(list, /uni\.showModal\(/);
  assert.doesNotMatch(analysis, /uni\.showModal\([\s\S]*?健康观察/);
  assert.match(consent, /不读取、不引用、也不改写/);
  assert.match(consent, /日记线索/);
  assert.match(consent, /不是医学诊断/);
  assert.match(detail, /直接来自日记/);
  assert.doesNotMatch(detail, /从身心记录引用证据/);
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
  assert.doesNotMatch(wellbeingRoutes, /inquiry_evidence|wellbeing_record_id/);
  assert.match(prompt, /独立的事实层/);
  assert.match(prompt, /不受身心记录的确认/);
  assert.match(prompt, /healthExtraction/);
  assert.match(prompt, /psychologicalObservations/);
  assert.match(prompt, /physicalObservations/);
  assert.match(prompt, /lifestyleFactors/);
  assert.match(prompt, /environmentFactors/);
  assert.doesNotMatch(prompt, /healthInquiryLinks/);
  assert.match(prompt, /missingInformation/);
  assert.match(prompt, /redFlags/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS wellbeing_records/);
  assert.match(migration, /wellbeing_record_id uuid REFERENCES wellbeing_records\(id\) ON DELETE SET NULL/);
  assert.match(migration, /source_type = 'WELLBEING'/);
  assert.match(decouplingMigration, /DROP COLUMN IF EXISTS wellbeing_record_id/);
  assert.match(decouplingMigration, /DROP COLUMN IF EXISTS health_observation/);
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
