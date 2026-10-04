'use strict';

// Keep the default deliberately small. iOS Safari can stall a request body for
// minutes on a poor cellular uplink even while downloads remain healthy. A
// 32 KiB chunk gives Nginx a fast, durable checkpoint instead of losing a much
// larger in-flight chunk when client_body_timeout is reached.
const DEFAULT_CHUNK_SIZE = 32 * 1024;

function wait(milliseconds) {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function responseData(response) {
	if (!response || response.code !== 200 || !response.data) throw new Error((response && response.message) || 'Voice upload failed');
	return response.data;
}

async function directUploadVoice({
	blob,
	fileName,
	mimeType,
	uploadId = '',
	request,
	directRequest,
	onSession,
	onProgress = () => {}
}) {
	if (!blob || !Number(blob.size)) throw new Error('Empty voice recording');
	const metadata = { fileName, mimeType, byteSize: blob.size };
	const initialized = responseData(await request({
		method: 'POST',
		path: '/voice/direct-uploads',
		json: { ...metadata, uploadId: uploadId || null }
	}));
	if (!initialized.uploadId) throw new Error('Missing direct voice upload session');
	await onSession(initialized.uploadId);
	if (initialized.completed && initialized.media) return { code: 200, data: initialized.media };
	if (!initialized.uploadUrl) throw new Error('Missing direct voice upload URL');

	await directRequest({
		method: 'PUT',
		url: initialized.uploadUrl,
		body: blob,
		headers: { 'Content-Type': mimeType },
		onProgress: loaded => onProgress((Math.min(blob.size, loaded) / blob.size) * 100)
	});
	onProgress(100);
	return request({
		method: 'POST',
		path: `/voice/direct-uploads/${initialized.uploadId}/complete`,
		json: metadata
	});
}

async function resumableUploadVoice({
	blob,
	fileName,
	mimeType,
	uploadId = '',
	chunkSize = DEFAULT_CHUNK_SIZE,
	maxChunkSize = chunkSize,
	growAfterSuccesses = 3,
	maxAttempts = 4,
	request,
	onSession,
	onProgress = () => {},
	delay = wait
}) {
	if (!blob || !Number(blob.size)) throw new Error('Empty voice recording');
	const initialized = responseData(await request({
		method: 'POST',
		path: '/voice/uploads',
		json: { uploadId: uploadId || null, fileName, mimeType, byteSize: blob.size }
	}));
	if (!initialized.uploadId) throw new Error('Missing voice upload session');
	await onSession(initialized.uploadId);
	if (initialized.completed && initialized.media) return { code: 200, data: initialized.media };

	let offset = Math.max(0, Math.min(blob.size, Number(initialized.receivedBytes) || 0));
	const minimumChunkSize = Math.max(1, Number(chunkSize) || DEFAULT_CHUNK_SIZE);
	const largestChunkSize = Math.max(minimumChunkSize, Number(maxChunkSize) || minimumChunkSize);
	const successesBeforeGrowth = Math.max(1, Number(growAfterSuccesses) || 3);
	let currentChunkSize = minimumChunkSize;
	let consecutiveSuccesses = 0;
	onProgress((offset / blob.size) * 100);
	while (offset < blob.size) {
		const start = offset;
		let uploaded;
		let lastError;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const end = Math.min(blob.size, start + currentChunkSize);
			const chunk = blob.slice(start, end, mimeType);
			try {
				uploaded = responseData(await request({
					method: 'PUT',
					path: `/voice/uploads/${initialized.uploadId}/${start}`,
					body: chunk,
					headers: {
						'Content-Type': 'application/octet-stream',
						'Content-Range': `bytes ${start}-${end - 1}/${blob.size}`
					},
					onProgress: loaded => onProgress(((start + Math.min(chunk.size, loaded)) / blob.size) * 100)
				}));
				break;
			} catch (error) {
				lastError = error;
				consecutiveSuccesses = 0;
				currentChunkSize = Math.max(minimumChunkSize, Math.floor(currentChunkSize / 2));
				if (attempt < maxAttempts) await delay(400 * attempt);
			}
		}
		if (!uploaded) throw lastError;
		const receivedBytes = Number(uploaded.receivedBytes);
		if (!Number.isFinite(receivedBytes) || receivedBytes <= start || receivedBytes > blob.size) {
			throw new Error('Invalid resumable upload offset');
		}
		offset = receivedBytes;
		onProgress((offset / blob.size) * 100);
		consecutiveSuccesses += 1;
		if (consecutiveSuccesses >= successesBeforeGrowth && currentChunkSize < largestChunkSize) {
			currentChunkSize = Math.min(largestChunkSize, currentChunkSize * 2);
			consecutiveSuccesses = 0;
		}
	}

	return request({ method: 'POST', path: `/voice/uploads/${initialized.uploadId}/complete`, json: {} });
}

module.exports = { DEFAULT_CHUNK_SIZE, directUploadVoice, resumableUploadVoice };
