/**
 * 健康数据同步 - 跨平台统一入口
 *
 * 微信小程序：wx.getWeRunData()  → 后端解密 → 步数
 * iOS App：UTS 插件 HealthKit  → 步数/睡眠/心率
 * Android App：UTS 插件 Health Connect → 步数/睡眠/心率
 *
 * 当前先做微信步数，App 端留接口。
 */

// 微信小程序：拉今日步数
export async function syncWeChatSteps() {
	// #ifdef MP-WEIXIN
	return new Promise((resolve, reject) => {
		uni.getWeRunData({
			success: async (res) => {
				try {
					const { encryptedData, iv } = res
					// 后端解密 + 入库
					const { data } = await uni.request({
						url: '/snapshot/v1/health/wechat/sync',
						method: 'POST',
						data: { encryptedData, iv },
						header: { 'x-api-key': uni.getStorageSync('accessToken') }
					})
					resolve(data)
				} catch (e) {
					reject(e)
				}
			},
			fail: (err) => reject(err)
		})
	})
	// #endif

	// #ifndef MP-WEIXIN
	throw new Error('当前平台不支持微信步数')
	// #endif
}

// 检查微信步数授权状态
export async function checkWeChatAuth() {
	// #ifdef MP-WEIXIN
	return new Promise((resolve) => {
		uni.getSetting({
			success: (res) => resolve(!!res.authSetting['scope.werun'])
		})
	})
	// #endif
	return false
}

// 申请微信步数授权
export async function authorizeWeChatSteps() {
	// #ifdef MP-WEIXIN
	return new Promise((resolve, reject) => {
		uni.authorize({
			scope: 'scope.werun',
			success: () => resolve(true),
			fail: (err) => reject(err)
		})
	})
	// #endif
}

// App 端（iOS/Android）：拉健康数据
export async function syncNativeHealth() {
	// #ifdef APP-PLUS
	const mod = uni.requireNativePlugin('ShroomHealth')
	if (!mod) throw new Error('健康插件未加载')
	return await mod.syncAll()
	// #endif
	throw new Error('请在 App 中使用健康同步')
}
