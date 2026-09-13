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
  videoKeys: Object.freeze({
    en: 'public/compound-system/yoga/20260913/fit-for-duty-yoga-24min-en.mp4',
    zh: 'public/compound-system/yoga/20260913/fit-for-duty-yoga-24min-zh.mp4'
  }),
  posterKey: 'public/compound-system/yoga/20260913/fit-for-duty-yoga-poster.jpg',
  sourceTitle: 'Fit for Duty: Yoga · MAJ Lisa Lourey',
  sourceUrl: 'https://www.dvidshub.net/video/154394/fit-duty-yoga',
  license: 'DVIDS 标注为 Public Domain',
  notice: '美国政府视觉资料的出现不代表或构成其对 Shroom 或 SURFPLUS 的认可。',
  safety: '这是日常活动练习，不是医疗指导。动作只做到舒适范围；出现疼痛、眩晕或明显不适时立即停止。',
  segments: Object.freeze([
    {
      id: 'standing-breath',
      title: '站立呼吸与上伸',
      titleEn: 'Standing breath and reach',
      startSeconds: 62,
      endSeconds: 98,
      practiceSeconds: 60,
      focus: '先找到站立中的呼吸和轴线，不追求拉得更远。',
      focusEn: 'Find steady breathing and a long standing line before reaching farther.',
      steps: Object.freeze(['双脚均匀受力，膝盖不锁死。', '吸气时手臂上伸，呼气时肩膀下沉。']),
      stepsEn: Object.freeze(['Share your weight evenly through both feet and keep the knees soft.', 'Reach the arms up as you inhale; let the shoulders settle as you exhale.']),
      caution: '腰部不要为了手臂更高而过度后弯。',
      cautionEn: 'Do not overarch the lower back just to lift the arms higher.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 0, zh: '双脚均匀踩地，膝盖保持柔软。', en: 'Ground both feet evenly and keep your knees soft.' }),
        Object.freeze({ atSeconds: 12, zh: '吸气，手臂向上；呼气，肩膀向下。', en: 'Inhale and reach up. Exhale and let the shoulders settle.' }),
        Object.freeze({ atSeconds: 24, zh: '保持躯干修长，不用追求更大的幅度。', en: 'Keep the torso long. You do not need a bigger range.' })
      ])
    },
    {
      id: 'forward-fold',
      title: '屈膝辅助前屈',
      titleEn: 'Bent-knee forward fold',
      startSeconds: 150,
      endSeconds: 210,
      practiceSeconds: 60,
      focus: '把前屈理解成髋部折叠，而不是用背部硬压。',
      focusEn: 'Fold from the hips with bent knees instead of forcing the back downward.',
      steps: Object.freeze(['先屈膝，腹部靠近大腿。', '从髋部折叠，双手落在能稳定支撑的位置。']),
      stepsEn: Object.freeze(['Bend the knees first and bring the torso toward the thighs.', 'Hinge from the hips and place the hands wherever they can rest securely.']),
      caution: '腿后侧紧时保持屈膝，不强行碰地。',
      cautionEn: 'If the hamstrings feel tight, keep the knees bent and do not force the hands to the floor.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 0, zh: '先屈膝，让腹部靠近大腿。', en: 'Bend your knees first and bring the torso toward the thighs.' }),
        Object.freeze({ atSeconds: 20, zh: '从髋部折叠，背部不要向下硬压。', en: 'Hinge from the hips instead of forcing the back down.' }),
        Object.freeze({ atSeconds: 40, zh: '双手放在能稳定支撑的位置，不必碰地。', en: 'Rest the hands wherever they feel supported. Reaching the floor is not the goal.' })
      ])
    },
    {
      id: 'low-lunge',
      title: '低弓步',
      titleEn: 'Low lunge',
      startSeconds: 218,
      endSeconds: 285,
      practiceSeconds: 90,
      focus: '让前脚稳定、后侧髋部逐渐打开。',
      focusEn: 'Keep the front foot steady and let the back hip open gradually.',
      steps: Object.freeze(['前膝朝第二脚趾方向，不向内塌。', '后膝可以落地，骨盆保持朝前。']),
      stepsEn: Object.freeze(['Track the front knee toward the second toe without letting it collapse inward.', 'The back knee may rest down; keep the pelvis facing forward.']),
      caution: '前膝不适时缩小步幅，膝下可加软垫。',
      cautionEn: 'Shorten the stance if the front knee is uncomfortable, and cushion the back knee if needed.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 0, zh: '前脚踩稳，后膝可以落地。', en: 'Ground the front foot. The back knee may rest on the floor.' }),
        Object.freeze({ atSeconds: 24, zh: '前膝朝向第二脚趾，骨盆保持朝前。', en: 'Track the front knee toward the second toe and keep the pelvis facing forward.' }),
        Object.freeze({ atSeconds: 48, zh: '随着呼吸逐渐打开后侧髋部，不要硬压。', en: 'Let the back hip open gradually with the breath. Do not force it.' })
      ])
    },
    {
      id: 'child-pose',
      title: '婴儿式放松',
      titleEn: "Child's pose",
      startSeconds: 1412,
      endSeconds: 1452,
      practiceSeconds: 90,
      focus: '把它作为主动休息：放慢呼吸，让背部和髋部逐渐松开。',
      focusEn: 'Use this as active rest: slow the breath and let the back and hips soften gradually.',
      steps: Object.freeze(['双膝按舒适宽度打开，臀部向脚跟方向后坐。', '额头落在垫子或支撑物上，手臂可向前或放在身体两侧。']),
      stepsEn: Object.freeze(['Open the knees to a comfortable width and send the hips toward the heels.', 'Rest the forehead on the mat or a support; reach the arms forward or place them by the body.']),
      caution: '膝或髋不适时在臀部和脚跟之间加垫，也可以跳过。',
      cautionEn: 'If the knees or hips are uncomfortable, add support between the hips and heels or skip the pose.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 0, zh: '双膝按舒适宽度打开，臀部向后坐。', en: 'Open the knees comfortably and send the hips back.' }),
        Object.freeze({ atSeconds: 14, zh: '额头落在垫子或支撑物上，让颈部放松。', en: 'Rest the forehead on the mat or a support and relax the neck.' }),
        Object.freeze({ atSeconds: 28, zh: '放慢呼吸，感受背部和髋部逐渐松开。', en: 'Slow the breath and let the back and hips soften.' })
      ])
    },
    {
      id: 'side-reach',
      title: '侧向伸展',
      titleEn: 'Side stretch',
      startSeconds: 535,
      endSeconds: 600,
      practiceSeconds: 60,
      focus: '延长躯干两侧，而不是为了触地而挤压腰部。',
      focusEn: 'Lengthen both sides of the torso instead of compressing the waist to reach the floor.',
      steps: Object.freeze(['双脚保持稳定，胸口不要朝地面塌下。', '上侧手臂向远处延伸，保持顺畅呼吸。']),
      stepsEn: Object.freeze(['Keep both feet steady and avoid collapsing the chest toward the floor.', 'Reach the upper arm away while keeping the breath easy.']),
      caution: '有腰部夹挤感时减少侧弯幅度。',
      cautionEn: 'Reduce the bend if you feel pinching in the waist or lower back.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 0, zh: '双脚保持稳定，先把躯干向上延长。', en: 'Keep both feet steady and lengthen the torso upward first.' }),
        Object.freeze({ atSeconds: 22, zh: '上侧手臂向远处延伸，胸口不要朝地面塌下。', en: 'Reach the upper arm away and keep the chest from collapsing toward the floor.' }),
        Object.freeze({ atSeconds: 44, zh: '腰部有夹挤感就减小幅度。', en: 'Reduce the range if you feel pinching in the waist.' })
      ])
    },
    {
      id: 'bridge',
      title: '桥式',
      titleEn: 'Bridge pose',
      startSeconds: 1168,
      endSeconds: 1235,
      practiceSeconds: 90,
      focus: '用双脚和臀部推起骨盆，保持颈部安静。',
      focusEn: 'Use the feet and glutes to lift the pelvis while keeping the neck quiet.',
      steps: Object.freeze(['仰卧屈膝，双脚与髋同宽，靠近臀部。', '呼气时压脚抬髋，吸气时稳定保持，再缓慢落下。']),
      stepsEn: Object.freeze(['Lie down with knees bent and feet hip-width, close to the hips.', 'Press through the feet to lift, breathe steadily, then lower with control.']),
      caution: '不转头，压力保持在肩背而不是颈部。',
      cautionEn: 'Do not turn the head; keep the load through the shoulders and upper back rather than the neck.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 0, zh: '仰卧屈膝，双脚与髋同宽并靠近臀部。', en: 'Lie down with knees bent and feet hip-width, close to the hips.' }),
        Object.freeze({ atSeconds: 24, zh: '双脚压地，缓慢抬起骨盆。', en: 'Press through both feet and slowly lift the pelvis.' }),
        Object.freeze({ atSeconds: 48, zh: '颈部保持安静，再有控制地缓慢落下。', en: 'Keep the neck quiet, then lower slowly with control.' })
      ])
    },
    {
      id: 'supine-twist',
      title: '仰卧扭转与收束',
      titleEn: 'Supine twist and release',
      startSeconds: 1245,
      endSeconds: 1325,
      practiceSeconds: 90,
      focus: '用缓慢呼吸收束，幅度不需要对称或到底。',
      focusEn: 'Finish with slow breathing; the range does not need to be equal or maximal.',
      steps: Object.freeze(['仰卧屈膝，双肩保持贴地。', '双膝缓慢倒向一侧，停留几次呼吸后换边。']),
      stepsEn: Object.freeze(['Lie down with knees bent and keep both shoulders grounded.', 'Let the knees move slowly to one side, stay for a few breaths, then change sides.']),
      caution: '肩膀离地或腰部不适时，把膝盖放高一些。',
      cautionEn: 'Keep the knees higher if a shoulder lifts or the lower back feels uncomfortable.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 0, zh: '仰卧屈膝，双肩保持贴地。', en: 'Lie down with knees bent and keep both shoulders grounded.' }),
        Object.freeze({ atSeconds: 28, zh: '双膝缓慢倒向一侧，停留几次呼吸。', en: 'Let the knees move slowly to one side and stay for a few breaths.' }),
        Object.freeze({ atSeconds: 55, zh: '回到中间，再按自己的舒适幅度换边。', en: 'Return to center, then change sides within your comfortable range.' })
      ])
    }
  ])
});

async function presentYogaPractice(signObjectUrl) {
  const [englishVideo, chineseVideo, poster] = await Promise.all([
    signObjectUrl(DAILY_YOGA_PRACTICE.videoKeys.en),
    signObjectUrl(DAILY_YOGA_PRACTICE.videoKeys.zh),
    signObjectUrl(DAILY_YOGA_PRACTICE.posterKey)
  ]);
  const { videoKeys, posterKey, ...practice } = DAILY_YOGA_PRACTICE;
  return {
    ...practice,
    videoUrl: englishVideo,
    videoUrls: { en: englishVideo, zh: chineseVideo },
    posterUrl: poster
  };
}

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
  presentYogaPractice,
  resetCompoundStatsCache,
  shanghaiDate,
  summarizeCompoundTasks
};
