<template>
	<view class="admin-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="admin-shell">
			<view class="page-header">
				<view class="back-button" @tap="goBack">‹</view>
				<view class="header-copy">
					<text class="header-kicker">SHROOM OPERATING SYSTEM</text>
					<text class="header-title">AI 公司</text>
					<text class="header-description">查看每个部门为什么存在、Agent 正在推进什么，以及哪些问题必须由 CEO 决定。</text>
				</view>
				<view v-if="unlocked" class="refresh-button" @tap="loadCompany">刷新</view>
			</view>

			<view v-if="loading" class="state-panel">
				<text class="state-mark">···</text>
				<text class="state-title">正在读取公司运行状态</text>
			</view>

			<view v-else-if="!allowed" class="state-panel denied">
				<text class="state-mark">×</text>
				<text class="state-title">这里只向管理员开放</text>
				<text class="state-description">普通用户账户、私人日记和公开主页不会进入这个经营后台。</text>
				<view class="state-action" @tap="goBack">返回 Shroom</view>
			</view>

			<view v-else-if="!unlocked" class="unlock-panel">
				<view class="unlock-mark">ADMIN</view>
				<text class="unlock-title">重新验证后进入总后台</text>
				<text class="unlock-description">登录 Shroom 不等于获得管理权限。请输入独立的总后台凭证，本次解锁 15 分钟，关闭页面后凭证立即清除。</text>
				<input v-model.trim="adminUsername" class="credential-input" type="text" placeholder="管理员账号" confirm-type="next" />
				<input v-model="adminPassword" class="credential-input password-input" type="password" password placeholder="管理员密码" confirm-type="done" @confirm="unlockAdmin" />
				<text v-if="passwordError" class="unlock-error">{{ passwordError }}</text>
				<view class="unlock-action" :class="{ disabled: unlocking || !adminUsername || !adminPassword }" data-testid="admin-unlock" @tap="unlockAdmin">{{ unlocking ? '正在验证…' : '验证并进入' }}</view>
				<view class="unlock-back" @tap="goBack">返回 Shroom</view>
			</view>

			<block v-else-if="company && primaryDepartment">
				<scroll-view v-if="company.departments.length > 1" class="department-switcher" scroll-x>
					<view class="department-tabs">
						<view v-for="department in company.departments" :key="department.key" class="department-tab" :class="{ active: department.key === selectedDepartmentKey }" @tap="selectDepartment(department)">{{ department.name }}</view>
					</view>
				</scroll-view>
				<view class="company-hero">
					<view class="hero-topline">
						<text>DEPARTMENT {{ activeDepartmentNumber }}</text>
						<text class="status-pill">{{ statusLabel(primaryDepartment.status) }}</text>
					</view>
					<text class="company-title">{{ primaryDepartment.name }}</text>
					<text class="company-mission">{{ primaryDepartment.mission }}</text>
					<view class="hero-meta">
						<view><text>运行节奏</text><text>{{ primaryDepartment.cadence }}</text></view>
						<view><text>汇报位置</text><text>{{ primaryDepartment.reportChannel }}</text></view>
					</view>
				</view>

				<view class="summary-row">
					<view class="summary-item"><text class="summary-value">{{ company.summary.activeAgents }}</text><text class="summary-label">运行中 Agent</text></view>
					<view class="summary-item"><text class="summary-value">{{ company.summary.verifiedRuns30d }}</text><text class="summary-label">30 日已验证</text></view>
					<view class="summary-item"><text class="summary-value">{{ company.summary.realWorldRuns30d }}</text><text class="summary-label">现实结果</text></view>
					<view class="summary-item decision"><text class="summary-value">{{ company.summary.pendingDecisions }}</text><text class="summary-label">等待 CEO</text></view>
				</view>

				<view class="section-block flywheel-section">
					<view class="section-heading">
						<view><text class="section-kicker">THE FLYWHEEL</text><text class="section-title">增长不是曝光，是价值能够回来</text></view>
						<text class="section-note">当前重点：{{ activeStageName }}</text>
					</view>
					<view class="flywheel-flow">
						<view v-for="(stage, index) in company.flywheelStages" :key="stage.key" class="flywheel-stage" :class="{ current: stage.key === activeStageKey }">
							<view class="stage-index">0{{ index + 1 }}</view>
							<text class="stage-name">{{ stage.name }}</text>
							<text class="stage-description">{{ stage.description }}</text>
						</view>
					</view>
				</view>

				<view v-if="hasOperatingSystem" class="section-block playbook-section" data-testid="department-playbook">
					<view class="section-heading">
						<view><text class="section-kicker">DEPARTMENT PLAYBOOK</text><text class="section-title">从方向到每天怎么做</text></view>
						<text class="section-note">{{ operatingSystem.version || 'CURRENT' }}</text>
					</view>

					<view v-if="operatingSystem.positioning" class="positioning-panel">
						<text class="positioning-label">{{ operatingSystem.positioning.category }}</text>
						<text class="positioning-promise">{{ operatingSystem.positioning.promise }}</text>
						<text class="positioning-audience">首批用户 · {{ operatingSystem.positioning.firstAudience }}</text>
						<text class="positioning-boundary">边界 · {{ operatingSystem.positioning.boundary }}</text>
					</view>

					<view v-if="operatingSystem.principles && operatingSystem.principles.length" class="playbook-unit">
						<view class="unit-heading"><text>OPERATING PRINCIPLES</text><text>运营原则</text></view>
						<view class="principle-grid">
							<view v-for="(principle, index) in operatingSystem.principles" :key="principle.title" class="principle-card">
								<text class="playbook-index">0{{ index + 1 }}</text>
								<text class="playbook-name">{{ principle.title }}</text>
								<text class="playbook-copy">{{ principle.description }}</text>
							</view>
						</view>
					</view>

					<view v-if="operatingSystem.channels && operatingSystem.channels.length" class="playbook-unit">
						<view class="unit-heading"><text>CHANNEL FOCUS</text><text>渠道分工</text></view>
						<view class="channel-list">
							<view v-for="channel in operatingSystem.channels" :key="channel.name" class="channel-row">
								<view class="channel-title"><text>{{ channel.name }}</text><text>{{ channel.role }}</text></view>
								<view class="channel-meta"><text>{{ channel.cadence }}</text><text>{{ channel.content }}</text></view>
							</view>
						</view>
					</view>

					<view v-if="operatingSystem.phases && operatingSystem.phases.length" class="playbook-unit">
						<view class="unit-heading"><text>90 DAY PLAN</text><text>三阶段运营计划</text></view>
						<view class="phase-list">
							<view v-for="(phase, index) in operatingSystem.phases" :key="phase.name" class="phase-card">
								<view class="phase-top"><text>0{{ index + 1 }}</text><text>{{ phase.name }}</text></view>
								<text class="phase-goal">{{ phase.goal }}</text>
								<view class="phase-deliverables">
									<text v-for="item in phase.deliverables" :key="item">· {{ item }}</text>
								</view>
							</view>
						</view>
					</view>

					<view v-if="operatingSystem.workflow && operatingSystem.workflow.length" class="playbook-unit workflow-unit">
						<view class="unit-heading"><text>AGENT WORKFLOW</text><text>从信号到复盘</text></view>
						<view class="workflow-list">
							<view v-for="item in operatingSystem.workflow" :key="item.step" class="workflow-row">
								<view class="workflow-step">{{ formatStep(item.step) }}</view>
								<view class="workflow-copy"><text>{{ item.name }} · {{ item.owner }}</text><text>{{ item.output }}</text></view>
							</view>
						</view>
					</view>

					<view v-if="operatingSystem.metrics && operatingSystem.metrics.length" class="playbook-unit">
						<view class="unit-heading"><text>REAL METRICS</text><text>不让曝光冒充获客</text></view>
						<view class="metric-list">
							<view v-for="metric in operatingSystem.metrics" :key="metric.name" class="metric-row"><text>{{ metric.name }}</text><text>{{ metric.definition }}</text></view>
						</view>
					</view>

					<view v-if="operatingSystem.guardrails && operatingSystem.guardrails.length" class="guardrail-panel">
						<text class="guardrail-title">发布门禁</text>
						<text v-for="item in operatingSystem.guardrails" :key="item" class="guardrail-item">· {{ item }}</text>
					</view>
				</view>

				<view v-if="isOperationsDepartment" class="section-block acquisition-section" data-testid="acquisition-funnel">
					<view class="section-heading">
						<view><text class="section-kicker">ACQUISITION BASELINE</text><text class="section-title">从哪条内容来，是否得到第一次价值</text></view>
						<text class="section-note">{{ acquisitionCampaigns.length }} 个实验</text>
					</view>
					<view class="acquisition-summary">
						<view><text>{{ acquisitionTotal('visitors') }}</text><text>有效到访</text></view>
						<view><text>{{ acquisitionTotal('registrations') }}</text><text>完成注册</text></view>
						<view><text>{{ acquisitionTotal('activations') }}</text><text>首次价值激活</text></view>
						<view><text>{{ acquisitionTotal('sevenDayReturns') }}</text><text>七日回访</text></view>
					</view>
					<view v-if="acquisitionCampaigns.length" class="campaign-list">
						<view v-for="campaign in acquisitionCampaigns" :key="campaign.contentCode" class="campaign-card">
							<view class="campaign-topline"><text>{{ campaign.source }} · {{ campaign.status }}</text><text>{{ campaign.contentCode }}</text></view>
							<text class="campaign-name">{{ campaign.name }}</text>
							<text class="campaign-link">{{ campaign.landingPath }}</text>
							<view class="campaign-metrics">
								<text>访问 {{ campaign.visits }}</text><text>注册 {{ campaign.registrations }}</text><text>写下首篇 {{ campaign.firstDiaries }}</text><text>首次回看 {{ campaign.firstReflections }}</text>
							</view>
						</view>
					</view>
					<text class="acquisition-privacy">{{ company.acquisition && company.acquisition.privacy }}</text>
				</view>

				<view class="section-block organization-section">
					<view class="section-heading">
						<view><text class="section-kicker">ORGANIZATION</text><text class="section-title">谁负责，必须拿到什么结果</text></view>
					</view>

					<view class="org-tree">
						<view class="org-ceo" @tap="showCeo">
							<text class="org-level">L0 · 最终决策</text>
							<text class="org-name">CEO · 你</text>
							<text class="org-result">战略、隐私、预算、生产与不可逆事项</text>
						</view>
						<view class="org-line"></view>
						<view v-if="leadAgent" class="org-lead" :class="{ selected: selectedAgentKey === leadAgent.key }" @tap="selectAgent(leadAgent)">
							<view class="agent-topline"><text>{{ leadAgent.level }}</text><text>{{ agentStatusLabel(leadAgent.status) }}</text></view>
							<text class="org-name">{{ leadAgent.name }}</text>
							<text class="org-result">{{ leadAgent.resultDefinition }}</text>
						</view>
						<view class="org-line branch"></view>
						<view class="agent-grid">
							<view v-for="agent in teamAgents" :key="agent.key" class="agent-card" :class="{ selected: selectedAgentKey === agent.key, gate: agent.level === '独立门禁' }" @tap="selectAgent(agent)">
								<view class="agent-topline"><text>{{ agent.level }}</text><text>{{ agentStatusLabel(agent.status) }}</text></view>
								<text class="agent-name">{{ agent.name }}</text>
								<text class="agent-focus">{{ agent.currentFocus }}</text>
								<view class="agent-result-state">{{ resultStateLabel(agent.lastResultState) }}</view>
							</view>
						</view>
					</view>

					<view v-if="selectedAgent" class="agent-detail">
						<view class="detail-header">
							<view><text class="detail-level">{{ selectedAgent.level }}</text><text class="detail-title">{{ selectedAgent.name }}</text></view>
							<view class="status-action" @tap="changeAgentStatus(selectedAgent)">调整状态</view>
						</view>
						<view class="detail-columns">
							<view><text>功能</text><text>{{ selectedAgent.responsibility }}</text></view>
							<view><text>必须产生的结果</text><text>{{ selectedAgent.resultDefinition }}</text></view>
							<view><text>当前推进</text><text>{{ selectedAgent.currentFocus }}</text></view>
						</view>
					</view>
				</view>

				<view class="section-block decision-section">
					<view class="section-heading">
						<view><text class="section-kicker">CEO DECISIONS</text><text class="section-title">只把真正阻断交给你</text></view>
						<text class="section-note">{{ pendingDecisions.length }} 项待处理</text>
					</view>
					<view v-if="pendingDecisions.length" class="decision-list">
						<view v-for="decision in pendingDecisions" :key="decision.id" class="decision-card">
							<view class="decision-topline"><text>等待 CEO</text><text>{{ formatDateTime(decision.dueAt || decision.createdAt) }}</text></view>
							<text class="decision-title">{{ decision.title }}</text>
							<text class="decision-copy">{{ decision.whyNow }}</text>
							<view v-if="decision.options && decision.options.length" class="decision-options">
								<view v-for="(option, optionIndex) in decision.options" :key="optionIndex"><text>{{ option.label }}</text><text>{{ option.impact }}</text></view>
							</view>
							<view class="recommendation"><text>部门建议</text><text>{{ decision.recommendation || '等待补充建议' }}</text></view>
							<view class="decision-action" @tap="resolveDecision(decision)">处理这个决定</view>
						</view>
					</view>
					<view v-else class="empty-state"><text>当前没有阻断项</text><text>部门继续在已授权范围内推进，不需要你为了“管理感”频繁介入。</text></view>
				</view>

				<view class="section-block report-section">
					<view class="section-heading">
						<view><text class="section-kicker">OPERATING LOG</text><text class="section-title">每日结果，不用忙碌冒充进展</text></view>
					</view>
					<view v-if="departmentRuns.length" class="report-list">
						<view v-for="run in departmentRuns" :key="run.id" class="report-card">
							<view class="report-date"><text>{{ formatDate(run.runDate) }}</text><text :class="['result-badge', resultClass(run.resultState)]">{{ resultStateLabel(run.resultState) }}</text></view>
							<text class="report-bottleneck">{{ run.bottleneck || '当天未记录瓶颈' }}</text>
							<view class="report-grid">
								<view><text>完成</text><text>{{ run.completedWork || '—' }}</text></view>
								<view><text>证据</text><text>{{ run.evidence || '证据不足' }}</text></view>
								<view><text>下一步</text><text>{{ run.nextStep || '等待下一次判断' }}</text></view>
							</view>
							<view class="report-footer"><text>{{ stageName(run.flywheelStage) }}</text><text :class="{ stop: run.safetyStatus === 'STOP' }">隐私与安全 · {{ run.safetyStatus }}</text></view>
						</view>
					</view>
					<view v-else class="empty-state"><text>第一份日报还没有写入</text><text>自动任务运行后会在这里区分产出、验证结果和现实结果。</text></view>
				</view>
			</block>
		</view>
	</view>
