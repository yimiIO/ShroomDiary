<template>
	<view class="inquiries-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="navbar">
			<button class="nav-back" @tap="goBack"><text>‹</text></button>
			<view class="nav-copy">
				<text class="nav-kicker">OPEN QUESTIONS</text>
				<text class="nav-title">未解之问</text>
			</view>
			<button v-if="selectionMode" class="nav-done" @tap="finishSelection">完成</button>
		</view>

		<scroll-view class="content-scroll" scroll-y>
			<view class="page-shell">
				<view class="intro">
					<text class="intro-title">有些答案，需要生活慢慢提供证据。</text>
					<text class="intro-copy">这里不是待办，也不是日记分类。先留下真正困扰你的问题，再把相关日记和新线索放进来。</text>
				</view>

				<view class="create-panel" :class="{ open: creating }">
					<button v-if="!creating" class="create-entry" @tap="creating = true">
						<text class="create-plus">＋</text>
						<view><text class="create-title">留下一个暂时想不明白的问题</text><text class="create-hint">不急着回答，先开始积累线索</text></view>
					</button>
					<view v-else class="create-form">
						<text class="field-label">我想慢慢想明白</text>
						<view class="type-row">
							<button v-for="item in inquiryTypes" :key="item.value" class="type-chip" :class="{ active: draft.inquiryType === item.value }" @tap="draft.inquiryType = item.value">{{ item.label }}</button>
						</view>
						<textarea v-model="draft.question" class="question-input" maxlength="300" placeholder="例如：为什么我总在重要选择前否定自己？" :show-confirm-bar="false" />
						<text class="field-label context-label">现在已知的背景（可选）</text>
						<textarea v-model="draft.context" class="context-input" maxlength="5000" placeholder="它从什么时候开始？目前最困惑的地方是什么？" :show-confirm-bar="false" />
						<view v-if="isHealthType(draft.inquiryType)" class="health-profile-fields">
							<text class="health-form-note">先留下起点和你的平时状态，之后可随时修订。这里记录的是观察，不是诊断。</text>
							<text class="field-label">观察从什么时候开始（可选）</text>
							<picker mode="date" :value="draft.observationStartedOn" @change="draft.observationStartedOn = $event.detail.value">
								<view class="date-picker-value">{{ draft.observationStartedOn || '选择日期' }} <text>›</text></view>
							</picker>
							<text class="field-label baseline-label">个人平时状态（可选）</text>
							<textarea v-model="draft.personalBaseline" class="baseline-input" maxlength="3000" placeholder="例如：以前只在运动后明显，平时睡眠约 7 小时……" :show-confirm-bar="false" />
						</view>
						<view class="form-actions">
							<button class="cancel-button" @tap="cancelCreate">取消</button>
							<button class="save-button" :disabled="creatingInquiry || draft.question.trim().length < 4" @tap="createInquiry">{{ creatingInquiry ? '保存中' : '开始积累' }}</button>
						</view>
					</view>
				</view>

				<view class="candidate-panel" v-if="!selectionMode && pendingCandidates.length">
					<view class="candidate-heading">
						<view>
							<text class="candidate-kicker">FROM YOUR JOURNAL</text>
							<text class="candidate-title">从过去日记里发现的线索</text>
						</view>
						<text class="candidate-count">{{ pendingCandidates.length }} 个待确认</text>
					</view>
					<text class="candidate-intro">这些还不是你的长期问题。AI 只负责提出可能性，由你决定是否值得继续观察。</text>
					<view class="candidate-card" v-for="item in pendingCandidates" :key="item.id">
						<view class="candidate-mark"><text>?</text></view>
						<view class="candidate-body">
							<text v-if="item.inquiryType !== 'GENERAL'" class="candidate-type">{{ typeLabel(item.inquiryType) }}</text>
							<text class="candidate-question">{{ item.question }}</text>
							<text class="candidate-context" v-if="item.context">{{ item.context }}</text>
							<text class="candidate-source">来自 {{ item.evidenceCount }} 篇日记{{ item.sourceDate ? ' · 最早 ' + item.sourceDate : '' }}</text>
							<view class="candidate-actions">
								<button class="candidate-ignore" :disabled="processingCandidateId === item.id" @tap="ignoreCandidate(item)">不是这个</button>
								<button class="candidate-accept" :disabled="processingCandidateId === item.id" @tap="acceptCandidate(item)">{{ item.suggestedInquiryId ? '关联已有问题' : '开始观察' }}</button>
							</view>
						</view>
					</view>
				</view>

				<view class="status-tabs" v-if="!selectionMode">
					<button v-for="item in tabs" :key="item.value" class="status-tab" :class="{ active: status === item.value }" @tap="changeStatus(item.value)">{{ item.label }}</button>
				</view>
				<scroll-view class="type-tabs" scroll-x :show-scrollbar="false">
					<view class="type-tabs-inner">
						<button v-for="item in typeFilters" :key="item.value" class="type-filter" :class="{ active: inquiryType === item.value }" @tap="changeType(item.value)">{{ item.label }}</button>
					</view>
				</scroll-view>

				<view class="question-list" v-if="items.length">
					<button v-for="item in items" :key="item.id" class="question-card" :class="{ selected: isSelected(item.id) }" @tap="openInquiry(item)">
						<view class="card-topline">
							<text class="card-state">{{ statusLabel(item.status) }}</text><text class="card-type">{{ typeLabel(item.inquiryType) }}</text>
							<view v-if="selectionMode" class="select-mark"><text v-if="isSelected(item.id)">✓</text></view>
							<text v-else-if="item.reviewDue" class="review-due">适合再看看</text>
						</view>
						<text class="question-text">{{ item.question }}</text>
						<text v-if="item.context" class="question-context">{{ item.context }}</text>
						<view class="card-meta">
							<text>{{ item.evidenceCount }} 条线索</text>
							<text v-if="item.synthesisVersion">当前理解 V{{ item.synthesisVersion }}</text>
							<text v-else>还没有形成结论</text>
						</view>
					</button>
				</view>

				<view class="empty-state" v-else-if="!loading && !pendingCandidates.length">
					<text class="empty-mark">?</text>
					<text class="empty-title">{{ status === 'OPEN' ? '还没有正在追踪的问题' : '这里暂时没有记录' }}</text>
					<text class="empty-copy">问题不需要漂亮，只要对你真实。</text>
				</view>
				<text class="privacy-note">只有你主动发起复盘时，已授权的线索才会发送给 AI。Shroom 不会读取浏览器历史。</text>
				<view class="bottom-space"></view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import { inquiryCandidateAccept, inquiryCandidateIgnore, inquiryCandidates, inquiryList } from '@/api/inquiry';

