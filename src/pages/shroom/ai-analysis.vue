<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header"><view class="back" @tap="goBack">‹</view><view class="heading"><text class="kicker">MY OBSERVERS</text><text class="title">重新看见这一天</text><text class="subtitle">让你选择的观察席，从不同机制理解同一段经历。</text></view></view>

			<view class="privacy"><view class="privacy-dot"></view><text>观察席只在你主动开始时运行；本次使用哪些席位会随结果保存，之后修改设置不会改写历史分析。</text></view>

			<view class="unavailable" v-if="capabilityKnown && !analysisEnabled">
				<text class="state-index">AI · OFF</text><text class="state-title">观察席服务尚未启用</text><text class="state-copy">在模型配置完成前，日记不会被发送给任何模型。</text>
			</view>
			<view class="empty-state" v-else-if="!analysis">
				<text class="state-index">{{ enabledObserverCount }} SEATS READY</text><text class="state-title">把经历放到不同的观察席</text><text class="state-copy">默认五席与自己的自定义席位都可以自由切换。分析是参考，不是结论。</text>
				<view class="observer-preview" v-if="enabledObservers.length"><text v-for="item in enabledObservers" :key="item.id">{{ item.shortName || item.name }}</text></view>
				<view class="primary-button" @tap="startAnalysis">开始日记观察</view>
				<text class="charge-note">成功交付后按实际 Token 成本 × 2.5 扣菇点；失败不扣费。首次使用会先请你确认收费与退款规则。</text>
				<view class="manage-link" @tap="openObservers">管理我的观察席　›</view>
			</view>
			<view class="running-state" v-else-if="analysis.status === 'pending' || analysis.status === 'running'">
				<view class="orbit"><view></view></view><text class="state-title">正在听取 {{ taskObserverCount }} 个观察席</text><text class="state-copy">各席位独立观察，完成后会一起保存。你可以离开页面，稍后回来查看。</text><text class="running-label">{{ analysis.status === 'pending' ? '等待开始' : '分析进行中' }}</text>
			</view>
			<view class="unavailable" v-else-if="analysis.status === 'failed'">
				<text class="state-index">NEEDS RETRY</text><text class="state-title">这次分析没有完整完成</text><text class="state-copy">{{ analysis.error || '模型服务暂时不可用，日记原文仍然安全保存。' }}</text><view class="primary-button" @tap="startAnalysis">重新分析</view><text class="charge-note retry-note">失败不扣费；重新分析成功后按新的实际 Token 用量计费。</text>
			</view>

			<view v-else-if="analysis.status === 'done'">
				<view class="source-context" v-if="analysis.sourceActivities && analysis.sourceActivities.length">
					<view class="source-context-head"><view><text>CONNECTED CONTEXT</text><text>这份分析读取了 {{ analysis.sourceActivities.length }} 条 Codex 任务线索</text></view><text>CODEX</text></view>
					<view class="source-context-item" v-for="item in analysis.sourceActivities" :key="item.id"><text>{{ item.title }}</text><text>{{ sourceActivityMeta(item) }}</text></view>
					<text class="source-context-note">它们是外部观测，不是你亲笔写下的日记；任务运行时间也不等于专注时间。</text>
				</view>
				<scroll-view class="lens-scroll" scroll-x :show-scrollbar="false"><view class="lens-tabs"><view v-for="tab in tabs" :key="tab.id" :class="{ active: activeView === tab.id, disabled: tab.disabled }" @tap="selectView(tab)"><text>{{ tab.index }}</text><text>{{ tab.name }}</text></view></view></scroll-view>

				<view class="view-sheet" v-if="viewType === 'first_principles'">
					<view class="view-heading"><text>01</text><view><text>第一性原理</text><text>拆开假设，回到真正依赖的前提</text></view></view>
					<view class="analysis-block" v-for="(item,index) in currentView.principles || []" :key="index"><text class="block-label">{{ item.principle }}</text><text class="block-body">{{ item.reflection }}</text><view class="callout" v-if="item.unverifiedAssumption"><text>未经验证的假设</text><text>{{ item.unverifiedAssumption }}</text></view><view class="action"><text>下一步</text><text>{{ item.actionableFix }}</text></view></view>
				</view>

				<view class="view-sheet" v-if="viewType === 'entropy'">
					<view class="view-heading"><text>02</text><view><text>熵增 / 熵减</text><text>观察秩序、能量与系统走向</text></view></view>
					<view class="analysis-block" v-for="(item,index) in currentView.events || []" :key="index"><view class="event-title"><text>{{ item.event }}</text><text :class="item.state">{{ stateLabel(item.state) }}</text></view><text class="block-body">{{ item.prediction }}</text><view class="chips"><text v-for="source in item.entropySources || []" :key="source">{{ source }}</text></view><view class="action"><text>熵减动作</text><text>{{ item.action }}</text></view></view>
				</view>

				<view class="view-sheet" v-if="viewType === 'compound'">
					<view class="view-heading"><text>03</text><view><text>人生复利</text><text>哪些在积累，哪些在消耗存量</text></view></view>
					<view class="split-list"><view><text>复利增强</text><text v-for="(item,index) in currentView.compounders || []" :key="index">＋ {{ item }}</text></view><view class="erosion"><text>复利削弱</text><text v-for="(item,index) in currentView.eroders || []" :key="index">－ {{ item }}</text></view></view>
					<view class="analysis-block" v-for="(item,index) in currentView.ruleCheck || []" :key="index"><text class="block-label">{{ item.rule }}</text><text class="block-body">{{ item.evidence }}</text><text class="rule-state">{{ ruleLabel(item.status) }}</text></view>
					<view class="new-rules" v-if="currentView.newRules && currentView.newRules.length"><text>可沉淀的新规则</text><text v-for="(item,index) in currentView.newRules" :key="index">{{ item }}</text></view>
				</view>

				<view class="view-sheet" v-if="viewType === 'life_os'">
					<view class="view-heading"><text>04</text><view><text>人生 OS 对照</text><text>只检查今天真正触发的规则</text></view></view>
					<view class="os-empty" v-if="currentView.disabled"><text>还没有人生 OS</text><text>先写下你的原则与边界，这个视角才有真实的对照依据。</text><view @tap="openLifeOs">去配置人生 OS　›</view></view>
					<view v-else><view class="analysis-block followed" v-for="item in currentView.followed || []" :key="item.rule"><text class="block-label">✓ {{ item.rule }}</text><text class="block-body">{{ item.evidence }}</text></view><view class="analysis-block violated" v-for="item in currentView.violated || []" :key="item.rule"><text class="block-label">△ {{ item.rule }}</text><text class="block-body">{{ item.evidence }}</text><view class="action" v-if="item.remediation"><text>补救动作</text><text>{{ item.remediation }}</text></view></view></view>
				</view>

				<view class="view-sheet" v-if="viewType === 'biological'">
					<view class="view-heading"><text>05</text><view><text>生物驱动观察席</text><text>识别奖励结构，而不是评价意志</text></view></view>
					<view class="os-empty" v-if="currentView.skipped"><text>今天没有明显触发</text><text>日记中没有足够证据表明存在重复性或情绪驱动行为。</text></view>
					<view v-else><view class="essence"><text>本质问题</text><text>{{ currentView.essence }}</text><text>{{ currentView.riskState }}</text></view><view class="analysis-block" v-for="(item,index) in currentView.strategies || []" :key="index"><text class="block-label">{{ item.type }}</text><text class="block-body">{{ item.action }}</text></view><view class="new-rules" v-if="currentView.reflectionQuestions && currentView.reflectionQuestions.length"><text>下次先问自己</text><text v-for="(item,index) in currentView.reflectionQuestions" :key="index">{{ item }}</text></view></view>
				</view>

				<view class="view-sheet custom-view" v-if="viewType === 'custom'">
					<view class="view-heading"><text>{{ activeTab ? activeTab.index : '—' }}</text><view><text>{{ currentObserver.name }}</text><text>{{ currentObserver.description || '你的自定义观察角度' }}</text></view></view>
					<text class="custom-title" v-if="currentView.title">{{ currentView.title }}</text>
					<text class="custom-summary" v-if="currentView.summary">{{ currentView.summary }}</text>
					<view class="analysis-block" v-for="(item,index) in currentView.observations || []" :key="index"><text class="block-label">{{ item.title || ('观察 ' + (index + 1)) }}</text><view class="callout" v-if="item.evidence"><text>日记依据</text><text>{{ item.evidence }}</text></view><text class="block-body">{{ item.interpretation }}</text></view>
					<view class="new-rules" v-if="currentView.questions && currentView.questions.length"><text>继续问自己</text><text v-for="(item,index) in currentView.questions" :key="index">{{ item }}</text></view>
					<view class="action" v-if="currentView.nextStep"><text>可以尝试</text><text>{{ currentView.nextStep }}</text></view>
				</view>

				<view class="cost-card" v-if="analysis.costSummary && analysis.costSummary.calls">
					<view><text>本次 AI 用量</text><text>{{ analysis.costSummary.calls }} 次调用 · {{ formatTokens(analysis.costSummary.totalTokens) }} tokens</text></view>
					<view><text>{{ formatBilling(analysis.costSummary) }}</text><text>实际 Token 如实记录 · 失败不扣菇点</text></view>
				</view>

				<view class="wellbeing-section" v-if="wellbeingRecord">
					<view class="wellbeing-heading"><text>这篇留下了身心变化</text><text>与原有日记分析同一次提取，没有增加一次模型调用；它与你是否创建未解之问无关，确认后才成为长期记录。</text></view>
					<view class="wellbeing-body"><text>{{ healthObservationText(wellbeingRecord.observation) }}</text><text v-if="wellbeingRecord.sourceExcerpt">“{{ wellbeingRecord.sourceExcerpt }}”</text></view>
					<view v-if="wellbeingDetails.length" class="wellbeing-details">
						<view v-for="(item, index) in wellbeingDetails" :key="index"><text>{{ item.label }}</text><text>{{ item.text }}</text><text v-if="item.uncertain" class="uncertain-mark">原文不确定</text></view>
					</view>
					<view v-if="wellbeingRecord.redFlags && wellbeingRecord.redFlags.length" class="wellbeing-alert">
						<text>需要优先关注的原文信号</text><view v-for="(item, index) in wellbeingRecord.redFlags" :key="index"><text>{{ item.signal }}</text><text>{{ item.action }}</text></view><text>这是安全提醒，不是医学诊断。</text>
					</view>
					<view v-if="wellbeingRecord.missingInformation && wellbeingRecord.missingInformation.length" class="wellbeing-missing"><text>以后如果顺手，可以补充</text><text v-for="(item, index) in wellbeingRecord.missingInformation" :key="index">· {{ item }}</text></view>
					<view v-if="wellbeingRecord.status === 'PENDING'" class="wellbeing-actions"><button :disabled="processingWellbeing" @tap="updateWellbeing('dismiss')">不是身心记录</button><button :disabled="processingWellbeing" @tap="updateWellbeing('confirm')">确认这条观察</button></view>
					<button v-else class="wellbeing-open" @tap="openWellbeing">✓ 已保存到身心记录 · 查看</button>
				</view>

				<view class="inquiry-section" v-if="inquiryCandidates.length">
					<view class="inquiry-heading"><text>这篇留下了还没想明白的事吗？</text><text>这只是 AI 提出的候选。只有你确认后，才会成为持续观察的问题。</text></view>
					<view class="inquiry-candidate" v-for="item in inquiryCandidates" :key="item.id">
						<text class="inquiry-mark">?</text>
						<view class="inquiry-copy"><text v-if="item.inquiryType !== 'GENERAL'" class="health-candidate-label">{{ inquiryTypeLabel(item.inquiryType) }} · 从日记原文独立积累证据</text><text>{{ item.question }}</text><text v-if="item.context">{{ item.context }}</text>
							<view class="inquiry-actions" v-if="item.status === 'PENDING'">
								<button class="inquiry-ignore" :disabled="processingInquiryId === item.id" @tap="ignoreInquiryCandidate(item)">忽略</button>
								<button class="inquiry-accept" :disabled="processingInquiryId === item.id" @tap="acceptInquiryCandidate(item)">{{ item.suggestedInquiryId ? '关联已有问题' : '开始观察问题' }}</button>
							</view>
							<button class="inquiry-open" v-else-if="item.acceptedInquiryId" @tap="openInquiry(item.acceptedInquiryId)">✓ 已开始观察 · 查看问题</button>
						</view>
					</view>
					</view>

					<view class="life-os-links" v-if="compoundLinks.length">
						<view class="life-os-links-head"><view><text>与复利系统的 {{ compoundLinks.length }} 个方向有关</text><text>这只是可纠正的 AI 关联；进入后才能把它接入正在推进的事。</text></view><text @tap="openCompound">进入复利系统　›</text></view>
						<view v-for="link in compoundLinks" :key="link.id" class="life-os-link">
							<view class="life-os-link-title" @tap="openLifeOsItem(link)"><text>{{ link.itemKey }} · {{ link.itemName }}</text><text>AI 关联　›</text></view>
							<text class="life-os-evidence">“{{ link.evidenceExcerpt }}”</text>
							<text class="life-os-summary" v-if="link.summary">{{ link.summary }}</text>
							<view class="life-os-types"><button v-for="type in lifeOsRecordTypes" :key="type.value" :class="{ active: link.recordType === type.value }" @tap="changeLifeOsLinkType(link, type.value)">{{ type.label }}</button></view>
							<view class="life-os-next" v-if="link.suggestedNextStep"><text>可选下一步</text><text>{{ link.suggestedNextStep }}</text></view>
							<button class="life-os-unlink" @tap="removeLifeOsLink(link)">取消关联</button>
						</view>
					</view>

					<view class="card-section" v-if="cardSuggestion">
					<view class="card-heading">
						<view><text>从经历到菇卡</text><text>AI 只提出建议，由你决定是否沉淀或关联。</text></view>
						<text>{{ cardSuggestion.shouldCreate ? '建议沉淀' : '不必新建' }}</text>
					</view>
					<text class="card-reason">{{ cardSuggestion.reason }}</text>

					<view class="new-card-draft" v-if="cardSuggestion.shouldCreate && cardSuggestion.newCard">
						<text class="draft-label">AI 建议的私密草案</text>
						<text class="draft-seed">{{ cardSuggestion.newCard.seedSentence }}</text>
						<text class="draft-understanding" v-if="cardSuggestion.newCard.myUnderstanding">{{ cardSuggestion.newCard.myUnderstanding }}</text>
						<view class="draft-usage" v-if="cardSuggestion.newCard.usageItems && cardSuggestion.newCard.usageItems.length">
							<text v-for="(item,index) in cardSuggestion.newCard.usageItems" :key="index">{{ index + 1 }}. {{ item }}</text>
						</view>
						<view class="draft-tags" v-if="cardSuggestion.newCard.tags && cardSuggestion.newCard.tags.length"><text v-for="tag in cardSuggestion.newCard.tags" :key="tag">#{{ tag }}</text></view>
						<view class="card-action completed" v-if="cardSuggestion.createdCardId" @tap="viewCreatedCard">✓ 已创建并关联 · 查看菇卡</view>
						<view class="card-action" :class="{ disabled: creatingCard }" v-else @tap="createSuggestedCard">{{ creatingCard ? '创建中…' : '确认创建为私密菇卡' }}</view>
					</view>

					<view class="existing-card-list" v-if="cardMatches.length">
						<view class="existing-heading"><text>可能相关的历史菇卡</text><text>选择后关联到这篇日记</text></view>
						<view class="existing-card" :class="{ selected: item.selected, bound: isCardBound(item.cardId) }" v-for="item in cardMatches" :key="item.cardId" @tap="toggleCardMatch(item)">
							<view class="candidate-check">{{ isCardBound(item.cardId) || item.selected ? '✓' : '' }}</view>
							<view><text>{{ item.seedSentence }}</text><text>{{ isCardBound(item.cardId) ? '已关联' : (item.reason || '与这次经历相关') }}</text></view>
						</view>
						<view class="card-action bind-action" :class="{ disabled: !selectedCardCount || bindingCards }" @tap="bindSelectedCards">{{ bindingCards ? '关联中…' : `关联 ${selectedCardCount} 张历史菇卡` }}</view>
					</view>
				</view>
				<view class="card-section legacy-analysis" v-else>
					<text>这份分析来自旧版本</text><text>重新分析后，AI 才会判断是否值得创建新菇卡或关联历史菇卡。</text>
				</view>

					<view class="todo-section" v-if="candidates.length">
						<view class="todo-heading"><view><text>从理解到行动</text><text>只创建你亲自确认的事项</text></view><text>{{ selectedCount }} / {{ candidates.length }}</text></view>
						<view class="candidate" :class="{ selected: item.selected, created: item.createdTodoId }" v-for="(item,index) in candidates" :key="index" @tap="toggleCandidate(item)"><view class="candidate-check">{{ item.createdTodoId ? '✓' : (item.selected ? '✓' : '') }}</view><view><text>{{ item.title }}</text><text>{{ item.source || '分析建议' }}<template v-if="item.dueDate"> · {{ item.dueDate }}</template></text></view></view>
						<button class="primary-button todo-create-button" data-testid="create-analysis-todos" :class="{ disabled: !selectedCount || creatingTodos }" :disabled="!selectedCount || creatingTodos" @tap="createTodos">{{ creatingTodos ? '创建中…' : `创建 ${selectedCount} 项待办` }}</button>
						<view class="todo-created-notice" v-if="createdTodoNotice" @tap="openTodos"><text>{{ createdTodoNotice }}</text><text>查看待办　›</text></view>
				</view>
				<view class="rerun" @tap="confirmRerun">用当前观察席重新分析</view>
			</view>
		</view>
		<health-consent-sheet
			:visible="healthConsentVisible"
			:inquiry-type="healthConsentType"
			@cancel="resolveHealthConsent(false)"
			@confirm="resolveHealthConsent(true)"
		/>
	</view>
