<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header"><button class="back" aria-label="返回" @tap="goBack">‹</button><view><text class="kicker">EVIDENCE REVIEW</text><text class="title">阶段回看</text><text class="subtitle">只看真实做过和留下的结果，再决定继续、调整或停止。</text></view></view>

			<view class="scope-card">
				<view class="scope-heading"><view><text>回看范围</text><text>默认最近 30 天，也可以自己选择。</text></view></view>
				<view class="date-row"><picker mode="date" :value="scopeStart" @change="scopeStart = $event.detail.value"><view><text>从</text><text>{{ scopeStart }}</text></view></picker><text>—</text><picker mode="date" :value="scopeEnd" @change="scopeEnd = $event.detail.value"><view><text>到</text><text>{{ scopeEnd }}</text></view></picker></view>
				<button class="primary" :disabled="generating" @tap="generateDraft">{{ generating ? '正在按证据整理…' : '主动发起一次回看' }}</button>
				<text class="boundary">生成的是可编辑草稿，不会自动停止推进、创建待办或修改人生 OS。</text>
			</view>

			<view v-if="draft" class="draft-card">
				<view class="draft-head"><view><text class="kicker">DRAFT</text><text>确认前可以修改</text></view><text v-if="draft.costSummary && draft.costSummary.totalTokens">{{ draft.costSummary.totalTokens }} tokens · {{ costLabel(draft.costSummary) }}</text></view>
				<label class="field"><text>这一阶段</text><textarea v-model="draft.result.summary" maxlength="1800" auto-height /></label>
				<view v-for="section in reviewSections" :key="section.key" class="review-section">
					<text class="section-title">{{ section.label }}</text>
					<view v-if="draft.result[section.key] && draft.result[section.key].length">
						<view v-for="(item, index) in draft.result[section.key]" :key="index" class="evidence-item">
							<textarea v-model="item.text" maxlength="1200" auto-height />
							<text>依据 {{ item.sourceRefs.join('、') }}</text>
						</view>
					</view>
					<text v-else class="empty">这一项暂时没有足够证据。</text>
				</view>
				<view class="decision"><text>接下来</text><view><button v-for="item in decisions" :key="item.value" :class="{ active: draft.result.decision === item.value }" @tap="draft.result.decision = item.value">{{ item.label }}</button></view></view>
				<label class="field"><text>下一步</text><textarea v-model="draft.result.nextStep" maxlength="1000" auto-height placeholder="由你确认接下来从哪里继续" /></label>
				<button class="primary" :disabled="confirming" @tap="confirmDraft">{{ confirming ? '正在确认…' : '确认并放入回看历史' }}</button>
			</view>

			<view class="history-card">
				<view class="section-head"><view><text class="kicker">HISTORY</text><text>回看历史</text></view></view>
				<view v-if="history.length">
					<view v-for="item in history" :key="item.id" class="history-row"><view><text>{{ item.scopeStart }} — {{ item.scopeEnd }}</text><text>{{ decisionLabel(item.result.decision) }}</text></view><text>{{ item.result.summary || '已确认本阶段记录' }}</text></view>
				</view>
				<text v-else class="empty history-empty">完成一次真实推进并记录结果后，再来主动回看。</text>
			</view>

			<view class="export-row"><button @tap="exportData('json')">导出 JSON</button><button @tap="exportData('markdown')">导出 Markdown</button></view>
			<text class="privacy">导出只包含复利方向、推进、结果、引用和回看；不包含无关日记全文。</text>
		</view>
	</view>
</template>

<script>
import { compoundExport, compoundReviewConfirm, compoundReviewDraft, compoundReviews } from '@/api/compound-system';

function shanghaiDate(value) { return new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10); }

