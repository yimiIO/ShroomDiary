'use strict';

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const { DAILY_YOGA_PRACTICE, bodyStreak, loadCompoundStats, shanghaiDate } = require('../compound-system');
const { requireFeature } = require('../billing-store');
const { asyncRoute, fail, ok, requireUser, text } = require('../http');

const router = express.Router();
router.use(requireUser);
router.use(requireFeature('compound'));

function monthKey(today) {
  return today.slice(0, 7);
}

async function settingsFor(userId) {
  const result = await db.query(
    'SELECT morning_prayer, financial_plan FROM compound_settings WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || { morning_prayer: '', financial_plan: '' };
}

async function buildPayload(userId) {
  const today = shanghaiDate();
  const currentMonth = monthKey(today);
  const [settings, checkins, bodyDates, credit, system] = await Promise.all([
    settingsFor(userId),
    db.query(
      `SELECT ritual_key, period_key, mode, duration_minutes, note, created_at
         FROM compound_checkins
        WHERE user_id = $1 AND period_key IN ($2, $3)`,
      [userId, today, currentMonth]
    ),
    db.query(
      `SELECT DISTINCT checkin_date::text AS date
         FROM compound_checkins
        WHERE user_id = $1 AND ritual_key = 'body'
          AND checkin_date >= current_date - 60
        ORDER BY date DESC`,
      [userId]
    ),
    db.query(
      `SELECT
         count(*) FILTER (WHERE status IN ('done', 'completed') AND updated_at >= now() - interval '30 days')::int AS completed_30,
         count(*) FILTER (WHERE status IN ('pending', 'overdue', 'created') AND due_date < current_date)::int AS overdue
       FROM friend_todos WHERE user_id = $1`,
      [userId]
    ),
    loadCompoundStats(config.compound.stats, today)
  ]);

  const indexed = Object.fromEntries(checkins.rows.map(item => [item.ritual_key, item]));
  const body = indexed.body || null;
  const prayer = indexed.prayer || null;
  const financial = indexed.financial || null;
  const prayerEnabled = Boolean(settings.morning_prayer);
  const creditSummary = credit.rows[0] || { completed_30: 0, overdue: 0 };
  const todayValue = new Date(`${today}T12:00:00+08:00`);
  const weekBodyCount = bodyDates.rows.filter(item => {
    const age = (todayValue - new Date(`${item.date}T12:00:00+08:00`)) / 86400000;
    return age >= 0 && age < 7;
  }).length;
  const streak = bodyStreak(bodyDates.rows.map(item => item.date), today);

  const rituals = [
    {
      key: 'prayer',
      title: '晨间正念祷告',
      description: prayerEnabled ? settings.morning_prayer : '等你发来固定祷告原文后启用。',
      enabled: prayerEnabled,
      completed: Boolean(prayer),
      meta: prayerEnabled ? '固定原文 · 每日一次' : '待设置'
    },
    {
      key: 'body',
      title: '身体跟练',
      description: '完成一次拉伸或瑜伽，让身体成为长期行动的本金。',
      enabled: true,
      completed: Boolean(body),
      meta: body ? `${body.mode === 'yoga' ? '瑜伽' : '拉伸'} · ${body.duration_minutes} 分钟` : '5 / 15 / 30 分钟'
    },
    {
      key: 'system',
      title: '系统复利动作',
      description: '用 AI、流程或品牌资产，让今天的成果明天继续工作。',
      enabled: system.available,
      completed: system.completed,
      meta: system.available
        ? (system.todayAssetCount ? `今日增加 ${system.todayAssetCount} 份本金` : '等待今天的可复用产出')
        : '统计源暂未连接'
    }
  ];
  const activeRituals = rituals.filter(item => item.enabled);

  const dimensions = [
    {
      key: 'system',
      number: '01',
      title: '系统复利',
      cadence: '每日沉淀',
      state: system.completed ? 'done' : (system.available ? 'pending' : 'waiting'),
      description: '新增可复用资产是本金；只有后续任务再次调用，才开始产生复利。',
      metric: system.compoundRate === null ? '等待数据同步' : `${system.compoundRate}% 资产杠杆率`,
      detail: system.leakageRate === null
        ? 'Codex 数据连接后自动更新'
        : `累计本金 ${system.totalAssetContributions} 份 · 历史复用 ${system.totalReuseEvents} 次`
    },
    {
      key: 'financial',
      number: '02',
      title: '金融复利',
      cadence: '按月执行',
      state: financial ? 'done' : 'pending',
      description: settings.financial_plan || '按自己确定的定投与投资规则执行，不因短期情绪改变。',
      metric: financial ? '本月已按规则执行' : '本月待确认',
      detail: settings.financial_plan ? '只记录规则是否执行，不评价短期涨跌' : '定投计划细节待你确认'
    },
    {
      key: 'credit',
      number: '03',
      title: '信用复利',
      cadence: '按承诺兑现',
      state: Number(creditSummary.overdue) > 0 ? 'attention' : 'done',
      description: '持续兑现对人的承诺，让可信度成为可积累的长期资产。',
      metric: Number(creditSummary.overdue) > 0 ? `${creditSummary.overdue} 项承诺逾期` : '当前没有逾期承诺',
      detail: `近 30 天兑现 ${Number(creditSummary.completed_30) || 0} 项 Shroom 关系承诺`
    },
    {
      key: 'body',
      number: '04',
      title: '身体复利',
      cadence: '每日坚持',
      state: body ? 'done' : 'pending',
      description: '拉伸、瑜伽与恢复不替你工作，却决定你能长期工作多久。',
      metric: streak ? `连续 ${streak} 天` : '今天还未跟练',
      detail: `近 7 天完成 ${weekBodyCount} 次`
    }
  ];

  const recommendations = [];
  if (system.available && system.topLeakageFamily) {
    recommendations.push({
      key: 'system-leakage',
      title: `为「${system.topLeakageFamily}」沉淀本金`,
      description: `近 30 天约 ${system.topLeakageMinutes} 分钟没有形成复用。下一次处理时必须留下规则、测试、Skill 或知识资产。`
    });
  }
  if (!body) {
    recommendations.push({
      key: 'body-minimum',
      title: '先完成 5 分钟最低版',
      description: '保持连续发生比偶尔做满更重要；有余力再升级到 15 或 30 分钟。'
    });
  }
  if (Number(creditSummary.overdue) > 0) {
    recommendations.push({
      key: 'credit-overdue',
      title: '先兑现最早到期的承诺',
      description: '信用复利不看承诺数量，先清掉已逾期事项，再减少新的口头承诺。'
    });
  }
  if (!financial) {
    recommendations.push({
      key: 'financial-cadence',
      title: '只确认是否按规则执行',
      description: '金融复利按月检查，不把每日涨跌做成新的情绪劳动。'
    });
  }

  return {
    date: today,
    progress: {
      completed: activeRituals.filter(item => item.completed).length,
      total: activeRituals.length
    },
    rituals,
    dimensions,
    recommendations: recommendations.slice(0, 3),
    system,
    bodyPractice: {
      title: DAILY_YOGA_PRACTICE.title,
      subtitle: DAILY_YOGA_PRACTICE.subtitle,
      durationMinutes: DAILY_YOGA_PRACTICE.durationMinutes
    },
    prayerConfigured: prayerEnabled
  };
}

router.get('/today', asyncRoute(async (req, res) => ok(res, await buildPayload(req.user.id))));

router.post('/check-in', asyncRoute(async (req, res) => {
  const ritualKey = text(req.body.ritualKey, 24);
  if (!['body', 'prayer', 'financial'].includes(ritualKey)) return fail(res, 400, '不支持的复利记录');
  const settings = ritualKey === 'prayer' ? await settingsFor(req.user.id) : null;
  if (ritualKey === 'prayer' && !settings.morning_prayer) return fail(res, 400, '请先录入晨间正念祷告');

  let mode = text(req.body.mode, 24);
  let duration = Number(req.body.durationMinutes) || 0;
  if (ritualKey === 'body') {
    if (!['stretch', 'yoga'].includes(mode)) return fail(res, 400, '请选择拉伸或瑜伽');
    if (![5, 15, 24, 30].includes(duration)) return fail(res, 400, '请选择 5、15、24 或 30 分钟');
  } else if (ritualKey === 'prayer') {
    mode = 'reading';
    duration = 1;
  } else {
    mode = 'scheduled_investment';
    duration = 0;
  }

  const today = shanghaiDate();
  const periodKey = ritualKey === 'financial' ? monthKey(today) : today;
  await db.query(
    `INSERT INTO compound_checkins
       (id, user_id, ritual_key, period_key, checkin_date, mode, duration_minutes, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, ritual_key, period_key) DO UPDATE
       SET mode = EXCLUDED.mode, duration_minutes = EXCLUDED.duration_minutes,
           note = EXCLUDED.note, updated_at = now()`,
    [crypto.randomUUID(), req.user.id, ritualKey, periodKey, today, mode, duration, text(req.body.note, 500)]
  );
  return ok(res, await buildPayload(req.user.id), '今天又存下一份本金');
}));

router.post('/undo', asyncRoute(async (req, res) => {
  const ritualKey = text(req.body.ritualKey, 24);
  if (!['body', 'prayer', 'financial'].includes(ritualKey)) return fail(res, 400, '不支持的复利记录');
  const today = shanghaiDate();
  const periodKey = ritualKey === 'financial' ? monthKey(today) : today;
  await db.query(
    'DELETE FROM compound_checkins WHERE user_id = $1 AND ritual_key = $2 AND period_key = $3',
    [req.user.id, ritualKey, periodKey]
  );
  return ok(res, await buildPayload(req.user.id), '记录已撤销');
}));

module.exports = router;
