/* eslint-disable */
import Request from './request';
import { refreshToken } from '@/api/login';
import indexConfig from '@/config/index.config';
import mHelper from '@/utils/helper';
import store from '@/store';
import createRefreshCoordinator from './refresh-coordinator';

const http = new Request();

// request全局参数设置
http.setConfig(config => {
	/* 设置全局配置 */
	config.baseUrl = indexConfig.baseUrl; /* 根域名不同 */
	const systemInfo = uni.getSystemInfoSync();
	const systemInfoHeaders = {
		'device-name': systemInfo.brand, // 设备名称
		width: systemInfo.screenWidth, // 屏幕宽度
		height: systemInfo.screenHeight, // 屏幕高度
		os: systemInfo.platform, // 客户端平台
		'os-version': systemInfo.system // 操作系统版本
	};
	config.header = {
		...config.header,
		...systemInfoHeaders
	};
	return config;
});

http.interceptor.request(
	config => {
		/* 请求之前拦截器 */
		config.header['x-api-key'] = uni.getStorageSync('accessToken');
		return config;
	},
	error => {
		return Promise.reject(error);
	}
);

let expiryPromptVisible = false;
let billingPromptVisible = false;

function handleBillingRequired(response) {
	const data = response.data.data || {};
	uni.setStorageSync('shroomBillingRequired', data);
	const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
	const currentRoute = pages.length ? `/${pages[pages.length - 1].route}` : '';
	if (currentRoute === '/pages/shroom/wallet') {
		mHelper.toast(response.data.message || '菇点不足');
		return Promise.reject(response.data.message);
	}
	if (!billingPromptVisible) {
		billingPromptVisible = true;
		const required = Number(data.requiredPoints || 0);
		const available = Number(data.availablePoints || 0);
		let balanceChoices = '可以充值，或完成连续 7 天日记活动获得 1 菇点。';
		// #ifdef MP-WEIXIN
		balanceChoices = '可以完成连续 7 天日记活动获得 1 菇点；小程序充值在微信虚拟支付完成接入前不开放。';
		// #endif
		const agreementRequired = data.reason === 'BILLING_AGREEMENT_REQUIRED';
		const content = data.reason === 'FEATURE_LOCKED'
			? `${data.featureName || '高级功能'}需要 ${required || 10} 菇点一次解锁，AI 使用费另行结算。`
			: agreementRequired
				? '使用收费 AI 前，请阅读并明确同意菇点计费与退款规则。未同意不会发起调用或扣费。'
				: `为避免产生欠额，本次调用前需有 ${required || 0.01} 菇点可用；成功后只扣实际用量。当前可用 ${available} 菇点。${balanceChoices}`;
		uni.showModal({
			title: data.reason === 'FEATURE_LOCKED' ? '高级功能尚未解锁' : agreementRequired ? '先确认计费规则' : '菇点余额不足',
			content,
			cancelText: '暂不',
			confirmText: '查看选择',
			confirmColor: '#42634a',
			success: result => {
				if (!result.confirm) return;
				const feature = data.featureKey ? `?feature=${encodeURIComponent(data.featureKey)}` : '';
				uni.navigateTo({ url: `/pages/shroom/wallet${feature}` });
			},
			complete: () => { billingPromptVisible = false; }
		});
	}
	return Promise.reject(response.data.message || '菇点不足');
}

function expireSession(message) {
	store.commit('logout');
	if (!expiryPromptVisible) {
		expiryPromptVisible = true;
		uni.showModal({
			content: '登录状态已失效，请重新登录。',
			confirmText: '去登录',
			cancelText: '稍后',
			success: result => {
				if (result.confirm) mHelper.backToLogin();
			},
			complete: () => {
				expiryPromptVisible = false;
			}
		});
	}
	return Promise.reject(message || '登录状态已失效');
}

const refreshSession = createRefreshCoordinator(async () => {
	const storedRefreshToken = store.state.refreshToken || uni.getStorageSync('refreshToken');
	if (!storedRefreshToken) throw new Error('本机没有可用的刷新凭证');
	const response = await http.post(refreshToken, { refresh_token: storedRefreshToken });
	if (!response || !response.data || !response.data.access_token || !response.data.refresh_token) {
		throw new Error('刷新登录状态失败');
	}
	store.commit('login', response.data);
	return response.data;
});

http.interceptor.response(
	async response => {
		/* 请求之后拦截器 */
		switch (response.data.code) {
			case 200:
				return response.data;
			case 400:
				mHelper.toast(response.data.message || '请求无法完成');
				return Promise.reject(response.data.message);
			case 401:
				if (response.config.url === refreshToken) {
					return Promise.reject(response.data.message);
				}
				if (response.config.custom && response.config.custom.sessionRetried) {
					return expireSession(response.data.message);
				}
				try {
					await refreshSession();
				} catch (error) {
					return expireSession(response.data.message);
				}
				return http.request({
					...response.config,
					header: {
						...response.config.header,
						'x-api-key': uni.getStorageSync('accessToken')
					},
					custom: {
						...(response.config.custom || {}),
						sessionRetried: true
					}
				});
			case 402:
				return handleBillingRequired(response);
			case 405:
				mHelper.toast('当前操作不被允许');
				return Promise.reject(response.data.message);
			case 404:
				mHelper.toast(response.data.message);
				return Promise.reject(response.data.message);
			case 429:
				mHelper.toast('请求过多，先休息一下吧');
				return Promise.reject(response.data.message);
			case 500:
				mHelper.toast('服务器打瞌睡了');
				return Promise.reject(response.data.message);
			case 503:
				mHelper.toast(response.data.message || '服务暂时不可用');
				return Promise.reject(response.data.message);
			default:
				mHelper.toast(response.data.message);
				return Promise.reject(response.data.message);
		}
	},
	error => {
		return Promise.reject(error);
	}
);

export { http };
