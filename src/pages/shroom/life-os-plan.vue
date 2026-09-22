<template>
	<view class="page">
		<shroom-page-top-spacer />
		<view class="shell">
			<view class="header">
				<button class="back" aria-label="返回" @tap="goBack">‹</button>
				<view class="heading"><text class="kicker">COMPOUND DIRECTIONS</text><text class="title">长期方向</text><text class="subtitle">五类 20 项是选择与归档，不是二十条待办或每日打卡。</text></view>
			</view>

			<view class="privacy"><view></view><text>{{ selectionMode ? '选择一个方向后会返回复利系统，由你确认目标和最小一步。' : '复利方向及相关记录仅本人可见，不随日记公开，也不进入发现。' }}</text></view>

			<view class="focus-panel">
				<view class="section-head"><view><text class="section-kicker">CURRENT FOCUS</text><text class="section-title">当前关注范围</text></view><button @tap="toggleFocusEditor">{{ editingFocus ? '取消' : '调整' }}</button></view>
				<view v-if="focus.length" class="focus-list">
					<view v-for="item in focus" :key="item.stableKey" class="focus-item" @tap="openItem(item)">
						<text class="focus-number">{{ item.stableKey }}</text><view><text>{{ item.name }}</text><text>{{ item.currentNextStep || item.minimumAction || '进入后写下这周最小的一步' }}</text></view><text>›</text>
					</view>
				</view>
				<view v-else class="focus-empty"><text>还没有单独标记关注方向</text><text>开始推进时不需要先配置这里；需要时再选 1–3 项。</text></view>
				<view v-if="editingFocus" class="focus-editor">
					<text class="focus-guidance">选择 1–3 项。这里只调整关注范围，不会自动创建待办。</text>
					<view v-for="item in activeItems" :key="item.stableKey" class="focus-choice" :class="{ selected: focusKeys.includes(item.stableKey) }" @tap="toggleFocus(item)"><view>{{ focusKeys.includes(item.stableKey) ? '✓' : '' }}</view><text>{{ item.stableKey }} · {{ item.name }}</text></view>
					<button class="primary" :disabled="savingFocus" @tap="saveFocus">{{ savingFocus ? '保存中…' : `确认关注范围 · ${focusKeys.length}/3` }}</button>
				</view>
			</view>

			<view class="items-panel">
				<view class="section-head"><view><text class="section-kicker">FIVE AREAS · 20 DIRECTIONS</text><text class="section-title">全部长期方向</text></view><text>{{ overview.counts.total || 20 }} 项</text></view>
				<view v-for="group in overview.sections" :key="group.section" class="group">
					<view class="group-head" @tap="toggleSection(group.section)"><view><text>{{ group.section }}</text><text>{{ activeCount(group.items) }} 项维护中</text></view><text>{{ openSections.includes(group.section) ? '−' : '+' }}</text></view>
					<view v-if="openSections.includes(group.section)" class="group-items">
						<view v-for="item in group.items" :key="item.stableKey" class="item-row" :class="{ paused: item.status === 'PAUSED' }" @tap="openItem(item)">
							<text class="item-number">{{ item.stableKey }}</text><view><text>{{ item.name }}</text><text>{{ item.currentNextStep || item.minimumAction || '尚未设置最小行动' }}</text></view><view class="item-meta"><text v-if="item.isWeekFocus">本周</text><text v-if="item.relatedRecordCount">{{ item.relatedRecordCount }} 条记录</text><text v-if="item.status === 'PAUSED'">已暂停</text></view>
							<button v-if="selectionMode && item.status === 'ACTIVE'" class="select-direction" :disabled="item.hasActiveThread" @tap.stop="selectDirection(item)">{{ item.hasActiveThread ? '推进中' : '选择' }}</button>
						</view>
					</view>
				</view>
			</view>

			<view class="records-panel">
				<view class="section-head"><view><text class="section-kicker">RECENT EVIDENCE</text><text class="section-title">最近关联记录</text></view></view>
				<view v-if="overview.recentRecords.length" class="record-list">
					<view v-for="item in overview.recentRecords" :key="item.id" class="record" @tap="openDiary(item)"><view><text>{{ item.itemKey }} · {{ item.itemName }}</text><text>{{ recordTypeLabel(item.recordType) }} · {{ item.sourceDate || '日期未知' }} · {{ item.origin === 'AI' ? 'AI 关联' : '手动关联' }}</text></view><text>{{ item.evidenceExcerpt || item.summary }}</text></view>
				</view>
				<view v-else class="quiet-empty">日记分析发现真实相关的计划、行动、结果或观察后，会在这里留下可纠正的关联。</view>
			</view>

			<view class="review-panel" @tap="openWeekly"><view><text class="section-kicker">EVIDENCE REVIEW</text><text class="section-title">阶段回看</text><text>按真实推进与结果，决定继续、调整还是停止。</text></view><text>›</text></view>
			<view class="principles-link" @tap="openPrinciples"><view><text>判断原则与版本</text><text>管理比 20 项更抽象、需要你确认签发的判断标准</text></view><text>›</text></view>
			<view class="export-row"><button @tap="exportData('json')">导出 JSON</button><button @tap="exportData('markdown')">导出 Markdown</button></view>
		</view>
	</view>
