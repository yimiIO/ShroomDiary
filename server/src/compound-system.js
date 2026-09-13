'use strict';

const SHANGHAI_TIMEZONE = 'Asia/Shanghai';
const WINDOW_DAYS = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;

const DAILY_YOGA_PRACTICE = Object.freeze({
  title: '分段瑜伽：看懂一个动作，再自己练',
  subtitle: '7 个短片段 · 动作要点 · 自主计时',
  durationMinutes: 15,
  actualDuration: '24:18',
  videoUrl: 'https://img.surfplus.xyz/shroom/compound-system/yoga/20260909/fit-for-duty-yoga-24min-h264.mp4',
  posterUrl: 'https://img.surfplus.xyz/shroom/compound-system/yoga/20260909/fit-for-duty-yoga-poster.jpg',
  sourceTitle: 'Fit for Duty: Yoga · MAJ Lisa Lourey',
  sourceUrl: 'https://www.dvidshub.net/video/154394/fit-duty-yoga',
  license: 'DVIDS 标注为 Public Domain',
  notice: '美国政府视觉资料的出现不代表或构成其对 Shroom 或 SURFPLUS 的认可。',
  safety: '这是日常活动练习，不是医疗指导。动作只做到舒适范围；出现疼痛、眩晕或明显不适时立即停止。',
  segments: Object.freeze([
    {
      id: 'standing-breath',
      title: '站立呼吸与上伸',
      startSeconds: 82,
      endSeconds: 142,
      practiceSeconds: 60,
      focus: '先找到站立中的呼吸和轴线，不追求拉得更远。',
      steps: Object.freeze(['双脚均匀受力，膝盖不锁死。', '吸气时手臂上伸，呼气时肩膀下沉。']),
      caution: '腰部不要为了手臂更高而过度后弯。'
    },
    {
      id: 'forward-fold',
      title: '髋折叠前屈',
      startSeconds: 150,
      endSeconds: 210,
      practiceSeconds: 60,
      focus: '把前屈理解成髋部折叠，而不是用背部硬压。',
      steps: Object.freeze(['先屈膝，腹部靠近大腿。', '从髋部折叠，双手落在能稳定支撑的位置。']),
      caution: '腿后侧紧时保持屈膝，不强行碰地。'
    },
    {
      id: 'low-lunge',
      title: '低弓步',
      startSeconds: 218,
      endSeconds: 285,
      practiceSeconds: 90,
      focus: '让前脚稳定、后侧髋部逐渐打开。',
      steps: Object.freeze(['前膝朝第二脚趾方向，不向内塌。', '后膝可以落地，骨盆保持朝前。']),
      caution: '前膝不适时缩小步幅，膝下可加软垫。'
    },
    {
      id: 'plank-transition',
      title: '平板支撑过渡',
      startSeconds: 290,
      endSeconds: 355,
      practiceSeconds: 60,
      focus: '先学会保持躯干稳定，再考虑幅度。',
      steps: Object.freeze(['手腕大致在肩下，手指展开压地。', '必要时双膝落地，保持头、背和髋的长线。']),
      caution: '手腕或腰背不适时立即落膝或跳过。'
    },
    {
      id: 'side-reach',
      title: '侧向伸展',
      startSeconds: 535,
      endSeconds: 600,
      practiceSeconds: 60,
      focus: '延长躯干两侧，而不是为了触地而挤压腰部。',
      steps: Object.freeze(['双脚保持稳定，胸口不要朝地面塌下。', '上侧手臂向远处延伸，保持顺畅呼吸。']),
      caution: '有腰部夹挤感时减少侧弯幅度。'
    },
    {
      id: 'bridge',
      title: '桥式',
      startSeconds: 1168,
      endSeconds: 1235,
      practiceSeconds: 90,
      focus: '用双脚和臀部推起骨盆，保持颈部安静。',
      steps: Object.freeze(['仰卧屈膝，双脚与髋同宽，靠近臀部。', '呼气时压脚抬髋，吸气时稳定保持，再缓慢落下。']),
      caution: '不转头，压力保持在肩背而不是颈部。'
    },
    {
      id: 'supine-twist',
      title: '仰卧扭转与收束',
      startSeconds: 1245,
      endSeconds: 1325,
      practiceSeconds: 90,
      focus: '用缓慢呼吸收束，幅度不需要对称或到底。',
      steps: Object.freeze(['仰卧屈膝，双肩保持贴地。', '双膝缓慢倒向一侧，停留几次呼吸后换边。']),
      caution: '肩膀离地或腰部不适时，把膝盖放高一些。'
    }
  ])
});

function normalizeYogaSelection(values) {
  const known = new Map(DAILY_YOGA_PRACTICE.segments.map(item => [item.id, item]));
  const segmentIds = [...new Set(Array.isArray(values) ? values.map(String) : [])]
    .filter(id => known.has(id));
  const seconds = segmentIds.reduce((sum, id) => sum + known.get(id).practiceSeconds, 0);
  return {
    segmentIds,
    durationMinutes: Math.max(segmentIds.length ? 1 : 0, Math.ceil(seconds / 60))
  };
}

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
  normalizeYogaSelection,
  resetCompoundStatsCache,
  shanghaiDate,
  summarizeCompoundTasks
};
