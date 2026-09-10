'use strict';

const crypto = require('node:crypto');

const CHUNKER_VERSION = 'paragraph-utf16-v1';
const PREPROCESSING_VERSION = 'trim-crlf-v1';

function normalizeEmbeddingInput(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim();
}

function inputHash(value) {
  return crypto.createHash('sha256').update(normalizeEmbeddingInput(value), 'utf8').digest('hex');
}

function trimBounds(source, start, end) {
  let left = start;
  let right = end;
  while (left < right && /\s/u.test(source[left])) left += 1;
  while (right > left && /\s/u.test(source[right - 1])) right -= 1;
  return [left, right];
}

function safeUtf16Boundary(source, boundary) {
  if (boundary <= 0 || boundary >= source.length) return boundary;
  const before = source.charCodeAt(boundary - 1);
  const after = source.charCodeAt(boundary);
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF
    ? boundary - 1 : boundary;
}

function preferredBreak(source, start, hardEnd, minLength) {
  const floor = Math.min(hardEnd, start + minLength);
  const punctuation = '。！？；：.!?;:';
  for (let index = hardEnd; index > floor; index -= 1) {
    const previous = source[index - 1];
    if (punctuation.includes(previous) || previous === '\n') return index;
  }
  for (let index = hardEnd; index > floor; index -= 1) {
    if (/\s/u.test(source[index - 1])) return index;
  }
  return safeUtf16Boundary(source, hardEnd);
}

function paragraphBounds(source) {
  const bounds = [];
  const divider = /\n\s*\n+/g;
  let cursor = 0;
  let match;
  while ((match = divider.exec(source))) {
    const [start, end] = trimBounds(source, cursor, match.index);
    if (end > start) bounds.push({ start, end });
    cursor = match.index + match[0].length;
  }
  const [start, end] = trimBounds(source, cursor, source.length);
  if (end > start) bounds.push({ start, end });
  return bounds;
}

function chunkDiary(content, options = {}) {
  const source = String(content || '');
  const maxLength = Math.max(200, Number(options.maxLength || 900));
  const minBreakLength = Math.min(maxLength - 1, Math.max(80, Number(options.minBreakLength || 260)));
  const chunks = [];
  let pending = null;

  const emit = (start, end) => {
    const [left, right] = trimBounds(source, start, end);
    if (right <= left) return;
    const chunkText = source.slice(left, right);
    chunks.push({
      chunkIndex: chunks.length,
      sourceStart: left,
      sourceEnd: right,
      chunkText,
      embeddingInput: normalizeEmbeddingInput(chunkText),
      embeddingInputHash: inputHash(chunkText)
    });
  };

  const flush = () => {
    if (pending) emit(pending.start, pending.end);
    pending = null;
  };

  for (const paragraph of paragraphBounds(source)) {
    const length = paragraph.end - paragraph.start;
    if (length > maxLength) {
      flush();
      let cursor = paragraph.start;
      while (cursor < paragraph.end) {
        const hardEnd = Math.min(paragraph.end, cursor + maxLength);
        const end = hardEnd < paragraph.end
          ? preferredBreak(source, cursor, hardEnd, minBreakLength) : paragraph.end;
        emit(cursor, end);
        cursor = end > cursor ? end : safeUtf16Boundary(source, hardEnd);
      }
      continue;
    }
    if (!pending) {
      pending = { ...paragraph };
      continue;
    }
    if (paragraph.end - pending.start <= maxLength) pending.end = paragraph.end;
    else {
      flush();
      pending = { ...paragraph };
    }
  }
  flush();
  return chunks;
}

module.exports = {
  CHUNKER_VERSION,
  PREPROCESSING_VERSION,
  chunkDiary,
  inputHash,
  normalizeEmbeddingInput,
  safeUtf16Boundary
};
