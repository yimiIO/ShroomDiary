'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const baseUrl = process.env.TEST_BASE_URL || 'https://shroom.surfplus.xyz';
const audioPath = process.env.TEST_SPEECH_FILE;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const mobile = `137${String(Date.now()).slice(-8)}`;
const password = crypto.randomBytes(18).toString('base64url');

async function api(route, { method = 'GET', token, body, form } = {}) {
	const headers = {};
	if (token) headers['x-api-key'] = token;
	if (body) headers['content-type'] = 'application/json';
	const response = await fetch(`${baseUrl}${route}`, {
		method,
		headers,
		body: form || (body ? JSON.stringify(body) : undefined)
	});
	const payload = await response.json();
	assert.equal(response.status, 200, payload.message);
	assert.equal(payload.code, 200, payload.message);
	return payload.data;
}

async function cleanup() {
	const media = await pool.query(
		'SELECT storage_name FROM media_assets WHERE user_id IN (SELECT id FROM users WHERE mobile = $1)',
		[mobile]
	);
	await pool.query('DELETE FROM users WHERE mobile = $1', [mobile]);
	for (const item of media.rows) {
		fs.rmSync(path.join(process.env.UPLOAD_DIR, item.storage_name), { force: true });
	}
}

async function run() {
	assert.ok(audioPath, 'TEST_SPEECH_FILE is required');
	const audio = fs.readFileSync(audioPath);
	await cleanup();
	try {
		await api('/api/auth/v1/register', {
			method: 'POST',
			body: { mobile, password, nickname: 'Voice smoke test' }
		});
		const session = await api('/api/auth/v1/login', {
			method: 'POST',
			body: { mobile, password }
		});
		const form = new FormData();
		form.append('file', new Blob([audio], { type: 'audio/wav' }), 'voice-smoke.wav');
		const media = await api('/api/media/v1/voice/upload', {
			method: 'POST', token: session.access_token, form
		});
		const transcript = await api(`/api/media/v1/voice/${media.id}/transcribe`, {
			method: 'POST', token: session.access_token, body: {}
		});
		assert.ok(transcript.text && transcript.text.length >= 8, 'transcript is unexpectedly empty');
		assert.equal(transcript.model, 'volc.bigasr.auc_turbo');
		console.log(JSON.stringify({
			ok: true,
			model: transcript.model,
			text: transcript.text
		}));
	} finally {
		await cleanup();
		await pool.end();
	}
}

run().catch(async (error) => {
	console.error(error.stack || error.message);
	try { await cleanup(); } catch (_) {}
	try { await pool.end(); } catch (_) {}
	process.exitCode = 1;
});
