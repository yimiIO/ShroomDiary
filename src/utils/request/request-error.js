function requestFailureMessage(error) {
	if (!error || Number(error.statusCode) > 0) return '';

	const rawMessage = [
		error.errMsg,
		error.message,
		error.data && error.data.message,
		typeof error === 'string' ? error : ''
	]
		.filter(Boolean)
		.join(' ');

	if (!/request:fail|network|timeout/i.test(rawMessage)) return '';
	if (/domain list|合法域名/i.test(rawMessage)) {
		return '网络连接失败，请检查小程序网络设置后重试';
	}
	return '网络连接失败，请稍后重试';
}

module.exports = { requestFailureMessage };
