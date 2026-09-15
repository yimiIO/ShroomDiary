<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header">
				<view class="back" @tap="goBack">‹</view>
				<view class="header-copy">
					<text class="kicker">PRIVATE INBOX</text>
					<text class="title">收件箱</text>
					<text class="subtitle">每日总结会留在这里；邮件只是你没有打开 Shroom 时的兜底。</text>
				</view>
				<view v-if="unreadCount" class="header-count">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
			</view>

			<view class="delivery-card">
				<view class="delivery-row">
					<view><text class="delivery-title">22:00 投递到收件箱</text><text class="delivery-copy">当天有可用记录时生成；打开总结后自动标记已读。</text></view>
					<switch color="#5d725f" :checked="preferences.inboxEnabled !== false" @change="toggleInbox" />
				</view>
				<view class="notice-row">
					<view><text class="delivery-title">新消息提醒</text><text class="delivery-copy">{{ notificationCopy }}</text></view>
					<button v-if="canEnableBrowserNotification" @tap="enableBrowserNotification">开启</button>
				</view>
			</view>

			<view v-if="loading" class="state"><text>正在查看有没有新消息…</text></view>
			<view v-else-if="!items.length" class="state empty"><text>收件箱还是空的</text><text>当天有真实记录后，22:00 的总结会出现在这里。</text></view>
			<view v-else class="message-list">
				<view class="message" :class="{ unread: item.unread }" v-for="item in items" :key="item.id" @tap="openItem(item)">
					<view class="message-meta"><text>{{ dateCopy(item.date) }}</text><view v-if="item.unread" class="unread-dot"></view><text v-else>已读</text></view>
					<text class="message-title">{{ item.title }}</text>
					<text class="message-preview">{{ item.preview }}</text>
					<view class="message-foot"><text>菇每日总结</text><text>查看 ›</text></view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import { dailyReviewInbox, dailyReviewInboxUnread, dailyReviewPreferences } from '@/api/daily-review';
import {
	browserNotificationPermission,
	handleInboxSnapshot,
	requestBrowserNotificationPermission
} from '@/utils/inbox-notifications';

