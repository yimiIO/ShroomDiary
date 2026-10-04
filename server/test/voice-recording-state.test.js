'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { stopRecordingState } = require('../../src/utils/voice-recording-state');

test('stopping a long recording freezes its duration before local save and upload begin', () => {
	const stopped = stopRecordingState({
		isRecording: true,
		voiceFinalizing: false,
		recordSeconds: 299,
		recordStartedAt: 1000,
		maxRecordSeconds: 600
	}, 301900);

	assert.equal(stopped.shouldStopRecorder, true);
	assert.equal(stopped.isRecording, false);
	assert.equal(stopped.voiceFinalizing, true);
	assert.equal(stopped.recordSeconds, 300);
});

test('a second stop request cannot stop the recorder or restart finalization twice', () => {
	const repeated = stopRecordingState({
		isRecording: false,
		voiceFinalizing: true,
		recordSeconds: 300,
		recordStartedAt: 1000,
		maxRecordSeconds: 600
	}, 302900);

	assert.equal(repeated.shouldStopRecorder, false);
	assert.equal(repeated.isRecording, false);
	assert.equal(repeated.voiceFinalizing, true);
	assert.equal(repeated.recordSeconds, 300);
});
