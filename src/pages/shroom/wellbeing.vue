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
					<text class="hero-title">先看见变化，<br>再理解可能是什么。</text>
					<text class="hero-copy">日记先沉淀为身心记录；当多条线索形成模式，再整理为明确但可被推翻的问题可能性。</text>
					<view class="hero-rule"><text>从日记独立提取</text><text>证据与可能性分层</text><text>不替代医学诊断</text></view>
				</view>

				<view class="overview">
					<view><text>{{ summary.confirmedCount || 0 }}</text><text>已确认记录</text></view>
					<view><text>{{ summary.recentCount || 0 }}</text><text>近 7 天变化</text></view>
					<view :class="{ attention: summary.pendingCount }"><text>{{ summary.pendingCount || 0 }}</text><text>等待确认</text></view>
				</view>

				<view class="medical-notice" role="note">
					<view class="medical-notice-mark">i</view>
					<view><text>AI 辅助观察 · 仅供参考</text><text>{{ medicalDisclaimer }}</text><text>不要仅凭本页开始、停止或更改药物与治疗，也不要因此延误就医。</text></view>
				</view>

				<view class="possibility-section">
					<view class="possibility-heading">
						<view><text>POSSIBLE DIRECTIONS</text><text>可能需要留意的问题</text></view>
						<button :disabled="refreshing || !hypothesisState.sourceCount" @tap="refreshHypotheses">{{ refreshing ? '正在重新核对…' : (hypothesisState.reviewDue ? '有新记录 · 重新识别' : '重新识别') }}</button>
					</view>
					<text class="possibility-intro">这里会明确说出可能涉及的心理概念、症状模式或医学排查方向。它来自你的私密记录，是待验证线索，不是患病结论。</text>
					<view v-if="hypotheses.length" class="possibility-list">
						<view v-for="item in hypotheses" :key="item.id" class="possibility-card" :class="{ observing: item.status === 'OBSERVING', risk: item.redFlags && item.redFlags.length }">
							<view class="possibility-topline"><view><text>{{ domainLabel(item.domain) }}</text><text>{{ kindLabel(item.kind) }}</text></view><text>{{ strengthLabel(item.evidenceStrength) }}</text></view>
							<view v-if="item.namedPossibilities && item.namedPossibilities.length" class="named-possibilities">
								<text class="named-label">这组线索可能涉及</text>
								<button v-for="possibility in item.namedPossibilities" :key="possibility.conceptId" class="named-row" :class="{ rule_out: possibility.role === 'RULE_OUT', alternative: possibility.role === 'ALTERNATIVE' }" @tap.stop="openConcept(possibility)">
									<text class="named-role">{{ possibilityRoleLabel(possibility.role) }}</text>
									<view class="named-title"><text class="named-name">{{ possibility.name }}</text><text class="named-open">概念解释 ›</text></view>
									<text class="named-why">{{ possibility.why }}</text>
								</button>
								<text class="named-note">AI 基于日记生成，仅供参考；这是值得核对的方向，不是患病概率或诊断。</text>
							</view>
							<text class="pattern-label">日记里出现的模式</text>
							<text class="possibility-name">{{ item.name }}</text>
							<text class="possibility-statement">{{ item.possibilityStatement }}</text>
							<view class="possibility-reason"><text>为什么会想到这些方向</text><text>{{ item.whyPossible }}</text></view>
							<button class="evidence-toggle" @tap="toggleHypothesis(item)">{{ expandedHypothesisId === item.id ? '收起判断依据' : `查看 ${item.supportingEvidence.length} 条依据与缺口` }} <text>{{ expandedHypothesisId === item.id ? '↑' : '↓' }}</text></button>
							<view v-if="expandedHypothesisId === item.id" class="possibility-detail">
								<view class="detail-block"><text class="detail-label">支持它的日记线索</text><view v-for="evidence in item.supportingEvidence" :key="evidence.recordId" class="evidence-row"><text>{{ formatDate(evidence.recordedOn) }}</text><view><text>{{ evidence.reason }}</text><text v-if="evidence.sourceExcerpt">“{{ evidence.sourceExcerpt }}”</text></view></view></view>
								<view v-if="item.challengingEvidence && item.challengingEvidence.length" class="detail-block"><text class="detail-label">不一致或反对证据</text><text v-for="evidence in item.challengingEvidence" :key="evidence.recordId" class="detail-item">· {{ evidence.reason }}</text></view>
								<view v-if="item.alternatives && item.alternatives.length" class="detail-block"><text class="detail-label">也可能是</text><text v-for="(value, index) in item.alternatives" :key="index" class="detail-item">· {{ value }}</text></view>
								<view v-if="item.missingInformation && item.missingInformation.length" class="detail-block"><text class="detail-label">现在还缺什么</text><text v-for="(value, index) in item.missingInformation" :key="index" class="detail-item">· {{ value }}</text></view>
								<view v-if="item.nextObservations && item.nextObservations.length" class="detail-block next"><text class="detail-label">下一步最值得记录</text><text v-for="(value, index) in item.nextObservations" :key="index" class="detail-item">· {{ value }}</text></view>
								<view v-if="item.careGuidance" class="care-guidance"><text>专业评估提示</text><text>{{ item.careGuidance }}</text></view>
								<view v-if="item.redFlags && item.redFlags.length" class="red-flags"><text>需要及时处理的信号</text><text v-for="flag in item.redFlags" :key="flag.recordId">{{ flag.signal }}：{{ flag.action }}</text></view>
							</view>
							<view v-if="item.status === 'PENDING'" class="possibility-actions"><button :disabled="hypothesisProcessingId === item.id" @tap="updateHypothesisStatus(item, 'dismiss')">不符合我</button><button :disabled="hypothesisProcessingId === item.id" @tap="updateHypothesisStatus(item, 'observe')">持续观察</button></view>
							<view v-else class="observing-label"><text>●</text><text>你正在持续观察这个方向，新记录会帮助修订它</text><button :disabled="hypothesisProcessingId === item.id" @tap="updateHypothesisStatus(item, 'archive')">结束</button></view>
						</view>
					</view>
					<view v-else-if="!hypothesesLoading" class="possibility-empty"><text>尚未形成可靠的问题可能性</text><text>{{ hypothesisState.sourceCount ? '可以让 AI 综合现有记录重新识别；证据不够时不会硬凑疾病名称。' : '先从日记积累真实的身心变化，系统再寻找跨时间模式。' }}</text></view>
					<text class="consent-copy">点击“重新识别”即允许当前 AI 服务读取这里的私密身心记录摘要；结果仅保存在你的账户中。</text>
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
		<view v-if="selectedConcept" class="concept-overlay" @tap="closeConcept" @touchmove.stop.prevent>
			<view class="concept-sheet" role="dialog" aria-modal="true" @tap.stop>
				<view class="concept-handle"></view>
				<view class="concept-heading">
					<view><text>{{ selectedConcept.concept.typeLabel }}</text><text>{{ possibilityRoleLabel(selectedConcept.role) }}</text></view>
					<button aria-label="关闭概念解释" @tap="closeConcept">×</button>
				</view>
				<scroll-view class="concept-scroll" scroll-y>
					<text class="concept-name">{{ selectedConcept.concept.name }}</text>
					<text class="concept-english">{{ selectedConcept.concept.englishName }}</text>
					<view class="concept-block relation"><text>为什么在这里出现</text><text>{{ selectedConcept.why }}</text></view>
					<view class="concept-block"><text>概念是什么</text><text>{{ selectedConcept.concept.definition }}</text></view>
					<view class="concept-block boundary"><text>判断边界</text><text>{{ selectedConcept.concept.boundary }}</text></view>
					<view class="concept-source"><text>专业依据</text><text>{{ selectedConcept.concept.source.organization }}</text><text>{{ selectedConcept.concept.source.title }}</text><button @tap="openConceptSource">查看或复制资料来源 ›</button></view>
					<text class="concept-disclaimer">这是专业概念与当前日记线索的匹配解释，不代表你符合诊断标准，也不能替代医生或心理专业人员的评估。</text>
				</scroll-view>
				<button class="concept-done" @tap="closeConcept">知道了</button>
			</view>
		</view>
		<wellbeing-safety-sheet :visible="safetyConsentVisible" @cancel="safetyConsentVisible = false" @confirm="confirmHypothesisRefresh" />
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { wellbeingHypotheses, wellbeingHypothesesRefresh, wellbeingHypothesisStatus, wellbeingList, wellbeingStatus, wellbeingSummary } from '@/api/wellbeing';
import WellbeingSafetySheet from '@/components/WellbeingSafetySheet.vue';