</template>

<script>
import {
	adminCompanyAgent,
	adminCompanyDecision,
	adminCompanyOverview,
	adminStatus,
	adminUnlock
} from '@/api/admin-company';

export default {
	data() {
		return {
			statusBarHeight: 0,
			loading: true,
			allowed: false,
			unlocked: false,
			unlocking: false,
			adminUsername: '',
			adminPassword: '',
			passwordError: '',
			adminToken: '',
			adminExpiresAt: '',
			company: null,
			selectedDepartmentKey: '',
			selectedAgentKey: ''
		};
	},
	computed: {
		primaryDepartment() {
			if (!this.company || !this.company.departments) return null;
			return this.company.departments.find(item => item.key === this.selectedDepartmentKey)
				|| this.company.departments[0] || null;
		},
		activeDepartmentNumber() {
			if (!this.company || !this.primaryDepartment) return '01';
			const index = this.company.departments.findIndex(item => item.key === this.primaryDepartment.key);
			return String(index + 1).padStart(2, '0');
		},
		leadAgent() {
			return this.primaryDepartment && this.primaryDepartment.agents.find(agent => agent.level === 'L1');
		},
		teamAgents() {
			return this.primaryDepartment ? this.primaryDepartment.agents.filter(agent => agent.level !== 'L1') : [];
		},
		selectedAgent() {
			if (!this.primaryDepartment) return null;
			return this.primaryDepartment.agents.find(agent => agent.key === this.selectedAgentKey) || this.leadAgent || null;
		},
		pendingDecisions() {
			return this.company && this.primaryDepartment
				? this.company.decisions.filter(item => item.status === 'PENDING' && item.departmentKey === this.primaryDepartment.key)
				: [];
		},
		departmentRuns() {
			return this.company && this.primaryDepartment
				? this.company.recentRuns.filter(item => item.departmentKey === this.primaryDepartment.key)
				: [];
		},
		activeStageKey() {
			if (this.departmentRuns.length) return this.departmentRuns[0].flywheelStage;
			return 'EXPRESSION';
		},
		activeStageName() {
			return this.stageName(this.activeStageKey);
		},
		operatingSystem() {
			return this.primaryDepartment && this.primaryDepartment.operatingSystem
				? this.primaryDepartment.operatingSystem
				: {};
		},
		hasOperatingSystem() {
			return Object.keys(this.operatingSystem).length > 0;
		},
		isOperationsDepartment() {
			return Boolean(this.primaryDepartment && this.primaryDepartment.key === 'operations');
		},
		acquisitionCampaigns() {
			return this.company && this.company.acquisition && Array.isArray(this.company.acquisition.campaigns)
				? this.company.acquisition.campaigns
				: [];
		}
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
	},
	onShow() {
		this.loadAccess();
	},
	onUnload() {
		this.lockAdmin();
	},
	methods: {
		adminHeaders() {
			return {
				'content-type': 'application/json',
				'x-shroom-admin-token': this.adminToken
			};
		},
		async protectedRequest(method, url, data = {}) {
			try {
				return await this.$http.request({ url, method, data, header: this.adminHeaders() });
			} catch (error) {
				this.lockAdmin();
				throw error;
			}
		},
		lockAdmin() {
			this.unlocked = false;
			this.adminToken = '';
			this.adminExpiresAt = '';
			this.adminUsername = '';
			this.adminPassword = '';
			this.company = null;
		},
		async loadAccess() {
			this.loading = true;
			try {
				const response = await this.$http.request({ url: adminStatus, method: 'GET', header: this.adminHeaders() });
				this.allowed = Boolean(response.data && response.data.allowed);
				this.unlocked = Boolean(response.data && response.data.unlocked);
				if (this.allowed && this.unlocked) await this.loadCompany(false);
			} catch (error) {
				this.allowed = false;
				this.unlocked = false;
			} finally {
				this.loading = false;
			}
		},
		async unlockAdmin() {
			if (this.unlocking || !this.adminUsername || !this.adminPassword) return;
			this.unlocking = true;
			this.passwordError = '';
			try {
				const response = await this.$http.post(adminUnlock, {
					username: this.adminUsername,
					password: this.adminPassword
				});
				this.adminToken = response.data.adminToken;
				this.adminExpiresAt = response.data.expiresAt;
				this.adminPassword = '';
				this.unlocked = true;
				await this.loadCompany(false);
			} catch (error) {
				this.adminPassword = '';
				this.passwordError = String(error || '验证失败，请重试');
			} finally {
				this.unlocking = false;
			}
		},
		async loadCompany(showLoading = true) {
			if (showLoading) this.loading = true;
			try {
				const response = await this.protectedRequest('GET', adminCompanyOverview);
				this.company = response.data || null;
				if (!this.selectedDepartmentKey && this.company && this.company.departments.length) {
					this.selectedDepartmentKey = this.company.departments[0].key;
				}
				if (!this.selectedAgentKey && this.leadAgent) this.selectedAgentKey = this.leadAgent.key;
			} catch (error) {
				this.company = null;
			} finally {
				if (showLoading) this.loading = false;
			}
		},
		selectAgent(agent) {
			this.selectedAgentKey = agent.key;
		},
		selectDepartment(department) {
			this.selectedDepartmentKey = department.key;
			this.selectedAgentKey = '';
			this.$nextTick(() => {
				if (this.leadAgent) this.selectedAgentKey = this.leadAgent.key;
			});
		},
		showCeo() {
			uni.showModal({
				title: 'CEO 决策边界',
				content: this.company.governance.decisionRule,
				showCancel: false,
				confirmColor: '#d9ef63'
			});
		},
		changeAgentStatus(agent) {
			const choices = [
				{ label: '继续运行', value: 'ACTIVE' },
				{ label: '暂停', value: 'PAUSED' },
				{ label: '标记为阻断', value: 'BLOCKED' }
			];
			uni.showActionSheet({
				itemList: choices.map(item => item.label),
				success: async result => {
					const selected = choices[result.tapIndex];
					if (!selected || selected.value === agent.status) return;
					await this.protectedRequest('PATCH', adminCompanyAgent(agent.key), { status: selected.value });
					await this.loadCompany(false);
				}
			});
		},
		resolveDecision(decision) {
			const choices = [
				{ label: '批准部门建议', value: 'APPROVED' },
				{ label: '需要调整后再做', value: 'ADJUSTED' },
				{ label: '暂缓决定', value: 'DEFERRED' },
				{ label: '拒绝', value: 'REJECTED' }
			];
			uni.showActionSheet({
				itemList: choices.map(item => item.label),
				success: result => {
					const selected = choices[result.tapIndex];
					if (!selected) return;
					uni.showModal({
						title: selected.label,
						content: decision.title,
						confirmText: '确认记录',
						confirmColor: '#42634a',
						success: async modal => {
							if (!modal.confirm) return;
							await this.protectedRequest('PATCH', adminCompanyDecision(decision.id), {
								status: selected.value,
								resolutionNote: selected.label
							});
							await this.loadCompany(false);
						}
					});
				}
			});
		},
		statusLabel(status) {
			return { ACTIVE: '运行中', PAUSED: '已暂停', ARCHIVED: '已归档' }[status] || status;
		},
		agentStatusLabel(status) {
			return { ACTIVE: '运行', PAUSED: '暂停', BLOCKED: '阻断' }[status] || status;
		},
		resultStateLabel(state) {
			return {
				OUTPUT: '形成产出',
				VERIFIED: '已验证',
				REAL_WORLD: '现实结果',
				NONE: '暂无结果'
			}[state] || '尚未运行';
		},
		resultClass(state) {
			return String(state || 'none').toLowerCase().replace('_', '-');
		},
		formatStep(value) {
			const number = Number(value) || 0;
			return number < 10 ? `0${number}` : String(number);
		},
		acquisitionTotal(key) {
			return this.acquisitionCampaigns.reduce((total, campaign) => total + Number(campaign[key] || 0), 0);
		},
		stageName(key) {
			if (key === 'SAFETY') return '隐私与安全';
			const stage = this.company && this.company.flywheelStages.find(item => item.key === key);
			return stage ? stage.name : '尚未分类';
		},
		formatDate(value) {
			const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
			return match ? `${match[1]}.${match[2]}.${match[3]}` : '—';
		},
		formatDateTime(value) {
			if (!value) return '没有截止时间';
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return this.formatDate(value);
			return `${date.getMonth() + 1}月${date.getDate()}日`;
		},
		goBack() {
			const pages = getCurrentPages();
			if (pages.length > 1) uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) });
			else uni.switchTab({ url: '/pages/shroom/me' });
		}
	}
};
</script>

