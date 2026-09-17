'use strict';

function findJsonValue(source, fromIndex = 0) {
  for (let start = fromIndex; start < source.length; start += 1) {
    if (source[start] !== '{' && source[start] !== '[') continue;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === '{' || character === '[') stack.push(character);
      else if (character === '}' || character === ']') {
        const expected = character === '}' ? '{' : '[';
        if (stack.pop() !== expected) break;
        if (!stack.length) {
          try {
            return { value: JSON.parse(source.slice(start, index + 1)), start, end: index + 1 };
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

function inspectJsonContent(value) {
  let source = String(value || '').trim();
  source = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let jsonValueCount = 0;
  let cursor = 0;
  while (cursor < source.length) {
    const match = findJsonValue(source, cursor);
    if (!match) break;
    jsonValueCount += 1;
    cursor = match.end;
  }
  return { rawLength: String(value || '').length, jsonValueCount };
}

function parseJsonContent(value) {
  let source = String(value || '').trim();
  source = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(source);
  } catch (error) {
    const first = findJsonValue(source);
    if (first) {
      const second = findJsonValue(source, first.end);
      if (second) {
        const ambiguous = new Error('模型返回了多个 JSON 业务结果，无法安全选择其中一个');
        ambiguous.code = 'SHROOM_AI_JSON_AMBIGUOUS';
        throw ambiguous;
      }
      return first.value;
    }
    throw error;
  }
}

module.exports = { inspectJsonContent, parseJsonContent };
