'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const createRefreshCoordinator = require('../../src/utils/request/refresh-coordinator');

test('concurrent expired requests share one refresh attempt', async () => {
	let calls = 0;
	let release;
	const refresh = createRefreshCoordinator(() => {
		calls += 1;
		if (calls === 1) return new Promise(resolve => { release = resolve; });
		return Promise.resolve({ access_token: 'next' });
	});

	const first = refresh();
	const second = refresh();
	assert.equal(first, second);
	assert.equal(calls, 1);

	release({ access_token: 'fresh' });
	assert.deepEqual(await first, { access_token: 'fresh' });
	assert.deepEqual(await second, { access_token: 'fresh' });

	assert.deepEqual(await refresh(), { access_token: 'next' });
	assert.equal(calls, 2);
});

test('a failed refresh does not permanently block the next attempt', async () => {
	let calls = 0;
	const refresh = createRefreshCoordinator(async () => {
		calls += 1;
		if (calls === 1) throw new Error('expired');
		return { access_token: 'recovered' };
	});

	await assert.rejects(refresh(), /expired/);
	assert.deepEqual(await refresh(), { access_token: 'recovered' });
	assert.equal(calls, 2);
});

test('app restore verifies through the replaceable auth header instead of a stale body token', () => {
	const appSource = fs.readFileSync(path.join(__dirname, '../../src/App.vue'), 'utf8');
	assert.match(appSource, /getStorageSync\('refreshToken'\)/);
	assert.match(appSource, /post\(verifyAccessToken, \{\}\)/);
	assert.doesNotMatch(appSource, /post\(verifyAccessToken, \{\s*token\s*\}\)/);
});
