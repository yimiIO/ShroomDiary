<template>
	<view class="auth-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="auth-shell">
			<view class="top-row">
				<view class="back-button" @tap="goBack">‹</view>
				<text class="wordmark">SHROOM</text>
				<view class="top-spacer"></view>
			</view>

			<view class="brand-block">
				<view class="brand-mark">
					<view class="mark-cap"></view>
					<view class="mark-stem"></view>
				</view>
				<text class="eyebrow">YOUR INNER SPACE</text>
				<text class="brand-title">把写下的自己，<br />安全地带回来。</text>
				<text class="brand-copy">登录后继续你的日记、菇卡与练习记录。</text>
			</view>

			<view class="auth-card">
				<view class="tabs">
					<view class="tab" :class="{ active: activeTab === 'login' }" @tap="setTab('login')">登录</view>
					<view class="tab" :class="{ active: activeTab === 'register' }" @tap="setTab('register')">注册</view>
				</view>

				<view v-if="activeTab === 'login'" class="form-panel">
					<view class="field">
						<text class="field-label">手机号码</text>
						<input
							class="field-input"
							type="number"
							v-model="loginParams.mobile"
							maxlength="11"
							placeholder="请输入手机号码"
						/>
					</view>
					<view class="field">
						<text class="field-label">密码</text>
						<input
							class="field-input"
							type="password"
							v-model="loginParams.password"
							maxlength="20"
							placeholder="请输入密码"
						/>
					</view>
					<view class="form-tools">
						<text>当前安全版本仅支持密码登录</text>
					</view>
					<button class="primary-button" :disabled="btnLoading" :loading="btnLoading" @tap="submitLogin">登录</button>
				</view>

				<view v-else class="form-panel">
					<view class="field">
						<text class="field-label">手机号码</text>
						<input class="field-input" type="number" v-model="registerParams.mobile" maxlength="11" placeholder="请输入手机号码" />
					</view>
					<view class="field">
						<text class="field-label">昵称</text>
						<input class="field-input" type="text" v-model="registerParams.nickname" maxlength="20" placeholder="你希望被怎样称呼" />
					</view>
					<view class="field">
						<text class="field-label">密码</text>
						<input class="field-input" type="password" v-model="registerParams.password" maxlength="20" placeholder="设置 6–18 位密码" />
					</view>
					<view class="field">
						<text class="field-label">确认密码</text>
						<input class="field-input" type="password" v-model="registerParams.passwordRepetition" maxlength="20" placeholder="再次输入密码" />
					</view>
					<view class="terms-row" @tap="registerTermsAccepted = !registerTermsAccepted">
						<view class="terms-check" :class="{ checked: registerTermsAccepted }">{{ registerTermsAccepted ? '✓' : '' }}</view>
						<view class="terms-copy">我已阅读并同意
							<text @tap.stop="openLegal('terms')">《菇用户服务协议》</text>和
							<text @tap.stop="openLegal('privacy')">《菇隐私政策》</text>
						</view>
					</view>
					<button class="primary-button" :disabled="btnLoading" :loading="btnLoading" @tap="submitRegister">创建 Shroom 账号</button>
					<text class="agreement">注册和写日记免费；付费功能会在扣费前另行确认。</text>
				</view>
			</view>

			<view class="home-link" @tap="goHome">暂不登录，回到日记</view>
			<!-- #ifdef H5 -->
			<view class="icp-footer" @tap="openIcpRecord">琼ICP备2020004041号-1</view>
			<!-- #endif -->
		</view>
	</view>
</template>

<script>
/* global document, getCurrentPages */
import { loginByPass, registerByPass } from '@/api/login';

const SHROOM_HOME = '/pages/shroom/me';
const SHROOM_TABS = [
	'/pages/diary/index',
	'/pages/shroom/cards',
	'/pages/shroom/discover',
	SHROOM_HOME
];
const SHROOM_ROUTES = [
	'/pages/diary/edit',
	'/pages/todo/list',
	'/pages/todo/edit',
	'/pages/common/cards/detail',
	'/pages/common/cards/edit',
	'/pages/common/cards/select',
	'/pages/common/cards/practice',
	'/pages/common/diary/search'
];

