'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeDiaryMood } = require('../src/diary-mood');

test('diary mood is an optional allowlisted scalar', () => {
  assert.equal(normalizeDiaryMood(null), null);
  assert.equal(normalizeDiaryMood(''), null);
  assert.equal(normalizeDiaryMood('calm'), 'calm');
  assert.equal(normalizeDiaryMood(' complex '), 'complex');
  assert.equal(normalizeDiaryMood(['happy', 'sad']), null);
  assert.equal(normalizeDiaryMood('unknown'), null);
});
