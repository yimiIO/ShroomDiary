let shroomOrigin = 'https://shroom.surfplus.xyz';

// 浏览器发行包走同源 API，避免多域名入口产生跨域差异。
// #ifdef H5
if (process.env.NODE_ENV === 'production') shroomOrigin = '';
// #endif

const CONFIG = {
	// 开发环境配置
	development: {
		assetsPath: 'https://shroom.surfplus.xyz/static',
		baseUrl: 'https://shroom.surfplus.xyz/api',
		hostUrl: 'https://shroom.surfplus.xyz',
		websocketUrl: '', // websocket服务端地址
		weixinAppId: ''
	},
	// 生产环境配置
	production: {
		assetsPath: `${shroomOrigin}/static`,
		baseUrl: `${shroomOrigin}/api`,
		hostUrl: shroomOrigin,
		websocketUrl: '', // websocket服务端地址
		weixinAppId: ''
	}

};
export default CONFIG[process.env.NODE_ENV];
