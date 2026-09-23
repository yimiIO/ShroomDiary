<template>
	<view class="page">
		<shroom-page-top-spacer />
		<view class="shell">
			<view class="header">
				<view class="back" @tap="goBack">‹</view>
				<view class="header-copy">
					<text class="kicker">SETTINGS</text>
					<text class="title">设置</text>
					<text class="subtitle">管理菇如何保存、连接和交还属于你的数据。</text>
				</view>
			</view>

			<view class="section">
				<text class="section-label">数据与隐私</text>
					<view class="settings-card">
					<view class="setting-row" data-testid="settings-inbox" @tap="openInbox">
						<view class="setting-icon inbox">信</view>
						<view class="setting-copy"><text>收件箱与提醒</text><text>查看每日总结、未读消息与通知权限</text></view>
						<text class="arrow">›</text>
					</view>
					<view class="setting-row" data-testid="settings-data-sources" @tap="openDataSources">
						<view class="setting-icon codex">C</view>
						<view class="setting-copy"><text>数据与连接</text><text>管理 Codex 等菇日记数据源</text></view>
						<text class="arrow">›</text>
					</view>
					<view class="setting-row" data-testid="settings-daily-review" @tap="openDailyReview">
						<view class="setting-icon review">日</view>
						<view class="setting-copy"><text>每日总结与邮箱</text><text>查看今天的总结与管理邮件兜底</text></view>
						<text class="arrow">›</text>
					</view>
					<view class="setting-row" data-testid="settings-export" @tap="openExport">
						<view class="setting-icon export">↗</view>
						<view class="setting-copy"><text>带走我的数据</text><text>完整备份或生成脱敏副本</text></view>
						<text class="arrow">›</text>
					</view>
				</view>
				<view class="privacy-note">
					<text class="privacy-title">你始终决定谁能看见</text>
					<text class="privacy-copy">日记默认属于你。只有当你主动把菇卡设为公开，它才会出现在发现广场；外部数据源也可以随时暂停或断开。</text>
					<view class="privacy-badges"><text>私密</text><text>可撤回连接</text><text>可导出</text></view>
				</view>
			</view>

			<view class="section account-section">
				<text class="section-label">账号与服务</text>
				<view class="settings-card">
					<view class="setting-row" data-testid="settings-wallet" @tap="openWallet">
						<view class="setting-icon wallet">菇</view>
						<view class="setting-copy"><text>菇点与账单</text><text>充值、功能解锁、活动奖励与扣费流水</text></view>
						<text class="arrow">›</text>
					</view>
					<view class="setting-row" data-testid="settings-legal" @tap="openLegal">
						<view class="setting-icon legal">§</view>
						<view class="setting-copy"><text>协议与退款</text><text>用户协议、隐私、充值与退款规则</text></view>
						<text class="arrow">›</text>
					</view>
					<view class="setting-row danger" data-testid="settings-logout" @tap="logout">
						<view class="setting-icon account">○</view>
						<view class="setting-copy"><text>退出当前账号</text><text>不会删除已经保存的日记与记录</text></view>
						<text class="arrow">›</text>
					</view>
				</view>
			</view>

			<text class="version">SHROOM · YOUR DATA, YOUR CHOICE</text>
		</view>
	</view>
</template>

