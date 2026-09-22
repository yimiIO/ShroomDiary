'use strict';

const HOTSPOT_DIMENSIONS = Object.freeze({
  targetAudienceFit: 0.28,
  brandTruthFit: 0.22,
  participationPotential: 0.14,
  freshness: 0.14,
  evidenceQuality: 0.12,
  safety: 0.10
});

const HARD_STOP_TYPES = new Set([
  'POLITICAL_EVENT',
  'MEMORIAL_EVENT',
  'DISASTER_OR_ACCIDENT',
  'PUBLIC_HEALTH_PANIC',
  'CELEBRITY_PRIVATE_MISFORTUNE',
  'UNVERIFIED_ALLEGATION'
]);

const COLUMN_ROUTES = Object.freeze({
  PAST_EVIDENCE: '过去怎样在今天帮到我',
  ANALYSIS_BOUNDARY: '一条日记能发现什么',
  FOUNDER_JUDGMENT: '做菇的人'
});

function boundedScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(5, score));
}

function weightedScore(scores = {}) {
  return Math.round(Object.entries(HOTSPOT_DIMENSIONS).reduce((total, [key, weight]) => {
    return total + (boundedScore(scores[key]) / 5) * weight * 100;
  }, 0));
}

function routeColumn(angle) {
  return COLUMN_ROUTES[angle] || null;
}

function evaluateHotspot(candidate = {}) {
  const hardStopReasons = Array.isArray(candidate.hardStopReasons)
    ? candidate.hardStopReasons.filter(reason => HARD_STOP_TYPES.has(reason))
    : [];
  const score = weightedScore(candidate.scores);
  const sourceCount = new Set((candidate.sources || []).map(source => source && source.url).filter(Boolean)).size;
  const column = routeColumn(candidate.angle);
  const missing = [];

  if (!String(candidate.title || '').trim()) missing.push('title');
  if (!column) missing.push('column_route');
  if (!sourceCount) missing.push('source');
  if (!String(candidate.shroomTruth || '').trim()) missing.push('shroom_truth');
  if (!String(candidate.userQuestion || '').trim()) missing.push('user_question');

  let decision = 'REJECT';
  if (!hardStopReasons.length && !missing.length) {
    if (score >= 78) decision = 'PURSUE';
    else if (score >= 62) decision = 'WATCH';
  }

  return {
    decision,
    score,
    column,
    hardStopReasons,
    missing,
    evidenceType: candidate.evidenceType || 'UNKNOWN',
    expiresAt: candidate.expiresAt || null,
    restrictions: [
      '热点只能提供进入角度，不能替代真实产品证据',
      '不得使用悲剧、纪念、公共安全或未核实指控营销',
      '跨平台信号不得冒充小红书官方热点',
      '超过截止时间未发布则转为常青选题或放弃'
    ]
  };
}

module.exports = {
  COLUMN_ROUTES,
  HARD_STOP_TYPES,
  HOTSPOT_DIMENSIONS,
  evaluateHotspot,
  routeColumn,
  weightedScore
};
