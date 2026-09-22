'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('WeChat project keeps a formal appid, domain checks and a package-size guard', () => {
	const manifest = JSON.parse(source('src/manifest.json'));
	const project = JSON.parse(source('src/project.config.json'));
	const packageJson = JSON.parse(source('package.json'));
	const prepareScript = source('scripts/prepare-wechat-project.js');
	assert.match(manifest['mp-weixin'].appid, /^wx[a-z0-9]{16}$/);
	assert.equal(project.appid, manifest['mp-weixin'].appid);
	assert.equal(project.setting.urlCheck, true);
	assert.match(prepareScript, /project\.private\.config\.json/);
	assert.match(prepareScript, /setting: \{ urlCheck: false \}/);
	assert.ok(project.packOptions.ignore.some(item => item.type === 'folder' && item.value === 'static/css'));
	assert.equal(packageJson.scripts['build:wechat-project'], 'npm run build:mp-weixin && npm run check:mp-weixin');
	assert.equal(packageJson.scripts['postbuild:mp-weixin'], 'node scripts/prepare-wechat-project.js');
});

test('native clients use the live Shroom API instead of an unavailable placeholder host', () => {
	const config = source('src/config/index.config.js');
	assert.match(config, /https:\/\/shroom\.evox\.run/);
	assert.doesNotMatch(config, /shroom\.surfplus\.xyz/);
});

test('the legacy Shroom edge forwards API traffic to the canonical service', () => {
	const nginx = source('server/deploy/shroom-surfplus-edge.nginx.conf');
	assert.match(nginx, /proxy_pass https:\/\/shroom\.evox\.run;/);
	assert.match(nginx, /proxy_ssl_server_name on;/);
	assert.match(nginx, /proxy_ssl_name shroom\.evox\.run;/);
	assert.match(nginx, /proxy_ssl_verify on;/);
	assert.match(nginx, /proxy_ssl_trusted_certificate \/etc\/pki\/tls\/certs\/ca-bundle\.crt;/);
	assert.match(nginx, /proxy_set_header Host shroom\.evox\.run;/);
	assert.doesNotMatch(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3102;/);
});

