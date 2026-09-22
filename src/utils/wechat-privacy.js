'use strict';

const PRIVACY_DENIED_MESSAGE = '请先阅读并同意小程序隐私保护指引';

function requireWechatPrivacyAuthorization() {
	// #ifdef MP-WEIXIN
	/* global wx */
	if (typeof wx !== 'undefined' && typeof wx.requirePrivacyAuthorize === 'function') {
		return new Promise((resolve, reject) => {
			wx.requirePrivacyAuthorize({
				success: resolve,
				fail: reject
			});
		});
	}
	// #endif
	return Promise.resolve();
}

function isWechatPrivacyDenied(error) {
	const message = String((error && (error.errMsg || error.message || error.name)) || error || '');
	return /privacy|authorize|auth deny|disagree|拒绝|未同意/i.test(message);
}

module.exports = {
	PRIVACY_DENIED_MESSAGE,
	requireWechatPrivacyAuthorization,
	isWechatPrivacyDenied
};
