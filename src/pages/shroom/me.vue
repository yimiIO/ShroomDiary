<template>
	<view class="me-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="me-shell">
			<view class="me-header">
				<view class="header-copy">
					<text class="header-kicker">PERSONAL SPACE</text>
					<text class="header-title">我的</text>
					<text class="header-subtitle">你的记录、理解与关系，都从这里回到自己。</text>
				</view>
				<view class="space-status">
					<view class="status-dot"></view>
					<text>私密空间</text>
				</view>
			</view>

			<view class="profile-grid">
				<view class="identity-panel">
					<view class="brand-mark">
						<view class="mark-cap"></view>
						<view class="mark-stem"></view>
					</view>
					<view class="identity-copy" v-if="hasLogin">
						<text class="identity-kicker">MY SHROOM SPACE</text>
						<text class="identity-name">{{ displayName }}</text>
						<text class="identity-note">每一次记录，都在让你更清楚地看见自己。</text>
					</view>
					<view class="identity-copy" v-else>
						<text class="identity-kicker">YOUR PRIVATE SPACE</text>
						<text class="identity-name">把自己慢慢记回来</text>
						<text class="identity-note">登录后，日记、菇卡与练习记录会安全地回到你的空间。</text>
					</view>
					<view class="login-button" v-if="!hasLogin" @tap="goLogin">登录 / 注册</view>
				</view>

				<view class="daily-note">
					<text class="note-label">TODAY'S NOTE</text>
					<text class="note-quote">“不必急着成为答案，先认真地成为问题。”</text>
					<text class="note-caption">Shroom 提醒你：真实比完美更有生命力。</text>
				</view>
			</view>

			<view v-if="hasCompoundSystemAccess" class="compound-entry" @tap="openCompoundSystem">
				<view class="compound-symbol">∞</view>
				<view class="compound-copy">
					<text class="compound-kicker">PERSONAL OPERATING RHYTHM</text>
					<text class="compound-title">复利系统</text>
					<text class="compound-description">{{ compoundDescription }}</text>
					<view class="compound-accounts">
						<text>系统</text><text>金融</text><text>信用</text><text>身体</text>
					</view>
				</view>
				<view class="compound-progress">
					<text v-if="compoundOverview">{{ compoundOverview.progress.completed }}/{{ compoundOverview.progress.total }}</text>
					<text v-else>进入</text>
					<text class="compound-arrow">›</text>
				</view>
			</view>

			<view class="menu-columns">
				<view class="menu-section">
					<view class="section-heading">
						<text class="section-label">我的记录</text>
						<text v-if="journalStats" class="year-summary">{{ journalStats.year }} · {{ journalStats.yearDays }} 天</text>
					</view>
					<view class="menu-card">
						<view class="menu-item" @tap="openDiarySearch">
							<view class="menu-icon green">≡</view>
							<view class="menu-copy">
								<text class="menu-title">日记归档</text>
								<text class="menu-description">{{ diarySummary }}</text>
							</view>
							<text class="menu-arrow">›</text>
						</view>
						<view class="menu-item" @tap="openInquiries">
							<view class="menu-icon green">?</view>
							<view class="menu-copy">
								<text class="menu-title">未解之问</text>
								<text class="menu-description">{{ inquiryDescription }}</text>
							</view>
							<text class="menu-arrow">›</text>
						</view>
						<view class="menu-item" @tap="openCards">
							<view class="menu-icon yellow">◇</view>
							<view class="menu-copy">
								<text class="menu-title">我的菇卡</text>
								<text class="menu-description">带到下一次相似时刻的理解</text>
							</view>
							<text class="menu-arrow">›</text>
						</view>
						<view class="menu-item" @tap="openFriends">
							<view class="menu-icon rose">◎</view>
							<view class="menu-copy">
								<text class="menu-title">我的人脉</text>
								<text class="menu-description">互动、信任与承诺</text>
							</view>
							<text class="menu-arrow">›</text>
						</view>
						<view class="menu-item" @tap="openTodos">
							<view class="menu-icon blue">✓</view>
							<view class="menu-copy">
								<text class="menu-title">我的待办</text>
								<text class="menu-description">把想做的事放进今天</text>
							</view>
							<text class="menu-arrow">›</text>
						</view>
					</view>
				</view>

				<view class="menu-section">
					<text class="section-label">理解与复盘</text>
					<view class="menu-card">
						<view class="menu-item" @tap="openObservers">
							<view class="menu-icon green">◉</view>
							<view class="menu-copy"><text class="menu-title">我的观察席</text><text class="menu-description">选择谁来陪你重新看见日记</text></view>
							<text class="menu-arrow">›</text>
						</view>
						<view class="menu-item" @tap="openLifeOs">
							<view class="menu-icon green">R</view>
							<view class="menu-copy"><text class="menu-title">人生 OS</text><text class="menu-description">{{ lifeOsDescription }}</text></view>
							<text class="menu-arrow">›</text>
						</view>
						<view class="menu-item" @tap="openReminders">
							<view class="menu-icon rose">!</view>
							<view class="menu-copy"><text class="menu-title">关系提醒</text><text class="menu-description">联系、承诺与月度复盘</text></view>
							<text class="menu-arrow">›</text>
						</view>
					</view>
				</view>

				<view class="menu-section">
					<text class="section-label">空间与隐私</text>
					<view class="privacy-card">
						<text class="privacy-title">你始终决定谁能看见</text>
						<text class="privacy-copy">日记默认属于你。只有当你主动把菇卡设为公开，它才会出现在发现广场。</text>
						<view class="privacy-badges">
							<text>私密</text>
							<text>匿名公开</text>
							<text>实名公开</text>
						</view>
					</view>
					<view class="export-row" @tap="openExport"><view><text>带走我的数据</text><text>完整备份或生成脱敏副本</text></view><text>›</text></view>
				</view>
			</view>

			<view class="account-row" v-if="hasLogin" @tap="logout">
				<text>退出当前账号</text>
				<text>›</text>
			</view>
			<text class="version">SHROOM · 日记，理解，连接</text>
		</view>
	</view>
