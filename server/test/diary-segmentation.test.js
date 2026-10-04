'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRequestedSegments,
  normalizeText,
  suggestDiarySegments
} = require('../src/diary-segmentation');

test('short or single-flow writing is never interrupted with a split suggestion', () => {
  assert.deepEqual(suggestDiarySegments('今天去散步，风很舒服。'), []);
  assert.deepEqual(suggestDiarySegments('一段很长但没有分段的自由书写。'.repeat(60)), []);
});

test('long multi-paragraph writing is suggested as exact contiguous records', () => {
  const content = [
    '早上开会时我一直很紧张，担心自己的方案会被否定。'.repeat(5),
    '中午和朋友吃饭，聊到新计划后我又觉得有了很多力量。'.repeat(5),
    '晚上回家后我想了很久，发现自己真正在意的不是别人是否同意。'.repeat(5)
  ].join('\n\n');
  const segments = suggestDiarySegments(content);
  assert.equal(segments.length, 3);
  assert.equal(normalizeText(segments.join('\n\n')), normalizeText(content));
});

test('server accepts only two to four unchanged contiguous segments', () => {
  const first = '第一件事保留原文，没有被 AI 改写。'.repeat(5);
  const second = '第二件事也完整保留原文。'.repeat(6);
  const original = `${first}\n\n${second}`;
  assert.deepEqual(normalizeRequestedSegments(original, [first, second]), [first, second]);
  assert.deepEqual(normalizeRequestedSegments(original, [first, '被改写的内容'.repeat(10)]), []);
  assert.deepEqual(normalizeRequestedSegments(original, [original]), []);
  assert.deepEqual(normalizeRequestedSegments(`${'a'.repeat(2600)}\n\n${'b'.repeat(2600)}`, ['a'.repeat(2600), 'b'.repeat(2600)]), []);
});
