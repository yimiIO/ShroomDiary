<template>
	<view class="wellbeing-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="navbar">
			<button class="nav-back" aria-label="返回" @tap="goBack">‹</button>
			<view class="nav-copy"><text class="nav-kicker">BODY & MIND LOG</text><text class="nav-title">身心记录</text></view>
			<text class="nav-private">仅自己</text>
		</view>

		<scroll-view class="content-scroll" scroll-y @scrolltolower="loadMore">
			<view class="page-shell">
				<view class="hero">
					<text class="hero-title">先保留变化，<br>不急着解释原因。</text>
					<text class="hero-copy">心理、身体、睡眠、习惯、测量和检查结果都先作为事实独立保存。它不向未解之问提供证据或结论。</text>
					<view class="hero-rule"><text>从日记独立提取</text><text>确认与问题互不影响</text></view>
				</view>

				<view class="overview">
					<view><text>{{ summary.confirmedCount || 0 }}</text><text>已确认记录</text></view>
					<view><text>{{ summary.recentCount || 0 }}</text><text>近 7 天变化</text></view>
					<view :class="{ attention: summary.pendingCount }"><text>{{ summary.pendingCount || 0 }}</text><text>等待确认</text></view>
				</view>

				<view class="create-panel" :class="{ open: creating }">
					<button v-if="!creating" class="create-entry" @tap="creating = true"><text>＋</text><view><text>手动留下一条身心记录</text><text>测量、检查或当下变化，一句话也可以</text></view></button>
					<view v-else class="create-form">
						<view class="form-heading"><view><text>NEW OBSERVATION</text><text>记录事实，不填写诊断</text></view><button @tap="resetDraft">×</button></view>
						<picker mode="date" :value="draft.recordedOn" @change="draft.recordedOn = $event.detail.value"><view class="date-field">{{ draft.recordedOn }} <text>›</text></view></picker>
						<textarea v-model="draft.note" class="note-input" maxlength="2000" auto-height placeholder="这次发生了什么？" />
						<input v-model="draft.psychologicalFeelings" class="field" maxlength="400" placeholder="心理感受、压力或认知变化（逗号分开）" />
						<input v-model="draft.physicalSymptoms" class="field" maxlength="400" placeholder="身体症状与部位（逗号分开）" />
						<view class="field-pair"><input v-model="draft.sleepHours" class="field" type="digit" placeholder="睡眠小时" /><input v-model="draft.sleepQuality" class="field" type="number" placeholder="睡眠质量 1-5" /></view>
						<input v-model="draft.behaviors" class="field" maxlength="400" placeholder="饮食、运动、作息或环境（逗号分开）" />
						<input v-model="draft.measurements" class="field" maxlength="600" placeholder="测量结果（逗号分开）" />
						<input v-model="draft.testResults" class="field" maxlength="1000" placeholder="检查结果摘要（逗号分开）" />
						<view class="form-actions"><button @tap="resetDraft">取消</button><button :disabled="saving || !canSave" @tap="saveManual">{{ saving ? '保存中…' : '确认保存' }}</button></view>
					</view>
				</view>

				<scroll-view class="category-scroll" scroll-x :show-scrollbar="false">
					<view class="category-row"><button v-for="item in categories" :key="item.value" :class="{ active: category === item.value }" @tap="changeCategory(item.value)">{{ item.label }}</button></view>
				</scroll-view>

				<view class="records-heading"><view><text>OBSERVATION STREAM</text><text>{{ categoryTitle }}</text></view><text>{{ total }} 条</text></view>
				<view v-if="items.length" class="record-list">
					<view v-for="item in items" :key="item.id" class="record-card" :class="{ pending: item.status === 'PENDING' }">
						<view class="record-topline"><view><text class="record-date">{{ formatDate(item.recordedOn) }}</text><text v-if="item.status === 'PENDING'" class="pending-label">AI 整理 · 建议你看一眼</text><text v-else class="source-label">{{ sourceLabel(item) }}</text></view><text class="record-index">{{ item.status === 'PENDING' ? '?' : '●' }}</text></view>
						<view class="record-categories"><text v-for="tag in item.categories" :key="tag">{{ categoryLabel(tag) }}</text></view>
						<text class="record-summary">{{ observationText(item.observation) }}</text>
						<text v-if="item.sourceExcerpt" class="record-excerpt">“{{ item.sourceExcerpt }}”</text>
						<view v-if="item.whyUseful" class="record-value"><text>为什么值得留下</text><text>{{ item.whyUseful }}</text><text v-if="confidenceLabel(item)">{{ confidenceLabel(item) }}</text></view>
						<view v-if="item.status === 'PENDING'" class="record-actions"><button :disabled="processingId === item.id" @tap="updateStatus(item, 'dismiss')">这不是身心线索</button><button :disabled="processingId === item.id" @tap="updateStatus(item, 'confirm')">保留这条观察</button></view>
						<view v-else class="record-footer"><button v-if="item.diaryId" @tap="openDiary(item)">查看原日记</button><button @tap="updateStatus(item, item.status === 'ARCHIVED' ? 'restore' : 'archive')">{{ item.status === 'ARCHIVED' ? '恢复' : '归档' }}</button></view>
					</view>
				</view>
				<view v-else-if="!loading" class="empty"><text>○</text><text>{{ category ? '这个类别还没有记录' : '还没有身心记录' }}</text><text>日记分析发现明确变化时会放在这里等待你确认；也可以手动记录。</text></view>
				<button v-if="items.length < total" class="load-more" :disabled="loading" @tap="loadMore">{{ loading ? '读取中…' : '继续看更早记录' }}</button>
				<text class="privacy-note">身心记录默认仅自己可见，不会进入发现。这是个人长期观察，不是医学诊断。</text>
				<view class="bottom-space"></view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { wellbeingList, wellbeingStatus, wellbeingSummary } from '@/api/wellbeing';

