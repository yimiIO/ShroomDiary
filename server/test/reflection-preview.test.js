'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  firstSentencePreview,
  observationDetail,
  observationHeadline,
  remainingDetail
} = require('../../src/utils/reflection-preview');

test('legacy long summaries keep a one-sentence preview and an accessible full detail', () => {
  const summary = '这次最值得注意的是处理方式变了。后面还有历史证据和解释边界。';
  const preview = firstSentencePreview(summary, 64);

  assert.equal(preview, '这次最值得注意的是处理方式变了。');
  assert.equal(remainingDetail(summary, preview), '后面还有历史证据和解释边界。');
});

test('new and historical observations both expose a useful headline without losing detail', () => {
  const structured = { headline: '你开始先保护结果', text: '这是对证据的详细解释。' };
  const historical = { text: '你对同类问题的处理方式变了。这是原来已保存的详细解释。' };

  assert.equal(observationHeadline(structured), '你开始先保护结果');
  assert.equal(observationDetail(structured), '这是对证据的详细解释。');
  assert.equal(observationHeadline(historical), '你对同类问题的处理方式变了。');
  assert.equal(observationDetail(historical), '这是原来已保存的详细解释。');
});
