<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header"><button class="back" @tap="goBack">‹</button><view class="heading"><text class="kicker">WEEKLY REVIEW</text><text class="title">人生 OS 每周复盘</text><text class="subtitle">整理已经发生的证据，不替你判断人生，也不把计划冒充行动。</text></view></view>
			<view class="privacy"><view></view><text>只有你主动点击才会使用 AI。结果先成为可编辑草稿，确认后才写入历史并设置下周关注。</text></view>

			<view v-if="!draft" class="start-panel">
				<text class="start-index">{{ currentWeek }}</text><text class="start-title">回看这一周真实发生了什么</text><text class="start-copy">只使用已经关联到人生 OS 的日记证据；不会创建待办、签发正式原则或自动修改长期优先级。</text>
				<button class="primary" :disabled="generating" @tap="generateDraft">{{ generating ? '正在整理本周证据…' : '生成本周复盘草稿' }}</button>
			</view>

			<view v-else class="draft-panel">
				<view class="draft-head"><view><text class="section-kicker">EDITABLE DRAFT</text><text class="section-title">{{ draft.weekStart }} · 待你确认</text></view><text>草稿</text></view>
				<view class="cost-line" v-if="draft.costSummary"><text>本次 AI 用量 {{ Number(draft.costSummary.totalTokens || 0).toLocaleString() }} token</text><text>{{ costLabel(draft.costSummary) }}</text></view>
				<text class="field-label">本周摘要</text><textarea v-model="result.summary" class="summary-input" maxlength="1600" auto-height :show-confirm-bar="false" />

				<view class="review-section"><text class="review-title">01 · 实际推进</text><text class="review-note">区分计划、行动和结果</text><view v-for="(entry,index) in result.actualProgress" :key="index" class="review-entry"><view><text>{{ entry.itemId }}</text><text>{{ typeLabel(entry.recordType) }}</text></view><textarea v-model="entry.text" maxlength="800" auto-height :show-confirm-bar="false" /></view><text v-if="!result.actualProgress.length" class="empty">本周没有可核对的推进证据。</text></view>

				<view class="review-section"><text class="review-title">02 · 形成的积累</text><text class="review-note">资产、复用、关系维护或状态维护</text><view v-for="(entry,index) in result.accumulations" :key="index" class="review-entry"><view><text>{{ entry.itemId }}</text><text>{{ accumulationLabel(entry.kind) }}</text></view><textarea v-model="entry.text" maxlength="800" auto-height :show-confirm-bar="false" /></view><text v-if="!result.accumulations.length" class="empty">不必把每件事都解释成复利。</text></view>

				<view class="review-section"><text class="review-title">03 · 值得继续观察</text><text class="review-note">推测会单独标出，不把一次行为解释成人格</text><view v-for="(entry,index) in result.observations" :key="index" class="review-entry"><view><text>{{ entry.itemId }}</text><text>{{ entry.inference ? '推测' : '事实观察' }}</text></view><textarea v-model="entry.text" maxlength="800" auto-height :show-confirm-bar="false" /></view><text v-if="!result.observations.length" class="empty">本周没有形成需要保留的新观察。</text></view>

				<view class="review-section next-section"><text class="review-title">04 · 下周少量动作</text><text class="review-note">最多选择 3 项成为下周关注；不自动创建待办</text><view v-for="(entry,index) in result.nextSteps" :key="index" class="next-entry" :class="{ selected: selectedItemKeys.includes(entry.itemId) }" @tap="toggleNext(entry)"><view class="check">{{ selectedItemKeys.includes(entry.itemId) ? '✓' : '' }}</view><view><text>{{ entry.itemId }} · {{ modeLabel(entry.mode) }}</text><textarea v-model="entry.action" maxlength="800" auto-height :show-confirm-bar="false" @tap.stop /></view></view><text v-if="!result.nextSteps.length" class="empty">没有足够证据建议下周动作，可以只保存复盘。</text></view>

				<button class="primary confirm" :disabled="confirming" @tap="confirmReview">{{ confirming ? '确认中…' : `确认复盘 · 下周关注 ${selectedItemKeys.length}/3` }}</button>
				<button class="secondary" @tap="draft = null">暂不确认，稍后再看</button>
			</view>

			<view class="history-panel">
				<view class="section-head"><view><text class="section-kicker">HISTORY</text><text class="section-title">复盘历史</text></view></view>
				<view v-for="review in confirmedReviews" :key="review.id" class="history-item"><view><text>{{ review.weekStart }}</text><text>已确认</text></view><text>{{ review.result.summary || '没有填写摘要' }}</text><text>{{ evidenceCount(review) }} 条整理结果</text></view>
				<text v-if="!confirmedReviews.length" class="empty history-empty">确认第一份每周复盘后，会在这里留下可回看的版本。</text>
			</view>
		</view>
	</view>
</template>

