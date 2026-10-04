'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
	persistVoiceRecording,
	loadVoiceDraft,
	markVoiceDraftUploaded,
	uploadPreservingVoiceDraft,
	discardVoiceDraft
} = require('../../src/utils/voice-draft');

function storageDouble() {
	const values = new Map();
	return {
		getStorageSync(key) { return values.get(key); },
		setStorageSync(key, value) { values.set(key, value); },
		removeStorageSync(key) { values.delete(key); }
	};
}

test('a stopped recording is copied to durable storage before upload', async () => {
	const storage = storageDouble();
	const api = {
		saveFile({ tempFilePath, success }) {
			assert.equal(tempFilePath, 'wxfile://temporary.mp3');
			success({ savedFilePath: 'wxfile://store/shroom-voice.mp3' });
		}
	};

	const draft = await persistVoiceRecording({
		api,
		storage,
		tempFilePath: 'wxfile://temporary.mp3',
		duration: 367,
		now: () => 1727100000000
	});

	assert.equal(draft.filePath, 'wxfile://store/shroom-voice.mp3');
	assert.equal(draft.duration, 367);
	assert.deepEqual(loadVoiceDraft(storage), draft);
});

test('a successful media upload keeps the local recovery copy until the diary is saved', () => {
	const storage = storageDouble();
	storage.setStorageSync('shroomPendingVoiceDraftV1', {
		version: 1,
		filePath: 'wxfile://store/shroom-voice.mp3',
		duration: 367,
		createdAt: 1727100000000,
		mimeType: 'audio/mpeg',
		serverVoice: null
	});

	const voice = { mediaId: 'media-1', url: 'https://example.test/voice.mp3', duration: 367 };
	const draft = markVoiceDraftUploaded(storage, loadVoiceDraft(storage), voice);

	assert.deepEqual(draft.serverVoice, voice);
	assert.deepEqual(loadVoiceDraft(storage).serverVoice, voice);
});

test('the durable recording is removed only by explicit finalization', async () => {
	const storage = storageDouble();
	const removed = [];
	const api = {
		removeSavedFile({ filePath, success }) {
			removed.push(filePath);
			success();
		}
	};
	const draft = {
		version: 1,
		filePath: 'wxfile://store/shroom-voice.mp3',
		duration: 367,
		createdAt: 1727100000000,
		mimeType: 'audio/mpeg',
		serverVoice: null
	};
	storage.setStorageSync('shroomPendingVoiceDraftV1', draft);

	await discardVoiceDraft({ api, storage, draft });

	assert.deepEqual(removed, ['wxfile://store/shroom-voice.mp3']);
	assert.equal(loadVoiceDraft(storage), null);
});

test('voice recovery drafts are isolated between signed-in accounts', async () => {
	const storage = storageDouble();
	const api = {
		saveFile({ success }) { success({ savedFilePath: 'wxfile://store/private.mp3' }); }
	};
	await persistVoiceRecording({ api, storage, tempFilePath: 'wxfile://temp.mp3', duration: 20, ownerId: 'user-a' });

	assert.equal(loadVoiceDraft(storage, 'user-b'), null);
	assert.equal(loadVoiceDraft(storage, 'user-a').ownerId, 'user-a');
});

test('a failed upload preserves the same recovery draft and a retry can complete it', async () => {
	const storage = storageDouble();
	const draft = {
		version: 1,
		filePath: 'wxfile://store/retry.mp3',
		duration: 367,
		createdAt: 1727100000000,
		mimeType: 'audio/mpeg',
		ownerId: 'user-a',
		durable: true,
		serverVoice: null
	};
	storage.setStorageSync('shroomPendingVoiceDraftV1:user-a', draft);

	const failed = await uploadPreservingVoiceDraft({
		storage,
		draft,
		upload: async () => { throw new Error('HTTP 400'); }
	});
	assert.equal(failed.error.message, 'HTTP 400');
	assert.deepEqual(loadVoiceDraft(storage, 'user-a'), draft);

	const retried = await uploadPreservingVoiceDraft({
		storage,
		draft: failed.draft,
		upload: async () => ({ mediaId: 'media-retry', url: 'https://example.test/retry.mp3', duration: 367 })
	});
	assert.equal(retried.error, null);
	assert.equal(loadVoiceDraft(storage, 'user-a').serverVoice.mediaId, 'media-retry');
});