export default {
	data() {
		const end = new Date();
		const start = new Date(end.getTime() - 29 * 86400000);
		return {
			statusBarHeight: 0,
			scopeStart: shanghaiDate(start),
			scopeEnd: shanghaiDate(end),
			generating: false,
			confirming: false,
			draft: null,
			history: [],
			reviewSections: [
				{ key: 'actualActions', label: '实际做了什么' },
				{ key: 'accumulations', label: '留下了什么' },
				{ key: 'effectiveMethods', label: '什么方法有效' },
				{ key: 'ineffectiveMethods', label: '什么方法无效或尚未验证' }
			],
			decisions: [{ value: 'CONTINUE', label: '继续' }, { value: 'ADJUST', label: '调整' }, { value: 'STOP', label: '停止' }]
		};
	},
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; this.loadHistory(); },
	methods: {
		async loadHistory() {
			try {
				const response = await this.$http.get(compoundReviews, { page: 1, pageSize: 30 });
				const rows = response.data && response.data.list ? response.data.list : [];
				this.draft = rows.find(item => item.status === 'DRAFT') || null;
				this.history = rows.filter(item => item.status === 'CONFIRMED');
			} catch (error) { console.error('加载阶段回看失败', error); }
		},
		async generateDraft() {
			if (this.generating) return;
			this.generating = true;
			try {
				const response = await this.$http.post(compoundReviewDraft, { scopeStart: this.scopeStart, scopeEnd: this.scopeEnd });
				this.draft = response.data;
			} catch (error) { uni.showToast({ title: '这个阶段还没有足够的已确认记录', icon: 'none' }); }
			finally { this.generating = false; }
		},
		async confirmDraft() {
			if (!this.draft || this.confirming) return;
			this.confirming = true;
			try {
				await this.$http.post(compoundReviewConfirm(this.draft.id), { result: this.draft.result });
				this.draft = null;
				await this.loadHistory();
				uni.showToast({ title: '阶段回看已确认', icon: 'success' });
			} catch (error) { uni.showToast({ title: '回看没有确认成功', icon: 'none' }); }
			finally { this.confirming = false; }
		},
		decisionLabel(value) { return { CONTINUE: '继续', ADJUST: '调整', STOP: '停止' }[value] || '已确认'; },
		costLabel(cost) { return cost.priced && cost.costCny !== null ? `约 ¥${Number(cost.costCny).toFixed(4)}` : '暂无可靠价格'; },
		async exportData(kind) {
			try {
				const response = await this.$http.get(compoundExport);
				const content = kind === 'json' ? JSON.stringify(response.data.json, null, 2) : response.data.markdown;
				const filename = `shroom-compound-${Date.now()}.${kind === 'json' ? 'json' : 'md'}`;
				// #ifdef H5
				const blob = new Blob([content], { type: kind === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' });
				const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
				// #endif
				// #ifndef H5
				uni.setClipboardData({ data: content, success: () => uni.showToast({ title: '已复制导出内容', icon: 'none' }) });
				// #endif
			} catch (error) { uni.showToast({ title: '导出暂时没有完成', icon: 'none' }); }
		},
		goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack(); else uni.navigateTo({ url: '/pages/shroom/compound' }); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1.25; background: transparent; border: 0; }button::after { border: 0; }
textarea { box-sizing: border-box; width: 100%; min-height: 105rpx; padding: 18rpx; border: 1rpx solid rgba(25,38,29,.12); border-radius: 18rpx; background: #f7faf4; color: #18231b; font-size: 20rpx; line-height: 1.55; overflow-wrap: anywhere; }
.page { min-height: 100vh; background: #f1f8e9; color: #18231b; }.status-bar { background: #f1f8e9; }.shell { box-sizing: border-box; padding: 30rpx 33rpx calc(120rpx + env(safe-area-inset-bottom)); }.header { display: flex; align-items: flex-start; gap: 19rpx; }.back { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(24,35,27,.1); border-radius: 50%; background: rgba(255,255,255,.72); font-size: 45rpx; }.header > view { display: flex; flex-direction: column; gap: 7rpx; }.kicker { color: #718075; font-size: 15rpx; font-weight: 740; letter-spacing: 2.3rpx; }.title { font-family: Georgia, 'Songti SC', serif; font-size: 39rpx; font-weight: 720; }.subtitle { color: #6d796f; font-size: 18rpx; line-height: 1.5; }
.scope-card, .draft-card, .history-card { margin-top: 27rpx; padding: 27rpx; border-radius: 29rpx; background: #fff; }.scope-heading > view { display: flex; flex-direction: column; gap: 6rpx; }.scope-heading text:first-child, .draft-head > view text:last-child, .section-head > view text:last-child { font-family: Georgia, 'Songti SC', serif; font-size: 25rpx; font-weight: 700; }.scope-heading text:last-child { color: #748078; font-size: 16rpx; }.date-row { display: flex; margin-top: 21rpx; align-items: center; justify-content: space-between; gap: 10rpx; }.date-row picker { flex: 1; }.date-row picker view { display: flex; padding: 18rpx; justify-content: space-between; border-radius: 18rpx; background: #f0f5ec; font-size: 17rpx; }.date-row picker view text:first-child { color: #7b867e; }.date-row > text { color: #899189; }
.primary { display: flex; box-sizing: border-box; width: 100%; min-height: 74rpx; margin-top: 22rpx; padding: 14rpx 22rpx; align-items: center; justify-content: center; border-radius: 999rpx; background: #1c2a21; color: #fff; font-size: 19rpx; font-weight: 700; }.primary[disabled] { opacity: .45; }.boundary, .privacy { display: block; margin-top: 13rpx; color: #828c84; font-size: 15rpx; line-height: 1.5; text-align: center; }
.draft-head, .section-head { display: flex; justify-content: space-between; gap: 16rpx; }.draft-head > view, .section-head > view { display: flex; flex-direction: column; gap: 7rpx; }.draft-head > text { color: #7b867e; font-size: 14rpx; }.field { display: flex; margin-top: 22rpx; flex-direction: column; gap: 9rpx; }.field > text, .section-title, .decision > text { color: #56665a; font-size: 17rpx; font-weight: 680; }.review-section { margin-top: 24rpx; padding-top: 21rpx; border-top: 1rpx solid #e9ede7; }.evidence-item { margin-top: 13rpx; }.evidence-item > text { display: block; margin: 6rpx 5rpx 0; color: #8a928b; font-size: 13rpx; }.empty { display: block; margin-top: 12rpx; color: #899189; font-size: 16rpx; }.decision { margin-top: 24rpx; }.decision > view { display: flex; gap: 10rpx; margin-top: 11rpx; }.decision button { display: flex; min-height: 54rpx; padding: 0 21rpx; align-items: center; justify-content: center; border-radius: 999rpx; background: #edf3e8; color: #667268; font-size: 16rpx; }.decision button.active { background: #223127; color: #fff; }
.history-row { padding: 21rpx 0; border-top: 1rpx solid #e8ede6; }.history-row:first-of-type { margin-top: 15rpx; }.history-row > view { display: flex; justify-content: space-between; gap: 16rpx; }.history-row > view text:first-child { color: #6d7a70; font-size: 15rpx; }.history-row > view text:last-child { color: #49604f; font-size: 15rpx; font-weight: 680; }.history-row > text { display: block; margin-top: 9rpx; font-size: 18rpx; line-height: 1.55; }.history-empty { padding: 15rpx 0; }.export-row { display: flex; gap: 12rpx; margin-top: 20rpx; }.export-row button { display: flex; min-height: 64rpx; flex: 1; align-items: center; justify-content: center; border: 1rpx solid rgba(26,39,29,.12); border-radius: 999rpx; color: #5d6a60; font-size: 17rpx; }
/* #ifdef H5 */@media (min-width: 980px) { .page { box-sizing: border-box; padding-left: 96px; }.status-bar { display: none; }.shell { max-width: 820px; margin: 0 auto; padding: 56px 40px 100px; } }/* #endif */
</style>
