import Vue from 'vue';
import App from './App';

// #ifdef H5
// 旧版 uni-app CLI 未稳定注入 H5 原生组件样式时，picker/view 等组件会退化成普通 DOM。
import '@dcloudio/uni-h5/dist/index.css';
// #endif

import $mConfig from '@/config/index.config.js';
import $mRoutesConfig from '@/config/routes.config.js';
import $mFormRule from '@/config/formRule.config.js';
import { http } from '@/utils/request';
import $mGraceChecker from '@/utils/graceChecker';
import $mHelper from '@/utils/helper';
import $mRouter from '@/utils/router';
import ShroomPageTopSpacer from '@/components/ShroomPageTopSpacer.vue';
import store from './store';

Vue.config.productionTip = false;

Vue.component('shroom-page-top-spacer', ShroomPageTopSpacer);

Vue.prototype.$mStore = store;
Vue.prototype.$http = http;
Vue.prototype.$mConfig = $mConfig;
Vue.prototype.$mRoutesConfig = $mRoutesConfig;
Vue.prototype.$mFormRule = $mFormRule;
Vue.prototype.$mGraceChecker = $mGraceChecker;
Vue.prototype.$mHelper = $mHelper;
Vue.prototype.$mRouter = $mRouter;

uni.getNetworkType({
	success: result => store.dispatch('networkStateChange', result.networkType)
});
uni.onNetworkStatusChange(result => {
	store.dispatch('networkStateChange', result.networkType);
});

const TAB_ROUTES = [
	'/pages/diary/index',
	'/pages/shroom/cards',
	'/pages/shroom/discover',
	'/pages/shroom/me'
];

function navigate(navType, route, query) {
	const url = $mHelper.objParseUrlAndParam(route, query);
	if (TAB_ROUTES.indexOf(route) !== -1) {
		uni.switchTab({ url: route });
		return;
	}
	uni[navType]({ url });
}

$mRouter.beforeEach((navType, to) => {
	if (!to || !to.route) return;
	const routeConfig = typeof to.route === 'string' ? { path: to.route } : to.route;
	const route = routeConfig.path;
	if (!route) return;

	if (route === $mRoutesConfig.login.path && store.getters.hasLogin) {
		uni.switchTab({ url: $mRoutesConfig.me.path });
		return;
	}

	if (routeConfig.requiresAuth && !store.getters.hasLogin) {
		uni.setStorageSync('backToPage', JSON.stringify({ route, query: to.query || {} }));
		uni.navigateTo({ url: $mRoutesConfig.login.path });
		return;
	}

	navigate(navType, route, to.query);
});

App.mpType = 'app';

const app = new Vue({
	store,
	...App
});

app.$mount();