</template>

<script>
import { diaryStats } from '@/api/diary';
import { lifeOsConfig } from '@/api/shroom-system';
import { COMPOUND_OWNER_USER_ID, compoundToday } from '@/api/compound-system';
import { inquirySummary } from '@/api/inquiry';

export default {
	data() {
		return {
			statusBarHeight: 0,
			journalStats: null,
			lifeOs: null,
			inquiryOverview: null,
			compoundOverview: null
		};
	},
	computed: {
		hasLogin() {
			return this.$mStore.getters.hasLogin;
		},
		userInfo() {
			return this.$mStore.state.userInfo || {};
		},
		hasCompoundSystemAccess() {
			return this.hasLogin && this.userInfo.id === COMPOUND_OWNER_USER_ID;
		},
		compoundDescription() {
			if (!this.compoundOverview) return '让正确的事持续发生，并尽量脱离重复劳动';
			const { completed, total } = this.compoundOverview.progress || { completed: 0, total: 0 };
			return `今日必做 ${completed}/${total} · Codex 与每日打卡自动同步`;
		},
		displayName() {
			return this.userInfo.nickname || this.userInfo.realname || this.userInfo.mobile || '我的 Shroom';
		},
		diarySummary() {
			if (!this.hasLogin) return '搜索你写下的时刻';
			if (!this.journalStats) return '正在整理你的记录';
			if (!this.journalStats.yearEntries) return '今年的第一篇，随时都可以开始';
			const total = this.journalStats.totalEntries > this.journalStats.yearEntries
				? ` · 累计 ${this.journalStats.totalEntries} 篇`
				: '';
			return `今年写下 ${this.journalStats.yearEntries} 篇${total}`;
		},
		lifeOsDescription() {
			if (!this.hasLogin) return '跨情境的判断、取舍与边界';
			if (!this.lifeOs || !this.lifeOs.configured) return '从多篇日记与菇卡提炼上层原则';
			const clauseCount = Number(this.lifeOs.activeClauseCount || 0);
			if (!clauseCount) return `V${this.lifeOs.version} · 等待整理为少量当前原则`;
			const pending = Number(this.lifeOs.pendingProposalCount || 0) ? ' · 有待确认建议' : '';
			return `V${this.lifeOs.version} · ${clauseCount} 条当前原则${pending}`;
		},
		inquiryDescription() {
			if (!this.hasLogin) return '把暂时想不明白的事留给时间';
			if (!this.inquiryOverview || !this.inquiryOverview.openCount) return '留下问题，让日记慢慢提供线索';
			const due = Number(this.inquiryOverview.reviewDueCount || 0);
			return `${this.inquiryOverview.openCount} 个正在想${due ? ` · ${due} 个适合再看看` : ''}`;
		}
	},
	onLoad() {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
	},
	onShow() {
		if (this.hasLogin) {
			this.loadDiaryStats();
			this.loadLifeOs();
			this.loadInquiries();
			if (this.hasCompoundSystemAccess) this.loadCompoundOverview();
		}
	},
	methods: {
		async loadDiaryStats() {
			try {
				const response = await this.$http.get(diaryStats);
				this.journalStats = response.data;
			} catch (error) {
				this.journalStats = null;
			}
		},
		async loadLifeOs() {
			try {
				const response = await this.$http.get(lifeOsConfig);
				this.lifeOs = response.data || null;
			} catch (error) {
				this.lifeOs = null;
			}
		},
		async loadInquiries() {
			try {
				const response = await this.$http.get(inquirySummary);
				this.inquiryOverview = response.data || null;
			} catch (error) {
				this.inquiryOverview = null;
			}
		},
		async loadCompoundOverview() {
			try {
				const response = await this.$http.get(compoundToday);
				this.compoundOverview = response.data || null;
			} catch (error) {
				this.compoundOverview = null;
			}
		},
		goLogin() {
			uni.navigateTo({ url: '/pages/public/login' });
		},
		openDiarySearch() {
			uni.navigateTo({ url: '/pages/common/diary/search' });
		},
		openCards() {
			uni.switchTab({ url: '/pages/shroom/cards' });
		},
		openInquiries() {
			uni.navigateTo({ url: '/pages/shroom/inquiries' });
		},
		openFriends() {
			uni.navigateTo({ url: '/pages/shroom/friends' });
		},
		openTodos() {
			uni.navigateTo({ url: '/pages/todo/list' });
		},
		openLifeOs() {
			uni.navigateTo({ url: '/pages/shroom/life-os-plan' });
		},
		openObservers() {
			uni.navigateTo({ url: '/pages/shroom/observers' });
		},
		openCompoundSystem() {
			uni.navigateTo({ url: '/pages/shroom/compound' });
		},
		openReminders() {
			uni.navigateTo({ url: '/pages/shroom/reminders' });
		},
		openExport() {
			uni.navigateTo({ url: '/pages/shroom/export' });
		},
		logout() {
			uni.showModal({
				title: '退出登录',
				content: '本机未同步的内容请先确认已保存。',
				confirmText: '退出',
				confirmColor: '#b14b43',
				success: res => {
					if (res.confirm) this.$mStore.commit('logout');
				}
			});
		}
	}
};
</script>

