'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { diaryPreview } = require('../../src/utils/diary-preview');

test('time-slot diary preview normalizes whitespace and caps visible characters', () => {
  const content = `第一段很长的日记。\n\n${'继续记录'.repeat(20)}`;
  const preview = diaryPreview({ content }, 42);

  assert.equal(preview.length, 43);
  assert.equal(preview.endsWith('…'), true);
  assert.equal(preview.includes('\n'), false);
});

test('diary preview falls back to transcript and a voice placeholder', () => {
  assert.equal(diaryPreview({ voice: { transcript: '  一段语音转写  ' } }, 42), '一段语音转写');
  assert.equal(diaryPreview({ voice: { duration: 65 } }, 42), '🎙 语音日记 · 1:05');
});
