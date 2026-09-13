'use strict';

const fs = require('node:fs');
const db = require('../src/db');
const config = require('../src/config');
const { callJson, isAiConfigured } = require('../src/ai-engine');
const { buildDiaryBatches } = require('../src/inquiry-backfill');
const {
  normalizeHistoricalWellbeingRecords,
  selectHistoricalDiaries,
  storeHistoricalWellbeingRecords
} = require('../src/wellbeing-backfill');
const {
  WELLBEING_CANDIDATE_PROMPT,
  WELLBEING_REVIEW_PROMPT,
  WELLBEING_REVIEW_VERSION,
  normalizeReviewedWellbeingRecords
} = require('../src/wellbeing-review');

const MODEL_VERSION = `wellbeing-history-2026-09-13-v4:${WELLBEING_REVIEW_VERSION}`;
const USAGE_FEATURES = ['wellbeing_historical_candidate_v4', 'wellbeing_historical_review_v4'];

function option(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
}

async function usageTotals(userId) {
  const result = await db.query(
    `SELECT count(*)::int AS calls, COALESCE(sum(total_tokens), 0)::bigint AS total_tokens,
            COALESCE(sum(cost_cny), 0)::numeric AS cost_cny
       FROM ai_usage_events WHERE user_id = $1 AND feature = ANY($2::text[])`,
    [userId, USAGE_FEATURES]
  );
  return {
    calls: Number(result.rows[0].calls || 0),
    totalTokens: Number(result.rows[0].total_tokens || 0),
    costCny: Number(result.rows[0].cost_cny || 0)
  };
}

async function main() {
  const mobile = option('mobile') || String(process.env.SHROOM_BACKFILL_MOBILE || '').trim();
  const apply = process.argv.includes('--apply');
  const replacePending = process.argv.includes('--replace-pending');
  const output = option('output');
  if (!/^1[3-9]\d{9}$/u.test(mobile)) throw new Error('请通过 --mobile=手机号指定唯一账号');
  if (!isAiConfigured()) throw new Error('AI provider is not configured');

  const userResult = await db.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
  if (userResult.rowCount !== 1) throw new Error('没有找到唯一的 Shroom 用户');
  const userId = userResult.rows[0].id;
  const diaryResult = await db.query(
    `SELECT d.id, to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS diary_date,
            d.content, w.status AS wellbeing_status
       FROM diaries d
       LEFT JOIN wellbeing_records w ON w.user_id = d.user_id AND w.diary_id = d.id
      WHERE d.user_id = $1 AND d.deleted_at IS NULL AND d.ai_allowed = true
        AND length(trim(d.content)) > 0
      ORDER BY d.occurred_at ASC`,
    [userId]
  );
  const diaries = selectHistoricalDiaries(diaryResult.rows, replacePending);
  const batches = buildDiaryBatches(diaries, { maxChars: 16000, maxEntries: 14, maxDiaryChars: 5000 });
  const records = [];
  const beforeUsage = await usageTotals(userId);
  const feedbackResult = await db.query(
    `SELECT source_excerpt AS "sourceExcerpt", feedback_reason AS reason
       FROM wellbeing_records
      WHERE user_id = $1 AND status = 'DISMISSED' AND feedback_reason IS NOT NULL
      ORDER BY updated_at DESC LIMIT 12`,
    [userId]
  );
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const candidateResponse = await callJson(WELLBEING_CANDIDATE_PROMPT, { diaries: batch }, `历史身心候选 ${index + 1}/${batches.length}`, {
      maxTokens: 5000,
      temperature: 0.1,
      usageContext: { userId, feature: USAGE_FEATURES[0] }
    });
    const candidates = normalizeHistoricalWellbeingRecords(candidateResponse.records, batch)
      .map(item => ({ diaryId: item.diaryId, healthExtraction: item.extraction }));
    const reviewResponse = await callJson(WELLBEING_REVIEW_PROMPT, {
      diaries: batch,
      candidates,
      userFeedback: feedbackResult.rows
    }, `历史身心价值审核 ${index + 1}/${batches.length}`, {
      maxTokens: 7000,
      temperature: 0.1,
      usageContext: { userId, feature: USAGE_FEATURES[1] }
    });
    records.push(...normalizeReviewedWellbeingRecords(reviewResponse.records, batch));
    console.error(`processed ${index + 1}/${batches.length}: ${candidates.length} candidates -> ${records.length} reviewed records`);
  }

  const stored = apply
    ? await db.transaction(async client => {
      if (replacePending) {
        await client.query(`DELETE FROM wellbeing_records WHERE user_id = $1 AND status = 'PENDING'`, [userId]);
      }
      return records.length ? storeHistoricalWellbeingRecords(client, {
        userId,
        records,
        modelVersion: `${MODEL_VERSION}:${config.aiModel}`
      }) : 0;
    })
    : 0;
  const afterUsage = await usageTotals(userId);
  const summary = {
    ok: true,
    applied: apply,
    replacePending,
    diaryCount: diaries.length,
    batchCount: batches.length,
    candidateCount: records.length,
    stored,
    usage: {
      calls: afterUsage.calls - beforeUsage.calls,
      totalTokens: afterUsage.totalTokens - beforeUsage.totalTokens,
      costCny: Number((afterUsage.costCny - beforeUsage.costCny).toFixed(6))
    }
  };
  if (output) fs.writeFileSync(output, JSON.stringify({ summary, records }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.close());
