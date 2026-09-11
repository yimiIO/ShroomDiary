<template>
	<view class="memory-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="memory-nav">
			<button class="back-button" @tap="goBack">‹</button>
			<view class="nav-copy">
				<text class="nav-kicker">SHROOM MEMORY</text>
				<text class="nav-title">回看</text>
			</view>
			<view class="privacy-dot"><text>私密</text></view>
		</view>

		<scroll-view class="memory-scroll" scroll-y :scroll-into-view="scrollTarget">
			<view class="memory-shell">
				<view class="opening" v-if="!conversation">
					<text class="opening-mark">◌</text>
					<text class="opening-kicker">{{ seedDiaryId ? 'FROM THIS ENTRY' : 'ASK YOUR PAST SELF' }}</text>
					<text class="opening-title">{{ seedDiaryId ? '这一次，曾经发生过吗？' : '在时间里，重新理解自己' }}</text>
					<text class="opening-copy">
						{{ seedDiaryId ? '我会以这篇日记为起点，寻找相似经历、后续、不同做法与反例。' : '只读取你允许的日记范围；每条关于个人历史的判断，都可以点回原文核对。' }}
					</text>

					<view class="mode-row" v-if="!seedDiaryId">
						<button v-for="item in modes" :key="item.value" :class="{ active: selectedMode === item.value }" @tap="selectedMode = item.value">{{ item.label }}</button>
					</view>

					<view class="scope-panel" v-if="!seedDiaryId">
						<text class="scope-label">本次允许查看</text>
						<view class="date-row">
							<picker mode="date" :value="dateFrom" @change="dateFrom = $event.detail.value">
								<view class="date-field">{{ dateFrom || '开始日期' }}</view>
							</picker>
							<text class="date-line">—</text>
							<picker mode="date" :value="dateTo" @change="dateTo = $event.detail.value">
								<view class="date-field">{{ dateTo || '结束日期' }}</view>
							</picker>
						</view>
						<button class="clear-dates" v-if="dateFrom || dateTo" @tap="clearDates">清除日期限制</button>
					</view>

					<view class="question-box">
						<textarea
							v-model="draftQuestion"
							:maxlength="1000"
							:placeholder="seedDiaryId ? '也可以补充你最想核对的问题（选填）' : '例如：这些年，我对工作的看法发生了什么变化？'"
							:show-confirm-bar="false"
						/>
						<button class="start-button" :disabled="starting || (!seedDiaryId && !draftQuestion.trim())" @tap="startReflection">
							{{ starting ? '正在建立回看…' : (seedDiaryId ? '开始看看关联' : '从日记中寻找') }}
						</button>
					</view>
					<text class="privacy-note">保存日记不会自动开始分析。只有你点击这里后，本次授权范围内的片段才会交给分析模型。</text>
				</view>

				<view v-else>
						<view class="conversation-head">
							<text class="conversation-kicker">{{ modeLabel }}</text>
							<text class="conversation-title">{{ conversation.title || '正在回看' }}</text>
							<view class="scope-summary">
								<text>{{ coverageSummary }}</text>
								<text v-if="isThemeConversation">固定主题口径 · 只增量核对新内容</text>
								<text v-else-if="conversation.coverage && conversation.coverage.semanticMethod === 'full_range_content_classification'">大模型规划 · 全文语义普查</text>
								<text v-else-if="conversation.coverage && !conversation.coverage.semanticIndexEnabled">大模型规划 · 证据检索</text>
							</view>
					</view>
					<view class="usage-strip" v-if="visibleCost && visibleCost.calls">
						<view><text>本次回看用量</text><text>{{ visibleCost.calls }} 次调用 · {{ formatTokens(visibleCost.totalTokens) }} tokens</text></view>
						<view><text>{{ formatCost(visibleCost) }}</text><text>预计花费 · 最终以 DeepSeek 账单为准</text></view>
					</view>

					<view class="processing-panel" v-if="isProcessing">
						<view class="processing-top">
							<view>
								<text class="processing-kicker">READING YOUR JOURNAL</text>
								<text class="processing-title">{{ processingLabel }}</text>
							</view>
							<text class="processing-number">{{ taskProgress }}%</text>
						</view>
						<view class="progress-track"><view :style="{ width: taskProgress + '%' }"></view></view>
							<text class="processing-note">{{ processingNote }}</text>
						<button class="cancel-button" @tap="cancelReflection">取消本次回看</button>
					</view>

					<view class="message-list">
						<view v-for="message in conversation.messages || []" :key="message.id" :id="'message-' + message.id">
							<view class="user-message" v-if="message.role === 'user'">
								<text>{{ message.content }}</text>
							</view>

							<view class="assistant-result" v-else-if="message.result">
								<view class="result-status">
									<text>{{ resultStatus(message.result.status) }}</text>
									<text>{{ resultCoverage(message.result.coverage) }}</text>
									</view>
									<text class="result-summary">{{ message.result.summary || message.content }}</text>

									<view class="analysis-stat" v-if="message.result.analysisStats">
										<view class="analysis-stat-main">
											<text class="analysis-number">{{ message.result.analysisStats.matchedUnits }}</text>
											<view class="analysis-number-copy">
												<text>{{ message.result.analysisStats.unitLabel }} · {{ message.result.analysisStats.resultLabel }}</text>
												<text>{{ message.result.analysisStats.rangeLabel }}</text>
											</view>
										</view>
										<view class="analysis-metrics">
											<view><text>{{ message.result.analysisStats.totalUnits }}</text><text>{{ message.result.analysisStats.totalLabel || '记录总数' }}</text></view>
											<view><text>{{ message.result.analysisStats.directMatchUnits }}</text><text>明确符合</text></view>
											<view><text>{{ message.result.analysisStats.partialUnits }}</text><text>部分符合</text></view>
											<view><text>{{ message.result.analysisStats.uncertainUnits }}</text><text>不能确定</text></view>
										</view>
										<text class="analysis-criterion">语义口径：{{ message.result.analysisStats.criterion }}</text>
										<text class="analysis-rule">{{ message.result.analysisStats.countingRule }}</text>
										<scroll-view class="analysis-groups-scroll" scroll-x :show-scrollbar="false" v-if="message.result.analysisStats.groups && message.result.analysisStats.groups.length">
											<view class="analysis-groups">
												<view v-for="group in message.result.analysisStats.groups" :key="group.key">
													<text>{{ analysisGroupLabel(group.key) }}</text><text>{{ group.matchedUnits }} {{ message.result.analysisStats.unitLabel }}</text>
												</view>
											</view>
										</scroll-view>
										<view class="analysis-evidence-list" v-if="message.result.presentation === 'evidence_list' && analysisCountedItems(message.result).length">
											<button v-for="item in analysisCountedItems(message.result)" :key="item.key" @tap="openSource(analysisItemSource(message.result, item))">
												<view class="analysis-evidence-meta">
													<text>{{ formatAnalysisDate(item.date) }}</text>
													<text>{{ analysisItemLabel(item.label) }} · 原文 ↗</text>
												</view>
												<text class="analysis-evidence-reason">{{ item.reason }}</text>
												<text class="analysis-evidence-quote">“{{ analysisItemExcerpt(message.result, item) }}”</text>
											</button>
										</view>
										<scroll-view class="analysis-items-scroll" scroll-x :show-scrollbar="false" v-else-if="analysisCountedItems(message.result).length">
											<view class="analysis-items">
												<button v-for="item in analysisCountedItems(message.result)" :key="item.key" @tap="openSource(analysisItemSource(message.result, item))">
													<text>{{ formatAnalysisDate(item.date) }}</text>
													<text>{{ analysisItemLabel(item.label) }} · 看原文 ↗</text>
												</button>
											</view>
										</scroll-view>
									</view>

								<view class="result-section" v-if="message.result.observations && message.result.observations.length">
									<text class="section-kicker">OBSERVATIONS</text>
					<view class="observation" v-for="(item, index) in message.result.observations" :key="index">
										<text class="observation-index">{{ index + 1 }}</text>
										<view class="observation-copy">
											<text class="observation-text">{{ item.text }}</text>
											<text class="observation-boundary" v-if="item.boundary">{{ item.boundary }}</text>
											<view class="evidence-row">
												<button v-for="ref in item.evidenceRefs" :key="ref" @tap="openSource(sourceFor(message.result, ref))">
													{{ sourceLabel(sourceFor(message.result, ref)) }}
												</button>
											</view>
										</view>
									</view>
								</view>

								<view class="result-section timeline-section" v-if="message.result.timeline && message.result.timeline.length">
									<text class="section-kicker">TIMELINE</text>
					<view class="timeline-item" v-for="(item, index) in message.result.timeline" :key="index">
										<view class="timeline-rail"><view></view></view>
										<view class="timeline-copy">
											<text class="timeline-date">{{ item.date || '时间不确定' }}</text>
											<text class="timeline-text">{{ item.text }}</text>
											<button class="timeline-source" @tap="openSource(sourceFor(message.result, item.evidenceRefs[0]))">
												查看原文 ↗
											</button>
										</view>
									</view>
								</view>

								<view class="source-section" v-if="message.result.presentation !== 'evidence_list' && message.result.sources && message.result.sources.length">
									<text class="section-kicker">SOURCE NOTES</text>
									<scroll-view class="source-scroll" scroll-x :show-scrollbar="false">
										<view class="source-list">
											<button class="source-card" v-for="source in message.result.sources" :key="source.sourceRef" @tap="openSource(source)">
												<text class="source-date">{{ sourceDate(source) }}</text>
												<text class="source-excerpt">“{{ source.excerpt }}”</text>
												<text class="source-link">打开这篇日记 ↗</text>
											</button>
										</view>
									</scroll-view>
								</view>

								<view class="uncertainty-box" v-if="message.result.uncertainties && message.result.uncertainties.length">
									<text class="section-kicker">仍不能确定</text>
					<text v-for="(item, index) in message.result.uncertainties" :key="index">· {{ item }}</text>
								</view>

								<view class="feedback-row">
									<text>这次理解和证据准确吗？</text>
									<view>
										<button @tap="sendFeedback(message, 'helpful')">有帮助</button>
										<button @tap="sendFeedback(message, 'not_same_event')">不是同一件事</button>
										<button @tap="sendFeedback(message, 'wrong_interpretation')">解释不对</button>
									</view>
								</view>

								<view class="card-draft" v-if="message.result.cardDraft">
									<text class="section-kicker">可选 · 保存理解</text>
									<text class="draft-sentence">{{ message.result.cardDraft.seedSentence }}</text>
									<text class="draft-note">这是今天形成的理解，不会写回旧日记；确认后仅保存为私密菇卡。</text>
									<button :disabled="savedCards[message.id]" @tap="saveCard(message)">
										{{ savedCards[message.id] ? '已保存为菇卡' : '确认保存为私密菇卡' }}
									</button>
								</view>

								<view class="follow-up-list" v-if="message.result.followUp && message.result.followUp.length">
									<button v-for="item in message.result.followUp" :key="item" @tap="useFollowUp(item)">{{ item }} ↗</button>
								</view>
							</view>

							<view class="invalid-message" v-else-if="message.role === 'assistant'">
								<text>{{ message.content }}</text>
							</view>
						</view>
					</view>

					<view class="failed-panel" v-if="conversation.status === 'failed'">
						<text>这次回看没有完成</text>
						<text>{{ conversation.error || '日记仍然安全保存，可以重新尝试。' }}</text>
						<button @tap="retryReflection">重新核对</button>
					</view>

					<view class="followup-composer" v-if="!isProcessing && conversation.status !== 'cancelled'">
						<textarea v-model="followUpText" :maxlength="1000" placeholder="继续追问，或补充当时没有写下的背景…" :show-confirm-bar="false" />
						<button :disabled="sending || !followUpText.trim()" @tap="sendFollowUp">{{ sending ? '发送中' : '继续讨论' }}</button>
					</view>
				</view>

				<view class="bottom-space"></view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import {
	memoryCancel,
	memoryCard,
	memoryConversation,
	memoryConversations,
	memoryFeedback,
	memoryMessages,
	memoryRetry
} from '@/api/memory';

