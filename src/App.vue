<script>
/* global wx */
import Vue from 'vue';
import { verifyAccessToken } from '@/api/login';
import { dailyReviewInboxUnread } from '@/api/daily-review';
import { handleInboxSnapshot, setInboxBadge } from '@/utils/inbox-notifications';

export default {
	async onLaunch() {
		this.initSystemInfo();
		await this.restoreSession();
		await this.refreshInbox(false);
		this.inboxTimer = setInterval(() => this.refreshInbox(true), 60000);
	},
	onShow() {
		this.refreshInbox(true);
	},
	beforeDestroy() {
		if (this.inboxTimer) clearInterval(this.inboxTimer);
	},
	methods: {
		initSystemInfo() {
			try {
				const info = uni.getSystemInfoSync();
				Vue.prototype.StatusBar = info.statusBarHeight || 0;
				Vue.prototype.CustomBar = (info.statusBarHeight || 0) + (info.platform === 'android' ? 50 : 43);

				// #ifdef MP-WEIXIN
				const menuButton = wx.getMenuButtonBoundingClientRect();
				Vue.prototype.Custom = menuButton;
				Vue.prototype.CustomBar = menuButton.bottom + menuButton.top - info.statusBarHeight;
				// #endif
			} catch (error) {
				// 系统信息不可用时，各页面会使用安全的默认值。
			}
		},
		async restoreSession() {
			const token = uni.getStorageSync('accessToken');
			const refreshToken = uni.getStorageSync('refreshToken');
			if (!token && !refreshToken) return;
			try {
				// The request layer supplies the current access token in the header. If it
				// has expired, it can refresh and retry without carrying a stale body token.
				const response = await this.$http.post(verifyAccessToken, {});
				if (!response.data || !response.data.token) this.$mStore.commit('logout');
			} catch (error) {
				// 网络异常不应直接抹掉本地会话；真正的 401 会由请求层统一处理。
			}
		},
		async refreshInbox(notify) {
			if (this.inboxRefreshing) return;
			if (!this.$mStore.getters.hasLogin) { setInboxBadge(0); return; }
			this.inboxRefreshing = true;
			try {
				const response = await this.$http.get(dailyReviewInboxUnread);
				handleInboxSnapshot(response.data || {}, { notify: Boolean(notify) });
			} catch (error) {
				// 收件箱提醒失败不能影响登录、写日记或其他核心操作。
			} finally {
				this.inboxRefreshing = false;
			}
		}
	}
};
</script>

<style lang="scss">
page {
	min-height: 100%;
	background: #f1f8e9;
	color: #172019;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

button,
input,
textarea {
	font: inherit;
}

/* #ifdef H5 */
html,
body {
	margin: 0;
	background: #f1f8e9;
}

#app,
uni-app,
uni-page-body {
	display: block;
	min-height: 100%;
}

uni-tabbar.uni-tabbar-bottom {
	display: block !important;
	position: fixed !important;
	right: 0 !important;
	bottom: 0 !important;
	left: 0 !important;
	z-index: 998 !important;
	width: 100% !important;
	height: calc(64px + env(safe-area-inset-bottom)) !important;
}

uni-tabbar .uni-tabbar {
	box-sizing: border-box !important;
	display: flex !important;
	position: relative !important;
	width: 100% !important;
	height: calc(64px + env(safe-area-inset-bottom)) !important;
	padding: 6px 8px env(safe-area-inset-bottom) !important;
	align-items: center !important;
	background: rgba(255, 255, 255, .95) !important;
	box-shadow: 0 -8px 28px rgba(44, 65, 48, .055) !important;
	backdrop-filter: blur(18px);
}

uni-tabbar .uni-tabbar-border,
uni-tabbar .uni-placeholder {
	display: none !important;
}

uni-tabbar .uni-tabbar__item,
uni-tabbar .uni-tabbar__bd {
	display: flex !important;
	align-items: center !important;
	justify-content: center !important;
}

uni-tabbar .uni-tabbar__item {
	min-width: 0 !important;
	height: 52px !important;
	flex: 1 !important;
}

uni-tabbar .uni-tabbar__bd {
	box-sizing: border-box !important;
	width: 100% !important;
	height: 52px !important;
	flex-direction: column !important;
}

uni-tabbar .uni-tabbar__icon,
uni-tabbar .uni-tabbar__icon img {
	display: block !important;
	flex-shrink: 0 !important;
}

uni-tabbar .uni-tabbar__icon img {
	width: 100% !important;
	height: 100% !important;
}

uni-page-refresh {
	display: none !important;
}

html.shroom-auth-active uni-tabbar,
html.shroom-focus-active uni-tabbar {
	display: none !important;
}

@media (min-width: 1024px) {
	uni-tabbar.uni-tabbar-bottom {
		position: fixed !important;
		top: 0 !important;
		right: auto !important;
		bottom: 0 !important;
		left: 0 !important;
		width: 96px !important;
		height: 100vh !important;
	}

	uni-tabbar .uni-tabbar {
		box-sizing: border-box !important;
		width: 96px !important;
		height: 100% !important;
		padding: 24px 10px !important;
		flex-direction: column !important;
		justify-content: center !important;
		border-right: 1px solid rgba(23, 32, 25, .08) !important;
		background: rgba(255, 255, 255, .94) !important;
		box-shadow: 12px 0 35px rgba(44, 65, 48, .035) !important;
		backdrop-filter: blur(18px);
	}

	uni-tabbar .uni-tabbar__item {
		box-sizing: border-box !important;
		width: 76px !important;
		height: 72px !important;
		margin: 5px 0 !important;
		padding: 9px 0 7px !important;
		flex: none !important;
		border-radius: 22px !important;
		transition: background-color .2s ease !important;
	}

	uni-tabbar .uni-tabbar__item:hover {
		background: #eef5e8 !important;
	}

	uni-tabbar .uni-tabbar__icon {
		width: 25px !important;
		height: 25px !important;
	}

	uni-tabbar .uni-tabbar__label {
		margin-top: 4px !important;
		font-size: 12px !important;
		line-height: 1.2 !important;
	}
}
/* #endif */
</style>