</template>

<script>
import { compoundExport } from '@/api/compound-system';
import { lifeOsPlanFocus, lifeOsPlanHome } from '@/api/shroom-system';

export default {
	data() {
		return {
			statusBarHeight: 0,
			overview: { privacy: '', focus: [], sections: [], recentRecords: [], latestReview: null, counts: {} },
			openSections: ['健康与生活'],
			selectionMode: false,
			editingFocus: false,
			focusKeys: [],
			savingFocus: false
		};
	},
	computed: {
		focus() { return Array.isArray(this.overview.focus) ? this.overview.focus : []; },
		activeItems() { return (this.overview.sections || []).reduce((all, group) => all.concat(group.items || []), []).filter(item => item.status === 'ACTIVE'); },
		reviewDescription() {
			const review = this.overview.latestReview;
			if (!review) return '由你主动生成草稿，编辑确认后才进入历史。';
			return review.status === 'DRAFT' ? '有一份待确认草稿' : `最近确认：${review.weekStart}`;
		}
	},
	onLoad(options) { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; this.selectionMode = options && options.select === '1'; },
	onShow() { this.load(); },
	methods: {
		async load() {
			try { const res = await this.$http.get(lifeOsPlanHome); this.overview = { ...this.overview, ...(res.data || {}) }; }
			catch (error) { console.error('加载复利方向失败', error); }
		},
		activeCount(items) { return (items || []).filter(item => item.status === 'ACTIVE').length; },
		toggleSection(section) { this.openSections = this.openSections.includes(section) ? this.openSections.filter(item => item !== section) : [...this.openSections, section]; },
		toggleFocusEditor() { this.editingFocus = !this.editingFocus; this.focusKeys = this.focus.map(item => item.stableKey); },
		toggleFocus(item) {
			if (this.focusKeys.includes(item.stableKey)) this.focusKeys = this.focusKeys.filter(key => key !== item.stableKey);
			else if (this.focusKeys.length < 3) this.focusKeys = [...this.focusKeys, item.stableKey];
			else uni.showToast({ title: '本周重点最多 3 项', icon: 'none' });
		},
		async saveFocus() {
			if (this.savingFocus) return;
			this.savingFocus = true;
			try { await this.$http.put(lifeOsPlanFocus, { itemKeys: this.focusKeys }); this.editingFocus = false; await this.load(); uni.showToast({ title: '关注范围已保存', icon: 'success' }); }
			catch (error) { console.error('保存关注范围失败', error); }
			finally { this.savingFocus = false; }
		},
		recordTypeLabel(value) { return { PLAN: '计划', ACTION: '已行动', RESULT: '结果', OBSERVATION: '观察', INQUIRY: '疑问' }[value] || value; },
		openItem(item) { if (item && item.stableKey) uni.navigateTo({ url: `/pages/shroom/life-os-item?key=${item.stableKey}` }); },
		selectDirection(item) {
			if (!item || !item.stableKey || item.hasActiveThread) return;
			uni.setStorageSync('compoundStartItemKey', item.stableKey);
			const pages = getCurrentPages();
			if (pages.length > 1) uni.navigateBack();
			else uni.redirectTo({ url: `/pages/shroom/compound?itemKey=${item.stableKey}` });
		},
		openDiary(item) { if (item && item.diaryId) uni.navigateTo({ url: `/pages/diary/edit?id=${item.diaryId}` }); },
		openWeekly() { uni.navigateTo({ url: '/pages/shroom/life-os-weekly' }); },
		openPrinciples() { uni.navigateTo({ url: '/pages/shroom/life-os' }); },
		async exportData(kind) {
			try {
				const res = await this.$http.get(compoundExport);
				const content = kind === 'json' ? JSON.stringify(res.data.json, null, 2) : res.data.markdown;
				const filename = `shroom-compound-${Date.now()}.${kind === 'json' ? 'json' : 'md'}`;
				// #ifdef H5
				const blob = new Blob([content], { type: kind === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' });
				const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
				// #endif
				// #ifndef H5
				uni.setClipboardData({ data: content, success: () => uni.showToast({ title: '已复制导出内容', icon: 'none' }) });
				// #endif
			} catch (error) { console.error('导出长期方向失败', error); }
		},
		goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack(); else uni.switchTab({ url: '/pages/diary/index' }); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1; background: transparent; border: 0; }
button::after { border: 0; }
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: #f1f8e9; }
.shell { box-sizing: border-box; padding: 30rpx 34rpx 130rpx; }
.header { display: flex; align-items: flex-start; gap: 20rpx; }
.back { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.7); font-size: 50rpx; }
.heading { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.kicker, .section-kicker { font-size: 15rpx; font-weight: 720; letter-spacing: 2.5rpx; color: #718075; }
.title { margin-top: 8rpx; font-family: Georgia, 'Songti SC', serif; font-size: 42rpx; font-weight: 730; }
.subtitle { margin-top: 9rpx; color: #6d786f; font-size: 19rpx; line-height: 1.55; }
.privacy { display: flex; align-items: flex-start; gap: 13rpx; margin-top: 30rpx; padding: 19rpx 22rpx; border-radius: 22rpx; background: #e1ebd9; color: #526156; font-size: 18rpx; line-height: 1.55; }
.privacy view { width: 9rpx; height: 9rpx; margin-top: 9rpx; flex: 0 0 9rpx; border-radius: 50%; background: #5d7562; }
.focus-panel, .items-panel, .records-panel { margin-top: 24rpx; padding: 29rpx; border-radius: 31rpx; background: #fff; }
.focus-panel { background: #172019; color: #fff; }
.section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20rpx; }
.section-head > view { display: flex; flex-direction: column; gap: 8rpx; }
.section-title { font-family: Georgia, 'Songti SC', serif; font-size: 28rpx; font-weight: 680; }
.section-head > button { padding: 12rpx 0 12rpx 22rpx; color: #b8c5b9; font-size: 19rpx; }
.section-head > text { color: #7a867d; font-size: 18rpx; }
.focus-list { margin-top: 20rpx; }
.focus-item { display: flex; align-items: flex-start; gap: 17rpx; padding: 21rpx 0; border-top: 1rpx solid rgba(255,255,255,.11); }
.focus-number { color: #9fb09f; font-size: 17rpx; font-weight: 720; letter-spacing: 1rpx; }
.focus-item > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 8rpx; }
.focus-item > view text:first-child { font-size: 23rpx; font-weight: 680; }
.focus-item > view text:last-child { color: #afbbaf; font-size: 18rpx; line-height: 1.55; }
.focus-item > text:last-child { color: #8f9c91; font-size: 29rpx; }
.focus-empty { display: flex; margin-top: 24rpx; padding: 26rpx 0 5rpx; flex-direction: column; gap: 10rpx; border-top: 1rpx solid rgba(255,255,255,.1); }
.focus-empty text:first-child { font-size: 23rpx; font-weight: 680; }.focus-empty text:last-child { color: #aab7ab; font-size: 18rpx; line-height: 1.55; }
.focus-editor { margin-top: 23rpx; padding-top: 22rpx; border-top: 1rpx solid rgba(255,255,255,.11); }
.focus-guidance { display: block; margin-bottom: 13rpx; color: #aebbae; font-size: 17rpx; }
.focus-choice { display: flex; align-items: center; gap: 13rpx; padding: 15rpx 0; color: #c3cdc4; font-size: 19rpx; }
.focus-choice > view { display: flex; width: 29rpx; height: 29rpx; align-items: center; justify-content: center; border: 1rpx solid #829084; border-radius: 8rpx; font-size: 17rpx; }
.focus-choice.selected { color: #fff; }.focus-choice.selected > view { border-color: #dce9d5; background: #dce9d5; color: #172019; }
.primary { width: 100%; margin-top: 20rpx; padding: 23rpx; border-radius: 999rpx; background: #e5efd9; color: #172019; font-size: 20rpx; font-weight: 700; }
.group { margin-top: 17rpx; border-top: 1rpx solid #e9ede7; }
.group-head { display: flex; align-items: center; justify-content: space-between; padding: 22rpx 0 10rpx; }
.group-head > view { display: flex; flex-direction: column; gap: 5rpx; }.group-head > view text:first-child { font-size: 22rpx; font-weight: 700; }.group-head > view text:last-child { color: #849087; font-size: 16rpx; }.group-head > text { color: #758078; font-size: 28rpx; }
.item-row { display: flex; align-items: flex-start; gap: 14rpx; padding: 19rpx 0; border-top: 1rpx solid #f0f2ef; }
.item-row.paused { opacity: .5; }.item-number { flex: 0 0 30rpx; padding-top: 2rpx; color: #809086; font-size: 16rpx; font-weight: 720; }
.item-row > view:nth-child(2) { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }.item-row > view:nth-child(2) text:first-child { font-size: 21rpx; font-weight: 670; }.item-row > view:nth-child(2) text:last-child { display: -webkit-box; overflow: hidden; color: #758078; font-size: 17rpx; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.item-meta { display: flex; max-width: 110rpx; flex-direction: column; align-items: flex-end; gap: 5rpx; }.item-meta text { color: #718075; font-size: 14rpx; white-space: nowrap; }
.select-direction { display: flex; min-height: 52rpx; padding: 0 18rpx; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 999rpx; background: #243329; color: #fff; font-size: 15rpx; }
.select-direction[disabled] { background: #e7ece5; color: #7c877e; }
.record { padding: 22rpx 0; border-top: 1rpx solid #e9ede7; }.record:first-child { margin-top: 15rpx; }.record > view { display: flex; justify-content: space-between; gap: 14rpx; }.record > view text:first-child { font-size: 19rpx; font-weight: 680; }.record > view text:last-child { flex: 0 0 auto; color: #7c887f; font-size: 15rpx; }.record > text { display: -webkit-box; margin-top: 10rpx; overflow: hidden; color: #59655c; font-size: 19rpx; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.quiet-empty { margin-top: 20rpx; color: #7a867d; font-size: 18rpx; line-height: 1.6; }
.review-panel, .principles-link { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-top: 24rpx; padding: 27rpx 29rpx; border-radius: 29rpx; background: #e6edcf; }
.review-panel > view, .principles-link > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }.review-panel > view text:last-child, .principles-link > view text:last-child { color: #657163; font-size: 17rpx; line-height: 1.5; }.review-panel > text, .principles-link > text { font-size: 31rpx; color: #677366; }
.principles-link { background: rgba(255,255,255,.65); }.principles-link > view text:first-child { font-size: 22rpx; font-weight: 690; }
.export-row { display: flex; gap: 14rpx; margin-top: 22rpx; }.export-row button { flex: 1; padding: 21rpx; border: 1rpx solid rgba(23,32,25,.1); border-radius: 999rpx; color: #58665a; font-size: 18rpx; }
/* #ifdef H5 */
@media (min-width: 980px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 900px; margin: 0 auto; padding: 64px 44px 100px; } }
/* #endif */
</style>
