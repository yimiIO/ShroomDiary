<template>
	<view class="page">
		<shroom-page-top-spacer />
		<view class="shell">
			<view class="header">
				<button class="back" aria-label="返回" @tap="goBack">‹</button>
				<view class="heading">
					<text class="kicker">PERSONAL OPERATING SYSTEM</text>
					<text class="title">人生 OS</text>
				</view>
				<view class="version">V{{ version }}</view>
			</view>

			<view class="manifesto">
				<text class="manifesto-index">OS</text>
				<text class="manifesto-title">菇卡帮助我在具体时刻做得更好。</text>
				<text class="manifesto-title accent">人生 OS 帮助我决定什么才叫“更好”。</text>
				<text class="manifesto-copy">它不是不断增长的原则仓库，而是此刻真正生效、仍可继续修订的少量判断标准。</text>
			</view>

			<view class="layer-map">
				<view><text>日记</text><text>保存经历</text></view>
				<view><text>菇卡</text><text>保存可复用的理解</text></view>
				<view class="active"><text>人生 OS</text><text>定义什么才叫更好</text></view>
			</view>

			<view class="runtime-strip">
				<view><text class="runtime-number">{{ activeCount }}</text><text>条当前原则</text></view>
				<view><text class="runtime-number">{{ pendingCount }}</text><text>份待确认建议</text></view>
				<view><text class="runtime-number">{{ maximumActiveCount }}</text><text>条生效上限</text></view>
			</view>

			<view class="organizer">
				<view class="section-heading">
					<view><text class="section-kicker">REVIEW, DON'T ACCUMULATE</text><text class="section-title">整理，而不是继续堆积</text></view>
					<text class="review-state" :class="{ quiet: !reviewDue }">{{ reviewDue ? '建议复查' : '当前稳定' }}</text>
				</view>
				<text class="organizer-copy">AI 会寻找重复、上下级关系、具体情境内容和真实冲突，给出保持、改写、合并、转为菇卡、继续观察或退休的建议。</text>
				<view class="signal-list" v-if="reviewReasons.length">
					<view v-for="reason in reviewReasons" :key="reason"><view></view><text>{{ reason }}</text></view>
				</view>
				<view class="privacy-note"><view></view><text>整理只产生待确认建议。AI 不会自动修改、公开或删除你的人生 OS。</text></view>
				<view class="generation-progress" v-if="generating">
					<view><text>正在辨认重复、边界与冲突</text><text>{{ generationProgress }}%</text></view>
					<view class="progress-track"><view :style="{ width: generationProgress + '%' }"></view></view>
					<text>已用时 {{ generationElapsed }} 秒 · 当前版本不会被覆盖</text>
				</view>
				<button class="primary-button" :disabled="generating || publishing" @tap="confirmReview">
					{{ generating ? ('正在整理 · ' + generationProgress + '%') : reviewButtonText }}
				</button>
				<button class="text-button" v-if="canManualEdit && !proposal" :disabled="generating || publishing" @tap="startManualEdit">亲自逐条调整</button>
			</view>

			<view class="proposal" v-if="proposal">
				<view class="proposal-hero">
					<text class="section-kicker">PENDING REVIEW</text>
					<view class="proposal-counts">
						<view><text>{{ proposal.previousPrincipleCount || activeCount || '—' }}</text><text>整理前</text></view>
						<text class="proposal-arrow">→</text>
						<view><text>{{ selectedPrincipleCount }}</text><text>拟生效</text></view>
					</view>
					<text class="proposal-summary">{{ proposal.summary || '请逐条检查。你可以修改文字，也可以取消不认可的原则。' }}</text>
					<text class="proposal-warning">这还不是你的人生 OS。只有最后点击“确认签发”，它才会成为新版本。</text>
				</view>

				<view class="principle-editor" v-for="(item, index) in proposal.principles" :key="item.key" :class="{ excluded: !item.included }">
					<view class="principle-head">
						<view class="principle-toggle" :class="{ selected: item.included }" @tap="togglePrinciple(index)"><text>{{ item.included ? '✓' : '' }}</text></view>
						<view class="principle-meta">
							<text>{{ String(index + 1).padStart(2, '0') }} · {{ item.area }}</text>
							<text>{{ basisLabel(item.basis) }} · {{ confidenceLabel(item.confidence) }}</text>
						</view>
						<text class="include-label" @tap="togglePrinciple(index)">{{ item.included ? '纳入新版' : '不纳入' }}</text>
					</view>
					<template v-if="item.included">
						<text class="field-label">判断标准</text>
						<textarea class="principle-input" v-model="item.principle" maxlength="600" :show-confirm-bar="false" auto-height />
						<text class="field-label">适用边界</text>
						<textarea class="support-input" v-model="item.boundary" maxlength="600" :show-confirm-bar="false" auto-height placeholder="它在什么情况下不适用？" />
						<text class="field-label">未来复盘时问自己</text>
						<textarea class="support-input" v-model="item.reviewQuestion" maxlength="600" :show-confirm-bar="false" auto-height placeholder="怎样知道这条原则仍然适合现在的我？" />
						<view class="evidence-row" v-if="item.evidenceLabels && item.evidenceLabels.length">
							<text>支持依据</text><text>{{ item.evidenceLabels.join('、') }}</text>
						</view>
						<view class="evidence-row challenge" v-if="item.counterEvidenceLabels && item.counterEvidenceLabels.length">
							<text>反例</text><text>{{ item.counterEvidenceLabels.join('、') }}</text>
						</view>
					</template>
				</view>

				<view class="card-drafts" v-if="proposal.cardDrafts && proposal.cardDrafts.length">
					<view class="subsection-heading"><view><text>建议留作菇卡的理解</text><text>菇卡不是行动，默认不会创建</text></view></view>
					<view class="card-draft" v-for="(card, index) in proposal.cardDrafts" :key="card.key" @tap="toggleCardDraft(index)">
						<view class="principle-toggle" :class="{ selected: card.selected }"><text>{{ card.selected ? '✓' : '' }}</text></view>
						<view><text>{{ card.seedSentence }}</text><text>{{ card.myUnderstanding }}</text></view>
					</view>
				</view>

				<view class="tensions" v-if="proposal.tensions && proposal.tensions.length">
					<text class="subsection-title">仍在观察，不强行归纳</text>
					<text v-for="tension in proposal.tensions" :key="tension">{{ tension }}</text>
				</view>

				<view class="changes-toggle" @tap="showChanges = !showChanges"><text>为什么这样整理</text><text>{{ showChanges ? '收起' : '查看全部' }}　›</text></view>
				<view class="changes" v-if="showChanges">
					<view class="change-item" v-for="(change, index) in proposal.changes" :key="index">
						<text :class="'change-tag ' + change.type">{{ changeLabel(change.type) }}</text>
						<view><text>{{ change.title || changeLabel(change.type) }}</text><text>{{ change.reason }}</text></view>
					</view>
				</view>

				<button class="publish-button" :disabled="publishing || !canPublish" @tap="confirmPublish">
					{{ publishing ? '正在签发…' : ('确认签发 V' + (version + 1) + ' · ' + selectedPrincipleCount + ' 条原则') }}
				</button>
				<button class="reject-button" :disabled="publishing || rejecting" @tap="rejectProposal">{{ rejecting ? '正在处理…' : '不采用这次建议，保留当前版本' }}</button>
			</view>

			<view class="current-section">
				<view class="current-heading">
					<view><text class="section-kicker">CURRENTLY ACTIVE</text><text class="section-title">当前生效</text></view>
					<text>{{ activeCount }}/{{ maximumActiveCount }}</text>
				</view>
				<view class="current-list" v-if="clauses.length">
					<view class="current-clause" v-for="(item, index) in clauses" :key="item.id">
						<view class="clause-index"><text>{{ String(index + 1).padStart(2, '0') }}</text><text>{{ item.area }}</text></view>
						<text class="clause-principle">{{ item.principle }}</text>
						<view class="clause-detail" v-if="item.boundary"><text>边界</text><text>{{ item.boundary }}</text></view>
						<view class="clause-detail" v-if="item.reviewQuestion"><text>复盘</text><text>{{ item.reviewQuestion }}</text></view>
						<view class="clause-foot"><text>{{ basisLabel(item.basis) }}</text><text v-if="item.sourceRefs && item.sourceRefs.length">{{ item.sourceRefs.length }} 条依据</text></view>
					</view>
				</view>
				<view class="legacy" v-else-if="config.configured">
					<view class="legacy-note"><text>旧版人生 OS</text><text>内容完整保留，但还没有拆成可以独立合并、修订和退休的原则。</text></view>
					<view class="legacy-toggle" @tap="showLegacy = !showLegacy"><text>{{ showLegacy ? '收起原文' : '查看当前原文' }}</text><text>›</text></view>
					<text class="legacy-content" selectable v-if="showLegacy">{{ config.contentMd }}</text>
				</view>
				<view class="empty" v-else>
					<text>还没有正在生效的人生 OS</text>
					<text>你可以从主动选择的一条判断标准开始，也可以等记录积累后再让 AI 帮你整理。</text>
					<button class="empty-action" @tap="startManualEdit">写下第一条原则</button>
				</view>
			</view>

			<view class="history-toggle" @tap="toggleHistory"><text>签发版本</text><text>{{ showHistory ? '收起' : '查看历史' }}　›</text></view>
			<view class="history" v-if="showHistory">
				<view class="history-item" v-for="item in history" :key="item.version">
					<view><text>V{{ item.version }} · {{ originLabel(item.origin) }}</text><text>{{ formatDate(item.createdAt) }}</text></view>
					<text>{{ preview(item.contentMd) }}</text>
					<text class="history-source" v-if="item.sourceRefs && item.sourceRefs.length">保留 {{ item.sourceRefs.length }} 条来源引用</text>
				</view>
				<text class="history-empty" v-if="!history.length">签发第一版后，这里会留下可以回看的版本。</text>
			</view>
		</view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import {
	lifeOsHistory,
	lifeOsReviewDraft,
	lifeOsReviewManual,
	lifeOsReviewPublish,
	lifeOsReviewReject,
	lifeOsWorkspace
} from '@/api/shroom-system';