<script>
export default {
	data() { return { statusBarHeight: 0 }; },
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; },
	onShow() {
		if (!this.$mStore.getters.hasLogin) uni.switchTab({ url: '/pages/shroom/me' });
	},
	methods: {
		openInbox() { uni.navigateTo({ url: '/pages/shroom/inbox' }); },
		openDataSources() { uni.navigateTo({ url: '/pages/shroom/data-sources' }); },
		openDailyReview() { uni.navigateTo({ url: '/pages/shroom/daily-review' }); },
		openExport() { uni.navigateTo({ url: '/pages/shroom/export' }); },
		openWallet() { uni.navigateTo({ url: '/pages/shroom/wallet' }); },
		openLegal() { uni.navigateTo({ url: '/pages/shroom/legal?type=terms' }); },
		logout() {
			uni.showModal({
				title: '退出登录',
				content: '本机未同步的内容请先确认已保存。',
				confirmText: '退出',
				confirmColor: '#9b4e46',
				success: result => {
					if (!result.confirm) return;
					this.$mStore.commit('logout');
					uni.switchTab({ url: '/pages/shroom/me' });
				}
			});
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
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: #f1f8e9; }
.shell { box-sizing: border-box; padding: 34rpx 34rpx 110rpx; }
.header { display: flex; align-items: flex-start; gap: 22rpx; }
.back { display: flex; width: 62rpx; height: 62rpx; flex: 0 0 62rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.72); font-size: 46rpx; }
.header-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.kicker, .section-label { font-size: 17rpx; font-weight: 720; letter-spacing: 2.7rpx; color: #728074; }
.title { margin-top: 8rpx; font-family: Georgia, 'Songti SC', serif; font-size: 46rpx; font-weight: 700; }
.subtitle { max-width: 580rpx; margin-top: 13rpx; font-size: 21rpx; line-height: 1.65; color: #6d796f; }
.section { margin-top: 42rpx; }
.section-label { display: block; margin: 0 8rpx 16rpx; }
.settings-card { padding: 4rpx 28rpx; border: 1rpx solid rgba(23,32,25,.06); border-radius: 28rpx; background: #fff; box-shadow: 0 18rpx 50rpx rgba(58,80,60,.06); }
.setting-row { display: flex; align-items: center; gap: 19rpx; padding: 28rpx 0; border-bottom: 1rpx solid #edf0eb; }
.setting-row:last-child { border-bottom: 0; }
.setting-icon { display: flex; width: 62rpx; height: 62rpx; flex: 0 0 62rpx; align-items: center; justify-content: center; border-radius: 20rpx; font-family: Georgia, serif; font-size: 25rpx; font-weight: 700; }
.setting-icon.inbox { background: #e4ebd2; color: #526755; }
.setting-icon.codex { background: #172019; color: #eef4e8; }
.setting-icon.inbox { background: #e4ebd2; color: #526755; }
.setting-icon.review { background: #e7eed6; color: #526755; }
.setting-icon.export { background: #e4ebd2; color: #526755; }
.setting-icon.wallet { background: #f5e7bf; color: #755e30; }
.setting-icon.legal { background: #e7ece4; color: #56665a; }
.setting-icon.account { background: #f0e1dc; color: #8a5149; }
.setting-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }
.setting-copy text:first-child { font-size: 24rpx; font-weight: 680; }
.setting-copy text:last-child { font-size: 19rpx; line-height: 1.5; color: #78847b; }
.danger .setting-copy text:first-child { color: #8e5149; }
.arrow { flex: 0 0 auto; font-size: 39rpx; font-weight: 300; color: #99a29b; }
.privacy-note { margin-top: 18rpx; padding: 31rpx; border-radius: 27rpx; background: #f6f3e6; }
.privacy-title, .privacy-copy { display: block; }
.privacy-title { font-size: 26rpx; font-weight: 690; }
.privacy-copy { margin-top: 13rpx; font-size: 20rpx; line-height: 1.7; color: #6d6a59; }
.privacy-badges { display: flex; flex-wrap: wrap; gap: 9rpx; margin-top: 22rpx; }
.privacy-badges text { padding: 8rpx 13rpx; border-radius: 999rpx; background: rgba(255,255,255,.72); font-size: 17rpx; color: #706b52; }
.account-section { margin-top: 31rpx; }
.version { display: block; margin-top: 38rpx; text-align: center; font-size: 16rpx; letter-spacing: 2rpx; color: #92a095; }
/* #ifdef H5 */
@media (min-width: 920px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 760px; margin: 0 auto; padding: 64px 42px 100px; } }
/* #endif */
</style>