<script>
import { lifeOsPlanReviewConfirm, lifeOsPlanReviewDraft, lifeOsPlanReviews } from '@/api/shroom-system';

export default {
	data() { return { statusBarHeight: 0, reviews: [], draft: null, result: {}, selectedItemKeys: [], generating: false, confirming: false }; },
	computed: {
		currentWeek() { const date = new Date(); return `${date.getFullYear()} · 第 ${this.weekNumber(date)} 周`; },
		confirmedReviews() { return this.reviews.filter(item => item.status === 'CONFIRMED'); }
	},
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; this.load(); },
	methods: {
		async load() {
			try { const res = await this.$http.get(lifeOsPlanReviews, { page: 1, pageSize: 30 }); this.reviews = (res.data && res.data.list) || []; const draft = this.reviews.find(item => item.status === 'DRAFT'); if (draft) this.prepareDraft(draft); }
			catch (error) { console.error('加载每周复盘失败', error); }
		},
		prepareDraft(draft) {
			this.draft = draft; const raw = draft.result || {};
			this.result = { summary: raw.summary || '', actualProgress: (raw.actualProgress || []).map(item => ({ ...item })), accumulations: (raw.accumulations || []).map(item => ({ ...item })), observations: (raw.observations || []).map(item => ({ ...item })), nextSteps: (raw.nextSteps || []).map(item => ({ ...item, action: item.action || item.text || '' })) };
			this.selectedItemKeys = [];
		},
		async generateDraft() {
			if (this.generating) return; this.generating = true;
			try { const res = await this.$http.post(lifeOsPlanReviewDraft, {}); this.prepareDraft(res.data); await this.load(); uni.showToast({ title: '草稿已生成', icon: 'success' }); }
			catch (error) { console.error('生成每周复盘失败', error); }
			finally { this.generating = false; }
		},
		toggleNext(entry) { if (this.selectedItemKeys.includes(entry.itemId)) this.selectedItemKeys = this.selectedItemKeys.filter(key => key !== entry.itemId); else if (this.selectedItemKeys.length < 3) this.selectedItemKeys = [...this.selectedItemKeys, entry.itemId]; else uni.showToast({ title: '下周关注最多 3 项', icon: 'none' }); },
		confirmReview() {
			uni.showModal({ title: '确认这份复盘？', content: `复盘会进入历史，并把选中的 ${this.selectedItemKeys.length} 项设为下周关注。不会创建待办或正式原则。`, confirmText: '确认保存', success: result => { if (result.confirm) this.submitReview(); } });
		},
		async submitReview() {
			if (!this.draft || this.confirming) return; this.confirming = true;
			try { await this.$http.post(lifeOsPlanReviewConfirm(this.draft.id), { result: this.result, selectedItemKeys: this.selectedItemKeys }); this.draft = null; await this.load(); uni.showToast({ title: '本周复盘已确认', icon: 'success' }); }
			catch (error) { console.error('确认每周复盘失败', error); }
			finally { this.confirming = false; }
		},
		weekNumber(date) { const first = new Date(date.getFullYear(), 0, 1); return Math.ceil((((date - first) / 86400000) + first.getDay() + 1) / 7); },
		typeLabel(value) { return { PLAN: '计划', ACTION: '实际行动', RESULT: '结果', OBSERVATION: '观察', INQUIRY: '疑问' }[value] || value; },
		accumulationLabel(value) { return { ASSET_CREATED: '形成资产', ASSET_REUSED: '发生复用', RELATIONSHIP_MAINTAINED: '维护关系', STATE_MAINTAINED: '维持状态' }[value] || value; },
		modeLabel(value) { return { CONTINUE: '继续', ADJUST: '调整', STOP: '停止' }[value] || value; },
		costLabel(summary) { if (!summary || !summary.estimated || summary.costCny === null) return '单价暂不可估'; const cost = Number(summary.costCny || 0); return `约 ¥${cost.toFixed(cost >= 0.01 ? 2 : 4)}`; },
		evidenceCount(review) { const value = review.result || {}; return ['actualProgress','accumulations','observations','nextSteps'].reduce((total, key) => total + ((value[key] || []).length), 0); },
		goBack() { uni.navigateBack({ fail: () => uni.navigateTo({ url: '/pages/shroom/life-os-plan' }) }); }
	}
};
</script>

