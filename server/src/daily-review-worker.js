'use strict';

const config = require('./config');
const db = require('./db');
const { generateDailyReview, loadDailyReviewContext, reviewRow } = require('./daily-review');
const { isMailConfigured, sendMail } = require('./mail');

let timer = null;
let running = false;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function renderReviewText(review) {
  const value = review.result || {};
  const critical = value.criticalReview || {
    issue: value.headline || '今天没有足够证据指出具体失误',
    consequence: value.tomorrowAdjustment?.why || '',
    recommendation: value.tomorrowAdjustment?.action || '补充结果证据后再决定调整。'
  };
  const sections = [
    `菇每日总结 · ${review.date}`,
    '',
    '今天最需要修正',
    critical.issue,
    '',
    '明天只做这一件',
    critical.recommendation
  ];
  return sections.filter((item, index, values) => item !== '' || values[index - 1] !== '').join('\n').trim();
}

function renderReviewHtml(review) {
  const value = review.result || {};
  const critical = value.criticalReview || {
    issue: value.headline || '今天没有足够证据指出具体失误',
    consequence: value.tomorrowAdjustment?.why || '',
    recommendation: value.tomorrowAdjustment?.action || '补充结果证据后再决定调整。'
  };
  return `<!doctype html><html><body style="margin:0;background:#f1f8e9;color:#172019;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif"><main style="max-width:640px;margin:0 auto;padding:34px 24px 48px"><div style="font-size:14px;color:#728074">${escapeHtml(review.date)} · 菇每日总结</div><section style="margin-top:24px;padding:24px;border-radius:16px;background:#f2e2dc"><div style="font-size:13px;color:#8e5c52">今天最需要修正</div><h1 style="font-family:Georgia,'Songti SC',serif;font-size:28px;line-height:1.45;margin:8px 0 0;color:#6f3028">${escapeHtml(critical.issue)}</h1><div style="margin-top:20px;padding-top:16px;border-top:1px solid #dfc3b9"><div style="font-size:13px;color:#8e5c52">明天只做这一件</div><p style="font-weight:700;font-size:19px;line-height:1.65;margin:7px 0 0">${escapeHtml(critical.recommendation || '')}</p></div></section></main></body></html>`;
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
