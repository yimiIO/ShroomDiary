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
				<view class="settings-entry" data-testid="me-settings" @tap="openSettings"><text>⚙</text><text>设置</text></view>
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

			<view v-if="hasLogin" class="compound-entry" :class="{ locked: !featureActive('compound') }" @tap="openCompoundSystem">
				<view class="compound-symbol">∞</view>
				<view class="compound-copy">
					<text class="compound-kicker">PERSONAL OPERATING RHYTHM</text>
					<text class="compound-title">复利系统</text>
					<text class="compound-description">{{ compoundDescription }}</text>
					<view class="compound-accounts"><text>发现复利</text><text>控制投入</text><text>验证回报</text></view>
				</view>
				<view class="compound-progress">
					<text v-if="!featureActive('compound')">10 菇点解锁</text>
					<text v-else-if="compoundOverview && compoundOverview.current">继续</text>
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
						<view class="menu-item" :class="{ locked: !featureActive('wellbeing') }" @tap="openWellbeing">
							<view class="menu-icon green">◌</view>
							<view class="menu-copy">
								<text class="menu-title">身心记录</text>
								<text class="menu-description">{{ wellbeingDescription }}</text>
							</view>
							<text v-if="!featureActive('wellbeing')" class="lock-price">10 菇点</text><text v-else class="menu-arrow">›</text>
						</view>
						<view class="menu-item" :class="{ locked: !featureActive('inquiries') }" @tap="openInquiries">
							<view class="menu-icon green">?</view>
							<view class="menu-copy">
								<text class="menu-title">未解之问</text>
								<text class="menu-description">{{ inquiryDescription }}</text>
							</view>
							<text v-if="!featureActive('inquiries')" class="lock-price">10 菇点</text><text v-else class="menu-arrow">›</text>
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
						<view class="menu-item" data-testid="me-inbox" @tap="openInbox">
							<view class="menu-icon green">信</view>
							<view class="menu-copy"><text class="menu-title">收件箱</text><text class="menu-description">每日总结与来自菇的私人提醒</text></view>
							<text v-if="inboxUnreadCount" class="unread-count">{{ inboxUnreadCount > 99 ? '99+' : inboxUnreadCount }}</text><text v-else class="menu-arrow">›</text>
						</view>
						<view class="menu-item" data-testid="me-daily-review" @tap="openDailyReview">
							<view class="menu-icon green">日</view>
							<view class="menu-copy"><text class="menu-title">菇每日总结</text><text class="menu-description">事实、人生 OS、复利与委派建议</text></view>
							<text class="menu-arrow">›</text>
						</view>
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

			</view>

			<text class="version">SHROOM · 日记，理解，连接</text>
		</view>
	</view>
</template>

<script>
import { diaryStats } from '@/api/diary';
import { lifeOsConfig } from '@/api/shroom-system';
import { compoundHome } from '@/api/compound-system';
import { inquirySummary } from '@/api/inquiry';
import { wellbeingSummary } from '@/api/wellbeing';
import { billingOverview } from '@/api/billing';
import { dailyReviewInboxUnread } from '@/api/daily-review';
import { handleInboxSnapshot } from '@/utils/inbox-notifications';