<style lang="scss" scoped>
button { margin:0; padding:0; line-height:1; background:transparent; border:0; } button::after { border:0; }
.page { min-height:100vh; background:#f1f8e9; color:#172019; }.status-bar{background:#f1f8e9}.shell{box-sizing:border-box;padding:30rpx 34rpx 130rpx}.header{display:flex;align-items:flex-start;gap:20rpx}.back{display:flex;width:68rpx;height:68rpx;flex:0 0 68rpx;align-items:center;justify-content:center;border:1rpx solid rgba(23,32,25,.1);border-radius:50%;background:rgba(255,255,255,.7);font-size:50rpx}.heading{display:flex;min-width:0;flex:1;flex-direction:column}.kicker,.section-kicker{color:#718075;font-size:15rpx;font-weight:720;letter-spacing:2.4rpx}.title{margin-top:8rpx;font-family:Georgia,'Songti SC',serif;font-size:37rpx;font-weight:710}.subtitle{margin-top:9rpx;color:#6f7b72;font-size:18rpx;line-height:1.55}.privacy{display:flex;align-items:flex-start;gap:12rpx;margin-top:28rpx;padding:19rpx 22rpx;border-radius:22rpx;background:#e1ebd9;color:#526156;font-size:18rpx;line-height:1.55}.privacy view{width:9rpx;height:9rpx;margin-top:9rpx;flex:0 0 9rpx;border-radius:50%;background:#5d7562}
.start-panel{display:flex;min-height:460rpx;margin-top:23rpx;padding:34rpx;box-sizing:border-box;flex-direction:column;justify-content:flex-end;border-radius:34rpx;background:#172019;color:#fff}.start-index{color:#96a698;font-size:16rpx;font-weight:700;letter-spacing:2rpx}.start-title{margin-top:19rpx;font-family:Georgia,'Songti SC',serif;font-size:31rpx;line-height:1.45}.start-copy{margin-top:14rpx;color:#b4c0b5;font-size:19rpx;line-height:1.65}.primary{width:100%;margin-top:26rpx;padding:25rpx;border-radius:999rpx;background:#e5efd9;color:#172019;font-size:20rpx;font-weight:700}.draft-panel,.history-panel{margin-top:23rpx;padding:29rpx;border-radius:31rpx;background:#fff}.draft-head{display:flex;align-items:flex-end;justify-content:space-between}.draft-head>view,.section-head>view{display:flex;flex-direction:column;gap:8rpx}.draft-head>text{padding:8rpx 13rpx;border-radius:999rpx;background:#e3ecd9;color:#536658;font-size:15rpx}.section-title{font-family:Georgia,'Songti SC',serif;font-size:27rpx;font-weight:680}.field-label{display:block;margin-top:24rpx;color:#647168;font-size:16rpx;font-weight:700}.summary-input,.review-entry textarea,.next-entry textarea{width:100%;box-sizing:border-box;margin-top:10rpx;padding:18rpx;border:1rpx solid #e2e7df;border-radius:18rpx;background:#f6f8f4;font-size:19rpx;line-height:1.6}.summary-input{min-height:120rpx}.review-section{margin-top:27rpx;padding-top:24rpx;border-top:1rpx solid #e8ede6}.review-title{display:block;font-size:23rpx;font-weight:700}.review-note{display:block;margin-top:7rpx;color:#7a867d;font-size:16rpx}.review-entry{margin-top:17rpx}.review-entry>view{display:flex;justify-content:space-between;color:#758178;font-size:15rpx}.review-entry textarea{min-height:88rpx}.next-entry{display:flex;align-items:flex-start;gap:14rpx;margin-top:17rpx;padding:18rpx;border-radius:20rpx;background:#f2f5ef}.next-entry.selected{background:#e2ecd9}.check{display:flex;width:31rpx;height:31rpx;flex:0 0 31rpx;align-items:center;justify-content:center;border:1rpx solid #7d8a80;border-radius:8rpx;font-size:17rpx}.next-entry.selected .check{border-color:#526b58;background:#526b58;color:#fff}.next-entry>view:last-child{min-width:0;flex:1}.next-entry>view:last-child>text{font-size:17rpx;font-weight:680}.next-entry textarea{min-height:75rpx;background:rgba(255,255,255,.65)}.confirm{background:#172019;color:#fff}.secondary{width:100%;padding:21rpx;color:#748078;font-size:18rpx}.empty{display:block;margin-top:17rpx;color:#7d8880;font-size:17rpx;line-height:1.55}.history-item{padding:21rpx 0;border-top:1rpx solid #e8ede6}.history-item:first-of-type{margin-top:17rpx}.history-item>view{display:flex;justify-content:space-between}.history-item>view text:first-child{font-size:19rpx;font-weight:680}.history-item>view text:last-child,.history-item>text:last-child{color:#7b877e;font-size:15rpx}.history-item>text:nth-child(2){display:block;margin-top:10rpx;font-size:18rpx;line-height:1.55}.history-item>text:last-child{display:block;margin-top:8rpx}.history-empty{margin-bottom:5rpx}
.cost-line{display:flex;justify-content:space-between;gap:15rpx;margin-top:19rpx;padding:15rpx 17rpx;border-radius:16rpx;background:#f0f4ec;color:#667267;font-size:15rpx}
/* #ifdef H5 */
@media (min-width:980px){.page{box-sizing:border-box;padding-left:96px}.status-bar{display:none}.shell{max-width:820px;margin:0 auto;padding:64px 44px 100px}}
/* #endif */
</style>
