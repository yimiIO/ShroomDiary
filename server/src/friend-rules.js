'use strict';

const SCORE_RULES = Object.freeze({
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

function clampScore(value) {
  return Math.max(1, Math.min(10, Math.round(Number(value) || 4)));
}

function relationshipLevel(score) {
  const value = clampScore(score);
  if (value >= 9) return { code: 'core', label: '核心', contactDays: 14 };
  if (value >= 7) return { code: 'important', label: '重要', contactDays: 21 };
  if (value >= 5) return { code: 'general', label: '一般', contactDays: 45 };
  if (value >= 3) return { code: 'edge', label: '边缘', contactDays: null };
  return { code: 'draining', label: '消耗', contactDays: null };
}

function ruleChange(ruleCode, requestedChange) {
  if (ruleCode) {
    if (!Object.prototype.hasOwnProperty.call(SCORE_RULES, ruleCode)) {
      throw Object.assign(new Error('未知的人脉评分规则'), { code: 'SHROOM_FRIEND_RULE' });
    }
    return SCORE_RULES[ruleCode];
  }
  const change = Number(requestedChange);
  if (!Number.isInteger(change) || change === 0 || change < -3 || change > 3) {
    throw Object.assign(new Error('分值变化必须是 -3 到 3 之间的非零整数'), { code: 'SHROOM_FRIEND_SCORE' });
  }
  return change;
}

function shouldContact(score, daysSinceInteraction) {
  const level = relationshipLevel(score);
  return level.contactDays !== null && Number(daysSinceInteraction) > level.contactDays;
}

module.exports = {
  SCORE_RULES,
  clampScore,
  relationshipLevel,
  ruleChange,
  shouldContact
};
