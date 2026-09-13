<template>
	<view class="compound-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-shell">
			<view class="topbar">
				<button class="round-button back-button" aria-label="返回" @tap="goBack">‹</button>
				<view class="topbar-copy">
					<text class="topbar-kicker">COMPOUND PORTFOLIO</text>
					<text class="topbar-title">复利计划</text>
				</view>
				<button class="round-button add-button" aria-label="新建复利计划" :disabled="home.portfolio.activeCount >= 3" @tap="openNewPlan">+</button>
			</view>

			<view v-if="loading" class="state-card">
				<view class="loading-dot"></view>
				<text>正在读取你的时间配置</text>
			</view>
			<view v-else-if="loadError" class="state-card error">
				<text>复利计划暂时没有读到</text>
				<button class="dark-pill" @tap="loadHome">重新读取</button>
			</view>

			<template v-else>
				<view class="portfolio-hero">
					<text class="eyebrow">{{ weekRange }}</text>
					<text class="portfolio-title">把有限时间，<br>投向会增长的事</text>
					<text class="portfolio-copy">日记记录真实发生；这里决定接下来的时间投到哪里，以及什么先不做。</text>
					<view class="week-ledger">
						<view><text>本周计划</text><text>{{ formatMinutes(home.portfolio.plannedMinutes) }}</text></view>
						<view><text>已真实投入</text><text>{{ formatMinutes(home.portfolio.actualMinutes) }}</text></view>
						<view><text>同时投资</text><text>{{ home.portfolio.activeCount }} / {{ home.portfolio.capacity }}</text></view>
					</view>
					<view v-if="home.portfolio.plannedMinutes" class="portfolio-progress">
						<view><view :style="{ width: boundedPercent(home.portfolio.utilizationPercent) + '%' }"></view></view>
						<text>{{ home.portfolio.utilizationPercent }}%</text>
					</view>
					<text v-if="home.portfolio.unplannedCount" class="allocation-note">{{ home.portfolio.unplannedCount }} 项计划还没有完成本周时间配置</text>
				</view>

				<view v-if="showPlanEditor" class="editor-panel plan-editor">
					<view class="panel-heading">
						<view><text class="eyebrow">{{ editingPlanId ? 'REVISE THE BET' : 'MAKE A 12-WEEK BET' }}</text><text>{{ editingPlanId ? '修订这项投资' : '建立一项复利计划' }}</text></view>
						<button @tap="closeEditors">×</button>
					</view>
					<view v-if="!editingPlanId" class="editor-field">
						<text>与哪个长期方向一致</text>
						<picker :range="directionChoices" range-key="name" :value="directionIndex" @change="changeDirection">
							<view class="select-field">{{ selectedDirectionName }}<text>⌄</text></view>
						</picker>
						<text class="field-help">方向只负责对齐价值，计划名称和结果由你自己定义。</text>
					</view>
					<label class="editor-field"><text>计划名称</text><input v-model="planDraft.title" maxlength="240" placeholder="例如：建立可复用的 AI 产品能力" /></label>
					<label class="editor-field"><text>这 12 周要发生的变化</text><textarea v-model="planDraft.desiredOutcome" maxlength="1200" auto-height placeholder="不是愿望，要写成周期结束时能够核对的变化。" /></label>
					<label class="editor-field"><text>为什么它会产生复利</text><textarea v-model="planDraft.compoundMechanism" maxlength="1600" auto-height placeholder="持续投入会积累什么？它如何让下一次更容易、更快或更有价值？" /></label>
					<view class="two-column">
						<label class="editor-field"><text>每周预算（分钟）</text><input v-model="planDraft.weeklyTimeBudgetMinutes" type="number" placeholder="180" /></label>
						<label class="editor-field"><text>领先指标目标</text><input v-model="planDraft.leadingMetricTarget" type="digit" placeholder="12" /></label>
					</view>
					<label class="editor-field"><text>领先指标是什么</text><input v-model="planDraft.leadingMetricName" maxlength="240" placeholder="例如：完成并验证的产品迭代数" /></label>
					<label class="editor-field"><text>周期结果用什么证明</text><textarea v-model="planDraft.outcomeEvidence" maxlength="1600" auto-height placeholder="例如：上线 3 个被真实用户持续使用的功能，并保留反馈。" /></label>
					<label class="editor-field"><text>当前里程碑</text><input v-model="planDraft.currentMilestone" maxlength="1200" placeholder="现在最近的一段结果" /></label>
					<label class="editor-field"><text>下一步</text><textarea v-model="planDraft.currentStep" maxlength="1000" auto-height placeholder="下一次可直接开始的具体动作" /></label>
					<label class="editor-field"><text>这段时间明确不做</text><textarea v-model="planDraft.stopListText" maxlength="1800" auto-height placeholder="一行一项。没有取舍，就没有真正的时间投资。" /></label>
					<view class="cycle-note"><text>默认周期</text><text>{{ planDraft.cycleStart }} → {{ planDraft.cycleEnd }}</text></view>
					<button class="primary-action" :disabled="saving || !canSavePlan" @tap="savePlan">{{ saving ? '正在保存…' : (editingPlanId ? '保存计划修订' : '确认这项 12 周投资') }}</button>
				</view>

				<view v-if="home.needsOnboarding && !showPlanEditor" class="empty-state">
					<text class="eyebrow">START WITH A BET</text>
					<text class="empty-title">先决定一件<br>值得持续投入的事</text>
					<text class="empty-copy">一项好计划必须同时说明：积累机制、每周时间、可观察进度，以及为了保护它暂时不做什么。</text>
					<button class="primary-action" @tap="openNewPlan">建立第一项复利计划</button>
					<view class="principle-list">
						<view><text>01</text><text>最多同时 3 项，避免所有事都变成重点</text></view>
						<view><text>02</text><text>看领先指标，也看最终证据，不用主观努力感替代结果</text></view>
						<view><text>03</text><text>每周配置时间，日记只负责反馈现实</text></view>
					</view>
				</view>

				<template v-if="home.plans.length">
					<view class="section-intro">
						<view><text class="eyebrow">ACTIVE BETS</text><text>正在复利</text></view>
						<text>最多 3 项</text>
					</view>

					<view v-for="(plan, index) in home.plans" :key="plan.id" class="plan-card" :class="{ primary: index === 0 }">
						<view class="plan-head">
							<view><text>{{ index === 0 ? '首要投资' : '并行投资 ' + (index + 1) }}</text><text>{{ plan.title }}</text></view>
							<button @tap="openEditPlan(plan)">编辑</button>
						</view>
						<text class="plan-outcome">{{ plan.desiredOutcome }}</text>
						<view class="mechanism" :class="{ missing: !plan.compoundMechanism }">
							<text>复利机制</text>
							<text>{{ plan.compoundMechanism || '这项旧计划还没有说明积累机制，建议补全后再增加投入。' }}</text>
						</view>

						<view class="metric-line">
							<view>
								<text>领先指标</text>
								<text v-if="plan.leadingMetric.name">{{ plan.leadingMetric.name }}</text>
								<text v-else>尚未配置</text>
							</view>
							<text v-if="plan.leadingMetric.target">{{ formatMetric(plan.leadingMetric.current) }} / {{ formatMetric(plan.leadingMetric.target) }}</text>
							<text v-else>—</text>
						</view>
						<view v-if="plan.leadingMetric.progressPercent !== null" class="metric-progress">
							<view :style="{ width: boundedPercent(plan.leadingMetric.progressPercent) + '%' }"></view>
						</view>
						<view class="plan-facts">
							<view><text>本周时间</text><text>{{ formatMinutes(plan.week.actualMinutes) }} / {{ formatMinutes(plan.week.plannedMinutes || plan.weeklyTimeBudgetMinutes) }}</text></view>
							<view><text>周期</text><text>{{ compactDate(plan.cycleStart) }} — {{ compactDate(plan.cycleEnd) }}</text></view>
						</view>
						<view class="milestone">
							<text>当前里程碑</text>
							<text>{{ plan.currentMilestone || plan.desiredOutcome }}</text>
						</view>
						<view v-if="plan.blockerSummary" class="bottleneck">
							<text>当前瓶颈</text><text>{{ plan.blockerSummary }}</text>
						</view>

						<view class="week-plan">
							<view class="week-plan-head">
								<view><text>本周配置</text><text>{{ plan.week.actions.length ? completedActionCount(plan) + ' / ' + plan.week.actions.length + ' 项完成' : '还没有安排' }}</text></view>
								<button @tap="openWeekEditor(plan)">{{ plan.week.actions.length ? '调整' : '安排本周' }}</button>
							</view>
							<view v-for="action in plan.week.actions" :key="action.id" class="week-action" :class="{ done: action.completed }">
								<button class="action-check" :disabled="saving" @tap="toggleWeekAction(plan, action)">{{ action.completed ? '✓' : '' }}</button>
								<button class="action-copy" @tap="openProgress(plan, action)"><text>{{ action.title }}</text><text>记录进展</text></button>
								<button class="action-todo" @tap="createTask(plan, action)">待办</button>
							</view>
							<view v-if="!plan.week.actions.length" class="week-empty">
								<text>把本周能真正完成的 1–3 件事和时间先留下。</text>
								<button @tap="openWeekEditor(plan)">配置时间与行动</button>
							</view>
						</view>

						<view class="next-step">
							<text>下一步</text>
							<text>{{ plan.currentStep }}</text>
							<view>
								<button @tap="createTask(plan, null)">加入待办</button>
								<button @tap="openProgress(plan, null)">记录进展</button>
							</view>
						</view>

						<view v-if="combinedStopList(plan).length" class="stop-list">
							<text>本周期先不做</text>
							<text v-for="(item, stopIndex) in combinedStopList(plan)" :key="stopIndex">— {{ item }}</text>
						</view>
						<button class="bottleneck-trigger" @tap="openBlocker(plan)">当前计划卡住了，分析最大瓶颈 →</button>
					</view>
				</template>

				<view v-if="showWeekEditor" class="editor-panel">
					<view class="panel-heading">
						<view><text class="eyebrow">WEEKLY ALLOCATION</text><text>{{ selectedPlan.title }} · 本周配置</text></view>
						<button @tap="closeEditors">×</button>
					</view>
					<label class="editor-field"><text>本周实际分给它多少分钟</text><input v-model="weekDraft.plannedMinutes" type="number" /></label>
					<label class="editor-field"><text>本周要完成的 1–5 个行动</text><textarea v-model="weekDraft.actionsText" maxlength="1800" auto-height placeholder="一行一项；它们应该服务于里程碑，而不是填满时间。" /></label>
					<label class="editor-field"><text>本周主动不做</text><textarea v-model="weekDraft.stopListText" maxlength="1200" auto-height placeholder="一行一项，保护已经分配的时间。" /></label>
					<button class="primary-action" :disabled="saving || !weekDraft.actionsText.trim()" @tap="saveWeekPlan">{{ saving ? '正在保存…' : '确认本周时间配置' }}</button>
				</view>

				<view v-if="showProgressEditor" class="editor-panel progress-editor">
					<view class="panel-heading">
						<view><text class="eyebrow">REAL PROGRESS</text><text>{{ selectedPlan.title }} · 记录进展</text></view>
						<button @tap="closeEditors">×</button>
					</view>
					<text v-if="progressDraft.weekActionTitle" class="linked-action">对应本周行动：{{ progressDraft.weekActionTitle }}</text>
					<label class="editor-field"><text>实际发生了什么</text><textarea v-model="progressDraft.text" maxlength="5000" auto-height placeholder="写结果、事实或变化，不必把努力包装成成果。" /></label>
					<view class="two-column">
						<label class="editor-field"><text>投入分钟</text><input v-model="progressDraft.spentMinutes" type="number" placeholder="0" /></label>
						<label class="editor-field"><text>领先指标增加</text><input v-model="progressDraft.leadingMetricDelta" type="digit" placeholder="0" /></label>
					</view>
					<button class="primary-action" :disabled="saving || !progressDraft.text.trim()" @tap="prepareProgress">{{ saving ? '正在整理…' : '整理并核对' }}</button>
					<text class="boundary-note">AI 只整理这次记录，不替你判断整个计划成功，也不会自动改写目标。</text>
				</view>

				<view v-if="resultDraft" class="editor-panel confirm-panel">
					<view class="panel-heading">
						<view><text class="eyebrow">CONFIRM THE EVIDENCE</text><text>核对后再进入进度</text></view>
						<button @tap="resultDraft = null">×</button>
					</view>
					<view class="state-options">
						<button v-for="option in resultStates" :key="option.value" :class="{ active: resultDraft.payload.state === option.value }" @tap="resultDraft.payload.state = option.value">{{ option.label }}</button>
					</view>
					<label class="editor-field"><text>发生的事实</text><textarea v-model="resultDraft.payload.summary" maxlength="1800" auto-height /></label>
					<label class="editor-field"><text>留下的结果或变化</text><textarea v-model="resultDraft.payload.actualResult" maxlength="2400" auto-height placeholder="没有可核对结果也可以诚实留空。" /></label>
					<label class="editor-field"><text>下次从哪里继续</text><textarea v-model="resultDraft.payload.nextStep" maxlength="1000" auto-height /></label>
					<view class="confirmation-ledger">
						<view><text>实际投入</text><text>{{ formatMinutes(Number(progressDraft.spentMinutes) || 0) }}</text></view>
						<view><text>{{ selectedPlan.leadingMetric.name || '领先指标' }}</text><text>+{{ Number(progressDraft.leadingMetricDelta) || 0 }}</text></view>
					</view>
					<button class="primary-action" :disabled="saving" @tap="confirmProgress">{{ saving ? '正在保存…' : '确认并计入计划进度' }}</button>
				</view>

				<view v-if="showBlockerEditor" class="editor-panel">
					<view class="panel-heading">
						<view><text class="eyebrow">BOTTLENECK</text><text>{{ selectedPlan.title }} · 最大瓶颈</text></view>
						<button @tap="closeEditors">×</button>
					</view>
					<label class="editor-field"><text>具体卡在哪里</text><textarea v-model="blockerText" maxlength="1800" auto-height placeholder="缺材料、等待别人、方法无效、资源不足，还是这项投资本身不再值得？" /></label>
					<button class="primary-action" :disabled="saving || !blockerText.trim()" @tap="submitBlocker">{{ saving ? '正在分析…' : '分析这一个瓶颈' }}</button>
					<view v-if="blockerInsight" class="blocker-insight">
						<text>判断</text><text>{{ blockerInsight.payload.analysis || blockerInsight.summary }}</text>
						<text v-if="blockerInsight.payload.adjustedStep">建议调整为</text><text v-if="blockerInsight.payload.adjustedStep">{{ blockerInsight.payload.adjustedStep }}</text>
						<button v-if="blockerInsight.payload.adjustedStep" :disabled="saving" @tap="adoptBlocker">由我确认采用这个下一步</button>
					</view>
				</view>

				<view v-if="home.diarySuggestions.length" class="feedback-section">
					<view class="section-intro">
						<view><text class="eyebrow">REALITY FEEDBACK</text><text>来自日记的现实反馈</text></view>
						<text>{{ home.diarySuggestions.length }}</text>
					</view>
					<view v-for="item in home.diarySuggestions" :key="item.linkId" class="diary-feedback">
						<text>{{ item.sourceDate }} · {{ item.itemName }}</text>
						<text>“{{ item.evidenceExcerpt }}”</text>
						<view><button @tap="reviewDiary(item)">回看它怎样影响计划</button><button @tap="dismissDiary(item)">与计划无关</button></view>
					</view>
				</view>

				<view v-if="diaryReviewDraft" class="editor-panel">
					<view class="panel-heading">
						<view><text class="eyebrow">JOURNAL FEEDBACK</text><text>事实与推测分开看</text></view>
						<button @tap="diaryReviewDraft = null">×</button>
					</view>
					<view class="review-list"><text>日记支持的事实</text><text v-for="(fact, factIndex) in diaryReviewDraft.payload.facts" :key="factIndex">— {{ fact }}</text></view>
					<view v-if="diaryReviewDraft.payload.inferences.length" class="review-list inference"><text>仍需验证</text><text v-for="(item, inferenceIndex) in diaryReviewDraft.payload.inferences" :key="inferenceIndex">— {{ item }}</text></view>
					<label class="editor-field"><text>下次尝试</text><textarea v-model="diaryReviewDraft.payload.nextTry" maxlength="1000" auto-height /></label>
					<button class="primary-action" :disabled="saving" @tap="confirmDiaryReview">确认作为下一次尝试</button>
				</view>

				<view v-if="home.recentResults.length" class="recent-section">
					<view class="section-intro"><view><text class="eyebrow">PROGRESS LOG</text><text>近期真实进展</text></view></view>
					<view v-for="item in home.recentResults" :key="item.id" class="result-row">
						<view><text>{{ item.itemName }}</text><text>{{ eventTime(item.createdAt) }}</text></view>
						<text>{{ item.payload.actualResult || item.summary }}</text>
						<view class="result-meta"><text v-if="item.payload.spentMinutes">投入 {{ formatMinutes(item.payload.spentMinutes) }}</text><text v-if="item.payload.leadingMetricDelta">指标 +{{ item.payload.leadingMetricDelta }}</text></view>
					</view>
				</view>

				<view class="secondary-links">
					<button @tap="openReview"><view><text>阶段回看</text><text>检验计划、方法和真实结果</text></view><text>›</text></button>
					<button @tap="openYogaPractice"><view><text>每日自主练习</text><text>已有的身体练习保留为可选工具</text></view><text>›</text></button>
					<button @tap="openDirections"><view><text>长期方向</text><text>只负责价值对齐，不代替计划</text></view><text>›</text></button>
					<button @tap="openPrinciples"><view><text>人生 OS</text><text>决定什么才叫“更好”</text></view><text>›</text></button>
				</view>
				<view class="privacy-note"><view></view><text>{{ home.privacy }}</text></view>
			</template>
		</view>
	</view>
