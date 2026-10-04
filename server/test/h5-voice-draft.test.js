'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
	persistH5VoiceRecording,
	loadH5VoiceDraft,
	markH5VoiceDraftUploaded,
	rememberH5VoiceUploadSession,
	discardH5VoiceDraft
} = require('../../src/utils/h5-voice-draft');

function memoryRepository() {
	const records = new Map();
	return {
		async get(key) { return records.get(key); },
		async put(key, value) { records.set(key, value); },
		async delete(key) { records.delete(key); }
	};
}

test('PWA stores the complete recording before starting its upload', async () => {
	const repository = memoryRepository();
	const blob = new Blob(['recorded voice'], { type: 'audio/webm;codecs=opus' });
	const draft = await persistH5VoiceRecording({
		repository,
		blob,
		duration: 339,
		ownerId: 'user-a',
		now: () => 1727100000000
	});

	assert.equal(draft.durable, true);
	assert.equal(draft.duration, 339);
	assert.equal(draft.mimeType, 'audio/webm');
	assert.equal((await loadH5VoiceDraft({ repository, ownerId: 'user-a' })).blob.size, blob.size);
});

test('PWA persists the resumable upload id with the local Blob', async () => {
	const repository = memoryRepository();
	const draft = await persistH5VoiceRecording({
		repository,
		blob: new Blob(['voice'], { type: 'audio/webm' }),
		duration: 90,
		ownerId: 'user-a'
	});
	const resumable = await rememberH5VoiceUploadSession({ repository, draft, uploadId: 'upload-1' });
	assert.equal(resumable.uploadId, 'upload-1');
	assert.equal((await loadH5VoiceDraft({ repository, ownerId: 'user-a' })).uploadId, 'upload-1');
});

test('PWA reload restores a failed upload from durable browser storage', async () => {
	const repository = memoryRepository();
	const original = await persistH5VoiceRecording({
		repository,
		blob: new Blob(['still here'], { type: 'audio/webm' }),
		duration: 67,
		ownerId: 'user-a'
	});

	const afterReload = await loadH5VoiceDraft({ repository, ownerId: 'user-a' });
	assert.equal(afterReload.blob.size, original.blob.size);
	assert.equal(afterReload.serverVoice, null);
	assert.equal(await loadH5VoiceDraft({ repository, ownerId: 'user-b' }), null);
});

test('PWA recovers an anonymous recording after authentication finishes', async () => {
	const repository = memoryRepository();
	await persistH5VoiceRecording({
		repository,
		blob: new Blob(['recorded before auth hydration'], { type: 'audio/webm' }),
		duration: 44,
		ownerId: ''
	});

	const recovered = await loadH5VoiceDraft({ repository, ownerId: 'user-a' });
	assert.equal(recovered.ownerId, 'user-a');
	assert.equal(recovered.duration, 44);
	assert.equal(await loadH5VoiceDraft({ repository, ownerId: '' }), null);
	assert.ok((await loadH5VoiceDraft({ repository, ownerId: 'user-a' })).blob.size > 0);
});

test('PWA keeps the local copy after upload and deletes it only after diary finalization', async () => {
	const repository = memoryRepository();
	const draft = await persistH5VoiceRecording({
		repository,
		blob: new Blob(['voice'], { type: 'audio/mp4' }),
		duration: 20,
		ownerId: 'user-a'
	});
	const uploaded = await markH5VoiceDraftUploaded({
		repository,
		draft,
		serverVoice: { mediaId: 'media-1', url: '/voice/media-1', duration: 20 }
	});

	assert.equal((await loadH5VoiceDraft({ repository, ownerId: 'user-a' })).serverVoice.mediaId, 'media-1');
	await discardH5VoiceDraft({ repository, draft: uploaded });
	assert.equal(await loadH5VoiceDraft({ repository, ownerId: 'user-a' }), null);
});
