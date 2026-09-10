'use strict';

const SHANGHAI_TIMEZONE = 'Asia/Shanghai';
const WINDOW_DAYS = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;

const DAILY_YOGA_PRACTICE = Object.freeze({
  title: '24 分钟全身瑜伽跟练',
  subtitle: '完整跟练 · 英文口令 · 无需器械',
  durationMinutes: 24,
  actualDuration: '24:18',
  videoUrl: 'https://img.surfplus.xyz/shroom/compound-system/yoga/20260909/fit-for-duty-yoga-24min-h264.mp4',
  posterUrl: 'https://img.surfplus.xyz/shroom/compound-system/yoga/20260909/fit-for-duty-yoga-poster.jpg',
  sourceTitle: 'Fit for Duty: Yoga · MAJ Lisa Lourey',
  sourceUrl: 'https://www.dvidshub.net/video/154394/fit-duty-yoga',
  license: 'DVIDS 标注为 Public Domain',
  notice: '美国政府视觉资料的出现不代表或构成其对 Shroom 或 SURFPLUS 的认可。'
});

let statsCache = null;

function roundOne(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function shanghaiDate(value = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: SHANGHAI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(value);
}

function emptySummary() {
  return {
    available: false,
    stale: false,
    completed: false,
    todayAssetCount: 0,
    todayMinutes: 0,
    totalMinutes: 0,
    compoundMinutes: 0,
    principalMinutes: 0,
    automationOnlyMinutes: 0,
    compoundRate: null,
    principalRate: null,
    leakageRate: null,
    topLeakageFamily: null,
    topLeakageMinutes: 0,
    totalAssetContributions: 0,
    totalReuseEvents: 0,
    assetSystems: [],
    generatedAt: null
  };
}

function summarizeCompoundTasks(payload, today = shanghaiDate(), now = new Date()) {
  if (!payload || !Array.isArray(payload.tasks)) return emptySummary();
  const generated = payload.meta && payload.meta.generatedAt ? new Date(payload.meta.generatedAt) : now;
  const referenceTime = Number.isNaN(generated.getTime()) ? now : generated;
  const cutoff = new Date(referenceTime.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const leakageFamilies = new Map();
  const assetBase = payload.assetBase || {};
  const summary = {
    ...emptySummary(),
    available: true,
    generatedAt: payload.meta?.generatedAt || null,
    totalAssetContributions: Number(assetBase.principalContributions) || 0,
    totalReuseEvents: Number(assetBase.reuseEvents) || 0,
    assetSystems: Array.isArray(assetBase.systems)
      ? assetBase.systems.map(item => ({
          key: String(item.key || ''),
          name: String(item.name || ''),
          contributions: Number(item.contributions) || 0,
          reuseEvents: Number(item.reuseEvents) || 0,
          recentContributions: Number(item.recentContributions) || 0,
          state: String(item.state || 'empty')
        }))
      : []
  };

  for (const task of payload.tasks) {
    if (!task || !task.completedAt) continue;
    const completedAt = new Date(task.completedAt);
    if (Number.isNaN(completedAt.getTime())) continue;
    const minutes = Math.max(0, Number(task.durationMinutes) || 0);
    const isCompound = task.status === 'reused' || task.leveraged === true;
    const isPrincipal = task.status === 'seed' || task.assetContribution === true;
    const isAutomationOnly = task.status === 'automated' && !isCompound;
    const isLeakage = ['manual_repeat', 'one_off', 'manual_once'].includes(task.status);

    if (completedAt >= cutoff && completedAt <= referenceTime) {
      summary.totalMinutes += minutes;
      if (isCompound) summary.compoundMinutes += minutes;
      if (isPrincipal) summary.principalMinutes += minutes;
      if (isAutomationOnly) summary.automationOnlyMinutes += minutes;
      if (isLeakage) {
        const family = String(task.family || task.category || '未分类手动工作').trim() || '未分类手动工作';
        leakageFamilies.set(family, (leakageFamilies.get(family) || 0) + minutes);
      }
    }

    if (shanghaiDate(completedAt) === today && (isPrincipal || isCompound)) {
      summary.todayAssetCount += 1;
      summary.todayMinutes += minutes;
    }
  }

  summary.totalMinutes = roundOne(summary.totalMinutes);
  summary.compoundMinutes = roundOne(summary.compoundMinutes);
  summary.principalMinutes = roundOne(summary.principalMinutes);
  summary.automationOnlyMinutes = roundOne(summary.automationOnlyMinutes);
  summary.todayMinutes = roundOne(summary.todayMinutes);
  summary.completed = summary.todayAssetCount > 0;
  if (summary.totalMinutes > 0) {
    summary.compoundRate = roundOne(summary.compoundMinutes / summary.totalMinutes * 100);
    summary.principalRate = roundOne(summary.principalMinutes / summary.totalMinutes * 100);
    summary.leakageRate = roundOne(
      [...leakageFamilies.values()].reduce((sum, value) => sum + value, 0) / summary.totalMinutes * 100
    );
  }

  const topLeakage = [...leakageFamilies.entries()].sort((left, right) => right[1] - left[1])[0];
  if (topLeakage) {
    summary.topLeakageFamily = topLeakage[0];
    summary.topLeakageMinutes = roundOne(topLeakage[1]);
  }
  return summary;
}

async function loadCompoundStats(options, today = shanghaiDate()) {
  const now = Date.now();
  if (statsCache && now - statsCache.fetchedAt < CACHE_TTL_MS) {
    return summarizeCompoundTasks(statsCache.payload, today);
  }
  if (!options.url) return emptySummary();

  const headers = { Accept: 'application/json' };
  if (options.username || options.password) {
    headers.Authorization = `Basic ${Buffer.from(`${options.username || ''}:${options.password || ''}`).toString('base64')}`;
  }

  try {
    const response = await fetch(options.url, {
      headers,
      signal: AbortSignal.timeout(Math.max(1000, Number(options.timeoutMs) || 8000))
    });
    if (!response.ok) throw new Error(`compound stats returned ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.tasks)) throw new Error('compound stats payload is invalid');
    statsCache = { payload, fetchedAt: now };
    return summarizeCompoundTasks(payload, today);
  } catch (error) {
    if (statsCache && now - statsCache.fetchedAt < STALE_TTL_MS) {
      return { ...summarizeCompoundTasks(statsCache.payload, today), stale: true };
    }
    return emptySummary();
  }
}

function bodyStreak(dates, today = shanghaiDate()) {
  const completed = new Set((dates || []).map(String));
  const cursor = new Date(`${today}T12:00:00+08:00`);
  if (!completed.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let count = 0;
  while (completed.has(shanghaiDate(cursor))) {
    count += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

function resetCompoundStatsCache() {
  statsCache = null;
}

module.exports = {
  DAILY_YOGA_PRACTICE,
  bodyStreak,
  emptySummary,
  loadCompoundStats,
  resetCompoundStatsCache,
  shanghaiDate,
  summarizeCompoundTasks
};
