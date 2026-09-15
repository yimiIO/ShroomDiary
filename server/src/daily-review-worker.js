'use strict';

const config = require('./config');
const db = require('./db');
const { generateDailyReview, loadDailyReviewContext, reviewRow } = require('./daily-review');
const { isMailConfigured, sendMail } = require('./mail');

let timer = null;
let running = false;

const OS_LABELS = {
  ALIGNED: '符合', DEVIATED: '偏离', NOT_TRIGGERED: '今日未触发', INSUFFICIENT: '证据不足'
};
const OWNER_LABELS = { SELF: '我亲自负责', CODEX: '交给 Codex', STAFF: '交给员工', STOP: '停止' };

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function renderReviewText(review) {
  const value = review.result || {};
  const compound = value.compoundReview || {};
  const sections = [
    `菇每日总结 · ${review.date}`,
    '',
    value.headline || '',
    '',
    '今日事实',
    value.factsSummary || '暂无足够记录。'
  ];
  if (value.lifeOsAudit?.length) {
    sections.push('', '人生 OS', ...value.lifeOsAudit.map(item => `- ${OS_LABELS[item.status] || item.status}｜${item.principle || '未命名原则'}：${item.reason}`));
  }
  const compoundLines = [
    ...((compound.personalAssets || []).map(item => `个人资产：${item.text}`)),
    ...((compound.businessAssets || []).map(item => `公司资产：${item.text}`)),
    ...((compound.oneOffWork || []).map(item => `一次性交付：${item.text}`)),
    ...((compound.opportunities || []).map(item => `复利机会：${item.text}`))
  ];
  if (compoundLines.length) sections.push('', '复利判断', ...compoundLines.map(item => `- ${item}`));
  if (value.ownershipDecisions?.length) {
    sections.push('', '所有权与委派', ...value.ownershipDecisions.map(item =>
      `- ${OWNER_LABELS[item.owner] || item.owner}｜${item.task}：${item.reason}`));
  }
  if (value.tomorrowAdjustment?.action) {
    sections.push('', '明日唯一调整', value.tomorrowAdjustment.action, value.tomorrowAdjustment.why || '');
  }
  if (value.caveats?.length) sections.push('', '证据边界', ...value.caveats.map(item => `- ${item}`));
  sections.push('', `数据截止：${review.sourceCutoff ? new Date(review.sourceCutoff).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未知'}`,
    '这是一份可修订的复盘草稿，不会自动修改你的人生 OS、复利状态或待办。');
  return sections.filter((item, index, values) => item !== '' || values[index - 1] !== '').join('\n').trim();
}

function htmlList(items, render) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<ul style="padding-left:20px;line-height:1.75">${items.map(item => `<li>${render(item)}</li>`).join('')}</ul>`;
}

function renderReviewHtml(review) {
  const value = review.result || {};
  const compound = value.compoundReview || {};
  const compoundItems = [
    ...((compound.personalAssets || []).map(item => ({ label: '个人资产', text: item.text }))),
    ...((compound.businessAssets || []).map(item => ({ label: '公司资产', text: item.text }))),
    ...((compound.oneOffWork || []).map(item => ({ label: '一次性交付', text: item.text }))),
    ...((compound.opportunities || []).map(item => ({ label: '复利机会', text: item.text })))
  ];
  const section = (title, body) => body ? `<section style="margin-top:28px"><h2 style="font-size:17px;margin:0 0 10px">${title}</h2>${body}</section>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f1f8e9;color:#172019;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif"><main style="max-width:640px;margin:0 auto;padding:34px 24px 48px"><div style="font-size:12px;letter-spacing:2px;color:#728074">SHROOM DAILY REVIEW · ${escapeHtml(review.date)}</div><h1 style="font-family:Georgia,'Songti SC',serif;font-size:30px;line-height:1.35;margin:12px 0">${escapeHtml(value.headline || '今天的总结')}</h1>${section('今日事实', `<p style="line-height:1.8">${escapeHtml(value.factsSummary || '暂无足够记录。')}</p>`)}${section('人生 OS', htmlList(value.lifeOsAudit, item => `<strong>${escapeHtml(OS_LABELS[item.status] || item.status)}</strong>｜${escapeHtml(item.principle || '未命名原则')}：${escapeHtml(item.reason)}`))}${section('复利判断', htmlList(compoundItems, item => `<strong>${escapeHtml(item.label)}</strong>：${escapeHtml(item.text)}`))}${section('所有权与委派', htmlList(value.ownershipDecisions, item => `<strong>${escapeHtml(OWNER_LABELS[item.owner] || item.owner)}</strong>｜${escapeHtml(item.task)}：${escapeHtml(item.reason)}`))}${section('明日唯一调整', value.tomorrowAdjustment?.action ? `<div style="padding:18px;border-radius:16px;background:#e4ebd2"><strong>${escapeHtml(value.tomorrowAdjustment.action)}</strong><p style="line-height:1.7;margin:8px 0 0">${escapeHtml(value.tomorrowAdjustment.why || '')}</p></div>` : '')}${section('证据边界', htmlList(value.caveats, item => escapeHtml(item)))}<p style="margin-top:34px;padding-top:18px;border-top:1px solid #dce6d6;color:#718075;font-size:12px;line-height:1.7">数据截止：${escapeHtml(review.sourceCutoff ? new Date(review.sourceCutoff).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未知')}。这是一份可修订的复盘草稿，不会自动修改你的人生 OS、复利状态或待办。你可以在菇的每日总结设置中关闭邮件。</p></main></body></html>`;
}

