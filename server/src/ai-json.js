'use strict';

function parseJsonContent(value) {
  let source = String(value || '').trim();
  source = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(source);
  } catch (error) {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
    throw error;
  }
}

module.exports = { parseJsonContent };
