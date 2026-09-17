'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseJsonContent } = require('../src/ai-json');

test('AI JSON parser accepts plain structured output', () => {
  assert.deepEqual(parseJsonContent('{"view":1,"principles":[]}'), { view: 1, principles: [] });
});

test('AI JSON parser removes markdown fences used by compatible providers', () => {
  assert.deepEqual(parseJsonContent('```json\n{"candidates":[]}\n```'), { candidates: [] });
});

test('AI JSON parser extracts the single object from short surrounding text', () => {
  assert.deepEqual(parseJsonContent('结果如下： {"people":[]} 完成'), { people: [] });
});

test('AI JSON parser keeps the first complete object when a model appends another payload', () => {
  assert.deepEqual(
    parseJsonContent('{"synthesis":{"primaryInsights":[]}} {"duplicate":true}'),
    { synthesis: { primaryInsights: [] } }
  );
});

test('AI JSON parser balances braces without treating braces inside strings as structure', () => {
  assert.deepEqual(
    parseJsonContent('说明： {"statement":"保留 {原文} 和 \\"引号\\""} 尾声'),
    { statement: '保留 {原文} 和 "引号"' }
  );
});