export default {
	data() {
		return {
			statusBarHeight: 0,
			selectionMode: false,
			status: 'OPEN',
			inquiryType: 'ALL',
			tabs: [
				{ value: 'OPEN', label: '正在想' },
				{ value: 'PAUSED', label: '先放一放' },
				{ value: 'RESOLVED', label: '已经想明白' }
			],
			inquiryTypes: [
				{ value: 'GENERAL', label: '普通困惑' },
				{ value: 'PSYCHOLOGICAL', label: '心理困惑' },
				{ value: 'PHYSICAL_HEALTH', label: '身体健康' }
			],
			typeFilters: [
				{ value: 'ALL', label: '全部类型' },
				{ value: 'GENERAL', label: '普通' },
				{ value: 'PSYCHOLOGICAL', label: '心理' },
				{ value: 'PHYSICAL_HEALTH', label: '身体健康' }
			],
			items: [],
			pendingCandidates: [],
			processingCandidateId: '',
			selected: [],
			creating: false,
			creatingInquiry: false,
			loading: false,
			draft: { question: '', context: '', inquiryType: 'GENERAL', observationStartedOn: '', personalBaseline: '' }
		};
	},
	onLoad(options) {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.selectionMode = Boolean(options && options.mode === 'select');
		if (options && options.selected) {
			try { this.selected = JSON.parse(decodeURIComponent(options.selected)); } catch (error) { this.selected = []; }
		}
		this.loadItems();
		if (!this.selectionMode) this.loadCandidates();
	},
	methods: {
		async loadCandidates() {
			try {
				const res = await this.$http.get(inquiryCandidates, { status: 'PENDING', page: 1, pageSize: 50 });
				this.pendingCandidates = (res.data && res.data.list) || [];
			} catch (error) {
				console.error('加载待确认问题失败', error);
				this.pendingCandidates = [];
			}
		},
		async acceptCandidate(item) {
			if (!item || !item.id || this.processingCandidateId) return;
			const healthConsent = this.isHealthType(item.inquiryType) ? await this.confirmHealthConsent() : false;
			if (this.isHealthType(item.inquiryType) && !healthConsent) return;
			this.processingCandidateId = item.id;
			try {
				await this.$http.post(inquiryCandidateAccept(item.id), { healthConsent });
				this.pendingCandidates = this.pendingCandidates.filter(candidate => candidate.id !== item.id);
				this.status = 'OPEN';
				await this.loadItems();
				uni.showToast({ title: item.suggestedInquiryId ? '已关联问题' : '已开始观察', icon: 'success' });
			} catch (error) {
				console.error('确认候选问题失败', error);
			} finally {
				this.processingCandidateId = '';
			}
		},
		async ignoreCandidate(item) {
			if (!item || !item.id || this.processingCandidateId) return;
			this.processingCandidateId = item.id;
			try {
				await this.$http.post(inquiryCandidateIgnore(item.id), {});
				this.pendingCandidates = this.pendingCandidates.filter(candidate => candidate.id !== item.id);
				uni.showToast({ title: '已忽略', icon: 'none' });
			} catch (error) {
				console.error('忽略候选问题失败', error);
			} finally {
				this.processingCandidateId = '';
			}
		},
		async loadItems() {
			this.loading = true;
			try {
				const res = await this.$http.get(inquiryList, { status: this.status, type: this.inquiryType, page: 1, pageSize: 50 });
				this.items = (res.data && res.data.list) || [];
			} catch (error) {
				console.error('加载未解之问失败', error);
				this.items = [];
			} finally {
				this.loading = false;
			}
		},
		changeStatus(value) {
			this.status = value;
			this.loadItems();
		},
		changeType(value) {
			this.inquiryType = value;
			this.loadItems();
		},
		typeLabel(value) {
			return { GENERAL: '普通困惑', PSYCHOLOGICAL: '心理困惑', PHYSICAL_HEALTH: '身体健康' }[value] || '普通困惑';
		},
		isHealthType(value) { return value === 'PSYCHOLOGICAL' || value === 'PHYSICAL_HEALTH'; },
		confirmHealthConsent() {
			return new Promise(resolve => uni.showModal({
				title: '确认记录健康观察',
				content: '健康记录属于敏感个人信息，将仅保存在你的账户中。只有你主动发起 AI 回看时，已授权线索才会发送给当前 AI 服务；它不会进入发现。',
				confirmText: '同意并继续',
				cancelText: '暂不',
				success: result => resolve(Boolean(result.confirm)),
				fail: () => resolve(false)
			}));
		},
		statusLabel(value) {
			return { OPEN: '正在想', PAUSED: '先放一放', RESOLVED: '已经想明白' }[value] || '正在想';
		},
		isSelected(id) {
			return this.selected.some(item => item.id === id);
		},
		openInquiry(item) {
			if (!this.selectionMode) {
				uni.navigateTo({ url: `/pages/shroom/inquiry?id=${item.id}` });
				return;
			}
			if (this.isSelected(item.id)) {
				this.selected = this.selected.filter(selected => selected.id !== item.id);
				return;
			}
			if (this.selected.length >= 3) {
				uni.showToast({ title: '一篇日记最多关联 3 个问题', icon: 'none' });
				return;
			}
			this.selected.push({ id: item.id, question: item.question, status: item.status, inquiryType: item.inquiryType });
		},
		finishSelection() {
			const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
			if (channel) channel.emit('selectInquiries', this.selected);
			uni.navigateBack();
		},
		cancelCreate() {
			this.creating = false;
			this.draft = { question: '', context: '', inquiryType: 'GENERAL', observationStartedOn: '', personalBaseline: '' };
		},
		async createInquiry() {
			if (this.draft.question.trim().length < 4 || this.creatingInquiry) return;
			const healthConsent = this.isHealthType(this.draft.inquiryType) ? await this.confirmHealthConsent() : false;
			if (this.isHealthType(this.draft.inquiryType) && !healthConsent) return;
			this.creatingInquiry = true;
			try {
				const res = await this.$http.post(inquiryList, { ...this.draft, healthConsent });
				const created = res.data;
				this.cancelCreate();
				this.items.unshift(created);
				if (this.selectionMode) this.openInquiry(created);
				uni.showToast({ title: '问题已留下', icon: 'success' });
			} catch (error) {
				console.error('创建未解之问失败', error);
			} finally {
				this.creatingInquiry = false;
			}
		},
		goBack() { uni.navigateBack(); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1; border-radius: 0; background: transparent; }
button::after { border: 0; }
.inquiries-page { height: 100vh; display: flex; flex-direction: column; background: #f1f8e9; color: #172019; }
.status-bar, .navbar { flex-shrink: 0; }
.navbar { height: 112rpx; padding: 0 34rpx; display: flex; align-items: center; border-bottom: 1rpx solid rgba(23,32,25,.08); box-sizing: border-box; }
.nav-back { width: 68rpx; height: 68rpx; border: 1rpx solid rgba(23,32,25,.12); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 52rpx; }
.nav-copy { flex: 1; padding-left: 22rpx; display: flex; flex-direction: column; }
.nav-kicker { font-size: 17rpx; letter-spacing: 3rpx; color: #718075; font-weight: 700; }
.nav-title { margin-top: 8rpx; font-size: 29rpx; font-weight: 700; }
.nav-done { min-width: 104rpx; height: 64rpx; border-radius: 34rpx; background: #52622f; color: white; font-size: 24rpx; display: flex; align-items: center; justify-content: center; }
.content-scroll { flex: 1; height: 0; }
.page-shell { width: 100%; max-width: 920rpx; margin: 0 auto; padding: 52rpx 34rpx 0; box-sizing: border-box; }
.intro { padding: 8rpx 8rpx 36rpx; display: flex; flex-direction: column; }
.intro-title { font-family: Georgia, 'Songti SC', serif; font-size: 45rpx; line-height: 1.36; }
.intro-copy { margin-top: 18rpx; color: #718075; font-size: 24rpx; line-height: 1.75; }
.create-panel { border: 1rpx solid rgba(82,98,47,.18); border-radius: 30rpx; background: rgba(255,255,255,.62); overflow: hidden; }
.create-panel.open { background: #fffdf7; }
.create-entry { width: 100%; min-height: 142rpx; padding: 26rpx 28rpx; display: flex; align-items: center; text-align: left; }
.create-plus { width: 62rpx; height: 62rpx; margin-right: 22rpx; border-radius: 50%; background: #dbe7b2; display: flex; align-items: center; justify-content: center; font-size: 38rpx; }
.create-entry view { flex: 1; display: flex; flex-direction: column; }
.create-title { font-size: 26rpx; font-weight: 650; line-height: 1.4; }
.create-hint { margin-top: 10rpx; color: #788078; font-size: 21rpx; }
.create-form { padding: 30rpx; }
.field-label { display: block; font-size: 22rpx; font-weight: 650; color: #485448; }
.type-row { margin: 15rpx 0 22rpx; display: flex; flex-wrap: wrap; gap: 10rpx; }
.type-chip { min-height: 58rpx; padding: 0 20rpx; border: 1rpx solid rgba(23,32,25,.12); border-radius: 30rpx; color: #687268; font-size: 20rpx; display: flex; align-items: center; justify-content: center; }
.type-chip.active { border-color: #52622f; background: #52622f; color: white; }
.context-label { margin-top: 28rpx; }
.question-input, .context-input { display: block; width: 100%; max-width: 100%; box-sizing: border-box; margin-top: 14rpx; padding: 22rpx; border-radius: 18rpx; background: #f5f5ed; font-size: 26rpx; line-height: 1.65; overflow-x: hidden; word-break: break-word; overflow-wrap: anywhere; }
.question-input { height: 154rpx; }
.context-input { height: 190rpx; }
.health-profile-fields { margin-top: 24rpx; padding: 23rpx; border-radius: 20rpx; background: #eef2e4; }
.health-form-note { display: block; margin-bottom: 22rpx; color: #65705e; font-size: 19rpx; line-height: 1.65; }
.date-picker-value { height: 66rpx; margin-top: 12rpx; padding: 0 17rpx; border-radius: 15rpx; background: #fffdf8; color: #485148; font-size: 21rpx; display: flex; align-items: center; justify-content: space-between; }
.baseline-label { margin-top: 21rpx; }
.baseline-input { display: block; width: 100%; height: 140rpx; margin-top: 12rpx; padding: 17rpx; box-sizing: border-box; border-radius: 15rpx; background: #fffdf8; font-size: 22rpx; line-height: 1.6; overflow-x: hidden; word-break: break-word; }
.form-actions { margin-top: 24rpx; display: flex; justify-content: flex-end; gap: 16rpx; }
.cancel-button, .save-button { height: 64rpx; padding: 0 26rpx; border-radius: 34rpx; display: flex; align-items: center; justify-content: center; font-size: 23rpx; }
.cancel-button { color: #657065; border: 1rpx solid rgba(23,32,25,.12); }
.save-button { background: #52622f; color: white; }
.save-button[disabled] { opacity: .35; }
.candidate-panel { margin-top: 28rpx; padding: 30rpx; border-radius: 31rpx; background: #172019; color: #f4f7ef; }
.candidate-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.candidate-heading > view { min-width: 0; display: flex; flex-direction: column; }
.candidate-kicker { color: #b8ca7d; font-size: 16rpx; font-weight: 700; letter-spacing: 2.6rpx; }
.candidate-title { margin-top: 9rpx; font-family: Georgia, 'Songti SC', serif; font-size: 29rpx; line-height: 1.45; }
.candidate-count { flex: 0 0 auto; padding: 10rpx 15rpx; border-radius: 999rpx; background: rgba(219,231,178,.12); color: #dbe7b2; font-size: 17rpx; }
.candidate-intro { display: block; margin-top: 15rpx; color: #aeb9af; font-size: 20rpx; line-height: 1.65; }
.candidate-card { display: flex; gap: 18rpx; margin-top: 25rpx; padding-top: 25rpx; border-top: 1rpx solid rgba(255,255,255,.1); }
.candidate-mark { width: 46rpx; height: 46rpx; flex: 0 0 46rpx; border-radius: 50%; background: #dbe7b2; color: #172019; display: flex; align-items: center; justify-content: center; font-family: Georgia, serif; font-size: 25rpx; }
.candidate-body { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.candidate-question { font-family: Georgia, 'Songti SC', serif; font-size: 26rpx; line-height: 1.55; overflow-wrap: anywhere; }
.candidate-context { margin-top: 10rpx; color: #bac4bb; font-size: 19rpx; line-height: 1.6; overflow-wrap: anywhere; }
.candidate-type { align-self: flex-start; margin-bottom: 10rpx; padding: 7rpx 12rpx; border-radius: 20rpx; background: rgba(184,202,125,.14); color: #cfe3a0; font-size: 16rpx; }
.candidate-source { margin-top: 14rpx; color: #89968b; font-size: 17rpx; }
.candidate-actions { margin-top: 20rpx; display: flex; justify-content: flex-end; gap: 12rpx; }
.candidate-ignore, .candidate-accept { min-height: 60rpx; padding: 0 22rpx; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; font-size: 19rpx; }
.candidate-ignore { border: 1rpx solid rgba(255,255,255,.18); color: #c0c9c1; }
.candidate-accept { background: #e5efd9; color: #172019; font-weight: 700; }
.candidate-ignore[disabled], .candidate-accept[disabled] { opacity: .42; }
.status-tabs { margin: 34rpx 0 22rpx; display: flex; gap: 10rpx; }
.status-tab { height: 60rpx; padding: 0 24rpx; border-radius: 30rpx; color: #748075; font-size: 22rpx; display: flex; align-items: center; justify-content: center; }
.status-tab.active { background: #1f2921; color: white; }
.type-tabs { width: 100%; white-space: nowrap; }
.type-tabs-inner { display: inline-flex; gap: 9rpx; padding-bottom: 8rpx; }
.type-filter { flex: 0 0 auto; height: 52rpx; padding: 0 18rpx; border-radius: 28rpx; border: 1rpx solid rgba(23,32,25,.1); color: #7a837b; font-size: 19rpx; display: flex; align-items: center; justify-content: center; }
.type-filter.active { border-color: rgba(82,98,47,.35); background: #e1e9c4; color: #3e4b2d; }
.question-list { margin-top: 26rpx; display: flex; flex-direction: column; gap: 18rpx; }
.question-card { width: 100%; padding: 28rpx; border-radius: 28rpx; background: #fffdf7; border: 1rpx solid rgba(23,32,25,.08); text-align: left; display: flex; flex-direction: column; box-sizing: border-box; }
.question-card.selected { border-color: #71833f; box-shadow: inset 0 0 0 2rpx rgba(113,131,63,.16); }
.card-topline { display: flex; align-items: center; min-height: 34rpx; }
.card-state, .review-due { font-size: 19rpx; letter-spacing: 1rpx; color: #708071; }
.card-type { margin-left: 12rpx; padding: 6rpx 11rpx; border-radius: 18rpx; background: #eef1e3; color: #69735e; font-size: 16rpx; letter-spacing: 0; }
.review-due { margin-left: auto; color: #855f32; }
.select-mark { margin-left: auto; width: 34rpx; height: 34rpx; border: 1rpx solid rgba(23,32,25,.2); border-radius: 50%; color: white; background: #6f813d; display: flex; align-items: center; justify-content: center; font-size: 19rpx; }
.question-text { margin-top: 17rpx; font-family: Georgia, 'Songti SC', serif; font-size: 31rpx; line-height: 1.55; color: #242522; white-space: normal; }
.question-context { margin-top: 14rpx; color: #6f766f; font-size: 22rpx; line-height: 1.65; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.card-meta { margin-top: 22rpx; padding-top: 18rpx; border-top: 1rpx solid rgba(23,32,25,.07); display: flex; flex-wrap: wrap; gap: 18rpx; color: #7c837c; font-size: 20rpx; }
.empty-state { padding: 90rpx 20rpx; display: flex; align-items: center; flex-direction: column; }
.empty-mark { width: 72rpx; height: 72rpx; border-radius: 50%; background: #dfe9bd; display: flex; align-items: center; justify-content: center; font-family: Georgia, serif; font-size: 38rpx; }
.empty-title { margin-top: 22rpx; font-size: 27rpx; font-weight: 650; }
.empty-copy { margin-top: 13rpx; color: #7a837b; font-size: 22rpx; }
.privacy-note { display: block; margin: 42rpx 12rpx 0; color: #8a918b; font-size: 20rpx; line-height: 1.65; }
.bottom-space { height: calc(90rpx + env(safe-area-inset-bottom)); }
@media (min-width: 960px) { .page-shell { padding-top: 70rpx; } }
</style>
