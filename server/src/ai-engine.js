'use strict';

const config = require('./config');
const { parseJsonContent } = require('./ai-json');
const { maximumAiChargePointCents } = require('./ai-pricing');
const { canPriceAiModel, recordAiUsage, safeRecordAiUsage } = require('./ai-usage');
const { chargeAiUsage, ensureAiFunds } = require('./billing-store');

function isAiConfigured() {
  return Boolean(config.aiApiBaseUrl && config.aiApiKey && config.aiModel);
}

function contentFromResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => item.text || item.content || '').join('');
  return '';
}

function endpoint() {
  const base = config.aiApiBaseUrl.replace(/\/$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

function hasMeaningfulJson(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

async function callJson(system, input, label, options = {}) {
  if (!isAiConfigured()) throw Object.assign(new Error('AI 分析尚未配置'), { code: 'SHROOM_AI_UNAVAILABLE' });
  const model = String(options.model || config.aiModel || '').trim();
  if (!model) throw Object.assign(new Error('AI 分析模型尚未配置'), { code: 'SHROOM_AI_UNAVAILABLE' });
  const billingContext = { ...(options.usageContext || {}), label };
  const inputText = typeof input === 'string' ? input : JSON.stringify(input);
  const maxTokens = Math.max(500, Math.min(8000, Number(options.maxTokens || 3000)));
  if (billingContext.billable && !canPriceAiModel(model)) {
    throw Object.assign(new Error('当前 AI 模型没有可用的人民币计价表'), { code: 'SHROOM_AI_PRICING_UNAVAILABLE' });
  }
  if (billingContext.billable && billingContext.userId) {
    const authorizationPointCents = maximumAiChargePointCents({
      model,
      promptUtf8Bytes: Buffer.byteLength(`${system}\n${inputText}`, 'utf8'),
      maxOutputTokens: maxTokens,
      multiplier: config.billing.aiChargeMultiplier
    });
    await ensureAiFunds(billingContext.userId, authorizationPointCents);
  }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
    try {
      const response = await fetch(endpoint(), {
        method: 'POST',
        headers: { authorization: `Bearer ${config.aiApiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: Number.isFinite(options.temperature) ? options.temperature : 0.35,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: inputText }
          ]
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.error?.message || `${label} 请求失败 (${response.status})`;
        const error = Object.assign(new Error(message), { status: response.status });
        if (response.status !== 429 && response.status < 500) throw error;
        lastError = error;
      } else {
        let parsed;
        try {
          parsed = parseJsonContent(contentFromResponse(payload));
        } catch (error) {
          await safeRecordAiUsage({ ...billingContext, chargeStatus: 'FAILED_OUTPUT' }, payload);
          lastError = error;
          continue;
        }
        let valid = false;
        try {
          valid = typeof options.validateResult === 'function'
            ? Boolean(options.validateResult(parsed))
            : hasMeaningfulJson(parsed);
        } catch (error) {
          lastError = error;
        }
        if (!valid) {
          await safeRecordAiUsage({ ...billingContext, chargeStatus: 'FAILED_OUTPUT' }, payload);
          lastError = lastError || new Error(`${label} 返回了不可用结果`);
          continue;
        }
        const usageEvent = billingContext.billable
          ? await recordAiUsage({ ...billingContext, chargeStatus: 'PENDING' }, payload)
          : await safeRecordAiUsage(billingContext, payload);
        if (billingContext.billable) {
          if (!usageEvent?.id) throw Object.assign(new Error('AI 计费流水写入失败'), { code: 'SHROOM_BILLING_LEDGER' });
          await chargeAiUsage(
            billingContext.userId,
            usageEvent.id,
            usageEvent.estimate.costCny,
            { feature: billingContext.feature || 'other', label }
          );
        }
        return parsed;
      }
    } catch (error) {
      if (error.code === 'SHROOM_AI_UNAVAILABLE') throw error;
      if (String(error.code || '').startsWith('SHROOM_BILLING_')
        || String(error.code || '').startsWith('SHROOM_PAYMENT_')
        || ['SHROOM_BALANCE_INSUFFICIENT', 'SHROOM_AI_PRICING_UNAVAILABLE'].includes(error.code)) throw error;
      lastError = error;
      if (error.status && error.status < 500 && error.status !== 429) break;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw Object.assign(new Error(`${label} 暂时没有完成，请稍后重试`), { code: 'SHROOM_AI_FAILED', cause: lastError });
}

module.exports = { callJson, hasMeaningfulJson, isAiConfigured, parseJsonContent };