<style lang="scss" scoped>
.me-page {
	display: block;
	box-sizing: border-box;
	width: 100%;
	min-height: 100vh;
	background: #f1f8e9;
	color: #172019;
}

.status-bar {
	display: block;
	background: #f1f8e9;
}

.me-shell {
	display: block;
	box-sizing: border-box;
	width: 100%;
	padding: 40rpx 36rpx calc(180rpx + env(safe-area-inset-bottom));
}

.me-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 24rpx;
	margin: 0 6rpx 38rpx;
}

.header-copy,
.profile-grid {
	display: block;
}

.header-kicker,
.header-title,
.header-subtitle {
	display: block;
}

.header-kicker {
	font-size: 18rpx;
	font-weight: 720;
	letter-spacing: 3rpx;
	color: #718075;
}

.header-title {
	margin-top: 12rpx;
	font-size: 52rpx;
	font-weight: 740;
	line-height: 1.15;
}

.header-subtitle {
	margin-top: 14rpx;
	font-size: 22rpx;
	line-height: 1.65;
	color: #728075;
}

.space-status {
	display: flex;
	align-items: center;
	gap: 9rpx;
	padding: 12rpx 16rpx;
	flex: 0 0 auto;
	border: 1rpx solid rgba(23, 32, 25, .08);
	border-radius: 999rpx;
	background: rgba(255, 255, 255, .72);
	font-size: 18rpx;
	font-weight: 650;
	color: #536357;
}

.status-dot {
	width: 8rpx;
	height: 8rpx;
	border-radius: 50%;
	background: #59725e;
}

.profile-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 22rpx;
}

.identity-panel {
	display: block;
	position: relative;
	padding: 48rpx 38rpx 42rpx;
	border-radius: 36rpx;
	background: #172019;
	color: #fff;
	overflow: hidden;
}

.identity-panel::after {
	content: '';
	position: absolute;
	right: -100rpx;
	top: -145rpx;
	width: 360rpx;
	height: 360rpx;
	border: 1rpx solid rgba(255, 255, 255, .1);
	border-radius: 50%;
	box-shadow: 0 0 0 55rpx rgba(255, 255, 255, .025), 0 0 0 110rpx rgba(255, 255, 255, .018);
}