export default {
	data() {
		return {
			statusBarHeight: 0,
			activeTab: 'login',
			loginParams: {
				mobile: '',
				password: ''
			},
			registerParams: {
				mobile: '',
				password: '',
				passwordRepetition: '',
				nickname: ''
			},
			registerTermsAccepted: false,
			btnLoading: false
		};
	},
	onLoad(options = {}) {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
		this.activeTab = String(options.type || '') === '1' ? 'register' : 'login';
		this.loginParams.mobile = uni.getStorageSync('loginMobile') || '';
		this.loginParams.password = uni.getStorageSync('loginPassword') || '';
	},
	onShow() {
		// #ifdef H5
		document.documentElement.classList.add('shroom-auth-active');
		// #endif
		uni.hideTabBar({ animation: false, fail: () => {} });
		if (this.$mStore.getters.hasLogin) this.goAfterLogin();
	},
	onUnload() {
		// #ifdef H5
		document.documentElement.classList.remove('shroom-auth-active');
		// #endif
		uni.showTabBar({ animation: false, fail: () => {} });
	},
	methods: {
		openIcpRecord() {
			// #ifdef H5
			window.location.href = 'https://beian.miit.gov.cn/';
			// #endif
		},
		setTab(tab) {
			this.activeTab = tab;
		},
		goBack() {
			const pages = getCurrentPages();
			if (pages.length > 1) {
				uni.navigateBack();
				return;
			}
			this.goHome();
		},
		goHome() {
			// #ifdef H5
			document.documentElement.classList.remove('shroom-auth-active');
			// #endif
			uni.showTabBar({ animation: false, fail: () => {} });
			uni.switchTab({ url: '/pages/diary/index' });
		},
		async submitLogin() {
			const params = {
				mobile: this.loginParams.mobile,
				password: this.loginParams.password
			};
			if (!this.$mGraceChecker.check(params, this.$mFormRule.loginByPassRule)) {
				this.$mHelper.toast(this.$mGraceChecker.error);
				return;
			}

			this.btnLoading = true;
			try {
				const response = await this.$http.post(loginByPass, params);
				this.$mStore.commit('login', response.data);
				uni.removeStorageSync('loginMobile');
				uni.removeStorageSync('loginPassword');
				this.$mHelper.toast('登录成功');
				this.goAfterLogin();
			} catch (error) {
				this.$mHelper.log(error);
			} finally {
				this.btnLoading = false;
			}
		},
		async submitRegister() {
			const params = {
				mobile: this.registerParams.mobile,
				password: this.registerParams.password,
				password_repetition: this.registerParams.passwordRepetition,
				nickname: this.registerParams.nickname,
				acceptedTerms: this.registerTermsAccepted
			};
			if (!this.$mGraceChecker.check(params, this.$mFormRule.registerRule)) {
				this.$mHelper.toast(this.$mGraceChecker.error);
				return;
			}
			if (params.password !== params.password_repetition) {
				this.$mHelper.toast('两次输入的密码不一致');
				return;
			}
			if (!this.registerTermsAccepted) {
				this.$mHelper.toast('请先阅读并同意用户服务协议与隐私政策');
				return;
			}

			this.btnLoading = true;
			try {
				await this.$http.post(registerByPass, params);
				this.loginParams.mobile = params.mobile;
				this.loginParams.password = params.password;
				this.activeTab = 'login';
				this.$mHelper.toast('账号已创建，请登录');
			} catch (error) {
				this.$mHelper.log(error);
			} finally {
				this.btnLoading = false;
			}
		},
		openLegal(type) {
			uni.navigateTo({ url: `/pages/shroom/legal?type=${type}` });
		},
		goAfterLogin() {
			// #ifdef H5
			document.documentElement.classList.remove('shroom-auth-active');
			// #endif
			uni.showTabBar({ animation: false, fail: () => {} });
			const target = this.takeSafeBackTarget();
			if (!target) {
				uni.switchTab({ url: SHROOM_HOME });
				return;
			}
			if (SHROOM_TABS.indexOf(target.route) !== -1) {
				uni.switchTab({ url: target.route });
				return;
			}
			uni.reLaunch({ url: this.$mHelper.objParseUrlAndParam(target.route, target.query) });
		},
		takeSafeBackTarget() {
			const storedTarget = uni.getStorageSync('backToPage');
			uni.removeStorageSync('backToPage');
			if (!storedTarget) return null;
			try {
				const parsed = typeof storedTarget === 'string' ? JSON.parse(storedTarget) : storedTarget;
				const route = parsed && (parsed.route || parsed.path);
				const allowed = SHROOM_TABS.indexOf(route) !== -1 || SHROOM_ROUTES.indexOf(route) !== -1;
				return allowed ? { route, query: parsed.query || {} } : null;
			} catch (error) {
				this.$mHelper.log(error);
				return null;
			}
		}
	}
};
</script>

