'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  candidateFingerprint,
  normalizeInquiryCandidates,
  normalizeQuestion
} = require('../src/inquiry-candidates');

test('inquiry candidates keep only evidence-seeking questions with sufficient confidence', () => {
  const existingId = 'c3a49095-a19b-42bc-9529-a6d7b38c1b46';
  const result = normalizeInquiryCandidates([
    { question: '我为什么总在接近完成时转向另一件事', context: '需要观察后续行为', confidence: 0.84 },
    { question: '今天吃什么', confidence: 0.4 },
    { question: '这条已被模型否决', shouldTrack: false, confidence: 0.99 },
    { question: '这和已有问题是同一件事？', confidence: 0.76, existingInquiryId: existingId },
    { question: '第三条不应越过单篇上限？', confidence: 0.91 }
  ], [existingId]);

  assert.equal(result.length, 2);
  assert.equal(result[0].question, '我为什么总在接近完成时转向另一件事？');
  assert.equal(result[1].suggestedInquiryId, existingId);
});

test('unknown existing inquiry ids are never trusted', () => {
  const [candidate] = normalizeInquiryCandidates([
    { question: '我需要继续观察什么？', confidence: 0.7, existingInquiryId: 'not-owned' }
  ], []);
  assert.equal(candidate.suggestedInquiryId, null);
});

test('candidate fingerprints are stable across source ordering', () => {
  const left = candidateFingerprint('我真正担心的是什么', ['diary-b', 'diary-a']);
  const right = candidateFingerprint(normalizeQuestion('我真正担心的是什么'), ['diary-a', 'diary-b']);
  assert.equal(left, right);
});