<style lang="scss" scoped>
.admin-page { min-height: 100vh; background: #edf4e8; color: #172019; }
.status-bar { background: #edf4e8; }
.admin-shell { box-sizing: border-box; width: 100%; padding: 34rpx 28rpx 120rpx; }
.page-header { display: flex; align-items: flex-start; gap: 22rpx; }
.back-button { display: flex; width: 62rpx; height: 62rpx; flex: 0 0 62rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.68); font-size: 46rpx; }
.header-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.header-kicker, .section-kicker { font-size: 16rpx; font-weight: 720; letter-spacing: 2.8rpx; color: #718075; }
.header-title { margin-top: 8rpx; font-family: Georgia, 'Songti SC', serif; font-size: 48rpx; font-weight: 700; }
.header-description { max-width: 760rpx; margin-top: 13rpx; font-size: 20rpx; line-height: 1.65; color: #6d796f; }
.refresh-button { padding: 13rpx 19rpx; border-radius: 999rpx; background: #172019; font-size: 18rpx; font-weight: 680; color: #eef4e8; }
.state-panel { display: flex; min-height: 480rpx; margin-top: 34rpx; padding: 60rpx 28rpx; align-items: center; justify-content: center; flex-direction: column; border-radius: 34rpx; background: #172019; color: #eef4e8; }
.state-mark { font-family: Georgia, serif; font-size: 64rpx; color: #d9ef63; }
.state-title { margin-top: 20rpx; font-size: 29rpx; font-weight: 720; }
.state-description { max-width: 520rpx; margin-top: 15rpx; text-align: center; font-size: 20rpx; line-height: 1.7; color: #b9c4ba; }
.state-action { margin-top: 30rpx; padding: 16rpx 24rpx; border-radius: 999rpx; background: #d9ef63; font-size: 20rpx; font-weight: 700; color: #172019; }
.unlock-panel { display: flex; box-sizing: border-box; width: 100%; max-width: 650rpx; margin: 45rpx auto 0; padding: 54rpx 38rpx 40rpx; align-items: stretch; flex-direction: column; border-radius: 36rpx; background: #172019; color: #f3f7f0; box-shadow: 0 28rpx 70rpx rgba(23,32,25,.16); }
.unlock-mark { align-self: flex-start; padding: 8rpx 13rpx; border-radius: 999rpx; background: #d9ef63; font-size: 14rpx; font-weight: 800; letter-spacing: 2rpx; color: #26332a; }
.unlock-title { margin-top: 34rpx; font-family: Georgia, 'Songti SC', serif; font-size: 38rpx; font-weight: 700; line-height: 1.3; }
.unlock-description { margin-top: 17rpx; font-size: 19rpx; line-height: 1.7; color: #aebcaf; }
.credential-input { box-sizing: border-box; width: 100%; height: 88rpx; margin-top: 34rpx; padding: 0 24rpx; border: 1rpx solid rgba(255,255,255,.16); border-radius: 20rpx; background: rgba(255,255,255,.08); font-size: 22rpx; color: #f3f7f0; }
.password-input { margin-top: 16rpx; }
.unlock-error { margin-top: 12rpx; font-size: 17rpx; line-height: 1.5; color: #efaaa0; }
.unlock-action { display: flex; min-height: 82rpx; margin-top: 18rpx; align-items: center; justify-content: center; border-radius: 999rpx; background: #d9ef63; font-size: 21rpx; font-weight: 750; color: #172019; }
.unlock-action.disabled { opacity: .48; }
.unlock-back { margin-top: 23rpx; text-align: center; font-size: 18rpx; color: #94a397; }
.department-switcher { width: 100%; margin-top: 28rpx; white-space: nowrap; }
.department-tabs { display: inline-flex; gap: 10rpx; padding-right: 28rpx; }
.department-tab { padding: 14rpx 20rpx; border: 1rpx solid #d9e2d6; border-radius: 999rpx; background: rgba(255,255,255,.68); font-size: 18rpx; color: #68756b; }
.department-tab.active { border-color: #172019; background: #172019; color: #eef4e8; }
.company-hero { margin-top: 35rpx; padding: 42rpx 34rpx; border-radius: 36rpx; background: #172019; color: #f5f8f1; overflow: hidden; }
.hero-topline, .agent-topline, .decision-topline, .report-date, .report-footer { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.hero-topline { font-size: 15rpx; font-weight: 720; letter-spacing: 2.4rpx; color: #aab7ac; }
.status-pill { padding: 8rpx 13rpx; border-radius: 999rpx; background: #d9ef63; letter-spacing: 0; color: #26332a; }
.company-title { display: block; max-width: 800rpx; margin-top: 42rpx; font-family: Georgia, 'Songti SC', serif; font-size: 48rpx; font-weight: 700; }
.company-mission { display: block; max-width: 850rpx; margin-top: 20rpx; font-size: 23rpx; line-height: 1.75; color: #c5d0c6; }
.hero-meta { display: flex; flex-wrap: wrap; gap: 14rpx 44rpx; margin-top: 42rpx; padding-top: 25rpx; border-top: 1rpx solid rgba(255,255,255,.11); }
.hero-meta view { display: flex; min-width: 250rpx; flex: 1; flex-direction: column; gap: 7rpx; }
.hero-meta text:first-child { font-size: 15rpx; letter-spacing: 1.8rpx; color: #87978b; }
.hero-meta text:last-child { font-size: 19rpx; line-height: 1.5; color: #d7dfd7; }
.summary-row { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx; }
.summary-item { display: flex; box-sizing: border-box; min-width: calc(50% - 6rpx); padding: 25rpx 23rpx; flex: 1; flex-direction: column; border-radius: 25rpx; background: rgba(255,255,255,.76); }
.summary-item.decision { background: #f4edcb; }
.summary-value { font-family: Georgia, serif; font-size: 37rpx; font-weight: 700; }
.summary-label { margin-top: 7rpx; font-size: 17rpx; color: #748078; }
.section-block { margin-top: 20rpx; padding: 34rpx 26rpx; border: 1rpx solid rgba(23,32,25,.055); border-radius: 31rpx; background: rgba(255,255,255,.82); box-shadow: 0 16rpx 45rpx rgba(50,75,54,.045); }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20rpx; }
.section-heading > view { display: flex; min-width: 0; flex-direction: column; }
.section-title { margin-top: 8rpx; font-size: 28rpx; font-weight: 730; line-height: 1.35; }
.section-note { flex: 0 0 auto; font-size: 17rpx; color: #748078; }
.flywheel-flow { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 28rpx; }
.flywheel-stage { display: flex; box-sizing: border-box; min-width: 205rpx; padding: 22rpx 20rpx; flex: 1; flex-direction: column; border: 1rpx solid #e2e8df; border-radius: 21rpx; background: #f6f8f3; }
.flywheel-stage.current { border-color: #adc83e; background: #eaf5b6; }
.stage-index { font-family: Georgia, serif; font-size: 16rpx; color: #849088; }
.stage-name { margin-top: 20rpx; font-size: 23rpx; font-weight: 720; }
.stage-description { margin-top: 9rpx; font-size: 17rpx; line-height: 1.55; color: #748078; }
.positioning-panel { display: flex; margin-top: 28rpx; padding: 31rpx; flex-direction: column; border-radius: 25rpx; background: #172019; color: #f4f7f2; }
.positioning-label { font-size: 15rpx; font-weight: 760; letter-spacing: 2rpx; color: #d9ef63; }
.positioning-promise { margin-top: 17rpx; font-family: Georgia, 'Songti SC', serif; font-size: 32rpx; font-weight: 700; line-height: 1.35; }
.positioning-audience, .positioning-boundary { margin-top: 16rpx; font-size: 17rpx; line-height: 1.65; color: #c2cec3; }
.positioning-boundary { margin-top: 6rpx; color: #98a89b; }
.playbook-unit { margin-top: 31rpx; }
.unit-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 20rpx; padding-bottom: 13rpx; border-bottom: 1rpx solid #e1e7de; }
.unit-heading text:first-child { font-size: 14rpx; font-weight: 780; letter-spacing: 2rpx; color: #6f7d72; }
.unit-heading text:last-child { font-size: 18rpx; font-weight: 680; color: #29352c; }
.principle-grid, .phase-list { display: flex; flex-wrap: wrap; gap: 11rpx; margin-top: 17rpx; }
.principle-card { display: flex; box-sizing: border-box; min-width: 250rpx; padding: 22rpx; flex: 1 1 45%; flex-direction: column; border-radius: 20rpx; background: #f3f6f0; }
.playbook-index { font-family: Georgia, serif; font-size: 15rpx; color: #8a968d; }
.playbook-name { margin-top: 15rpx; font-size: 21rpx; font-weight: 730; }
.playbook-copy { margin-top: 8rpx; font-size: 16rpx; line-height: 1.62; color: #69766c; }
.channel-list, .workflow-list, .metric-list { display: flex; margin-top: 17rpx; flex-direction: column; gap: 9rpx; }
.channel-row { display: flex; padding: 20rpx; align-items: flex-start; gap: 20rpx; border-radius: 18rpx; background: #f6f8f4; }
.channel-title, .channel-meta { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }
.channel-title text:first-child { font-size: 21rpx; font-weight: 730; }
.channel-title text:last-child, .channel-meta text { font-size: 16rpx; line-height: 1.55; color: #6f7c72; }
.phase-card { display: flex; box-sizing: border-box; min-width: 280rpx; padding: 23rpx; flex: 1 1 30%; flex-direction: column; border: 1rpx solid #e0e6dd; border-radius: 21rpx; background: #fbfcfa; }
.phase-top { display: flex; align-items: baseline; gap: 11rpx; }
.phase-top text:first-child { font-family: Georgia, serif; font-size: 15rpx; color: #94aa3c; }
.phase-top text:last-child { font-size: 20rpx; font-weight: 730; }
.phase-goal { margin-top: 14rpx; font-size: 17rpx; font-weight: 650; line-height: 1.55; color: #344137; }
.phase-deliverables { display: flex; margin-top: 13rpx; flex-direction: column; gap: 7rpx; }
.phase-deliverables text { font-size: 15rpx; line-height: 1.55; color: #6d796f; }
.workflow-row { display: flex; padding: 18rpx 6rpx; align-items: flex-start; gap: 16rpx; border-bottom: 1rpx solid #e7ebe5; }
.workflow-row:last-child { border-bottom: 0; }
.workflow-step { display: flex; width: 43rpx; height: 43rpx; flex: 0 0 43rpx; align-items: center; justify-content: center; border-radius: 50%; background: #d9ef63; font-family: Georgia, serif; font-size: 14rpx; color: #263329; }
.workflow-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }
.workflow-copy text:first-child { font-size: 19rpx; font-weight: 710; line-height: 1.45; }
.workflow-copy text:last-child { font-size: 16rpx; line-height: 1.58; color: #6f7c72; }
.metric-row { display: flex; padding: 17rpx 19rpx; align-items: flex-start; gap: 18rpx; border-radius: 17rpx; background: #f3f6f0; }
.metric-row text:first-child { width: 170rpx; flex: 0 0 170rpx; font-size: 17rpx; font-weight: 720; }
.metric-row text:last-child { min-width: 0; flex: 1; font-size: 16rpx; line-height: 1.58; color: #6b786e; }
.guardrail-panel { display: flex; margin-top: 31rpx; padding: 25rpx; flex-direction: column; gap: 9rpx; border-radius: 21rpx; background: #f6edcf; }
.guardrail-title { margin-bottom: 5rpx; font-size: 21rpx; font-weight: 740; color: #584d2d; }
.guardrail-item { font-size: 16rpx; line-height: 1.58; color: #796c48; }
.acquisition-summary { display: flex; margin-top: 27rpx; flex-wrap: wrap; gap: 10rpx; }
.acquisition-summary view { display: flex; box-sizing: border-box; min-width: calc(50% - 5rpx); padding: 23rpx 20rpx; flex: 1; flex-direction: column; border-radius: 19rpx; background: #172019; color: #f2f6ef; }
.acquisition-summary text:first-child { font-family: Georgia, serif; font-size: 34rpx; font-weight: 700; color: #d9ef63; }
.acquisition-summary text:last-child { margin-top: 6rpx; font-size: 15rpx; color: #aebcaf; }
.campaign-list { display: flex; margin-top: 13rpx; flex-direction: column; gap: 10rpx; }
.campaign-card { display: flex; padding: 23rpx; flex-direction: column; border: 1rpx solid #dfe6dc; border-radius: 20rpx; background: #f8faf6; }
.campaign-topline { display: flex; justify-content: space-between; gap: 15rpx; font-size: 14rpx; font-weight: 700; letter-spacing: 1rpx; color: #748078; }
.campaign-name { margin-top: 18rpx; font-size: 22rpx; font-weight: 730; }
.campaign-link { margin-top: 8rpx; font-size: 15rpx; line-height: 1.5; color: #7b887e; word-break: break-all; }
.campaign-metrics { display: flex; margin-top: 17rpx; flex-wrap: wrap; gap: 8rpx; }
.campaign-metrics text { padding: 7rpx 10rpx; border-radius: 999rpx; background: #edf3e8; font-size: 14rpx; color: #526057; }
.acquisition-privacy { display: block; margin-top: 17rpx; font-size: 15rpx; line-height: 1.6; color: #748078; }
.org-tree { display: flex; margin-top: 30rpx; align-items: center; flex-direction: column; }
.org-ceo, .org-lead { display: flex; box-sizing: border-box; width: 100%; max-width: 590rpx; padding: 26rpx; align-items: center; flex-direction: column; border-radius: 24rpx; text-align: center; }
.org-ceo { background: #172019; color: #f3f7f0; }
.org-lead { border: 2rpx solid #dce5d9; background: #f7f9f4; }
.org-lead.selected { border-color: #95ad38; background: #edf6c8; }
.org-level { font-size: 15rpx; letter-spacing: 2rpx; color: #aebcaf; }
.org-name { margin-top: 10rpx; font-size: 26rpx; font-weight: 740; }
.org-result { margin-top: 10rpx; font-size: 17rpx; line-height: 1.55; color: #77827a; }
.org-ceo .org-result { color: #b5c1b6; }
.org-line { width: 2rpx; height: 26rpx; background: #ccd6ca; }
.org-line.branch { height: 34rpx; }
.agent-grid { display: flex; width: 100%; flex-wrap: wrap; gap: 12rpx; }
.agent-card { display: flex; box-sizing: border-box; min-width: 280rpx; min-height: 225rpx; padding: 23rpx; flex: 1 1 30%; flex-direction: column; border: 2rpx solid transparent; border-radius: 23rpx; background: #f3f6f0; }
.agent-card.selected { border-color: #9ab43d; background: #edf6c8; }
.agent-card.gate { background: #f7f0dd; }
.agent-card.gate.selected { border-color: #a88742; }
.agent-topline { font-size: 15rpx; font-weight: 680; color: #78847c; }
.agent-name { margin-top: 25rpx; font-size: 23rpx; font-weight: 730; }
.agent-focus { margin-top: 10rpx; flex: 1; font-size: 17rpx; line-height: 1.55; color: #707d73; }
.agent-result-state { align-self: flex-start; margin-top: 17rpx; padding: 7rpx 11rpx; border-radius: 999rpx; background: rgba(255,255,255,.72); font-size: 15rpx; color: #627067; }
.agent-detail { margin-top: 18rpx; padding: 28rpx; border-radius: 24rpx; background: #172019; color: #eef4e8; }
.detail-header { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.detail-header > view:first-child { display: flex; min-width: 0; flex-direction: column; }
.detail-level { font-size: 15rpx; letter-spacing: 2rpx; color: #95a497; }
.detail-title { margin-top: 7rpx; font-size: 27rpx; font-weight: 720; }
.status-action { flex: 0 0 auto; padding: 11rpx 16rpx; border-radius: 999rpx; background: #d9ef63; font-size: 16rpx; font-weight: 680; color: #243127; }
.detail-columns { display: flex; flex-wrap: wrap; gap: 22rpx; margin-top: 27rpx; }
.detail-columns view { display: flex; min-width: 240rpx; flex: 1; flex-direction: column; gap: 8rpx; }
.detail-columns text:first-child { font-size: 15rpx; color: #8fa092; }
.detail-columns text:last-child { font-size: 18rpx; line-height: 1.65; color: #d3ddd4; }
.decision-list, .report-list { display: flex; margin-top: 26rpx; flex-direction: column; gap: 13rpx; }
.decision-card { padding: 28rpx; border-radius: 24rpx; background: #f6edc9; }
.decision-topline { font-size: 15rpx; color: #7e714c; }
.decision-topline text:first-child { font-weight: 750; letter-spacing: 1.5rpx; }
.decision-title { display: block; margin-top: 23rpx; font-size: 26rpx; font-weight: 740; line-height: 1.4; }
.decision-copy { display: block; margin-top: 12rpx; font-size: 18rpx; line-height: 1.7; color: #756b4e; }
.decision-options { display: flex; margin-top: 19rpx; flex-direction: column; gap: 9rpx; }
.decision-options view { display: flex; padding: 15rpx 17rpx; flex-direction: column; gap: 5rpx; border-radius: 15rpx; background: rgba(255,255,255,.55); }
.decision-options text:first-child { font-size: 18rpx; font-weight: 700; }
.decision-options text:last-child { font-size: 16rpx; line-height: 1.55; color: #776d52; }
.recommendation { display: flex; margin-top: 18rpx; padding-top: 18rpx; flex-direction: column; gap: 7rpx; border-top: 1rpx solid rgba(91,78,37,.13); }
.recommendation text:first-child { font-size: 15rpx; font-weight: 700; color: #8a7950; }
.recommendation text:last-child { font-size: 19rpx; line-height: 1.6; }
.decision-action { display: flex; margin-top: 22rpx; padding: 16rpx 20rpx; justify-content: center; border-radius: 999rpx; background: #172019; font-size: 18rpx; font-weight: 700; color: #f4f7f2; }
.empty-state { display: flex; margin-top: 25rpx; padding: 35rpx 25rpx; align-items: center; flex-direction: column; border-radius: 22rpx; background: #f3f6f0; text-align: center; }
.empty-state text:first-child { font-size: 23rpx; font-weight: 720; }
.empty-state text:last-child { max-width: 580rpx; margin-top: 10rpx; font-size: 17rpx; line-height: 1.65; color: #748078; }
.report-card { padding: 26rpx; border: 1rpx solid #e2e8df; border-radius: 23rpx; background: #fbfcfa; }
.report-date { font-size: 16rpx; color: #758179; }
.result-badge { padding: 7rpx 11rpx; border-radius: 999rpx; background: #edf0eb; font-size: 14rpx; font-weight: 700; }
.result-badge.verified { background: #eaf5b6; color: #536617; }
.result-badge.real-world { background: #dcebdd; color: #38613f; }
.result-badge.none { background: #f0e1dc; color: #84534b; }
.report-bottleneck { display: block; margin-top: 19rpx; font-size: 24rpx; font-weight: 720; line-height: 1.45; }
.report-grid { display: flex; margin-top: 20rpx; flex-wrap: wrap; gap: 18rpx; }
.report-grid view { display: flex; min-width: 245rpx; flex: 1; flex-direction: column; gap: 7rpx; }
.report-grid text:first-child { font-size: 15rpx; color: #819087; }
.report-grid text:last-child { font-size: 17rpx; line-height: 1.6; color: #5f6d63; }
.report-footer { margin-top: 21rpx; padding-top: 17rpx; border-top: 1rpx solid #e7ebe5; font-size: 15rpx; color: #6d7a71; }
.report-footer .stop { color: #a14942; font-weight: 700; }
/* #ifdef H5 */
@media (min-width: 920px) {
	.admin-page { box-sizing: border-box; padding-left: 96px; }
	.status-bar { display: none; }
	.admin-shell { max-width: 1180px; margin: 0 auto; padding: 58px 44px 110px; }
	.summary-item { min-width: 170px; }
	.company-hero { padding: 48px; }
	.section-block { padding: 34px; }
	.principle-card { min-width: 310px; }
}
/* #endif */
</style>
