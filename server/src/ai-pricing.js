'use strict';

const DEEPSEEK_PRICE_VERSION = 'deepseek-v4-2026-09-14';
const DEEPSEEK_FLASH_MODELS = new Set([
  'deepseek-flash',
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp'
]);
const DEEPSEEK_PRO_MODELS = new Set([
  'deepseek-pro',
  'deepseek-v4-pro'
]);
const MILLION = 1000000;

function nonNegativeInt(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function isDeepSeekPeak(at = new Date()) {
  const day = at.getUTCDay();
  const hour = at.getUTCHours();
  return day >= 1 && day <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
}

function normalizeUsage(usage = {}) {
  const promptTokens = nonNegativeInt(usage.prompt_tokens);
  let cacheHitTokens = nonNegativeInt(usage.prompt_cache_hit_tokens);
  let cacheMissTokens = nonNegativeInt(usage.prompt_cache_miss_tokens);
  if (!cacheHitTokens && !cacheMissTokens) cacheMissTokens = promptTokens;
  if (cacheHitTokens + cacheMissTokens > promptTokens && promptTokens) {
    const overflow = cacheHitTokens + cacheMissTokens - promptTokens;
    cacheMissTokens = Math.max(0, cacheMissTokens - overflow);
  }
  const completionTokens = nonNegativeInt(usage.completion_tokens);
  return {
    promptTokens,
    cacheHitTokens,
    cacheMissTokens,
    completionTokens,
    totalTokens: nonNegativeInt(usage.total_tokens) || promptTokens + completionTokens
  };
}

function estimateAiCost({ provider, model, usage, at = new Date(), usdCnyRate = 7.2 }) {
  const tokens = normalizeUsage(usage);
  const normalizedProvider = String(provider || '').toLowerCase();
  const normalizedModel = String(model || '').toLowerCase();
  const tier = DEEPSEEK_FLASH_MODELS.has(normalizedModel)
    ? 'flash'
    : (DEEPSEEK_PRO_MODELS.has(normalizedModel) ? 'pro' : '');
  if (normalizedProvider !== 'deepseek' || !tier) {
    return { ...tokens, priced: false, costUsd: null, costCny: null, priceSnapshot: {} };
  }
  const peak = isDeepSeekPeak(at);
  const prices = {
    flash: {
      peak: { cacheHitInputCnyPerMillion: 0.10, cacheMissInputCnyPerMillion: 3, outputCnyPerMillion: 9 },
      offPeak: { cacheHitInputCnyPerMillion: 0.05, cacheMissInputCnyPerMillion: 1.5, outputCnyPerMillion: 4.5 }
    },
    pro: {
      peak: { cacheHitInputCnyPerMillion: 0.30, cacheMissInputCnyPerMillion: 9, outputCnyPerMillion: 27 },
      offPeak: { cacheHitInputCnyPerMillion: 0.15, cacheMissInputCnyPerMillion: 4.5, outputCnyPerMillion: 13.5 }
    }
  };
  const rates = prices[tier][peak ? 'peak' : 'offPeak'];
  const costCny = (
    tokens.cacheHitTokens * rates.cacheHitInputCnyPerMillion +
    tokens.cacheMissTokens * rates.cacheMissInputCnyPerMillion +
    tokens.completionTokens * rates.outputCnyPerMillion
  ) / MILLION;
  const exchangeRate = Number(usdCnyRate) > 0 ? Number(usdCnyRate) : 7.2;
  return {
    ...tokens,
    priced: true,
    costUsd: costCny / exchangeRate,
    costCny,
    priceSnapshot: {
      version: DEEPSEEK_PRICE_VERSION,
      tier,
      currency: 'CNY',
      priceBand: peak ? 'peak' : 'off_peak',
      timezone: 'Asia/Shanghai',
      usdCnyRate: exchangeRate,
      ...rates
    }
  };
}

module.exports = {
  DEEPSEEK_FLASH_MODELS,
  DEEPSEEK_PRICE_VERSION,
  DEEPSEEK_PRO_MODELS,
  estimateAiCost,
  isDeepSeekPeak,
  normalizeUsage
};
