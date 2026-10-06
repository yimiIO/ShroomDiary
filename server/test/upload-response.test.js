'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeUploadResponse } = require('../../src/utils/request/upload-response');

test('an empty HTTP 400 upload response becomes a normal rejection payload', () => {
	const response = normalizeUploadResponse({ statusCode: 400, data: '' });
	assert.deepEqual(response.data, { code: 400, message: '上传失败（HTTP 400）' });
});

test('valid JSON upload responses are parsed', () => {
	const response = normalizeUploadResponse({ statusCode: 200, data: '{"code":200,"data":{"id":"m1"}}' });
	assert.equal(response.data.code, 200);
	assert.equal(response.data.data.id, 'm1');
});

test('invalid gateway responses never throw inside the upload callback', () => {
	const response = normalizeUploadResponse({ statusCode: 502, data: '<html>bad gateway</html>' });
	assert.equal(response.data.code, 502);
	assert.equal(response.data.message, '上传失败（HTTP 502）');
});
