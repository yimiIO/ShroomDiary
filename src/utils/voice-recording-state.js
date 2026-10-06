'use strict';

function boundedSeconds(value, maximum) {
	const seconds = Math.max(0, Math.floor(Number(value) || 0));
	const limit = Math.max(0, Math.floor(Number(maximum) || 0));
	return limit ? Math.min(limit, seconds) : seconds;
}

function stopRecordingState(state = {}, now = Date.now()) {
	const currentSeconds = boundedSeconds(state.recordSeconds, state.maxRecordSeconds);
	if (!state.isRecording || state.voiceFinalizing) {
		return {
			shouldStopRecorder: false,
			isRecording: Boolean(state.isRecording),
			voiceFinalizing: Boolean(state.voiceFinalizing),
			recordSeconds: currentSeconds
		};
	}

	const startedAt = Number(state.recordStartedAt) || 0;
	const elapsedSeconds = startedAt > 0
		? boundedSeconds((Number(now) - startedAt) / 1000, state.maxRecordSeconds)
		: currentSeconds;

	return {
		shouldStopRecorder: true,
		isRecording: false,
		voiceFinalizing: true,
		recordSeconds: Math.max(currentSeconds, elapsedSeconds)
	};
}

module.exports = { stopRecordingState };