.brand-mark {
	display: block;
	position: relative;
	width: 65rpx;
	height: 60rpx;
	margin-bottom: 60rpx;
}

.mark-cap {
	position: absolute;
	left: 0;
	top: 0;
	width: 65rpx;
	height: 34rpx;
	border-radius: 50rpx 50rpx 17rpx 17rpx;
	background: #e5efd9;
}

.mark-stem {
	position: absolute;
	left: 27rpx;
	top: 26rpx;
	width: 15rpx;
	height: 32rpx;
	border-radius: 0 0 12rpx 12rpx;
	background: #e5efd9;
}

.identity-copy {
	position: relative;
	z-index: 1;
}

.identity-kicker,
.identity-name,
.identity-note {
	display: block;
}

.identity-kicker,
.note-label,
.section-label {
	font-size: 19rpx;
	font-weight: 700;
	letter-spacing: 2.7rpx;
}

.identity-kicker {
	color: #aebcac;
}

.identity-name {
	max-width: 520rpx;
	margin-top: 18rpx;
	font-size: 46rpx;
	font-weight: 720;
	line-height: 1.25;
}

.identity-note {
	max-width: 500rpx;
	margin-top: 21rpx;
	font-size: 23rpx;
	line-height: 1.7;
	color: #becabd;
}

.login-button {
	position: relative;
	z-index: 1;
	display: inline-flex;
	margin-top: 31rpx;
	padding: 17rpx 25rpx;
	border-radius: 999rpx;
	background: #e5efd9;
	font-size: 22rpx;
	font-weight: 700;
	color: #172019;
}

.daily-note {
	display: block;
	box-sizing: border-box;
	padding: 36rpx 34rpx;
	border: 1rpx solid rgba(96, 90, 59, .08);
	border-radius: 32rpx;
	background: #f6f1d8;
}

.compound-entry {
	display: flex;
	align-items: center;
	box-sizing: border-box;
	min-height: 190rpx;
	margin-top: 24rpx;
	padding: 30rpx 28rpx;
	border-radius: 32rpx;
	background: #233b2b;
	box-shadow: 0 18rpx 50rpx rgba(35, 59, 43, .14);
	color: #fff;
}

.compound-symbol {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 78rpx;
	height: 78rpx;
	flex: 0 0 78rpx;
	border-radius: 24rpx;
	background: #d9ef63;
	font-size: 45rpx;
	font-weight: 760;
	color: #233b2b;
}

.compound-copy {
	min-width: 0;
	flex: 1;
	margin-left: 24rpx;
}

.compound-kicker,
.compound-title,
.compound-description {
	display: block;
}

.compound-kicker {
	font-size: 16rpx;
	font-weight: 700;
	letter-spacing: 2.4rpx;
	color: #aebcac;
}

.compound-title {
	margin-top: 7rpx;
	font-size: 31rpx;
	font-weight: 740;
}

.compound-description {
	margin-top: 8rpx;
	font-size: 20rpx;
	line-height: 1.55;
	color: #becabd;
}

.compound-accounts {
	display: flex;
	flex-wrap: wrap;
	gap: 8rpx;
	margin-top: 14rpx;
}

.compound-accounts text {
	padding: 5rpx 10rpx;
	border: 1rpx solid rgba(255, 255, 255, .14);
	border-radius: 999rpx;
	font-size: 16rpx;
	color: #d9e3d5;
}

.compound-progress {
	display: flex;
	align-items: center;
	margin-left: 18rpx;
	font-size: 24rpx;
	font-weight: 720;
	color: #d9ef63;
}

.compound-arrow {
	margin-left: 8rpx;
	font-size: 42rpx;
	font-weight: 300;
}

.note-label {
	display: block;
	color: #718274;
}

.note-quote {
	display: block;
	margin-top: 24rpx;
	font-family: Georgia, 'Songti SC', serif;
	font-size: 32rpx;
	font-weight: 650;
	line-height: 1.6;
}

.note-caption {
	display: block;
	margin-top: 16rpx;
	font-size: 22rpx;
	color: #78857a;
}

.menu-columns {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 30rpx;
	margin-top: 48rpx;
}

.menu-section,
.menu-card,
.privacy-card {
	display: block;
}

.section-label {
	display: block;
	margin: 0 8rpx 17rpx;
	color: #738176;
}

