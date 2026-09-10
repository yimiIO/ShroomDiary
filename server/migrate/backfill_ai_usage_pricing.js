'use strict';

const db = require('../src/db');
const config = require('../src/config');
const { estimateAiCost } = require('../src/ai-pricing');
const { usageSummary } = require('../src/ai-usage');

async function main() {
  const result = await db.query(
    `SELECT id, user_id, analysis_id, provider, model, prompt_tokens, cache_hit_tokens,
            cache_miss_tokens, completion_tokens, total_tokens, created_at
       FROM ai_usage_events
      WHERE provider = 'deepseek' AND cost_cny IS NULL
      ORDER BY created_at ASC`
  );

  let updatedEvents = 0;
  const affectedAnalyses = new Map();
  for (const row of result.rows) {
    const estimate = estimateAiCost({
      provider: row.provider,
      model: row.model,
      usage: {
        prompt_tokens: row.prompt_tokens,
        prompt_cache_hit_tokens: row.cache_hit_tokens,
        prompt_cache_miss_tokens: row.cache_miss_tokens,
        completion_tokens: row.completion_tokens,
        total_tokens: row.total_tokens
      },
      at: new Date(row.created_at),
      usdCnyRate: config.aiUsdCnyRate
    });
    if (!estimate.priced) continue;
    await db.query(
      `UPDATE ai_usage_events
          SET cost_usd = $2, cost_cny = $3, price_snapshot = $4::jsonb
        WHERE id = $1 AND cost_cny IS NULL`,
      [row.id, estimate.costUsd, estimate.costCny, JSON.stringify(estimate.priceSnapshot)]
    );
    updatedEvents += 1;
    if (row.analysis_id) affectedAnalyses.set(row.analysis_id, row.user_id);
  }

  let updatedAnalyses = 0;
  for (const [analysisId, userId] of affectedAnalyses) {
    const summary = await usageSummary(userId, { analysisId });
    await db.query(
      `UPDATE diary_analysis SET cost_summary = $3::jsonb, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [analysisId, userId, JSON.stringify(summary)]
    );
    updatedAnalyses += 1;
  }

  console.log(JSON.stringify({ ok: true, scannedEvents: result.rowCount, updatedEvents, updatedAnalyses }));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
