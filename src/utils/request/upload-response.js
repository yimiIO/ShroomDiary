'use strict';

function uploadFailurePayload(statusCode) {
	const status = Number(statusCode) || 500;
	return { code: status, message: `上传失败（HTTP ${status}）` };
}

function normalizeUploadResponse(response) {
	if (!response || typeof response !== 'object') return { statusCode: 500, data: uploadFailurePayload(500) };
	if (typeof response.data !== 'string') return response;
	const raw = response.data.trim();
	if (!raw) return { ...response, data: uploadFailurePayload(response.statusCode) };
	try {
		return { ...response, data: JSON.parse(raw) };
	} catch (error) {
		return { ...response, data: uploadFailurePayload(response.statusCode) };
	}
}

module.exports = { normalizeUploadResponse };