const emptyDraft = () => ({ recordedOn: moment().format('YYYY-MM-DD'), note: '', psychologicalFeelings: '', physicalSymptoms: '', sleepHours: '', sleepQuality: '', behaviors: '', measurements: '', testResults: '' });

export default {
	data() {
		return {
			statusBarHeight: 0, items: [], total: 0, page: 1,
			pageSize: 20, category: '', loading: false, processingId: '', creating: false, saving: false,
			summary: {}, draft: emptyDraft(),
			categories: [{ value: '', label: '全部' }, { value: 'PSYCHOLOGICAL', label: '心理' }, { value: 'PHYSICAL', label: '身体' }, { value: 'SLEEP', label: '睡眠' }, { value: 'HABIT', label: '习惯' }, { value: 'MEASUREMENT', label: '测量' }, { value: 'TEST_RESULT', label: '检查' }]
		};
	},
	computed: {
		canSave() { return Boolean(this.draft.note.trim() || this.draft.psychologicalFeelings.trim() || this.draft.physicalSymptoms.trim() || this.draft.sleepHours || this.draft.sleepQuality || this.draft.behaviors.trim() || this.draft.measurements.trim() || this.draft.testResults.trim()); },
		categoryTitle() { return this.category ? this.categoryLabel(this.category) + '记录' : '全部身心记录'; }
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.loadSummary();
		this.loadItems(true);
	},
	methods: {
		split(value) { return String(value || '').split(/[，,、\n]/u).map(item => item.trim()).filter(Boolean); },
		observationPayload() {
			const physical = this.split(this.draft.physicalSymptoms);
			return {
				psychologicalFeelings: this.split(this.draft.psychologicalFeelings),
				physicalSymptoms: physical,
				sleep: { hours: this.draft.sleepHours === '' ? null : Number(this.draft.sleepHours), quality: this.draft.sleepQuality === '' ? null : Number(this.draft.sleepQuality), note: '' },
				behaviors: this.split(this.draft.behaviors), measurements: this.split(this.draft.measurements), testResults: this.split(this.draft.testResults)
			};
		},
		async loadSummary() { try { const res = await this.$http.get(wellbeingSummary); this.summary = res.data || {}; } catch (error) { this.summary = {}; } },
		async loadItems(reset = false) {
			if (this.loading) return;
			if (reset) { this.page = 1; this.items = []; }
			this.loading = true;
			try {
				const res = await this.$http.get(wellbeingList, { page: this.page, pageSize: this.pageSize, category: this.category });
				const list = res.data && Array.isArray(res.data.list) ? res.data.list : [];
				this.items = reset ? list : this.items.concat(list);
				this.total = Number(res.data && res.data.total || 0);
			} catch (error) { console.error('加载身心记录失败', error); }
			finally { this.loading = false; }
		},
		loadMore() { if (!this.loading && this.items.length < this.total) { this.page += 1; this.loadItems(); } },
		changeCategory(value) { if (this.category === value) return; this.category = value; this.loadItems(true); },
		resetDraft() { this.creating = false; this.draft = emptyDraft(); },
		async saveManual() {
			if (!this.canSave || this.saving) return;
			this.saving = true;
			try {
				await this.$http.post(wellbeingList, { recordedOn: this.draft.recordedOn, note: this.draft.note, observation: this.observationPayload() });
				this.resetDraft(); await Promise.all([this.loadItems(true), this.loadSummary()]);
				uni.showToast({ title: '身心记录已保存', icon: 'success' });
			} catch (error) { console.error('保存身心记录失败', error); }
			finally { this.saving = false; }
		},
		async updateStatus(item, action) {
			if (!item || this.processingId) return;
			let reason = '';
			if (action === 'dismiss') {
				const reasons = [
					{ label: '说的是别人', value: 'OTHER_PERSON' },
					{ label: '只是知识或思考', value: 'KNOWLEDGE_OR_REFLECTION' },
					{ label: '与身心无关', value: 'NOT_WELLBEING' },
					{ label: '和已有记录重复', value: 'DUPLICATE' },
					{ label: '原文理解错了', value: 'MISUNDERSTOOD' }
				];
				try {
					const selected = await new Promise((resolve, reject) => uni.showActionSheet({
						itemList: reasons.map(option => option.label),
						success: resolve,
						fail: reject
					}));
					reason = reasons[selected.tapIndex] && reasons[selected.tapIndex].value;
					if (!reason) return;
				} catch (error) { return; }
			}
			this.processingId = item.id;
			try { await this.$http.post(wellbeingStatus(item.id), reason ? { action, reason } : { action }); await Promise.all([this.loadItems(true), this.loadSummary()]); }
			catch (error) { console.error('更新身心记录失败', error); }
			finally { this.processingId = ''; }
		},
		confidenceLabel(item) {
			if (item.status !== 'PENDING' || item.confidence === null || item.confidence === undefined) return '';
			return Number(item.confidence) >= 0.85 ? '原文依据较明确' : '建议核对 AI 理解';
		},
		categoryLabel(value) { return { PSYCHOLOGICAL: '心理', PHYSICAL: '身体', SLEEP: '睡眠', HABIT: '习惯', MEASUREMENT: '测量', TEST_RESULT: '检查' }[value] || '身心'; },
		formatDate(value) { return value ? moment(value).format('YYYY.MM.DD') : '日期未记录'; },
		sourceLabel(item) { return item.sourceType === 'MANUAL' ? '手动记录' : (item.status === 'ARCHIVED' ? '已归档' : '来自日记'); },
		observationText(value) {
			if (!value) return '';
			const parts = [];
			const add = (label, items) => { if (Array.isArray(items) && items.length) parts.push(label + items.join('、')); };
			add('心理：', value.psychologicalFeelings); add('压力：', value.stressors); add('认知：', value.cognitiveChanges); add('身体：', value.physicalSymptoms); add('部位：', value.bodyAreas);
			if (value.severity !== null && value.severity !== undefined) parts.push(`程度：${value.severity}/10`);
			if (value.sleep && value.sleep.hours !== null && value.sleep.hours !== undefined) parts.push(`睡眠：${value.sleep.hours} 小时`);
			if (value.sleep && value.sleep.quality !== null && value.sleep.quality !== undefined) parts.push(`睡眠质量：${value.sleep.quality}/5`);
			if (value.sleep && value.sleep.note) parts.push('睡眠：' + value.sleep.note);
			add('行为：', value.behaviors); add('环境：', value.environmentFactors); add('测量：', value.measurements); add('检查：', value.testResults);
			return parts.join(' · ');
		},
		openDiary(item) { if (item.diaryId) uni.navigateTo({ url: `/pages/diary/edit?id=${item.diaryId}` }); },
		goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack(); else uni.switchTab({ url: '/pages/shroom/me' }); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1; border-radius: 0; background: transparent; }
button::after { border: 0; }
.wellbeing-page { height: 100vh; display: flex; flex-direction: column; background: #f1f8e9; color: #172019; overflow: hidden; }
.status-bar { flex: 0 0 auto; }
.navbar { min-height: 94rpx; padding: 0 34rpx; display: flex; align-items: center; gap: 19rpx; }
.nav-back { width: 55rpx; height: 55rpx; border: 1rpx solid rgba(23,32,25,.12); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #172019; font-size: 40rpx; }
.nav-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.nav-kicker { color: #75815f; font-size: 14rpx; font-weight: 750; letter-spacing: 3rpx; }
.nav-title { margin-top: 4rpx; font-family: Georgia, 'Songti SC', serif; font-size: 31rpx; }
.nav-private { color: #778175; font-size: 17rpx; }
.content-scroll { min-height: 0; flex: 1; }
.page-shell { width: 100%; max-width: 1100rpx; margin: 0 auto; padding: 27rpx 32rpx 0; box-sizing: border-box; }
.hero { padding: 38rpx 34rpx; border-radius: 34rpx; background: #172019; color: #f7faef; box-shadow: 0 22rpx 62rpx rgba(25,38,27,.12); }
.hero-title { display: block; font-family: Georgia, 'Songti SC', serif; font-size: 42rpx; line-height: 1.33; }
.hero-copy { display: block; max-width: 740rpx; margin-top: 20rpx; color: #b9c5b7; font-size: 21rpx; line-height: 1.7; }
.hero-rule { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 27rpx; }
.hero-rule text { padding: 10rpx 16rpx; border-radius: 99rpx; background: rgba(218,233,177,.12); color: #dce9bd; font-size: 17rpx; }
.overview { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12rpx; margin-top: 18rpx; }
.overview > view { padding: 23rpx 18rpx; border-radius: 24rpx; background: #fffdf7; border: 1rpx solid rgba(23,32,25,.07); display: flex; flex-direction: column; }
.overview > view > text:first-child { font-family: Georgia, serif; font-size: 34rpx; }
.overview > view > text:last-child { margin-top: 7rpx; color: #798177; font-size: 17rpx; }
.overview .attention { background: #e5eccf; }
.create-panel { margin-top: 18rpx; border-radius: 26rpx; background: #fffdf7; border: 1rpx solid rgba(23,32,25,.07); overflow: hidden; }
.create-entry { width: 100%; min-height: 105rpx; padding: 0 27rpx; display: flex; align-items: center; text-align: left; }
.create-entry > text { width: 49rpx; height: 49rpx; border-radius: 50%; background: #dfe9bd; display: flex; align-items: center; justify-content: center; font-size: 28rpx; }
.create-entry > view { margin-left: 17rpx; display: flex; flex-direction: column; }
.create-entry > view text:first-child { font-size: 23rpx; font-weight: 700; }
.create-entry > view text:last-child { margin-top: 7rpx; color: #81877f; font-size: 17rpx; }
.create-form { padding: 28rpx; }
.form-heading { display: flex; align-items: flex-start; justify-content: space-between; }
.form-heading > view { display: flex; flex-direction: column; }
.form-heading > view text:first-child { color: #77834f; font-size: 14rpx; font-weight: 750; letter-spacing: 2rpx; }
.form-heading > view text:last-child { margin-top: 7rpx; font-size: 25rpx; }
.form-heading > button { font-size: 30rpx; color: #7c837b; }
.date-field, .field, .note-input { width: 100%; margin-top: 15rpx; padding: 19rpx 20rpx; box-sizing: border-box; border-radius: 16rpx; background: #edf2e5; color: #172019; font-size: 20rpx; line-height: 1.55; }
.date-field { display: flex; justify-content: space-between; }
.note-input { min-height: 100rpx; max-width: 100%; overflow-x: hidden; word-break: break-word; overflow-wrap: anywhere; }
.field-pair { display: flex; gap: 12rpx; }
.field-pair .field { min-width: 0; flex: 1; }
.form-actions { display: flex; justify-content: flex-end; gap: 12rpx; margin-top: 20rpx; }
.form-actions button { min-width: 120rpx; height: 65rpx; padding: 0 20rpx; border-radius: 33rpx; display: flex; align-items: center; justify-content: center; color: #6e776d; font-size: 19rpx; }
.form-actions button:last-child { background: #172019; color: white; font-weight: 700; }
.form-actions button[disabled] { opacity: .42; }
.category-scroll { width: 100%; margin-top: 23rpx; white-space: nowrap; }
.category-row { display: inline-flex; gap: 10rpx; padding-right: 24rpx; }
.category-row button { height: 58rpx; padding: 0 20rpx; border: 1rpx solid rgba(23,32,25,.1); border-radius: 30rpx; display: flex; align-items: center; justify-content: center; color: #667066; font-size: 18rpx; }
.category-row button.active { border-color: #172019; background: #172019; color: #fff; }
.records-heading { margin: 31rpx 5rpx 15rpx; display: flex; align-items: flex-end; justify-content: space-between; }
.records-heading > view { display: flex; flex-direction: column; }
.records-heading > view text:first-child { color: #7b865d; font-size: 14rpx; font-weight: 750; letter-spacing: 2rpx; }
.records-heading > view text:last-child { margin-top: 6rpx; font-family: Georgia, 'Songti SC', serif; font-size: 28rpx; }
.records-heading > text { color: #858c83; font-size: 17rpx; }
.record-list { display: flex; flex-direction: column; gap: 14rpx; }
.record-card { padding: 27rpx; border-radius: 27rpx; background: #fffdf7; border: 1rpx solid rgba(23,32,25,.07); }
.record-card.pending { background: #e6edd5; border-color: rgba(93,111,60,.16); }
.record-topline { display: flex; align-items: flex-start; justify-content: space-between; gap: 14rpx; }
.record-topline > view { display: flex; align-items: center; flex-wrap: wrap; gap: 10rpx; }
.record-date { font-family: Georgia, serif; font-size: 22rpx; }
.pending-label, .source-label { padding: 7rpx 11rpx; border-radius: 13rpx; background: rgba(23,32,25,.07); color: #687263; font-size: 15rpx; }
.record-index { color: #83905d; font-size: 19rpx; }
.record-categories { display: flex; flex-wrap: wrap; gap: 8rpx; margin-top: 17rpx; }
.record-categories text { padding: 7rpx 11rpx; border-radius: 13rpx; background: #edf1e5; color: #667152; font-size: 15rpx; }
.pending .record-categories text { background: rgba(255,255,255,.52); }
.record-summary { display: block; margin-top: 16rpx; font-family: Georgia, 'Songti SC', serif; font-size: 24rpx; line-height: 1.62; word-break: break-word; }
.record-excerpt { display: -webkit-box; margin-top: 15rpx; color: #777f77; font-size: 18rpx; line-height: 1.6; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.record-value { margin-top: 17rpx; padding: 17rpx 18rpx; border-left: 4rpx solid #8ba05d; border-radius: 0 15rpx 15rpx 0; background: rgba(255,255,255,.5); display: flex; flex-direction: column; }
.record-value text:first-child { color: #71804d; font-size: 15rpx; font-weight: 750; letter-spacing: 1rpx; }
.record-value text:nth-child(2) { margin-top: 7rpx; color: #39433a; font-size: 18rpx; line-height: 1.55; }
.record-value text:last-child:not(:nth-child(2)) { margin-top: 8rpx; color: #858d80; font-size: 15rpx; }
.record-actions { display: flex; justify-content: flex-end; gap: 10rpx; margin-top: 21rpx; }
.record-actions button { min-height: 60rpx; padding: 0 18rpx; border-radius: 31rpx; display: flex; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.14); color: #667064; font-size: 17rpx; }
.record-actions button:last-child { border-color: #172019; background: #172019; color: #fff; font-weight: 700; }
.record-footer { margin-top: 18rpx; padding-top: 15rpx; border-top: 1rpx solid rgba(23,32,25,.07); display: flex; justify-content: space-between; }
.record-footer button { color: #6f786e; font-size: 17rpx; }
.empty { padding: 70rpx 38rpx; border-radius: 27rpx; background: rgba(255,253,247,.68); display: flex; align-items: center; flex-direction: column; text-align: center; }
.empty text:first-child { color: #a4ad91; font-size: 48rpx; }
.empty text:nth-child(2) { margin-top: 15rpx; font-family: Georgia, 'Songti SC', serif; font-size: 27rpx; }
.empty text:last-child { max-width: 530rpx; margin-top: 11rpx; color: #838a82; font-size: 18rpx; line-height: 1.6; }
.load-more { width: 100%; height: 72rpx; margin-top: 16rpx; border-radius: 36rpx; background: #e3e9d8; color: #606b5f; font-size: 19rpx; }
.privacy-note { display: block; margin: 28rpx 18rpx 0; color: #8a9189; font-size: 17rpx; line-height: 1.65; text-align: center; }
.bottom-space { height: calc(80rpx + env(safe-area-inset-bottom)); }
@media (min-width: 900px) { .page-shell { padding-left: 52rpx; padding-right: 52rpx; } .record-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
</style>
