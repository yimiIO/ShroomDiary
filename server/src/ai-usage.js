'use strict';

const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const { estimateAiCost } = require('./ai-pricing');

function providerName() {
  try {
    const host = new URL(config.aiApiBaseUrl).hostname.toLowerCase();
    if (host.includes('deepseek')) return 'deepseek';
  } catch (error) {
    // Configuration validation happens at request time; unknown providers still retain usage.
  }
  return 'compatible';
}

function canPriceAiModel(model, at = new Date()) {
  return estimateAiCost({
    provider: providerName(),
    model,
    usage: {},
    at,
    usdCnyRate: config.aiUsdCnyRate
  }).priced;
}

async function recordAiUsage(context, payload, at = new Date()) {
  if (!context?.userId || !payload?.usage) return null;
  const provider = providerName();
  const model = String(payload.model || config.aiModel || 'unknown');
  const estimate = estimateAiCost({
    provider,
    model,
    usage: payload.usage,
    at,
    usdCnyRate: config.aiUsdCnyRate
  });
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO ai_usage_events
      (id, user_id, feature, diary_id, analysis_id, conversation_id, task_id, observer_id, inquiry_id,
       request_label, provider, model, provider_request_id, prompt_tokens, cache_hit_tokens,
       cache_miss_tokens, completion_tokens, total_tokens, cost_usd, cost_cny, price_snapshot, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
       $18, $19, $20, $21::jsonb, $22)`,
    [
      id, context.userId, String(context.feature || 'other').slice(0, 64), context.diaryId || null,
      context.analysisId || null, context.conversationId || null, context.taskId || null,
      context.observerId || null, context.inquiryId || null, String(context.label || '').slice(0, 160), provider, model,
      payload.id ? String(payload.id).slice(0, 160) : null, estimate.promptTokens,
      estimate.cacheHitTokens, estimate.cacheMissTokens, estimate.completionTokens,
      estimate.totalTokens, estimate.costUsd, estimate.costCny,
      JSON.stringify(estimate.priceSnapshot), at
    ]
  );
  if (context.chargeStatus) {
    await db.query(
      'UPDATE ai_usage_events SET charge_status = $2 WHERE id = $1',
      [id, String(context.chargeStatus).slice(0, 24)]
    );
  }
  return { id, estimate };
}

async function safeRecordAiUsage(context, payload) {
  try {
    return await recordAiUsage(context, payload);
  } catch (error) {
    console.error('AI usage ledger write failed', { feature: context?.feature, message: error.message });
    return null;
  }
}

function mappedSummary(row) {
  const calls = Number(row?.calls || 0);
  const pricedCalls = Number(row?.priced_calls || 0);
  return {
    calls,
    promptTokens: Number(row?.prompt_tokens || 0),
    cacheHitTokens: Number(row?.cache_hit_tokens || 0),
    cacheMissTokens: Number(row?.cache_miss_tokens || 0),
    completionTokens: Number(row?.completion_tokens || 0),
    totalTokens: Number(row?.total_tokens || 0),
    costUsd: pricedCalls ? Number(row?.cost_usd || 0) : null,
    costCny: pricedCalls ? Number(row?.cost_cny || 0) : null,
    chargedPoints: Number(row?.charged_point_cents || 0) / 100,
    priced: calls > 0 && calls === pricedCalls,
    estimated: pricedCalls > 0,
    note: calls ? '按调用发生时的公开单价估算；赠送额度、税费与汇率差异以供应商账单为准。' : ''
  };
}

async function usageSummary(userId, filters = {}) {
  const clauses = ['user_id = $1'];
  const values = [userId];
  for (const [key, column] of [
    ['analysisId', 'analysis_id'], ['diaryId', 'diary_id'], ['conversationId', 'conversation_id'],
    ['taskId', 'task_id'], ['inquiryId', 'inquiry_id']
  ]) {
    if (filters[key]) {
      values.push(filters[key]);
      clauses.push(`${column} = $${values.length}`);
    }
  }
  const result = await db.query(
    `SELECT count(*)::int AS calls,
            count(cost_usd)::int AS priced_calls,
            COALESCE(sum(prompt_tokens), 0)::bigint AS prompt_tokens,
            COALESCE(sum(cache_hit_tokens), 0)::bigint AS cache_hit_tokens,
            COALESCE(sum(cache_miss_tokens), 0)::bigint AS cache_miss_tokens,
            COALESCE(sum(completion_tokens), 0)::bigint AS completion_tokens,
            COALESCE(sum(total_tokens), 0)::bigint AS total_tokens,
            COALESCE(sum(cost_usd), 0)::numeric AS cost_usd,
            COALESCE(sum(cost_cny), 0)::numeric AS cost_cny,
            COALESCE(sum(charged_point_cents), 0)::bigint AS charged_point_cents
       FROM ai_usage_events WHERE ${clauses.join(' AND ')}`,
    values
  );
  return mappedSummary(result.rows[0]);
}

module.exports = { canPriceAiModel, mappedSummary, recordAiUsage, safeRecordAiUsage, usageSummary };