test('mini program templates avoid unsupported dynamic keys and H5 drag events', () => {
	const review = source('src/pages/shroom/daily-review.vue');
	const inquiry = source('src/pages/shroom/inquiry.vue');
	const yoga = source('src/pages/shroom/yoga-practice.vue');
	const project = source('src/pages/todo/project.vue');
	assert.doesNotMatch(review, /:key="'[^']+'\s*\+/);
	assert.match(yoga, /:key="videoRenderKey"/);
	assert.doesNotMatch(inquiry, /\([^{}\n]*\|\|\s*\[\]\)\.length/);
	assert.match(project, /#ifdef H5[\s\S]*draggable="true"[\s\S]*#ifndef H5/);
	assert.match(project, /#ifdef H5\n\s*dragStart/);
});

test('browser-only APIs are excluded from the WeChat build at source', () => {
	const diary = source('src/pages/diary/edit.vue');
	const codex = source('src/pages/shroom/data-sources/codex.vue');
	const share = source('src/pages/shroom/seven-day-share.vue');
	assert.match(diary, /#ifdef H5[\s\S]*async startH5Recording/);
	assert.match(diary, /#ifdef H5[\s\S]*async finishH5Recording/);
	assert.match(codex, /#ifdef H5[\s\S]*copyWithBrowserFallback/);
	assert.match(share, /#ifdef H5[\s\S]*async copyShareText/);
});

test('WeChat pages hide private content when the app enters the background', () => {
	const pages = JSON.parse(source('src/pages.json'));
	assert.equal(pages.globalStyle['mp-weixin'].visualEffectInBackground, 'hidden');
});

test('photo and microphone entry points complete WeChat privacy authorization first', () => {
	const privacy = source('src/utils/wechat-privacy.js');
	const diary = source('src/pages/diary/edit.vue');
	const todo = source('src/pages/todo/detail.vue');
	assert.match(privacy, /wx\.requirePrivacyAuthorize/);
	assert.match(privacy, /请先阅读并同意小程序隐私保护指引/);
	assert.match(diary, /await requireWechatPrivacyAuthorization\(\);[\s\S]*uni\.chooseImage/);
	assert.match(diary, /await requireWechatPrivacyAuthorization\(\);[\s\S]*this\.startPlatformRecording\(\)/);
	assert.match(todo, /await requireWechatPrivacyAuthorization\(\);[^\n]*uni\.chooseImage/);
	assert.match(diary, /sourceType: \['album'\]/);
	assert.match(todo, /sourceType: \['album'\]/);
});

test('WeChat diary keeps today writable while historical dates stay read-only', () => {
	const diary = source('src/pages/diary/index.vue');
	const editor = source('src/pages/diary/edit.vue');
	const route = source('server/src/routes/diaries.js');
	const login = source('src/pages/public/login.vue');
	assert.match(diary, /#ifdef MP-WEIXIN[\s\S]*redirectGuestToLogin/);
	assert.match(diary, /isSelectedToday/);
	assert.match(diary, /timedDiarySlots/);
	assert.match(diary, /for \(let hour = 8; hour < 22; hour\+\+\)/);
	assert.match(diary, /今天可以补充当下，过去的日记只能查看/);
	assert.match(diary, /过去的日记不能修改或补写/);
	assert.match(diary, /sourceFilterOptions/);
	assert.match(diary, /this\.activityRecords\.forEach/);
	assert.doesNotMatch(diary, /visibleActivityRecords|hiddenActivityCount/);
	assert.match(editor, /isReadOnly/);
	assert.match(editor, /过去的日记只能查看，不能修改/);
	assert.match(route, /assertTodayDiaryWrite/);
	assert.match(login, /暂不登录，浏览公开菇卡/);
});

test('data-heavy wellbeing page renders progressively on Mini Program', () => {
	const wellbeing = source('src/pages/shroom/wellbeing.vue');
	assert.match(wellbeing, /pageSize: 8/);
	assert.match(wellbeing, /visibleHypotheses\(\).*slice\(0, 3\)/s);
	assert.match(wellbeing, /查看其余 \{\{ hiddenHypothesisCount \}\} 个方向/);
	assert.match(wellbeing, /继续看更早记录/);
});

test('custom navigation pages reserve the full WeChat capsule titlebar', () => {
	const main = source('src/main.js');
	const spacer = source('src/components/ShroomPageTopSpacer.vue');
	const actionPages = [
		'src/pages/shroom/me.vue',
		'src/pages/shroom/compound.vue',
		'src/pages/shroom/cards.vue',
		'src/pages/shroom/friends.vue',
		'src/pages/shroom/inquiries.vue',
		'src/pages/shroom/inquiry.vue',
		'src/pages/shroom/memory.vue',
		'src/pages/shroom/reminders.vue',
		'src/pages/shroom/wellbeing.vue',
		'src/pages/shroom/yoga-practice.vue',
		'src/pages/common/cards/detail.vue',
		'src/pages/common/diary/search.vue',
		'src/pages/diary/edit.vue',
		'src/pages/todo/detail.vue',
		'src/pages/todo/project.vue'
	];

	assert.match(main, /Vue\.component\('shroom-page-top-spacer', ShroomPageTopSpacer\)/);
	assert.match(spacer, /getMenuButtonBoundingClientRect/);
	assert.match(spacer, /statusBarHeight \+ 44/);
	assert.match(spacer, /Number\(menuButton\.bottom\) \+ verticalGap/);
	for (const page of actionPages) {
		assert.match(source(page), /<shroom-page-top-spacer\s*\/>/, `${page} must render below the WeChat capsule`);
	}
});