async function shanghaiClock() {
  const result = await db.query(
    `SELECT to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date,
            extract(hour FROM now() AT TIME ZONE 'Asia/Shanghai')::int AS hour`
  );
  return result.rows[0];
}

async function queueInboxReviews(date) {
  await db.query(
    `INSERT INTO daily_reviews
      (id, user_id, review_date, status, generated_by, email_status)
     SELECT gen_random_uuid(), p.user_id, $1::date, 'PENDING', 'INBOX', 'NONE'
       FROM daily_review_preferences p
      WHERE p.inbox_enabled AND (
        EXISTS (
          SELECT 1 FROM diaries d
           WHERE d.user_id = p.user_id AND d.deleted_at IS NULL AND d.ai_allowed
             AND (d.occurred_at AT TIME ZONE 'Asia/Shanghai')::date = $1::date
        )
        OR EXISTS (
          SELECT 1 FROM external_activity_events e
          JOIN data_source_connections c ON c.id = e.connection_id AND c.user_id = e.user_id
           WHERE e.user_id = p.user_id AND c.ai_allowed
             AND (e.completed_at AT TIME ZONE 'Asia/Shanghai')::date = $1::date
        )
        OR EXISTS (
          SELECT 1 FROM todos t
           WHERE t.user_id = p.user_id AND t.deleted_at IS NULL AND t.status = 'completed'
             AND (t.completed_at AT TIME ZONE 'Asia/Shanghai')::date = $1::date
        )
        OR EXISTS (
          SELECT 1 FROM compound_events e
           WHERE e.user_id = p.user_id AND e.status = 'CONFIRMED' AND e.source_valid
             AND (e.created_at AT TIME ZONE 'Asia/Shanghai')::date = $1::date
        )
      )
     ON CONFLICT (user_id, review_date) DO NOTHING`,
    [date]
  );
}

async function claimInboxReview(date) {
  return db.transaction(async client => {
    const candidate = await client.query(
      `SELECT r.* FROM daily_reviews r
       JOIN daily_review_preferences p ON p.user_id = r.user_id
      WHERE r.review_date = $1::date AND r.status = 'PENDING' AND p.inbox_enabled
      ORDER BY r.updated_at
      FOR UPDATE OF r SKIP LOCKED LIMIT 1`,
      [date]
    );
    const row = candidate.rows[0];
    if (!row) return null;
    const claimed = await client.query(
      `UPDATE daily_reviews SET generated_by = 'INBOX', updated_at = now()
        WHERE id = $1 AND status = 'PENDING' RETURNING *`,
      [row.id]
    );
    return claimed.rows[0] || null;
  });
}

async function processInboxClaim(claim) {
  try {
    const reviewDate = dateFromRow(claim.review_date);
    const context = await loadDailyReviewContext(claim.user_id, reviewDate);
    await generateDailyReview(claim.user_id, reviewDate, {
      context,
      generatedBy: 'INBOX',
      id: claim.id
    });
    return true;
  } catch (error) {
    await db.query(
      `UPDATE daily_reviews SET status = 'FAILED', error_message = $2, updated_at = now()
        WHERE id = $1 AND status = 'PENDING'`,
      [claim.id, String(error.message || '收件箱总结生成失败').slice(0, 1000)]
    );
    console.error('daily review inbox failed', {
      reviewId: claim.id,
      code: error.code,
      message: error.message
    });
    return true;
  }
}

async function claimReview() {
  if (!isMailConfigured()) return null;
  const clock = await shanghaiClock();
  if (Number(clock.hour) < config.dailyReview.emailHour) return null;
  return db.transaction(async client => {
    await client.query(
      `INSERT INTO daily_reviews
        (id, user_id, review_date, status, generated_by, email_status, email_next_attempt_at)
       SELECT gen_random_uuid(), p.user_id, $1::date, 'PENDING', 'EMAIL', 'PENDING', now()
         FROM daily_review_preferences p
        WHERE p.email_enabled AND p.email_verified_at IS NOT NULL
       ON CONFLICT (user_id, review_date) DO NOTHING`,
      [clock.date]
    );
    await client.query(
      `UPDATE daily_reviews r SET email_status = 'PENDING', email_next_attempt_at = now(), updated_at = now()
        FROM daily_review_preferences p
       WHERE r.user_id = p.user_id AND r.review_date = $1::date AND r.viewed_at IS NULL
         AND p.email_enabled AND p.email_verified_at IS NOT NULL AND r.email_status = 'NONE'`,
      [clock.date]
    );
    const candidate = await client.query(
      `SELECT r.*, p.email_address, u.nickname
         FROM daily_reviews r
         JOIN daily_review_preferences p ON p.user_id = r.user_id
         JOIN users u ON u.id = r.user_id
        WHERE r.review_date = $1::date AND r.viewed_at IS NULL
          AND p.email_enabled AND p.email_verified_at IS NOT NULL
          AND (
            (r.email_status IN ('PENDING', 'FAILED') AND r.email_attempts < 3
              AND COALESCE(r.email_next_attempt_at, now()) <= now())
            OR (r.email_status = 'PROCESSING' AND r.email_attempts <= 3
              AND r.email_claimed_at < now() - interval '10 minutes')
          )
        ORDER BY r.email_attempts, r.updated_at
        FOR UPDATE OF r SKIP LOCKED LIMIT 1`,
      [clock.date]
    );
    const row = candidate.rows[0];
    if (!row) return null;
    const claimed = await client.query(
      `UPDATE daily_reviews SET email_attempts = email_attempts
           + CASE WHEN email_status = 'PROCESSING' THEN 0 ELSE 1 END,
         email_status = 'PROCESSING',
         email_claimed_at = now(), email_error = '', updated_at = now()
       WHERE id = $1 RETURNING *`,
      [row.id]
    );
    return { ...row, ...claimed.rows[0] };
  });
}

