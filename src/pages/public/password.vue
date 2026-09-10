<template>
	<view class="password-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="password-shell">
			<view class="top-row">
				<view class="back-button" @tap="goBack">‹</view>
				<text class="wordmark">SHROOM</text>
				<view class="top-spacer"></view>
			</view>

			<view class="intro">
				<text class="eyebrow">ACCOUNT RECOVERY</text>
				<text class="title">找回方式正在独立接入</text>
				<text class="description">为了不借用冲浪家的短信与账户系统，Shroom 暂不提供短信重置。现阶段请妥善保管密码。</text>
			</view>

			<view class="form-card recovery-card">
				<text class="recovery-label">PRIVACY FIRST</text>
				<text class="recovery-title">不会用一个假的验证码流程绕过手机号验证。</text>
				<text class="recovery-copy">接入 Shroom 自己的短信服务后，这里会开放安全的密码找回。</text>
				<button class="primary-button" @tap="openLogin">回到密码登录</button>
			</view>

			<view class="login-link" @tap="openLogin">想起来了，回到登录</view>
		</view>
	</view>
</template>

<script>
/* global document, getCurrentPages */

export default {
	data() {
		return {
			statusBarHeight: 0
		};
	},
	onLoad() {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
	},
	onShow() {
		// #ifdef H5
		document.documentElement.classList.add('shroom-auth-active');
		// #endif
		uni.hideTabBar({ animation: false, fail: () => {} });
	},
	onUnload() {
		// #ifdef H5
		document.documentElement.classList.remove('shroom-auth-active');
		// #endif
		uni.showTabBar({ animation: false, fail: () => {} });
	},
	methods: {
		goBack() {
			const pages = getCurrentPages();
			if (pages.length > 1) {
				uni.navigateBack();
				return;
			}
			this.openLogin();
		},
		openLogin() {
			// #ifdef H5
			document.documentElement.classList.remove('shroom-auth-active');
			// #endif
			uni.redirectTo({ url: '/pages/public/login' });
		}
	}
};
</script>

<style lang="scss" scoped>
.password-page {
	min-height: 100vh;
	background: #f1f8e9;
	color: #172019;
}

.status-bar {
	background: #f1f8e9;
}

.password-shell {
	box-sizing: border-box;
	width: 100%;
	max-width: 760rpx;
	min-height: 100vh;
	margin: 0 auto;
	padding: 28rpx 36rpx calc(56rpx + env(safe-area-inset-bottom));
}

.top-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.back-button,
.top-spacer {
	width: 68rpx;
}

.back-button {
	height: 68rpx;
	font-size: 56rpx;
	line-height: 62rpx;
	text-align: center;
	border-radius: 50%;
	background: rgba(255, 255, 255, .72);
}

.wordmark,
.eyebrow {
	font-size: 20rpx;
	font-weight: 700;
	letter-spacing: 4rpx;
}

.intro {
	padding: 90rpx 12rpx 52rpx;
}

.eyebrow,
.title,
.description {
	display: block;
}

.eyebrow {
	color: #668166;
}

.title {
	margin-top: 22rpx;
	font-size: 52rpx;
	font-weight: 720;
	line-height: 1.25;
}

.description {
	margin-top: 22rpx;
	font-size: 24rpx;
	line-height: 1.7;
	color: #667068;
}

.form-card {
	padding: 36rpx 34rpx 42rpx;
	border: 1rpx solid rgba(23, 32, 25, .08);
	border-radius: 42rpx;
	background: rgba(255, 255, 255, .92);
	box-shadow: 0 28rpx 80rpx rgba(48, 73, 52, .08);
}

.recovery-label,
.recovery-title,
.recovery-copy {
	display: block;
}

.recovery-label {
	font-size: 19rpx;
	font-weight: 700;
	letter-spacing: 3rpx;
	color: #69806c;
}

.recovery-title {
	margin-top: 26rpx;
	font-size: 34rpx;
	font-weight: 700;
	line-height: 1.45;
}

.recovery-copy {
	margin-top: 18rpx;
	font-size: 24rpx;
	line-height: 1.7;
	color: #667068;
}

.field {
	padding: 22rpx 0 18rpx;
	border-bottom: 1rpx solid #dfe5dd;
}

.field-label {
	display: block;
	margin-bottom: 12rpx;
	font-size: 20rpx;
	font-weight: 700;
	letter-spacing: 1rpx;
	color: #687269;
}

.field-input {
	box-sizing: border-box;
	width: 100%;
	height: 58rpx;
	font-size: 29rpx;
	line-height: 58rpx;
	color: #172019;
}

.code-row {
	display: flex;
	align-items: center;
}

.code-input {
	min-width: 0;
	flex: 1;
}

.code-button {
	box-sizing: border-box;
	width: 190rpx;
	height: 58rpx;
	margin: 0;
	padding: 0 12rpx;
	font-size: 23rpx;
	line-height: 58rpx;
	color: #425544;
	border: 0;
	border-radius: 999rpx;
	background: #e5efd9;
}

.code-button::after,
.primary-button::after {
	border: 0;
}

.code-button[disabled] {
	color: #98a098;
	background: #edf0ec;
}

.primary-button {
	height: 92rpx;
	margin-top: 40rpx;
	font-size: 29rpx;
	font-weight: 700;
	line-height: 92rpx;
	color: #fff;
	border: 0;
	border-radius: 999rpx;
	background: #172019;
}

.primary-button[disabled] {
	color: rgba(255, 255, 255, .7);
	background: #687469;
}

.login-link {
	padding: 38rpx 0 8rpx;
	font-size: 23rpx;
	text-align: center;
	color: #617063;
}

/* #ifdef H5 */
@media (min-width: 900px) {
	.password-shell {
		max-width: 620px;
		padding-top: 42px;
	}

	.intro {
		padding: 70px 20px 40px;
	}

	.form-card {
		padding: 34px 42px 38px;
	}
}
/* #endif */
</style>
