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
						<textarea v-model="draft.question" class="question-input" maxlength="300" placeholder="例如：为什么我总在重要选择前否定自己？" :show-confirm-bar="false" />
						<text class="field-label context-label">现在已知的背景（可选）</text>
						<textarea v-model="draft.context" class="context-input" maxlength="5000" placeholder="它从什么时候开始？目前最困惑的地方是什么？" :show-confirm-bar="false" />
						<view class="form-actions">
							<button class="cancel-button" @tap="cancelCreate">取消</button>
							<button class="save-button" :disabled="creatingInquiry || draft.question.trim().length < 4" @tap="createInquiry">{{ creatingInquiry ? '保存中' : '开始积累' }}</button>
						</view>
					</view>
				</view>

				<view class="status-tabs" v-if="!selectionMode">
					<button v-for="item in tabs" :key="item.value" class="status-tab" :class="{ active: status === item.value }" @tap="changeStatus(item.value)">{{ item.label }}</button>
				</view>

				<view class="question-list" v-if="items.length">
					<button v-for="item in items" :key="item.id" class="question-card" :class="{ selected: isSelected(item.id) }" @tap="openInquiry(item)">
						<view class="card-topline">
							<text class="card-state">{{ statusLabel(item.status) }}</text>
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

				<view class="empty-state" v-else-if="!loading">
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
import { inquiryList } from '@/api/inquiry';

export default {
	data() {
		return {
			statusBarHeight: 0,
			selectionMode: false,
			status: 'OPEN',
			tabs: [
				{ value: 'OPEN', label: '正在想' },
				{ value: 'PAUSED', label: '先放一放' },
				{ value: 'RESOLVED', label: '已经想明白' }
			],
			items: [],
			selected: [],
			creating: false,
			creatingInquiry: false,
			loading: false,
			draft: { question: '', context: '' }
		};
	},
	onLoad(options) {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.selectionMode = Boolean(options && options.mode === 'select');
		if (options && options.selected) {
			try { this.selected = JSON.parse(decodeURIComponent(options.selected)); } catch (error) { this.selected = []; }
		}
		this.loadItems();
	},
	methods: {
		async loadItems() {
			this.loading = true;
			try {
				const res = await this.$http.get(inquiryList, { status: this.status, page: 1, pageSize: 50 });
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
			this.selected.push({ id: item.id, question: item.question, status: item.status });
		},
		finishSelection() {
			const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
			if (channel) channel.emit('selectInquiries', this.selected);
			uni.navigateBack();
		},
		cancelCreate() {
			this.creating = false;
			this.draft = { question: '', context: '' };
		},
		async createInquiry() {
			if (this.draft.question.trim().length < 4 || this.creatingInquiry) return;
			this.creatingInquiry = true;
			try {
				const res = await this.$http.post(inquiryList, this.draft);
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
.context-label { margin-top: 28rpx; }
.question-input, .context-input { display: block; width: 100%; max-width: 100%; box-sizing: border-box; margin-top: 14rpx; padding: 22rpx; border-radius: 18rpx; background: #f5f5ed; font-size: 26rpx; line-height: 1.65; overflow-x: hidden; word-break: break-word; overflow-wrap: anywhere; }
.question-input { height: 154rpx; }
.context-input { height: 190rpx; }
.form-actions { margin-top: 24rpx; display: flex; justify-content: flex-end; gap: 16rpx; }
.cancel-button, .save-button { height: 64rpx; padding: 0 26rpx; border-radius: 34rpx; display: flex; align-items: center; justify-content: center; font-size: 23rpx; }
.cancel-button { color: #657065; border: 1rpx solid rgba(23,32,25,.12); }
.save-button { background: #52622f; color: white; }
.save-button[disabled] { opacity: .35; }
.status-tabs { margin: 34rpx 0 22rpx; display: flex; gap: 10rpx; }
.status-tab { height: 60rpx; padding: 0 24rpx; border-radius: 30rpx; color: #748075; font-size: 22rpx; display: flex; align-items: center; justify-content: center; }
.status-tab.active { background: #1f2921; color: white; }
.question-list { margin-top: 26rpx; display: flex; flex-direction: column; gap: 18rpx; }
.question-card { width: 100%; padding: 28rpx; border-radius: 28rpx; background: #fffdf7; border: 1rpx solid rgba(23,32,25,.08); text-align: left; display: flex; flex-direction: column; box-sizing: border-box; }
.question-card.selected { border-color: #71833f; box-shadow: inset 0 0 0 2rpx rgba(113,131,63,.16); }
.card-topline { display: flex; align-items: center; min-height: 34rpx; }
.card-state, .review-due { font-size: 19rpx; letter-spacing: 1rpx; color: #708071; }
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
