'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chunkDiary, normalizeEmbeddingInput, safeUtf16Boundary } = require('../src/memory-chunker');

test('Chinese and emoji chunks retain exact UTF-16 source offsets', () => {
  const content = '第一段：今天很好🌊。\n\n' + '第二段有很多中文。'.repeat(45) + '🍄结尾';
  const chunks = chunkDiary(content, { maxLength: 240, minBreakLength: 100 });
  assert.ok(chunks.length > 2);
  for (const chunk of chunks) {
    assert.equal(content.slice(chunk.sourceStart, chunk.sourceEnd), chunk.chunkText);
    assert.equal(chunk.embeddingInput, normalizeEmbeddingInput(chunk.chunkText));
    assert.doesNotMatch(chunk.chunkText[0] || '', /[\uDC00-\uDFFF]/u);
    assert.doesNotMatch(chunk.chunkText.at(-1) || '', /[\uD800-\uDBFF]/u);
  }
});

test('UTF-16 boundary never separates a surrogate pair', () => {
  const content = '前🌊后';
  assert.equal(safeUtf16Boundary(content, 2), 1);
  assert.equal(content.slice(0, safeUtf16Boundary(content, 2)), '前');
});

test('short diary remains one authoritative chunk', () => {
  const content = '  今天决定先核对事实。\r\n明天再记录结果。  ';
  const chunks = chunkDiary(content);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].chunkText, '今天决定先核对事实。\r\n明天再记录结果。');
  assert.equal(content.slice(chunks[0].sourceStart, chunks[0].sourceEnd), chunks[0].chunkText);
});
