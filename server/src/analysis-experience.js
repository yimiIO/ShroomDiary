'use strict';

const crypto = require('node:crypto');

const CLASSIC_VERSION = 'A1';
const COGNITION_VERSION = 'A1.1';
const EXPERIENCE_VERSIONS = new Set([CLASSIC_VERSION, COGNITION_VERSION]);
const FEEDBACK_ACTIONS = new Set(['HELPFUL', 'WRONG', 'WATCH']);

function clean(value, maximum = 2000) {
  return String(value || '').trim().slice(0, maximum);
}

function insightKey(observer, kind, index, title) {
  return crypto.createHash('sha256')
    .update([observer?.id, observer?.presetKey, kind, index, clean(title, 500)].join('|'))
    .digest('hex')
    .slice(0, 24);
}

function feedbackBoost(profile, presetKey) {
  const row = profile?.[presetKey] || profile?.custom || {};
  const helpful = Number(row.HELPFUL || 0);
  const watch = Number(row.WATCH || 0);
  const wrong = Number(row.WRONG || 0);
  const total = helpful + watch + wrong;
  if (!total) return 0;
  return Math.max(-12, Math.min(12, ((helpful * 4) + (watch * 2) - (wrong * 5)) / total * 2));
}

function extractInsightCandidates(observations = [], options = {}) {
  const profile = options.profile || {};
  const currentFeedback = new Map((options.currentFeedback || []).map(item => [item.insightKey, item]));
  const candidates = [];
  const seen = new Set();

  const append = (observer, kind, index, value) => {
    const title = clean(value.title, 600);
    if (!title) return;
    const normalized = title.replace(/[\s，。！？、,.!?：:；;（）()“”"']/gu, '').toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    const key = insightKey(observer, kind, index, title);
    const feedback = currentFeedback.get(key) || null;
    candidates.push({
      key,
      sourceObserverId: clean(observer?.id, 80),
      sourcePreset: clean(observer?.presetKey || 'custom', 48) || 'custom',
      sourceName: clean(observer?.shortName || observer?.name || '观察席', 80),
      nature: value.nature || 'AI_INTERPRETATION',
      title,
      detail: clean(value.detail, 1600),
      assumption: clean(value.assumption, 1000),
      suggestion: clean(value.suggestion, 1000),
      feedback: feedback ? { action: feedback.action, note: clean(feedback.note, 500) } : null,
      score: Number(value.score || 0) + feedbackBoost(profile, observer?.presetKey || 'custom')
    });
  };

  for (const entry of Array.isArray(observations) ? observations : []) {
    const observer = entry?.observer || {};
    const result = entry?.result || {};
    const preset = observer.presetKey || observer.renderType || 'custom';
    if (result.disabled) continue;
    if (preset === 'first_principles') {
      (Array.isArray(result.principles) ? result.principles : []).forEach((item, index) => append(observer, 'principle', index, {
        title: item.principle,
        detail: item.reflection,
        assumption: item.unverifiedAssumption,
        suggestion: item.actionableFix,
        score: 110 - index
      }));
    } else if (preset === 'entropy') {
      (Array.isArray(result.events) ? result.events : []).forEach((item, index) => append(observer, 'event', index, {
        title: item.event,
        detail: item.prediction,
        suggestion: item.action,
        score: (item.state === 'entropy_increase' ? 100 : item.state === 'boundary' ? 90 : 76) - index
      }));
    } else if (preset === 'compound') {
      (Array.isArray(result.ruleCheck) ? result.ruleCheck : []).forEach((item, index) => append(observer, 'rule', index, {
        title: item.rule,
        detail: item.evidence,
        score: (item.status === 'violated' ? 96 : item.status === 'not_covered' ? 82 : 70) - index
      }));
      (Array.isArray(result.newRules) ? result.newRules : []).forEach((item, index) => append(observer, 'new-rule', index, {
        title: item,
        nature: 'SUGGESTION',
        score: 78 - index
      }));
    } else if (preset === 'life_os') {
      (Array.isArray(result.violated) ? result.violated : []).forEach((item, index) => append(observer, 'violated', index, {
        title: item.rule,
        detail: item.evidence,
        suggestion: item.remediation,
        score: 105 - index
      }));
      (Array.isArray(result.followed) ? result.followed : []).forEach((item, index) => append(observer, 'followed', index, {
        title: item.rule,
        detail: item.evidence,
        score: 72 - index
      }));
    } else if (preset === 'biological') {
      if (!result.skipped) append(observer, 'essence', 0, {
        title: result.essence,
        detail: result.riskState,
        suggestion: Array.isArray(result.strategies) ? result.strategies[0]?.action : '',
        score: 84
      });
    } else {
      (Array.isArray(result.observations) ? result.observations : []).forEach((item, index) => append(observer, 'custom', index, {
        title: item.title || result.title,
        detail: item.interpretation || item.evidence || result.summary,
        suggestion: index === 0 ? result.nextStep : '',
        score: 88 - index
      }));
      if (!Array.isArray(result.observations) || !result.observations.length) append(observer, 'custom-summary', 0, {
        title: result.title,
        detail: result.summary,
        suggestion: result.nextStep,
        score: 86
      });
    }
  }
  return candidates.sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));
}

function buildFeaturedInsights(observations, options = {}) {
  return extractInsightCandidates(observations, options).slice(0, 3).map(({ score, ...item }) => item);
}

function feedbackProfile(rows = []) {
  const profile = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const preset = clean(row.observerPreset || row.observer_preset || 'custom', 48) || 'custom';
    const action = clean(row.action, 20).toUpperCase();
    if (!FEEDBACK_ACTIONS.has(action)) continue;
    if (!profile[preset]) profile[preset] = {};
    profile[preset][action] = Number(profile[preset][action] || 0) + Number(row.count || 1);
  }
  return profile;
}

module.exports = {
  CLASSIC_VERSION,
  COGNITION_VERSION,
  EXPERIENCE_VERSIONS,
  FEEDBACK_ACTIONS,
  buildFeaturedInsights,
  extractInsightCandidates,
  feedbackProfile,
  insightKey
};
