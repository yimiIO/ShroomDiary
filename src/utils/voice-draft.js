'use strict';

const VOICE_DRAFT_STORAGE_KEY = 'shroomPendingVoiceDraftV1';

function voiceDraftStorageKey(ownerId = '') {
	return ownerId ? `${VOICE_DRAFT_STORAGE_KEY}:${String(ownerId)}` : VOICE_DRAFT_STORAGE_KEY;
}

function normalizeVoiceDraft(value) {
	if (!value || Number(value.version) !== 1 || !String(value.filePath || '').trim()) return null;
	return {
		version: 1,
		filePath: String(value.filePath),
		duration: Math.max(1, Math.round(Number(value.duration) || 1)),
		createdAt: Number(value.createdAt) || Date.now(),
		mimeType: String(value.mimeType || 'audio/mpeg'),
		ownerId: value.ownerId ? String(value.ownerId) : '',
		durable: value.durable !== false,
		serverVoice: value.serverVoice || null
	};
}

function loadVoiceDraft(storage, ownerId = '') {
	const draft = normalizeVoiceDraft(storage.getStorageSync(voiceDraftStorageKey(ownerId)));
	if (!draft) return null;
	if (ownerId && draft.ownerId && draft.ownerId !== String(ownerId)) return null;
	return draft;
}

function storeVoiceDraft(storage, draft) {
	const normalized = normalizeVoiceDraft(draft);
	if (!normalized) throw new Error('Invalid voice draft');
	storage.setStorageSync(voiceDraftStorageKey(normalized.ownerId), normalized);
	return normalized;
}

function saveFile(api, tempFilePath) {
	return new Promise((resolve, reject) => {
		api.saveFile({
			tempFilePath,
			success: result => result && result.savedFilePath ? resolve(result.savedFilePath) : reject(new Error('Missing saved voice path')),
			fail: reject
		});
	});
}

async function persistVoiceRecording({ api, storage, tempFilePath, duration, ownerId = '', now = Date.now }) {
	if (!api || typeof api.saveFile !== 'function') throw new Error('Durable voice storage is unavailable');
	const savedFilePath = await saveFile(api, tempFilePath);
	return storeVoiceDraft(storage, {
		version: 1,
		filePath: savedFilePath,
		duration,
		createdAt: now(),
		mimeType: 'audio/mpeg',
		ownerId,
		durable: true,
		serverVoice: null
	});
}

function markVoiceDraftUploaded(storage, draft, serverVoice) {
	if (!serverVoice || !serverVoice.mediaId) throw new Error('Invalid uploaded voice');
	return storeVoiceDraft(storage, { ...draft, serverVoice });
}

async function uploadPreservingVoiceDraft({ storage, draft, upload }) {
	try {
		const serverVoice = await upload(draft);
		return {
			draft: markVoiceDraftUploaded(storage, draft, serverVoice),
			serverVoice,
			error: null
		};
	} catch (error) {
		return { draft, serverVoice: null, error };
	}
}

function removeSavedFile(api, filePath) {
	return new Promise(resolve => {
		if (!api || typeof api.removeSavedFile !== 'function' || !filePath) {
			resolve();
			return;
		}
		api.removeSavedFile({ filePath, success: resolve, fail: resolve });
	});
}

async function discardVoiceDraft({ api, storage, draft }) {
	await removeSavedFile(api, draft && draft.filePath);
	storage.removeStorageSync(voiceDraftStorageKey(draft && draft.ownerId));
}

module.exports = {
	VOICE_DRAFT_STORAGE_KEY,
	voiceDraftStorageKey,
	normalizeVoiceDraft,
	loadVoiceDraft,
	storeVoiceDraft,
	persistVoiceRecording,
	markVoiceDraftUploaded,
	uploadPreservingVoiceDraft,
	discardVoiceDraft
};
