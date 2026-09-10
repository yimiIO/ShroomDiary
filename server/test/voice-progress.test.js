'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clampPercent,
  expectedTranscriptionSeconds,
  estimatedTranscriptionPercent
} = require('../../src/utils/voice-progress');

test('upload percent is clamped to a valid integer percentage', () => {
  assert.equal(clampPercent(-20), 0);
  assert.equal(clampPercent(42.6), 43);
  assert.equal(clampPercent(160), 100);
});

test('transcription estimate is monotonic and never claims completion', () => {
  const samples = [0, 1, 3, 8, 30].map(elapsed => estimatedTranscriptionPercent(elapsed, 120));
  assert.deepEqual([...samples].sort((a, b) => a - b), samples);
  assert.equal(samples[0], 8);
  assert.ok(samples.at(-1) <= 92);
});

test('long recordings get a longer bounded processing estimate', () => {
  assert.equal(expectedTranscriptionSeconds(0), 5);
  assert.ok(expectedTranscriptionSeconds(600) > expectedTranscriptionSeconds(30));
  assert.equal(expectedTranscriptionSeconds(99999), 14);
});