async function processClaim(claim) {
  try {
    let row = claim;
    const reviewDate = dateFromRow(row.review_date);
    const context = await loadDailyReviewContext(row.user_id, reviewDate);
    if (row.status !== 'READY' || row.source_fingerprint !== context.fingerprint) {
      await generateDailyReview(row.user_id, reviewDate, { context, generatedBy: 'EMAIL', id: row.id });
      row = await reviewRow(row.user_id, reviewDate);
    }
    const stillDue = await db.query(
      `SELECT r.viewed_at, r.email_status,
              p.email_enabled AND p.email_verified_at IS NOT NULL AND p.email_address = $3 AS recipient_allowed
         FROM daily_reviews r
         JOIN daily_review_preferences p ON p.user_id = r.user_id
        WHERE r.id = $1 AND r.user_id = $2`,
      [row.id, row.user_id, claim.email_address]
    );
    if (!stillDue.rowCount || stillDue.rows[0].viewed_at
      || stillDue.rows[0].email_status !== 'PROCESSING' || !stillDue.rows[0].recipient_allowed) {
      await db.query(
        `UPDATE daily_reviews SET email_status = 'SKIPPED', email_claimed_at = NULL, updated_at = now()
          WHERE id = $1 AND email_status = 'PROCESSING'`,
        [row.id]
      );
      return true;
    }
    const review = {
      ...row,
      date: dateFromRow(row.review_date),
      result: row.result || {},
      sourceCutoff: row.source_cutoff
    };
    await sendMail({
      to: claim.email_address,
      subject: `菇每日总结 · ${review.date}`,
      text: renderReviewText(review),
      html: renderReviewHtml(review)
    });
    await db.query(
      `UPDATE daily_reviews SET email_status = 'SENT', emailed_at = now(),
         email_claimed_at = NULL, email_next_attempt_at = NULL, email_error = '', updated_at = now()
       WHERE id = $1 AND email_status = 'PROCESSING'`,
      [row.id]
    );
    return true;
  } catch (error) {
    const minutes = Math.min(60, Math.pow(5, Math.max(0, Number(claim.email_attempts || 1) - 1)));
    await db.query(
      `UPDATE daily_reviews SET email_status = 'FAILED', email_claimed_at = NULL,
         email_next_attempt_at = now() + ($2 * interval '1 minute'), email_error = $3, updated_at = now()
       WHERE id = $1`,
      [claim.id, minutes, String(error.message || '邮件发送失败').slice(0, 1000)]
    );
    console.error('daily review email failed', { reviewId: claim.id, code: error.code, message: error.message });
    return true;
  }
}

function dateFromRow(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(value);
}

async function tick() {
  if (running || !config.dailyReview.workerEnabled) return;
  running = true;
  try {
    const clock = await shanghaiClock();
    if (Number(clock.hour) >= config.dailyReview.emailHour) {
      await queueInboxReviews(clock.date);
      for (let count = 0; count < 3; count += 1) {
        const inboxClaim = await claimInboxReview(clock.date);
        if (!inboxClaim) break;
        await processInboxClaim(inboxClaim);
      }
      if (isMailConfigured()) {
        for (let count = 0; count < 3; count += 1) {
          const mailClaim = await claimReview();
          if (!mailClaim) break;
          await processClaim(mailClaim);
        }
      }
    }
  } catch (error) {
    console.error('daily review worker tick failed', { code: error.code, message: error.message });
  } finally {
    running = false;
  }
}

function startDailyReviewWorker() {
  if (timer || !config.dailyReview.workerEnabled) return;
  timer = setInterval(tick, config.dailyReview.workerIntervalMs);
  timer.unref?.();
  tick();
}

function stopDailyReviewWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  claimInboxReview,
  claimReview,
  dateFromRow,
  processInboxClaim,
  processClaim,
  queueInboxReviews,
  renderReviewHtml,
  renderReviewText,
  startDailyReviewWorker,
  stopDailyReviewWorker,
  tick
};
