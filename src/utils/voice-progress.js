'use strict';

function clampPercent(value, minimum = 0, maximum = 100) {
	const number = Number(value);
	if (!Number.isFinite(number)) return minimum;
	return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function expectedTranscriptionSeconds(durationSeconds) {
	const duration = Math.max(0, Number(durationSeconds) || 0);
	return Math.min(14, Math.max(5, 4 + duration / 300));
}

// The provider's flash endpoint is a single request and exposes no live percent.
// This intentionally remains below 100 until the server returns a completed result.
function estimatedTranscriptionPercent(elapsedSeconds, durationSeconds) {
	const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
	const expected = expectedTranscriptionSeconds(durationSeconds);
	const estimate = 8 + 84 * (1 - Math.exp(-elapsed / expected));
	return clampPercent(estimate, 8, 92);
}

module.exports = {
	clampPercent,
	expectedTranscriptionSeconds,
	estimatedTranscriptionPercent
};
