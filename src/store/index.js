import Vue from 'vue';
import Vuex from 'vuex';

Vue.use(Vuex);

const storedUser = uni.getStorageSync('user') || {};
const storedUserInfo = uni.getStorageSync('userInfo') || storedUser.member || {};

const store = new Vuex.Store({
	state: {
		accessToken: uni.getStorageSync('accessToken') || '',
		refreshToken: uni.getStorageSync('refreshToken') || '',
		userInfo: storedUserInfo,
		networkState: 'unknown'
	},
	getters: {
		hasLogin: state => Boolean(state.accessToken),
		networkStatus: state => state.networkState
	},
	mutations: {
		login(state, session) {
			state.accessToken = session.access_token || '';
			state.refreshToken = session.refresh_token || '';
			state.userInfo = session.member || {};
			uni.setStorageSync('user', session);
			uni.setStorageSync('accessToken', state.accessToken);
			uni.setStorageSync('refreshToken', state.refreshToken);
			uni.setStorageSync('userInfo', state.userInfo);
		},
		logout(state) {
			state.accessToken = '';
			state.refreshToken = '';
			state.userInfo = {};
			uni.removeStorageSync('user');
			uni.removeStorageSync('accessToken');
			uni.removeStorageSync('refreshToken');
			uni.removeStorageSync('userInfo');
		},
		setNetworkState(state, networkState) {
			state.networkState = networkState;
		}
	},
	actions: {
		networkStateChange({ commit }, networkState) {
			commit('setNetworkState', networkState);
			if (networkState === 'none') {
				uni.showToast({ title: '网络已断开', icon: 'none' });
			}
		}
	}
});

export default store;
