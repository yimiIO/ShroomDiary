'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCORE_RULES,
  clampScore,
  relationshipLevel,
  ruleChange,
  shouldContact
} = require('../src/friend-rules');

test('all Lobster score rules retain their deterministic values', () => {
  assert.deepEqual(SCORE_RULES, {
    R_PLUS_ACTIVE_CONTACT: 1,
    R_PLUS_INFO: 2,
    R_PLUS_HELP: 2,
    R_PLUS_COWORK: 3,
    R_PLUS_KEY_SUPPORT: 3,
    R_PLUS_RETURN: 2,
    R_MINUS_FREELOAD: -1,
    R_MINUS_TAKE_ONLY: -2,
    R_MINUS_BACKBITE: -3,
    R_MINUS_BREAK_PROMISE: -2,
    R_MINUS_ENERGY: -1,
    R_MINUS_MISMATCH: -1
  });
});

test('a rule code overrides an untrusted suggested score', () => {
  assert.equal(ruleChange('R_PLUS_HELP', -3), 2);
  assert.equal(ruleChange('R_MINUS_BACKBITE', 3), -3);
  assert.throws(() => ruleChange('R_UNKNOWN', 1), /未知/);
});

test('manual score changes are bounded and scores remain between 1 and 10', () => {
  assert.equal(ruleChange(null, -2), -2);
  assert.throws(() => ruleChange(null, 0));
  assert.throws(() => ruleChange(null, 4));
  assert.equal(clampScore(-100), 1);
  assert.equal(clampScore(100), 10);
});

test('relationship levels and contact reminders match the Lobster policy', () => {
  assert.deepEqual(relationshipLevel(10), { code: 'core', label: '核心', contactDays: 14 });
  assert.deepEqual(relationshipLevel(8), { code: 'important', label: '重要', contactDays: 21 });
  assert.deepEqual(relationshipLevel(6), { code: 'general', label: '一般', contactDays: 45 });
  assert.equal(relationshipLevel(4).code, 'edge');
  assert.equal(relationshipLevel(2).code, 'draining');
  assert.equal(shouldContact(9, 15), true);
  assert.equal(shouldContact(7, 21), false);
  assert.equal(shouldContact(7, 22), true);
  assert.equal(shouldContact(6, 46), true);
  assert.equal(shouldContact(4, 365), false);
});