export default {
	data() {
		return {
			statusBarHeight: 0,
			seedDiaryId: '',
			draftQuestion: '',
			selectedMode: 'related',
			dateFrom: '',
			dateTo: '',
			conversation: null,
			starting: false,
			sending: false,
				followUpText: '',
				pollTimer: null,
				pollInFlight: false,
				pollFailures: 0,
			scrollTarget: '',
			savedCards: {},
			modes: [
				{ value: 'related', label: '找关联' },
				{ value: 'change', label: '看变化' },
				{ value: 'timeline', label: '时间线' }
			]
		};
	},
	computed: {
		isProcessing() {
			return this.conversation && this.conversation.status === 'processing';
		},
		isThemeConversation() {
			return Boolean(this.conversation && this.conversation.scope && this.conversation.scope.themeKey);
		},
		visibleCost() {
			const task = this.conversation && this.conversation.task;
			return (task && task.costSummary && task.costSummary.calls) ? task.costSummary : (this.conversation && this.conversation.costSummary);
		},
		taskProgress() {
			const task = this.conversation && this.conversation.task;
			return Math.max(0, Math.min(100, Number(task && task.progress) || 0));
		},
			processingLabel() {
				if (this.taskProgress < 20) return '确认授权范围';
				if (this.taskProgress < 30) return '理解你的问题';
				if (this.taskProgress < 50) return '执行分析计划';
				if (this.taskProgress < 88) return '阅读正文并聚合';
				return '校验原文引用';
			},
			processingNote() {
				if (this.pollFailures) return '网络刚刚有波动，后台任务仍在继续；正在自动重新连接。';
					if (this.isThemeConversation) return '以前核对过的日记会直接复用，只分析新增或修改过的正文。离开页面后更新也会继续。';
					return '先理解问题，再选择完整普查或证据检索；最后校验数字与原文。离开页面后任务也会继续。';
			},
		modeLabel() {
			const mode = this.modes.find(item => item.value === (this.conversation && this.conversation.mode));
			return mode ? mode.label.toUpperCase() : 'MEMORY REVIEW';
		},
			coverageSummary() {
				const coverage = (this.conversation && this.conversation.coverage) || {};
				if (!coverage.totalAvailable) return '只读取当前账号已授权的日记';
				if (coverage.semanticMethod === 'full_range_content_classification') {
					return '完整读取 ' + coverage.processedDiaries + ' 篇 · 聚合 ' + (coverage.totalUnits || 0) + ' 个记录单位';
				}
				return '可用 ' + coverage.totalAvailable + ' 篇 · 实际读取 ' + (coverage.processedDiaries || 0) + ' 篇';
		}
	},
	onLoad(options) {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
		this.seedDiaryId = options && options.diaryId ? String(options.diaryId) : '';
		this.draftQuestion = options && options.q ? decodeURIComponent(String(options.q)) : '';
		const conversationId = options && options.id ? String(options.id) : '';
		if (conversationId) {
			this.loadConversation(conversationId);
			return;
		}
		if (this.seedDiaryId || this.draftQuestion) this.startReflection();
	},
	onUnload() {
		this.stopPolling();
	},
	methods: {
		goBack() {
			uni.navigateBack({
				fail: () => uni.switchTab({ url: '/pages/shroom/discover' })
			});
		},
		clearDates() {
			this.dateFrom = '';
			this.dateTo = '';
		},
		formatTokens(value) { return Number(value || 0).toLocaleString(); },
		formatCost(summary) {
			if (!summary || !summary.estimated || summary.costCny === null) return '暂时无法估价';
			const cost = Number(summary.costCny);
			return '约 ¥' + cost.toFixed(cost >= 0.01 ? 2 : 4);
		},
			modeForQuestion(question) {
				if (this.seedDiaryId) return 'related';
				return this.selectedMode;
		},
		async startReflection() {
			if (this.starting) return;
			const question = this.draftQuestion.trim();
			if (!this.seedDiaryId && !question) return;
			this.starting = true;
			try {
				const res = await this.$http.post(memoryConversations, {
					seedDiaryId: this.seedDiaryId || null,
					question,
					mode: this.modeForQuestion(question),
					scope: { dateFrom: this.dateFrom || null, dateTo: this.dateTo || null }
				});
				if (res.code !== 200 || !res.data || !res.data.id) throw new Error('Invalid conversation');
				await this.loadConversation(res.data.id);
			} catch (error) {
				console.error('开始日记回看失败', error);
			} finally {
				this.starting = false;
			}
		},
			async loadConversation(id) {
				try {
					const res = await this.$http.get(memoryConversation(id));
					if (res.code !== 200 || !res.data) return;
					this.pollFailures = 0;
					this.conversation = res.data;
				if (this.isProcessing) this.startPolling();
				else this.stopPolling();
				} catch (error) {
					console.error('加载回看对话失败', error);
					this.pollFailures += 1;
					if (!this.isProcessing) this.stopPolling();
				}
			},
			startPolling() {
				if (this.pollTimer) return;
				this.pollTimer = setInterval(async () => {
					if (!this.conversation || this.pollInFlight) return;
					this.pollInFlight = true;
					try {
						await this.loadConversation(this.conversation.id);
					} finally {
						this.pollInFlight = false;
					}
				}, 1800);
			},
			stopPolling() {
				if (this.pollTimer) clearInterval(this.pollTimer);
				this.pollTimer = null;
				this.pollInFlight = false;
		},
		async sendFollowUp() {
			const content = this.followUpText.trim();
			if (!content || this.sending || !this.conversation) return;
			this.sending = true;
			try {
				await this.$http.post(memoryMessages(this.conversation.id), { content });
				this.followUpText = '';
				await this.loadConversation(this.conversation.id);
			} catch (error) {
				console.error('继续回看失败', error);
			} finally {
				this.sending = false;
			}
		},
		useFollowUp(value) {
			this.followUpText = value;
		},
			sourceFor(result, sourceRef) {
				const sources = result && Array.isArray(result.sources) ? result.sources : [];
				return sources.find(item => item.sourceRef === sourceRef) || null;
			},
			analysisCountedItems(result) {
				const items = result && result.analysisStats && Array.isArray(result.analysisStats.items) ? result.analysisStats.items : [];
				return items.filter(item => item.counted);
			},
			analysisItemSource(result, item) {
				const refs = item && Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [];
				return refs.length ? this.sourceFor(result, refs[0]) : null;
			},
			analysisItemExcerpt(result, item) {
				const source = this.analysisItemSource(result, item);
				return source && source.excerpt ? source.excerpt : '没有可展示的原文';
			},
			analysisItemLabel(label) {
				return label === 'partial' ? '部分符合' : '明确符合';
			},
			analysisGroupLabel(value) {
				if (/^\d{4}-\d{2}$/.test(value)) return moment(value + '-01').format('YYYY年M月');
				return value ? value + '年' : '未分组';
			},
			formatAnalysisDate(value) {
				return value ? moment(value).format('YYYY年M月D日') : '日期未知';
			},
		sourceDate(source) {
			return source && source.occurredAt ? moment(source.occurredAt).format('YYYY年M月D日') : '日期未知';
		},
		sourceLabel(source) {
			return source ? this.sourceDate(source) + ' · 原文' : '来源已失效';
		},
		openSource(source) {
			if (!source || !source.diaryId) {
				uni.showToast({ title: '来源已经失效', icon: 'none' });
				return;
			}
			uni.navigateTo({ url: '/pages/diary/edit?id=' + source.diaryId });
		},
		resultStatus(status) {
			return {
				completed: '范围已覆盖',
				partial: '部分覆盖',
				insufficient_evidence: '证据不足'
			}[status] || '已核对';
		},
		resultCoverage(coverage) {
			if (!coverage) return '';
			return '读取 ' + (coverage.processedDiaries || 0) + ' / ' + (coverage.totalAvailable || 0) + ' 篇';
		},
		async sendFeedback(message, kind) {
			if (!this.conversation) return;
			try {
				await this.$http.post(memoryFeedback(this.conversation.id), {
					messageId: message.id,
					kind,
					target: { sourceRefs: (message.result && message.result.sources || []).map(item => item.sourceRef) }
				});
				uni.showToast({ title: kind === 'helpful' ? '已记录这次帮助' : '已记住你的纠正', icon: 'none' });
			} catch (error) {
				console.error('保存回看纠正失败', error);
			}
		},
		saveCard(message) {
			const draft = message.result && message.result.cardDraft;
			if (!draft || this.savedCards[message.id]) return;
			uni.showModal({
				title: '保存为私密菇卡？',
				content: '“' + draft.seedSentence + '”\n\n这会保存今天形成的理解，并保留来源日记。',
				confirmText: '确认保存',
				success: async result => {
					if (!result.confirm) return;
					try {
						const res = await this.$http.post(memoryCard(this.conversation.id), Object.assign({ messageId: message.id }, draft));
						if (res.code === 200) this.$set(this.savedCards, message.id, res.data.cardId);
					} catch (error) {
						console.error('保存回看菇卡失败', error);
					}
				}
			});
		},
		async cancelReflection() {
			if (!this.conversation) return;
			try {
				await this.$http.post(memoryCancel(this.conversation.id), {});
				await this.loadConversation(this.conversation.id);
			} catch (error) {
				console.error('取消回看失败', error);
			}
		},
		async retryReflection() {
			if (!this.conversation) return;
			try {
				await this.$http.post(memoryRetry(this.conversation.id), {});
				await this.loadConversation(this.conversation.id);
			} catch (error) {
				console.error('重试回看失败', error);
			}
		}
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; border-radius: 0; background: transparent; line-height: 1.2; }
button::after { border: 0; }
.memory-page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: rgba(241, 248, 233, .97); }
.memory-nav { height: 112rpx; padding: 0 34rpx; display: flex; align-items: center; border-bottom: 1rpx solid rgba(23,32,25,.07); background: rgba(241,248,233,.97); box-sizing: border-box; }
.back-button { width: 68rpx; height: 68rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255,255,255,.68); font-size: 50rpx; font-weight: 300; color: #172019; }
.nav-copy { display: flex; min-width: 0; flex: 1; margin-left: 20rpx; flex-direction: column; gap: 5rpx; }
.nav-kicker, .opening-kicker, .conversation-kicker, .processing-kicker, .section-kicker { font-size: 17rpx; font-weight: 750; letter-spacing: 2.6rpx; color: #728070; }
.nav-title { font-size: 31rpx; font-weight: 720; }
.privacy-dot { padding: 10rpx 16rpx; border: 1rpx solid rgba(23,32,25,.1); border-radius: 999rpx; font-size: 18rpx; color: #6d796c; }
.memory-scroll { height: calc(100vh - 112rpx - env(safe-area-inset-top)); }
.memory-shell { width: 100%; max-width: 980rpx; margin: 0 auto; padding: 64rpx 34rpx 60rpx; box-sizing: border-box; }
.opening-mark { display: block; font-family: Georgia, serif; font-size: 86rpx; line-height: .7; color: #91a383; }
.opening-kicker { display: block; margin-top: 40rpx; }
.opening-title { display: block; max-width: 680rpx; margin-top: 18rpx; font-family: Georgia, 'Songti SC', serif; font-size: 54rpx; font-weight: 500; line-height: 1.2; letter-spacing: -2rpx; }
.opening-copy { display: block; max-width: 700rpx; margin-top: 24rpx; font-size: 25rpx; line-height: 1.75; color: #647064; }
.mode-row { display: flex; gap: 10rpx; margin-top: 38rpx; }
.mode-row button { padding: 16rpx 25rpx; border: 1rpx solid rgba(23,32,25,.13); border-radius: 999rpx; background: rgba(255,255,255,.52); font-size: 22rpx; color: #617061; }
.mode-row button.active { border-color: #172019; background: #172019; color: #fff; }
.scope-panel { margin-top: 22rpx; padding: 24rpx; border-radius: 26rpx; background: rgba(255,255,255,.55); }
.scope-label { display: block; font-size: 20rpx; font-weight: 680; color: #647064; }
.date-row { display: flex; align-items: center; gap: 14rpx; margin-top: 17rpx; }
.date-row picker { flex: 1; }
.date-field { height: 68rpx; padding: 0 19rpx; display: flex; align-items: center; border-radius: 18rpx; background: #f1f4eb; font-size: 21rpx; color: #566454; box-sizing: border-box; }
.date-line { color: #9aa397; }
.clear-dates { margin-top: 15rpx; font-size: 19rpx; color: #7a8877; }
.question-box { margin-top: 30rpx; padding: 28rpx; border: 1rpx solid rgba(23,32,25,.06); border-radius: 34rpx; background: #fff; box-shadow: 0 22rpx 60rpx rgba(56,75,54,.08); }
.question-box textarea { width: 100%; height: 210rpx; font-size: 29rpx; line-height: 1.65; color: #202c22; box-sizing: border-box; }
.start-button { width: 100%; height: 84rpx; margin-top: 20rpx; display: flex; align-items: center; justify-content: center; border-radius: 999rpx; background: #172019; color: #fff; font-size: 24rpx; font-weight: 680; }
.start-button[disabled] { opacity: .42; }
.privacy-note { display: block; margin: 20rpx 8rpx 0; font-size: 19rpx; line-height: 1.6; color: #8a9488; }
.conversation-head { margin-bottom: 32rpx; }
.conversation-kicker, .conversation-title { display: block; }
.conversation-title { margin-top: 13rpx; font-family: Georgia, 'Songti SC', serif; font-size: 48rpx; font-weight: 500; line-height: 1.25; }
.scope-summary { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 18rpx; }
.scope-summary text { padding: 9rpx 14rpx; border-radius: 999rpx; background: rgba(255,255,255,.55); font-size: 18rpx; color: #758173; }
.usage-strip { margin: -9rpx 0 24rpx; padding: 21rpx 24rpx; display: flex; align-items: center; justify-content: space-between; gap: 18rpx; border: 1rpx solid rgba(23,32,25,.07); border-radius: 23rpx; background: rgba(255,255,255,.6); }
.usage-strip > view { display: flex; flex-direction: column; gap: 6rpx; }
.usage-strip > view:last-child { text-align: right; }
.usage-strip > view text:first-child { font-size: 19rpx; font-weight: 690; color: #405044; }
.usage-strip > view text:last-child { font-size: 16rpx; color: #839083; }
.processing-panel { margin: 28rpx 0; padding: 30rpx; border-radius: 32rpx; background: #172019; color: #fff; }
.processing-top { display: flex; align-items: flex-start; justify-content: space-between; }
.processing-kicker, .processing-title, .processing-note { display: block; }
.processing-kicker { color: #a9c6a2; }
.processing-title { margin-top: 9rpx; font-size: 28rpx; font-weight: 680; }
.processing-number { font-size: 38rpx; font-weight: 650; font-variant-numeric: tabular-nums; }
.progress-track { height: 9rpx; margin-top: 27rpx; overflow: hidden; border-radius: 999rpx; background: rgba(255,255,255,.12); }
.progress-track view { height: 100%; border-radius: inherit; background: #ddec8c; transition: width .35s ease; }
.processing-note { margin-top: 16rpx; font-size: 19rpx; line-height: 1.55; color: rgba(255,255,255,.55); }
.cancel-button { margin-top: 19rpx; font-size: 19rpx; color: rgba(255,255,255,.58); }
.message-list > view { margin-top: 22rpx; }
.user-message { display: flex; justify-content: flex-end; }
.user-message text { max-width: 78%; padding: 19rpx 24rpx; border-radius: 26rpx 26rpx 7rpx 26rpx; background: #dfe9d5; font-size: 23rpx; line-height: 1.55; }
.assistant-result { padding: 34rpx; border-radius: 36rpx; background: #fff; box-shadow: 0 20rpx 56rpx rgba(59,77,57,.07); }
.result-status { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.result-status text { padding: 9rpx 13rpx; border-radius: 999rpx; background: #edf2e8; font-size: 18rpx; color: #667463; }
.result-summary { display: block; margin-top: 26rpx; font-family: Georgia, 'Songti SC', serif; font-size: 31rpx; line-height: 1.7; color: #283229; }
.analysis-stat { margin-top: 30rpx; padding: 29rpx; overflow: hidden; border-radius: 29rpx; background: #172019; color: #fff; }
.analysis-stat-main { display: flex; align-items: center; gap: 20rpx; }
.analysis-number { font-family: Georgia, serif; font-size: 86rpx; line-height: .9; color: #ddec8c; }
.analysis-number-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }
.analysis-number-copy text:first-child { font-size: 25rpx; font-weight: 680; line-height: 1.35; }
.analysis-number-copy text:last-child { font-size: 18rpx; color: rgba(255,255,255,.55); }
.analysis-metrics { display: flex; margin-top: 27rpx; padding-top: 23rpx; border-top: 1rpx solid rgba(255,255,255,.1); }
.analysis-metrics view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }
.analysis-metrics text:first-child { font-size: 28rpx; font-weight: 680; font-variant-numeric: tabular-nums; }
.analysis-metrics text:last-child { font-size: 16rpx; line-height: 1.3; color: rgba(255,255,255,.48); }
.analysis-criterion, .analysis-rule { display: block; margin-top: 22rpx; font-size: 18rpx; line-height: 1.6; color: rgba(255,255,255,.58); }
.analysis-rule { margin-top: 8rpx; }
.analysis-groups-scroll, .analysis-items-scroll { width: 100%; margin-top: 22rpx; white-space: nowrap; }
.analysis-groups, .analysis-items { display: inline-flex; gap: 10rpx; padding-right: 20rpx; }
.analysis-groups view, .analysis-items button { min-width: 170rpx; padding: 16rpx 18rpx; border: 1rpx solid rgba(221,236,140,.23); border-radius: 18rpx; background: rgba(255,255,255,.07); text-align: left; box-sizing: border-box; }
.analysis-groups text, .analysis-items button text { display: block; color: #fff; }
.analysis-groups text:first-child, .analysis-items button text:first-child { font-size: 21rpx; font-weight: 680; }
.analysis-groups text:last-child, .analysis-items button text:last-child { margin-top: 8rpx; font-size: 16rpx; color: #b8c99a; }
.analysis-evidence-list { display: flex; flex-direction: column; gap: 13rpx; margin-top: 23rpx; }
.analysis-evidence-list button { width: 100%; margin: 0; padding: 22rpx; border: 1rpx solid rgba(221,236,140,.2); border-radius: 21rpx; background: rgba(255,255,255,.07); text-align: left; box-sizing: border-box; }
.analysis-evidence-list button::after { border: 0; }
.analysis-evidence-meta { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.analysis-evidence-meta text { min-width: 0; font-size: 17rpx; color: #b8c99a; }
.analysis-evidence-meta text:first-child { font-weight: 680; color: #fff; }
.analysis-evidence-reason, .analysis-evidence-quote { display: block; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
.analysis-evidence-reason { margin-top: 15rpx; font-size: 22rpx; line-height: 1.55; color: #f4f6ef; }
.analysis-evidence-quote { margin-top: 12rpx; font-family: Georgia, 'Songti SC', serif; font-size: 19rpx; line-height: 1.55; color: rgba(255,255,255,.58); }
.result-section, .source-section, .feedback-row, .card-draft, .follow-up-list { margin-top: 38rpx; }
.section-kicker { display: block; color: #899486; }
.observation { display: flex; gap: 18rpx; margin-top: 23rpx; }
.observation-index { width: 43rpx; height: 43rpx; flex: 0 0 43rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #ebf0e5; font-size: 19rpx; color: #61705d; }
.observation-copy { min-width: 0; flex: 1; }
.observation-text, .observation-boundary { display: block; }
.observation-text { font-size: 25rpx; line-height: 1.72; color: #2f3930; }
.observation-boundary { margin-top: 10rpx; font-size: 20rpx; line-height: 1.55; color: #8a9388; }
.evidence-row { display: flex; flex-wrap: wrap; gap: 8rpx; margin-top: 13rpx; }
.evidence-row button, .timeline-source { padding: 9rpx 13rpx; border-radius: 999rpx; background: #f0f4ec; font-size: 18rpx; color: #60705d; }
.timeline-item { display: flex; gap: 19rpx; }
.timeline-rail { width: 22rpx; display: flex; justify-content: center; border-left: 2rpx solid #dce4d7; }
.timeline-rail view { width: 13rpx; height: 13rpx; margin-left: -2rpx; border: 3rpx solid #fff; border-radius: 50%; background: #6e805f; box-shadow: 0 0 0 2rpx #6e805f; }
.timeline-copy { padding: 0 0 27rpx; }
.timeline-date, .timeline-text { display: block; }
.timeline-date { font-size: 19rpx; font-weight: 700; color: #768373; }
.timeline-text { margin-top: 8rpx; font-size: 23rpx; line-height: 1.65; color: #354035; }
.timeline-source { margin-top: 10rpx; }
.source-scroll { width: 100%; margin-top: 18rpx; white-space: nowrap; }
.source-list { display: inline-flex; gap: 15rpx; padding-right: 20rpx; }
.source-card { width: 410rpx; min-height: 238rpx; padding: 24rpx; border: 1rpx solid rgba(23,32,25,.08); border-radius: 25rpx; background: #f6f4e9; text-align: left; white-space: normal; box-sizing: border-box; }
.source-date, .source-excerpt, .source-link { display: block; }
.source-date { font-size: 18rpx; font-weight: 680; color: #7b8065; }
.source-excerpt { display: -webkit-box; margin-top: 16rpx; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 4; font-family: Georgia, 'Songti SC', serif; font-size: 22rpx; line-height: 1.58; color: #4f5143; }
.source-link { margin-top: 18rpx; font-size: 18rpx; color: #657457; }
.uncertainty-box { margin-top: 34rpx; padding: 24rpx; border-radius: 24rpx; background: #f6f0e8; }
.uncertainty-box > text:not(.section-kicker) { display: block; margin-top: 12rpx; font-size: 20rpx; line-height: 1.58; color: #746d65; }
.feedback-row { padding-top: 28rpx; border-top: 1rpx solid #edf0eb; }
.feedback-row > text { font-size: 20rpx; color: #778274; }
.feedback-row > view { display: flex; flex-wrap: wrap; gap: 9rpx; margin-top: 13rpx; }
.feedback-row button { padding: 11rpx 15rpx; border: 1rpx solid #dce3d8; border-radius: 999rpx; font-size: 18rpx; color: #647161; }
.card-draft { padding: 27rpx; border-radius: 27rpx; background: #172019; color: #fff; }
.card-draft .section-kicker { color: #a9c6a2; }
.draft-sentence, .draft-note { display: block; }
.draft-sentence { margin-top: 16rpx; font-size: 29rpx; font-weight: 680; line-height: 1.5; }
.draft-note { margin-top: 13rpx; font-size: 19rpx; line-height: 1.55; color: rgba(255,255,255,.58); }
.card-draft button { width: 100%; height: 70rpx; margin-top: 22rpx; border-radius: 999rpx; background: #ddec8c; color: #172019; font-size: 21rpx; font-weight: 680; }
.follow-up-list { display: flex; flex-direction: column; gap: 10rpx; }
.follow-up-list button { padding: 18rpx 20rpx; border-radius: 18rpx; background: #eff3eb; text-align: left; font-size: 20rpx; line-height: 1.5; color: #536250; }
.invalid-message, .failed-panel { padding: 25rpx; border-radius: 24rpx; background: #f5e9e1; color: #815f50; font-size: 21rpx; line-height: 1.6; }
.failed-panel { display: flex; margin-top: 24rpx; flex-direction: column; gap: 10rpx; }
.failed-panel text:first-child { font-size: 25rpx; font-weight: 680; }
.failed-panel button { height: 66rpx; margin-top: 12rpx; border-radius: 999rpx; background: #815f50; color: #fff; }
.followup-composer { margin-top: 26rpx; padding: 25rpx; border: 1rpx solid rgba(23,32,25,.07); border-radius: 30rpx; background: #fff; }
.followup-composer textarea { width: 100%; height: 160rpx; font-size: 24rpx; line-height: 1.6; box-sizing: border-box; }
.followup-composer button { width: 100%; height: 72rpx; margin-top: 16rpx; border-radius: 999rpx; background: #172019; color: #fff; font-size: 21rpx; font-weight: 680; }
.followup-composer button[disabled] { opacity: .38; }
.bottom-space { height: calc(60rpx + env(safe-area-inset-bottom)); }
@media screen and (min-width: 900px) {
	.memory-shell { padding-top: 78rpx; }
	.assistant-result, .question-box { padding: 46rpx; }
}
</style>