</template>

<script>
import { aiAnalysis, aiAnalyze, aiObservers, aiStatus, aiTask, lifeOsPlanLink } from '@/api/shroom-system';
import { inquiryCandidateAccept, inquiryCandidateIgnore } from '@/api/inquiry';
import HealthConsentSheet from '@/components/HealthConsentSheet.vue';
import { wellbeingStatus } from '@/api/wellbeing';

export default {
	components: { HealthConsentSheet },
		data() { return { statusBarHeight: 0, diaryId: '', autoStart: false, analysisEnabled: false, capabilityKnown: false, configuredObservers: [], analysis: null, activeView: '', pollTimer: null, pollCount: 0, candidates: [], cardMatches: [], inquiryCandidates: [], wellbeingRecord: null, processingWellbeing: false, compoundLinks: [], lifeOsRecordTypes: [{ value: 'PLAN', label: '计划' }, { value: 'ACTION', label: '行动' }, { value: 'RESULT', label: '结果' }, { value: 'OBSERVATION', label: '观察' }, { value: 'INQUIRY', label: '疑问' }], processingInquiryId: '', creatingTodos: false, createdTodoNotice: '', creatingCard: false, bindingCards: false, healthConsentVisible: false, healthConsentType: 'PSYCHOLOGICAL' }; },
	computed: {
		currentObservation() { return ((this.analysis && this.analysis.observations) || []).find(item => item.observer && item.observer.id === this.activeView) || {}; },
		currentObserver() { return this.currentObservation.observer || {}; },
		currentView() { return this.currentObservation.result || {}; },
		viewType() { return this.currentObserver.renderType || 'custom'; },
		activeTab() { return this.tabs.find(item => item.id === this.activeView) || null; },
		cardSuggestion() { return this.analysis && this.analysis.cardSuggestion ? this.analysis.cardSuggestion : null; },
		tabs() {
			return ((this.analysis && this.analysis.observations) || []).map((item, index) => ({ id: item.observer.id, index: String(index + 1).padStart(2, '0'), name: item.observer.shortName || item.observer.name, disabled: Boolean(item.result && item.result.disabled) }));
		},
		enabledObserverCount() { return this.configuredObservers.filter(item => item.enabled).length; },
		enabledObservers() { return this.configuredObservers.filter(item => item.enabled); },
		taskObserverCount() { return (this.analysis && this.analysis.observers && this.analysis.observers.length) || this.enabledObserverCount || 0; },
		selectedCount() { return this.candidates.filter(item => item.selected && !item.createdTodoId).length; },
		selectedCardCount() { return this.cardMatches.filter(item => item.selected && !this.isCardBound(item.cardId)).length; },
		wellbeingDetails() {
			const extraction = this.wellbeingRecord && this.wellbeingRecord.extraction || {};
			const result = [];
			const add = (items, label, value) => (Array.isArray(items) ? items : []).forEach(item => result.push({ label, text: value(item), uncertain: item.certainty === 'UNCERTAIN' }));
			add(extraction.psychologicalObservations, '心理', item => item.observation);
			add(extraction.physicalObservations, '身体', item => [item.symptom, item.bodyAreas && item.bodyAreas.join('、'), item.severity !== null && item.severity !== undefined ? `程度 ${item.severity}/10` : ''].filter(Boolean).join(' · '));
			add(extraction.lifestyleFactors, '生活', item => item.factor);
			add(extraction.environmentFactors, '环境', item => item.observation);
			return result.slice(0, 16);
		}
	},
	onLoad(options) { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; this.diaryId = options.diaryId || ''; this.autoStart = options.autoStart === '1'; this.load(); },
	onUnload() { this.stopPolling(); this.resolveHealthConsent(false); },
	methods: {
		async load() {
			try {
				const [status, existing, observers] = await Promise.all([this.$http.get(aiStatus), this.$http.get(aiAnalysis, { diaryId: this.diaryId }), this.$http.get(aiObservers)]);
				this.analysisEnabled = Boolean(status.data && status.data.enabled); this.capabilityKnown = true;
				this.configuredObservers = Array.isArray(observers.data) ? observers.data : [];
				if (existing.data) { this.acceptAnalysis(existing.data); if (['pending', 'running'].includes(existing.data.status)) this.startPolling(); }
				if (this.autoStart && this.analysisEnabled && (!existing.data || !['pending', 'running'].includes(existing.data.status))) { this.autoStart = false; this.startAnalysis(); }
			} catch (error) { this.capabilityKnown = true; console.error('加载分析状态失败', error); }
		},
		acceptAnalysis(value) { this.analysis = value; const observations = value.observations || []; if (!observations.some(item => item.observer && item.observer.id === this.activeView)) this.activeView = observations[0] && observations[0].observer ? observations[0].observer.id : ''; this.candidates = (value.todoCandidates || []).map(item => ({ ...item, selected: !item.createdTodoId })); this.cardMatches = ((value.cardSuggestion && value.cardSuggestion.existingMatches) || []).map(item => ({ ...item, selected: false })); this.inquiryCandidates = Array.isArray(value.inquiryCandidates) ? value.inquiryCandidates : []; this.wellbeingRecord = value.wellbeingRecord || null; this.compoundLinks = Array.isArray(value.compoundLinks) ? value.compoundLinks : (Array.isArray(value.lifeOsLinks) ? value.lifeOsLinks : []); },
		async startAnalysis() {
			if (!this.analysisEnabled) return;
			this.stopPolling();
			try { const res = await this.$http.post(aiAnalyze, { diaryId: this.diaryId, sync: false }); this.acceptAnalysis(res.data); this.pollCount = 0; this.startPolling(); }
			catch (error) { console.error('启动观察席分析失败', error); }
		},
		startPolling() { this.stopPolling(); this.pollTimer = setTimeout(() => this.poll(), 1600); },
		stopPolling() { if (this.pollTimer) clearTimeout(this.pollTimer); this.pollTimer = null; },
		async poll() {
			if (!this.analysis || !this.analysis.taskId) return;
			try { const res = await this.$http.get(`${aiTask}/${this.analysis.taskId}`); this.acceptAnalysis(res.data); if (['pending', 'running'].includes(res.data.status) && this.pollCount < 100) { this.pollCount += 1; this.startPolling(); } }
			catch (error) { console.error('查询分析进度失败', error); this.startPolling(); }
		},
		selectView(tab) { this.activeView = tab.id; },
		stateLabel(value) { return { entropy_increase: '熵增', entropy_decrease: '熵减', boundary: '边界' }[value] || value; },
		ruleLabel(value) { return { followed: '本次遵循', violated: '本次偏离', not_covered: '尚未覆盖' }[value] || value; },
		formatTokens(value) { return Number(value || 0).toLocaleString(); },
		formatCost(summary) {
			if (!summary || !summary.estimated || summary.costCny === null) return '暂时无法估价';
			const cost = Number(summary.costCny);
			return '约 ¥' + cost.toFixed(cost >= 0.01 ? 2 : 4);
		},
		formatBilling(summary) {
			if (summary && Number(summary.chargedPoints || 0) > 0) return `已扣 ${Number(summary.chargedPoints).toFixed(2).replace(/\.00$/, '')} 菇点`;
			return this.formatCost(summary);
		},
		sourceActivityMeta(item) {
			const parts = [];
			if (item.projectName) parts.push(item.projectName);
			if (item.turnCount) parts.push(`${item.turnCount} 个对话轮次`);
			return parts.join(' · ');
		},
		toggleCandidate(item) { if (!item.createdTodoId) item.selected = !item.selected; },
			async createTodos() {
				if (!this.selectedCount || this.creatingTodos) return;
				this.creatingTodos = true;
				this.createdTodoNotice = '';
				try {
					const indexes = this.candidates.map((item, index) => item.selected && !item.createdTodoId ? index : -1).filter(index => index >= 0);
					const res = await this.$http.post(`${aiTask}/${this.analysis.taskId}/todos`, { indexes });
					const createdItems = (res.data && Array.isArray(res.data.items)) ? res.data.items : [];
					const returnedCandidates = res.data && Array.isArray(res.data.todoCandidates) ? res.data.todoCandidates : null;
					if (returnedCandidates) this.candidates = returnedCandidates.map(item => ({ ...item, selected: false }));
					this.createdTodoNotice = createdItems.length ? `已创建 ${createdItems.length} 项待办` : '选中的待办已经创建过';
					uni.showToast({ title: this.createdTodoNotice, icon: createdItems.length ? 'success' : 'none' });
				} catch (error) {
					console.error('创建分析待办失败', error);
					uni.showToast({ title: typeof error === 'string' ? error : '待办没有创建成功', icon: 'none' });
				}
				finally { this.creatingTodos = false; }
			},
			openTodos() { uni.navigateTo({ url: '/pages/todo/list' }); },
		isCardBound(cardId) { return Boolean(this.cardSuggestion && Array.isArray(this.cardSuggestion.boundCardIds) && this.cardSuggestion.boundCardIds.includes(cardId)); },
		toggleCardMatch(item) { if (!this.isCardBound(item.cardId)) item.selected = !item.selected; },
		async createSuggestedCard() {
			if (!this.analysis || !this.analysis.taskId || !this.cardSuggestion || !this.cardSuggestion.shouldCreate || this.cardSuggestion.createdCardId || this.creatingCard) return;
			this.creatingCard = true;
			try {
				const res = await this.$http.post(`${aiTask}/${this.analysis.taskId}/cards/create`, {});
				this.acceptAnalysis(res.data.analysis);
				uni.showToast({ title: '菇卡已创建并关联', icon: 'success' });
			} catch (error) { console.error('创建建议菇卡失败', error); }
			finally { this.creatingCard = false; }
		},
		async bindSelectedCards() {
			if (!this.analysis || !this.analysis.taskId || !this.selectedCardCount || this.bindingCards) return;
			this.bindingCards = true;
			try {
				const cardIds = this.cardMatches.filter(item => item.selected && !this.isCardBound(item.cardId)).map(item => item.cardId);
				const res = await this.$http.post(`${aiTask}/${this.analysis.taskId}/cards/bind`, { cardIds });
				this.acceptAnalysis(res.data.analysis);
				uni.showToast({ title: `已关联 ${res.data.cardIds.length} 张`, icon: 'success' });
			} catch (error) { console.error('关联历史菇卡失败', error); }
			finally { this.bindingCards = false; }
		},
			async acceptInquiryCandidate(item) {
				if (!item || !item.id || this.processingInquiryId) return;
				const isHealth = item.inquiryType === 'PSYCHOLOGICAL' || item.inquiryType === 'PHYSICAL_HEALTH';
				const healthConsent = isHealth ? await this.confirmHealthConsent(item.inquiryType) : false;
				if (isHealth && !healthConsent) return;
				this.processingInquiryId = item.id;
				try {
					const res = await this.$http.post(inquiryCandidateAccept(item.id), { healthConsent });
				item.status = 'ACCEPTED';
				item.acceptedInquiryId = res.data.inquiryId;
				uni.showToast({ title: res.data.created ? '问题已开始观察' : '已关联已有问题', icon: 'success' });
			} catch (error) { console.error('确认未解之问候选失败', error); }
				finally { this.processingInquiryId = ''; }
			},
			async updateWellbeing(action) {
				if (!this.wellbeingRecord || this.processingWellbeing) return;
				this.processingWellbeing = true;
				try {
					const res = await this.$http.post(wellbeingStatus(this.wellbeingRecord.id), { action });
					this.wellbeingRecord = action === 'dismiss' ? null : res.data;
					uni.showToast({ title: action === 'confirm' ? '已保存到身心记录' : '已忽略', icon: action === 'confirm' ? 'success' : 'none' });
				} catch (error) { console.error('更新身心记录失败', error); }
				finally { this.processingWellbeing = false; }
			},
			confirmHealthConsent(inquiryType) {
				this.healthConsentType = inquiryType;
				this.healthConsentVisible = true;
				return new Promise(resolve => { this._healthConsentResolver = resolve; });
			},
			resolveHealthConsent(confirmed) {
				this.healthConsentVisible = false;
				const resolve = this._healthConsentResolver;
				this._healthConsentResolver = null;
				if (resolve) resolve(Boolean(confirmed));
			},
			inquiryTypeLabel(value) { return value === 'PHYSICAL_HEALTH' ? '身体健康观察' : '心理观察'; },
			healthObservationText(value) {
				if (!value || typeof value !== 'object') return '';
				const parts = [];
				if (value.psychologicalFeelings && value.psychologicalFeelings.length) parts.push(value.psychologicalFeelings.join('、'));
				if (value.physicalSymptoms && value.physicalSymptoms.length) parts.push(value.physicalSymptoms.join('、'));
				if (value.bodyAreas && value.bodyAreas.length) parts.push(`部位：${value.bodyAreas.join('、')}`);
				if (value.severity !== null && value.severity !== undefined) parts.push(`程度 ${value.severity}/10`);
				return parts.join(' · ');
			},
		async ignoreInquiryCandidate(item) {
			if (!item || !item.id || this.processingInquiryId) return;
			this.processingInquiryId = item.id;
			try {
				await this.$http.post(inquiryCandidateIgnore(item.id), {});
				this.inquiryCandidates = this.inquiryCandidates.filter(candidate => candidate.id !== item.id);
				uni.showToast({ title: '已忽略', icon: 'none' });
			} catch (error) { console.error('忽略未解之问候选失败', error); }
			finally { this.processingInquiryId = ''; }
		},
		openInquiry(inquiryId) { if (inquiryId) uni.navigateTo({ url: `/pages/shroom/inquiry?id=${inquiryId}` }); },
		openWellbeing() { uni.navigateTo({ url: '/pages/shroom/wellbeing' }); },
		async changeLifeOsLinkType(link, recordType) {
			if (!link || link.recordType === recordType) return;
			try { await this.$http.patch(lifeOsPlanLink(link.id), { recordType }); link.recordType = recordType; link.userConfirmed = true; uni.showToast({ title: '记录类型已纠正', icon: 'success' }); }
			catch (error) { console.error('纠正复利方向关联失败', error); }
		},
		removeLifeOsLink(link) {
			uni.showModal({ title: '取消这条关联？', content: '不会删除日记、复利方向或人生 OS 原则。', confirmText: '取消关联', success: async result => { if (!result.confirm) return; try { await this.$http.delete(lifeOsPlanLink(link.id)); this.compoundLinks = this.compoundLinks.filter(item => item.id !== link.id); } catch (error) { console.error('取消复利方向关联失败', error); } } });
		},
		openLifeOsItem(link) { if (link && link.itemKey) uni.navigateTo({ url: `/pages/shroom/life-os-item?key=${link.itemKey}` }); },
		openCompound() { uni.navigateTo({ url: '/pages/shroom/compound' }); },
		viewCreatedCard() { if (this.cardSuggestion && this.cardSuggestion.createdCardId) uni.navigateTo({ url: `/pages/common/cards/detail?id=${this.cardSuggestion.createdCardId}` }); },
		confirmRerun() { uni.showModal({ title: '重新分析？', content: '将使用当前启用的观察席和最新日记覆盖本次分析结果。成功后按本次实际 Token 成本 × 2.5 扣菇点；失败不扣费。', confirmText: '重新分析', success: result => { if (result.confirm) this.startAnalysis(); } }); },
		openObservers() { uni.navigateTo({ url: '/pages/shroom/observers' }); },
		openLifeOs() { uni.navigateTo({ url: '/pages/shroom/life-os' }); },
		goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/diary/index' }) }); else uni.switchTab({ url: '/pages/diary/index' }); }
	}
};
</script>

