'use strict';

const DATABASE_NAME = 'shroom-voice-drafts';
const DATABASE_VERSION = 1;
const STORE_NAME = 'drafts';
const ANONYMOUS_OWNER = '__current__';

function ownerKey(ownerId = '') {
	return String(ownerId || ANONYMOUS_OWNER);
}

function normalizeH5VoiceDraft(value) {
	if (!value || Number(value.version) !== 1 || !value.blob || !Number(value.blob.size)) return null;
	return {
		version: 1,
		ownerId: value.ownerId ? String(value.ownerId) : '',
		blob: value.blob,
		duration: Math.max(1, Math.round(Number(value.duration) || 1)),
		createdAt: Number(value.createdAt) || Date.now(),
		mimeType: String(value.mimeType || value.blob.type || 'audio/webm').split(';')[0],
		durable: true,
		serverVoice: value.serverVoice || null,
		uploadId: value.uploadId ? String(value.uploadId) : ''
	};
}

function requestResult(request) {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
	});
}

function openDatabase(indexedDb) {
	if (!indexedDb || typeof indexedDb.open !== 'function') {
		return Promise.reject(new Error('IndexedDB is unavailable'));
	}
	return new Promise((resolve, reject) => {
		const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error('Unable to open voice draft database'));
	});
}

function browserVoiceDraftRepository(indexedDb) {
	async function run(mode, operation) {
		const database = await openDatabase(indexedDb);
		try {
			const transaction = database.transaction(STORE_NAME, mode);
			const completed = new Promise((resolve, reject) => {
				transaction.oncomplete = resolve;
				transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
				transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
			});
			const result = await requestResult(operation(transaction.objectStore(STORE_NAME)));
			await completed;
			return result;
		} finally {
			database.close();
		}
	}
	return {
		get(key) { return run('readonly', store => store.get(key)); },
		put(key, value) { return run('readwrite', store => store.put(value, key)); },
		delete(key) { return run('readwrite', store => store.delete(key)); }
	};
}

function defaultRepository() {
	return browserVoiceDraftRepository(typeof indexedDB === 'undefined' ? null : indexedDB);
}

async function persistH5VoiceRecording({ repository = defaultRepository(), blob, duration, ownerId = '', now = Date.now }) {
	const draft = normalizeH5VoiceDraft({
		version: 1,
		ownerId,
		blob,
		duration,
		createdAt: now(),
		mimeType: blob && blob.type,
		serverVoice: null
	});
	if (!draft) throw new Error('Invalid H5 voice recording');
	await repository.put(ownerKey(ownerId), draft);
	return draft;
}

async function loadH5VoiceDraft({ repository = defaultRepository(), ownerId = '' } = {}) {
	const draft = normalizeH5VoiceDraft(await repository.get(ownerKey(ownerId)));
	if (draft) {
		if (ownerId && draft.ownerId && draft.ownerId !== String(ownerId)) return null;
		return draft;
	}

	// Authentication can finish between recording and the next page load. Older
	// clients then saved the Blob under the anonymous key and only looked under
	// the authenticated user id, making an intact recording appear to be gone.
	if (!ownerId) return null;
	const anonymous = normalizeH5VoiceDraft(await repository.get(ownerKey()));
	if (!anonymous || anonymous.ownerId) return null;
	const recovered = normalizeH5VoiceDraft({ ...anonymous, ownerId: String(ownerId) });
	await repository.put(ownerKey(ownerId), recovered);
	await repository.delete(ownerKey());
	return recovered;
}

async function markH5VoiceDraftUploaded({ repository = defaultRepository(), draft, serverVoice }) {
	if (!serverVoice || !serverVoice.mediaId) throw new Error('Invalid uploaded voice');
	const uploaded = normalizeH5VoiceDraft({ ...draft, serverVoice });
	if (!uploaded) throw new Error('Invalid H5 voice draft');
	await repository.put(ownerKey(uploaded.ownerId), uploaded);
	return uploaded;
}

async function rememberH5VoiceUploadSession({ repository = defaultRepository(), draft, uploadId }) {
	if (!String(uploadId || '').trim()) throw new Error('Invalid voice upload session');
	const resumable = normalizeH5VoiceDraft({ ...draft, uploadId: String(uploadId) });
	if (!resumable) throw new Error('Invalid H5 voice draft');
	await repository.put(ownerKey(resumable.ownerId), resumable);
	return resumable;
}

async function discardH5VoiceDraft({ repository = defaultRepository(), draft, ownerId = '' } = {}) {
	await repository.delete(ownerKey((draft && draft.ownerId) || ownerId));
}

module.exports = {
	DATABASE_NAME,
	STORE_NAME,
	ownerKey,
	normalizeH5VoiceDraft,
	browserVoiceDraftRepository,
	persistH5VoiceRecording,
	loadH5VoiceDraft,
	markH5VoiceDraftUploaded,
	rememberH5VoiceUploadSession,
	discardH5VoiceDraft
};