</template>

<script>
import {
	compoundBlocker,
	compoundDiaryDismiss,
	compoundDiaryReview,
	compoundDiaryReviewConfirm,
	compoundHome,
	compoundPlan,
	compoundPlanWeek,
	compoundPlanWeekAction,
	compoundResultConfirm,
	compoundResultDraft,
	compoundSuggestionAdopt,
	compoundThreadPrimary,
	compoundThreads
} from '@/api/compound-system';

function pad(value) {
	return String(value).padStart(2, '0');
}

function localDate(value) {
	const date = value ? new Date(value + 'T12:00:00') : new Date();
	return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function addDays(value, count) {
	const date = new Date(localDate(value) + 'T12:00:00');
	date.setDate(date.getDate() + count);
	return localDate(date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()));
}

function freshHome() {
	return {
		needsOnboarding: true,
		current: null,
		plans: [],
		diarySuggestions: [],
		recentResults: [],
		portfolio: {
			activeCount: 0,
			capacity: 3,
			weekStart: '',
			weekEnd: '',
			plannedMinutes: 0,
			actualMinutes: 0,
			utilizationPercent: 0,
			unplannedCount: 0
		},
		directionCandidates: [],
		privacy: '复利计划、时间配置、进度与回看仅本人可见，不进入发现。'
	};
}

