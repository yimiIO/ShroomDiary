'use strict';

const activeStatuses = new Set(['pending', 'running', 'processing']);

function shouldReuseSavedResult(existing, regenerate = false) {
  if (!existing) return false;
  if (activeStatuses.has(String(existing.status || '').toLowerCase())) return true;
  return regenerate !== true;
}

module.exports = { shouldReuseSavedResult };
