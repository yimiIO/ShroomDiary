let shroomOrigin = 'https://shroom.evox.run';

// 浏览器发行包走同源 API，避免多域名入口产生跨域差异。
// #ifdef H5
if (process.env.NODE_ENV === 'production') shroomOrigin = '';
// #endif

const CONFIG = {
	// 开发环境配置
	development: {
		assetsPath: 'https://shroom.evox.run/static',
		baseUrl: 'https://shroom.evox.run/api',
		hostUrl: 'https://shroom.evox.run',
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