function freshPlanDraft() {
	const start = localDate();
	return {
		title: '',
		desiredOutcome: '',
		compoundMechanism: '',
		weeklyTimeBudgetMinutes: 180,
		leadingMetricName: '',
		leadingMetricTarget: '',
		outcomeEvidence: '',
		currentMilestone: '',
		currentStep: '',
		stopListText: '',
		cycleStart: start,
		cycleEnd: addDays(start, 83)
	};
}

export default {
	data() {
		return {
			statusBarHeight: 0,
			loading: true,
			loadError: false,
			saving: false,
			home: freshHome(),
			showPlanEditor: false,
			showWeekEditor: false,
			showProgressEditor: false,
			showBlockerEditor: false,
			editingPlanId: '',
			directionIndex: 0,
			selectedPlan: null,
			planDraft: freshPlanDraft(),
			weekDraft: { plannedMinutes: 180, actionsText: '', stopListText: '' },
			progressDraft: { text: '', spentMinutes: '', leadingMetricDelta: '', weekActionId: '', weekActionTitle: '' },
			resultDraft: null,
			blockerText: '',
			blockerInsight: null,
			diaryReviewDraft: null,
			resultStates: [
				{ value: 'DONE', label: '已经发生' },
				{ value: 'EFFECTIVE', label: '已有成效' },
				{ value: 'UNVERIFIED', label: '效果待验证' },
				{ value: 'PREPARING', label: '只是准备' }
			]
		};
	},
	computed: {
		directionChoices() {
			return this.home.directionCandidates || [];
		},
		selectedDirectionName() {
			const item = this.directionChoices[this.directionIndex];
			return item ? item.name : '请选择长期方向';
		},
		weekRange() {
			const portfolio = this.home.portfolio || {};
			if (!portfolio.weekStart) return 'THIS WEEK';
			return '本周 · ' + this.compactDate(portfolio.weekStart) + ' — ' + this.compactDate(portfolio.weekEnd);
		},
		canSavePlan() {
			const draft = this.planDraft;
			const directionReady = Boolean(this.editingPlanId || this.directionChoices[this.directionIndex]);
			return directionReady && Boolean(
				draft.title.trim()
				&& draft.desiredOutcome.trim()
				&& draft.compoundMechanism.trim()
				&& Number(draft.weeklyTimeBudgetMinutes) > 0
				&& draft.leadingMetricName.trim()
				&& Number(draft.leadingMetricTarget) > 0
				&& draft.outcomeEvidence.trim()
				&& draft.currentMilestone.trim()
				&& draft.currentStep.trim()
			);
		}
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
	},
	onShow() {
		this.loadHome();
	},
	methods: {
		async loadHome() {
			this.loading = true;
			this.loadError = false;
			try {
				const response = await this.$http.get(compoundHome);
				this.home = { ...freshHome(), ...(response.data || {}) };
			} catch (error) {
				this.loadError = true;
				console.error('加载复利计划失败', error);
			} finally {
				this.loading = false;
			}
		},
		changeDirection(event) {
			this.directionIndex = Number(event.detail.value) || 0;
		},
		openNewPlan() {
			if ((this.home.portfolio.activeCount || 0) >= 3) {
				uni.showToast({ title: '同时只保留 3 项投资，请先调整现有计划', icon: 'none' });
				return;
			}
			if (!this.directionChoices.length) {
				uni.showToast({ title: '暂时没有可关联的长期方向', icon: 'none' });
				return;
			}
			this.closeEditors();
			this.editingPlanId = '';
			this.directionIndex = 0;
			this.planDraft = freshPlanDraft();
			this.showPlanEditor = true;
			this.scrollToEditors();
		},
		openEditPlan(plan) {
			this.closeEditors();
			this.editingPlanId = plan.id;
			this.selectedPlan = plan;
			this.planDraft = {
				title: plan.title || '',
				desiredOutcome: plan.desiredOutcome || '',
				compoundMechanism: plan.compoundMechanism || '',
				weeklyTimeBudgetMinutes: plan.weeklyTimeBudgetMinutes || 180,
				leadingMetricName: plan.leadingMetric.name || '',
				leadingMetricTarget: plan.leadingMetric.target || '',
				outcomeEvidence: plan.outcomeEvidence || '',
				currentMilestone: plan.currentMilestone || '',
				currentStep: plan.currentStep || '',
				stopListText: (plan.stopList || []).join('\n'),
				cycleStart: plan.cycleStart,
				cycleEnd: plan.cycleEnd
			};
			this.showPlanEditor = true;
			this.scrollToEditors();
		},
		planPayload() {
			const draft = this.planDraft;
			const direction = this.directionChoices[this.directionIndex];
			return {
				itemKey: direction ? direction.stableKey : undefined,
				title: draft.title.trim(),
				desiredOutcome: draft.desiredOutcome.trim(),
				compoundMechanism: draft.compoundMechanism.trim(),
				weeklyTimeBudgetMinutes: Math.round(Number(draft.weeklyTimeBudgetMinutes) || 0),
				leadingMetricName: draft.leadingMetricName.trim(),
				leadingMetricTarget: Number(draft.leadingMetricTarget) || 0,
				outcomeEvidence: draft.outcomeEvidence.trim(),
				currentMilestone: draft.currentMilestone.trim(),
				currentStep: draft.currentStep.trim(),
				stopList: this.splitLines(draft.stopListText, 8),
				cycleStart: draft.cycleStart,
				cycleEnd: draft.cycleEnd,
				contextReason: '由用户建立的 12 周复利计划'
			};
		},
		async savePlan() {
			if (this.saving || !this.canSavePlan) return;
			this.saving = true;
			try {
				const payload = this.planPayload();
				if (this.editingPlanId) await this.$http.patch(compoundPlan(this.editingPlanId), payload);
				else await this.$http.post(compoundThreads, payload);
				this.closeEditors();
				await this.loadHome();
				uni.showToast({ title: this.editingPlanId ? '计划已修订' : '复利计划已建立', icon: 'success' });
			} catch (error) {
				uni.showToast({ title: error.message || '计划没有保存成功', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		openWeekEditor(plan) {
			this.closeEditors();
			this.selectedPlan = plan;
			this.weekDraft = {
				plannedMinutes: plan.week.plannedMinutes || plan.weeklyTimeBudgetMinutes || 180,
				actionsText: (plan.week.actions || []).map(item => item.title).join('\n'),
				stopListText: (plan.week.stopList || []).join('\n')
			};
			this.showWeekEditor = true;
			this.scrollToEditors();
		},
		async saveWeekPlan() {
			if (!this.selectedPlan || this.saving) return;
			const actions = this.splitLines(this.weekDraft.actionsText, 5);
			if (!actions.length || Number(this.weekDraft.plannedMinutes) <= 0) return;
			this.saving = true;
			try {
				await this.$http.put(compoundPlanWeek(this.selectedPlan.id), {
					plannedMinutes: Math.round(Number(this.weekDraft.plannedMinutes)),
					actions,
					stopList: this.splitLines(this.weekDraft.stopListText, 8)
				});
				this.closeEditors();
				await this.loadHome();
				uni.showToast({ title: '本周配置已保存', icon: 'success' });
			} catch (error) {
				uni.showToast({ title: error.message || '本周配置没有保存成功', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		async toggleWeekAction(plan, action) {
			if (this.saving) return;
			this.saving = true;
			try {
				await this.$http.patch(compoundPlanWeekAction(plan.id, action.id), { completed: !action.completed });
				action.completed = !action.completed;
			} catch (error) {
				uni.showToast({ title: '行动状态没有保存成功', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		openProgress(plan, action) {
			this.closeEditors();
			this.selectedPlan = plan;
			this.progressDraft = {
				text: action ? action.title + '：' : '',
				spentMinutes: action && action.plannedMinutes ? action.plannedMinutes : '',
				leadingMetricDelta: '',
				weekActionId: action ? action.id : '',
				weekActionTitle: action ? action.title : ''
			};
			this.showProgressEditor = true;
			this.scrollToEditors();
		},
		async prepareProgress() {
			if (!this.selectedPlan || !this.progressDraft.text.trim() || this.saving) return;
			this.saving = true;
			try {
				const response = await this.$http.post(compoundResultDraft(this.selectedPlan.id), {
					text: this.progressDraft.text,
					mediaIds: []
				});
				this.resultDraft = response.data.event;
				this.showProgressEditor = false;
			} catch (error) {
				uni.showToast({ title: '这次进展没有整理好，请重试', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		async confirmProgress() {
			if (!this.selectedPlan || !this.resultDraft || this.saving) return;
			this.saving = true;
			try {
				await this.$http.post(compoundResultConfirm(this.selectedPlan.id, this.resultDraft.id), {
					...this.resultDraft.payload,
					closeMode: 'CONTINUE',
					spentMinutes: Math.round(Number(this.progressDraft.spentMinutes) || 0),
					leadingMetricDelta: Number(this.progressDraft.leadingMetricDelta) || 0,
					weekActionId: this.progressDraft.weekActionId
				});
				this.resultDraft = null;
				this.selectedPlan = null;
				await this.loadHome();
				uni.showToast({ title: '已计入真实进度', icon: 'success' });
			} catch (error) {
				uni.showToast({ title: error.message || '进展没有保存成功', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		openBlocker(plan) {
			this.closeEditors();
			this.selectedPlan = plan;
			this.blockerText = plan.blockerSummary || '';
			this.blockerInsight = null;
			this.showBlockerEditor = true;
			this.scrollToEditors();
		},
		async submitBlocker() {
			if (!this.selectedPlan || !this.blockerText.trim() || this.saving) return;
			this.saving = true;
			try {
				await this.$http.post(compoundThreadPrimary(this.selectedPlan.id), {});
				const response = await this.$http.post(compoundBlocker(this.selectedPlan.id), { blocker: this.blockerText });
				this.blockerInsight = response.data.event;
			} catch (error) {
				uni.showToast({ title: '瓶颈暂时没有分析完成', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		async adoptBlocker() {
			if (!this.selectedPlan || !this.blockerInsight || this.saving) return;
			this.saving = true;
			try {
				await this.$http.post(
					compoundSuggestionAdopt(this.selectedPlan.id, this.blockerInsight.id),
					{ currentStep: this.blockerInsight.payload.adjustedStep }
				);
				this.closeEditors();
				await this.loadHome();
				uni.showToast({ title: '已采用调整后的下一步', icon: 'success' });
			} catch (error) {
				uni.showToast({ title: '调整没有保存成功', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		async reviewDiary(item) {
			if (!this.home.current || this.saving) return;
			this.saving = true;
			try {
				const response = await this.$http.post(compoundDiaryReview(this.home.current.id, item.linkId), {});
				this.diaryReviewDraft = response.data.event;
			} catch (error) {
				uni.showToast({ title: '这次日记暂时没有回看完成', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		async confirmDiaryReview() {
			if (!this.home.current || !this.diaryReviewDraft || this.saving) return;
			this.saving = true;
			try {
				await this.$http.post(
					compoundDiaryReviewConfirm(this.home.current.id, this.diaryReviewDraft.id),
					this.diaryReviewDraft.payload
				);
				this.diaryReviewDraft = null;
				await this.loadHome();
				uni.showToast({ title: '现实反馈已接入计划', icon: 'success' });
			} catch (error) {
				uni.showToast({ title: '这次反馈没有保存成功', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		async dismissDiary(item) {
			if (!this.home.current || this.saving) return;
			this.saving = true;
			try {
				await this.$http.post(compoundDiaryDismiss(this.home.current.id, item.linkId), {});
				await this.loadHome();
			} catch (error) {
				uni.showToast({ title: '暂时没能忽略这条关联', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		createTask(plan, action) {
			const title = action ? action.title : plan.currentStep;
			uni.setStorageSync('todoPrefill', {
				title,
				description: '服务于复利计划：' + plan.title + '\n\n12 周结果：' + plan.desiredOutcome,
				compoundItemId: plan.itemId,
				sourceType: 'COMPOUND',
				sourceRefId: plan.id,
				sourceCompoundThreadId: plan.id
			});
			uni.navigateTo({ url: '/pages/todo/list' });
		},
		closeEditors() {
			this.showPlanEditor = false;
			this.showWeekEditor = false;
			this.showProgressEditor = false;
			this.showBlockerEditor = false;
			this.resultDraft = null;
			this.blockerInsight = null;
			this.diaryReviewDraft = null;
		},
		scrollToEditors() {
			setTimeout(() => uni.pageScrollTo({ scrollTop: 330, duration: 240 }), 40);
		},
		splitLines(value, max) {
			return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean).slice(0, max);
		},
		combinedStopList(plan) {
			const source = (plan.week.stopList && plan.week.stopList.length) ? plan.week.stopList : plan.stopList;
			return (source || []).slice(0, 5);
		},
		completedActionCount(plan) {
			return (plan.week.actions || []).filter(item => item.completed).length;
		},
		boundedPercent(value) {
			return Math.max(0, Math.min(100, Number(value) || 0));
		},
		formatMetric(value) {
			const number = Number(value) || 0;
			return Number.isInteger(number) ? String(number) : number.toFixed(1);
		},
		formatMinutes(value) {
			const minutes = Math.max(0, Math.round(Number(value) || 0));
			if (minutes < 60) return minutes + ' 分钟';
			const hours = Math.floor(minutes / 60);
			const remainder = minutes % 60;
			return remainder ? hours + ' 小时 ' + remainder + ' 分' : hours + ' 小时';
		},
		compactDate(value) {
			return String(value || '').slice(5).replace('-', '.');
		},
		eventTime(value) {
			return String(value || '').replace('T', ' ').slice(0, 16);
		},
		openReview() {
			uni.navigateTo({ url: '/pages/shroom/life-os-weekly' });
		},
		openYogaPractice() {
			uni.navigateTo({ url: '/pages/shroom/yoga-practice' });
		},
		openDirections() {
			uni.navigateTo({ url: '/pages/shroom/life-os-plan' });
		},
		openPrinciples() {
			uni.navigateTo({ url: '/pages/shroom/life-os' });
		},
		goBack() {
			const pages = getCurrentPages();
			if (pages.length > 1) uni.navigateBack();
			else uni.switchTab({ url: '/pages/diary/index' });
		}
	}
};
</script>

<style lang="scss" scoped>
button {
	margin: 0;
	padding: 0;
	line-height: 1.25;
	background: transparent;
	border: 0;
}
button::after { border: 0; }
button[disabled] { opacity: .42; }
input,
textarea {
	box-sizing: border-box;
	width: 100%;
	border: 1rpx solid rgba(26, 40, 29, .12);
	border-radius: 18rpx;
	background: rgba(255, 255, 255, .78);
	color: #19231b;
	font-size: 20rpx;
}
input {
	height: 72rpx;
	padding: 0 20rpx;
}
textarea {
	min-height: 112rpx;
	padding: 18rpx 20rpx;
	line-height: 1.55;
	overflow-wrap: anywhere;
}
.compound-page {
	min-height: 100vh;
	background:
		radial-gradient(circle at 88% 4%, rgba(201, 237, 150, .38), transparent 28%),
		#f2f6eb;
	color: #19231b;
}
.status-bar { background: transparent; }
.page-shell {
	box-sizing: border-box;
	width: 100%;
	padding: 26rpx 30rpx calc(130rpx + env(safe-area-inset-bottom));
}
.topbar {
	display: flex;
	align-items: center;
	gap: 17rpx;
}
.round-button {
	display: flex;
	width: 66rpx;
	height: 66rpx;
	flex: 0 0 66rpx;
	align-items: center;
	justify-content: center;
	border: 1rpx solid rgba(25, 35, 27, .11);
	border-radius: 50%;
	background: rgba(255, 255, 255, .72);
	color: #223027;
}
.back-button { font-size: 41rpx; }
.add-button { font-size: 32rpx; font-weight: 400; }
.topbar-copy {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 3rpx;
}
.topbar-kicker,
.eyebrow {
	color: #718074;
	font-size: 14rpx;
	font-weight: 760;
	letter-spacing: 2.3rpx;
}
.topbar-title {
	font-family: Georgia, 'Songti SC', serif;
	font-size: 32rpx;
	font-weight: 720;
}
.state-card {
	display: flex;
	min-height: 330rpx;
	margin-top: 28rpx;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 22rpx;
	border-radius: 31rpx;
	background: rgba(255, 255, 255, .72);
	color: #667268;
	font-size: 18rpx;
}
.loading-dot {
	width: 17rpx;
	height: 17rpx;
	border-radius: 50%;
	background: #6b846b;
	box-shadow: 0 0 0 12rpx rgba(107, 132, 107, .13);
}
.dark-pill,
.primary-action {
	display: flex;
	box-sizing: border-box;
	min-height: 72rpx;
	padding: 14rpx 25rpx;
	align-items: center;
	justify-content: center;
	border-radius: 999rpx;
	background: #1b2920;
	color: #fff;
	font-size: 19rpx;
	font-weight: 710;
}
.portfolio-hero {
	box-sizing: border-box;
	margin-top: 28rpx;
	padding: 38rpx 30rpx 30rpx;
	overflow: hidden;
	border-radius: 36rpx;
	background: #18241c;
	color: #fff;
	box-shadow: 0 18rpx 45rpx rgba(26, 39, 29, .12);
}
.portfolio-hero .eyebrow { color: #9aab9d; }
.portfolio-title {
	display: block;
	margin-top: 20rpx;
	font-family: Georgia, 'Songti SC', serif;
	font-size: 44rpx;
	font-weight: 720;
	line-height: 1.18;
	letter-spacing: -.8rpx;
}
.portfolio-copy {
	display: block;
	max-width: 590rpx;
	margin-top: 18rpx;
	color: #b8c4ba;
	font-size: 18rpx;
	line-height: 1.65;
}
.week-ledger {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr;
	margin-top: 31rpx;
	padding-top: 24rpx;
	border-top: 1rpx solid rgba(255, 255, 255, .12);
}
.week-ledger > view {
	display: flex;
	min-width: 0;
	padding-right: 12rpx;
	flex-direction: column;
	gap: 8rpx;
}
.week-ledger > view + view {
	padding-left: 16rpx;
	border-left: 1rpx solid rgba(255, 255, 255, .11);
}
.week-ledger text:first-child {
	color: #8fa092;
	font-size: 14rpx;
}
.week-ledger text:last-child {
	font-size: 20rpx;
	font-weight: 680;
	line-height: 1.35;
}
.portfolio-progress {
	display: flex;
	margin-top: 22rpx;
	align-items: center;
	gap: 13rpx;
}
.portfolio-progress > view {
	height: 8rpx;
	flex: 1;
	overflow: hidden;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, .13);
}
.portfolio-progress > view > view {
	height: 100%;
	border-radius: inherit;
	background: #c9ef91;
}
.portfolio-progress > text {
	color: #b8c7ba;
	font-size: 14rpx;
}
.allocation-note {
	display: block;
	margin-top: 18rpx;
	color: #e4c990;
	font-size: 15rpx;
}
.empty-state {
	box-sizing: border-box;
	margin-top: 25rpx;
	padding: 40rpx 31rpx;
	border-radius: 32rpx;
	background: rgba(255, 255, 255, .82);
}
.empty-title {
	display: block;
	margin-top: 15rpx;
	font-family: Georgia, 'Songti SC', serif;
	font-size: 39rpx;
	font-weight: 720;
	line-height: 1.23;
}
.empty-copy {
	display: block;
	margin-top: 18rpx;
	color: #657166;
	font-size: 18rpx;
	line-height: 1.66;
}
.empty-state .primary-action { width: 100%; margin-top: 27rpx; }
.principle-list {
	display: flex;
	margin-top: 30rpx;
	flex-direction: column;
}
.principle-list > view {
	display: grid;
	grid-template-columns: 46rpx 1fr;
	gap: 12rpx;
	padding: 17rpx 0;
	border-top: 1rpx solid #e6ebe2;
}
.principle-list text:first-child {
	color: #809083;
	font-size: 14rpx;
	font-weight: 730;
}
.principle-list text:last-child {
	color: #4c5b50;
	font-size: 17rpx;
	line-height: 1.5;
}
.section-intro {
	display: flex;
	margin: 34rpx 4rpx 15rpx;
	align-items: flex-end;
	justify-content: space-between;
	gap: 20rpx;
}
.section-intro > view {
	display: flex;
	flex-direction: column;
	gap: 5rpx;
}
.section-intro > view text:last-child {
	font-family: Georgia, 'Songti SC', serif;
	font-size: 28rpx;
	font-weight: 710;
}
.section-intro > text {
	color: #78847a;
	font-size: 15rpx;
}
.plan-card {
	box-sizing: border-box;
	margin-top: 14rpx;
	padding: 29rpx;
	border: 1rpx solid rgba(28, 42, 31, .07);
	border-radius: 31rpx;
	background: rgba(255, 255, 255, .9);
	box-shadow: 0 10rpx 28rpx rgba(36, 51, 39, .045);
}
.plan-card.primary {
	border-color: rgba(86, 117, 73, .18);
	background: #fcfdf8;
}
.plan-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 18rpx;
}
.plan-head > view {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 7rpx;
}
.plan-head > view text:first-child {
	color: #7b897d;
	font-size: 14rpx;
	font-weight: 730;
	letter-spacing: 1rpx;
}
.plan-head > view text:last-child {
	font-family: Georgia, 'Songti SC', serif;
	font-size: 29rpx;
	font-weight: 720;
	line-height: 1.35;
	overflow-wrap: anywhere;
}
.plan-head > button {
	padding: 7rpx 0 7rpx 17rpx;
	color: #627264;
	font-size: 16rpx;
}
.plan-outcome {
	display: block;
	margin-top: 16rpx;
	color: #5c685f;
	font-size: 18rpx;
	line-height: 1.6;
}
.mechanism {
	display: flex;
	margin-top: 22rpx;
	padding: 19rpx 20rpx;
	flex-direction: column;
	gap: 8rpx;
	border-radius: 20rpx;
	background: #e8f0d9;
}
.mechanism.missing { background: #f4ead7; }
.mechanism text:first-child {
	color: #61705f;
	font-size: 14rpx;
	font-weight: 740;
}
.mechanism text:last-child {
	font-size: 17rpx;
	line-height: 1.5;
}
.metric-line {
	display: flex;
	margin-top: 25rpx;
	align-items: flex-end;
	justify-content: space-between;
	gap: 18rpx;
}
.metric-line > view {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 5rpx;
}
.metric-line > view text:first-child {
	color: #7a867c;
	font-size: 14rpx;
}
.metric-line > view text:last-child {
	font-size: 17rpx;
	font-weight: 670;
}
.metric-line > text {
	font-family: Georgia, serif;
	font-size: 22rpx;
	font-weight: 690;
	white-space: nowrap;
}
.metric-progress {
	height: 8rpx;
	margin-top: 12rpx;
	overflow: hidden;
	border-radius: 999rpx;
	background: #e4eae0;
}
.metric-progress > view {
	height: 100%;
	border-radius: inherit;
	background: #668461;
}
.plan-facts {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10rpx;
	margin-top: 21rpx;
}
.plan-facts > view {
	display: flex;
	padding: 15rpx 17rpx;
	flex-direction: column;
	gap: 6rpx;
	border-radius: 16rpx;
	background: #f3f5ef;
}
.plan-facts text:first-child {
	color: #7c877f;
	font-size: 13rpx;
}
.plan-facts text:last-child {
	font-size: 16rpx;
	font-weight: 660;
	line-height: 1.4;
}
.milestone,
.bottleneck {
	display: grid;
	grid-template-columns: 110rpx 1fr;
	gap: 13rpx;
	margin-top: 21rpx;
	padding-top: 19rpx;
	border-top: 1rpx solid #e7ebe4;
}
.milestone text:first-child,
.bottleneck text:first-child {
	color: #77837a;
	font-size: 14rpx;
}
.milestone text:last-child,
.bottleneck text:last-child {
	font-size: 17rpx;
	line-height: 1.5;
}
.bottleneck text:last-child { color: #926d37; }
.week-plan {
	margin-top: 24rpx;
	padding: 20rpx;
	border-radius: 22rpx;
	background: #f0f4eb;
}
.week-plan-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 15rpx;
}
.week-plan-head > view {
	display: flex;
	flex-direction: column;
	gap: 4rpx;
}
.week-plan-head > view text:first-child {
	font-size: 18rpx;
	font-weight: 710;
}
.week-plan-head > view text:last-child {
	color: #7a867c;
	font-size: 14rpx;
}
.week-plan-head > button {
	color: #526854;
	font-size: 15rpx;
	font-weight: 680;
}
.week-action {
	display: grid;
	box-sizing: border-box;
	width: 100%;
	grid-template-columns: 33rpx 1fr auto;
	gap: 11rpx;
	margin-top: 15rpx;
	align-items: start;
}
.action-check {
	display: flex;
	width: 29rpx;
	height: 29rpx;
	align-items: center;
	justify-content: center;
	border: 1rpx solid #8a9a8b;
	border-radius: 50%;
	color: #fff;
	font-size: 15rpx;
}
.action-copy {
	display: flex;
	min-width: 0;
	flex-direction: column;
	align-items: flex-start;
	gap: 3rpx;
	text-align: left;
}
.action-copy text:first-child { font-size: 17rpx; line-height: 1.45; }
.action-copy text:last-child {
	color: #879188;
	font-size: 13rpx;
}
.action-todo {
	padding: 5rpx 0 5rpx 12rpx;
	color: #5b705d;
	font-size: 14rpx;
	font-weight: 680;
}
.week-action.done .action-check {
	border-color: #60785e;
	background: #60785e;
}
.week-action.done .action-copy text:first-child {
	color: #899289;
	text-decoration: line-through;
}
.week-empty {
	display: flex;
	margin-top: 16rpx;
	padding-top: 15rpx;
	align-items: center;
	justify-content: space-between;
	gap: 15rpx;
	border-top: 1rpx solid #dfe6d9;
}
.week-empty > text {
	flex: 1;
	color: #748075;
	font-size: 15rpx;
	line-height: 1.45;
}
.week-empty > button {
	color: #526854;
	font-size: 15rpx;
	font-weight: 690;
}
.next-step {
	display: flex;
	margin-top: 22rpx;
	flex-direction: column;
	gap: 8rpx;
}
.next-step > text:first-child {
	color: #768279;
	font-size: 14rpx;
}
.next-step > text:nth-child(2) {
	font-size: 20rpx;
	font-weight: 670;
	line-height: 1.5;
	overflow-wrap: anywhere;
}
.next-step > view {
	display: flex;
	gap: 10rpx;
	margin-top: 8rpx;
}
.next-step button {
	display: flex;
	min-height: 59rpx;
	padding: 0 19rpx;
	align-items: center;
	justify-content: center;
	border-radius: 999rpx;
	background: #edf1e8;
	color: #4d6150;
	font-size: 15rpx;
	font-weight: 670;
}
.next-step button:last-child {
	background: #203027;
	color: #fff;
}
.stop-list {
	display: flex;
	margin-top: 22rpx;
	padding: 18rpx 19rpx;
	flex-direction: column;
	gap: 7rpx;
	border-radius: 19rpx;
	background: #f5eee2;
}
.stop-list text:first-child {
	color: #806f55;
	font-size: 14rpx;
	font-weight: 720;
}
.stop-list text:not(:first-child) {
	color: #655d50;
	font-size: 15rpx;
	line-height: 1.4;
}
.bottleneck-trigger {
	width: 100%;
	padding: 22rpx 0 2rpx;
	color: #637165;
	font-size: 15rpx;
	text-align: left;
}
.editor-panel {
	box-sizing: border-box;
	margin-top: 24rpx;
	padding: 28rpx;
	border: 1rpx solid rgba(32, 49, 36, .08);
	border-radius: 30rpx;
	background: #fff;
	box-shadow: 0 14rpx 38rpx rgba(35, 52, 39, .07);
}
.panel-heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 18rpx;
}
.panel-heading > view {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 6rpx;
}
.panel-heading > view text:last-child {
	font-family: Georgia, 'Songti SC', serif;
	font-size: 27rpx;
	font-weight: 710;
	line-height: 1.35;
}
.panel-heading > button {
	color: #718075;
	font-size: 27rpx;
}
.editor-field {
	display: flex;
	margin-top: 21rpx;
	flex-direction: column;
	gap: 9rpx;
}
.editor-field > text:first-child {
	color: #59675c;
	font-size: 15rpx;
	font-weight: 690;
}
.field-help,
.boundary-note {
	display: block;
	color: #869087;
	font-size: 14rpx;
	line-height: 1.5;
}
.select-field {
	display: flex;
	box-sizing: border-box;
	height: 72rpx;
	padding: 0 20rpx;
	align-items: center;
	justify-content: space-between;
	border: 1rpx solid rgba(26, 40, 29, .12);
	border-radius: 18rpx;
	background: rgba(255, 255, 255, .78);
	font-size: 18rpx;
}
.select-field text { color: #738077; }
.two-column {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 13rpx;
}
.cycle-note {
	display: flex;
	margin-top: 21rpx;
	padding: 17rpx 0;
	align-items: center;
	justify-content: space-between;
	gap: 18rpx;
	border-top: 1rpx solid #e8ece5;
	border-bottom: 1rpx solid #e8ece5;
}
.cycle-note text:first-child {
	color: #758078;
	font-size: 15rpx;
}
.cycle-note text:last-child {
	font-size: 16rpx;
	font-weight: 660;
}
.editor-panel .primary-action {
	width: 100%;
	margin-top: 24rpx;
}
.linked-action {
	display: block;
	margin-top: 18rpx;
	padding: 15rpx 17rpx;
	border-radius: 16rpx;
	background: #edf3e8;
	color: #516252;
	font-size: 16rpx;
}
.state-options {
	display: flex;
	flex-wrap: wrap;
	gap: 8rpx;
	margin-top: 20rpx;
}
.state-options button {
	display: flex;
	min-height: 51rpx;
	padding: 0 16rpx;
	align-items: center;
	justify-content: center;
	border-radius: 999rpx;
	background: #eef2e9;
	color: #637066;
	font-size: 15rpx;
}
.state-options button.active {
	background: #203027;
	color: #fff;
}
.confirmation-ledger {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 11rpx;
	margin-top: 20rpx;
}
.confirmation-ledger > view {
	display: flex;
	padding: 16rpx 17rpx;
	flex-direction: column;
	gap: 6rpx;
	border-radius: 17rpx;
	background: #f1f4ed;
}
.confirmation-ledger text:first-child {
	color: #79837b;
	font-size: 13rpx;
}
.confirmation-ledger text:last-child {
	font-size: 18rpx;
	font-weight: 680;
}
.blocker-insight {
	display: flex;
	margin-top: 21rpx;
	padding: 20rpx;
	flex-direction: column;
	gap: 9rpx;
	border-radius: 20rpx;
	background: #f3ecd9;
}
.blocker-insight > text:nth-child(odd) {
	color: #827052;
	font-size: 14rpx;
	font-weight: 720;
}
.blocker-insight > text:nth-child(even) {
	font-size: 17rpx;
	line-height: 1.55;
}
.blocker-insight > button {
	align-self: flex-start;
	margin-top: 7rpx;
	color: #4f654f;
	font-size: 16rpx;
	font-weight: 710;
}
.feedback-section,
.recent-section { margin-top: 7rpx; }
.diary-feedback,
.result-row {
	box-sizing: border-box;
	margin-top: 12rpx;
	padding: 23rpx 25rpx;
	border-radius: 23rpx;
	background: rgba(255, 255, 255, .78);
}
.diary-feedback {
	display: flex;
	flex-direction: column;
	gap: 10rpx;
}
.diary-feedback > text:first-child {
	color: #7b877d;
	font-size: 14rpx;
}
.diary-feedback > text:nth-child(2) {
	font-size: 18rpx;
	line-height: 1.55;
}
.diary-feedback > view {
	display: flex;
	gap: 17rpx;
	margin-top: 4rpx;
}
.diary-feedback button {
	color: #526a55;
	font-size: 15rpx;
	font-weight: 680;
}
.diary-feedback button:last-child {
	color: #8a918b;
	font-weight: 500;
}
.review-list {
	display: flex;
	margin-top: 20rpx;
	padding: 18rpx;
	flex-direction: column;
	gap: 8rpx;
	border-radius: 18rpx;
	background: #eef4e9;
}
.review-list.inference { background: #f5eddf; }
.review-list text:first-child {
	color: #617061;
	font-size: 15rpx;
	font-weight: 710;
}
.review-list text:not(:first-child) {
	font-size: 16rpx;
	line-height: 1.5;
}
.result-row {
	display: flex;
	flex-direction: column;
	gap: 9rpx;
}
.result-row > view:first-child {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 14rpx;
}
.result-row > view:first-child text:first-child {
	color: #526154;
	font-size: 15rpx;
	font-weight: 680;
}
.result-row > view:first-child text:last-child {
	color: #8a938b;
	font-size: 13rpx;
}
.result-row > text {
	font-size: 18rpx;
	line-height: 1.55;
}
.result-meta {
	display: flex;
	gap: 13rpx;
	color: #778279;
	font-size: 14rpx;
}
.secondary-links {
	margin-top: 27rpx;
	overflow: hidden;
	border-radius: 27rpx;
	background: rgba(255, 255, 255, .7);
}
.secondary-links > button {
	display: flex;
	box-sizing: border-box;
	width: 100%;
	padding: 22rpx 24rpx;
	align-items: center;
	justify-content: space-between;
	gap: 16rpx;
	border-top: 1rpx solid rgba(30, 42, 33, .08);
	text-align: left;
}
.secondary-links > button:first-child { border-top: 0; }
.secondary-links > button > view {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 5rpx;
}
.secondary-links > button > view text:first-child {
	font-size: 18rpx;
	font-weight: 680;
}
.secondary-links > button > view text:last-child {
	color: #748078;
	font-size: 15rpx;
	line-height: 1.4;
}
.secondary-links > button > text {
	color: #748078;
	font-size: 26rpx;
}
.privacy-note {
	display: flex;
	align-items: flex-start;
	gap: 11rpx;
	padding: 23rpx 7rpx 0;
	color: #7a857c;
	font-size: 14rpx;
	line-height: 1.5;
}
.privacy-note > view {
	width: 8rpx;
	height: 8rpx;
	margin-top: 6rpx;
	flex: 0 0 8rpx;
	border-radius: 50%;
	background: #668166;
}
/* #ifdef H5 */
@media (min-width: 980px) {
	.compound-page { box-sizing: border-box; padding-left: 96px; }
	.status-bar { display: none; }
	.page-shell { max-width: 820px; margin: 0 auto; padding: 48px 38px 100px; }
}
/* #endif */
</style>
