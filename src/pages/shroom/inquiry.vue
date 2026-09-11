<template>
	<view class="inquiry-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="navbar">
			<button class="nav-back" @tap="goBack"><text>‹</text></button>
			<view class="nav-copy"><text class="nav-kicker">LIVING QUESTION</text><text class="nav-title">问题线索</text></view>
			<text v-if="inquiry" class="nav-version">{{ inquiry.synthesisVersion ? 'V' + inquiry.synthesisVersion : '未定稿' }}</text>
		</view>

		<scroll-view class="content-scroll" scroll-y>
			<view class="page-shell" v-if="inquiry">
				<view class="question-hero">
					<text class="hero-state">{{ statusLabel(inquiry.status) }}</text>
					<text class="hero-question">{{ inquiry.question }}</text>
					<text v-if="inquiry.context" class="hero-context">{{ inquiry.context }}</text>
					<view class="hero-meta">
						<text>{{ inquiry.evidenceCount }} 条线索</text>
						<text v-if="inquiry.newEvidenceCount">上次以后新增 {{ inquiry.newEvidenceCount }} 条</text>
						<text v-if="inquiry.lastReviewedAt">{{ formatDate(inquiry.lastReviewedAt) }} 回看</text>
					</view>
				</view>

				<view class="review-panel" v-if="inquiry.currentSynthesis && inquiry.currentSynthesis.summary">
					<view class="section-topline"><text class="section-kicker">CURRENT UNDERSTANDING</text><text class="section-index">V{{ inquiry.synthesisVersion }}</text></view>
					<text class="section-title">此刻最可靠的理解</text>
					<text class="synthesis-summary">{{ inquiry.currentSynthesis.summary }}</text>

					<view v-if="inquiry.currentSynthesis.whatChanged" class="finding-block">
						<text class="finding-label">发生了什么变化</text>
						<text class="finding-copy">{{ inquiry.currentSynthesis.whatChanged }}</text>
					</view>
					<view v-for="(item, index) in inquiry.currentSynthesis.hypotheses || []" :key="index" class="hypothesis-row">
						<view class="hypothesis-mark">{{ index + 1 }}</view>
						<view class="hypothesis-copy"><text>{{ item.statement }}</text><text>{{ confidenceLabel(item.confidence) }} · 支持 {{ (item.supportingEvidenceRefs || []).length }} · 反例 {{ (item.challengingEvidenceRefs || []).length }}</text></view>
					</view>
					<view v-if="inquiry.currentSynthesis.unknowns && inquiry.currentSynthesis.unknowns.length" class="finding-block unknown-block">
						<text class="finding-label">仍然不知道</text>
						<text v-for="(item, index) in inquiry.currentSynthesis.unknowns" :key="index" class="unknown-item">· {{ item }}</text>
					</view>
					<view v-if="inquiry.currentSynthesis.nextObservation" class="next-observation">
						<text>下一次值得观察</text><text>{{ inquiry.currentSynthesis.nextObservation }}</text>
					</view>
					<text v-if="inquiry.currentSynthesis.statusSuggestion === 'RESOLVED' && inquiry.status !== 'RESOLVED'" class="status-suggestion">AI 认为证据已经接近稳定，但是否“想明白”仍由你确认。</text>
					<button v-if="inquiry.history && inquiry.history.length > 1" class="history-toggle" @tap="historyOpen = !historyOpen">{{ historyOpen ? '收起过去的理解' : `查看过去 ${inquiry.history.length - 1} 个版本` }} <text>›</text></button>
					<view v-if="historyOpen" class="history-list">
						<view v-for="item in inquiry.history.slice(1)" :key="item.version" class="history-item">
							<view><text>V{{ item.version }}</text><text>{{ formatDate(item.createdAt) }}</text></view>
							<text>{{ item.result && item.result.summary }}</text>
						</view>
					</view>
				</view>
				<view class="invalidated-panel" v-else-if="inquiry.history && inquiry.history.length">
					<text>来源已经发生变化</text>
					<text>过去的理解仍保留在历史中，但不再作为当前结论。请在需要时用现有线索重新核对。</text>
					<button class="invalidated-history-button" @tap="historyOpen = !historyOpen">{{ historyOpen ? '收起历史版本' : `查看 ${inquiry.history.length} 个历史版本` }}</button>
					<view v-if="historyOpen" class="history-list">
						<view v-for="item in inquiry.history" :key="item.version" class="history-item">
							<view><text>V{{ item.version }} · 已失效</text><text>{{ formatDate(item.createdAt) }}</text></view>
							<text>{{ item.result && item.result.summary }}</text>
						</view>
					</view>
				</view>

				<view class="review-callout" :class="{ due: inquiry.reviewDue }">
					<view class="review-copy">
						<text class="review-title">{{ reviewTitle }}</text>
						<text class="review-description">AI 会同时寻找支持、反例和缺口，并保存为可回看的新版本。</text>
					</view>
					<button class="review-button" :disabled="reviewing || inquiry.usableEvidenceCount < 2" @tap="reviewInquiry">{{ reviewing ? '正在核对…' : '重新看看' }}</button>
					<view v-if="reviewing" class="progress-track"><view class="progress-fill"></view></view>
					<text v-if="costText" class="cost-text">累计复盘 {{ costText }}</text>
				</view>

				<view class="evidence-section">
					<view class="section-topline"><text class="section-kicker">EVIDENCE TRAIL</text><text class="section-index">{{ inquiry.evidence.length }}</text></view>
					<text class="section-title">生活留下的线索</text>
					<text class="section-intro">关联只在你确认后发生；日记关闭 AI 读取后，也不会进入复盘。</text>

					<button v-if="!addingEvidence && inquiry.status !== 'RESOLVED'" class="add-evidence-entry" @tap="addingEvidence = true">
						<text>＋</text><view><text>补一条新线索</text><text>观察、行动结果、外部材料或反例</text></view>
					</button>
					<view v-if="addingEvidence" class="evidence-form">
						<text class="field-label">这条线索是什么</text>
						<textarea v-model="evidenceDraft.excerpt" class="evidence-input" maxlength="5000" placeholder="写下发生了什么，或粘贴一段值得保留的材料……" :show-confirm-bar="false" />
						<view class="relation-row source-type-row">
							<button v-for="item in sourceTypes" :key="item.value" class="relation-chip" :class="{ active: evidenceDraft.sourceType === item.value }" @tap="evidenceDraft.sourceType = item.value">{{ item.label }}</button>
						</view>
						<view class="relation-row">
							<button v-for="item in relations" :key="item.value" class="relation-chip" :class="{ active: evidenceDraft.relation === item.value }" @tap="evidenceDraft.relation = item.value">{{ item.label }}</button>
						</view>
						<input v-model="evidenceDraft.sourceLabel" class="source-input" maxlength="240" placeholder="来源或标题（可选）" />
						<view class="form-actions"><button class="cancel-button" @tap="cancelEvidence">取消</button><button class="save-button" :disabled="savingEvidence || !evidenceDraft.excerpt.trim()" @tap="saveEvidence">{{ savingEvidence ? '保存中' : '加入线索' }}</button></view>
					</view>

					<view class="evidence-list" v-if="inquiry.evidence.length">
						<view v-for="item in inquiry.evidence" :key="item.id" class="evidence-card" @tap="openEvidence(item)">
							<view class="evidence-topline"><text class="evidence-type">{{ evidenceTypeLabel(item.sourceType) }}</text><text>{{ item.sourceDate || formatDate(item.createdAt) }}</text></view>
							<text class="evidence-excerpt">{{ item.excerpt }}</text>
							<view class="evidence-footer"><text>{{ relationLabel(item.relation) }}</text><text v-if="item.diaryId && !item.aiAllowed" class="ai-locked">未授权 AI 读取</text><text v-else-if="item.sourceLabel">{{ item.sourceLabel }}</text></view>
						</view>
					</view>
					<view v-else class="evidence-empty"><text>还没有线索</text><text>可以在写日记时关联，也可以在这里手动补充。</text></view>
				</view>

				<view class="status-section">
					<text class="section-kicker">YOU DECIDE</text>
					<text class="section-title">这个问题现在在哪里？</text>
					<view class="status-actions">
						<button v-for="item in statuses" :key="item.value" class="status-button" :class="{ active: inquiry.status === item.value }" @tap="changeStatus(item.value)">{{ item.label }}</button>
					</view>
					<text class="status-note">状态不会由 AI 自动改变。暂停和想明白都保留全部线索与历史版本。</text>
				</view>
				<view class="bottom-space"></view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import { inquiryDetail, inquiryEvidence, inquiryReview } from '@/api/inquiry';