<style lang="scss" scoped>
button {
	margin: 0;
	padding: 0;
	line-height: 1;
	background: transparent;
	border: 0;
}
button::after { border: 0; }
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: #f1f8e9; }
.shell { box-sizing: border-box; padding: 32rpx 34rpx 125rpx; }
.header { display: flex; align-items: flex-start; gap: 20rpx; }
.back { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.7); font-size: 50rpx; }
.heading { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.kicker { font-size: 16rpx; font-weight: 700; letter-spacing: 2.5rpx; color: #718075; }
.title { margin-top: 9rpx; font-size: 40rpx; font-weight: 740; }
.subtitle { margin-top: 10rpx; font-size: 20rpx; color: #718075; }
.privacy { display: flex; align-items: flex-start; gap: 13rpx; margin-top: 35rpx; padding: 21rpx 24rpx; border-radius: 23rpx; background: #e1ebd9; font-size: 18rpx; line-height: 1.55; color: #55665a; }
.privacy-dot { width: 9rpx; height: 9rpx; margin-top: 9rpx; flex: 0 0 9rpx; border-radius: 50%; background: #5d7562; }
.empty-state, .unavailable, .running-state { display: flex; min-height: 520rpx; margin-top: 23rpx; padding: 38rpx; box-sizing: border-box; flex-direction: column; justify-content: flex-end; border-radius: 35rpx; background: #172019; color: #fff; }
.unavailable { background: #ede8d7; color: #292d27; }
.state-index { font-size: 17rpx; font-weight: 710; letter-spacing: 2.7rpx; color: #9fad9f; }
.unavailable .state-index { color: #817a62; }
.state-title { margin-top: 21rpx; font-size: 32rpx; font-weight: 720; line-height: 1.4; }
.state-copy { margin-top: 15rpx; font-size: 21rpx; line-height: 1.7; color: #b7c3b7; }
.unavailable .state-copy { color: #6d6959; }
.primary-button { margin-top: 29rpx; padding: 25rpx; border-radius: 999rpx; background: #e5efd9; text-align: center; font-size: 22rpx; font-weight: 700; color: #172019; }
.charge-note { display: block; margin-top: 16rpx; text-align: center; font-size: 16rpx; line-height: 1.55; color: #9eada0; }
.retry-note { color: #77725f; }
.observer-preview { display: flex; flex-wrap: wrap; gap: 9rpx; margin-top: 24rpx; }
.observer-preview text { padding: 8rpx 13rpx; border: 1rpx solid rgba(255,255,255,.15); border-radius: 999rpx; font-size: 17rpx; color: #c4d0c3; }
.manage-link { margin-top: 20rpx; text-align: center; font-size: 19rpx; color: #abbbaa; }
.unavailable .primary-button, .todo-section .primary-button { background: #172019; color: #fff; }
	.primary-button.disabled { opacity: .45; }
	.todo-create-button { width: 100%; box-sizing: border-box; line-height: 1.2; }
	.todo-created-notice { display: flex; align-items: center; justify-content: space-between; margin-top: 14rpx; padding: 20rpx 22rpx; border-radius: 18rpx; background: #dfead7; color: #405343; font-size: 19rpx; font-weight: 650; }
.running-state { align-items: center; justify-content: center; text-align: center; }
.orbit { display: flex; width: 100rpx; height: 100rpx; align-items: center; justify-content: center; border: 2rpx solid rgba(255,255,255,.18); border-radius: 50%; }
.orbit view { width: 39rpx; height: 39rpx; border-radius: 50%; background: #dce9d5; box-shadow: 0 0 0 18rpx rgba(220,233,213,.08); }
.running-label { margin-top: 25rpx; font-size: 17rpx; font-weight: 700; letter-spacing: 2rpx; color: #aab8aa; }
.lens-scroll { width: 100%; margin-top: 27rpx; white-space: nowrap; }
.lens-tabs { display: inline-flex; gap: 11rpx; padding-right: 30rpx; }
.lens-tabs > view { display: inline-flex; padding: 16rpx 19rpx; flex-direction: column; gap: 5rpx; border-radius: 21rpx; background: rgba(255,255,255,.72); color: #6d796f; }
.lens-tabs > view text:first-child { font-size: 14rpx; font-weight: 710; letter-spacing: 1rpx; }
.lens-tabs > view text:last-child { font-size: 20rpx; font-weight: 670; }
.lens-tabs > view.active { background: #172019; color: #fff; }
.lens-tabs > view.disabled { opacity: .55; }
.view-sheet { margin-top: 19rpx; padding: 30rpx; border-radius: 33rpx; background: #fff; }
.custom-title { display: block; margin-top: 28rpx; font-family: Georgia, 'Songti SC', serif; font-size: 31rpx; line-height: 1.45; }
.custom-summary { display: block; margin-top: 16rpx; font-size: 22rpx; line-height: 1.7; color: #5d695e; }
.cost-card { margin-top: 18rpx; padding: 24rpx 27rpx; display: flex; align-items: center; justify-content: space-between; gap: 20rpx; border: 1rpx solid rgba(23,32,25,.07); border-radius: 25rpx; background: rgba(255,255,255,.6); }
.cost-card > view { display: flex; flex-direction: column; gap: 7rpx; }
.cost-card > view:last-child { text-align: right; }
.cost-card > view:first-child text:first-child, .cost-card > view:last-child text:first-child { font-size: 20rpx; font-weight: 690; color: #3f5042; }
.cost-card > view:first-child text:last-child, .cost-card > view:last-child text:last-child { font-size: 16rpx; color: #829083; }
.wellbeing-section { margin-top: 24rpx; padding: 28rpx; border: 1rpx solid rgba(79,96,48,.13); border-radius: 28rpx; background: #e5ecd3; color: #172019; }
.wellbeing-heading { display: flex; flex-direction: column; }
.wellbeing-heading text:first-child { font-size: 26rpx; font-weight: 720; }
.wellbeing-heading text:last-child { margin-top: 8rpx; color: #6b7563; font-size: 18rpx; line-height: 1.55; }
.wellbeing-body { margin-top: 20rpx; padding-top: 20rpx; border-top: 1rpx solid rgba(23,32,25,.08); display: flex; flex-direction: column; }
.wellbeing-body text:first-child { font-family: Georgia, 'Songti SC', serif; font-size: 24rpx; line-height: 1.6; }
.wellbeing-body text:last-child { display: -webkit-box; margin-top: 10rpx; color: #747d72; font-size: 17rpx; line-height: 1.55; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.wellbeing-details { display: flex; flex-direction: column; gap: 10rpx; margin-top: 17rpx; }
.wellbeing-details > view { display: flex; align-items: flex-start; gap: 10rpx; font-size: 18rpx; line-height: 1.5; }
.wellbeing-details > view > text:first-child { flex: 0 0 auto; padding: 5rpx 9rpx; border-radius: 10rpx; background: rgba(255,255,255,.55); color: #657052; font-size: 14rpx; }
.wellbeing-details > view > text:nth-child(2) { min-width: 0; flex: 1; }
.uncertain-mark { flex: 0 0 auto; color: #956744; font-size: 14rpx; }
.wellbeing-alert { margin-top: 18rpx; padding: 18rpx; border-radius: 18rpx; background: #f3ded7; display: flex; flex-direction: column; }
.wellbeing-alert > text:first-child { color: #81483e; font-size: 18rpx; font-weight: 700; }
.wellbeing-alert > view { display: flex; flex-direction: column; gap: 6rpx; margin-top: 13rpx; }
.wellbeing-alert > view text:first-child { color: #65362f; font-size: 20rpx; font-weight: 650; }
.wellbeing-alert > view text:last-child, .wellbeing-alert > text:last-child { color: #855e56; font-size: 16rpx; line-height: 1.55; }
.wellbeing-alert > text:last-child { margin-top: 13rpx; }
.wellbeing-missing { margin-top: 18rpx; padding: 17rpx; border-radius: 17rpx; background: rgba(255,255,255,.46); display: flex; flex-direction: column; gap: 7rpx; color: #697362; font-size: 17rpx; line-height: 1.5; }
.wellbeing-missing text:first-child { color: #4f5e48; font-weight: 700; }
.wellbeing-actions { display: flex; justify-content: flex-end; gap: 11rpx; margin-top: 20rpx; }
.wellbeing-actions button, .wellbeing-open { min-height: 58rpx; padding: 0 19rpx; border: 1rpx solid rgba(23,32,25,.15); border-radius: 30rpx; display: flex; align-items: center; justify-content: center; color: #667064; font-size: 17rpx; }
.wellbeing-actions button:last-child { border-color: #172019; background: #172019; color: white; font-weight: 700; }
.wellbeing-open { align-self: flex-start; margin-top: 18rpx; border-color: transparent; background: rgba(255,255,255,.55); color: #52613c; }
.inquiry-section { margin-top: 24rpx; padding: 30rpx; border-radius: 31rpx; background: #172019; color: #fff; }
.inquiry-heading { display: flex; flex-direction: column; gap: 8rpx; }
.inquiry-heading text:first-child { font-size: 27rpx; font-weight: 720; line-height: 1.45; }
.inquiry-heading text:last-child { font-size: 18rpx; line-height: 1.55; color: #aebaae; }
.inquiry-candidate { display: flex; align-items: flex-start; gap: 18rpx; margin-top: 23rpx; padding-top: 23rpx; border-top: 1rpx solid rgba(255,255,255,.1); }
.inquiry-mark { display: flex; width: 46rpx; height: 46rpx; flex: 0 0 46rpx; align-items: center; justify-content: center; border-radius: 50%; background: #dfe9bd; color: #263027; font-family: Georgia, serif; font-size: 25rpx; }
.inquiry-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.inquiry-copy > text { font-family: Georgia, 'Songti SC', serif; font-size: 25rpx; line-height: 1.55; }
.inquiry-copy > text + text { margin-top: 10rpx; }
.inquiry-copy .health-candidate-label { align-self: flex-start; margin: 0 0 9rpx; padding: 7rpx 11rpx; border-radius: 18rpx; background: rgba(214,230,169,.13); color: #cce09d; font-family: inherit; font-size: 16rpx; line-height: 1.4; }
.inquiry-copy .health-candidate-observation { padding: 11rpx 13rpx; border-radius: 13rpx; background: rgba(255,255,255,.07); color: #aebbae; font-family: inherit; font-size: 17rpx; line-height: 1.55; }
.inquiry-actions { display: flex; justify-content: flex-end; gap: 12rpx; margin-top: 20rpx; }
.inquiry-ignore, .inquiry-accept, .inquiry-open { min-height: 58rpx; padding: 0 21rpx; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; font-size: 18rpx; line-height: 1.2; }
.inquiry-ignore { border: 1rpx solid rgba(255,255,255,.2); color: #c4cec5; }
.inquiry-accept { background: #e5efd9; color: #172019; font-weight: 700; }
.inquiry-open { align-self: flex-start; margin-top: 18rpx; background: rgba(229,239,217,.13); color: #e0eadc; }
.inquiry-ignore[disabled], .inquiry-accept[disabled] { opacity: .45; }
.life-os-links { margin-top: 24rpx; padding: 30rpx; border-radius: 31rpx; background: #e4eccd; color: #1e2820; }
.life-os-links-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18rpx; }
.life-os-links-head > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }
.life-os-links-head > view text:first-child { font-family: Georgia, 'Songti SC', serif; font-size: 26rpx; font-weight: 700; }
.life-os-links-head > view text:last-child { color: #637060; font-size: 17rpx; line-height: 1.5; }
.life-os-links-head > text { flex: 0 0 auto; color: #596a59; font-size: 16rpx; }
.life-os-link { margin-top: 21rpx; padding-top: 20rpx; border-top: 1rpx solid rgba(23,32,25,.1); }
.life-os-link-title { display: flex; justify-content: space-between; gap: 14rpx; }.life-os-link-title text:first-child { font-size: 20rpx; font-weight: 700; }.life-os-link-title text:last-child { color: #6c786b; font-size: 15rpx; }
.life-os-evidence { display: block; margin-top: 12rpx; font-family: Georgia, 'Songti SC', serif; font-size: 20rpx; line-height: 1.55; }.life-os-summary { display: block; margin-top: 8rpx; color: #657064; font-size: 17rpx; line-height: 1.5; }
.life-os-types { display: flex; flex-wrap: wrap; gap: 7rpx; margin-top: 15rpx; }.life-os-types button { padding: 9rpx 13rpx; border-radius: 999rpx; background: rgba(255,255,255,.58); color: #687467; font-size: 15rpx; }.life-os-types button.active { background: #172019; color: #fff; }
.life-os-next { display: flex; margin-top: 14rpx; padding: 13rpx 15rpx; flex-direction: column; gap: 6rpx; border-radius: 15rpx; background: rgba(255,255,255,.55); }.life-os-next text:first-child { color: #748071; font-size: 14rpx; font-weight: 700; }.life-os-next text:last-child { font-size: 17rpx; line-height: 1.5; }.life-os-unlink { margin-top: 14rpx; color: #8b6258; font-size: 15rpx; }
.view-heading { display: flex; align-items: center; gap: 20rpx; padding-bottom: 26rpx; border-bottom: 1rpx solid #e8ede6; }
.view-heading > text { font-size: 47rpx; font-weight: 760; color: #d4ded0; }
.view-heading > view { display: flex; flex-direction: column; gap: 6rpx; }
.view-heading > view text:first-child { font-size: 28rpx; font-weight: 720; }
.view-heading > view text:last-child { font-size: 18rpx; color: #768279; }
.analysis-block { position: relative; margin-top: 20rpx; padding: 24rpx; border-radius: 24rpx; background: #f4f7f1; }
.block-label, .block-body { display: block; }
.block-label { font-size: 23rpx; font-weight: 700; line-height: 1.5; }
.block-body { margin-top: 11rpx; font-size: 20rpx; line-height: 1.65; color: #5e6a61; }
.callout, .action { display: flex; margin-top: 17rpx; padding: 17rpx; flex-direction: column; gap: 7rpx; border-radius: 17rpx; background: #eee9d9; }
.action { background: #dfead7; }
.callout text:first-child, .action text:first-child { font-size: 16rpx; font-weight: 700; letter-spacing: 1rpx; color: #746c54; }
.action text:first-child { color: #536858; }
.callout text:last-child, .action text:last-child { font-size: 20rpx; line-height: 1.55; }
.event-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; font-size: 23rpx; font-weight: 690; }
.event-title text:last-child { padding: 6rpx 10rpx; border-radius: 999rpx; background: #ebe7d8; font-size: 15rpx; color: #756e56; }
.event-title .entropy_decrease { background: #dfead7; color: #526957; }
.event-title .entropy_increase { background: #f0dfda; color: #90584d; }
.chips { display: flex; flex-wrap: wrap; gap: 7rpx; margin-top: 14rpx; }
.chips text { padding: 6rpx 10rpx; border-radius: 999rpx; background: #e7ece4; font-size: 16rpx; color: #667268; }
.split-list { display: grid; grid-template-columns: minmax(0,1fr); gap: 12rpx; margin-top: 21rpx; }
.split-list > view { display: flex; padding: 23rpx; flex-direction: column; gap: 12rpx; border-radius: 23rpx; background: #e3ecdc; }
.split-list > view.erosion { background: #efe2de; }
.split-list > view text:first-child { font-size: 19rpx; font-weight: 710; }
.split-list > view text:not(:first-child) { font-size: 20rpx; line-height: 1.55; }
.rule-state { display: inline-block; margin-top: 13rpx; font-size: 17rpx; font-weight: 680; color: #657168; }
.new-rules, .essence { display: flex; margin-top: 21rpx; padding: 25rpx; flex-direction: column; gap: 12rpx; border-radius: 24rpx; background: #172019; color: #fff; }
.new-rules text:first-child, .essence text:first-child { font-size: 16rpx; font-weight: 710; letter-spacing: 2rpx; color: #a8b6a8; }
.new-rules text:not(:first-child), .essence text:nth-child(2) { font-size: 21rpx; line-height: 1.6; }
.essence text:last-child { font-size: 17rpx; color: #b7c4b7; }
.os-empty { display: flex; padding: 43rpx 20rpx 18rpx; flex-direction: column; align-items: flex-start; }
.os-empty text:first-child { font-size: 27rpx; font-weight: 700; }
.os-empty text:nth-child(2) { margin-top: 12rpx; font-size: 20rpx; line-height: 1.65; color: #718075; }
.os-empty view { margin-top: 20rpx; padding: 15rpx 20rpx; border-radius: 999rpx; background: #e2ecd9; font-size: 19rpx; font-weight: 680; color: #4d6352; }
.followed { border-left: 6rpx solid #7a947c; }
.violated { border-left: 6rpx solid #b77366; }
.card-section { margin-top: 24rpx; padding: 30rpx; border-radius: 31rpx; background: #fff; }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.card-heading > view { display: flex; min-width: 0; flex-direction: column; gap: 7rpx; }
.card-heading > view text:first-child { font-size: 27rpx; font-weight: 720; }
.card-heading > view text:last-child { font-size: 18rpx; line-height: 1.5; color: #748078; }
.card-heading > text { flex: 0 0 auto; padding: 8rpx 13rpx; border-radius: 999rpx; background: #e2ecd9; font-size: 16rpx; font-weight: 710; color: #526757; }
.card-reason { display: block; margin-top: 21rpx; font-size: 21rpx; line-height: 1.65; color: #58645b; }
.new-card-draft { margin-top: 22rpx; padding: 26rpx; border-radius: 25rpx; background: #172019; color: #fff; }
.draft-label { display: block; font-size: 15rpx; font-weight: 710; letter-spacing: 2rpx; color: #9eada0; }
.source-context { display: flex; margin-bottom: 22rpx; padding: 25rpx; flex-direction: column; border: 1rpx solid rgba(23,32,25,.08); border-radius: 25rpx; background: #edf2e8; }
.source-context-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18rpx; }
.source-context-head > view { display: flex; flex-direction: column; gap: 6rpx; }
.source-context-head > view text:first-child, .source-context-head > text { color: #75816f; font-size: 14rpx; font-weight: 750; letter-spacing: 2rpx; }
.source-context-head > view text:last-child { font-size: 21rpx; font-weight: 680; line-height: 1.5; }
.source-context-item { display: flex; padding: 15rpx 0; flex-direction: column; gap: 5rpx; border-top: 1rpx solid rgba(23,32,25,.07); }
.source-context-item:first-of-type { margin-top: 15rpx; }
.source-context-item text:first-child { font-size: 19rpx; font-weight: 650; }
.source-context-item text:last-child { color: #778178; font-size: 16rpx; }
.source-context-note { margin-top: 8rpx; color: #7e877d; font-size: 16rpx; line-height: 1.6; }
.draft-seed { display: block; margin-top: 17rpx; font-size: 27rpx; font-weight: 710; line-height: 1.55; }
.draft-understanding { display: block; margin-top: 14rpx; font-size: 19rpx; line-height: 1.65; color: #bcc7bd; }
.draft-usage { display: flex; margin-top: 18rpx; flex-direction: column; gap: 10rpx; }
.draft-usage text { font-size: 19rpx; line-height: 1.55; color: #e5ece5; }
.draft-tags { display: flex; flex-wrap: wrap; gap: 8rpx; margin-top: 18rpx; }
.draft-tags text { padding: 7rpx 11rpx; border-radius: 999rpx; background: rgba(255,255,255,.09); font-size: 16rpx; color: #c4cec5; }
.card-action { margin-top: 22rpx; padding: 21rpx 24rpx; border-radius: 999rpx; background: #e5efd9; text-align: center; font-size: 20rpx; font-weight: 700; color: #172019; }
.card-action.completed { background: rgba(229,239,217,.14); color: #dce9d5; }
.card-action.disabled { opacity: .45; }
.existing-card-list { margin-top: 25rpx; padding-top: 24rpx; border-top: 1rpx solid #e8ede6; }
.existing-heading { display: flex; flex-direction: column; gap: 6rpx; }
.existing-heading text:first-child { font-size: 22rpx; font-weight: 690; }
.existing-heading text:last-child { font-size: 17rpx; color: #78847b; }
.existing-card { display: flex; align-items: flex-start; gap: 15rpx; padding: 21rpx 0; border-bottom: 1rpx solid #edf0ec; }
.existing-card > view:last-child { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }
.existing-card > view:last-child text:first-child { font-size: 21rpx; font-weight: 670; line-height: 1.5; }
.existing-card > view:last-child text:last-child { font-size: 17rpx; line-height: 1.5; color: #78847b; }
.existing-card.bound { opacity: .62; }
.bind-action { background: #172019; color: #fff; }
.legacy-analysis { display: flex; flex-direction: column; gap: 10rpx; }
.legacy-analysis text:first-child { font-size: 22rpx; font-weight: 690; }
.legacy-analysis text:last-child { font-size: 19rpx; line-height: 1.6; color: #748078; }
.todo-section { margin-top: 24rpx; padding: 29rpx; border-radius: 31rpx; background: #fff; }
.todo-heading { display: flex; justify-content: space-between; gap: 20rpx; padding-bottom: 20rpx; }
.todo-heading > view { display: flex; flex-direction: column; gap: 6rpx; }
.todo-heading > view text:first-child { font-size: 27rpx; font-weight: 720; }
.todo-heading > view text:last-child, .todo-heading > text { font-size: 18rpx; color: #748078; }
.candidate { display: flex; align-items: flex-start; gap: 16rpx; padding: 21rpx 0; border-top: 1rpx solid #ebefea; }
.candidate-check { display: flex; width: 31rpx; height: 31rpx; flex: 0 0 31rpx; align-items: center; justify-content: center; border: 2rpx solid #88958b; border-radius: 9rpx; font-size: 19rpx; color: #fff; }
.candidate.selected .candidate-check, .candidate.created .candidate-check { border-color: #59725e; background: #59725e; }
.candidate.created { opacity: .58; }
.candidate > view:last-child { display: flex; flex-direction: column; gap: 7rpx; }
.candidate > view:last-child text:first-child { font-size: 21rpx; font-weight: 660; line-height: 1.5; }
.candidate > view:last-child text:last-child { font-size: 17rpx; color: #7a867d; }
.rerun { margin-top: 24rpx; padding: 22rpx; text-align: center; font-size: 19rpx; color: #718075; }
/* #ifdef H5 */
@media (min-width: 980px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 940px; margin: 0 auto; padding: 64px 44px 100px; } .split-list { grid-template-columns: repeat(2,minmax(0,1fr)); } }
/* #endif */
</style>
