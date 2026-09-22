'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  estimateAiCost,
  isDeepSeekPeak,
  maximumAiChargePointCents,
  normalizeUsage
} = require('../src/ai-pricing');

const usage = {
  prompt_tokens: 1000,
  prompt_cache_hit_tokens: 200,
  prompt_cache_miss_tokens: 800,
  completion_tokens: 500,
  total_tokens: 1500
};

test('DeepSeek Flash cost uses the current CNY peak price at the request timestamp', () => {
  const at = new Date('2026-09-07T02:00:00Z');
  assert.equal(isDeepSeekPeak(at), true);
  const result = estimateAiCost({ provider: 'deepseek', model: 'deepseek-v4-flash', usage, at, usdCnyRate: 7.2 });
  assert.equal(result.priced, true);
  assert.equal(result.priceSnapshot.priceBand, 'peak');
  assert.ok(Math.abs(result.costCny - 0.00692) < 1e-12);
  assert.ok(Math.abs(result.costUsd - (0.00692 / 7.2)) < 1e-12);
});

test('DeepSeek canonical Flash model prices the 14,256-token memory review in CNY', () => {
  const result = estimateAiCost({
    provider: 'deepseek',
    model: 'deepseek-flash',
    usage: {
      prompt_tokens: 11965,
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: 11965,
      completion_tokens: 2291,
      total_tokens: 14256
    },
    at: new Date('2026-09-10T12:13:56Z'),
    usdCnyRate: 7.2
  });
  assert.equal(result.priced, true);
  assert.equal(result.priceSnapshot.priceBand, 'off_peak');
  assert.ok(Math.abs(result.costCny - 0.028257) < 1e-12);
});

test('DeepSeek Flash legacy alias uses the current CNY off-peak price', () => {
  const at = new Date('2026-09-06T02:00:00Z');
  assert.equal(isDeepSeekPeak(at), false);
  const result = estimateAiCost({ provider: 'deepseek', model: 'deepseek-v4-flash', usage, at });
  assert.equal(result.priceSnapshot.priceBand, 'off_peak');
  assert.ok(Math.abs(result.costCny - 0.00346) < 1e-12);
  assert.ok(Math.abs(result.costUsd - (0.00346 / 7.2)) < 1e-12);
});

test('DeepSeek Pro uses the published three-times-Flash rate', () => {
  const at = new Date('2026-09-07T02:00:00Z');
  const flash = estimateAiCost({ provider: 'deepseek', model: 'deepseek-v4-flash', usage, at });
  const pro = estimateAiCost({ provider: 'deepseek', model: 'deepseek-v4-pro', usage, at });
  assert.equal(pro.priced, true);
  assert.equal(pro.priceSnapshot.tier, 'pro');
  assert.ok(Math.abs(pro.costCny - flash.costCny * 3) < 1e-12);
});

test('usage without cache breakdown is conservatively counted as cache miss input', () => {
  assert.deepEqual(normalizeUsage({ prompt_tokens: 120, completion_tokens: 30 }), {
    promptTokens: 120,
    cacheHitTokens: 0,
    cacheMissTokens: 120,
    completionTokens: 30,
    totalTokens: 150
  });
});

test('unknown model retains tokens without inventing a price', () => {
  const result = estimateAiCost({ provider: 'compatible', model: 'private-model', usage });
  assert.equal(result.priced, false);
  assert.equal(result.totalTokens, 1500);
  assert.equal(result.costUsd, null);
});

test('AI pre-authorization uses the peak uncached ceiling and never invents an unknown-model price', () => {
  const flash = maximumAiChargePointCents({
    model: 'deepseek-v4-flash',
    promptUtf8Bytes: 12_000,
    maxOutputTokens: 3_000,
    multiplier: 2.5
  });
  const pro = maximumAiChargePointCents({
    model: 'deepseek-v4-pro',
    promptUtf8Bytes: 12_000,
    maxOutputTokens: 3_000,
    multiplier: 2.5
  });
  assert.ok(Number.isInteger(flash) && flash > 0);
  assert.equal(pro, flash * 3);
  assert.equal(maximumAiChargePointCents({ model: 'private-model' }), null);
});

test('actual charge for a bounded response stays under its conservative authorization ceiling', () => {
  const maximumPointCents = maximumAiChargePointCents({
    model: 'deepseek-v4-flash',
    promptUtf8Bytes: 12_000,
    maxOutputTokens: 3_000,
    multiplier: 2.5
  });
  const actual = estimateAiCost({
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    usage: { prompt_tokens: 12_000, completion_tokens: 3_000 },
    at: new Date('2026-09-07T02:00:00Z')
  });
  const actualPointCents = Math.ceil(actual.costCny * 2.5 * 100);
  assert.ok(maximumPointCents >= actualPointCents);
});
