'use strict';

const MAX_SEGMENTS = 4;
const MIN_TOTAL_CHARS = 320;
const MIN_SEGMENT_CHARS = 36;

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

function paragraphParts(value) {
  return normalizeText(value).split(/\n{2,}/).filter(Boolean);
}

function mergeShortParagraphs(parts) {
  const merged = [];
  for (const part of parts) {
    if (part.length < MIN_SEGMENT_CHARS && merged.length) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${part}`;
    } else {
      merged.push(part);
    }
  }
  if (merged.length > 1 && merged[0].length < MIN_SEGMENT_CHARS) {
    merged[1] = `${merged[0]}\n\n${merged[1]}`;
    merged.shift();
  }
  return merged;
}

function groupParagraphs(parts, limit = MAX_SEGMENTS) {
  if (parts.length <= limit) return parts;
  const groups = [];
  let cursor = 0;
  while (cursor < parts.length) {
    const remainingParts = parts.length - cursor;
    const remainingGroups = limit - groups.length;
    const take = Math.ceil(remainingParts / remainingGroups);
    groups.push(parts.slice(cursor, cursor + take).join('\n\n'));
    cursor += take;
  }
  return groups;
}

function suggestDiarySegments(value) {
  const normalized = normalizeText(value);
  if (normalized.length < MIN_TOTAL_CHARS) return [];
  const paragraphs = paragraphParts(normalized);
  if (paragraphs.length < 2) return [];
  const segments = groupParagraphs(mergeShortParagraphs(paragraphs));
  if (segments.length < 2 || segments.some(segment => segment.length < MIN_SEGMENT_CHARS)) return [];
  if (segments.length === 2 && Math.min(...segments.map(segment => segment.length)) < 80) return [];
  return segments;
}

function normalizeRequestedSegments(originalContent, requestedSegments) {
  const original = normalizeText(originalContent);
  if (!original || original.length > 5000 || !Array.isArray(requestedSegments)) return [];
  const segments = requestedSegments.map(normalizeText).filter(Boolean);
  if (segments.length < 2 || segments.length > MAX_SEGMENTS) return [];
  if (segments.some(segment => segment.length < MIN_SEGMENT_CHARS || segment.length > 5000)) return [];
  return normalizeText(segments.join('\n\n')) === original ? segments : [];
}

module.exports = {
  MAX_SEGMENTS,
  normalizeRequestedSegments,
  normalizeText,
  suggestDiarySegments
};