function today() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default {
	data() {
		return {
			statusBarHeight: 0,
			loading: false,
			items: [],
			unreadCount: 0,
			preferences: {},
			notificationPermission: 'unsupported'
		};
	},
	computed: {
		canEnableBrowserNotification() { return this.notificationPermission === 'default'; },
		notificationCopy() {
			if (this.notificationPermission === 'granted') return '已允许浏览器通知；Shroom 在线时，新总结会弹出系统提醒。';
			if (this.notificationPermission === 'denied') return '浏览器已阻止通知，可在站点权限中重新允许；应用内红点仍然有效。';
			if (this.notificationPermission === 'default') return '允许后，Shroom 在线时会显示系统通知；应用关闭时由邮件兜底。';
			return '应用内未读红点已经启用；后台系统通知需要 App 推送通道支持。';
		}
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.notificationPermission = browserNotificationPermission();
	},
	onShow() {
		if (!this.$mStore.getters.hasLogin) { uni.switchTab({ url: '/pages/shroom/me' }); return; }
		this.load();
	},
	onPullDownRefresh() { this.load().finally(() => uni.stopPullDownRefresh()); },
	methods: {
		async load() {
			if (this.loading) return;
			this.loading = true;
			try {
				const [inbox, unread, preferences] = await Promise.all([
					this.$http.get(`${dailyReviewInbox}?limit=30`),
					this.$http.get(dailyReviewInboxUnread),
					this.$http.get(dailyReviewPreferences)
				]);
				this.items = inbox.data && inbox.data.items || [];
				this.unreadCount = Number(unread.data && unread.data.unreadCount || 0);
				this.preferences = preferences.data || {};
				handleInboxSnapshot(unread.data || {}, { notify: false });
			} catch (error) {
				console.error('加载收件箱失败', error);
			} finally { this.loading = false; }
		},
		async toggleInbox(event) {
			try {
				const response = await this.$http.patch(dailyReviewPreferences, { inboxEnabled: Boolean(event.detail.value) });
				this.preferences = response.data || {};
				uni.showToast({ title: response.message || '设置已更新', icon: 'none' });
			} catch (error) { await this.load(); }
		},
		async enableBrowserNotification() {
			this.notificationPermission = await requestBrowserNotificationPermission();
			uni.showToast({
				title: this.notificationPermission === 'granted' ? '新消息提醒已允许' : '没有获得通知权限',
				icon: 'none'
			});
		},
		openItem(item) { uni.navigateTo({ url: item.route }); },
		dateCopy(value) { return value === today() ? '今天' : value; },
		goBack() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) }); }
	}
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: #f1f8e9; }
.shell { box-sizing: border-box; padding: 34rpx 34rpx 120rpx; }
.header { display: flex; align-items: flex-start; gap: 21rpx; }
.back { display: flex; width: 62rpx; height: 62rpx; flex: 0 0 62rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.72); font-size: 46rpx; }
.header-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.kicker { color: #728074; font-size: 16rpx; font-weight: 750; letter-spacing: 2.8rpx; }
.title { margin-top: 8rpx; font-family: Georgia, 'Songti SC', serif; font-size: 46rpx; font-weight: 700; }
.subtitle { margin-top: 12rpx; color: #6d796f; font-size: 20rpx; line-height: 1.65; }
.header-count { display: flex; min-width: 54rpx; height: 54rpx; padding: 0 10rpx; align-items: center; justify-content: center; border-radius: 20rpx; background: #a45e50; color: #fff; font-size: 20rpx; font-weight: 750; }
.delivery-card { margin-top: 31rpx; padding: 5rpx 29rpx; border-radius: 29rpx; background: #e4ebd2; }
.delivery-row, .notice-row { display: flex; align-items: center; gap: 22rpx; padding: 25rpx 0; }
.delivery-row { border-bottom: 1rpx solid rgba(23,32,25,.09); }
.delivery-row > view, .notice-row > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }
.delivery-title { font-size: 23rpx; font-weight: 710; }
.delivery-copy { color: #687365; font-size: 18rpx; line-height: 1.55; }
.notice-row button { margin: 0; padding: 0 23rpx; border: 0; border-radius: 999rpx; background: #172019; color: #fff; font-size: 18rpx; }
.state { display: flex; margin-top: 28rpx; padding: 42rpx 30rpx; flex-direction: column; gap: 10rpx; border-radius: 29rpx; background: #fff; color: #6f7a72; text-align: center; }
.state text:first-child { color: #2c372e; font-size: 24rpx; font-weight: 700; }
.message-list { margin-top: 28rpx; }
.message { margin-top: 17rpx; padding: 30rpx; border: 1rpx solid rgba(23,32,25,.06); border-radius: 29rpx; background: rgba(255,255,255,.76); }
.message.unread { background: #fff; box-shadow: 0 18rpx 50rpx rgba(58,80,60,.07); }
.message-meta { display: flex; align-items: center; gap: 10rpx; color: #829087; font-size: 17rpx; }
.unread-dot { width: 13rpx; height: 13rpx; border-radius: 50%; background: #a45e50; }
.message-title { display: block; margin-top: 16rpx; font-family: Georgia, 'Songti SC', serif; font-size: 29rpx; font-weight: 680; line-height: 1.5; }
.message-preview { display: -webkit-box; margin-top: 13rpx; overflow: hidden; color: #667269; font-size: 20rpx; line-height: 1.7; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.message-foot { display: flex; justify-content: space-between; margin-top: 20rpx; padding-top: 16rpx; border-top: 1rpx solid #edf0eb; color: #758078; font-size: 17rpx; }
.message-foot text:last-child { color: #425b48; font-weight: 690; }
/* #ifdef H5 */
@media (min-width: 920px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 780px; margin: 0 auto; padding: 64px 42px 100px; } }
/* #endif */
</style>