const DEFAULT_MEDICAL_DISCLAIMER = '身心记录及“可能问题”由 AI 根据你提供的线索生成，可能不完整、不准确或误解原文，仅供自我观察和就医沟通参考，不构成医学诊断、治疗建议或专业心理意见。';

const emptyDraft = () => ({ recordedOn: moment().format('YYYY-MM-DD'), note: '', psychologicalFeelings: '', physicalSymptoms: '', sleepHours: '', sleepQuality: '', behaviors: '', measurements: '', testResults: '' });

export default {
	components: { WellbeingSafetySheet },
	data() {
		return {
			statusBarHeight: 0, items: [], total: 0, page: 1,
			pageSize: 20, category: '', loading: false, processingId: '', creating: false, saving: false,
			summary: {}, draft: emptyDraft(), hypotheses: [], hypothesisState: {}, hypothesesLoading: false,
			refreshing: false, hypothesisProcessingId: '', expandedHypothesisId: '', safetyConsentVisible: false, selectedConcept: null,
			categories: [{ value: '', label: '全部' }, { value: 'PSYCHOLOGICAL', label: '心理' }, { value: 'PHYSICAL', label: '身体' }, { value: 'SLEEP', label: '睡眠' }, { value: 'HABIT', label: '习惯' }, { value: 'MEASUREMENT', label: '测量' }, { value: 'TEST_RESULT', label: '检查' }]
		};
	},
	computed: {
		canSave() { return Boolean(this.draft.note.trim() || this.draft.psychologicalFeelings.trim() || this.draft.physicalSymptoms.trim() || this.draft.sleepHours || this.draft.sleepQuality || this.draft.behaviors.trim() || this.draft.measurements.trim() || this.draft.testResults.trim()); },
		categoryTitle() { return this.category ? this.categoryLabel(this.category) + '记录' : '全部身心记录'; },
		medicalDisclaimer() { return this.hypothesisState.medicalDisclaimer || DEFAULT_MEDICAL_DISCLAIMER; }
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.loadSummary();
		this.loadHypotheses();
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
		async loadHypotheses() {
			if (this.hypothesesLoading) return;
			this.hypothesesLoading = true;
			try {
				const res = await this.$http.get(wellbeingHypotheses);
				this.hypothesisState = res.data || {};
				this.hypotheses = Array.isArray(this.hypothesisState.list) ? this.hypothesisState.list : [];
			} catch (error) { console.error('加载身心问题候选失败', error); }
			finally { this.hypothesesLoading = false; }
		},
		refreshHypotheses() {
			if (this.refreshing || !this.hypothesisState.sourceCount) return;
			this.safetyConsentVisible = true;
		},
		async confirmHypothesisRefresh() {
			if (this.refreshing || !this.hypothesisState.sourceCount) return;
			this.safetyConsentVisible = false;
			this.refreshing = true;
			try {
				const res = await this.$http.post(wellbeingHypothesesRefresh, { healthConsent: true });
				this.hypothesisState = res.data || {};
				this.hypotheses = Array.isArray(this.hypothesisState.list) ? this.hypothesisState.list : [];
				uni.showToast({ title: this.hypotheses.length ? '可能问题已更新' : '暂无线索足够的问题', icon: 'none' });
			} catch (error) { console.error('识别身心问题候选失败', error); }
			finally { this.refreshing = false; }
		},
		async updateHypothesisStatus(item, action) {
			if (!item || this.hypothesisProcessingId) return;
			let reason = '';
			if (action === 'dismiss') {
				const reasons = [
					{ label: '与我的实际情况不符', value: 'DOES_NOT_MATCH' },
					{ label: '误读了日记证据', value: 'MISREAD_EVIDENCE' },
					{ label: '推测得太远', value: 'TOO_SPECULATIVE' },
					{ label: '这个问题已经解决', value: 'ALREADY_RESOLVED' }
				];
				try {
					const selected = await new Promise((resolve, reject) => uni.showActionSheet({ itemList: reasons.map(option => option.label), success: resolve, fail: reject }));
					reason = reasons[selected.tapIndex] && reasons[selected.tapIndex].value;
					if (!reason) return;
				} catch (error) { return; }
			}
			this.hypothesisProcessingId = item.id;
			try {
				await this.$http.post(wellbeingHypothesisStatus(item.id), reason ? { action, reason } : { action });
				await this.loadHypotheses();
			} catch (error) { console.error('更新身心问题候选失败', error); }
			finally { this.hypothesisProcessingId = ''; }
		},
		toggleHypothesis(item) { this.expandedHypothesisId = this.expandedHypothesisId === item.id ? '' : item.id; },
		openConcept(possibility) { if (possibility && possibility.concept) this.selectedConcept = possibility; },
		closeConcept() { this.selectedConcept = null; },
		openConceptSource() {
			const url = this.selectedConcept && this.selectedConcept.concept && this.selectedConcept.concept.source && this.selectedConcept.concept.source.url;
			if (!url) return;
			// #ifdef H5
			if (typeof window !== 'undefined' && window.open) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
			// #endif
			uni.setClipboardData({ data: url, success: () => uni.showToast({ title: '资料链接已复制', icon: 'none' }) });
		},
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
		domainLabel(value) { return value === 'PHYSICAL' ? '身体' : '心理'; },
		kindLabel(value) { return { PSYCHOLOGICAL_CONCEPT: '心理概念', SYMPTOM_PATTERN: '症状模式', CLINICAL_CONDITION: '建议专业评估', RISK_SIGNAL: '需及时留意' }[value] || '待验证方向'; },
		strengthLabel(value) { return { LIMITED: '初步线索', MODERATE: '多条线索一致', STRONG: '记录依据较充分' }[value] || '初步线索'; },
		possibilityRoleLabel(value) { return { PRIMARY_DIRECTION: '当前更符合', ALTERNATIVE: '也可能', RULE_OUT: '建议排查' }[value] || '待验证'; },
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
.medical-notice { margin-top: 18rpx; padding: 23rpx 24rpx; border: 1rpx solid rgba(101,117,65,.16); border-radius: 25rpx; background: #e7edd8; display: flex; align-items: flex-start; gap: 16rpx; }
.medical-notice-mark { width: 34rpx; height: 34rpx; flex: 0 0 34rpx; border: 1rpx solid #71804d; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #667544; font-family: Georgia, serif; font-size: 19rpx; font-weight: 700; }
.medical-notice > view:last-child { min-width: 0; display: flex; flex-direction: column; }
.medical-notice > view:last-child text:first-child { color: #52603a; font-size: 18rpx; font-weight: 750; letter-spacing: 1rpx; }
.medical-notice > view:last-child text:nth-child(2) { margin-top: 8rpx; color: #485248; font-size: 18rpx; line-height: 1.62; }
.medical-notice > view:last-child text:last-child { margin-top: 7rpx; color: #737b70; font-size: 16rpx; line-height: 1.58; }
.overview { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12rpx; margin-top: 18rpx; }
.overview > view { padding: 23rpx 18rpx; border-radius: 24rpx; background: #fffdf7; border: 1rpx solid rgba(23,32,25,.07); display: flex; flex-direction: column; }
.overview > view > text:first-child { font-family: Georgia, serif; font-size: 34rpx; }
.overview > view > text:last-child { margin-top: 7rpx; color: #798177; font-size: 17rpx; }
.overview .attention { background: #e5eccf; }
.possibility-section { margin-top: 24rpx; padding: 30rpx; border-radius: 30rpx; background: #fffdf7; border: 1rpx solid rgba(23,32,25,.08); }
.possibility-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 18rpx; }
.possibility-heading > view { min-width: 0; display: flex; flex-direction: column; }
.possibility-heading > view text:first-child { color: #7b865d; font-size: 14rpx; font-weight: 750; letter-spacing: 2rpx; }
.possibility-heading > view text:last-child { margin-top: 7rpx; font-family: Georgia, 'Songti SC', serif; font-size: 28rpx; }
.possibility-heading > button { flex: 0 0 auto; min-height: 58rpx; padding: 0 18rpx; border-radius: 30rpx; background: #172019; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16rpx; }
.possibility-heading > button[disabled] { opacity: .42; }
.possibility-intro { display: block; margin-top: 14rpx; color: #767f75; font-size: 18rpx; line-height: 1.65; }
.possibility-list { display: flex; flex-direction: column; gap: 15rpx; margin-top: 22rpx; }
.possibility-card { padding: 25rpx; border-radius: 25rpx; background: #edf2e5; border: 1rpx solid rgba(71,88,53,.1); overflow: hidden; }
.possibility-card.observing { background: #e2ebca; }
.possibility-card.risk { border-color: rgba(150,87,55,.32); }
.possibility-topline { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.possibility-topline > view { display: flex; flex-wrap: wrap; gap: 8rpx; }
.possibility-topline text { padding: 7rpx 11rpx; border-radius: 13rpx; background: rgba(255,255,255,.66); color: #637055; font-size: 14rpx; }
.possibility-topline > text { background: transparent; color: #7a8375; text-align: right; }
.pattern-label { display: block; margin-top: 20rpx; color: #778175; font-size: 14rpx; font-weight: 750; letter-spacing: 1rpx; }
.possibility-name { display: block; margin-top: 8rpx; font-family: Georgia, 'Songti SC', serif; font-size: 25rpx; line-height: 1.4; word-break: break-word; }
.possibility-statement { display: block; margin-top: 10rpx; color: #4f5a50; font-size: 19rpx; line-height: 1.68; word-break: break-word; }
.named-possibilities { margin-top: 18rpx; padding: 20rpx; border-radius: 20rpx; background: #172019; display: flex; flex-direction: column; gap: 13rpx; }
.named-label { color: #dce9bd; font-size: 14rpx; font-weight: 750; letter-spacing: 1rpx; }
.named-row { position: relative; width: 100%; padding: 15rpx 0 2rpx 23rpx; border-top: 1rpx solid rgba(255,255,255,.1); display: flex; flex-direction: column; box-sizing: border-box; text-align: left; }
.named-row::before { content: ''; position: absolute; left: 0; top: 22rpx; width: 9rpx; height: 9rpx; border-radius: 50%; background: #dce9bd; }
.named-row.rule_out::before { background: #f2c78e; }
.named-row.alternative::before { background: #9ba69a; }
.named-role { align-self: flex-start; padding: 5rpx 9rpx; border-radius: 10rpx; background: rgba(220,233,189,.13); color: #dce9bd; font-size: 13rpx; }
.named-row.rule_out .named-role { background: rgba(242,199,142,.13); color: #f2c78e; }
.named-title { width: 100%; margin-top: 9rpx; display: flex; align-items: baseline; justify-content: space-between; gap: 15rpx; }
.named-name { min-width: 0; color: #fff; font-family: Georgia, 'Songti SC', serif; font-size: 24rpx; line-height: 1.42; word-break: break-word; }
.named-open { flex: 0 0 auto; color: #dce9bd; font-size: 14rpx; line-height: 1.4; }
.named-why { margin-top: 6rpx; color: #bdc8ba; font-size: 16rpx; line-height: 1.58; word-break: break-word; }
.named-note { padding-top: 13rpx; border-top: 1rpx solid rgba(255,255,255,.1); color: #899488; font-size: 14rpx; line-height: 1.55; }
.possibility-reason { margin-top: 18rpx; padding: 17rpx 18rpx; border-left: 4rpx solid #91a463; background: rgba(255,255,255,.55); display: flex; flex-direction: column; }
.possibility-reason text:first-child, .detail-label, .care-guidance text:first-child, .red-flags > text:first-child { color: #6f7f49; font-size: 14rpx; font-weight: 750; letter-spacing: 1rpx; }
.possibility-reason text:last-child { margin-top: 7rpx; color: #344036; font-size: 18rpx; line-height: 1.58; }
.evidence-toggle { width: 100%; min-height: 62rpx; margin-top: 10rpx; display: flex; align-items: center; justify-content: space-between; color: #657064; font-size: 17rpx; text-align: left; }
.evidence-toggle text { font-size: 18rpx; }
.possibility-detail { padding-top: 4rpx; border-top: 1rpx solid rgba(23,32,25,.08); }
.detail-block { padding: 19rpx 0 3rpx; display: flex; flex-direction: column; gap: 9rpx; }
.detail-block.next { margin-top: 13rpx; padding: 18rpx; border-radius: 17rpx; background: #172019; color: #f7faef; }
.detail-block.next .detail-label { color: #dce9bd; }
.detail-item { color: #505c51; font-size: 17rpx; line-height: 1.6; word-break: break-word; }
.detail-block.next .detail-item { color: #e8ede2; }
.evidence-row { display: grid; grid-template-columns: 105rpx minmax(0, 1fr); gap: 12rpx; padding: 13rpx 0; border-bottom: 1rpx solid rgba(23,32,25,.06); }
.evidence-row > text { color: #7e8877; font-family: Georgia, serif; font-size: 15rpx; }
.evidence-row > view { min-width: 0; display: flex; flex-direction: column; }
.evidence-row > view text:first-child { color: #384339; font-size: 17rpx; line-height: 1.55; }
.evidence-row > view text:last-child:not(:first-child) { display: -webkit-box; margin-top: 6rpx; color: #838a82; font-size: 16rpx; line-height: 1.5; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; word-break: break-word; }
.care-guidance, .red-flags { margin-top: 17rpx; padding: 18rpx; border-radius: 17rpx; background: rgba(255,255,255,.62); display: flex; flex-direction: column; gap: 8rpx; }
.care-guidance text:last-child, .red-flags > text:not(:first-child) { color: #4c574d; font-size: 17rpx; line-height: 1.6; }
.red-flags { background: #f5e8df; }
.red-flags > text:first-child { color: #965737; }
.possibility-actions { margin-top: 20rpx; display: flex; justify-content: flex-end; gap: 10rpx; }
.possibility-actions button { min-height: 60rpx; padding: 0 18rpx; border: 1rpx solid rgba(23,32,25,.16); border-radius: 31rpx; display: flex; align-items: center; justify-content: center; color: #606b60; font-size: 17rpx; }
.possibility-actions button:last-child { border-color: #172019; background: #172019; color: #fff; font-weight: 700; }
.observing-label { margin-top: 19rpx; padding-top: 16rpx; border-top: 1rpx solid rgba(23,32,25,.09); display: flex; align-items: center; gap: 9rpx; color: #5e6c50; font-size: 16rpx; }
.observing-label text:first-child { color: #7f9846; }
.observing-label text:nth-child(2) { min-width: 0; flex: 1; }
.observing-label button { color: #778174; font-size: 16rpx; }
.possibility-empty { margin-top: 21rpx; padding: 31rpx 24rpx; border-radius: 22rpx; background: #f1f3eb; display: flex; flex-direction: column; text-align: center; }
.possibility-empty text:first-child { font-family: Georgia, 'Songti SC', serif; font-size: 22rpx; }
.possibility-empty text:last-child { margin-top: 9rpx; color: #80887f; font-size: 17rpx; line-height: 1.6; }
.consent-copy { display: block; margin-top: 16rpx; color: #91978e; font-size: 14rpx; line-height: 1.55; }
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
.concept-overlay { position: fixed; z-index: 1100; inset: 0; padding: 28rpx; box-sizing: border-box; background: rgba(10,16,12,.56); display: flex; align-items: flex-end; justify-content: center; }
.concept-sheet { width: 100%; max-width: 720rpx; max-height: min(84vh, 1080rpx); padding: 17rpx 29rpx calc(23rpx + env(safe-area-inset-bottom)); box-sizing: border-box; border: 1rpx solid rgba(23,32,25,.08); border-radius: 34rpx 34rpx 20rpx 20rpx; background: #fbfcf5; box-shadow: 0 30rpx 90rpx rgba(7,12,9,.24); display: flex; flex-direction: column; overflow: hidden; }
.concept-handle { width: 67rpx; height: 7rpx; margin: 0 auto 15rpx; border-radius: 99rpx; background: #c8cec0; }
.concept-heading { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 18rpx; }
.concept-heading > view { display: flex; flex-wrap: wrap; gap: 8rpx; }
.concept-heading > view text { padding: 7rpx 11rpx; border-radius: 12rpx; background: #e6ecd5; color: #5e6d48; font-size: 14rpx; line-height: 1.2; }
.concept-heading > button { width: 55rpx; height: 55rpx; flex: 0 0 55rpx; border-radius: 50%; background: #edf0e7; color: #657064; display: flex; align-items: center; justify-content: center; font-size: 31rpx; }
.concept-scroll { min-height: 0; flex: 1; margin-top: 19rpx; }
.concept-name { display: block; padding-right: 20rpx; font-family: Georgia, 'Songti SC', serif; font-size: 40rpx; line-height: 1.3; color: #172019; }
.concept-english { display: block; margin-top: 6rpx; color: #829076; font-family: Georgia, serif; font-size: 17rpx; line-height: 1.5; }
.concept-block { margin-top: 24rpx; padding-top: 21rpx; border-top: 1rpx solid rgba(23,32,25,.09); display: flex; flex-direction: column; gap: 9rpx; }
.concept-block text:first-child, .concept-source > text:first-child { color: #758452; font-size: 14rpx; font-weight: 750; letter-spacing: 1rpx; }
.concept-block text:last-child { color: #344037; font-size: 19rpx; line-height: 1.68; word-break: break-word; }
.concept-block.relation { padding: 19rpx 20rpx; border: 0; border-radius: 19rpx; background: #e5ecd2; }
.concept-block.boundary { padding: 19rpx 20rpx; border: 0; border-radius: 19rpx; background: #f1eee3; }
.concept-source { margin-top: 23rpx; padding-top: 20rpx; border-top: 1rpx solid rgba(23,32,25,.09); display: flex; flex-direction: column; gap: 7rpx; }
.concept-source > text:nth-child(2) { color: #455240; font-size: 18rpx; font-weight: 700; line-height: 1.45; }
.concept-source > text:nth-child(3) { color: #737d70; font-size: 16rpx; line-height: 1.5; }
.concept-source > button { align-self: flex-start; min-height: 54rpx; margin-top: 5rpx; padding: 0 16rpx; border-radius: 28rpx; background: #edf1e4; color: #5d6c45; display: flex; align-items: center; font-size: 15rpx; }
.concept-disclaimer { display: block; margin: 23rpx 0 10rpx; color: #8a9087; font-size: 15rpx; line-height: 1.62; }
.concept-done { flex: 0 0 auto; width: 100%; min-height: 68rpx; margin-top: 16rpx; border-radius: 35rpx; background: #172019; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 19rpx; font-weight: 700; }
@media (min-width: 900px) { .page-shell { padding-left: 52rpx; padding-right: 52rpx; } .possibility-list, .record-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } .concept-overlay { align-items: center; } .concept-sheet { border-radius: 34rpx; } .concept-handle { display: none; } }
</style>
