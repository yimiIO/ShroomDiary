const assert = require('node:assert/strict');
const test = require('node:test');

const { requestFailureMessage } = require('../../src/utils/request/request-error');

test('mini program domain failures produce a visible recovery message', () => {
	assert.equal(
		requestFailureMessage({ errMsg: 'request:fail url not in domain list' }),
		'网络连接失败，请检查小程序网络设置后重试'
	);
});

test('generic transport failures are not silent', () => {
	assert.equal(
		requestFailureMessage({ errMsg: 'request:fail timeout' }),
		'网络连接失败，请稍后重试'
	);
});

test('handled application responses do not receive a duplicate network toast', () => {
	assert.equal(
		requestFailureMessage({ statusCode: 500, data: { message: '服务器错误' } }),
		''
	);
});