.section-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	min-height: 36rpx;
	margin: 0 8rpx 17rpx;
}

.section-heading .section-label {
	margin: 0;
}

.year-summary {
	padding: 7rpx 13rpx;
	border: 1rpx solid rgba(23, 32, 25, .08);
	border-radius: 999rpx;
	background: rgba(255, 255, 255, .58);
	font-size: 18rpx;
	font-weight: 650;
	color: #5f7063;
}

.menu-card,
.privacy-card {
	border: 1rpx solid rgba(23, 32, 25, .06);
	border-radius: 28rpx;
	background: #fff;
	box-shadow: 0 18rpx 50rpx rgba(58, 80, 60, .065);
}

.menu-card {
	padding: 4rpx 27rpx;
}

.menu-item {
	display: flex;
	align-items: center;
	padding: 27rpx 0;
	border-bottom: 1rpx solid #eef1ed;
}

.menu-item:last-child {
	border-bottom: 0;
}

.menu-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 65rpx;
	height: 65rpx;
	margin-right: 20rpx;
	border-radius: 21rpx;
	font-size: 28rpx;
	font-weight: 700;
}

.menu-icon.green { background: #e5efd9; color: #526b55; }
.menu-icon.yellow { background: #f6edc9; color: #7e713e; }
.menu-icon.blue { background: #dfeeed; color: #476c69; }
.menu-icon.rose { background: #f0e1dc; color: #7b5047; }

.menu-copy {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 6rpx;
}

.menu-title {
	font-size: 25rpx;
	font-weight: 650;
}

.menu-description {
	font-size: 21rpx;
	color: #7b877e;
}

.menu-arrow {
	font-size: 39rpx;
	font-weight: 300;
	color: #9ba49d;
}

.privacy-card {
	padding: 34rpx;
	background: #f6f3e6;
}

.privacy-title,
.privacy-copy {
	display: block;
}

.privacy-title {
	font-size: 28rpx;
	font-weight: 690;
}

.privacy-copy {
	margin-top: 16rpx;
	font-size: 23rpx;
	line-height: 1.75;
	color: #6d6a59;
}

.privacy-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 10rpx;
	margin-top: 27rpx;
}

.privacy-badges text {
	padding: 9rpx 14rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, .68);
	font-size: 19rpx;
	color: #706b52;
}

.export-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 20rpx;
	margin-top: 14rpx;
	padding: 25rpx 29rpx;
	border: 1rpx solid rgba(23, 32, 25, .06);
	border-radius: 24rpx;
	background: rgba(255, 255, 255, .72);
}

.export-row > view {
	display: flex;
	flex-direction: column;
	gap: 6rpx;
}

.export-row > view text:first-child {
	font-size: 23rpx;
	font-weight: 670;
}

.export-row > view text:last-child {
	font-size: 19rpx;
	color: #7b877e;
}

.export-row > text {
	font-size: 35rpx;
	color: #929d94;
}

.account-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: 34rpx;
	padding: 25rpx 27rpx;
	border: 1rpx solid rgba(23, 32, 25, .07);
	border-radius: 24rpx;
	background: rgba(255, 255, 255, .55);
	font-size: 23rpx;
	color: #7a5d57;
}

.version {
	display: block;
	margin-top: 35rpx;
	text-align: center;
	font-size: 17rpx;
	letter-spacing: 2rpx;
	color: #92a095;
}

/* #ifdef H5 */
@media (min-width: 1024px) {
	.me-page {
		padding-left: 96px;
	}

	.me-shell {
		max-width: 1180px;
		margin: 0 auto;
		padding: 58px 56px 90px;
	}

	.me-header {
		margin-bottom: 32px;
	}

	.header-title {
		font-size: 48px;
	}

	.header-subtitle {
		font-size: 15px;
	}

	.profile-grid {
		grid-template-columns: minmax(0, 1.22fr) minmax(300px, .78fr);
		gap: 24px;
	}

	.identity-panel {
		padding: 42px;
		border-radius: 34px;
	}

	.identity-name {
		font-size: 38px;
	}

	.daily-note {
		display: flex;
		padding: 38px;
		flex-direction: column;
		justify-content: flex-end;
		border-radius: 28px;
	}

	.note-quote {
		max-width: 420px;
		font-size: 25px;
	}

	.menu-columns {
		grid-template-columns: 1.15fr .85fr;
		gap: 24px;
	}
}
/* #endif */
</style>
