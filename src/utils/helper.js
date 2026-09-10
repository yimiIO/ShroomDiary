/* global getCurrentPages */
import mRouter from '@/utils/router';
import mStore from '@/store';

const ALLOWED_ROUTE_PREFIXES = [
	'/pages/diary/',
	'/pages/todo/',
	'/pages/shroom/',
	'/pages/common/cards/',
	'/pages/common/diary/'
];

function isShroomRoute(route) {
	return ALLOWED_ROUTE_PREFIXES.some(prefix => route.indexOf(prefix) === 0);
}

export default {
	toast(title, duration = 3000) {
		if (!title) return;
		uni.showToast({ title: String(title), duration, icon: 'none' });
	},

	log(value) {
		if (process.env.NODE_ENV === 'development' && value) console.log(value);
	},

	objParseParam(params) {
		if (!params || typeof params !== 'object' || Array.isArray(params)) return '';
		return Object.keys(params)
			.filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
			.map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
			.join('&');
	},

	objParseUrlAndParam(path, params) {
		const query = this.objParseParam(params);
		return query ? `${path}?${query}` : path;
	},

	async backToLogin() {
		const pages = getCurrentPages();
		const currentPage = pages[pages.length - 1];
		const pageVm = currentPage && currentPage.$vm;
		let route = currentPage && (currentPage.route || (pageVm && pageVm.route));
		if (route && route.charAt(0) !== '/') route = `/${route}`;
		if (route && isShroomRoute(route)) {
			const pageQuery = pageVm && pageVm.$mp && pageVm.$mp.query;
			const query = currentPage.options || pageQuery || {};
			uni.setStorageSync('backToPage', JSON.stringify({ route, query }));
		} else {
			uni.removeStorageSync('backToPage');
		}
		mStore.commit('logout');
		mRouter.push({ route: '/pages/public/login' });
	},

	platformGroupFilter() {
		// 这些值属于现有账户 API 的兼容协议，不代表前端产品模块。
		let group = 'tinyShop';
		// #ifdef H5
		group = /micromessenger/i.test(navigator.userAgent) ? 'tinyShopWechat' : 'tinyShopH5';
		// #endif
		// #ifdef MP-WEIXIN
		group = 'tinyShopWechatMp';
		// #endif
		// #ifdef MP-ALIPAY
		group = 'tinyShopAliMp';
		// #endif
		// #ifdef MP-QQ
		group = 'tinyShopQqMp';
		// #endif
		// #ifdef MP-BAIDU
		group = 'tinyShopBaiduMp';
		// #endif
		// #ifdef APP-PLUS
		const platform = uni.getSystemInfoSync().platform;
		group = platform === 'ios' ? 'tinyShopIos' : 'tinyShopAndroid';
		// #endif
		return group;
	}
};