export default {
	data() {
		return {
			statusBarHeight: 0,
			config: { configured: false, contentMd: '', version: 0 },
			clauses: [],
			proposal: null,
			reviewSignal: null,
			policy: null,
			generating: false,
			publishing: false,
			rejecting: false,
			generationElapsed: 0,
			generationProgress: 0,
			generationTimer: null,
			showChanges: false,
			showLegacy: false,
			showHistory: false,
			history: []
		};
	},
	computed: {
		version() { return Number(this.config.version || 0); },
		activeCount() { return this.clauses.length; },
		pendingCount() { return this.proposal ? 1 : 0; },
		maximumActiveCount() { return Number((this.policy && this.policy.maximumActiveCount) || 50); },
		reviewDue() { return Boolean(this.reviewSignal && this.reviewSignal.due); },
		reviewReasons() { return (this.reviewSignal && this.reviewSignal.reasons) || []; },
		selectedPrincipleCount() {
			if (!this.proposal || !this.proposal.principles) return 0;
			return this.proposal.principles.filter(item => item.included && String(item.principle || '').trim()).length;
		},
		canPublish() { return this.selectedPrincipleCount > 0 && this.selectedPrincipleCount <= this.maximumActiveCount; },
		canManualEdit() { return !this.config.configured || this.clauses.length > 0; },
		reviewButtonText() {
			if (this.proposal) return '重新生成一份整理建议';
			if (this.config.configured && !this.clauses.length) return '整理并精简现有 OS';
			if (this.clauses.length) return '根据新记录检查与修订';
			return '从我的记录生成探索版';
		}
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.load();
	},
	onUnload() { this.stopGenerationProgress(false); },
	methods: {
		prepareProposal(value) {
			if (!value) return null;
			return {
				...value,
				principles: (value.principles || []).map(item => ({ ...item, included: true })),
				cardDrafts: (value.cardDrafts || []).map(item => ({ ...item, selected: false }))
			};
		},
		async load() {
			try {
				const res = await this.$http.get(lifeOsWorkspace);
				const data = res.data || {};
				this.config = data.config || { configured: false, contentMd: '', version: 0 };
				this.clauses = data.clauses || [];
				this.reviewSignal = data.reviewSignal || null;
				this.policy = data.policy || null;
				this.proposal = this.prepareProposal(data.pendingProposal);
			} catch (error) {
				console.error('加载人生 OS 工作区失败', error);
				uni.showToast({ title: '人生 OS 没有加载完成', icon: 'none' });
			}
		},
		confirmReview() {
			if (this.generating || this.publishing) return;
			uni.showModal({
				title: this.config.configured ? '检查并整理当前 OS？' : '从记录中形成探索版？',
				content: 'AI 会读取你允许用于分析的日记、自己的菇卡和当前 OS，只生成一份待确认建议，不会自动生效。',
				confirmText: '开始整理',
				cancelText: '取消',
				success: result => { if (result.confirm) this.generateReview(); }
			});
		},
		startGenerationProgress() {
			this.stopGenerationProgress(false);
			this.generationElapsed = 0;
			this.generationProgress = 5;
			this.generationTimer = setInterval(() => {
				this.generationElapsed += 1;
				this.generationProgress = Math.min(92, 5 + Math.floor(87 * (1 - Math.exp(-this.generationElapsed / 42))));
			}, 1000);
		},
		stopGenerationProgress(success) {
			if (this.generationTimer) clearInterval(this.generationTimer);
			this.generationTimer = null;
			if (success) this.generationProgress = 100;
		},
		async generateReview() {
			this.generating = true;
			this.startGenerationProgress();
			try {
				const res = await this.$http.post(lifeOsReviewDraft, {});
				this.stopGenerationProgress(true);
				this.proposal = this.prepareProposal(res.data);
				this.showChanges = true;
				uni.showToast({ title: '整理建议已生成', icon: 'success' });
			} catch (error) {
				this.stopGenerationProgress(false);
				console.error('生成人生 OS 整理建议失败', error);
				uni.showToast({ title: typeof error === 'string' ? error : '整理建议没有生成完成', icon: 'none' });
			} finally { this.generating = false; }
		},
		async startManualEdit() {
			if (!this.canManualEdit || this.generating || this.publishing) return;
			try {
				const res = await this.$http.post(lifeOsReviewManual, {});
				this.proposal = this.prepareProposal(res.data);
				this.showChanges = false;
			} catch (error) {
				console.error('进入人生 OS 逐条编辑失败', error);
				uni.showToast({ title: typeof error === 'string' ? error : '暂时无法进入编辑', icon: 'none' });
			}
		},
		togglePrinciple(index) {
			this.proposal.principles[index].included = !this.proposal.principles[index].included;
		},
		toggleCardDraft(index) {
			this.proposal.cardDrafts[index].selected = !this.proposal.cardDrafts[index].selected;
		},
		confirmPublish() {
			if (!this.canPublish || this.publishing) return;
			const selectedCards = (this.proposal.cardDrafts || []).filter(item => item.selected).length;
			const cardCopy = selectedCards ? `，并创建 ${selectedCards} 张你选中的私密菇卡` : '';
			uni.showModal({
				title: `签发 V${this.version + 1}？`,
				content: `新版本将包含 ${this.selectedPrincipleCount} 条当前原则${cardCopy}。旧版本会完整保留，可以回看。`,
				confirmText: '确认签发',
				cancelText: '继续检查',
				success: result => { if (result.confirm) this.publish(); }
			});
		},
		async publish() {
			this.publishing = true;
			try {
				const res = await this.$http.post(lifeOsReviewPublish(this.proposal.id), {
					principles: this.proposal.principles.map(item => ({
						key: item.key,
						included: item.included,
						principle: item.principle,
						boundary: item.boundary,
						reviewQuestion: item.reviewQuestion
					})),
					cardDraftKeys: (this.proposal.cardDrafts || []).filter(item => item.selected).map(item => item.key)
				});
				this.config = { ...this.config, configured: true, contentMd: res.data.contentMd, version: res.data.version };
				this.clauses = res.data.clauses || [];
				this.proposal = null;
				await this.load();
				if (this.showHistory) await this.loadHistory();
				uni.showToast({ title: `V${res.data.version} 已签发`, icon: 'success' });
			} catch (error) {
				console.error('签发人生 OS 失败', error);
				uni.showToast({ title: typeof error === 'string' ? error : '新版本没有签发成功', icon: 'none' });
			} finally { this.publishing = false; }
		},
		rejectProposal() {
			if (!this.proposal || this.rejecting) return;
			uni.showModal({
				title: '不采用这次建议？',
				content: '当前人生 OS 不会变化，这份待确认建议会被关闭。',
				confirmText: '不采用',
				cancelText: '继续检查',
				success: async result => {
					if (!result.confirm) return;
					this.rejecting = true;
					try {
						await this.$http.post(lifeOsReviewReject(this.proposal.id), {});
						this.proposal = null;
						await this.load();
					} catch (error) {
						uni.showToast({ title: typeof error === 'string' ? error : '暂时没有处理完成', icon: 'none' });
					} finally { this.rejecting = false; }
				}
			});
		},
		async toggleHistory() {
			this.showHistory = !this.showHistory;
			if (this.showHistory) await this.loadHistory();
		},
		async loadHistory() {
			try {
				const res = await this.$http.get(lifeOsHistory, { page: 1, pageSize: 20 });
				this.history = (res.data && res.data.list) || [];
			} catch (error) { console.error('加载人生 OS 历史失败', error); }
		},
		basisLabel(value) { return { chosen: '我主动选择', observed: '经历中形成', mixed: '选择与经历共同形成' }[value] || '经历中形成'; },
		confidenceLabel(value) { return { high: '稳定', medium: '较稳定', emerging: '待观察' }[value] || '待观察'; },
		changeLabel(value) {
			return { keep: '保持', rewrite: '改写', merge: '合并', move_to_card: '转为菇卡', observe: '继续观察', retire: '退休' }[value] || '调整';
		},
		originLabel(value) { return value === 'ai_assisted' ? '确认后的整理' : (value === 'migration' ? '历史迁移' : '亲自编辑'); },
		preview(value) { return String(value || '').replace(/[#*_>`\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 105) || '空白版本'; },
		formatDate(value) { return value ? moment(value).format('YYYY.MM.DD HH:mm') : ''; },
		goBack() {
			const pages = getCurrentPages();
			if (pages.length > 1) uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) });
			else uni.switchTab({ url: '/pages/shroom/me' });
		}
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1.2; background: transparent; border: 0; }
button::after { border: 0; }
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: #f1f8e9; }
.shell { box-sizing: border-box; width: 100%; max-width: 980px; margin: 0 auto; padding: 32rpx 34rpx calc(120rpx + env(safe-area-inset-bottom)); }
.header { display: flex; align-items: center; }
.back { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.72); color: #172019; font-size: 50rpx; }
.heading { display: flex; min-width: 0; margin-left: 20rpx; flex: 1; flex-direction: column; }
.kicker, .section-kicker { font-size: 16rpx; font-weight: 700; letter-spacing: 2.1rpx; color: #718075; }
.title { margin-top: 8rpx; font-size: 40rpx; font-weight: 740; }
.version { padding: 11rpx 15rpx; border-radius: 999rpx; background: #dfead7; font-size: 18rpx; font-weight: 700; color: #4a6250; }
.manifesto { position: relative; margin-top: 40rpx; padding: 42rpx 35rpx; border-radius: 35rpx; background: #172019; color: #fff; overflow: hidden; }
.manifesto-index { position: absolute; right: 20rpx; top: -5rpx; font-size: 108rpx; font-weight: 760; color: rgba(255,255,255,.05); }
.manifesto-title, .manifesto-copy { display: block; position: relative; }
.manifesto-title { max-width: 590rpx; font-size: 27rpx; font-weight: 670; line-height: 1.48; }
.manifesto-title.accent { margin-top: 6rpx; color: #d8e99e; }
.manifesto-copy { max-width: 590rpx; margin-top: 21rpx; font-size: 20rpx; line-height: 1.72; color: #b8c5b8; }
.layer-map { display: flex; margin-top: 14rpx; }
.layer-map > view { display: flex; min-width: 0; min-height: 106rpx; margin-right: 10rpx; padding: 18rpx; flex: 1; flex-direction: column; justify-content: space-between; border-radius: 20rpx; background: rgba(255,255,255,.58); color: #6d786f; box-sizing: border-box; }
.layer-map > view:last-child { margin-right: 0; }
.layer-map > view.active { background: #dfead7; color: #364a3c; }
.layer-map text:first-child { font-size: 19rpx; font-weight: 720; }
.layer-map text:last-child { margin-top: 13rpx; font-size: 16rpx; line-height: 1.45; }
.runtime-strip { display: flex; margin-top: 22rpx; padding: 25rpx 12rpx; border: 1rpx solid rgba(49,73,55,.08); border-radius: 28rpx; background: rgba(255,255,255,.68); }
.runtime-strip > view { display: flex; flex: 1; flex-direction: column; align-items: center; border-right: 1rpx solid #dde6d9; color: #738077; font-size: 16rpx; }
.runtime-strip > view:last-child { border-right: 0; }
.runtime-number { margin-bottom: 7rpx; color: #26392d; font-size: 31rpx; font-weight: 750; }
.organizer, .proposal, .current-section { margin-top: 22rpx; padding: 29rpx; border-radius: 32rpx; background: #fff; box-sizing: border-box; box-shadow: 0 16rpx 45rpx rgba(60,78,63,.045); overflow: hidden; }
.section-heading, .current-heading { display: flex; align-items: flex-start; justify-content: space-between; }
.section-heading > view, .current-heading > view { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.section-title { margin-top: 8rpx; font-size: 28rpx; font-weight: 720; }
.review-state { padding: 9rpx 13rpx; border-radius: 999rpx; background: #f1dfb9; color: #6b542d; font-size: 16rpx; font-weight: 700; }
.review-state.quiet { background: #e3ebdf; color: #657168; }
.organizer-copy { display: block; margin-top: 20rpx; color: #66736b; font-size: 20rpx; line-height: 1.72; }
.signal-list { margin-top: 17rpx; padding: 17rpx 19rpx; border-radius: 18rpx; background: #f4f7f1; }
.signal-list > view { display: flex; align-items: flex-start; margin-bottom: 10rpx; color: #506057; font-size: 18rpx; line-height: 1.55; }
.signal-list > view:last-child { margin-bottom: 0; }
.signal-list view view { width: 7rpx; height: 7rpx; margin: 10rpx 12rpx 0 0; flex: 0 0 7rpx; border-radius: 50%; background: #718c72; }
.privacy-note { display: flex; align-items: flex-start; margin-top: 18rpx; padding: 18rpx; border-radius: 18rpx; background: #f2efe4; color: #716c5a; font-size: 18rpx; line-height: 1.58; }
.privacy-note view { width: 8rpx; height: 8rpx; margin: 9rpx 12rpx 0 0; flex: 0 0 8rpx; border-radius: 50%; background: #8d825f; }
.primary-button, .publish-button { display: flex; width: 100%; min-height: 78rpx; margin-top: 22rpx; padding: 0 24rpx; align-items: center; justify-content: center; border-radius: 999rpx; box-sizing: border-box; background: #172019; color: #fff; font-size: 21rpx; font-weight: 700; }
.primary-button[disabled], .publish-button[disabled] { background: #dfe5dc; color: #79837b; opacity: 1; }
.text-button, .reject-button { display: flex; width: 100%; min-height: 64rpx; margin-top: 8rpx; align-items: center; justify-content: center; color: #64736a; font-size: 19rpx; }
.generation-progress { margin-top: 20rpx; padding: 19rpx; border-radius: 19rpx; background: #edf2e8; }
.generation-progress > view:first-child { display: flex; justify-content: space-between; color: #516256; font-size: 18rpx; font-weight: 670; }
.progress-track { height: 8rpx; margin-top: 14rpx; border-radius: 999rpx; overflow: hidden; background: rgba(67,87,72,.12); }
.progress-track view { height: 100%; border-radius: inherit; background: #637b68; transition: width .3s ease; }
.generation-progress > text { display: block; margin-top: 11rpx; color: #7a877e; font-size: 16rpx; }
.proposal { padding: 0; background: #fdfdfb; }
.proposal-hero { padding: 31rpx 29rpx 28rpx; background: #223328; color: #fff; }
.proposal-hero .section-kicker { color: #9fb2a2; }
.proposal-counts { display: flex; align-items: center; margin-top: 20rpx; }
.proposal-counts > view { display: flex; flex-direction: column; }
.proposal-counts > view text:first-child { font-size: 47rpx; font-weight: 760; }
.proposal-counts > view text:last-child { margin-top: 3rpx; color: #aab9ab; font-size: 16rpx; }
.proposal-arrow { margin: 0 26rpx; color: #d8e99e; font-size: 35rpx; }
.proposal-summary { display: block; margin-top: 22rpx; font-size: 23rpx; font-weight: 630; line-height: 1.65; }
.proposal-warning { display: block; margin-top: 15rpx; color: #acbbad; font-size: 17rpx; line-height: 1.55; }
.principle-editor { margin: 17rpx 18rpx 0; padding: 24rpx 22rpx; border: 1rpx solid #e3e9df; border-radius: 25rpx; background: #fff; transition: opacity .2s ease; }
.principle-editor.excluded { background: #f2f4f0; opacity: .65; }
.principle-head { display: flex; align-items: center; }
.principle-toggle { display: flex; width: 38rpx; height: 38rpx; flex: 0 0 38rpx; align-items: center; justify-content: center; border: 2rpx solid #aeb9af; border-radius: 50%; color: #fff; font-size: 20rpx; }
.principle-toggle.selected { border-color: #365441; background: #365441; }
.principle-meta { display: flex; min-width: 0; margin-left: 14rpx; flex: 1; flex-direction: column; }
.principle-meta text:first-child { color: #26392d; font-size: 18rpx; font-weight: 720; }
.principle-meta text:last-child { margin-top: 5rpx; color: #89948c; font-size: 15rpx; }
.include-label { color: #718077; font-size: 16rpx; }
.field-label { display: block; margin-top: 19rpx; color: #7b877e; font-size: 16rpx; font-weight: 680; letter-spacing: 1rpx; }
.principle-input, .support-input { display: block; box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0; margin-top: 9rpx; padding: 17rpx 18rpx; border-radius: 17rpx; background: #f3f7f0; color: #203027; overflow-x: hidden; overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap; }
.principle-input { min-height: 104rpx; font-size: 23rpx; font-weight: 640; line-height: 1.6; }
.support-input { min-height: 90rpx; font-size: 19rpx; line-height: 1.62; }
.evidence-row { margin-top: 16rpx; padding: 14rpx 16rpx; border-radius: 15rpx; background: #eef4e9; }
.evidence-row text { display: block; }
.evidence-row text:first-child { color: #627267; font-size: 15rpx; font-weight: 700; }
.evidence-row text:last-child { margin-top: 6rpx; color: #58665d; font-size: 16rpx; line-height: 1.5; }
.evidence-row.challenge { background: #f5eee7; }
.card-drafts, .tensions { margin: 20rpx 18rpx 0; padding: 23rpx; border-radius: 24rpx; background: #f2efe4; }
.subsection-heading > view { display: flex; flex-direction: column; }
.subsection-heading text:first-child, .subsection-title { color: #303b32; font-size: 21rpx; font-weight: 720; }
.subsection-heading text:last-child { margin-top: 6rpx; color: #7c7768; font-size: 16rpx; }
.card-draft { display: flex; align-items: flex-start; margin-top: 17rpx; padding-top: 17rpx; border-top: 1rpx solid rgba(113,108,90,.13); }
.card-draft > view:last-child { display: flex; min-width: 0; margin-left: 14rpx; flex: 1; flex-direction: column; }
.card-draft > view:last-child text:first-child { color: #3f483f; font-size: 20rpx; font-weight: 680; line-height: 1.55; }
.card-draft > view:last-child text:last-child { margin-top: 7rpx; color: #776f60; font-size: 17rpx; line-height: 1.55; }
.tensions { background: #f5eee7; }
.tensions > text:not(.subsection-title) { display: block; margin-top: 12rpx; color: #735f51; font-size: 18rpx; line-height: 1.6; }
.changes-toggle, .history-toggle, .legacy-toggle { display: flex; align-items: center; justify-content: space-between; margin: 20rpx 18rpx 0; padding: 22rpx 18rpx; border-top: 1rpx solid #e4e9e1; color: #53645a; font-size: 19rpx; font-weight: 680; }
.changes { margin: 0 18rpx; }
.change-item { display: flex; align-items: flex-start; padding: 17rpx 0; border-top: 1rpx solid #e8ece6; }
.change-tag { min-width: 74rpx; margin-right: 14rpx; padding: 7rpx 9rpx; border-radius: 999rpx; background: #e7eee3; color: #526458; text-align: center; font-size: 14rpx; font-weight: 700; }
.change-tag.merge { background: #dfead7; }
.change-tag.move_to_card { background: #f1dfb9; color: #705831; }
.change-tag.retire { background: #eee9e6; color: #746965; }
.change-tag.observe { background: #f4e8d9; color: #78614d; }
.change-item > view { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.change-item > view text:first-child { font-size: 18rpx; font-weight: 680; line-height: 1.5; }
.change-item > view text:last-child { margin-top: 5rpx; color: #7b867e; font-size: 16rpx; line-height: 1.55; }
.publish-button { width: calc(100% - 36rpx); margin: 24rpx 18rpx 0; }
.reject-button { width: calc(100% - 36rpx); margin: 4rpx 18rpx 20rpx; color: #7b6a63; }
.current-heading > text { padding-top: 6rpx; color: #718077; font-size: 18rpx; font-weight: 700; }
.current-list { margin-top: 6rpx; }
.current-clause { padding: 26rpx 0; border-bottom: 1rpx solid #e4eae1; }
.current-clause:last-child { border-bottom: 0; }
.clause-index { display: flex; align-items: center; }
.clause-index text:first-child { color: #96a29a; font-size: 18rpx; font-weight: 700; letter-spacing: 1rpx; }
.clause-index text:last-child { margin-left: 12rpx; padding: 6rpx 10rpx; border-radius: 999rpx; background: #edf2e9; color: #65736a; font-size: 14rpx; }
.clause-principle { display: block; margin-top: 14rpx; color: #203027; font-size: 24rpx; font-weight: 670; line-height: 1.62; }
.clause-detail { display: flex; align-items: flex-start; margin-top: 13rpx; }
.clause-detail text:first-child { width: 60rpx; flex: 0 0 60rpx; color: #8b968e; font-size: 16rpx; font-weight: 680; }
.clause-detail text:last-child { min-width: 0; flex: 1; color: #617067; font-size: 18rpx; line-height: 1.6; }
.clause-foot { display: flex; margin-top: 15rpx; color: #8a958d; font-size: 15rpx; }
.clause-foot text { margin-right: 18rpx; }
.legacy { margin-top: 20rpx; }
.legacy-note { padding: 20rpx; border-radius: 19rpx; background: #f2efe4; }
.legacy-note text { display: block; }
.legacy-note text:first-child { color: #47483f; font-size: 20rpx; font-weight: 720; }
.legacy-note text:last-child { margin-top: 7rpx; color: #777365; font-size: 17rpx; line-height: 1.55; }
.legacy-toggle { margin: 5rpx 0 0; padding-left: 4rpx; padding-right: 4rpx; }
.legacy-content { display: block; box-sizing: border-box; max-height: 800rpx; margin-top: 10rpx; padding: 22rpx; border-radius: 19rpx; background: #f4f7f2; color: #465349; font-size: 18rpx; line-height: 1.72; white-space: pre-wrap; word-break: break-word; overflow: auto; }
.empty { display: flex; margin-top: 21rpx; padding: 34rpx 24rpx; flex-direction: column; align-items: center; border-radius: 23rpx; background: #f4f7f2; text-align: center; }
.empty text:first-child { font-size: 22rpx; font-weight: 720; }
.empty text:nth-child(2) { margin-top: 10rpx; color: #718077; font-size: 18rpx; line-height: 1.6; }
.empty-action { display: flex; min-width: 230rpx; min-height: 66rpx; margin-top: 20rpx; padding: 0 24rpx; align-items: center; justify-content: center; border-radius: 999rpx; background: #dfead7; color: #405343; font-size: 18rpx; font-weight: 700; }
.history-toggle { margin: 23rpx 0 0; padding: 25rpx 28rpx; border: 0; border-radius: 25rpx; background: #e2ecd9; color: #465b4a; font-size: 21rpx; }
.history { margin-top: 14rpx; padding: 8rpx 27rpx; border-radius: 28rpx; background: rgba(255,255,255,.72); }
.history-item { padding: 24rpx 0; border-bottom: 1rpx solid #e8ede5; }
.history-item:last-child { border-bottom: 0; }
.history-item > view { display: flex; justify-content: space-between; margin-bottom: 10rpx; color: #68756b; font-size: 18rpx; font-weight: 680; }
.history-item > text { display: block; color: #3f4d42; font-size: 20rpx; line-height: 1.6; }
.history-item > .history-source { margin-top: 9rpx; color: #7c897f; font-size: 16rpx; }
.history-empty { display: block; padding: 30rpx 0; color: #77837a; font-size: 20rpx; line-height: 1.6; }
@media (min-width: 768px) {
	.shell { padding-left: 44px; padding-right: 44px; }
	.manifesto, .organizer, .proposal, .current-section { border-radius: 28px; }
}
</style>
