'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { directUploadVoice, resumableUploadVoice } = require('../../src/utils/resumable-voice-upload');
const { VoiceUploadSessionStore, parseContentRange } = require('../src/voice-upload-session-store');

test('content range parser rejects ambiguous or inconsistent ranges', () => {
	assert.deepEqual(parseContentRange('bytes 0-3/10'), { start: 0, end: 3, total: 10 });
	assert.equal(parseContentRange('bytes 4-2/10'), null);
	assert.equal(parseContentRange('items 0-3/10'), null);
});

test('server upload sessions keep accepted bytes and make duplicate chunks idempotent', async t => {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-voice-upload-'));
	t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
	const store = new VoiceUploadSessionStore({ rootDir, maxBytes: 32 });
	const session = await store.create({
		userId: 'user-a', mimeType: 'audio/webm', originalName: 'voice.webm', byteSize: 10
	});

	assert.equal((await store.append({
		uploadId: session.uploadId, userId: 'user-a', start: 0, total: 10, bytes: Buffer.from('abcd')
	})).receivedBytes, 4);
	assert.equal((await store.append({
		uploadId: session.uploadId, userId: 'user-a', start: 0, total: 10, bytes: Buffer.from('abcd')
	})).receivedBytes, 4);
	assert.equal((await store.append({
		uploadId: session.uploadId, userId: 'user-a', start: 4, total: 10, bytes: Buffer.from('efghij')
	})).receivedBytes, 10);
	assert.equal(fs.readFileSync(store.partPath(session.uploadId), 'utf8'), 'abcdefghij');
	await assert.rejects(() => store.load(session.uploadId, 'user-b'), /not found/i);
});

test('PWA retry resumes at the server offset instead of resending the whole recording', async () => {
	const blob = new Blob(['abcdefghij'], { type: 'audio/webm' });
	let received = 0;
	let failSecondChunk = true;
	let rememberedUploadId = '';
	const starts = [];
	const request = async ({ method, path: requestPath, body }) => {
		if (method === 'POST' && requestPath === '/voice/uploads') {
			return { code: 200, data: { uploadId: 'upload-1', receivedBytes: received, completed: false } };
		}
		if (method === 'PUT') {
			const start = Number(requestPath.split('/').pop());
			starts.push(start);
			if (start === 4 && failSecondChunk) throw new Error('simulated mobile disconnect');
			received = Math.max(received, start + body.size);
			return { code: 200, data: { receivedBytes: received } };
		}
		if (method === 'POST' && requestPath.endsWith('/complete')) {
			return { code: 200, data: { id: 'media-1', url: '/media-1' } };
		}
		throw new Error(`unexpected request ${method} ${requestPath}`);
	};

	await assert.rejects(() => resumableUploadVoice({
		blob, fileName: 'voice.webm', mimeType: 'audio/webm', chunkSize: 4, maxAttempts: 2,
		request,
		onSession: async uploadId => { rememberedUploadId = uploadId; },
		delay: async () => {}
	}), /simulated mobile disconnect/);
	assert.equal(received, 4);
	assert.equal(rememberedUploadId, 'upload-1');

	failSecondChunk = false;
	const result = await resumableUploadVoice({
		blob, fileName: 'voice.webm', mimeType: 'audio/webm', uploadId: rememberedUploadId,
		chunkSize: 4, maxAttempts: 2, request, onSession: async () => {}, delay: async () => {}
	});
	assert.equal(result.data.id, 'media-1');
	assert.deepEqual(starts, [0, 4, 4, 4, 8]);
});