export default {
	data() {
		return {
			statusBarHeight: 0,
			inquiryId: null,
			inquiry: null,
			reviewing: false,
			historyOpen: false,
			addingEvidence: false,
			savingEvidence: false,
			evidenceDraft: { excerpt: '', sourceLabel: '', relation: 'CONTEXT', sourceType: 'NOTE' },
			relations: [
				{ value: 'CONTEXT', label: '新背景' },
				{ value: 'SUPPORT', label: '支持' },
				{ value: 'CHALLENGE', label: '反例' },
				{ value: 'UNKNOWN', label: '还不确定' }
			],
			sourceTypes: [
				{ value: 'NOTE', label: '观察' },
				{ value: 'ACTION', label: '行动结果' },
				{ value: 'LINK', label: '外部材料' },
				{ value: 'REFLECTION', label: '讨论记录' }
			],
			statuses: [
				{ value: 'OPEN', label: '继续观察' },
				{ value: 'PAUSED', label: '先放一放' },
				{ value: 'RESOLVED', label: '我已想明白' }
			]
		};
	},
	computed: {
		reviewTitle() {
			if (!this.inquiry || this.inquiry.usableEvidenceCount < 2) return '再积累一条可用线索，就适合一起看';
			if (this.inquiry.reviewDue) return '新证据已经值得重新理解';
			return '需要时，再用全部线索重新核对';
		},
		costText() {
			const cost = this.inquiry && this.inquiry.costSummary;
			if (!cost || !cost.calls) return '';
			const money = cost.costCny === null ? '费用以供应商账单为准' : `约 ¥${Number(cost.costCny).toFixed(4)}`;
			return `${cost.calls} 次 · ${cost.totalTokens} tokens · ${money}`;
		}
	},
	onLoad(options) {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.inquiryId = options && options.id;
		if (!this.inquiryId) return this.goBack();
		this.loadInquiry();
	},
	methods: {
		async loadInquiry(showLoading = true) {
			if (showLoading) uni.showLoading({ title: '读取线索…' });
			try {
				const res = await this.$http.get(inquiryDetail(this.inquiryId));
				this.inquiry = res.data;
			} catch (error) {
				console.error('加载问题失败', error);
			} finally {
				if (showLoading) uni.hideLoading();
			}
		},
		statusLabel(value) { return { OPEN: '正在想', PAUSED: '先放一放', RESOLVED: '已经想明白' }[value] || '正在想'; },
		confidenceLabel(value) { return { emerging: '初步判断', medium: '已有一些依据', strong: '目前证据较强' }[value] || '初步判断'; },
		evidenceTypeLabel(value) { return { DIARY: '日记', NOTE: '观察', LINK: '外部材料', ACTION: '行动结果', REFLECTION: '讨论记录' }[value] || '线索'; },
		relationLabel(value) { return { SUPPORT: '支持当前理解', CHALLENGE: '反例 / 冲突', CONTEXT: '补充背景', UNKNOWN: '关系未确定' }[value] || '补充背景'; },
		formatDate(value) {
			if (!value) return '';
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
			return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
		},
		async reviewInquiry() {
			if (this.reviewing || this.inquiry.usableEvidenceCount < 2) return;
			this.reviewing = true;
			try {
				await this.$http.post(inquiryReview(this.inquiryId), {});
				await this.loadInquiry(false);
				uni.showToast({ title: '新的理解已形成', icon: 'success' });
			} catch (error) {
				console.error('复盘问题失败', error);
			} finally {
				this.reviewing = false;
			}
		},
		cancelEvidence() {
			this.addingEvidence = false;
			this.evidenceDraft = { excerpt: '', sourceLabel: '', relation: 'CONTEXT', sourceType: 'NOTE' };
		},
		async saveEvidence() {
			if (!this.evidenceDraft.excerpt.trim() || this.savingEvidence) return;
			this.savingEvidence = true;
			try {
				await this.$http.post(inquiryEvidence(this.inquiryId), this.evidenceDraft);
				this.cancelEvidence();
				await this.loadInquiry(false);
				uni.showToast({ title: '线索已加入', icon: 'success' });
			} catch (error) {
				console.error('保存线索失败', error);
			} finally {
				this.savingEvidence = false;
			}
		},
		openEvidence(item) {
			if (item.diaryId) uni.navigateTo({ url: `/pages/diary/edit?id=${item.diaryId}` });
		},
		changeStatus(value) {
			if (this.inquiry.status === value) return;
			const apply = async () => {
				try {
					await this.$http.patch(inquiryDetail(this.inquiryId), { status: value });
					await this.loadInquiry(false);
					uni.showToast({ title: '状态已更新', icon: 'none' });
				} catch (error) { console.error('更新问题状态失败', error); }
			};
			if (value !== 'RESOLVED') return apply();
			uni.showModal({
				title: '确认已经想明白？',
				content: '线索和历史理解会继续保留，以后也可以重新打开。',
				confirmText: '确认',
				success: result => { if (result.confirm) apply(); }
			});
		},
		goBack() { uni.navigateBack(); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1; border-radius: 0; background: transparent; }
button::after { border: 0; }
.inquiry-page { height: 100vh; display: flex; flex-direction: column; background: #f1f8e9; color: #172019; }
.status-bar, .navbar { flex-shrink: 0; }
.navbar { height: 112rpx; padding: 0 34rpx; display: flex; align-items: center; border-bottom: 1rpx solid rgba(23,32,25,.08); box-sizing: border-box; }
.nav-back { width: 68rpx; height: 68rpx; border: 1rpx solid rgba(23,32,25,.12); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 52rpx; }
.nav-copy { flex: 1; padding-left: 22rpx; display: flex; flex-direction: column; }
.nav-kicker, .section-kicker { font-size: 17rpx; letter-spacing: 3rpx; color: #718075; font-weight: 700; }
.nav-title { margin-top: 8rpx; font-size: 29rpx; font-weight: 700; }
.nav-version { color: #718075; font-size: 21rpx; }
.content-scroll { flex: 1; height: 0; }
.page-shell { width: 100%; max-width: 920rpx; margin: 0 auto; padding: 50rpx 34rpx 0; box-sizing: border-box; }
.question-hero { padding: 12rpx 10rpx 48rpx; display: flex; flex-direction: column; }
.hero-state { font-size: 19rpx; letter-spacing: 3rpx; color: #70804d; font-weight: 700; }
.hero-question { margin-top: 18rpx; font-family: Georgia, 'Songti SC', serif; font-size: 46rpx; line-height: 1.45; }
.hero-context { margin-top: 20rpx; color: #657065; font-size: 24rpx; line-height: 1.75; }
.hero-meta { margin-top: 25rpx; display: flex; flex-wrap: wrap; gap: 18rpx; color: #838a83; font-size: 20rpx; }
.review-panel, .evidence-section, .status-section { margin-bottom: 24rpx; padding: 32rpx; border-radius: 30rpx; background: #fffdf7; border: 1rpx solid rgba(23,32,25,.07); }
.invalidated-panel { margin-bottom: 24rpx; padding: 26rpx 30rpx; border-radius: 24rpx; background: #f4e9df; display: flex; flex-direction: column; }
.invalidated-panel > text:first-child { color: #704f38; font-size: 23rpx; font-weight: 700; }
.invalidated-panel > text:nth-child(2) { margin-top: 10rpx; color: #826b5a; font-size: 20rpx; line-height: 1.65; }
.invalidated-history-button { margin-top: 18rpx; height: 58rpx; border-radius: 30rpx; background: rgba(112,79,56,.09); color: #704f38; font-size: 19rpx; display: flex; align-items: center; justify-content: center; }
.section-topline { display: flex; align-items: center; justify-content: space-between; }
.section-index { font-size: 20rpx; color: #879087; }
.section-title { display: block; margin-top: 15rpx; font-family: Georgia, 'Songti SC', serif; font-size: 32rpx; line-height: 1.45; }
.section-intro { display: block; margin-top: 12rpx; color: #7a837b; font-size: 21rpx; line-height: 1.65; }
.synthesis-summary { display: block; margin-top: 24rpx; font-size: 25rpx; line-height: 1.85; color: #323b34; white-space: pre-wrap; }
.finding-block { margin-top: 26rpx; padding: 24rpx; border-radius: 20rpx; background: #f3f3e8; display: flex; flex-direction: column; }
.finding-label { color: #677057; font-size: 20rpx; font-weight: 700; }
.finding-copy, .unknown-item { margin-top: 11rpx; font-size: 23rpx; line-height: 1.72; }
.hypothesis-row { margin-top: 22rpx; display: flex; align-items: flex-start; }
.hypothesis-mark { flex: 0 0 42rpx; width: 42rpx; height: 42rpx; border-radius: 50%; background: #dfe8bd; display: flex; align-items: center; justify-content: center; font-size: 19rpx; }
.hypothesis-copy { padding-left: 16rpx; flex: 1; display: flex; flex-direction: column; }
.hypothesis-copy text:first-child { font-size: 23rpx; line-height: 1.65; }
.hypothesis-copy text:last-child { margin-top: 8rpx; color: #858d85; font-size: 19rpx; }
.unknown-block { background: #f6eee8; }
.next-observation { margin-top: 26rpx; padding-top: 22rpx; border-top: 1rpx solid rgba(23,32,25,.08); display: flex; flex-direction: column; }
.next-observation text:first-child { color: #738073; font-size: 19rpx; font-weight: 700; }
.next-observation text:last-child { margin-top: 10rpx; font-size: 23rpx; line-height: 1.7; }
.status-suggestion { display: block; margin-top: 20rpx; color: #85683e; font-size: 20rpx; line-height: 1.6; }
.history-toggle { width: 100%; margin-top: 24rpx; padding-top: 20rpx; border-top: 1rpx solid rgba(23,32,25,.08); color: #657065; font-size: 20rpx; line-height: 1.4; text-align: left; display: flex; align-items: center; justify-content: space-between; }
.history-toggle text { font-size: 25rpx; }
.history-list { margin-top: 18rpx; display: flex; flex-direction: column; gap: 12rpx; }
.history-item { padding: 20rpx; border-radius: 18rpx; background: #f5f3ea; }
.history-item > view { display: flex; justify-content: space-between; color: #818981; font-size: 18rpx; }
.history-item > text { display: block; margin-top: 10rpx; color: #404840; font-size: 21rpx; line-height: 1.65; }
.review-callout { margin-bottom: 24rpx; padding: 28rpx; border-radius: 28rpx; background: #dfe8bd; }
.review-callout.due { background: #d7e4a9; }
.review-copy { display: flex; flex-direction: column; }
.review-title { font-size: 26rpx; font-weight: 700; line-height: 1.4; }
.review-description { margin-top: 10rpx; color: #5d674d; font-size: 21rpx; line-height: 1.65; }
.review-button { margin-top: 22rpx; width: 100%; height: 70rpx; border-radius: 36rpx; background: #263025; color: white; display: flex; align-items: center; justify-content: center; font-size: 23rpx; }
.review-button[disabled] { opacity: .38; }
.progress-track { margin-top: 18rpx; height: 5rpx; border-radius: 4rpx; background: rgba(38,48,37,.15); overflow: hidden; }
.progress-fill { width: 45%; height: 100%; background: #263025; animation: loading 1.4s ease-in-out infinite alternate; }
@keyframes loading { from { transform: translateX(-20%); } to { transform: translateX(140%); } }
.cost-text { display: block; margin-top: 15rpx; color: #68705b; font-size: 18rpx; }
.add-evidence-entry { width: 100%; margin-top: 24rpx; min-height: 104rpx; padding: 20rpx; border: 1rpx dashed rgba(82,98,47,.35); border-radius: 20rpx; display: flex; align-items: center; text-align: left; }
.add-evidence-entry > text { width: 48rpx; font-size: 33rpx; }
.add-evidence-entry view { flex: 1; display: flex; flex-direction: column; }
.add-evidence-entry view text:first-child { font-size: 23rpx; font-weight: 650; }
.add-evidence-entry view text:last-child { margin-top: 8rpx; color: #7e877e; font-size: 19rpx; }
.evidence-form { margin-top: 24rpx; padding: 24rpx; border-radius: 22rpx; background: #f4f5e9; }
.field-label { display: block; font-size: 21rpx; font-weight: 650; }
.evidence-input { display: block; width: 100%; max-width: 100%; height: 210rpx; margin-top: 13rpx; padding: 18rpx; box-sizing: border-box; border-radius: 16rpx; background: white; font-size: 24rpx; line-height: 1.65; overflow-x: hidden; word-break: break-word; overflow-wrap: anywhere; }
.relation-row { margin-top: 16rpx; display: flex; flex-wrap: wrap; gap: 10rpx; }
.source-type-row { padding-bottom: 14rpx; border-bottom: 1rpx solid rgba(23,32,25,.07); }
.relation-chip { height: 54rpx; padding: 0 19rpx; border-radius: 28rpx; color: #657065; font-size: 19rpx; display: flex; align-items: center; justify-content: center; }
.relation-chip.active { background: #52622f; color: white; }
.source-input { margin-top: 16rpx; height: 68rpx; padding: 0 18rpx; box-sizing: border-box; border-radius: 16rpx; background: white; font-size: 22rpx; }
.form-actions { margin-top: 18rpx; display: flex; justify-content: flex-end; gap: 14rpx; }
.cancel-button, .save-button { height: 60rpx; padding: 0 22rpx; border-radius: 30rpx; display: flex; align-items: center; justify-content: center; font-size: 21rpx; }
.cancel-button { border: 1rpx solid rgba(23,32,25,.14); }
.save-button { background: #52622f; color: white; }
.save-button[disabled] { opacity: .35; }
.evidence-list { margin-top: 24rpx; display: flex; flex-direction: column; gap: 14rpx; }
.evidence-card { padding: 23rpx; border-radius: 20rpx; background: #f6f5ed; }
.evidence-topline, .evidence-footer { display: flex; justify-content: space-between; gap: 18rpx; color: #858c85; font-size: 18rpx; }
.evidence-type { color: #61715f; font-weight: 700; }
.evidence-excerpt { display: -webkit-box; margin-top: 13rpx; color: #303832; font-size: 22rpx; line-height: 1.65; overflow: hidden; -webkit-line-clamp: 4; -webkit-box-orient: vertical; white-space: normal; word-break: break-word; }
.evidence-footer { margin-top: 16rpx; padding-top: 13rpx; border-top: 1rpx solid rgba(23,32,25,.06); }
.ai-locked { color: #ad6157; }
.evidence-empty { padding: 48rpx 10rpx 24rpx; display: flex; align-items: center; flex-direction: column; color: #7d867e; }
.evidence-empty text:first-child { font-size: 24rpx; color: #4c574e; }
.evidence-empty text:last-child { margin-top: 10rpx; font-size: 20rpx; line-height: 1.6; text-align: center; }
.status-actions { margin-top: 22rpx; display: flex; flex-wrap: wrap; gap: 11rpx; }
.status-button { height: 60rpx; padding: 0 22rpx; border-radius: 30rpx; border: 1rpx solid rgba(23,32,25,.12); font-size: 20rpx; display: flex; align-items: center; justify-content: center; }
.status-button.active { background: #263025; color: white; }
.status-note { display: block; margin-top: 18rpx; color: #818981; font-size: 19rpx; line-height: 1.6; }
.bottom-space { height: calc(100rpx + env(safe-area-inset-bottom)); }
@media (min-width: 960px) { .page-shell { padding-top: 70rpx; } }
</style>
