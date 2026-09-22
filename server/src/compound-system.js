'use strict';

const SHANGHAI_TIMEZONE = 'Asia/Shanghai';
const WINDOW_DAYS = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;

const DAILY_YOGA_PRACTICE = Object.freeze({
  title: '7 动作全身瑜伽：看懂，再自己练',
  subtitle: '7 个互补动作 · 全身覆盖 · 自主计时',
  durationMinutes: 10,
  actualDuration: '24:18',
  selectionVersion: '2026-09-14',
  coverageAreas: Object.freeze(['肩背', '胸腹前侧', '躯干两侧', '脊柱', '髋', '大腿后侧', '小腿']),
  videoKeys: Object.freeze({
    en: 'public/compound-system/yoga/20260913/fit-for-duty-yoga-24min-en.mp4',
    zh: 'public/compound-system/yoga/20260914/fit-for-duty-yoga-7-movement-zh.mp4'
  }),
  posterKey: 'public/compound-system/yoga/20260913/fit-for-duty-yoga-poster.jpg',
  sourceTitle: 'Fit for Duty: Yoga · MAJ Lisa Lourey',
  sourceUrl: 'https://www.dvidshub.net/video/154394/fit-duty-yoga',
  license: 'DVIDS 标注为 Public Domain',
  notice: '美国政府视觉资料的出现不代表或构成其对 Shroom 或 SURFPLUS 的认可。',
  safety: '这是日常活动练习，不是医疗指导。动作只做到舒适范围；出现疼痛、眩晕或明显不适时立即停止。',
  segments: Object.freeze([
    {
      id: 'side-reach',
      title: '站立侧向伸展',
      titleEn: 'Standing side stretch',
      startSeconds: 694,
      endSeconds: 719,
      practiceSeconds: 60,
      targets: Object.freeze(['肩背', '躯干两侧']),
      focus: '先向上延长躯干，再分别向两侧伸展，不用追求更深。',
      focusEn: 'Lengthen upward first, then reach to each side without chasing a deeper bend.',
      steps: Object.freeze(['双脚均匀踩地，膝盖保持柔软，双臂上伸。', '身体分别向左右侧弯，胸口保持朝前。']),
      stepsEn: Object.freeze(['Ground both feet evenly, keep the knees soft, and reach the arms overhead.', 'Bend to each side while keeping the chest facing forward.']),
      caution: '腰部有夹挤感时立刻减小幅度，不向前塌胸。',
      cautionEn: 'Reduce the range if the waist pinches, and do not collapse the chest forward.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 1, zh: '双脚踩稳，先把躯干向上延长。', en: 'Ground the feet and lengthen the torso upward first.' }),
        Object.freeze({ atSeconds: 13, zh: '左右都练，腰部有挤压就减小幅度。', en: 'Practice both sides and reduce the range if the waist pinches.' })
      ])
    },
    {
      id: 'forward-fold',
      title: '屈膝辅助前屈',
      titleEn: 'Bent-knee forward fold',
      startSeconds: 82,
      endSeconds: 104,
      practiceSeconds: 90,
      targets: Object.freeze(['大腿后侧', '下背']),
      focus: '把前屈理解成髋部折叠，而不是用背部硬压。',
      focusEn: 'Fold from the hips with bent knees instead of forcing the back downward.',
      steps: Object.freeze(['先屈膝，让腹部靠近大腿，颈部放松。', '从髋部折叠，双手落在地面、瑜伽砖或小腿上。']),
      stepsEn: Object.freeze(['Bend the knees, bring the torso toward the thighs, and relax the neck.', 'Hinge from the hips and rest the hands on the floor, blocks, or shins.']),
      caution: '腿后侧紧时保持屈膝，不强行碰地。',
      cautionEn: 'If the hamstrings feel tight, keep the knees bent and do not force the hands to the floor.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 1, zh: '先屈膝，让腹部靠近大腿。', en: 'Bend the knees and bring the torso toward the thighs.' }),
        Object.freeze({ atSeconds: 12, zh: '从髋部折叠，双手不必碰地。', en: 'Fold from the hips; the hands do not need to reach the floor.' })
      ])
    },
    {
      id: 'downward-dog',
      title: '下犬式',
      titleEn: 'Downward-facing dog',
      startSeconds: 374,
      endSeconds: 386,
      practiceSeconds: 60,
      targets: Object.freeze(['肩背', '大腿后侧', '小腿']),
      focus: '先把背部拉长；膝盖可以弯，脚跟不需要踩地。',
      focusEn: 'Lengthen the back first; the knees may bend and the heels do not need to touch down.',
      steps: Object.freeze(['双手展开推地，坐骨向后上方移动。', '保持屈膝也可以，优先让脊柱和肩背有空间。']),
      stepsEn: Object.freeze(['Spread the hands, press the floor away, and send the hips back and up.', 'Keep the knees bent if needed and prioritize space through the spine and shoulders.']),
      caution: '手腕或肩部不适时跳过，改练婴儿式。',
      cautionEn: "Skip this pose and use child's pose if the wrists or shoulders hurt.",
      captions: Object.freeze([
        Object.freeze({ atSeconds: 1, zh: '膝盖可以弯，先把背部拉长。', en: 'The knees may bend; lengthen the back first.' })
      ])
    },
    {
      id: 'low-lunge',
      title: '低弓步',
      titleEn: 'Low lunge',
      startSeconds: 509,
      endSeconds: 534,
      practiceSeconds: 120,
      targets: Object.freeze(['髋前侧', '大腿前侧']),
      focus: '前脚稳定、后膝有支撑，左右两侧都练。',
      focusEn: 'Keep the front foot stable, support the back knee, and practice both sides.',
      steps: Object.freeze(['前膝朝第二脚趾方向，后膝落在软垫上。', '骨盆保持朝前，身体向上延长后再缓慢向前。']),
      stepsEn: Object.freeze(['Track the front knee toward the second toe and cushion the back knee.', 'Keep the pelvis facing forward and lengthen upward before moving forward.']),
      caution: '前膝不适时缩小步幅；后膝敏感时加垫或跳过。',
      cautionEn: 'Shorten the stance if the front knee hurts; cushion or skip if the back knee is sensitive.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 1, zh: '后膝落地并加垫，前膝保持稳定。', en: 'Lower and cushion the back knee; keep the front knee stable.' }),
        Object.freeze({ atSeconds: 13, zh: '骨盆朝前，左右两侧都要练。', en: 'Keep the pelvis facing forward and practice both sides.' })
      ])
    },
    {
      id: 'gentle-cobra',
      title: '温和眼镜蛇式',
      titleEn: 'Gentle cobra',
      startSeconds: 615,
      endSeconds: 623,
      practiceSeconds: 60,
      targets: Object.freeze(['胸肩', '胸腹前侧', '脊柱伸展']),
      focus: '只抬到胸口能打开、腰部仍舒适的位置，手臂不必伸直。',
      focusEn: 'Lift only high enough to open the chest while the lower back stays comfortable; the arms need not straighten.',
      steps: Object.freeze(['俯卧，双手放在肩膀附近，手肘向后。', '轻压脚背，用上背部带动胸口小幅抬起。']),
      stepsEn: Object.freeze(['Lie prone with the hands near the shoulders and the elbows pointing back.', 'Press the tops of the feet down and let the upper back lift the chest slightly.']),
      caution: '腰部出现挤压或疼痛时立刻降低高度或跳过。',
      cautionEn: 'Lower the chest or skip the pose if the lower back feels pinched or painful.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 1, zh: '手肘微屈，小幅抬胸，腰部不要挤压。', en: 'Keep the elbows soft, lift the chest slightly, and avoid pinching the lower back.' })
      ])
    },
    {
      id: 'supine-twist',
      title: '仰卧扭转与收束',
      titleEn: 'Supine twist and release',
      startSeconds: 1239,
      endSeconds: 1296,
      practiceSeconds: 120,
      targets: Object.freeze(['脊柱', '臀髋']),
      focus: '让双膝分别倒向两侧，用缓慢呼吸完成旋转。',
      focusEn: 'Let the knees move to each side and use slow breathing through the rotation.',
      steps: Object.freeze(['仰卧屈膝，双肩保持贴地。', '双膝缓慢倒向一侧，停留几次呼吸后换边。']),
      stepsEn: Object.freeze(['Lie down with knees bent and keep both shoulders grounded.', 'Let the knees move slowly to one side, stay for a few breaths, then change sides.']),
      caution: '肩膀离地或腰部不适时，把膝盖放高一些。',
      cautionEn: 'Keep the knees higher if a shoulder lifts or the lower back feels uncomfortable.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 1, zh: '双肩贴地，双膝缓慢倒向一侧。', en: 'Keep both shoulders grounded and let the knees move to one side.' }),
        Object.freeze({ atSeconds: 30, zh: '回到中间，再按舒适幅度换边。', en: 'Return to center, then change sides within a comfortable range.' }),
        Object.freeze({ atSeconds: 45, zh: '不必压到底，让呼吸带着身体停留。', en: 'Do not force the knees down; let the breath support the hold.' })
      ])
    },
    {
      id: 'child-pose',
      title: '婴儿式放松',
      titleEn: "Child's pose",
      startSeconds: 1413,
      endSeconds: 1440,
      practiceSeconds: 90,
      targets: Object.freeze(['背部', '肩部', '髋部']),
      focus: '用它收尾：放慢呼吸，让背部、肩膀和髋部逐渐松开。',
      focusEn: 'Use it to finish: slow the breath and let the back, shoulders, and hips soften.',
      steps: Object.freeze(['双膝按舒适宽度打开，臀部向脚跟方向后坐。', '额头落在垫子或支撑物上，手臂可向前或放在身体两侧。']),
      stepsEn: Object.freeze(['Open the knees to a comfortable width and send the hips toward the heels.', 'Rest the forehead on the mat or a support; reach the arms forward or place them by the body.']),
      caution: '膝或髋不适时加垫、缩小幅度或跳过。',
      cautionEn: 'Add support, reduce the range, or skip if the knees or hips are uncomfortable.',
      captions: Object.freeze([
        Object.freeze({ atSeconds: 1, zh: '双膝舒适打开，臀部向脚跟方向后坐。', en: 'Open the knees comfortably and send the hips toward the heels.' }),
        Object.freeze({ atSeconds: 14, zh: '额头有支撑，放慢呼吸，让肩背松开。', en: 'Support the forehead, slow the breath, and soften the shoulders and back.' })
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