test('PWA default chunks stay small enough for a severely constrained mobile uplink', async () => {
	const blob = new Blob([Buffer.alloc(100 * 1024)], { type: 'audio/webm' });
	let received = 0;
	const chunkSizes = [];
	const request = async ({ method, path: requestPath, body }) => {
		if (method === 'POST' && requestPath === '/voice/uploads') {
			return { code: 200, data: { uploadId: 'upload-mobile', receivedBytes: received, completed: false } };
		}
		if (method === 'PUT') {
			chunkSizes.push(body.size);
			if (body.size > 64 * 1024) throw new Error('simulated mobile uplink timeout');
			received += body.size;
			return { code: 200, data: { receivedBytes: received } };
		}
		if (method === 'POST' && requestPath.endsWith('/complete')) {
			return { code: 200, data: { id: 'media-mobile', url: '/media-mobile' } };
		}
		throw new Error(`unexpected request ${method} ${requestPath}`);
	};

	const result = await resumableUploadVoice({
		blob, fileName: 'voice.webm', mimeType: 'audio/webm', request,
		onSession: async () => {}, delay: async () => {}
	});
	assert.equal(result.data.id, 'media-mobile');
	assert.equal(received, blob.size);
	assert.ok(chunkSizes.length > 1);
	assert.ok(chunkSizes.every(size => size <= 64 * 1024));
});

test('PWA grows chunks after stable uploads and shrinks again after a timeout', async () => {
	const blob = new Blob([Buffer.alloc(320 * 1024)], { type: 'audio/webm' });
	let received = 0;
	const attempts = [];
	const request = async ({ method, path: requestPath, body }) => {
		if (method === 'POST' && requestPath === '/voice/uploads') {
			return { code: 200, data: { uploadId: 'upload-adaptive', receivedBytes: received, completed: false } };
		}
		if (method === 'PUT') {
			const start = Number(requestPath.split('/').pop());
			attempts.push({ start, size: body.size });
			if (body.size > 64 * 1024) throw new Error('simulated large-chunk timeout');
			received = start + body.size;
			return { code: 200, data: { receivedBytes: received } };
		}
		if (method === 'POST' && requestPath.endsWith('/complete')) {
			return { code: 200, data: { id: 'media-adaptive', url: '/media-adaptive' } };
		}
		throw new Error(`unexpected request ${method} ${requestPath}`);
	};

	const result = await resumableUploadVoice({
		blob, fileName: 'voice.webm', mimeType: 'audio/webm',
		chunkSize: 32 * 1024, maxChunkSize: 128 * 1024, growAfterSuccesses: 2,
		request, onSession: async () => {}, delay: async () => {}
	});

	assert.equal(result.data.id, 'media-adaptive');
	assert.equal(received, blob.size);
	assert.ok(attempts.some(item => item.size === 128 * 1024));
	assert.ok(attempts.some((item, index) => index > 0
		&& attempts[index - 1].start === item.start
		&& attempts[index - 1].size === 128 * 1024
		&& item.size === 64 * 1024));
});

test('PWA uploads voices directly to private object storage and asks the API to verify completion', async () => {
	const blob = new Blob([Buffer.alloc(96 * 1024)], { type: 'audio/webm' });
	let rememberedUploadId = '';
	let directBodySize = 0;
	const apiCalls = [];
	const request = async options => {
		apiCalls.push(options);
		if (options.path === '/voice/direct-uploads') {
			return { code: 200, data: {
				uploadId: '33333333-3333-4333-8333-333333333333',
				uploadUrl: 'https://private.example/upload?signature=redacted',
				completed: false
			} };
		}
		return { code: 200, data: { id: 'media-direct', url: '/media-direct' } };
	};
	const directRequest = async ({ method, url, body, onProgress }) => {
		assert.equal(method, 'PUT');
		assert.match(url, /^https:\/\/private\.example\/upload/);
		directBodySize = body.size;
		onProgress(body.size);
	};

	const result = await directUploadVoice({
		blob, fileName: 'voice.webm', mimeType: 'audio/webm',
		request, directRequest,
		onSession: async uploadId => { rememberedUploadId = uploadId; }
	});

	assert.equal(result.data.id, 'media-direct');
	assert.equal(rememberedUploadId, '33333333-3333-4333-8333-333333333333');
	assert.equal(directBodySize, blob.size);
	assert.equal(apiCalls[1].path, '/voice/direct-uploads/33333333-3333-4333-8333-333333333333/complete');
});
