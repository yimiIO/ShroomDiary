'use strict';

function parseJsonContent(value) {
  let source = String(value || '').trim();
  source = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(source);
  } catch (error) {
    for (let start = 0; start < source.length; start += 1) {
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
              return JSON.parse(source.slice(start, index + 1));
            } catch {
              break;
            }
          }
        }
      }
    }
    throw error;
  }
}

module.exports = { parseJsonContent };