<style lang="scss" scoped>
.auth-page {
	min-height: 100vh;
	background: #f1f8e9;
	color: #172019;
}

.status-bar {
	background: #f1f8e9;
}

.auth-shell {
	box-sizing: border-box;
	width: 100%;
	max-width: 920rpx;
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
	background: rgba(255, 255, 255, .7);
}

.wordmark,
.eyebrow {
	font-size: 20rpx;
	font-weight: 700;
	letter-spacing: 4rpx;
}

.brand-block {
	padding: 70rpx 10rpx 48rpx;
}

.brand-mark {
	position: relative;
	width: 76rpx;
	height: 72rpx;
	margin-bottom: 44rpx;
}

.mark-cap {
	position: absolute;
	left: 0;
	top: 0;
	width: 76rpx;
	height: 40rpx;
	border-radius: 50rpx 50rpx 18rpx 18rpx;
	background: #172019;
}

.mark-stem {
	position: absolute;
	left: 31rpx;
	top: 31rpx;
	width: 17rpx;
	height: 38rpx;
	border-radius: 0 0 12rpx 12rpx;
	background: #172019;
}

.eyebrow {
	display: block;
	color: #668166;
}

.brand-title {
	display: block;
	margin-top: 22rpx;
	font-size: 56rpx;
	font-weight: 720;
	line-height: 1.23;
	letter-spacing: -1rpx;
}

.brand-copy {
	display: block;
	margin-top: 24rpx;
	font-size: 25rpx;
	line-height: 1.7;
	color: #667068;
}

.auth-card {
	padding: 40rpx 34rpx 42rpx;
	border: 1rpx solid rgba(23, 32, 25, .08);
	border-radius: 42rpx;
	background: rgba(255, 255, 255, .92);
	box-shadow: 0 28rpx 80rpx rgba(48, 73, 52, .08);
}

.tabs {
	display: flex;
	padding-bottom: 30rpx;
	border-bottom: 1rpx solid #e7ece5;
}

.tab {
	position: relative;
	width: 50%;
	padding: 8rpx 0;
	font-size: 29rpx;
	text-align: center;
	color: #8a938b;
}

.tab.active {
	font-weight: 700;
	color: #172019;
}

.tab.active::after {
	content: '';
	position: absolute;
	left: 50%;
	bottom: -31rpx;
	width: 54rpx;
	height: 5rpx;
	border-radius: 999rpx;
	background: #172019;
	transform: translateX(-50%);
}

.form-panel {
	padding-top: 36rpx;
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

.form-tools {
	display: flex;
	justify-content: space-between;
	padding: 28rpx 0 8rpx;
	font-size: 23rpx;
	color: #667568;
}

.primary-button {
	height: 92rpx;
	margin-top: 36rpx;
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

.terms-row {
	display: flex;
	align-items: flex-start;
	gap: 13rpx;
	margin-top: 28rpx;
}

.terms-check {
	display: flex;
	width: 32rpx;
	height: 32rpx;
	flex: 0 0 32rpx;
	align-items: center;
	justify-content: center;
	border: 1rpx solid #a8b1a7;
	border-radius: 8rpx;
	font-size: 20rpx;
}

.terms-check.checked {
	border-color: #4e6a55;
	background: #4e6a55;
	color: #fff;
}

.terms-copy {
	font-size: 19rpx;
	line-height: 1.6;
	color: #727c74;
}

.terms-copy text {
	color: #42634a;
	text-decoration: underline;
}

.agreement {
	display: block;
	padding: 26rpx 14rpx 0;
	font-size: 20rpx;
	line-height: 1.65;
	text-align: center;
	color: #929a93;
}

.home-link {
	padding: 38rpx 0 8rpx;
	font-size: 23rpx;
	text-align: center;
	color: #617063;
}

.icp-footer {
	padding: 24rpx 0 0;
	font-size: 19rpx;
	line-height: 1.5;
	text-align: center;
	color: #7d887f;
}

/* #ifdef H5 */
@media (min-width: 900px) {
	.auth-shell {
		max-width: 1080px;
		padding-top: 42px;
	}

	.brand-block,
	.auth-card {
		box-sizing: border-box;
		width: calc(50% - 28px);
	}

	.brand-block {
		float: left;
		padding: 110px 30px 40px;
	}

	.auth-card {
		float: right;
		margin-top: 72px;
		padding: 34px 42px 38px;
	}

	.home-link {
		clear: both;
		padding-top: 42px;
	}

	.brand-title {
		font-size: 44px;
	}
}
/* #endif */
</style>