export default {
	data() {
		return {
			statusBarHeight: 0,
			journalStats: null,
			lifeOs: null,
			inquiryOverview: null,
			wellbeingOverview: null,
			compoundOverview: null,
			billing: null,
			inboxUnreadCount: 0
		};
	},
	computed: {
		hasLogin() {
			return this.$mStore.getters.hasLogin;
		},
		userInfo() {
			return this.$mStore.state.userInfo || {};
		},
		compoundDescription() {
			if (!this.featureActive('compound')) return '10 菇点一次解锁 · AI 调用另行扣点';
			if (!this.compoundOverview || !this.compoundOverview.current) return '从通用复利机会地图中，找到适合自己的积累';
			return `正在验证：${this.compoundOverview.current.title || this.compoundOverview.current.itemName}`;
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
			if (!this.featureActive('inquiries')) return '10 菇点一次解锁 · AI 调用另行扣点';
			if (!this.hasLogin) return '把暂时想不明白的事留给时间';
			if (!this.inquiryOverview || !this.inquiryOverview.openCount) return '留下问题，让日记慢慢提供线索';
			const due = Number(this.inquiryOverview.reviewDueCount || 0);
			return `${this.inquiryOverview.openCount} 个正在想${due ? ` · ${due} 个适合再看看` : ''}`;
		},
		wellbeingDescription() {
			if (!this.featureActive('wellbeing')) return '10 菇点一次解锁 · 不构成医疗诊断';
			if (!this.hasLogin) return '心理、身体、睡眠与生活变化';
			if (!this.wellbeingOverview) return '正在整理你的长期变化';
			const pending = Number(this.wellbeingOverview.pendingCount || 0);
			const confirmed = Number(this.wellbeingOverview.confirmedCount || 0);
			if (pending) return `${pending} 条等待确认 · ${confirmed} 条已沉淀`;
			return confirmed ? `${confirmed} 条独立记录` : '心理、身体、睡眠与生活变化';
		}
	},
	onLoad() {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
	},
	async onShow() {
		if (this.hasLogin) {
			await this.loadBilling();
			this.loadDiaryStats();
			this.loadLifeOs();
			if (this.featureActive('inquiries')) this.loadInquiries();
			if (this.featureActive('wellbeing')) this.loadWellbeing();
			if (this.featureActive('compound')) this.loadCompoundOverview();
			this.loadInboxUnread();
		}
	},
	methods: {
		async loadBilling() {
			try { this.billing = (await this.$http.get(billingOverview)).data || null; }
			catch (error) { this.billing = null; }
		},
		featureActive(key) {
			if (!this.billing || !this.billing.enabled) return true;
			const feature = (this.billing.features || []).find(item => item.key === key);
			return Boolean(feature && feature.active);
		},
		openPaidFeature(key, path) {
			if (this.featureActive(key)) {
				uni.navigateTo({ url: path });
				return;
			}
			const feature = (this.billing.features || []).find(item => item.key === key);
			uni.showModal({
				title: `解锁${feature ? feature.name : '高级功能'}`,
				content: '10 菇点一次解锁，长期使用。功能内 AI 分析按成功调用另行扣点。',
				cancelText: '暂不',
				confirmText: '去解锁',
				confirmColor: '#42634a',
				success: result => { if (result.confirm) uni.navigateTo({ url: `/pages/shroom/wallet?feature=${key}` }); }
			});
		},
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
		async loadWellbeing() {
			try { const response = await this.$http.get(wellbeingSummary); this.wellbeingOverview = response.data || null; }
			catch (error) { this.wellbeingOverview = null; }
		},
		async loadCompoundOverview() {
			try {
				const response = await this.$http.get(compoundHome);
				this.compoundOverview = response.data || null;
			} catch (error) {
				this.compoundOverview = null;
			}
		},
		async loadInboxUnread() {
			try {
				const response = await this.$http.get(dailyReviewInboxUnread);
				this.inboxUnreadCount = Number(response.data && response.data.unreadCount || 0);
				handleInboxSnapshot(response.data || {}, { notify: false });
			} catch (error) { this.inboxUnreadCount = 0; }
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
			this.openPaidFeature('inquiries', '/pages/shroom/inquiries');
		},
		openWellbeing() {
			this.openPaidFeature('wellbeing', '/pages/shroom/wellbeing');
		},
		openFriends() {
			uni.navigateTo({ url: '/pages/shroom/friends' });
		},
		openTodos() {
			uni.navigateTo({ url: '/pages/todo/list' });
		},
		openLifeOs() {
			uni.navigateTo({ url: '/pages/shroom/life-os' });
		},
		openDailyReview() {
			uni.navigateTo({ url: '/pages/shroom/daily-review' });
		},
		openInbox() {
			uni.navigateTo({ url: '/pages/shroom/inbox' });
		},
		openObservers() {
			uni.navigateTo({ url: '/pages/shroom/observers' });
		},
		openCompoundSystem() {
			this.openPaidFeature('compound', '/pages/shroom/compound');
		},
		openReminders() {
			uni.navigateTo({ url: '/pages/shroom/reminders' });
		},
		openSettings() {
			uni.navigateTo({ url: '/pages/shroom/settings' });
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

.header-copy {
	min-width: 0;
	flex: 1;
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

.settings-entry {
	display: flex;
	align-items: center;
	flex: 0 0 auto;
	gap: 8rpx;
	padding: 11rpx 16rpx;
	border: 1rpx solid rgba(23, 32, 25, .08);
	border-radius: 999rpx;
	background: #172019;
	font-size: 18rpx;
	font-weight: 680;
	color: #eef4e8;
}

.settings-entry text:first-child {
	font-size: 20rpx;
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

.compound-entry.locked {
	background: #34463a;
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
.menu-card {
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

.menu-card {
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

.menu-item.locked .menu-icon {
	filter: saturate(.7);
}

.lock-price {
	flex: 0 0 auto;
	padding: 8rpx 12rpx;
	border-radius: 999rpx;
	background: #f4edcf;
	font-size: 17rpx;
	font-weight: 700;
	color: #786741;
}

.unread-count {
	display: flex;
	min-width: 42rpx;
	height: 42rpx;
	padding: 0 8rpx;
	align-items: center;
	justify-content: center;
	border-radius: 999rpx;
	background: #a45e50;
	color: #fff;
	font-size: 17rpx;
	font-weight: 750;
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
